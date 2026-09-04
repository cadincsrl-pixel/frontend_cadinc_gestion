'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCatalogo, useCatalogoStats, useStockRubros, useUpdateStockMaterial } from '../hooks/useStock'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Pagination } from '@/components/ui/Pagination'
import { AliasChips } from './AliasChips'
import { UNIDADES } from '../constants'
import type { CatalogoMaterial, CatalogoEstadoPrecio, StockRubro } from '@/types/domain.types'

/**
 * Catálogo de precios — pestaña aparte del Stock (2026-09-04).
 *
 * El Stock es lo que hay en el depósito y arranca filtrado en "con stock";
 * acá va el catálogo ENTERO con lo que hace falta para tasar: precio de
 * referencia (final, IVA incluido), de cuándo es, y la última compra real del
 * material (precio, proveedor, fecha, pedido). Busca por nombre, sinónimos y
 * rubro sin acentos, paginado en el server.
 *
 * Los filtros de estado son la lista de trabajo: "Para tasar" (sin precio pero
 * con una compra para tomar) y "Desactualizados" (la última compra difiere del
 * precio). Se puede seleccionar de a varios y aplicarles la última compra de
 * una vez; el precio también se edita en la fila, y el trigger de la base le
 * pone la fecha.
 */

const PAGE_SIZE = 50

const ESTADOS: { key: CatalogoEstadoPrecio | ''; label: string; hint: string; stat: 'total' | 'tasar' | 'desactualizado' | 'sin_precio' }[] = [
  { key: '',               label: 'Todos',           hint: 'Todo el catálogo activo',                               stat: 'total' },
  { key: 'tasar',          label: 'Para tasar',      hint: 'Sin precio de referencia, pero con una compra para tomar', stat: 'tasar' },
  { key: 'desactualizado', label: 'Desactualizados', hint: 'La última compra difiere del precio de referencia',      stat: 'desactualizado' },
  { key: 'sin_precio',     label: 'Sin precio',      hint: 'Sin precio de referencia, con o sin compra',            stat: 'sin_precio' },
]

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

function fmtDif(p: number | null) {
  if (p === null) return null
  return `${p > 0 ? '+' : ''}${p}%`
}

