'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  descartarAdjuntoCobroPendiente, leerLiquidacion, subirAdjuntoCobro, useAmbienteCobranzas, useRegistrarCobro,
} from '../../hooks/useCobranzas'
import { useGastoConceptos } from '../../hooks/useConfigVentas'
import { fmtCuit, fmtFecha, fmtM, hoyAR } from '../../utils/facturacion.utils'
import { textoDePdf } from '../../utils/textoPdf'
import {
  aCuentaLiquidacion, bloqueosLiquidacion, cuerpoCobroLiquidacion, edicionInicial, sinonimoSugerido, type EdicionLiquidacion,
} from '../../utils/liquidacion'
import { AVISO_LIQUIDACION, codigoErrorFacturacion, leerCuerpoError, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasCobroAdjuntoInput, VentasCobroDetalle, VentasGastoConcepto, VentasLiquidacionPropuesta } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { ModalGastoConcepto } from '../configuracion/GastoConceptosCard'
import { ClienteCombobox } from './Comun'

/**
 * Ventas › Cobranzas › «Cargar liquidación» (20260930k).
 *
 * La liquidación que manda el cliente (Casilda: «cuenta de venta y líquido
 * producto») se sube, el navegador saca su texto y el backend la lee (si el
 * texto no alcanza, con la IA). NADA se crea hasta «Registrar cobro»: la
 * persona revisa los CVLP que cancela, elige el concepto de cada descuento
 * (o crea uno), puede corregir la fecha (la LIQ 3103 trae una equivocada) y
 * confirma. Sale UN cobro: un medio cheque por cheque (entran solos a la
 * cartera; si ya estaban, se vinculan), los gastos descontados, las
 * imputaciones y la liquidación adjunta. La misma liquidación no se carga dos
 * veces (LIQUIDACION_DUPLICADA).
 */
