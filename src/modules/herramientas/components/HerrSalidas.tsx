'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHerrEntregas, useHerrEntregasStats, useMarcarEntrega, useMarcarEntregasBulk, type EstadoHumano } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Pagination } from '@/components/ui/Pagination'
import { Input } from '@/components/ui/Input'
import { HerrRetornoModal } from './HerrRetornoModal'
import type { HerrEntrega, HerrEntregaEstado } from '@/types/domain.types'

/**
 * Salidas a obra — la bandeja del pañol.
 *
 * Muestra lo que salió de pedidos y es (o parece) herramienta, y los retornos.
 * Las salidas las escribe el trigger sobre `cantidad_enviada`; acá se leen, se
 * confirman o archivan (de a una o en lote) y se registra cuando vuelven al
 * pañol (20260904ay: una devolución colgada de la salida, parcial permitida).
 *
 * FASE 1 NO TOCA EL PADRÓN a propósito: vincular a un HER-NNN existente o dar
 * de alta es decisión de un humano, y va en fase 2.
 */

const PAGE_SIZE = 25

export const ORIGEN_LABEL: Record<HerrEntrega['origen'], { txt: string; cls: string; title: string }> = {
  clase:    { txt: '✓ tildada',   cls: 'bg-verde-light text-verde',        title: 'Se cargó marcada como herramienta en el pedido' },
  catalogo: { txt: '📕 catálogo', cls: 'bg-azul-light text-azul',          title: 'El material del catálogo está marcado como herramienta' },
  patron:   { txt: '🔍 detectada', cls: 'bg-amarillo-light text-[#7A5500]', title: 'La detectó el texto de la descripción, nadie la tildó' },
  manual:   { txt: '✍ a mano',    cls: 'bg-gris text-gris-dark',           title: 'Cargada a mano' },
}

const TABS: { key: HerrEntregaEstado | 'todas'; label: string }[] = [
  { key: 'pendiente',  label: 'Sin revisar' },
  { key: 'confirmada', label: 'Confirmadas' },
  { key: 'revisar',    label: 'A revisar' },
  { key: 'ignorada',   label: 'Archivadas' },
  { key: 'todas',      label: 'Todas' },
]

export function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  // `fecha` es un DATE puro (YYYY-MM-DD). Construir un Date con eso lo parsea
  // como UTC y en Argentina se corre un día para atrás. Se formatea a mano.
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const puedeVolver = (e: HerrEntrega) =>
  e.sentido === 'salida' && ['pendiente', 'confirmada', 'revisar'].includes(e.estado) && Number(e.en_obra) > 0

