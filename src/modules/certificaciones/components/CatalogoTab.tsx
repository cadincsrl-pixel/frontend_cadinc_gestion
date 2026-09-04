'use client'

import { useEffect, useState } from 'react'
import { useCatalogo, useStockRubros, useUpdateStockMaterial } from '../hooks/useStock'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Pagination } from '@/components/ui/Pagination'
import { AliasChips } from './AliasChips'
import { UNIDADES } from '../constants'
import type { CatalogoMaterial, StockRubro } from '@/types/domain.types'

/**
 * Catálogo de precios — pestaña aparte del Stock (2026-09-04).
 *
 * El Stock es lo que hay en el depósito y arranca filtrado en "con stock";
 * acá va el catálogo ENTERO con lo que hace falta para tasar: precio de
 * referencia (final, IVA incluido), de cuándo es, y la última compra real del
 * material (precio, proveedor, fecha, pedido). Busca por nombre, sinónimos y
 * rubro sin acentos, paginado en el server.
 *
 * El precio se edita acá mismo; el trigger de la base le pone la fecha. "Usar"
 * copia el precio de la última compra al de referencia, que es el caso típico:
 * se compró hace poco y el catálogo quedó viejo.
 */

const PAGE_SIZE = 50

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  // Un timestamp se formatea con Date; un DATE puro (YYYY-MM-DD) se arma a
  // mano porque `new Date('2026-08-28')` lo toma como UTC y en Argentina se
  // corre un día para atrás.
  if (s.length > 10) return new Date(s).toLocaleDateString('es-AR')
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** Diferencia relativa entre la última compra y el precio de referencia. */
function difPct(m: CatalogoMaterial): number | null {
  if (!m.uc_precio || !(m.precio_ref > 0)) return null
  return (m.uc_precio - m.precio_ref) / m.precio_ref
}

