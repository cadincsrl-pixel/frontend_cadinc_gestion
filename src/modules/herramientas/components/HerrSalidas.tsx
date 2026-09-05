'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHerrEntregas, useHerrEntregasStats, useMarcarEntrega, useMarcarEntregasBulk, type EstadoHumano } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { useToast } from '@/components/ui/Toast'
import { Pagination } from '@/components/ui/Pagination'
import { Combobox } from '@/components/ui/Combobox'
import { HerrRetornoModal } from './HerrRetornoModal'
import { Buscador, FiltroChip, FechaFiltro, selectCls, btnMini } from './HerrFiltros'
import type { HerrEntrega, HerrEntregaEstado } from '@/types/domain.types'

/**
 * Salidas a obra — la bandeja del pañol.
 *
 * Muestra lo que salió de pedidos y es (o parece) herramienta, y los retornos.
 * Las salidas las escribe el trigger sobre `cantidad_enviada`; acá se leen, se
 * confirman o archivan (de a una o en lote) y se registra cuando vuelven al
 * pañol (20260904ay: una devolución colgada de la salida, parcial permitida).
 *
 * La lista es del SERVER (paginada, §5.7): tabs, buscador y filtros van por
 * query. El buscador tiene debounce porque es parte de la queryKey.
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

type Tab = HerrEntregaEstado | 'todas'
const TABS: { key: Tab; label: string }[] = [
  { key: 'pendiente',  label: 'Sin revisar' },
  { key: 'confirmada', label: 'Confirmadas' },
  { key: 'revisar',    label: 'A revisar' },
  { key: 'ignorada',   label: 'Archivadas' },
  { key: 'todas',      label: 'Todas' },
]

const SENTIDOS: { value: '' | 'salida' | 'devolucion'; label: string }[] = [
  { value: '',           label: 'Salidas y retornos' },
  { value: 'salida',     label: 'Solo salidas' },
  { value: 'devolucion', label: 'Solo retornos' },
]
const ORIGENES: { value: '' | HerrEntrega['origen']; label: string }[] = [
  { value: '',         label: 'Origen: todos' },
  { value: 'clase',    label: 'Tildada en el pedido' },
  { value: 'catalogo', label: 'Del catálogo' },
  { value: 'patron',   label: 'Detectada por el texto' },
  { value: 'manual',   label: 'A mano' },
]

export function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  // `fecha` es un DATE puro (YYYY-MM-DD). Construir un Date con eso lo parsea
  // como UTC y en Argentina se corre un día para atrás. Se formatea a mano.
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// Solo una salida CONFIRMADA puede volver: primero se decide si es herramienta
// (Confirmar / No es), después si volvió al pañol.
const puedeVolver = (e: HerrEntrega) =>
  e.sentido === 'salida' && e.estado === 'confirmada' && Number(e.en_obra) > 0

export function HerrSalidas() {
  const { puedeEditar } = usePermisos('herramientas')
  const toast = useToast()

  // `null` = todavía no se eligió: cae en "Sin revisar" si hay algo ahí y si
  // no en "Todas", para no aterrizar en una bandeja vacía.
  const [tabElegido, setTabElegido] = useState<Tab | null>(null)
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
  const [verAyuda, setVerAyuda] = useState(false)

  // Debounce: `busqueda` es parte de la queryKey; sin esto cada tecla dispara
  // un request y una key nueva.
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data: stats, isError: statsError } = useHerrEntregasStats()
  const tab: Tab | null = tabElegido ?? (stats ? (stats.pendientes > 0 ? 'pendiente' : 'todas') : statsError ? 'todas' : null)

  const filtro = {
    ...(tab && tab !== 'todas' ? { estado: tab } : {}),
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

  const { data, isLoading, isError, error, refetch, isFetching } = useHerrEntregas(filtro, tab !== null)
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

  // Las obras del selector vienen del BACKEND (vista agregada), no del listado
  // paginado. El conteo habla del tab que se está mirando.
  const obraOptions = useMemo(() => (stats?.obras_lista ?? []).map(o => {
    const n = tab === 'pendiente' ? o.n_pendientes : enObra ? o.n_en_obra : o.n
    return { value: o.cod, label: nombreObra(o.cod), sub: `${n} · ${o.cod}`, search: [o.cod] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stats, obraNom, tab, enObra])

  function resetPagina() { setPage(1); setSel(new Set()) }
  function cambiarTab(k: Tab) { setTabElegido(k); resetPagina() }
  function patch(fn: () => void) { fn(); resetPagina() }
  function limpiar() { setBusqueda(''); patch(() => { setObraCod(''); setSentido(''); setOrigen(''); setEnObra(false); setDesde(''); setHasta('') }) }

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
  const contadorTab = (k: Tab): number | null => k === 'pendiente' ? (stats?.pendientes ?? null) : k === 'revisar' ? (stats?.revisar ?? null) : null

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3">
      {/* Encabezado: título + contadores en una sola línea */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-bold text-carbon flex items-center gap-2">
          📤 Salidas a obra
          <button type="button" onClick={() => setVerAyuda(v => !v)} aria-expanded={verAyuda} title="Cómo funciona"
            className={`w-5 h-5 rounded-full text-[11px] font-bold leading-none transition-colors ${verAyuda ? 'bg-azul text-white' : 'bg-gris-mid/40 text-gris-dark hover:bg-azul hover:text-white'}`}>?</button>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{stats?.pendientes ?? '—'}</b><span className="text-gris-dark ml-1">sin revisar</span></span>
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{stats?.en_obra ?? '—'}</b><span className="text-gris-dark ml-1">en obra</span></span>
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{stats?.devoluciones ?? '—'}</b><span className="text-gris-dark ml-1">retornos</span></span>
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{stats?.obras ?? '—'}</b><span className="text-gris-dark ml-1">obras</span></span>
          {(stats?.revisar ?? 0) > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-amarillo-light text-[#7A5500] font-bold">{stats?.revisar} a revisar</span>
          )}
          {statsError && (
            <span className="px-2.5 py-1 rounded-lg bg-amarillo-light text-[#7A5500] font-bold" title="No se pudieron leer los contadores; la alarma de faltantes no es confiable ahora mismo">⚠ contadores no disponibles</span>
          )}
          {(stats?.faltantes ?? 0) > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-rojo text-white font-bold" title="Salieron herramientas que no quedaron registradas acá. Es un bug: avisá.">⚠ {stats?.faltantes} sin registrar</span>
          )}
          {isFetching && <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />}
        </div>
      </div>
      {verAyuda && (
        <div className="bg-azul-light/60 text-azul rounded-card px-4 py-2.5 text-xs leading-relaxed">
          Herramientas que salieron de un pedido con remito: se registran solas. El circuito es <b>Confirmar</b> (sí, es herramienta del pañol)
          o <b>No es herramienta</b> (el sistema la detectó mal); una vez confirmada, <b>Volvió al pañol</b> cuando la traen. Todavía no se dan de
          alta en el inventario. Para registrar retornos de a muchas, por obra, está la pestaña Retorno de obra.
        </div>
      )}

      {/* Tabs + filtros en una sola tarjeta */}
      <div className="bg-white rounded-card shadow-card px-3 py-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map(t => {
            const n = contadorTab(t.key)
            const activo = tab === t.key
            return (
              <button key={t.key} type="button" onClick={() => cambiarTab(t.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${activo ? 'bg-carbon text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'}`}>
                {t.label}
                {n !== null && n > 0 && <span className={`ml-1.5 px-1.5 py-px rounded-full tabular-nums ${activo ? 'bg-white/20' : t.key === 'pendiente' ? 'bg-naranja text-white' : 'bg-amarillo text-white'}`}>{n}</span>}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] text-gris-dark tabular-nums">{tab !== null && !isLoading ? `${total.toLocaleString('es-AR')} en total` : ''}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Buscador className="flex-1 min-w-[200px]" value={busqueda} onChange={setBusqueda} placeholder="Buscar por herramienta…" />
          <div className="w-full sm:w-56">
            <Combobox placeholder="Todas las obras" options={obraOptions} value={obraCod} onChange={v => patch(() => setObraCod(v))} />
          </div>
          <select value={sentido} onChange={e => patch(() => setSentido(e.target.value as typeof sentido))} className={selectCls(!!sentido)}>
            {SENTIDOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={origen} onChange={e => patch(() => setOrigen(e.target.value as typeof origen))} className={selectCls(!!origen)}>
            {ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <FechaFiltro label="Desde" value={desde} onChange={v => patch(() => setDesde(v))} />
          <FechaFiltro label="Hasta" value={hasta} onChange={v => patch(() => setHasta(v))} />
          <button type="button" onClick={() => patch(() => setEnObra(v => !v))} title="Solo salidas confirmadas que todavía no volvieron"
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors border-[1.5px] ${enObra ? 'bg-azul border-azul text-white' : 'bg-blanco border-gris-mid text-gris-dark hover:bg-gris'}`}>
            🏗 Solo en obra
          </button>
        </div>
      </div>

      {/* Resumen de filtros activos */}
      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs -mt-1">
          <span className="text-gris-dark"><b className="text-carbon tabular-nums">{total.toLocaleString('es-AR')}</b> con estos filtros</span>
          {busqueda.trim() && <FiltroChip onQuitar={() => setBusqueda('')}>“{busqueda.trim()}”</FiltroChip>}
          {obraCod && <FiltroChip onQuitar={() => patch(() => setObraCod(''))}>{nombreObra(obraCod)}</FiltroChip>}
          {sentido && <FiltroChip onQuitar={() => patch(() => setSentido(''))}>{SENTIDOS.find(s => s.value === sentido)?.label.toLowerCase()}</FiltroChip>}
          {origen && <FiltroChip onQuitar={() => patch(() => setOrigen(''))}>{ORIGENES.find(o => o.value === origen)?.label.toLowerCase()}</FiltroChip>}
          {desde && <FiltroChip onQuitar={() => patch(() => setDesde(''))}>desde {fmtFecha(desde)}</FiltroChip>}
          {hasta && <FiltroChip onQuitar={() => patch(() => setHasta(''))}>hasta {fmtFecha(hasta)}</FiltroChip>}
          {enObra && <FiltroChip onQuitar={() => patch(() => setEnObra(false))}>solo en obra</FiltroChip>}
          <button type="button" onClick={limpiar} className="text-azul font-bold hover:underline ml-1">Limpiar</button>
        </div>
      )}

      {/* Listado */}
      {isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="text-sm font-bold text-rojo">No se pudo cargar la bandeja</div>
          <div className="text-xs text-gris-dark mt-1">{(error as Error)?.message ?? 'Error desconocido'}</div>
          <button onClick={() => void refetch()} className="mt-3 text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul">Reintentar</button>
        </div>
      ) : tab === null || isLoading ? (
        <div className="flex flex-col gap-1.5" aria-busy="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="h-10 bg-white rounded-card shadow-card animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {tab === 'pendiente' && !hayFiltros
            ? <>Nada sin revisar. Cuando salga una herramienta en un remito, aparece sola acá. <button type="button" onClick={() => cambiarTab('confirmada')} className="text-azul font-bold hover:underline">Ver las confirmadas</button>.</>
            : <>Sin resultados con estos filtros.{hayFiltros && <> <button type="button" onClick={limpiar} className="text-azul font-bold hover:underline">Limpiar</button></>}</>}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gris/40 text-[10px] uppercase tracking-wide text-gris-dark">
                <th className="w-9 px-3 py-1.5">
                  <input type="checkbox" checked={todosPagina} onChange={togglePagina} disabled={seleccionables.length === 0} title="Elegir la página" aria-label="Elegir la página" />
                </th>
                <th className="text-left px-2 py-1.5 font-bold">Herramienta</th>
                <th className="text-left px-2 py-1.5 font-bold hidden sm:table-cell">Obra</th>
                <th className="text-left px-2 py-1.5 font-bold hidden sm:table-cell">Fecha · remito</th>
                <th className="text-left px-2 py-1.5 font-bold hidden lg:table-cell w-28">Origen</th>
                <th className="text-right px-3 py-1.5 font-bold whitespace-nowrap">
                  {sel.size > 0 ? <span className="normal-case tracking-normal text-azul">{sel.size} elegida{sel.size !== 1 ? 's' : ''}</span> : `${total.toLocaleString('es-AR')} en total`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gris">
              {items.map(e => {
                const esDev = e.sentido === 'devolucion'
                const enObraN = Number(e.en_obra)
                const devuelto = Number(e.devuelto)
                const anulada = e.estado === 'anulada'
                const marcada = sel.has(e.id)
                return (
                  <tr key={e.id} onClick={() => { if (!anulada) toggle(e.id) }}
                    className={`transition-colors ${anulada ? 'opacity-60' : 'cursor-pointer'} ${marcada ? 'bg-azul-light/50' : anulada ? '' : 'hover:bg-gris/20'}`}>
                    <td className="px-3 py-1.5 text-center align-top">
                      <input type="checkbox" checked={marcada} disabled={anulada} onChange={() => toggle(e.id)} onClick={ev => ev.stopPropagation()} aria-label={`Elegir ${e.descripcion}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                        <span className="font-medium text-carbon">{e.descripcion}</span>
                        {Number(e.cantidad) > 1 && <span className="text-[11px] font-mono font-bold text-azul">×{Number(e.cantidad)}</span>}
                        {esDev ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-verde-light text-verde" title={e.salida_id ? `Devuelve la salida #${e.salida_id}` : 'Devolución cargada en el pedido'}>
                            ↩ volvió{e.salida_id ? ` · salida #${e.salida_id}` : ''}
                          </span>
                        ) : e.estado === 'confirmada' ? (
                          devuelto > 0
                            ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${enObraN > 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-gris text-gris-dark'}`}>
                                {enObraN > 0 ? `en obra ×${enObraN} · volvieron ×${devuelto}` : 'toda devuelta'}
                              </span>
                            : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul">🏗 en obra</span>
                        ) : e.estado === 'pendiente' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark" title="Confirmala para poder registrar el retorno">sin revisar</span>
                        ) : e.estado === 'revisar' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5500]" title={e.nota ?? 'Marcada para revisar'}>a revisar</span>
                        ) : e.estado === 'ignorada' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gris text-gris-dark">archivada</span>
                        ) : anulada ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gris text-gris-dark">envío deshecho</span>
                        ) : null}
                      </div>
                      {e.nota && e.estado !== 'revisar' && <div className="text-[11px] text-gris-dark italic truncate max-w-md" title={e.nota}>{e.nota}</div>}
                      <div className="sm:hidden text-[11px] text-gris-dark mt-0.5">
                        <span className="font-bold text-carbon">{nombreObra(e.obra_cod)}</span> · <span className="font-mono">{fmtFecha(e.fecha)}</span>
                        {e.remito_numero && <span className="font-mono text-naranja font-bold ml-1.5">{e.remito_numero}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 hidden sm:table-cell align-top">
                      <div className="text-xs font-bold text-carbon leading-tight">{nombreObra(e.obra_cod)}</div>
                      {e.obra_cod && <div className="text-[10px] font-mono text-gris-dark">{e.obra_cod}</div>}
                    </td>
                    <td className="px-2 py-1.5 hidden sm:table-cell align-top text-[11px] text-gris-dark whitespace-nowrap">
                      <span className="font-mono text-carbon">{fmtFecha(e.fecha)}</span>
                      {e.remito_numero && <span className="font-mono text-naranja font-bold ml-1.5">{e.remito_numero}</span>}
                      {e.solicitud_id && <span className="font-mono ml-1.5">#{e.solicitud_id}</span>}
                    </td>
                    <td className="px-2 py-1.5 hidden lg:table-cell align-top">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${ORIGEN_LABEL[e.origen].cls}`} title={ORIGEN_LABEL[e.origen].title}>{ORIGEN_LABEL[e.origen].txt}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right align-top whitespace-nowrap" onClick={ev => ev.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {e.estado === 'ignorada' ? (
                          <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'pendiente', 'Vuelta a la bandeja')} className={`${btnMini} bg-gris text-gris-dark hover:bg-azul-light hover:text-azul`}>↩ Desarchivar</button>
                        ) : anulada ? null : e.estado === 'confirmada' ? (
                          <>
                            {!esDev && puedeVolver(e) && (
                              <button disabled={!puedeEditar || ocupado} onClick={() => setRetorno([e])} title="La trajeron de vuelta al pañol" className={`${btnMini} bg-azul-light text-azul hover:opacity-80`}>↩ Volvió</button>
                            )}
                            {!esDev && (
                              <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'pendiente', 'Vuelta a la bandeja')} title="Volverla a Sin revisar" className={`${btnMini} text-gris-dark hover:text-azul hover:bg-azul-light`}>↺</button>
                            )}
                          </>
                        ) : (
                          <>
                            <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'confirmada', 'Confirmada')} title="Sí, es herramienta del pañol" className={`${btnMini} bg-verde-light text-verde hover:opacity-80`}>✓ Confirmar</button>
                            <button disabled={!puedeEditar || ocupado} onClick={() => marcarUna(e, 'ignorada', 'Archivada')} title="El sistema la detectó mal: no es una herramienta del pañol" className={`${btnMini} bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo`}>No es</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total > PAGE_SIZE && (
            <div className="p-3 border-t border-gris">
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={p => { setPage(p); setSel(new Set()) }} />
            </div>
          )}
        </div>
      )}

      {/* Barra de selección: pegada abajo mientras se recorre la lista */}
      {sel.size > 0 && (
        <div className="sticky bottom-2 z-10 bg-carbon text-white rounded-card shadow-card-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold mr-1">{sel.size} elegida{sel.size !== 1 ? 's' : ''}</span>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('confirmada', 'confirmadas')} className={`${btnMini} py-1.5 bg-verde-light text-verde hover:opacity-80`} title="Sí, son herramientas del pañol">✓ Confirmar</button>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('ignorada', 'archivadas')} className={`${btnMini} py-1.5 bg-white text-gris-dark hover:bg-rojo-light hover:text-rojo`} title="El sistema las detectó mal: no son herramientas del pañol">No es herramienta</button>
          <button disabled={!puedeEditar || ocupado} onClick={() => marcarLote('pendiente', 'vueltas a la bandeja')} className={`${btnMini} py-1.5 bg-white/10 text-white hover:bg-white/20`} title="Volverlas a Sin revisar">↺ A la bandeja</button>
          <button disabled={!puedeEditar || ocupado || elegidosVolver.length === 0} onClick={() => setRetorno(elegidosVolver)} className={`${btnMini} py-1.5 bg-naranja text-white hover:bg-naranja-dark`} title="Registrar que volvieron al pañol (solo las confirmadas)">
            ↩ Volvió al pañol{elegidosVolver.length > 0 && elegidosVolver.length !== sel.size ? ` (${elegidosVolver.length})` : ''}
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-xs text-white/70 hover:text-white px-1">Quitar</button>
        </div>
      )}

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
