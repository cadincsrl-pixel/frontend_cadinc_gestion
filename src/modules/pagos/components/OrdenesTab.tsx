'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import {
  useOrdenes, useOrden, useAnularOrden, useSubirAdjuntoPagos, fetchPagosAdjuntoSignedUrl,
  fetchOrdenesExport, type PagosOrdenesFiltro,
} from '../hooks/usePagos'
import { exportarOrdenesPagos } from '../utils/pagosExport'
import { descargarOrdenPagoPdf, ncAplicadasTxt } from '../utils/ordenPagoPdf'
import { ModalPaqueteContador } from './ModalPaqueteContador'
import { ModalAvisarPago } from './ModalAvisarPago'
import { PreguntarAvisoPago } from './PreguntarAvisoPago'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import {
  FORMAS_PAGO_OP, MAX_ADJUNTO_BYTES, salidaLabel, MIME_ADJUNTOS, TIPOS_ADJ_FACTURA, comprobanteTxt, fmtFecha, fmtM, formaPagoLabel, hoyAR,
} from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'

const PAGE_SIZE = 50

/**
 * El libro de órdenes de pago: qué salió, cuándo, por qué vía y contra qué
 * facturas.
 *
 * Los totales del pie salen de la RPC sobre el filtro COMPLETO (vienen en
 * `totales`), no de sumar la página: con más de 1000 filas sumar acá mentiría.
 */