export function CatalogoTab() {
  const { puedeEditar } = usePermisos('certificaciones')
  const toast = useToast()

  const [busqueda, setBusqueda] = useState('')
  const [rubroId, setRubroId]   = useState<number | ''>('')
  const [estado, setEstado]     = useState<CatalogoEstadoPrecio | ''>('')
  const [conBajas, setConBajas] = useState(false)
  const [page, setPage]         = useState(1)

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
    ...(estado ? { estado } : {}),
    ...(conBajas ? { incluir_inactivos: true } : {}),
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const { data: stats } = useCatalogoStats()
  const { data: rubros = [] } = useStockRubros()
  const { mutate: updateMat, mutateAsync: updateAsync, isPending } = useUpdateStockMaterial()

  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0

  // Edición inline del precio de referencia.
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft]   = useState('')

  // Selección múltiple: se guarda el precio de la última compra junto con el
  // id, así la selección sobrevive al cambio de página y al refetch.
  const [sel, setSel] = useState<Map<number, { nombre: string; precio: number }>>(new Map())
  const [aplicando, setAplicando] = useState(false)

  const seleccionables = useMemo(() => items.filter(m => m.uc_precio && m.uc_precio !== m.precio_ref), [items])
  const todosEnPagina  = seleccionables.length > 0 && seleccionables.every(m => sel.has(m.id))

  function toggleSel(m: CatalogoMaterial) {
    if (!m.uc_precio) return
    setSel(prev => {
      const next = new Map(prev)
      if (next.has(m.id)) next.delete(m.id)
      else next.set(m.id, { nombre: m.nombre, precio: m.uc_precio! })
      return next
    })
  }

  function togglePagina() {
    setSel(prev => {
      const next = new Map(prev)
      if (todosEnPagina) seleccionables.forEach(m => next.delete(m.id))
      else seleccionables.forEach(m => next.set(m.id, { nombre: m.nombre, precio: m.uc_precio! }))
      return next
    })
  }

  function guardarPrecio(m: CatalogoMaterial, valor: number) {
    if (!Number.isFinite(valor) || valor < 0) { toast('Ingresá un precio válido', 'err'); return }
    updateMat({ id: m.id, dto: { precio_ref: valor } }, {
      onSuccess: () => { toast(`✓ ${m.nombre}: ${fmtM(valor)}`, 'ok'); setEditId(null); setDraft('') },
      onError:   () => toast('No se pudo guardar el precio', 'err'),
    })
  }

  // Aplica la última compra a todos los seleccionados, uno por uno (el PATCH
  // es por material). Si alguno falla, sigue con el resto y lo cuenta.
  async function aplicarSeleccion() {
    if (sel.size === 0) return
    setAplicando(true)
    let ok = 0, fallidos = 0
    for (const [id, { precio }] of sel) {
      try { await updateAsync({ id, dto: { precio_ref: precio } }); ok++ }
      catch { fallidos++ }
    }
    setAplicando(false)
    setSel(new Map())
    toast(fallidos === 0 ? `✓ ${ok} precio${ok !== 1 ? 's' : ''} actualizado${ok !== 1 ? 's' : ''}` : `${ok} actualizados, ${fallidos} fallaron`, fallidos === 0 ? 'ok' : 'err')
  }

  function abrirEdicion(m: CatalogoMaterial) {
    setEditId(m.id)
    setDraft(m.precio_ref > 0 ? String(m.precio_ref) : '')
  }

  const unidadLabel = (u: string) => UNIDADES.find(x => x.value === u)?.label ?? u
  const ocupado = isPending || aplicando

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
            <input type="checkbox" checked={conBajas} onChange={e => { setConBajas(e.target.checked); setPage(1) }} />
            Incluir dados de baja
          </label>
        </div>

        {/* Estado del precio: la lista de trabajo */}
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map(e => {
            const activo = estado === e.key
            const n = stats?.[e.stat]
            return (
              <button
                key={e.key || 'todos'}
                type="button"
                title={e.hint}
                onClick={() => { setEstado(e.key); setPage(1) }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activo ? 'bg-azul text-white border-azul' : 'bg-white text-gris-dark border-gris-mid hover:bg-gris/40'}`}
              >
                {e.label}{n !== undefined && <span className={`ml-1.5 font-mono ${activo ? 'text-white/80' : 'text-gris-dark/70'}`}>{n}</span>}
              </button>
            )
          })}
        </div>

        <div className="text-xs text-gris-dark">
          <span className="font-mono font-bold">{total}</span> materiales
          {busquedaAplicada && <> para «{busquedaAplicada}»</>}
          <span className="ml-3">Precios finales, IVA incluido. «Últ. compra» es el último renglón comprado por el sistema, no el proveedor de la ficha.</span>
        </div>
      </div>

      {/* Barra de selección */}
      {puedeEditar && sel.size > 0 && (
        <div className="bg-azul-light rounded-card p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-mono font-bold">{sel.size}</span> seleccionado{sel.size !== 1 ? 's' : ''} · se les pone como precio de referencia el de su última compra
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSel(new Map())} disabled={ocupado} className="text-xs font-bold px-3 py-1.5 rounded bg-white text-gris-dark hover:bg-gris/40 min-h-[36px]">Limpiar</button>
            <button onClick={aplicarSeleccion} disabled={ocupado} className="text-xs font-bold px-3 py-1.5 rounded bg-azul text-white hover:opacity-90 min-h-[36px]">
              {aplicando ? 'Aplicando…' : `Aplicar última compra (${sel.size})`}
            </button>
          </div>
        </div>
      )}

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
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr>
                  {puedeEditar && (
                    <th className="bg-gris px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={todosEnPagina}
                        disabled={seleccionables.length === 0}
                        onChange={togglePagina}
                        title="Seleccionar los de esta página que tienen una última compra distinta al precio"
                      />
                    </th>
                  )}
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
                  const difiere = m.dif_pct !== null && Math.abs(m.dif_pct) > 10
                  const editando = editId === m.id
                  const seleccionable = !!m.uc_precio && m.uc_precio !== m.precio_ref
                  return (
                    <tr key={m.id} className={`border-t border-gris ${!m.activo ? 'opacity-60' : ''} ${sel.has(m.id) ? 'bg-azul-light/40' : ''}`}>
                      {puedeEditar && (
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={sel.has(m.id)} disabled={!seleccionable} onChange={() => toggleSel(m)} />
                        </td>
                      )}
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
                            <button disabled={ocupado} onClick={() => guardarPrecio(m, Number(draft))} className="text-xs font-bold px-2 py-1.5 rounded bg-verde-light text-verde hover:opacity-80">✓</button>
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
                              {difiere && (
                                <span className="text-[9px] font-bold bg-amarillo-light text-[#7A5500] px-1.5 py-0.5 rounded" title="La última compra difiere más de 10% del precio de referencia">
                                  {fmtDif(m.dif_pct)}
                                </span>
                              )}
                              {puedeEditar && !editando && seleccionable && (
                                <button
                                  disabled={ocupado}
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
              const difiere = m.dif_pct !== null && Math.abs(m.dif_pct) > 10
              const editando = editId === m.id
              const seleccionable = !!m.uc_precio && m.uc_precio !== m.precio_ref
              return (
                <div key={m.id} className={`p-3 ${!m.activo ? 'opacity-60' : ''} ${sel.has(m.id) ? 'bg-azul-light/40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {puedeEditar && seleccionable && (
                        <input type="checkbox" className="mt-1" checked={sel.has(m.id)} onChange={() => toggleSel(m)} />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {m.nombre} {m.clase === 'herramienta' && '🔧'} {!m.activo && <span className="text-[9px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded">BAJA</span>}
                        </div>
                        <div className="text-[11px] text-gris-dark">{m.rubro_icono} {m.rubro} · {unidadLabel(m.unidad)}</div>
                        <AliasChips alias={m.alias} compact />
                      </div>
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
                      {difiere && <span className="ml-1 font-bold text-[#7A5500]">({fmtDif(m.dif_pct)})</span>}
                      {' '}· {m.uc_proveedor ?? 'sin proveedor'} · {fmtFecha(m.uc_fecha)} · #{m.uc_pedido}
                    </div>
                  )}
                  {puedeEditar && (
                    editando ? (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1"><InputMonto value={draft} onChange={setDraft} placeholder="0" /></div>
                        <button disabled={ocupado} onClick={() => guardarPrecio(m, Number(draft))} className="text-xs font-bold px-3 py-2 rounded bg-verde-light text-verde min-h-[36px]">Guardar</button>
                        <button onClick={() => { setEditId(null); setDraft('') }} className="text-xs font-bold px-3 py-2 rounded text-gris-dark min-h-[36px]">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => abrirEdicion(m)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark min-h-[36px]">✏️ Precio</button>
                        {seleccionable && (
                          <button disabled={ocupado} onClick={() => guardarPrecio(m, m.uc_precio!)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul min-h-[36px]">Usar últ. compra</button>
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
