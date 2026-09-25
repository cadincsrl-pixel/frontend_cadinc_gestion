'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { bajarAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import { usePermisos } from '@/hooks/usePermisos'
import {
  ADJUNTO_COBRO_LABEL, ADJUNTO_COBRO_TIPOS, urlAdjuntoCobro, urlAdjuntoRetencion, useAdjuntarCobro, useAdjuntarRetencion,
  useAnularCobro, useAnularImputacion, useBorrarAdjuntoCobro, useCobro,
} from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtFechaHora, fmtM } from '../../utils/facturacion.utils'
import { FORMA_LABEL, cortoRetencion } from '../../utils/cobranzas.utils'
import { useRetencionCortos } from '../../hooks/useConfigVentas'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { descargarReciboPdf, detalleMedio } from '../../utils/reciboPdf'
import type { VentasCobroAdjuntoTipo, VentasImputacion } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { Cifra, ModalMotivo } from './Comun'
import { ModalCompensacion } from './ModalCompensacion'

/**
 * La ficha de un recibo: qué entró (medios y retenciones), a qué se aplicó y
 * lo que quedó a cuenta, y la documentación que mandó el cliente (comprobante
 * de pago, orden de pago, otros; se puede sumar también a un anulado). Acciones: PDF del recibo, aplicar lo que queda a
 * cuenta, anular una imputación o el cobro entero. Se deshabilitan con el
 * motivo en el tooltip, no se esconden.
 */