export function ModalCargarLiquidacion({ onClose, onGuardado }: {
  onClose: () => void
  onGuardado: (d: VentasCobroDetalle) => void
}) {
  const toast = useToast()
  const { registrarCobros, configurar } = usePermisos('facturacion')
  const ambiente = useAmbienteCobranzas()
  const registrar = useRegistrarCobro()
  const { conceptos } = useGastoConceptos(false)
  const hoy = hoyAR()

  const [archivo, setArchivo] = useState<{ file: File; adj: VentasCobroAdjuntoInput; texto: string } | null>(null)
  const [cvlps, setCvlps] = useState<VentasCobroAdjuntoInput[]>([])
  const [leyendo, setLeyendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pideCliente, setPideCliente] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [prop, setProp] = useState<VentasLiquidacionPropuesta | null>(null)
  const [ed, setEd] = useState<EdicionLiquidacion | null>(null)
  const [creandoPara, setCreandoPara] = useState<number | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const guardado = useRef(false)
  // Lo subido a cobros/pendientes/ que hay que limpiar si se cierra sin registrar.
  const pendientes = useRef<string[]>([])

  useEffect(() => () => {
    if (!guardado.current) for (const p of pendientes.current) void descartarAdjuntoCobroPendiente(p)
  }, [])

  async function leer(a: { adj: VentasCobroAdjuntoInput; texto: string }, cliente?: number) {
    setLeyendo(a.texto ? 'Leyendo la liquidación…' : 'No tiene texto: leyendo con IA (puede tardar un minuto)…')
    setError(null)
    try {
      const p = await leerLiquidacion({
        storage_path: a.adj.storage_path, nombre_archivo: a.adj.nombre_archivo, mime: a.adj.mime ?? 'application/pdf',
        texto: a.texto || null, cliente_id: cliente ?? null,
      })
      setProp(p)
      setEd(edicionInicial(p, hoy))
      setPideCliente(false)
    } catch (e) {
      if (codigoErrorFacturacion(e) === 'LIQUIDACION_SIN_CLIENTE') setPideCliente(true)
      setError(mensajeErrorFacturacion(e))
    } finally {
      setLeyendo(null)
    }
  }

  async function elegirLiquidacion(file: File | undefined) {
    if (!file) return
    setError(null)
    setProp(null)
    setEd(null)
    try {
      setLeyendo('Subiendo el archivo…')
      const adj = await subirAdjuntoCobro(file, 'liquidacion')
      // La liquidación anterior (si se reemplazó) ya no va a ningún cobro.
      if (archivo) {
        void descartarAdjuntoCobroPendiente(archivo.adj.storage_path)
        pendientes.current = pendientes.current.filter(x => x !== archivo.adj.storage_path)
      }
      pendientes.current.push(adj.storage_path)
      const texto = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? await textoDePdf(file) : ''
      const a = { file, adj, texto }
      setArchivo(a)
      await leer(a)
    } catch (e) {
      setLeyendo(null)
      setError(mensajeErrorFacturacion(e))
    }
  }

  async function elegirCvlps(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      try {
        const adj = await subirAdjuntoCobro(f, 'otro')
        pendientes.current.push(adj.storage_path)
        setCvlps(l => [...l, { ...adj, obs: 'Comprobante liquidado (CVLP)' }])
      } catch (e) {
        toast(`${f.name}: ${mensajeErrorFacturacion(e)}`, 'err')
      }
    }
  }

  async function confirmar() {
    if (!prop || !ed) return
    try {
      const d = await registrar.mutateAsync(cuerpoCobroLiquidacion(prop, ed, { ambiente, otrosAdjuntos: cvlps }))
      guardado.current = true
      toast(`✓ ${d.cobro.numero_fmt}: liquidación N° ${prop.liquidacion.numero} registrada`, 'ok')
      if (d.adjuntos_error?.length) toast(`El cobro quedó, pero no se adjuntó: ${d.adjuntos_error.map(a => a.nombre_archivo).join(', ')}`, 'err')
      onGuardado(d)
    } catch (e) {
      const b = leerCuerpoError(e)
      setError(b.error === 'LIQUIDACION_DUPLICADA' || b.error === 'CHEQUE_DUPLICADO' || b.error === 'IMPUTACION_SUPERA_SALDO'
        ? `${mensajeErrorFacturacion(e)} Volvé a leer la liquidación para ver el estado actual.`
        : mensajeErrorFacturacion(e))
    }
  }

  const bloqueos = prop && ed ? bloqueosLiquidacion(prop, ed, hoy) : ['Elegí la liquidación.']
  const aCuenta = prop ? aCuentaLiquidacion(prop) : 0
  const puedeRegistrar = registrarCobros && bloqueos.length === 0 && !registrar.isPending
  const set = (p: Partial<EdicionLiquidacion>) => setEd(e => (e ? { ...e, ...p } : e))

  function conceptoCreado(i: number, c: VentasGastoConcepto) {
    setEd(e => (e ? { ...e, conceptos: e.conceptos.map((x, j) => (j === i ? c.id : x)) } : e))
  }

  return (
    <Modal open onClose={registrar.isPending ? () => {} : onClose} width="max-w-5xl" title="Cargar liquidación del cliente"
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap">
          {prop && bloqueos.length > 0 && registrarCobros && (
            <span className="text-[11px] text-naranja-dark mr-auto">{bloqueos[0]}{bloqueos.length > 1 ? ` (y ${bloqueos.length - 1} más)` : ''}</span>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={registrar.isPending}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} loading={registrar.isPending} disabled={!puedeRegistrar}
            title={!registrarCobros ? 'Hace falta el permiso «Registrar cobros»' : bloqueos.length ? bloqueos.join(' · ') : 'Registrar UN cobro con esta liquidación'}>
            Registrar cobro
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        {!registrarCobros && <Aviso tono="gris">Podés leer la liquidación, pero para registrarla hace falta el permiso «Registrar cobros».</Aviso>}

        {/* 1) El archivo */}
        <label
          className={`border-2 border-dashed rounded-card p-4 text-center cursor-pointer transition-colors ${arrastrando ? 'border-naranja bg-naranja-light/40' : 'border-gris-mid hover:border-naranja'}`}
          onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); void elegirLiquidacion(e.dataTransfer.files?.[0]) }}>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={!!leyendo}
            onChange={ev => { void elegirLiquidacion(ev.target.files?.[0]); ev.target.value = '' }} />
          {archivo ? (
            <span>📄 <b>{archivo.file.name}</b> <span className="text-gris-dark text-xs">· soltá otro para reemplazarla</span></span>
          ) : (
            <span className="text-gris-dark">Soltá acá el PDF de la liquidación (o hacé clic para elegirlo)</span>
          )}
        </label>
        {leyendo && <div className="text-xs text-azul">{leyendo}</div>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {pideCliente && archivo && (
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[240px]"><ClienteCombobox value={clienteId} onChange={setClienteId} /></div>
            <Button size="sm" variant="secondary" disabled={!clienteId || !!leyendo} onClick={() => void leer(archivo, Number(clienteId))}>Leer con este cliente</Button>
          </div>
        )}

        {prop && ed && (
          <>
            {prop.ya_cargada && (
              <Aviso tono="rojo">
                La liquidación N° {prop.liquidacion.numero} de {prop.cliente.razon_social} ya está cargada{prop.ya_cargada.numero_fmt ? ` en el ${prop.ya_cargada.numero_fmt}` : ''}. Para cargarla de nuevo, anulá ese cobro.
              </Aviso>
            )}

            {/* 2) Cabecera */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gris-dark font-bold">Cliente</div>
                <div className="font-semibold">{prop.cliente.razon_social}</div>
                <div className="text-[11px] text-gris-dark">{fmtCuit(prop.cliente.doc_nro ?? '')}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gris-dark font-bold">Liquidación</div>
                <div className="font-mono font-semibold">N° {prop.liquidacion.numero}</div>
                <div className="text-[11px] text-gris-dark">
                  {prop.fuente === 'ia' ? <span title={prop.modelo ?? undefined}>leída con IA: revisala</span> : 'leída del texto del PDF'}
                  {prop.liquidacion.fecha && <> · impresa {fmtFecha(prop.liquidacion.fecha)}</>}
                </div>
              </div>
              <Input label="Fecha del cobro" type="date" value={ed.fecha} max={hoy} onChange={e => set({ fecha: e.target.value })}
                hint="Corregila si la liquidación trae una fecha equivocada." />
              <Input label="Observaciones" value={ed.obs} onChange={e => set({ obs: e.target.value })} />
            </div>
            {prop.liquidacion.avisos.map((a, i) => <Aviso key={i} tono="amarillo">{a}</Aviso>)}

            {/* 3) Comprobantes */}
            <Bloque titulo="Comprobantes que cancela">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] uppercase text-gris-dark">
                  <th className="py-1 pr-2">Comprobante</th><th className="py-1 pr-2 text-right">Bruto</th><th className="py-1 pr-2 text-right">Comisión</th>
                  <th className="py-1 pr-2 text-right">Subtotal</th><th className="py-1 pr-2">En Ventas</th><th className="py-1 text-right">Se imputa</th>
                </tr></thead>
                <tbody>
                  {prop.comprobantes.map((c, i) => (
                    <tr key={i} className="border-t border-gris align-top">
                      <td className="py-1.5 pr-2 font-mono">{c.numero_fmt}{c.fecha && <div className="text-[10px] text-gris-dark font-sans">{fmtFecha(c.fecha)}</div>}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{fmtM(c.bruto)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{fmtM(c.comision)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono font-semibold">{fmtM(c.subtotal)}</td>
                      <td className="py-1.5 pr-2">
                        {c.destino ? <>{c.destino.comprobante}<div className="text-[10px] text-gris-dark">saldo {fmtM(c.destino.saldo)}</div></> : '—'}
                        {c.avisos.map(a => <div key={a} className="text-[11px] text-naranja-dark">⚠ {AVISO_LIQUIDACION[a] ?? a}</div>)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold">{fmtM(c.imputar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bloque>

            {/* 4) Gastos */}
            <Bloque titulo="Gastos que descontó">
              {prop.gastos.length === 0 ? <div className="text-xs text-gris-dark">Sin descuentos.</div> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] uppercase text-gris-dark">
                    <th className="py-1 pr-2">En la liquidación</th><th className="py-1 pr-2">Concepto</th><th className="py-1 text-right">Importe</th>
                  </tr></thead>
                  <tbody>
                    {prop.gastos.map((g, i) => (
                      <tr key={i} className="border-t border-gris align-top">
                        <td className="py-1.5 pr-2">
                          {g.texto}
                          <div className="text-[10px] text-gris-dark">{[g.codigo, g.comprobante && `comp. ${g.comprobante}`, g.fecha && fmtFecha(g.fecha)].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <div className="flex gap-1 items-center flex-wrap">
                            <select value={ed.conceptos[i] ?? ''} aria-label={`Concepto de «${g.texto}»`}
                              className={`px-2 py-1 border-[1.5px] rounded text-xs bg-white outline-none focus:border-naranja ${ed.conceptos[i] == null ? 'border-naranja' : 'border-gris-mid'}`}
                              onChange={e => set({ conceptos: ed.conceptos.map((x, j) => (j === i ? (e.target.value ? Number(e.target.value) : null) : x)) })}>
                              <option value="">— Elegí el concepto —</option>
                              {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <button type="button" disabled={!configurar}
                              className="text-[11px] text-azul hover:underline disabled:text-gris-mid disabled:no-underline disabled:cursor-not-allowed"
                              title={configurar ? 'Crear un concepto nuevo con este texto como sinónimo' : 'Crear conceptos pide el permiso «Configurar» de Ventas (tab Configuración)'}
                              onClick={() => setCreandoPara(i)}>+ Nuevo</button>
                          </div>
                          {g.concepto_id == null
                            ? <div className="text-[10px] text-naranja-dark mt-0.5">No se reconoció: elegilo (o sumale un sinónimo al concepto en Configuración).</div>
                            : g.reconocido_por && <div className="text-[10px] text-gris-dark mt-0.5">reconocido por «{g.reconocido_por}»</div>}
                        </td>
                        <td className="py-1.5 text-right font-mono">{fmtM(g.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Bloque>

            {/* 5) Cheques */}
            <Bloque titulo="Cheques">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] uppercase text-gris-dark">
                  <th className="py-1 pr-2">Número</th><th className="py-1 pr-2">Banco</th><th className="py-1 pr-2">Cobro</th>
                  <th className="py-1 pr-2">Librador</th><th className="py-1 text-right">Importe</th>
                </tr></thead>
                <tbody>
                  {prop.cheques.map((c, i) => (
                    <tr key={i} className="border-t border-gris align-top">
                      <td className="py-1.5 pr-2 font-mono">{c.numero}<div className="text-[10px] text-gris-dark font-sans">{c.tipo}</div></td>
                      <td className="py-1.5 pr-2">{c.banco}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{c.fecha_cobro ? fmtFecha(c.fecha_cobro) : '—'}</td>
                      <td className="py-1.5 pr-2">
                        <input value={ed.libradores[i] ?? ''} aria-label={`Librador del cheque ${c.numero}`}
                          className="w-full px-2 py-1 border-[1.5px] border-gris-mid rounded text-xs outline-none focus:border-naranja"
                          onChange={e => set({ libradores: ed.libradores.map((x, j) => (j === i ? e.target.value : x)) })} />
                        {c.librador_cuit && <div className="text-[10px] text-gris-dark">CUIT {fmtCuit(c.librador_cuit)}</div>}
                        {c.avisos.map(a => (
                          <div key={a} className={`text-[11px] ${a === 'EN_CARTERA' ? 'text-azul' : 'text-naranja-dark'}`}>{a === 'EN_CARTERA' ? 'ℹ' : '⚠'} {AVISO_LIQUIDACION[a] ?? a}</div>
                        ))}
                      </td>
                      <td className="py-1.5 text-right font-mono">{fmtM(c.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bloque>

            {/* 6) Controles y totales */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 text-xs">
                <Control ok={prop.controles.cierra_subtotal} texto={`Comprobantes ${fmtM(prop.controles.suma_comprobantes)} = subtotal ${fmtM(prop.liquidacion.subtotal ?? prop.controles.suma_comprobantes)}`} />
                <Control ok={prop.controles.cierra_neto} texto={`Subtotal − descuentos ${fmtM(prop.controles.suma_deducciones)} = neto ${fmtM(prop.liquidacion.neto ?? 0)}`} />
                <Control ok={prop.controles.cierra_cheques} texto={`Cheques ${fmtM(prop.controles.suma_cheques)} = neto ${fmtM(prop.liquidacion.neto ?? 0)}`} />
                {!prop.controles.ok && (
                  <label className="flex items-center gap-2 text-naranja-dark cursor-pointer mt-1">
                    <input type="checkbox" className="accent-naranja" checked={ed.aceptaDescuadre} onChange={e => set({ aceptaDescuadre: e.target.checked })} />
                    Revisé el papel: registrarla igual
                  </label>
                )}
              </div>
              <div className="bg-gris rounded p-2 text-xs flex flex-col gap-0.5">
                <Fila label="Cheques" valor={fmtM(prop.controles.suma_cheques)} />
                <Fila label="Gastos descontados" valor={fmtM(prop.controles.suma_deducciones)} />
                <Fila label="Total del cobro" valor={fmtM(prop.total_cobro)} fuerte />
                <Fila label="Se imputa a comprobantes" valor={fmtM(prop.total_imputar)} />
                <Fila label="Queda a cuenta" valor={fmtM(aCuenta)} />
                {aCuenta > 0 && (
                  <label className="flex items-center gap-2 text-naranja-dark cursor-pointer mt-1">
                    <input type="checkbox" className="accent-naranja" checked={ed.aceptaACuenta} onChange={e => set({ aceptaACuenta: e.target.checked })} />
                    Registrar igual: {fmtM(aCuenta)} queda a cuenta
                  </label>
                )}
              </div>
            </div>

            {/* 7) Adjuntos */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gris-dark">Se adjunta: 📄 {prop.adjunto.nombre_archivo}{cvlps.map(c => ` · 📄 ${c.nombre_archivo}`).join('')}</span>
              <label className="text-azul hover:underline cursor-pointer">
                + PDF de los CVLP (opcional)
                <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                  onChange={ev => { void elegirCvlps(ev.target.files); ev.target.value = '' }} />
              </label>
            </div>
          </>
        )}
      </div>
      {creandoPara !== null && prop && (
        <ModalGastoConcepto
          inicial={{ nombre: '', alias: sinonimoSugerido(prop.gastos[creandoPara]?.texto ?? '') }}
          onClose={() => setCreandoPara(null)}
          onGuardado={c => conceptoCreado(creandoPara, c)} />
      )}
    </Modal>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border border-gris rounded-card p-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gris-dark mb-1">{titulo}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Control({ ok, texto }: { ok: boolean; texto: string }) {
  return <div className={ok ? 'text-verde' : 'text-rojo font-semibold'}>{ok ? '✓' : '✗'} {texto}</div>
}

function Fila({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? 'font-bold text-sm border-t border-gris-mid pt-0.5 mt-0.5' : ''}`}>
      <span>{label}</span><span className="font-mono tabular-nums">{valor}</span>
    </div>
  )
}
