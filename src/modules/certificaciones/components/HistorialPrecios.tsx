'use client'

import { useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useMaterialCompras } from '../hooks/useStock'
import type { CatalogoMaterial, MaterialCompra } from '@/types/domain.types'

/**
 * Historial de precios de un material del catálogo (2026-09-06).
 *
 * El catálogo guarda UN precio de referencia y muestra la última compra; acá
 * está todo lo demás: cada compra real (fecha, proveedor, obra, pedido,
 * cantidad, precio, variación contra la anterior) y el resumen por proveedor
 * (último precio que se le pagó a cada uno, cuántas veces, mínimo y máximo),
 * para comparar de un vistazo dónde conviene comprar. Solo lee; "Usar" copia
 * un precio al precio de referencia, igual que el botón de la fila.
 */

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
function fmtVar(p: number | null) {
  if (p === null) return null
  const r = Math.round(p)
  return `${r > 0 ? '+' : ''}${r}%`
}

interface Props {
  material:     CatalogoMaterial
  onClose:      () => void
  /** Si viene, cada precio tiene "Usar" para copiarlo al precio de referencia. */
  onUsarPrecio?: (precio: number) => void
  /**
   * Si viene, cada compra puede descartarse como referencia del catálogo (y
   * volver a tomarse). `usar=false` la descarta.
   */
  onDescartar?: (compra: MaterialCompra, descartar: boolean) => void
  ocupado?:     boolean
}

