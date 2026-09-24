'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import {
  useFactura, useAprobarFactura, useObservarFactura, useMarcarCorregida, useAnularFactura,
  useSubirAdjuntoPagos, useBorrarAdjuntoPagos, fetchPagosAdjuntoSignedUrl,
} from '../hooks/usePagos'
import {
  ESTADO_FACTURA_META, FORMAS_PREVISTAS, MAX_ADJUNTO_BYTES, MIME_ADJUNTOS, TIPOS_ADJ_FACTURA,
  comprobanteTxt, facturaAnulada, fmtFecha, fmtM, formaPagoLabel,
} from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosControlFactura, PagosFacturaDetalle, PagosTipoAdjFactura } from '@/types/domain.types'
import { ALICUOTAS, NOMBRE_CBTE_ARCA, labelTributo, sinDesglose } from '../utils/desglose'
import { ModalCompletarDesglose } from './ModalCompletarDesglose'

/**
 * La ficha de una factura: todo lo que se sabe de ella y lo que se puede
 * hacerle, según quién mira y en qué estado está.
 *
 * Las acciones se DESHABILITAN con el motivo en el tooltip, no se esconden
 * (§6 del CLAUDE.md): quien no puede aprobar tiene que entender por qué, y las
 * tres separaciones de funciones son justamente lo que hay que explicar.
 */

interface Props {
  id:       number
  onClose:  () => void
  onEditar: (id: number) => void
  onPagar:  (id: number) => void
}

