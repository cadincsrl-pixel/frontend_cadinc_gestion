'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { PagosBloqueoDeshacer, PagosBloqueoDeshacerMotivo, PagosImportacion } from '@/types/domain.types'
import { useDeshacerImportacion, useDeshacerImportacionVista, useImportaciones } from '../hooks/usePagos'
import { fmtFecha } from '../utils/pagos.utils'
import { detalleErrorPagos, mensajeErrorPagos } from '../utils/pagos.errores'

/**
 * Deshacer una importación de «Mis Comprobantes» (20260929k).
 *
 * Anula TODAS sus facturas y los asientos del motor en meses abiertos, en una
 * sola operación: si alguna ya tiene pago, NC, imputación, aprobación o
 * asiento en un mes cerrado, no se deshace nada (la vista previa lo dice
 * antes). Los proveedores que creó la importación quedan. No hay «rehacer»:
 * se vuelve a importar el archivo.
 *
 * Permisos: ver la vista previa pide «Importar comprobantes de ARCA»;
 * deshacer, además, eliminar en Compras. El admin puede todo.
 */

const MOTIVO_LABEL: Record<PagosBloqueoDeshacerMotivo, string> = {
  con_pago:                'tiene un pago',
  con_nc:                  'tiene una nota de crédito aplicada',
  imputada:                'ya está imputada',
  aprobada:                'ya está aprobada',
  asiento_periodo_cerrado: 'su asiento está en un mes cerrado',
}

/** Permiso para ver la vista previa y para deshacer (el backend y la base vuelven a chequear). */
export function usePermisoDeshacer() {
  const { esAdmin, importarComprobantes, puedeEliminar } = usePermisos('pagos')
  const ver = !!(esAdmin || importarComprobantes)
  const aplicar = !!(esAdmin || (importarComprobantes && puedeEliminar))
  const motivoVer = ver ? null : 'Hace falta el permiso «Importar comprobantes de ARCA»'
  const motivoAplicar = aplicar ? null : motivoVer ?? 'Hace falta además el permiso de eliminar en Compras'
  return { ver, aplicar, motivoVer, motivoAplicar }
}