export function CatalogoTab() {
  const { puedeEditar } = usePermisos('certificaciones')
  const toast = useToast()

  const [busqueda, setBusqueda]       = useState('')
  const [rubroId, setRubroId]         = useState<number | ''>('')
  const [soloSinPrecio, setSinPrecio] = useState(false)
  const [conBajas, setConBajas]       = useState(false)
  const [page, setPage]               = useState(1)

  // Debounce: la búsqueda es parte de la queryKey; sin esto cada tecla dispara
  // un request y una key nueva.
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isError, error, refetch } = useCatalogo({
    ...(busquedaAplicada ? { q: busquedaAplicada } : {}),
    ...(rubroId ? { rubro_id: rubroId } : {}),
    ...(soloSinPrecio ? { sin_precio: true } : {}),
    ...(conBajas ? { incluir_inactivos: true } : {}),
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const { data: rubros = [] } = useStockRubros()
  const { mutate: updateMat, isPending } = useUpdateStockMaterial()

  const items = data?.items ?? []
  const total = data?.total ?? 0

  // Edición inline del precio de referencia.
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft]   = useState('')

  function guardarPrecio(m: CatalogoMaterial, valor: number) {
    if (!Number.isFinite(valor) || valor < 0) { toast('Ingresá un precio válido', 'err'); return }
    updateMat({ id: m.id, dto: { precio_ref: valor } }, {
      onSuccess: () => { toast(`✓ ${m.nombre}: ${fmtM(valor)}`, 'ok'); setEditId(null); setDraft('') },
      onError:   () => toast('No se pudo guardar el precio', 'err'),
    })
  }

  function abrirEdicion(m: CatalogoMaterial) {
    setEditId(m.id)
    setDraft(m.precio_ref > 0 ? String(m.precio_ref) : '')
  }

  const unidadLabel = (u: string) => UNIDADES.find(x => x.value === u)?.label ?? u

  return (
    <div className="flex flex-col gap-4">

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Buscar por nombre, sinónimo o rubro (ej: lija 150, plástico negro, termofusión)"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
          <select
            value={rubroId}
            onChange={e => { setRubroId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
          >
            <option value="">Todos los rubros</option>
            {(rubros as StockRubro[]).map(r => (
              <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer">
            <input type="checkbox" checked={soloSinPrecio} onChange={e => { setSinPrecio(e.target.checked); setPage(1) }} />
            Solo sin precio
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer">
            <input type="checkbox" checked={conBajas} onChange={e => { setConBajas(e.target.checked); setPage(1) }} />
            Incluir dados de baja
          </label>
        </div>
        <div className="text-xs text-gris-dark">
          <span className="font-mono font-bold">{total}</span> materiales
          {busquedaAplicada && <> para «{busquedaAplicada}»</>}
          <span className="ml-3">Precios finales, IVA incluido. «Últ. compra» es el último renglón comprado por el sistema, no el proveedor de la ficha.</span>
        </div>
      </div>

      {isError && (
        <div className="bg-rojo-light text-rojo rounded-card p-4 text-sm flex items-center justify-between gap-3">
          <span>No se pudo cargar el catálogo{error instanceof Error ? `: ${error.message}` : ''}</span>
          <button onClick={() => refetch()} className="text-xs font-bold px-3 py-1.5 rounded bg-white">Reintentar</button>
        </div>
      )}

      {isLoading && !data && (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando catálogo…</div>
      )}

      {data && items.length === 0 && (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
          Nada con esos filtros.
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">

          {/* Tabla — desktop/tablet */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead>
                <tr>
                  {['Material', 'Rubro', 'Unidad', 'Precio ref.', 'Últ. compra', ''].map((h, i) => (
                    <th
                      key={i}
                      className={`bg-gris text-gris-dark text-[10px] font-bold px-4 py-2 uppercase tracking-wide ${i === 3 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const dif = difPct(m)
                  const difiere = dif !== null && Math.abs(dif) > 0.1
                  const editando = editId === m.id
                  return (
                    <tr key={m.id} className={`border-t border-gris ${!m.activo ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                          {m.nombre}
                          {m.clase === 'herramienta' && <span className="text-[9px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded" title="Herramienta: va al pañol, no a la cuenta del cliente">🔧</span>}
                          {!m.activo && <span className="text-[9px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded">BAJA</span>}
                        </div>
                        <AliasChips alias={m.alias} compact />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark whitespace-nowrap">{m.rubro_icono} {m.rubro}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark">{unidadLabel(m.unidad)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {editando ? (
                          <div className="flex items-center gap-1 justify-end">
                            <div className="w-32">
                              <InputMonto value={draft} onChange={setDraft} placeholder="0" />
                            </div>
                            <button disabled={isPending} onClick={() => guardarPrecio(m, Number(draft))} className="text-xs font-bold px-2 py-1.5 rounded bg-verde-light text-verde hover:opacity-80">✓</button>
                            <button onClick={() => { setEditId(null); setDraft('') }} className="text-xs font-bold px-2 py-1.5 rounded text-gris-dark hover:text-rojo">✕</button>
                          </div>
                        ) : m.precio_ref > 0 ? (
                          <>
                            <div className="font-mono font-bold text-sm">{fmtM(m.precio_ref)}</div>
                            <div className="text-[10px] text-gris-dark">act. {fmtFecha(m.precio_actualizado_en)}</div>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded">SIN PRECIO</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {m.uc_precio ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono font-bold ${difiere ? 'text-[#7A5500]' : ''}`}>{fmtM(m.uc_precio)}</span>
                              {difiere && dif !== null && (
                                <span className="text-[9px] font-bold bg-amarillo-light text-[#7A5500] px-1.5 py-0.5 rounded" title="La última compra difiere más de 10% del precio de referencia">
                                  {dif > 0 ? '+' : ''}{Math.round(dif * 100)}%
                                </span>
                              )}
                              {puedeEditar && !editando && m.uc_precio !== m.precio_ref && (
                                <button
                                  disabled={isPending}
                                  onClick={() => guardarPrecio(m, m.uc_precio!)}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul hover:opacity-80"
                                  title="Copiar el precio de la última compra al precio de referencia"
                                >
                                  usar
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-gris-dark">
                              {m.uc_proveedor ?? 'sin proveedor'} · {fmtFecha(m.uc_fecha)} · pedido #{m.uc_pedido}
                            </div>
                          </>
                        ) : (
                          <span className="text-gris-dark">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {puedeEditar && !editando && (
                          <button onClick={() => abrirEdicion(m)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-gris-mid" title="Editar el precio de referencia">
                            ✏️ Precio
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards — móvil */}
          <div className="md:hidden divide-y divide-gris">
            {items.map(m => {
              const dif = difPct(m)
              const difiere = dif !== null && Math.abs(dif) > 0.1
              const editando = editId === m.id
              return (
                <div key={m.id} className={`p-3 ${!m.activo ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {m.nombre} {m.clase === 'herramienta' && '🔧'} {!m.activo && <span className="text-[9px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded">BAJA</span>}
                      </div>
                      <div className="text-[11px] text-gris-dark">{m.rubro_icono} {m.rubro} · {unidadLabel(m.unidad)}</div>
                      <AliasChips alias={m.alias} compact />
                    </div>
                    <div className="text-right shrink-0">
                      {m.precio_ref > 0 ? (
                        <>
                          <div className="font-mono font-bold">{fmtM(m.precio_ref)}</div>
                          <div className="text-[10px] text-gris-dark">act. {fmtFecha(m.precio_actualizado_en)}</div>
                        </>
                      ) : (
                        <span className="text-[10px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded">SIN PRECIO</span>
                      )}
                    </div>
                  </div>
                  {m.uc_precio && (
                    <div className="mt-1.5 text-[11px] text-gris-dark">
                      Últ. compra: <span className={`font-mono font-bold ${difiere ? 'text-[#7A5500]' : 'text-carbon'}`}>{fmtM(m.uc_precio)}</span>
                      {difiere && dif !== null && <span className="ml-1 font-bold text-[#7A5500]">({dif > 0 ? '+' : ''}{Math.round(dif * 100)}%)</span>}
                      {' '}· {m.uc_proveedor ?? 'sin proveedor'} · {fmtFecha(m.uc_fecha)} · #{m.uc_pedido}
                    </div>
                  )}
                  {puedeEditar && (
                    editando ? (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1"><InputMonto value={draft} onChange={setDraft} placeholder="0" /></div>
                        <button disabled={isPending} onClick={() => guardarPrecio(m, Number(draft))} className="text-xs font-bold px-3 py-2 rounded bg-verde-light text-verde min-h-[36px]">Guardar</button>
                        <button onClick={() => { setEditId(null); setDraft('') }} className="text-xs font-bold px-3 py-2 rounded text-gris-dark min-h-[36px]">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => abrirEdicion(m)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark min-h-[36px]">✏️ Precio</button>
                        {m.uc_precio && m.uc_precio !== m.precio_ref && (
                          <button disabled={isPending} onClick={() => guardarPrecio(m, m.uc_precio!)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul min-h-[36px]">Usar últ. compra</button>
                        )}
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-3 border-t border-gris">
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