export function FichaFactura({ id, onClose, onEditar, onPagar }: Props) {
  const toast = useToast()
  const { puedeEditar, puedeEliminar, registrarPagos, aprobarFacturas, esAdmin, verPii } = usePermisos('pagos')
  const miId = useSessionStore(st => st.profile?.id) ?? null

  const { data: f, isLoading } = useFactura(id)
  const aprobar   = useAprobarFactura()
  const observar  = useObservarFactura()
  const corregida = useMarcarCorregida()
  const anular    = useAnularFactura()
  const subir     = useSubirAdjuntoPagos()
  const borrar    = useBorrarAdjuntoPagos()

  const [pidiendo, setPidiendo] = useState<null | 'observar' | 'anular'>(null)
  const [motivo, setMotivo] = useState('')
  const [tipoAdj, setTipoAdj] = useState<PagosTipoAdjFactura>('factura')
  const [completando, setCompletando] = useState(false)

  if (isLoading || !f) {
    return (
      <Modal open onClose={onClose} title="Factura" width="max-w-3xl">
        <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
      </Modal>
    )
  }

  const meta = ESTADO_FACTURA_META[f.estado]
  const esMia = !!miId && f.created_by === miId
  const puedeAprobar = !!(aprobarFacturas || esAdmin)
  const puedePagar   = !!(registrarPagos || esAdmin)

  // Las tres separaciones de funciones, con el bypass de admin. Se calculan acá
  // para poder explicarlas en el tooltip en vez de dejar que el backend
  // devuelva un 403 sin contexto.
  const noApruebaPropia = esMia && !esAdmin
  const noPagaPropia    = esMia && !esAdmin
  const noPagaLoQueAprobo = !!f.aprobada_por && f.aprobada_por === miId && !esAdmin

  const aprobable = f.estado === 'pendiente' && !f.paga_cliente
  const sellable  = f.sin_revisar                       // pagada al cargar, sin revisar
  const pagable   = ['aprobada', 'pagada_parcial'].includes(f.estado) && !f.paga_cliente && f.saldo > 0
  const editable  = !['anulada'].includes(f.estado)
  const anulable  = ['pendiente', 'observada'].includes(f.estado) || f.sin_revisar

  async function accion(fn: () => Promise<unknown>, ok: string) {
    try {
      const r = await fn() as { avisos?: { code: string }[] } | undefined
      toast(ok, 'ok')
      for (const a of r?.avisos ?? []) toast(mensajeAvisoPagos(a), 'warn')
      setPidiendo(null); setMotivo('')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  // El id se captura acá: adentro de la función anidada TypeScript ya no sabe
  // que `f` pasó el early return de arriba.
  const facturaId = f.id

  async function subirArchivo(file: File) {
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    try {
      await subir.mutateAsync({ entidad: 'facturas', id: facturaId, file, tipo: tipoAdj })
      toast('✓ Adjunto subido', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={`${comprobanteTxt(f.tipo_comprobante, f.numero)} · ${f.proveedor_nom}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>

          {anulable && (
            <Button variant="danger" size="sm" onClick={() => setPidiendo('anular')}
              disabled={!(puedeEliminar || (puedeEditar && esMia))}
              title={puedeEliminar || (puedeEditar && esMia)
                ? 'Anular la factura con un motivo'
                : 'Solo podés anular facturas que cargaste vos'}>
              Anular
            </Button>
          )}

          {editable && (
            <Button variant="secondary" size="sm" onClick={() => onEditar(f.id)}
              disabled={!puedeEditar}
              title={puedeEditar ? 'Editar la factura' : 'No tenés permiso para editar facturas'}>
              ✏️ Editar
            </Button>
          )}

          {f.estado === 'observada' && (
            <Button variant="secondary" size="sm"
              onClick={() => accion(() => corregida.mutateAsync({ id: f.id }), '✓ Marcada como corregida: vuelve a pendiente')}
              loading={corregida.isPending}
              disabled={!puedeEditar}
              title={puedeEditar ? 'Ya la corregiste: vuelve a pendiente de aprobación' : 'No tenés permiso'}>
              Marcar corregida
            </Button>
          )}

          {(aprobable || sellable) && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setPidiendo('observar')}
                disabled={!puedeAprobar}
                title={puedeAprobar ? 'Rechazar con un motivo: vuelve a compras' : 'No tenés permiso para aprobar ni rechazar'}>
                Rechazar
              </Button>
              <Button size="sm"
                onClick={() => accion(() => aprobar.mutateAsync(f.id), sellable ? '✓ Revisada' : '✓ Aprobada')}
                loading={aprobar.isPending}
                disabled={!puedeAprobar || noApruebaPropia}
                title={
                  !puedeAprobar ? 'No tenés permiso para aprobar'
                  : noApruebaPropia ? 'No podés aprobar una factura que cargaste vos: la tiene que aprobar otra persona'
                  : sellable ? 'Revisada: sale de «pagadas sin revisar»' : 'Aprobar: queda lista para pagar'
                }>
                ✓ {sellable ? 'Marcar revisada' : 'Aprobar'}
              </Button>
            </>
          )}

          {pagable && (
            <Button size="sm" onClick={() => onPagar(f.id)}
              disabled={!puedePagar || noPagaPropia || noPagaLoQueAprobo}
              title={
                !puedePagar ? 'No tenés permiso para registrar pagos'
                : noPagaPropia ? 'No podés pagar una factura que cargaste vos'
                : noPagaLoQueAprobo ? 'No podés pagar una factura que aprobaste vos'
                : 'Registrar el pago'
              }>
              💸 Pagar
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">

        {/* Estado y avisos */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${meta.badge}`}>{meta.label}</span>
          <span className="text-xs text-gris-dark">{meta.hint}</span>
        </div>

        {f.cuenta_cambio_tras_aprobar && (
          <Aviso tono="rojo">
            ⚠ El CBU o alias del proveedor cambió <b>después</b> de que se aprobó esta factura
            {f.datos_pago_actualizados_at && <> (el {fmtFecha(f.datos_pago_actualizados_at)})</>}.
            Verificá la cuenta antes de pagar.
          </Aviso>
        )}
        {f.sin_revisar && (
          <Aviso tono="amarillo">
            Se cargó ya pagada y todavía no la revisó ningún aprobador.
          </Aviso>
        )}
        {f.estado === 'observada' && f.motivo_observacion && (
          <Aviso tono="naranja">
            <b>Rechazada:</b> {f.motivo_observacion}
            {f.observada_por_nombre && <span className="text-xs"> — {f.observada_por_nombre}, {fmtFecha(f.observada_at)}</span>}
          </Aviso>
        )}
        {f.estado === 'anulada' && f.motivo_anulacion && (
          <Aviso tono="gris">
            <b>Anulada:</b> {f.motivo_anulacion}
            {f.anulado_por_nombre && <span className="text-xs"> — {f.anulado_por_nombre}, {fmtFecha(f.anulado_at)}</span>}
          </Aviso>
        )}
        {f.paga_cliente && (
          <Aviso tono="gris">La paga el cliente directo al proveedor: no es deuda de CADINC y no entra en la bandeja.</Aviso>
        )}

        {/* Importes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato label="Total" valor={fmtM(f.total)} fuerte />
          <Dato label="Pagado" valor={f.pagado > 0 ? fmtM(f.pagado) : '—'} />
          <Dato label="Notas de crédito" valor={f.acreditado > 0 ? fmtM(f.acreditado) : '—'} />
          <Dato label="Saldo" valor={f.saldo > 0 ? fmtM(f.saldo) : '—'} fuerte />
        </div>
        <DesgloseFicha f={f} />
        {/* Completar el desglose (20260924v): también en una PAGADA, porque no
            cambia la plata (total y percepciones quedan iguales; lo valida la base). */}
        {sinDesglose(f) && (
          <div className="flex items-center gap-2 flex-wrap border rounded p-2 text-xs bg-naranja-light border-naranja/30 text-naranja-dark">
            <span className="flex-1 min-w-[200px]">
              {f.desglose_a_revisar ? 'El desglose de impuestos está marcado a revisar.' : 'Falta el IVA discriminado: lo necesita el Libro IVA de compras.'}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setCompletando(true)}
              disabled={!puedeEditar}
              title={puedeEditar
                ? 'Cargar IVA por alícuota, percepciones y CAE sin cambiar el total ni lo pagado'
                : 'No tenés permiso para editar facturas'}>
              Completar desglose
            </Button>
          </div>
        )}

        {/* Datos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Dato label="Emitida" valor={fmtFecha(f.fecha)} />
          <Dato label="Vence" valor={f.vence_el ? fmtFecha(f.vence_el) : 'sin vencimiento'} alerta={f.vencida} />
          <Dato label="Forma prevista" valor={FORMAS_PREVISTAS.find(x => x.key === f.forma_pago_prevista)?.label ?? f.forma_pago_prevista} />
          <Dato label="CUIT" valor={f.proveedor_cuit ?? '—'} />
          <Dato label="Cuenta del proveedor" valor={verPii ? (f.proveedor_cbu ?? f.proveedor_alias ?? '—') : (f.proveedor_cbu_ultimos4 ? `***${f.proveedor_cbu_ultimos4}` : '—')} />
          <Dato label="Cargó" valor={`${f.created_by_nombre ?? '—'}, ${fmtFecha(f.created_at)}`} />
        </div>

        {f.descripcion && <div><span className="text-[11px] font-bold text-gris-dark uppercase">Descripción</span><div>{f.descripcion}</div></div>}
        {f.obs && <div><span className="text-[11px] font-bold text-gris-dark uppercase">Observaciones</span><div className="text-gris-dark">{f.obs}</div></div>}

        {/* Aprobación */}
        {f.aprobada_at && (
          <div className="bg-verde-light/50 border border-verde/30 rounded p-2 text-xs">
            Aprobada por <b>{f.aprobada_por_nombre ?? '—'}</b> el {fmtFecha(f.aprobada_at)}.
          </div>
        )}

        {/* Reparto por obra */}
        <Bloque titulo={`Centro de costo${f.imputaciones.length > 1 ? ` · ${f.imputaciones.length} obras` : ''}`}>
          {f.imputaciones.length === 0
            ? <div className="text-xs text-gris-dark italic">Sin imputar.</div>
            : (
              <table className="w-full text-xs">
                <tbody>
                  {f.imputaciones.map(im => (
                    <tr key={im.id} className="border-b border-gris last:border-0">
                      <td className="py-1">
                        {im.obra?.nom ?? im.obra_cod}
                        {(im.obra?.es_interna || im.obra?.es_deposito) && <span className="ml-1 text-[10px] text-gris-dark uppercase">interna</span>}
                        {im.obra?.archivada && <span className="ml-1 text-[10px] text-gris-dark uppercase">archivada</span>}
                        {im.obs && <span className="block text-[10px] text-gris-dark">{im.obs}</span>}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">{fmtM(im.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Bloque>

        {/* Pagos aplicados */}
        {f.pagos.length > 0 && (
          <Bloque titulo="Pagos y notas de crédito">
            <table className="w-full text-xs">
              <tbody>
                {f.pagos.map(p => (
                  <tr key={p.id} className={`border-b border-gris last:border-0 ${p.orden.anulada ? 'opacity-50 line-through' : ''}`}>
                    <td className="py-1">
                      <span className="font-mono">{p.orden.numero_fmt ?? `OP-${p.orden.numero}`}</span>
                      {p.tipo === 'nota_credito' && <span className="ml-1 text-[10px] px-1 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold">NC {p.nc_numero}</span>}
                      <span className="block text-[10px] text-gris-dark">
                        {fmtFecha(p.orden.fecha)} · {formaPagoLabel(p.orden.forma_pago)}
                        {p.orden.anulada && ' · ANULADA'}
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtM(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloque>
        )}

        {/* Control automático del comprobante (20260921j). Va ANTES de los
            adjuntos y con color fuerte cuando difiere: quien aprueba tiene que
            tropezarse con esto, no encontrarlo si lo busca. */}
        {f.control && <ControlComprobante c={f.control} />}

        {/* Adjuntos */}
        <Bloque titulo="Adjuntos">
          {f.adjuntos.length === 0 && <div className="text-xs text-gris-dark italic mb-2">Todavía no hay archivos.</div>}
          <ul className="flex flex-col gap-1 mb-2">
            {f.adjuntos.map(a => (
              <li key={a.id} className={`flex items-center gap-2 text-xs ${a.borrado ? 'opacity-50 line-through' : ''}`}>
                <button type="button"
                  className="text-azul hover:underline truncate flex-1 text-left"
                  onClick={() => abrirAdjuntoFirmado(
                    () => fetchPagosAdjuntoSignedUrl('facturas', f.id, a.id),
                    () => toast('No se pudo abrir el archivo', 'err'),
                  )}>
                  📎 {a.nombre_archivo}
                </button>
                <span className="text-gris-dark">{TIPOS_ADJ_FACTURA.find(t => t.key === a.tipo)?.label ?? a.tipo}</span>
                {!a.borrado && puedeEditar && (
                  <button type="button" className="text-rojo hover:bg-rojo-light px-1.5 rounded"
                    onClick={async () => {
                      try { await borrar.mutateAsync({ entidad: 'facturas', id: f.id, adjId: a.id }); toast('Adjunto borrado', 'ok') }
                      catch (e) { toast(mensajeErrorPagos(e), 'err') }
                    }}>✕</button>
                )}
              </li>
            ))}
          </ul>
          {puedeEditar && (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={tipoAdj} onChange={e => setTipoAdj(e.target.value as PagosTipoAdjFactura)}
                className="px-2 py-1 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja">
                {TIPOS_ADJ_FACTURA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
                {subir.isPending ? 'Subiendo…' : '📎 Adjuntar archivo'}
                <input type="file" className="hidden" accept={MIME_ADJUNTOS} disabled={subir.isPending}
                  onChange={e => { const file = e.target.files?.[0]; if (file) subirArchivo(file); e.target.value = '' }} />
              </label>
            </div>
          )}
        </Bloque>

        {completando && <ModalCompletarDesglose factura={f} onClose={() => setCompletando(false)} />}

        {/* Pedir motivo */}
        {pidiendo && (
          <div className="border-t border-gris pt-3">
            <label className="block text-xs font-semibold text-gris-dark mb-1">
              {pidiendo === 'observar' ? 'Motivo del rechazo (lo ve quien la cargó)' : 'Motivo de la anulación'}
            </label>
            <textarea
              value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
              placeholder={pidiendo === 'observar' ? 'Ej.: el total no coincide con el PDF' : 'Ej.: se cargó duplicada'}
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm outline-none focus:border-naranja"
            />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setPidiendo(null); setMotivo('') }}>Cancelar</Button>
              <Button
                variant={pidiendo === 'anular' ? 'danger' : 'primary'} size="sm"
                disabled={motivo.trim().length < 3}
                loading={observar.isPending || anular.isPending}
                title={motivo.trim().length < 3 ? 'Escribí el motivo' : undefined}
                onClick={() => {
                  if (pidiendo === 'observar') {
                    accion(() => observar.mutateAsync({ id: f.id, motivo: motivo.trim() }), '✓ Rechazada: vuelve a compras')
                  } else {
                    accion(async () => {
                      const r = await anular.mutateAsync({ id: f.id, motivo: motivo.trim() })
                      return facturaAnulada(r)
                    }, '✓ Factura anulada')
                    onClose()
                  }
                }}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Dato({ label, valor, fuerte, alerta }: { label: string; valor: string; fuerte?: boolean; alerta?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`${fuerte ? 'font-mono font-bold tabular-nums' : ''} ${alerta ? 'text-rojo' : ''}`}>{valor}</div>
    </div>
  )
}

/**
 * El resultado de leer el comprobante y compararlo con lo tipeado.
 *
 * Los cuatro estados se muestran distinto A PROPÓSITO. «Ilegible» y «error»
 * NO son un visto bueno: si se pintaran como «coincide» el control sería peor
 * que no tenerlo, porque daría tranquilidad sin haber mirado nada.
 */
function ControlComprobante({ c }: { c: PagosControlFactura }) {
  const meta = {
    coincide: { icono: '✓', titulo: 'El comprobante coincide con lo cargado', clase: 'bg-verde-light border-verde/40 text-verde' },
    difiere:  { icono: '⚠', titulo: 'El comprobante NO coincide con lo cargado', clase: 'bg-rojo-light border-rojo/40 text-rojo' },
    ilegible: { icono: '?', titulo: 'No se pudo leer el comprobante', clase: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]' },
    error:    { icono: '?', titulo: 'No se pudo controlar el comprobante', clase: 'bg-gris border-gris-mid text-gris-dark' },
  }[c.estado]
  return (
    <div className={`border rounded p-2.5 mb-3 text-xs ${meta.clase}`}>
      <div className="font-bold">{meta.icono} {meta.titulo}</div>
      {c.nota && <div className="mt-0.5">{c.nota}</div>}
      {(c.numero_leido || c.total_leido != null || c.fecha_leida) && (
        <div className="mt-1 text-[11px] opacity-90">
          Leído del papel:{' '}
          {[
            c.numero_leido && <span key="n">N° <b className="font-mono">{c.numero_leido}</b></span>,
            c.total_leido != null && <span key="t">total <b className="font-mono tabular-nums">{fmtM(c.total_leido)}</b></span>,
            c.fecha_leida && <span key="f">emitida el <b className="font-mono">{fmtFecha(c.fecha_leida)}</b></span>,
          ].filter(Boolean).flatMap((el, i) => (i === 0 ? [el] : [' · ', el]))}
        </div>
      )}
      <div className="mt-1 text-[10px] opacity-70">Control automático · {fmtFecha(c.created_at.slice(0, 10))}</div>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gris pt-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">{titulo}</div>
      {children}
    </div>
  )
}

function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris'; children: React.ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}

/**
 * El desglose como lo pide ARCA (20260924u): IVA por alícuota, no gravado,
 * exento y cada percepción con su jurisdicción, más CAE y de dónde salieron
 * los datos. Sin detalle, los números sueltos de siempre.
 */
function DesgloseFicha({ f }: { f: PagosFacturaDetalle }) {
  const iva = f.iva_detalle ?? []
  const trib = f.tributos ?? []
  const hayNumeros = [f.neto, f.iva, f.percepciones, f.otros, f.no_gravado, f.exento].some(v => v != null)
  const origen = { qr: 'QR de ARCA', 'qr+ia': 'QR de ARCA + lectura', ia: 'lectura del comprobante', manual: '' }[f.lectura_estado ?? 'manual']
  if (!hayNumeros && !iva.length && !trib.length && !f.cae) return null
  return (
    <div className="rounded border border-gris px-2.5 py-2 text-[11px] text-gris-dark flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {f.cbte_tipo_arca != null && <span>{NOMBRE_CBTE_ARCA[f.cbte_tipo_arca] ?? `Cód. ARCA ${f.cbte_tipo_arca}`}</span>}
        {f.cae && <span>CAE <span className="font-mono">{f.cae}</span>{f.cae_vto && <> (vence {fmtFecha(f.cae_vto)})</>}</span>}
        {origen && <span>Cargada desde {origen}</span>}
        {f.desglose_a_revisar && <span className="text-naranja-dark font-semibold">Desglose a revisar</span>}
      </div>
      {iva.length > 0 ? (
        <table className="w-full max-w-md">
          <tbody>
            {iva.map(x => (
              <tr key={x.alicuota_id}>
                <td>IVA {ALICUOTAS.find(a => a.id === x.alicuota_id)?.label ?? x.alicuota_id}</td>
                <td className="text-right font-mono tabular-nums">neto {fmtM(x.base_imp)}</td>
                <td className="text-right font-mono tabular-nums">IVA {fmtM(x.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (f.neto != null || f.iva != null) && (
        <div>{f.neto != null && <>Neto {fmtM(f.neto)} · </>}{f.iva != null && <>IVA {fmtM(f.iva)}</>}</div>
      )}
      {(f.no_gravado != null || f.exento != null) && (
        <div>{f.no_gravado != null && <>No gravado {fmtM(f.no_gravado)} · </>}{f.exento != null && <>Exento {fmtM(f.exento)}</>}</div>
      )}
      {trib.length > 0 ? trib.map((t, i) => (
        <div key={t.id ?? i}>
          {labelTributo(t.tipo)}{t.jurisdiccion && <> — {t.jurisdiccion}</>}{t.descripcion && <span className="italic"> ({t.descripcion})</span>}: <b className="font-mono tabular-nums">{fmtM(t.importe)}</b>
        </div>
      )) : (f.percepciones != null || f.otros != null) && (
        <div>{f.percepciones != null && <>Percepciones (sin discriminar) {fmtM(f.percepciones)} · </>}{f.otros != null && <>Otros {fmtM(f.otros)}</>}</div>
      )}
      <div>
        <span title="Total menos percepciones: es lo que se reparte entre las obras">Imputable a obras <b>{fmtM(f.imputable)}</b></span>
      </div>
    </div>
  )
}