export function HistorialPrecios({ material, onClose, onUsarPrecio, onDescartar, ocupado }: Props) {
  const { data, isLoading, isError, error } = useMaterialCompras(material.id)
  const compras = useMemo(() => data?.compras ?? [], [data])
  const porProveedor = data?.por_proveedor ?? []

  // Variación de cada compra contra la anterior EN EL TIEMPO (la lista viene
  // de la más nueva a la más vieja, así que la anterior es la siguiente fila).
  const variacion = useMemo(() => {
    const m = new Map<number, number | null>()
    for (let i = 0; i < compras.length; i++) {
      const ant = compras[i + 1]
      const cur = compras[i]!
      m.set(cur.item_id, ant && Number(ant.precio_unit) > 0 ? (Number(cur.precio_unit) - Number(ant.precio_unit)) / Number(ant.precio_unit) * 100 : null)
    }
    return m
  }, [compras])

  const ref = Number(material.precio_ref)
  const difRef = (p: number) => ref > 0 ? (p - ref) / ref * 100 : null
  const primera = compras.length ? compras[compras.length - 1]! : null
  const ultima = compras[0] ?? null

  return (
    <Modal open onClose={onClose} title={material.nombre} width="max-w-3xl"
      footer={<div className="flex justify-between items-center gap-2">
        <span className="text-xs text-gris-dark">
          {compras.length === 0 ? 'Sin compras registradas por el sistema.' : `${compras.length} compra${compras.length === 1 ? '' : 's'} · ${porProveedor.length} proveedor${porProveedor.length === 1 ? '' : 'es'}${primera?.fecha ? ` · desde ${fmtFecha(primera.fecha)}` : ''}`}
        </span>
        <Button onClick={onClose}>Cerrar</Button>
      </div>}
    >
      <div className="flex flex-col gap-4">
        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <Dato label="Precio de referencia" valor={ref > 0 ? fmtM(ref) : 'sin precio'} sub={material.precio_actualizado_en ? `act. ${fmtFecha(material.precio_actualizado_en)}` : undefined} destacado />
          <Dato label="Última compra" valor={ultima ? fmtM(Number(ultima.precio_unit)) : '—'} sub={ultima ? `${ultima.proveedor_nombre ?? 'sin proveedor'} · ${fmtFecha(ultima.fecha)}` : undefined} />
          <Dato label="Más barata" valor={compras.length ? fmtM(Math.min(...compras.map(c => Number(c.precio_unit)))) : '—'} />
          <Dato label="Más cara" valor={compras.length ? fmtM(Math.max(...compras.map(c => Number(c.precio_unit)))) : '—'} />
        </div>
        <p className="text-[11px] text-gris-dark -mt-2">Precios finales por {material.unidad}, IVA incluido. Salen de los renglones de pedido resueltos como compra.</p>

        {isLoading && <div className="p-6 text-center text-sm text-gris-dark">Cargando…</div>}
        {isError && <div className="bg-rojo-light text-rojo rounded-card p-3 text-sm">No se pudo cargar el historial: {(error as Error)?.message}</div>}

        {/* Por proveedor */}
        {porProveedor.length > 0 && (
          <section>
            <h3 className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">Por proveedor · último precio pagado a cada uno</h3>
            <div className="border border-gris rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gris/40 text-[10px] uppercase tracking-wide text-gris-dark">
                    <th className="text-left px-3 py-1.5 font-bold">Proveedor</th>
                    <th className="text-right px-3 py-1.5 font-bold">Último precio</th>
                    <th className="text-left px-3 py-1.5 font-bold hidden sm:table-cell">Fecha</th>
                    <th className="text-right px-3 py-1.5 font-bold hidden sm:table-cell">Vs. ref.</th>
                    <th className="text-right px-3 py-1.5 font-bold">Compras</th>
                    <th className="text-right px-3 py-1.5 font-bold hidden md:table-cell">Mín – máx</th>
                    {onUsarPrecio && <th className="px-3 py-1.5 w-16"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gris">
                  {porProveedor.map((p, i) => {
                    const d = difRef(p.ultimo_precio)
                    const masBarato = i === porProveedor.reduce((best, x, j) => x.ultimo_precio < porProveedor[best]!.ultimo_precio ? j : best, 0) && porProveedor.length > 1
                    return (
                      <tr key={p.proveedor} className={masBarato ? 'bg-verde-light/40' : ''}>
                        <td className="px-3 py-1.5 font-medium text-carbon">
                          {p.proveedor}
                          {masBarato && <span className="ml-1.5 text-[9px] font-bold bg-verde-light text-verde px-1.5 py-0.5 rounded">más barato</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums">{fmtM(p.ultimo_precio)}</td>
                        <td className="px-3 py-1.5 hidden sm:table-cell text-xs text-gris-dark font-mono">{fmtFecha(p.ultima_fecha)}</td>
                        <td className={`px-3 py-1.5 hidden sm:table-cell text-right text-xs font-bold tabular-nums ${d === null ? 'text-gris-dark' : d > 0.5 ? 'text-rojo' : d < -0.5 ? 'text-verde' : 'text-gris-dark'}`}>{d === null ? '—' : fmtVar(d)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{p.compras}</td>
                        <td className="px-3 py-1.5 hidden md:table-cell text-right text-xs text-gris-dark font-mono tabular-nums">{p.minimo === p.maximo ? fmtM(p.minimo) : `${fmtM(p.minimo)} – ${fmtM(p.maximo)}`}</td>
                        {onUsarPrecio && (
                          <td className="px-3 py-1.5 text-right">
                            {p.ultimo_precio !== ref && <button type="button" disabled={ocupado} onClick={() => onUsarPrecio(p.ultimo_precio)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul hover:opacity-80" title="Copiar este precio al precio de referencia">usar</button>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Compras */}
        {compras.length > 0 && (
          <section>
            <h3 className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">Compras · de la más nueva a la más vieja</h3>
            <div className="border border-gris rounded-lg overflow-x-auto max-h-[45vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gris text-[10px] uppercase tracking-wide text-gris-dark">
                    <th className="text-left px-3 py-1.5 font-bold">Fecha</th>
                    <th className="text-left px-3 py-1.5 font-bold">Proveedor</th>
                    <th className="text-left px-3 py-1.5 font-bold hidden sm:table-cell">Obra · pedido</th>
                    <th className="text-right px-3 py-1.5 font-bold">Cant.</th>
                    <th className="text-right px-3 py-1.5 font-bold">Precio</th>
                    <th className="text-right px-3 py-1.5 font-bold hidden sm:table-cell" title="Contra la compra anterior">Var.</th>
                    {onUsarPrecio && <th className="px-3 py-1.5 w-32"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gris">
                  {compras.map((c: MaterialCompra) => {
                    const v = variacion.get(c.item_id) ?? null
                    const precio = Number(c.precio_unit)
                    // Descartada: se sigue viendo (hay que poder revertirlo),
                    // pero atenuada y tachada — el catálogo ya no la mira.
                    const fuera = !!c.precio_no_referencia
                    return (
                      <tr key={c.item_id} className={`hover:bg-gris/20 ${fuera ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-1.5 font-mono text-xs text-carbon whitespace-nowrap">{fmtFecha(c.fecha)}</td>
                        <td className="px-3 py-1.5 text-xs">
                          <div className="font-medium text-carbon">{c.proveedor_nombre ?? <span className="text-gris-dark">sin proveedor</span>}</div>
                          {c.factura_numero && <div className="text-[10px] text-gris-dark font-mono">fact. {c.factura_numero}</div>}
                          {c.pagado_por === 'cliente' && <div className="text-[10px] text-gris-dark">pagó el cliente</div>}
                        </td>
                        <td className="px-3 py-1.5 hidden sm:table-cell text-xs text-gris-dark">
                          <div className="text-carbon">{c.obra_nom ?? c.obra_cod}</div>
                          <div className="text-[10px] font-mono">pedido #{c.solicitud_id}{c.color ? ` · ${c.color}` : ''}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums whitespace-nowrap">{Number(c.cantidad).toLocaleString('es-AR')} {c.unidad}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold tabular-nums ${fuera ? 'line-through text-gris-dark' : precio === ref ? 'text-azul' : ''}`} title={fuera ? 'Descartado como referencia' : precio === ref ? 'Es el precio de referencia actual' : undefined}>{fmtM(precio)}</td>
                        <td className={`px-3 py-1.5 hidden sm:table-cell text-right text-xs font-bold tabular-nums ${v === null ? 'text-gris-dark' : v > 0.5 ? 'text-rojo' : v < -0.5 ? 'text-verde' : 'text-gris-dark'}`}>{v === null ? '—' : fmtVar(v)}</td>
                        {onUsarPrecio && (
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            {!fuera && precio !== ref && <button type="button" disabled={ocupado} onClick={() => onUsarPrecio(precio)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul hover:opacity-80" title="Copiar este precio al precio de referencia">usar</button>}
                            {onDescartar && (
                              <button type="button" disabled={ocupado}
                                onClick={() => onDescartar(c, !fuera)}
                                className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${fuera ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} hover:opacity-80`}
                                title={fuera
                                  ? 'Volver a tomar este precio como referencia del catálogo'
                                  : 'No tomar este precio como referencia: queda en el historial y en la cuenta de la obra, pero el catálogo deja de compararlo'}>
                                {fuera ? 'volver a usar' : 'descartar'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!isLoading && !isError && compras.length === 0 && (
          <div className="bg-gris/40 rounded-card p-4 text-sm text-gris-dark text-center">
            Este material todavía no tiene compras cargadas por el sistema. El precio de referencia {ref > 0 ? 'viene de una lista o de una carga a mano.' : 'está vacío.'}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Dato({ label, valor, sub, destacado }: { label: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${destacado ? 'bg-azul-light/60' : 'bg-gris/40'}`}>
      <div className="text-[10px] uppercase tracking-wide text-gris-dark">{label}</div>
      <div className={`font-mono font-bold ${destacado ? 'text-azul' : 'text-carbon'}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark truncate">{sub}</div>}
    </div>
  )
}