export function HerrSalidas() {
  const { puedeEditar } = usePermisos('herramientas')
  const toast = useToast()

  const [tab, setTab]           = useState<HerrEntregaEstado | 'todas'>('pendiente')
  const [obraCod, setObraCod]   = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [sentido, setSentido]   = useState<'' | 'salida' | 'devolucion'>('')
  const [origen, setOrigen]     = useState<'' | HerrEntrega['origen']>('')
  const [enObra, setEnObra]     = useState(false)
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [page, setPage]         = useState(1)
  const [sel, setSel]           = useState<Set<number>>(new Set())
  const [retorno, setRetorno]   = useState<HerrEntrega[] | null>(null)

  // Debounce: `busqueda` es parte de la queryKey; sin esto cada tecla dispara
  // un request y una key nueva.
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtro = {
    ...(tab !== 'todas' ? { estado: tab } : {}),
    ...(obraCod ? { obra_cod: obraCod } : {}),
    ...(busquedaAplicada ? { q: busquedaAplicada } : {}),
    ...(sentido ? { sentido } : {}),
    ...(origen ? { origen } : {}),
    ...(enObra ? { en_obra: true } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useHerrEntregas(filtro)
  const { data: stats, isError: statsError } = useHerrEntregasStats()
  const { data: obras = [] } = useObras()
  const { mutate: marcar, isPending } = useMarcarEntrega()
  const { mutate: marcarBulk, isPending: bulkPending } = useMarcarEntregasBulk()

  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0

  const obraNom = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])
  const nombreObra = (cod: string | null) => (cod ? (obraNom.get(cod) ?? cod) : 'sin obra')

  // Las obras del selector vienen del BACKEND (vista agregada), no del listado paginado.
  const obrasConSalidas = stats?.obras_lista ?? []

  function resetPagina() { setPage(1); setSel(new Set()) }
  function cambiarTab(k: HerrEntregaEstado | 'todas') { setTab(k); resetPagina() }
  function patch(fn: () => void) { fn(); resetPagina() }

  // ── Selección múltiple ──────────────────────────────────────────────────
  const seleccionables = useMemo(() => items.filter(e => e.estado !== 'anulada'), [items])
  const todosPagina = seleccionables.length > 0 && seleccionables.every(e => sel.has(e.id))
  const elegidos = useMemo(() => items.filter(e => sel.has(e.id)), [items, sel])
  const elegidosVolver = elegidos.filter(puedeVolver)

  function toggle(id: number) {
    setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function togglePagina() {
    setSel(prev => {
      const n = new Set(prev)
      if (todosPagina) seleccionables.forEach(e => n.delete(e.id)); else seleccionables.forEach(e => n.add(e.id))
      return n
    })
  }

  function marcarLote(estado: EstadoHumano, label: string) {
    const ids = elegidos.filter(e => e.estado !== 'anulada' && e.estado !== estado).map(e => e.id)
    if (ids.length === 0) { toast('Nada para cambiar en la selección', 'err'); return }
    marcarBulk({ ids, estado }, {
      onSuccess: (r) => { toast(`✓ ${r.actualizadas} ${label}`, 'ok'); setSel(new Set()); if (items.length === ids.length && page > 1) setPage(p => p - 1) },
      onError:   (err: unknown) => toast((err as Error).message || 'Error', 'err'),
    })
  }

  // ── Acciones de a una ───────────────────────────────────────────────────
  function marcarUna(e: HerrEntrega, estado: EstadoHumano, label: string) {
    // Si era la última fila de la página, hay que retroceder: si no, la request
    // siguiente pide un offset que ya no existe y la lista se ve vacía.
    const eraLaUltima = items.length === 1 && page > 1
    marcar({ id: e.id, estado }, {
      onSuccess: () => { if (eraLaUltima) setPage(p => p - 1); toast(label, 'ok') },
      onError:   (err: unknown) => toast((err as Error).message || 'Error', 'err'),
    })
  }

  const hayFiltros = !!(obraCod || busqueda || sentido || origen || enObra || desde || hasta)
  const ocupado = isPending || bulkPending

  const btn = (extra: string) => `text-xs font-bold px-3 py-1.5 rounded transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed ${extra}`

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-carbon">📤 Salidas a obra</h1>
        <p className="text-xs text-gris-dark mt-1 max-w-2xl">
          Herramientas que salieron de un pedido con remito y las que volvieron al pañol. Las salidas se registran solas;
          el retorno se marca acá o en <b>Retorno de obra</b>. Todavía <b>no se dan de alta en el inventario</b>.
        </p>
      </div>

      {/* Contadores */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.pendientes ?? '—'}</b><span className="text-gris-dark ml-1">sin revisar</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.en_obra ?? '—'}</b><span className="text-gris-dark ml-1">en obra</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.devoluciones ?? '—'}</b><span className="text-gris-dark ml-1">retornos</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.obras ?? '—'}</b><span className="text-gris-dark ml-1">obras</span></span>
        {(stats?.revisar ?? 0) > 0 && (
          <span className="px-3 py-1.5 rounded-lg bg-amarillo-light text-[#7A5500] text-xs font-bold">{stats?.revisar} a revisar</span>
        )}
        {statsError && (
          <span className="px-3 py-1.5 rounded-lg bg-amarillo-light text-[#7A5500] text-xs font-bold" title="No se pudieron leer los contadores; la alarma de faltantes no es confiable ahora mismo">⚠ contadores no disponibles</span>
        )}
        {(stats?.faltantes ?? 0) > 0 && (
          <span className="px-3 py-1.5 rounded-lg bg-rojo text-white text-xs font-bold" title="Salieron herramientas que no quedaron registradas acá. Es un bug: avisá.">⚠ {stats?.faltantes} sin registrar</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => cambiarTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === t.key ? 'bg-carbon text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <Input placeholder="Buscar por herramienta…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <select value={obraCod} onChange={e => patch(() => setObraCod(e.target.value))}
            className="px-3 py-2 text-sm border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white sm:w-72">
            <option value="">Todas las obras</option>
            {obrasConSalidas.map(o => {
              // El conteo habla del tab que se está mirando.
              const n = tab === 'pendiente' ? o.n_pendientes : enObra ? o.n_en_obra : o.n
              return <option key={o.cod} value={o.cod}>{nombreObra(o.cod)} ({n})</option>
            })}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={sentido} onChange={e => patch(() => setSentido(e.target.value as typeof sentido))}
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg bg-white outline-none focus:border-naranja min-h-[34px]">
            <option value="">Salidas y retornos</option>
            <option value="salida">Solo salidas</option>
            <option value="devolucion">Solo retornos</option>
          </select>
          <select value={origen} onChange={e => patch(() => setOrigen(e.target.value as typeof origen))}
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg bg-white outline-none focus:border-naranja min-h-[34px]">
            <option value="">Origen: todos</option>
            <option value="clase">Tildada en el pedido</option>
            <option value="catalogo">Del catálogo</option>
            <option value="patron">Detectada por el texto</option>
            <option value="manual">A mano</option>
          </select>
          <label className="flex items-center gap-1 text-gris-dark">Desde
            <input type="date" value={desde} onChange={e => patch(() => setDesde(e.target.value))}
              className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1 bg-white outline-none focus:border-naranja min-h-[34px] text-carbon" />
          </label>
          <label className="flex items-center gap-1 text-gris-dark">Hasta
            <input type="date" value={hasta} onChange={e => patch(() => setHasta(e.target.value))}
              className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1 bg-white outline-none focus:border-naranja min-h-[34px] text-carbon" />
          </label>
          <button type="button" onClick={() => patch(() => setEnObra(v => !v))}
            className={`px-3 py-1.5 rounded-lg font-bold min-h-[34px] transition-colors ${enObra ? 'bg-azul text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'}`}
            title="Solo salidas que todavía no volvieron">
            🏗 Solo en obra
          </button>
          {hayFiltros && (
            <button type="button" className="text-azul font-bold hover:underline"
              onClick={() => { setBusqueda(''); patch(() => { setObraCod(''); setSentido(''); setOrigen(''); setEnObra(false); setDesde(''); setHasta('') }) }}>
              Limpiar filtros
            </button>
          )}
          {isFetching && <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin ml-auto" />}
        </div>
      </div>

      {/* Barra de selección */}
      {sel.size > 0 && (
        <div className="bg-carbon text-white rounded-card px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold mr-2">{sel.size} elegida{sel.size !== 1 ? 's' : ''}</span>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('confirmada', 'confirmadas')} className={btn('bg-verde-light text-verde hover:opacity-80')} title="Sí, son herramientas del pañol y ya las vi">✓ Ya está</button>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('ignorada', 'archivadas')} className={btn('bg-white text-gris-dark hover:bg-rojo-light hover:text-rojo')} title="No son herramientas del pañol">No es</button>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('pendiente', 'vueltas a la bandeja')} className={btn('bg-white/10 text-white hover:bg-white/20')} title="Volverlas a Sin revisar">↺ A la bandeja</button>
          <button disabled={!puedeEditar || ocupado || elegidosVolver.length === 0} onClick={() => setRetorno(elegidosVolver)} className={btn('bg-azul-light text-azul hover:opacity-80')} title="Registrar que volvieron al pañol">
            ↩ Volvió al pañol{elegidosVolver.length > 0 && elegidosVolver.length !== sel.size ? ` (${elegidosVolver.length})` : ''}
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-xs text-white/70 hover:text-white">Quitar selección</button>
        </div>
      )}

      {/* Listado */}
      {isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="text-sm font-bold text-rojo">No se pudo cargar la bandeja</div>
          <div className="text-xs text-gris-dark mt-1">{(error as Error)?.message ?? 'Error desconocido'}</div>
          <button onClick={() => void refetch()} className="mt-3 text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul min-h-[36px]">Reintentar</button>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {tab === 'pendiente' && !hayFiltros ? 'Nada sin revisar. Cuando salga una herramienta en un remito, aparece sola acá.' : 'Sin resultados con estos filtros.'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gris bg-gris/40 text-xs text-gris-dark">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={todosPagina} onChange={togglePagina} disabled={seleccionables.length === 0} />
              Elegir la página ({seleccionables.length})
            </label>
            <span className="ml-auto">{total.toLocaleString('es-AR')} en total</span>
          </div>
          <div className="divide-y divide-gris">
            {items.map(e => {
              const esDev = e.sentido === 'devolucion'
              const enObraN = Number(e.en_obra)
              const devuelto = Number(e.devuelto)
              return (
                <div key={e.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 ${sel.has(e.id) ? 'bg-azul-light/30' : ''}`}>
                  <input type="checkbox" className="mt-1" checked={sel.has(e.id)} disabled={e.estado === 'anulada'} onChange={() => toggle(e.id)} />
                  <div className="flex-1 min-w-[12rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-carbon">{e.descripcion}</span>
                      {Number(e.cantidad) > 1 && <span className="text-[11px] font-mono font-bold text-azul">×{Number(e.cantidad)}</span>}
                      {esDev ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-verde-light text-verde" title={e.salida_id ? `Devuelve la salida #${e.salida_id}` : 'Devolución cargada en el pedido'}>
                          ↩ volvió al pañol{e.salida_id ? ` · salida #${e.salida_id}` : ''}
                        </span>
                      ) : e.estado !== 'anulada' && e.estado !== 'ignorada' && (
                        devuelto > 0
                          ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${enObraN > 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-gris text-gris-dark'}`}>
                              {enObraN > 0 ? `en obra ×${enObraN} · devuelto ×${devuelto}` : 'toda devuelta'}
                            </span>
                          : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul">🏗 en obra</span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ORIGEN_LABEL[e.origen].cls}`} title={ORIGEN_LABEL[e.origen].title}>{ORIGEN_LABEL[e.origen].txt}</span>
                    </div>
                    <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-carbon">{nombreObra(e.obra_cod)}</span>
                      <span>·</span><span className="font-mono">{fmtFecha(e.fecha)}</span>
                      {e.remito_numero && <><span>·</span><span className="font-mono text-naranja font-bold">{e.remito_numero}</span></>}
                      {e.solicitud_id && <><span>·</span><span className="font-mono">pedido #{e.solicitud_id}</span></>}
                      {e.nota && <span className="italic">· {e.nota}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {e.estado === 'ignorada' ? (
                      <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'pendiente', 'Vuelta a la bandeja')} className={btn('bg-gris text-gris-dark hover:bg-azul-light hover:text-azul')}>↩ Desarchivar</button>
                    ) : e.estado === 'anulada' ? (
                      <span className="text-[11px] text-gris-dark italic">envío deshecho</span>
                    ) : e.estado === 'confirmada' ? (
                      <>
                        <span className="text-[11px] font-bold text-verde">✓ confirmada</span>
                        {!esDev && puedeVolver(e) && (
                          <button disabled={!puedeEditar || ocupado} onClick={() => setRetorno([e])} title="Volvió al pañol" className={btn('bg-azul-light text-azul hover:opacity-80')}>↩ Volvió</button>
                        )}
                        <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'pendiente', 'Vuelta a la bandeja')} title="Volverla a la bandeja" className={btn('text-gris-dark hover:text-azul hover:bg-azul-light')}>↺</button>
                      </>
                    ) : (
                      <>
                        <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'confirmada', 'Confirmada')} title="Sí, es herramienta del pañol y ya la vi" className={btn('bg-verde-light text-verde hover:opacity-80')}>✓ Ya está</button>
                        {!esDev && puedeVolver(e) && (
                          <button disabled={!puedeEditar || ocupado} onClick={() => setRetorno([e])} title="Volvió al pañol" className={btn('bg-azul-light text-azul hover:opacity-80')}>↩ Volvió</button>
                        )}
                        <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'ignorada', 'Archivada')} title="Sacarla de la bandeja: esto no es una herramienta del pañol" className={btn('bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo')}>No es</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => { setPage(p); setSel(new Set()) }} />

      <HerrRetornoModal
        open={retorno !== null}
        onClose={() => setRetorno(null)}
        salidas={retorno ?? []}
        obraNom={nombreObra}
        onListo={() => setSel(new Set())}
      />
    </div>
  )
}