export function FichaCobro({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast()
  const { registrarCobros, anularCobros } = usePermisos('facturacion')
  const cortos = useRetencionCortos()
  const { data, isLoading, error, refetch } = useCobro(id)
  const anular = useAnularCobro()
  const anularImp = useAnularImputacion()
  const adjuntar = useAdjuntarRetencion()
  const adjuntarDoc = useAdjuntarCobro()
  const borrarDoc = useBorrarAdjuntoCobro()
  const [tipoDoc, setTipoDoc] = useState<VentasCobroAdjuntoTipo>('comprobante_pago')
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<number | null>(null)

  const [pidiendoAnular, setPidiendoAnular] = useState(false)
  const [anulandoImp, setAnulandoImp] = useState<VentasImputacion | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [generando, setGenerando] = useState(false)

  if (isLoading || (!data && !error)) {
    return <Modal open onClose={onClose} title="Cobro" width="max-w-4xl"><div className="p-8 text-center text-sm text-gris-dark">Cargando…</div></Modal>
  }
  if (error || !data) {
    return (
      <Modal open onClose={onClose} title="Cobro" width="max-w-4xl">
        <div className="bg-rojo-light border border-rojo/30 rounded p-3 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(error)}</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>Reintentar</Button>
        </div>
      </Modal>
    )
  }

  const d = data
  const c = d.cobro
  const vigente = c.estado === 'vigente'
  const aCuenta = Number(c.a_cuenta)

  async function pdf() {
    setGenerando(true)
    try { await descargarReciboPdf(d, cortos) } catch { toast('No se pudo generar el PDF', 'err') } finally { setGenerando(false) }
  }

  function verCertificado(retId: number) {
    return abrirUrl(() => urlAdjuntoRetencion(retId))
  }

  function bajar(obtener: () => Promise<string>) {
    return bajarAdjuntoFirmado(obtener, e => toast(e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e), 'err'))
  }

  async function subirCertificado(retId: number, file: File | undefined) {
    if (!file) return
    try {
      await adjuntar.mutateAsync({ retencionId: retId, file })
      toast('✓ Certificado adjuntado', 'ok')
    } catch (e) {
      toast(e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e), 'err')
    }
  }

  async function abrirUrl(obtener: () => Promise<string>) {
    // La ventana se abre ANTES del await: si no, el navegador la bloquea como popup.
    const w = window.open('', '_blank')
    try {
      const url = await obtener()
      if (w) w.location.href = url
      else window.open(url, '_blank')
    } catch (e) {
      w?.close()
      toast(e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e), 'err')
    }
  }

  async function subirDocs(files: FileList | null) {
    const lista = Array.from(files ?? [])
    let ok = 0
    for (const file of lista) {
      try {
        await adjuntarDoc.mutateAsync({ cobroId: c.id, file, tipo: tipoDoc })
        ok++
      } catch (e) {
        toast(`${file.name}: ${e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e)}`, 'err')
      }
    }
    if (ok > 0) toast(`✓ ${ok === 1 ? 'Archivo adjuntado' : `${ok} archivos adjuntados`}`, 'ok')
  }

  async function borrarAdjunto(id: number) {
    try {
      await borrarDoc.mutateAsync({ id, cobroId: c.id })
      toast('✓ Archivo borrado', 'ok')
    } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
    setConfirmandoBorrar(null)
  }

  const docs = d.adjuntos ?? []
  const puedeBorrarDoc = registrarCobros || anularCobros
  const motivoNoBorrar = !puedeBorrarDoc ? 'Hace falta el permiso «Registrar cobros» o «Anular cobros»'
    : !vigente ? 'El cobro está anulado: sus adjuntos quedan como respaldo' : null

  const imputacionesVig = d.imputaciones.filter(i => !i.anulada)
  const imputacionesAnul = d.imputaciones.filter(i => i.anulada)

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={`${c.numero_fmt} · ${c.cliente_razon_social}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          {vigente && (
            <Button variant="danger" size="sm" onClick={() => setPidiendoAnular(true)} disabled={!anularCobros}
              title={anularCobros ? 'Anular el recibo: sus imputaciones se anulan y las facturas vuelven a deber' : 'Hace falta el permiso «Anular cobros»'}>
              Anular
            </Button>
          )}
          {vigente && aCuenta > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setAplicando(true)} disabled={!registrarCobros}
              title={registrarCobros ? 'Aplicar lo que quedó a cuenta a facturas del cliente' : 'Hace falta el permiso «Registrar cobros»'}>
              Aplicar a cuenta ({fmtM(aCuenta)})
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={pdf} loading={generando} title="Descargar el recibo en PDF para mandarle al cliente">
            🖨 PDF del recibo
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {c.es_homologacion && <Aviso tono="amarillo"><b>HOMOLOGACIÓN</b> — cobro de prueba.</Aviso>}
        {!vigente && (
          <Aviso tono="rojo">
            <b>Anulado</b>{c.anulado_el && <> el {fmtFechaHora(c.anulado_el)}</>}{c.anulado_por_nombre && <> por {c.anulado_por_nombre}</>}.
            {c.anulado_motivo && <> Motivo: {c.anulado_motivo}</>}
          </Aviso>
        )}

        <div className="flex gap-2 flex-wrap">
          <Cifra label="Total cobrado" valor={fmtM(c.total)}
            sub={`medios ${fmtM(c.total_medios)} · retenciones ${fmtM(c.total_retenciones)}${Number(c.total_gastos ?? 0) > 0 ? ` · gastos descontados ${fmtM(c.total_gastos ?? 0)}` : ''}`} />
          <Cifra label="Aplicado" valor={fmtM(c.aplicado)} tono="verde" />
          <Cifra label="A cuenta" valor={fmtM(c.a_cuenta)} tono={aCuenta > 0 ? 'naranja' : 'normal'} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato label="Fecha" valor={fmtFecha(c.fecha)} />
          <Dato label="Cliente" valor={c.cliente_razon_social} />
          <Dato label="CUIT" valor={fmtCuit(c.cliente_doc_nro)} />
          <Dato label="Cargó" valor={`${c.created_by_nombre ?? '—'} · ${fmtFechaHora(c.created_at)}`} />
        </div>
        {c.liquidacion_numero && <Dato label="Liquidación del cliente" valor={`N° ${c.liquidacion_numero}`} />}
        {c.obs && <div><Etiqueta>Observaciones</Etiqueta><div>{c.obs}</div></div>}

        <Bloque titulo="Medios de cobro">
          {d.medios.length === 0 ? <Nada>Sin medios: solo retenciones.</Nada> : (
            <Tabla cabeza={['Forma', 'Detalle', 'Importe']} derecha={[2]}>
              {d.medios.map(m => (
                <tr key={m.id} className="border-t border-gris">
                  <td className="px-2 py-1.5 whitespace-nowrap">{FORMA_LABEL[m.forma] ?? m.forma}</td>
                  <td className="px-2 py-1.5">{detalleMedio(m) || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtM(m.importe)}</td>
                </tr>
              ))}
            </Tabla>
          )}
        </Bloque>

        <Bloque titulo="Retenciones">
          {d.retenciones.length === 0 ? <Nada>Sin retenciones.</Nada> : (
            <Tabla cabeza={['Tipo', 'Jurisdicción', 'Certificado', 'Fecha', 'Importe', 'Archivo']} derecha={[4]}>
              {d.retenciones.map(r => (
                <tr key={r.id} className="border-t border-gris">
                  <td className="px-2 py-1.5">{cortoRetencion(r.tipo, cortos)}</td>
                  <td className="px-2 py-1.5">{r.jurisdiccion || '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.certificado_numero || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtM(r.importe)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.adjunto_path ? (<>
                      <button type="button" className="text-azul hover:underline text-xs" onClick={() => verCertificado(r.id)}
                        title={r.adjunto_nombre ?? undefined}>📎 Ver</button>
                      <button type="button" className="text-gris-dark hover:text-azul text-xs px-1" title="Descargar"
                        onClick={() => bajar(() => urlAdjuntoRetencion(r.id, true))}>⬇</button>
                    </>) : (
                      <label className={`text-xs ${registrarCobros && vigente ? 'text-azul hover:underline cursor-pointer' : 'text-gris-mid cursor-not-allowed'}`}
                        title={!registrarCobros ? 'Hace falta el permiso «Registrar cobros»' : !vigente ? 'El cobro está anulado' : 'Adjuntar el certificado (PDF o foto)'}>
                        {adjuntar.isPending ? 'Subiendo…' : '+ Adjuntar'}
                        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={!registrarCobros || !vigente || adjuntar.isPending}
                          onChange={ev => { void subirCertificado(r.id, ev.target.files?.[0]); ev.target.value = '' }} />
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </Tabla>
          )}
        </Bloque>

        {(d.gastos ?? []).length > 0 && (
          <Bloque titulo="Gastos descontados por el cliente">
            <Tabla cabeza={['Concepto', 'Detalle', 'Importe']} derecha={[2]}>
              {(d.gastos ?? []).map(g => (
                <tr key={g.id} className="border-t border-gris">
                  <td className="px-2 py-1.5">{g.concepto_nombre}</td>
                  <td className="px-2 py-1.5 text-gris-dark">{g.obs || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtM(g.importe)}</td>
                </tr>
              ))}
            </Tabla>
          </Bloque>
        )}

        <Bloque titulo="Documentación" acciones={
          <div className="flex gap-1.5 items-center">
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value as VentasCobroAdjuntoTipo)} aria-label="Tipo de documento"
              className="text-xs border border-gris-mid rounded px-1.5 py-0.5 bg-white">
              {ADJUNTO_COBRO_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label className={`text-xs ${registrarCobros && !adjuntarDoc.isPending ? 'text-azul hover:underline cursor-pointer' : 'text-gris-mid cursor-not-allowed'}`}
              title={registrarCobros ? 'PDF o foto, hasta 10 MB. Podés elegir varios.' : 'Hace falta el permiso «Registrar cobros»'}>
              {adjuntarDoc.isPending ? 'Subiendo…' : '+ Adjuntar'}
              <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={!registrarCobros || adjuntarDoc.isPending}
                onChange={ev => { void subirDocs(ev.target.files); ev.target.value = '' }} />
            </label>
          </div>
        }>
          {docs.length === 0 ? (
            <Nada>Sin documentación: el comprobante de pago, la orden de pago del cliente u otro papel se adjuntan acá.</Nada>
          ) : (
            <Tabla cabeza={['Tipo', 'Archivo', 'Subido', '']} derecha={[3]}>
              {docs.map(a => (
                <tr key={a.id} className="border-t border-gris">
                  <td className="px-2 py-1.5 whitespace-nowrap">{ADJUNTO_COBRO_LABEL[a.tipo] ?? a.tipo}</td>
                  <td className="px-2 py-1.5 max-w-[260px]">
                    <button type="button" className="text-azul hover:underline text-xs truncate max-w-full text-left" title={a.nombre_archivo}
                      onClick={() => abrirUrl(() => urlAdjuntoCobro(a.id))}>📎 {a.nombre_archivo}</button>
                    <button type="button" className="text-gris-dark hover:text-azul text-xs px-1" title="Descargar"
                      onClick={() => bajar(() => urlAdjuntoCobro(a.id, true))}>⬇</button>
                    {a.obs && <div className="text-[11px] text-gris-dark">{a.obs}</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs">{fmtFechaHora(a.created_at)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {confirmandoBorrar === a.id ? (
                      <span className="text-xs">
                        ¿Borrar?{' '}
                        <button type="button" className="text-rojo font-semibold hover:underline" disabled={borrarDoc.isPending}
                          onClick={() => borrarAdjunto(a.id)}>{borrarDoc.isPending ? 'Borrando…' : 'Sí'}</button>
                        {' · '}
                        <button type="button" className="text-gris-dark hover:underline" onClick={() => setConfirmandoBorrar(null)}>No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoBorrar(a.id)} disabled={!!motivoNoBorrar}
                        className="text-xs text-rojo hover:underline disabled:text-gris-mid disabled:no-underline disabled:cursor-not-allowed"
                        title={motivoNoBorrar ?? 'Borrar el archivo'}>
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Tabla>
          )}
        </Bloque>

        <Bloque titulo="Comprobantes aplicados">
          {imputacionesVig.length === 0 ? <Nada>No se aplicó a ningún comprobante{vigente ? ': todo queda a cuenta' : ''}.</Nada> : (
            <Tabla cabeza={['Comprobante', 'Emisión', 'Aplicado', 'Saldo hoy', '']} derecha={[2, 3]}>
              {imputacionesVig.map(i => (
                <tr key={i.id} className="border-t border-gris">
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap">{i.destino_fmt}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(i.destino_fecha)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold">{fmtM(i.importe)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gris-dark">{i.destino_saldo_actual == null ? '—' : fmtM(i.destino_saldo_actual)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {vigente && (
                      <button type="button" onClick={() => setAnulandoImp(i)} disabled={!anularCobros}
                        className="text-xs text-rojo hover:underline disabled:text-gris-mid disabled:no-underline disabled:cursor-not-allowed"
                        title={anularCobros ? 'Desaplicar: el importe vuelve a quedar a cuenta y la factura vuelve a deber' : 'Hace falta el permiso «Anular cobros»'}>
                        Desaplicar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Tabla>
          )}
          {imputacionesAnul.length > 0 && (
            <div className="text-[11px] text-gris-dark mt-1">
              Desaplicadas: {imputacionesAnul.map(i => `${i.destino_fmt} ${fmtM(i.importe)}${i.anulada_por_nombre ? ` (${i.anulada_por_nombre})` : ''}`).join(' · ')}
            </div>
          )}
        </Bloque>
      </div>

      {pidiendoAnular && (
        <ModalMotivo
          titulo={`Anular ${c.numero_fmt}`}
          texto={<>Se anulan el recibo y sus {imputacionesVig.length} imputaciones: las facturas vuelven a deber {fmtM(c.aplicado)}. El recibo no se borra.</>}
          cargando={anular.isPending}
          onClose={() => setPidiendoAnular(false)}
          onConfirmar={async motivo => {
            try {
              await anular.mutateAsync({ id: c.id, motivo })
              toast(`✓ ${c.numero_fmt} anulado`, 'ok')
              setPidiendoAnular(false)
            } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
          }}
        />
      )}
      {anulandoImp && (
        <ModalMotivo
          titulo="Desaplicar"
          texto={<>{fmtM(anulandoImp.importe)} dejan de cancelar <b>{anulandoImp.destino_fmt}</b> y vuelven a quedar a cuenta del cobro.</>}
          obligatorio={false}
          confirmar="Desaplicar"
          cargando={anularImp.isPending}
          onClose={() => setAnulandoImp(null)}
          onConfirmar={async motivo => {
            try {
              await anularImp.mutateAsync({ id: anulandoImp.id, motivo: motivo || undefined })
              toast('✓ Imputación anulada', 'ok')
              setAnulandoImp(null)
            } catch (e) { toast(mensajeErrorFacturacion(e), 'err') }
          }}
        />
      )}
      {aplicando && (
        <ModalCompensacion clienteId={c.cliente_id} creditoInicial={{ cobro_id: c.id }} onClose={() => setAplicando(false)} />
      )}
    </Modal>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className="break-words">{valor}</div>
    </div>
  )
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-bold text-gris-dark uppercase">{children}</span>
}

function Bloque({ titulo, acciones, children }: { titulo: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-gris pt-2">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">{titulo}</div>
        {acciones}
      </div>
      {children}
    </div>
  )
}

function Nada({ children }: { children: ReactNode }) {
  return <div className="text-xs text-gris-dark italic">{children}</div>
}

function Tabla({ cabeza, derecha = [], children }: { cabeza: string[]; derecha?: number[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[560px]">
        <thead>
          <tr>
            {cabeza.map((h, i) => (
              <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${derecha.includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