/** Historial de importaciones con «Deshacer» (va en el modal de importar). */
export function ListaImportaciones({ onDeshacer }: { onDeshacer: (imp: PagosImportacion) => void }) {
  const q = useImportaciones()
  const { ver, motivoVer } = usePermisoDeshacer()
  const lista = q.data ?? []

  return (
    <details className="border border-gris-mid rounded">
      <summary className="px-2 py-1.5 text-xs font-semibold text-azul cursor-pointer select-none">
        Importaciones anteriores{q.data ? ` (${lista.length})` : ''}
      </summary>
      <div className="px-2 pb-2">
        {q.isLoading && <div className="py-2 text-xs text-gris-dark">Cargando…</div>}
        {q.isError && <div className="py-2 text-xs text-rojo">{mensajeErrorPagos(q.error)}</div>}
        {q.data && lista.length === 0 && <div className="py-2 text-xs text-gris-dark">Todavía no hay importaciones.</div>}
        {lista.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gris-dark border-b border-gris">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Archivo</th>
                  <th className="py-1 pr-2">Fechas</th>
                  <th className="py-1 pr-2 text-right">Nuevas</th>
                  <th className="py-1 pr-2 text-right">Vigentes</th>
                  <th className="py-1 pr-2">Cuándo</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {lista.map(imp => {
                  const deshecha = !!imp.deshecha_at
                  const sinVigentes = imp.facturas_vigentes === 0
                  const bloqueo = motivoVer
                    ?? (deshecha ? 'Ya se deshizo'
                    : sinVigentes ? 'No le quedan facturas vigentes' : null)
                  return (
                    <tr key={imp.id} className={deshecha ? 'opacity-60' : ''}>
                      <td className="py-1.5 pr-2 font-mono">{imp.id}</td>
                      <td className="py-1.5 pr-2 max-w-[260px]">
                        <div className="truncate" title={imp.archivo}>{imp.archivo || '—'}</div>
                        {imp.historica && <span className="text-[10px] px-1 rounded bg-gris text-gris-dark font-bold">meses ya pagados</span>}
                        {deshecha && (
                          <div className="text-[10px] text-rojo" title={imp.motivo_deshacer ?? undefined}>
                            Deshecha el {fmtFecha(imp.deshecha_at)}{imp.deshecha_por_nombre ? ` por ${imp.deshecha_por_nombre}` : ''}
                            {imp.motivo_deshacer ? `: ${imp.motivo_deshacer}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtFecha(imp.fecha_desde)} – {fmtFecha(imp.fecha_hasta)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{imp.nuevas}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">{imp.facturas_vigentes ?? '—'}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {fmtFecha(imp.created_at)}{imp.created_by_nombre ? ` · ${imp.created_by_nombre}` : ''}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button size="sm" variant="ghost" disabled={!!bloqueo || !ver}
                          title={bloqueo ?? 'Ver qué se anula y deshacer la importación'}
                          onClick={() => onDeshacer(imp)}>↶ Deshacer</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  )
}

export function ModalDeshacerImportacion({ importacion, onClose }: {
  importacion: PagosImportacion
  onClose: () => void
}) {
  const toast = useToast()
  const { aplicar, motivoAplicar } = usePermisoDeshacer()
  const vista = useDeshacerImportacionVista(importacion.id)
  const deshacer = useDeshacerImportacion()
  const [motivo, setMotivo] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const v = vista.data
  // Los bloqueos que devolvió el POST (la base pudo cambiar desde la vista previa).
  const [bloqueosPost, setBloqueosPost] = useState<PagosBloqueoDeshacer[] | null>(null)
  const bloqueos = bloqueosPost ?? v?.bloqueos ?? []
  const facturasBloqueadas = new Set(bloqueos.map(b => b.factura_id)).size

  const motivoOk = motivo.replace(/\s+/g, ' ').trim().length >= 3
  const confirmado = confirmacion.trim() === String(importacion.id)
  const bloqueoBoton = motivoAplicar
    ?? (!v ? 'Esperá la vista previa'
    : bloqueos.length > 0 ? 'Hay comprobantes con movimientos: no se deshace nada'
    : v.a_anular === 0 ? 'No quedan facturas para anular'
    : !motivoOk ? 'Escribí el motivo (al menos 3 caracteres)'
    : !confirmado ? `Escribí ${importacion.id} para confirmar` : null)

  async function onDeshacer() {
    if (bloqueoBoton) return
    setErrorServer(null)
    try {
      const r = await deshacer.mutateAsync({ id: importacion.id, motivo: motivo.replace(/\s+/g, ' ').trim() })
      toast(`✓ Importación #${importacion.id} deshecha: ${r.a_anular} comprobante${r.a_anular === 1 ? '' : 's'} anulado${r.a_anular === 1 ? '' : 's'}`
        + (r.asientos_a_anular > 0 ? ` y ${r.asientos_a_anular} asiento${r.asientos_a_anular === 1 ? '' : 's'}` : ''), 'ok')
      onClose()
    } catch (e) {
      const det = detalleErrorPagos(e)
      const b = det?.bloqueos
      if (Array.isArray(b)) setBloqueosPost(b as PagosBloqueoDeshacer[])
      setErrorServer(mensajeErrorPagos(e))
    }
  }

  return (
    <Modal open onClose={deshacer.isPending ? () => {} : onClose} width="max-w-3xl"
      title={`Deshacer la importación #${importacion.id}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={deshacer.isPending}>Cancelar</Button>
        <Button size="sm" variant="danger" onClick={() => void onDeshacer()} loading={deshacer.isPending}
          disabled={!!bloqueoBoton || !aplicar} title={bloqueoBoton ?? 'Anular todos los comprobantes de la importación'}>
          Deshacer la importación
        </Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          <b className="text-azul">{importacion.archivo || 'Sin nombre'}</b> · importada el {fmtFecha(importacion.created_at)}
          {importacion.created_by_nombre ? ` por ${importacion.created_by_nombre}` : ''} · {importacion.nuevas} comprobantes
        </div>

        {vista.isLoading && <div className="py-3 text-sm text-gris-dark">Calculando qué se anula…</div>}
        {vista.isError && (
          <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">{mensajeErrorPagos(vista.error)}</div>
        )}

        {v && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Comprobantes a anular" valor={v.a_anular} tono={v.a_anular > 0 ? 'rojo' : 'normal'} />
              <Cifra label="Asientos a anular" valor={v.asientos_a_anular} sub="en meses abiertos" />
              {v.ya_anuladas > 0 && <Cifra label="Ya anuladas" valor={v.ya_anuladas} sub="no se tocan" />}
              <Cifra label="Con movimientos" valor={facturasBloqueadas} tono={facturasBloqueadas > 0 ? 'rojo' : 'verde'} />
            </div>

            <div className="border rounded p-2 text-xs bg-gris border-gris-mid text-gris-dark">
              Se anulan <b>todos</b> los comprobantes de la importación (quedan en la bandeja como anulados, con el motivo) y sus
              asientos automáticos. Los proveedores que se crearon <b>no</b> se tocan. No hay «rehacer»: si hace falta, se vuelve a
              importar el archivo.
            </div>

            {bloqueos.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">
                  <b>No se puede deshacer:</b> {facturasBloqueadas} comprobante{facturasBloqueadas === 1 ? '' : 's'} ya
                  tiene{facturasBloqueadas === 1 ? '' : 'n'} movimientos. Es todo o nada: resolvelos primero (anular el pago, la
                  NC o la imputación) o dejá la importación como está.
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto border border-gris-mid rounded">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-gris-dark border-b border-gris">
                        <th className="py-1 px-2">Comprobante</th>
                        <th className="py-1 px-2">Proveedor</th>
                        <th className="py-1 px-2">Por qué</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gris">
                      {bloqueos.map((b, i) => (
                        <tr key={`${b.factura_id}-${b.motivo}-${i}`}>
                          <td className="py-1 px-2 font-mono whitespace-nowrap">{b.tipo_comprobante ?? ''} {b.numero ?? `#${b.factura_id}`}</td>
                          <td className="py-1 px-2">{b.proveedor ?? '—'}</td>
                          <td className="py-1 px-2">{MOTIVO_LABEL[b.motivo] ?? b.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bloqueos.length === 0 && v.a_anular > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Motivo (obligatorio)" value={motivo} maxLength={500} disabled={!aplicar || deshacer.isPending}
                  title={motivoAplicar ?? undefined}
                  placeholder="Ej.: se importó el archivo de otro mes"
                  onChange={e => setMotivo(e.target.value)} />
                <Input label={`Escribí ${importacion.id} para confirmar`} value={confirmacion} inputMode="numeric"
                  disabled={!aplicar || deshacer.isPending} title={motivoAplicar ?? undefined}
                  onChange={e => setConfirmacion(e.target.value)} />
              </div>
            )}
          </>
        )}

        {errorServer && (
          <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">{errorServer}</div>
        )}
      </div>
    </Modal>
  )
}

function Cifra({ label, valor, sub, tono = 'normal' }: {
  label: string; valor: number; sub?: string; tono?: 'normal' | 'rojo' | 'verde'
}) {
  const color = { normal: 'text-azul', rojo: 'text-rojo', verde: 'text-verde' }[tono]
  return (
    <div className="flex-1 min-w-[120px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-base tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}