export function OrdenesTab() {
  const toast = useToast()
  const { puedeVer, registrarPagos, anularPagos, esAdmin, verPii } = usePermisos('pagos')

  const [filtro, setFiltro] = useState<PagosOrdenesFiltro>({ estado: 'emitida' })
  const [page, setPage] = useState(1)
  const [detalleId, setDetalleId] = useState<number | null>(null)

  const proveedores = useProveedoresPagos({}, 1, 300, puedeVer)
  const lista = useOrdenes(filtro, page, PAGE_SIZE, puedeVer)

  const items = useMemo(() => lista.data?.items ?? [], [lista.data])
  const total = lista.data?.total ?? 0
  const totales = lista.data?.totales

  function patch(p: Partial<PagosOrdenesFiltro>) { setFiltro(f => ({ ...f, ...p })); setPage(1) }

  const [exportando, setExportando] = useState(false)
  const [paquete, setPaquete] = useState(false)

  /** Exporta lo FILTRADO, no la página: las filas las trae `/ordenes/export`, que pagina en el server. */
  async function exportar() {
    if (total === 0) { toast('No hay órdenes para exportar con estos filtros', 'err'); return }
    setExportando(true)
    try {
      await exportarOrdenesPagos(await fetchOrdenesExport(filtro))
    } catch {
      toast('No se pudo generar el Excel', 'err')
    } finally {
      setExportando(false)
    }
  }

  const enCartera = useMemo(() => items.filter(o => o.en_cartera).length, [items])

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
      No tenés permiso para ver las órdenes de pago.
    </div>
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Totales del filtro */}
      {totales && (
        <div className="flex gap-2 flex-wrap">
          <Kpi label="Órdenes" valor={String(totales.ordenes)} />
          <Kpi label="Pagado" valor={fmtM(totales.monto_pagado)} sub="todas las formas" />
          {enCartera > 0 && <Kpi label="Cheques en cartera" valor={String(enCartera)} sub="en esta página" tono="alerta" />}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex gap-2 flex-wrap items-end">
        <div className="w-52">
          <label className={lblCls}>Proveedor</label>
          <select value={filtro.proveedor_id ?? ''} onChange={e => patch({ proveedor_id: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
            <option value="">Todos</option>
            {(proveedores.data?.items ?? []).map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
        </div>
        <div className="w-40">
          <label className={lblCls}>Forma</label>
          <select value={filtro.forma_pago ?? ''} onChange={e => patch({ forma_pago: (e.target.value || undefined) as PagosOrdenesFiltro['forma_pago'] })} className={inputCls}>
            <option value="">Todas</option>
            {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div className="w-36">
          <label className={lblCls}>Estado</label>
          <select value={filtro.estado ?? ''} onChange={e => patch({ estado: (e.target.value || undefined) as PagosOrdenesFiltro['estado'] })} className={inputCls}>
            <option value="emitida">Vigentes</option>
            <option value="anulada">Anuladas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <div className="w-36">
          <label className={lblCls}>Pagadas desde</label>
          <input type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })} className={inputCls} />
        </div>
        <div className="w-36">
          <label className={lblCls}>Hasta</label>
          <input type="date" value={filtro.hasta ?? ''} onChange={e => patch({ hasta: e.target.value || undefined })} className={inputCls} />
        </div>
        <div className="flex gap-3 flex-wrap text-xs pb-2">
          <Tilde label="Sin comprobante" on={!!filtro.sin_comprobante} set={v => patch({ sin_comprobante: v || undefined })} />
          <Tilde label="Cheques en cartera" on={!!filtro.en_cartera} set={v => patch({ en_cartera: v || undefined })} />
        </div>
        <div className="ml-auto pb-2 flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}
            title="Baja TODAS las órdenes del filtro, no sólo esta página. Segunda hoja con los cheques por fecha de cobro.">
            📊 Exportar Excel
          </Button>
          {/* Filtro propio, no el de la pantalla: el paquete se arma por
              período cerrado para mandarlo, no por lo que uno está mirando. */}
          <Button variant="secondary" size="sm" onClick={() => setPaquete(true)}
            title="ZIP con los comprobantes de pago y las facturas que cubrieron, una carpeta por orden.">
            🗂 Paquete contador
          </Button>
        </div>
      </div>

      {/* Lista */}
      {lista.isLoading && !lista.data ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando órdenes…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">No hay órdenes con estos filtros.</div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  {['Orden', 'Proveedor', 'Fecha', 'Forma', 'Pagado', 'Facturas', ''].map((h, i) => (
                    <th key={h + i} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(o => (
                  <tr key={o.id} className={`border-t border-gris hover:bg-azul-light/30 cursor-pointer ${o.estado === 'anulada' ? 'opacity-60' : ''}`}
                      onClick={() => setDetalleId(o.id)}>
                    <td className="px-3 py-2">
                      <span className="font-mono font-bold text-sm">{o.numero_fmt}</span>
                      {o.estado === 'anulada' && <span className="ml-1 text-[10px] px-1.5 rounded bg-gris text-gris-dark font-bold uppercase">anulada</span>}
                      {o.en_cartera && <span className="ml-1 text-[10px] px-1.5 rounded bg-amarillo-light text-[#7A5000] font-bold" title={`Se cobra el ${fmtFecha(o.fecha_cobro)}`}>en cartera</span>}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {o.proveedor_nom}
                      {o.proveedor_codigo && <span className="ml-1 font-mono text-[10px] text-gris-dark" title="Código del proveedor">{o.proveedor_codigo}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(o.fecha)}</td>
                    <td className="px-3 py-2 text-xs">
                      {formaPagoLabel(o.forma_pago)}
                      {o.comprobante_requerido && !o.tiene_comprobante && (
                        <span className="block text-[10px] text-rojo font-bold">sin comprobante</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">{o.monto_pagado > 0 ? fmtM(o.monto_pagado) : <span className="text-gris-mid">—</span>}</td>
                    <td className="px-3 py-2 text-[11px] text-gris-dark truncate max-w-[220px]" title={o.facturas ?? undefined}>{o.facturas ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold" onClick={() => setDetalleId(o.id)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en celular */}
          <div className="md:hidden divide-y divide-gris">
            {items.map(o => (
              <div key={o.id} role="button" tabIndex={0} onClick={() => setDetalleId(o.id)}
                      onKeyDown={e => { if (e.key === 'Enter') setDetalleId(o.id) }}
                      className={`w-full text-left p-3 cursor-pointer ${o.estado === 'anulada' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-sm">{o.numero_fmt}</span>
                    <div className="text-sm">
                      {o.proveedor_nom}
                      {o.proveedor_codigo && <span className="ml-1 font-mono text-[10px] text-gris-dark">{o.proveedor_codigo}</span>}
                    </div>
                    <div className="text-[11px] text-gris-dark">{fmtFecha(o.fecha)} · {formaPagoLabel(o.forma_pago)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold tabular-nums">{fmtM(o.monto_pagado)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {paquete && <ModalPaqueteContador onClose={() => setPaquete(false)} />}

      {detalleId !== null && (
        <DetalleOrden
          id={detalleId}
          onClose={() => setDetalleId(null)}
          puedeAnular={!!(anularPagos || registrarPagos || esAdmin)}
          puedeSubir={!!(registrarPagos || esAdmin)}
          verPii={!!verPii}
          toast={toast}
        />
      )}
    </div>
  )
}

function DetalleOrden({ id, onClose, puedeAnular, puedeSubir, verPii, toast }: {
  id: number; onClose: () => void; puedeAnular: boolean; puedeSubir: boolean
  verPii: boolean
  toast: (m: string, t?: 'ok' | 'err' | 'warn') => void
}) {
  const { data: o, isLoading } = useOrden(id)
  const anular = useAnularOrden()
  const subir  = useSubirAdjuntoPagos()
  const [motivo, setMotivo] = useState('')
  const [pidiendo, setPidiendo] = useState(false)
  const [avisando, setAvisando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [preguntarAviso, setPreguntarAviso] = useState(false)

  if (isLoading || !o) {
    return <Modal open onClose={onClose} title="Orden de pago" width="max-w-2xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-2xl"
      title={`${o.numero_fmt} · ${o.proveedor_nom}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          {/* La OP impresa, con el formato de la de Finnegans (20260923). */}
          <Button variant="secondary" size="sm" loading={generandoPdf}
            title="La orden de pago en PDF, para imprimir, firmar o mandar"
            onClick={async () => {
              setGenerandoPdf(true)
              try { await descargarOrdenPagoPdf(o, { verPii }) }
              catch { toast('No se pudo generar el PDF', 'err') }
              finally { setGenerandoPdf(false) }
            }}>
            🖨 PDF
          </Button>
          {o.estado === 'emitida' && (
            <Button variant="danger" size="sm" onClick={() => setPidiendo(true)} disabled={!puedeAnular}
              title={puedeAnular ? 'Anular: las facturas vuelven a su estado anterior' : 'No tenés permiso para anular órdenes'}>
              Anular orden
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {o.estado === 'anulada' && (
          <div className="bg-gris border border-gris-mid rounded p-2 text-xs text-gris-dark">
            <b>Anulada:</b> {o.motivo_anulacion}
            {o.anulado_por_nombre && <> — {o.anulado_por_nombre}, {fmtFecha(o.anulado_at)}</>}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato label="Proveedor" valor={[o.proveedor_codigo, o.proveedor_cuit ? `CUIT ${o.proveedor_cuit}` : null].filter(Boolean).join(' · ') || '—'} />
          <Dato label="Fecha" valor={fmtFecha(o.fecha)} />
          <Dato label="Forma" valor={formaPagoLabel(o.forma_pago)} />
          <Dato label={salidaLabel(o.forma_pago)} valor={fmtM(o.monto_pagado)} fuerte />
          {/* Solo las OP viejas: desde 20260925 la NC es un comprobante aparte. */}
          {o.monto_nc > 0 && <Dato label="Notas de crédito (circuito viejo)" valor={fmtM(o.monto_nc)} />}
          {o.fecha_cobro && (
            <Dato label={o.cheques.length > 1 ? 'Primero se cobra el' : 'Se cobra el'} valor={fmtFecha(o.fecha_cobro)} />
          )}
          {o.referencia && <Dato label="Referencia" valor={o.referencia} />}
          <Dato label="Registró" valor={`${o.created_by_nombre ?? '—'}, ${fmtFecha(o.created_at)}`} />
        </div>

        {(o.cbu_destino || o.alias_destino) && (
          <div className="bg-gris border border-gris-mid rounded p-2 text-xs">
            Se pagó a: <b className="font-mono">{verPii ? (o.cbu_destino ?? o.alias_destino) : (o.cbu_destino_ultimos4 ? `***${o.cbu_destino_ultimos4}` : o.alias_destino)}</b>
            <span className="block text-gris-dark mt-0.5">Es la cuenta que tenía el padrón al registrar el pago.</span>
          </div>
        )}

        {/* Cheques: en el orden en que van a caer. */}
        {o.cheques.length > 0 && (
          <div className="border-t border-gris pt-2">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">
              {o.forma_pago === 'echeq' ? 'E-cheqs' : 'Cheques'} entregados ({o.cheques.length})
            </div>
            <table className="w-full text-xs">
              <tbody>
                {o.cheques.map(c => {
                  const vencido = c.fecha_cobro <= hoyAR()
                  return (
                    <tr key={c.id} className="border-b border-gris last:border-0">
                      <td className="py-1 font-mono">{c.numero}</td>
                      <td className="py-1 text-gris-dark">{c.banco || '—'}</td>
                      <td className="py-1">
                        {fmtFecha(c.fecha_cobro)}
                        {!vencido && <span className="ml-1 text-[10px] px-1 rounded bg-amarillo-light text-[#7A5000] font-bold">en cartera</span>}
                      </td>
                      <td className="py-1">
                        {!c.es_propio && (
                          <span className="text-[10px] px-1 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold" title={`Endosado, lo libró ${c.librador}`}>
                            de {c.librador}
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">{fmtM(c.monto)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Líneas */}
        <div className="border-t border-gris pt-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">Qué cubre</div>
          <table className="w-full text-xs">
            <tbody>
              {o.lineas.map(l => (
                <tr key={l.id} className="border-b border-gris last:border-0">
                  <td className="py-1">
                    {l.tipo === 'a_cuenta' ? (
                      <span className="text-verde font-semibold">A cuenta (sin factura)</span>
                    ) : (
                      <>
                        {l.factura ? comprobanteTxt(l.factura.tipo_comprobante, l.factura.numero) : `Factura #${l.factura_id}`}
                        {l.tipo === 'nota_credito' && (
                          <span className="ml-1 text-[10px] px-1 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold">
                            NC {l.nc_numero} · {fmtFecha(l.nc_fecha)}
                          </span>
                        )}
                        {l.factura?.descripcion && <span className="block text-[10px] text-gris-dark">{l.factura.descripcion}</span>}
                        {/* La factura escaneada, acá mismo. Antes sólo se podía
                            abrir el comprobante del PAGO (abajo, en la OP) y
                            para ver la factura había que ir a buscarla al otro
                            tab, que es justo el par que se mira junto. */}
                        {(l.factura?.adjuntos ?? []).map(a => (
                          <button key={a.id} type="button"
                            className="mt-0.5 mr-2 text-[10px] text-azul hover:underline"
                            title={`${a.nombre_archivo} · ${TIPOS_ADJ_FACTURA.find(t => t.key === a.tipo)?.label ?? a.tipo}`}
                            onClick={() => abrirAdjuntoFirmado(
                              () => fetchPagosAdjuntoSignedUrl('facturas', a.factura_id, a.id),
                              () => toast('No se pudo abrir el archivo', 'err'),
                            )}>
                            📄 {TIPOS_ADJ_FACTURA.find(t => t.key === a.tipo)?.label ?? a.tipo}
                          </button>
                        ))}
                        {/* Las NC que acreditan la factura (20260925): informativo,
                            no es plata de esta orden. */}
                        {(l.factura?.notas_credito ?? []).filter(a => a.vigente !== false).map((a, i) => (
                          <span key={a.id ?? i} className="block text-[10px] text-[#5A2D82]">
                            {ncAplicadasTxt({ ...l, factura: l.factura ? { ...l.factura, notas_credito: [a] } : null })}
                            {(a.adjuntos ?? []).map(adj => (
                              <button key={adj.id} type="button" className="ml-2 text-azul hover:underline"
                                title={adj.nombre_archivo}
                                onClick={() => abrirAdjuntoFirmado(
                                  () => fetchPagosAdjuntoSignedUrl('facturas', adj.factura_id, adj.id),
                                  () => toast('No se pudo abrir el archivo', 'err'),
                                )}>
                                📄 NC
                              </button>
                            ))}
                          </span>
                        ))}
                      </>
                    )}
                  </td>
                  <td className={`py-1 text-right font-mono tabular-nums ${l.tipo === 'nota_credito' ? 'text-[#5A2D82]' : ''}`}>{fmtM(l.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Adjuntos */}
        <div className="border-t border-gris pt-2">
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">Comprobantes del pago</div>
          {o.adjuntos.length === 0 && <div className="text-xs text-gris-dark italic mb-1">Sin archivos.</div>}
          <ul className="flex flex-col gap-1 mb-2">
            {o.adjuntos.map(a => (
              <li key={a.id} className={`text-xs ${a.borrado ? 'opacity-50 line-through' : ''}`}>
                <button type="button" className="text-azul hover:underline"
                  onClick={() => abrirAdjuntoFirmado(
                    () => fetchPagosAdjuntoSignedUrl('ordenes', o.id, a.id),
                    () => toast('No se pudo abrir el archivo', 'err'),
                  )}>
                  📎 {a.nombre_archivo}
                </button>
                <span className="text-gris-dark ml-1">
                  {a.tipo === 'nota_credito' ? '(nota de crédito)' : a.tipo === 'comprobante_pago' ? '(comprobante)' : ''}
                </span>
              </li>
            ))}
          </ul>
          {o.estado === 'emitida' && puedeSubir && (
            <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold inline-block">
              {subir.isPending ? 'Subiendo…' : '📎 Subir comprobante'}
              <input type="file" className="hidden" accept={MIME_ADJUNTOS} disabled={subir.isPending}
                onChange={async e => {
                  const file = e.target.files?.[0]; e.target.value = ''
                  if (!file) return
                  if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
                  try {
                    await subir.mutateAsync({ entidad: 'ordenes', id: o.id, file, tipo: 'comprobante_pago' })
                    toast('✓ Comprobante subido', 'ok')
                    setPreguntarAviso(true)
                  }
                  catch (err) { toast(mensajeErrorPagos(err), 'err') }
                }} />
            </label>
          )}
          {/* Avisar por mail. Con un clic, no automático al emitir: de 9
              proveedores 1 tiene mail cargado, y un mail con datos de pago no
              se desmanda. El modal muestra a qué dirección va. (20260921m) */}
          {o.estado === 'emitida' && puedeSubir && (
            <Button variant="secondary" size="sm" className="ml-2" onClick={() => setAvisando(true)}
              title="Manda el comprobante al proveedor y el par completo al contador. Muestra antes a qué dirección.">
              ✉ Avisar del pago
              {(o.aviso_proveedor || o.aviso_contador) && (
                <span className="ml-1 text-[10px] opacity-75">
                  ({[o.aviso_proveedor && 'proveedor', o.aviso_contador && 'contador'].filter(Boolean).join(' y ')} ✓)
                </span>
              )}
            </Button>
          )}
        </div>

        {avisando && <ModalAvisarPago orden={o} onClose={() => setAvisando(false)} />}
        {preguntarAviso && (
          <PreguntarAvisoPago ordenId={o.id} titulo="Comprobante subido" onClose={() => setPreguntarAviso(false)} />
        )}

        {pidiendo && (
          <div className="border-t border-gris pt-3">
            <label className="block text-xs font-semibold text-gris-dark mb-1">Motivo de la anulación</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
              placeholder="Ej.: se registró con el importe equivocado"
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm outline-none focus:border-naranja" />
            <div className="text-[11px] text-gris-dark mt-1">
              Las facturas vuelven a «aprobada» (o a «pendiente» si nadie las había aprobado) y los adjuntos quedan tachados.
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setPidiendo(false); setMotivo('') }}>Cancelar</Button>
              <Button variant="danger" size="sm" loading={anular.isPending} disabled={motivo.trim().length < 3}
                onClick={async () => {
                  try {
                    const r = await anular.mutateAsync({ id: o.id, motivo: motivo.trim() })
                    toast(`✓ ${r.orden.numero_fmt} anulada · ${r.facturas.length} factura(s) volvieron atrás`, 'ok')
                    onClose()
                  } catch (e) { toast(mensajeErrorPagos(e), 'err') }
                }}>
                Confirmar anulación
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja'
const lblCls   = 'block text-xs font-semibold text-gris-dark mb-1'

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: 'alerta' }) {
  return (
    <div className="flex-1 min-w-[130px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-lg tabular-nums ${tono === 'alerta' ? 'text-rojo' : 'text-azul'}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}

function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={fuerte ? 'font-mono font-bold tabular-nums' : ''}>{valor}</div>
    </div>
  )
}

function Tilde({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none text-gris-dark">
      <input type="checkbox" className="accent-naranja" checked={on} onChange={e => set(e.target.checked)} />
      {label}
    </label>
  )
}
