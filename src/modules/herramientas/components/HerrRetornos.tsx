'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHerrEntregas, useHerrEntregasStats, fetchHerrEntregasTodas, ENTREGAS_KEY } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { Pagination } from '@/components/ui/Pagination'
import { Combobox } from '@/components/ui/Combobox'
import { matchesSearch, normalizeText } from '@/lib/utils/text'
import { HerrRetornoModal } from './HerrRetornoModal'
import { ORIGEN_LABEL, fmtFecha } from './HerrSalidas'
import type { HerrEntrega } from '@/types/domain.types'

/**
 * Retorno de obra: una barra por obra con las herramientas que todavía tiene
 * (salidas confirmadas sin devolver). Se abre, se eligen las que volvieron y
 * se registra el retorno (parcial permitido). Abajo, plegado, el historial.
 *
 * Las salidas en obra se traen TODAS de a 200 una sola vez (~500 filas, lejos
 * del techo de 1000, §5.7) y el buscador y los filtros corren en el cliente:
 * así buscar por herramienta, obra, remito o pedido es instantáneo y no
 * dispara una request por tecla. El historial de retornos sí es del server
 * (paginado) y recibe la búsqueda y la obra por query.
 */

const PAGE_SIZE = 25

const ANTIGUEDAD: { value: string; label: string }[] = [
  { value: '',    label: 'Salieron cuando sea' },
  { value: '30',  label: 'Hace más de 30 días' },
  { value: '90',  label: 'Hace más de 90 días' },
  { value: '180', label: 'Hace más de 6 meses' },
]

interface GrupoObra {
  cod:      string
  items:    HerrEntrega[]
  unidades: number
  ultima:   string
}

// `fecha` es un DATE puro: se arma en hora local para no correrse un día.
function diasEnObra(fecha: string): number {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const t = new Date(a, m - 1, d).getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

// La nota del renglón menos la marca administrativa de la confirmación en
// bloque (20260905q), que repetida en 500 filas es ruido.
function notaVisible(nota: string | null): string {
  if (!nota) return ''
  return nota.replace(/(?:\s*·\s*)?Confirmada en bloque el [^.]*\./g, '').replace(/^\s*·\s*/, '').trim()
}

export function HerrRetornos() {
  const { puedeEditar } = usePermisos('herramientas')

  const [busqueda, setBusqueda]     = useState('')
  const [obraCod, setObraCod]       = useState('')
  const [antiguedad, setAntiguedad] = useState('')
  const [abiertas, setAbiertas]     = useState<Set<string>>(new Set())
  const [sel, setSel]               = useState<Set<number>>(new Set())
  const [retorno, setRetorno]       = useState<HerrEntrega[] | null>(null)
  const [verAyuda, setVerAyuda]     = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [pageRet, setPageRet]       = useState(1)

  // Para el historial (server) la búsqueda va con debounce; el acordeón filtra en vivo.
  const [busquedaServer, setBusquedaServer] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaServer(busqueda.trim()); setPageRet(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])
  useEffect(() => { setPageRet(1) }, [obraCod])

  const { data: enObra = [], isLoading: cargandoEnObra, isFetching, isError, error, refetch } = useQuery({
    queryKey: [...ENTREGAS_KEY, 'en-obra-todas'],
    queryFn:  () => fetchHerrEntregasTodas({ en_obra: true }),
    staleTime: 60_000,
  })
  const { data: retornos, isLoading: cargandoRet } = useHerrEntregas({
    ...(busquedaServer ? { q: busquedaServer } : {}),
    ...(obraCod ? { obra_cod: obraCod } : {}),
    sentido: 'devolucion', estados: 'confirmada,pendiente,revisar', limit: PAGE_SIZE, offset: (pageRet - 1) * PAGE_SIZE,
  }, verHistorial)
  const { data: stats } = useHerrEntregasStats()
  const { data: obras = [] } = useObras()

  const obraNom = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])
  const nombreObra = (cod: string | null) => (cod ? (obraNom.get(cod) ?? cod) : 'sin obra')

  // ── Filtros (cliente) ───────────────────────────────────────────────────
  const nq = normalizeText(busqueda)
  const minDias = antiguedad ? Number(antiguedad) : 0
  const hayFiltro = !!(nq || obraCod || minDias)

  const filtradas = useMemo(() => enObra.filter(e => {
    if (obraCod && e.obra_cod !== obraCod) return false
    if (minDias && diasEnObra(e.fecha) < minDias) return false
    // Por palabras y sin importar el orden: "amoladora 7" encuentra 'Amoladora angular 7"'.
    if (nq && !matchesSearch(`${e.descripcion} ${nombreObra(e.obra_cod)} ${e.obra_cod ?? ''} ${e.remito_numero ?? ''} ${e.solicitud_id ? `#${e.solicitud_id}` : ''}`, busqueda)) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [enObra, obraCod, minDias, nq, obraNom])

  function agrupar(lista: HerrEntrega[]): GrupoObra[] {
    const m = new Map<string, GrupoObra>()
    for (const e of lista) {
      const cod = e.obra_cod ?? ''
      let g = m.get(cod)
      if (!g) { g = { cod, items: [], unidades: 0, ultima: e.fecha }; m.set(cod, g) }
      g.items.push(e)
      g.unidades += Number(e.en_obra)
      if (e.fecha > g.ultima) g.ultima = e.fecha
    }
    for (const g of m.values()) g.items.sort((a, b) => a.descripcion.localeCompare(b.descripcion) || (a.fecha < b.fecha ? 1 : -1))
    return [...m.values()].sort((a, b) => b.items.length - a.items.length || nombreObra(a.cod).localeCompare(nombreObra(b.cod)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gruposTodos = useMemo(() => agrupar(enObra), [enObra, obraNom])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grupos = useMemo(() => hayFiltro ? agrupar(filtradas) : gruposTodos, [filtradas, gruposTodos, hayFiltro, obraNom])
  const totalObra = useMemo(() => new Map(gruposTodos.map(g => [g.cod, g.items.length])), [gruposTodos])

  const obraOptions = useMemo(() => gruposTodos.map(g => ({
    value: g.cod, label: nombreObra(g.cod), sub: `${g.items.length} herramienta${g.items.length === 1 ? '' : 's'} · ${g.cod}`, search: [g.cod],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [gruposTodos, obraNom])

  // Con filtros, las barras que quedan se abren solas (y un click las cierra);
  // sin filtros, cerradas hasta que se abren a mano.
  useEffect(() => { setAbiertas(new Set()) }, [nq, obraCod, minDias])
  const abiertaEfectiva = (cod: string) => hayFiltro ? !abiertas.has(cod) : abiertas.has(cod)
  function toggleObra(cod: string) {
    setAbiertas(prev => { const n = new Set(prev); if (n.has(cod)) n.delete(cod); else n.add(cod); return n })
  }
  const abrirTodas  = () => setAbiertas(hayFiltro ? new Set() : new Set(grupos.map(g => g.cod)))
  const cerrarTodas = () => setAbiertas(hayFiltro ? new Set(grupos.map(g => g.cod)) : new Set())
  const nAbiertas = grupos.filter(g => abiertaEfectiva(g.cod)).length

  function limpiar() { setBusqueda(''); setObraCod(''); setAntiguedad('') }

  // ── Selección ───────────────────────────────────────────────────────────
  const elegidos = useMemo(() => enObra.filter(e => sel.has(e.id)), [enObra, sel])
  const obrasElegidas = useMemo(() => new Set(elegidos.map(e => e.obra_cod)).size, [elegidos])
  function toggle(id: number) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function toggleObraEntera(g: GrupoObra) {
    const todas = g.items.every(e => sel.has(e.id))
    setSel(prev => { const n = new Set(prev); g.items.forEach(e => todas ? n.delete(e.id) : n.add(e.id)); return n })
  }

  const itemsRet = useMemo(() => retornos?.items ?? [], [retornos])
  const btnMini = 'text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="p-4 md:p-6 flex flex-col gap-3">
      {/* Encabezado: título + contadores en una sola línea */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-bold text-carbon flex items-center gap-2">
          ↩ Retorno de obra
          <button type="button" onClick={() => setVerAyuda(v => !v)} aria-expanded={verAyuda} title="Cómo funciona"
            className={`w-5 h-5 rounded-full text-[11px] font-bold leading-none transition-colors ${verAyuda ? 'bg-azul text-white' : 'bg-gris-mid/40 text-gris-dark hover:bg-azul hover:text-white'}`}>?</button>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{enObra.length}</b><span className="text-gris-dark ml-1">en obra</span></span>
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{gruposTodos.length}</b><span className="text-gris-dark ml-1">obras</span></span>
          <span className="px-2.5 py-1 rounded-lg bg-white shadow-card"><b className="text-carbon tabular-nums">{stats?.devoluciones ?? '—'}</b><span className="text-gris-dark ml-1">retornos</span></span>
          {(stats?.pendientes ?? 0) > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-naranja-light text-naranja-dark font-bold" title="Hasta que se confirmen en Salidas a obra no aparecen acá">
              {stats?.pendientes} sin revisar en Salidas
            </span>
          )}
          {isFetching && <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />}
        </div>
      </div>
      {verAyuda && (
        <div className="bg-azul-light/60 text-azul rounded-card px-4 py-2.5 text-xs leading-relaxed">
          Cada barra es una obra con las herramientas que todavía tiene (salidas <b>confirmadas</b> sin devolver). Abrila, tildá las que
          volvieron y tocá <b>Registrar retorno</b>: podés elegir de varias obras a la vez. Si volvió una parte, en la ventana bajá la cantidad.
          Lo que está <b>sin revisar</b> se confirma primero en Salidas a obra.
        </div>
      )}

      {/* Barra de herramientas: buscador + obra + antigüedad + abrir/cerrar */}
      <div className="bg-white rounded-card shadow-card px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
          <input
            type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setBusqueda('') }}
            placeholder="Herramienta, obra, remito o pedido…"
            autoComplete="off" data-1p-ignore data-lpignore="true"
            className="w-full pl-9 pr-8 py-2 text-sm border-[1.5px] border-gris-mid rounded-lg bg-blanco text-carbon placeholder:text-gris-mid outline-none transition-colors focus:border-naranja focus:bg-white [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[11px] text-gris-dark hover:bg-gris hover:text-carbon">✕</button>
          )}
        </div>
        <div className="w-full sm:w-64">
          <Combobox placeholder="Todas las obras" options={obraOptions} value={obraCod} onChange={setObraCod} />
        </div>
        <select value={antiguedad} onChange={e => setAntiguedad(e.target.value)} title="Filtrar por cuánto hace que salieron"
          className={`px-2.5 py-2 text-sm border-[1.5px] rounded-lg bg-blanco outline-none focus:border-naranja cursor-pointer ${antiguedad ? 'border-azul text-azul font-bold' : 'border-gris-mid text-carbon'}`}>
          {ANTIGUEDAD.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={abrirTodas} disabled={grupos.length === 0 || nAbiertas === grupos.length} title="Abrir todas las obras"
            className={`${btnMini} bg-gris text-gris-dark hover:bg-gris-mid`}>Abrir todas</button>
          <button type="button" onClick={cerrarTodas} disabled={nAbiertas === 0} title="Cerrar todas las obras"
            className={`${btnMini} bg-gris text-gris-dark hover:bg-gris-mid`}>Cerrar todas</button>
        </div>
      </div>

      {/* Resumen de filtros activos */}
      {hayFiltro && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs -mt-1">
          <span className="text-gris-dark">
            <b className="text-carbon tabular-nums">{filtradas.length}</b> de {enObra.length} herramientas en <b className="text-carbon tabular-nums">{grupos.length}</b> obra{grupos.length === 1 ? '' : 's'}
          </span>
          {nq && <FiltroChip onQuitar={() => setBusqueda('')}>“{busqueda.trim()}”</FiltroChip>}
          {obraCod && <FiltroChip onQuitar={() => setObraCod('')}>{nombreObra(obraCod)}</FiltroChip>}
          {minDias > 0 && <FiltroChip onQuitar={() => setAntiguedad('')}>{ANTIGUEDAD.find(a => a.value === antiguedad)?.label.toLowerCase()}</FiltroChip>}
          <button type="button" onClick={limpiar} className="text-azul font-bold hover:underline ml-1">Limpiar</button>
        </div>
      )}

      {/* Acordeón por obra */}
      {isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="text-sm font-bold text-rojo">No se pudo cargar lo que hay en obra</div>
          <div className="text-xs text-gris-dark mt-1">{(error as Error)?.message ?? 'Error desconocido'}</div>
          <button onClick={() => void refetch()} className="mt-3 text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul">Reintentar</button>
        </div>
      ) : cargandoEnObra ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-11 bg-white rounded-card shadow-card animate-pulse" />)}
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
          {hayFiltro
            ? <>Nada en obra con esos filtros. <button type="button" onClick={limpiar} className="text-azul font-bold hover:underline">Limpiar</button></>
            : <span className="italic">No hay herramientas confirmadas en obra. Lo que está sin revisar se confirma en Salidas a obra.</span>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {grupos.map(g => {
            const abierta = abiertaEfectiva(g.cod)
            const nSel = g.items.filter(e => sel.has(e.id)).length
            const todas = nSel === g.items.length
            const total = totalObra.get(g.cod) ?? g.items.length
            return (
              <div key={g.cod} className="bg-white rounded-card shadow-card overflow-hidden">
                <button type="button" onClick={() => toggleObra(g.cod)} aria-expanded={abierta}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gris/30 ${abierta ? 'border-b border-gris' : ''}`}>
                  <span className={`text-[10px] text-gris-dark transition-transform ${abierta ? 'rotate-90' : ''}`}>▶</span>
                  <span className="text-sm font-bold text-carbon truncate">{nombreObra(g.cod)}</span>
                  <span className="hidden sm:inline text-[10px] font-mono text-gris-dark">{g.cod}</span>
                  <span className="ml-auto flex items-center gap-2 text-[11px] text-gris-dark whitespace-nowrap">
                    {nSel > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul text-white">{nSel} elegida{nSel !== 1 ? 's' : ''}</span>}
                    <span>
                      <b className="text-carbon tabular-nums">{g.items.length}</b>
                      {hayFiltro && total !== g.items.length && <span className="text-gris-dark"> de {total}</span>}
                      {' '}herr.
                    </span>
                    {g.unidades !== g.items.length && <span>· <b className="text-carbon tabular-nums">{g.unidades}</b> u.</span>}
                    <span className="hidden md:inline">· última salida <span className="font-mono">{fmtFecha(g.ultima)}</span></span>
                  </span>
                </button>

                {abierta && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gris/40 text-[10px] uppercase tracking-wide text-gris-dark">
                        <th className="w-9 px-3 py-1.5">
                          <input type="checkbox" checked={todas} onChange={() => toggleObraEntera(g)} title="Elegir toda la obra" aria-label="Elegir toda la obra" />
                        </th>
                        <th className="text-left px-2 py-1.5 font-bold">Herramienta</th>
                        <th className="text-right px-2 py-1.5 font-bold w-20">En obra</th>
                        <th className="text-left px-2 py-1.5 font-bold hidden sm:table-cell">Salió</th>
                        <th className="text-left px-2 py-1.5 font-bold hidden lg:table-cell w-28">Origen</th>
                        <th className="text-right px-3 py-1.5 w-40">
                          {nSel > 0 && (
                            <button type="button" disabled={!puedeEditar} onClick={() => setRetorno(g.items.filter(e => sel.has(e.id)))}
                              className={`${btnMini} bg-azul text-white hover:opacity-90 normal-case tracking-normal`}>↩ Retorno ({nSel})</button>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gris">
                      {g.items.map(e => {
                        const dias = diasEnObra(e.fecha)
                        const nota = notaVisible(e.nota)
                        const marcada = sel.has(e.id)
                        return (
                          <tr key={e.id} onClick={() => toggle(e.id)}
                            className={`cursor-pointer transition-colors ${marcada ? 'bg-azul-light/50' : 'hover:bg-gris/20'}`}>
                            <td className="px-3 py-1.5 text-center">
                              <input type="checkbox" checked={marcada} onChange={() => toggle(e.id)} onClick={ev => ev.stopPropagation()} aria-label={`Elegir ${e.descripcion}`} />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium text-carbon leading-tight">{e.descripcion}</div>
                              {nota && <div className="text-[11px] text-gris-dark italic truncate max-w-md" title={nota}>{nota}</div>}
                              <div className="sm:hidden text-[11px] text-gris-dark mt-0.5">
                                <span className="font-mono">{fmtFecha(e.fecha)}</span>
                                {e.remito_numero && <span className="font-mono text-naranja font-bold ml-1.5">{e.remito_numero}</span>}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right align-top">
                              <span className="font-mono font-bold text-azul">×{Number(e.en_obra)}</span>
                              {Number(e.devuelto) > 0 && <div className="text-[10px] text-gris-dark leading-tight">{Number(e.devuelto)} de {Number(e.cantidad)} ya volvieron</div>}
                            </td>
                            <td className="px-2 py-1.5 hidden sm:table-cell text-[11px] text-gris-dark whitespace-nowrap">
                              <span className="font-mono text-carbon">{fmtFecha(e.fecha)}</span>
                              <span className={`ml-1 ${dias >= 90 ? 'text-naranja-dark font-bold' : ''}`} title="Días en obra">({dias} d)</span>
                              {e.remito_numero && <span className="font-mono text-naranja font-bold ml-1.5">{e.remito_numero}</span>}
                              {e.solicitud_id && <span className="font-mono ml-1.5">#{e.solicitud_id}</span>}
                            </td>
                            <td className="px-2 py-1.5 hidden lg:table-cell">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${ORIGEN_LABEL[e.origen].cls}`} title={ORIGEN_LABEL[e.origen].title}>{ORIGEN_LABEL[e.origen].txt}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <button type="button" disabled={!puedeEditar} onClick={ev => { ev.stopPropagation(); setRetorno([e]) }} title="Volvió al pañol"
                                className={`${btnMini} bg-azul-light text-azul hover:opacity-80`}>↩ Volvió</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Barra de selección: pegada abajo mientras se recorre el acordeón */}
      {sel.size > 0 && (
        <div className="sticky bottom-2 z-10 bg-carbon text-white rounded-card shadow-card-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold">{elegidos.length} elegida{elegidos.length !== 1 ? 's' : ''}</span>
          {obrasElegidas > 1 && <span className="text-[11px] text-white/70">en {obrasElegidas} obras</span>}
          <button type="button" disabled={!puedeEditar || elegidos.length === 0} onClick={() => setRetorno(elegidos)}
            className="ml-auto text-xs font-bold px-4 py-2 rounded-lg bg-naranja text-white hover:bg-naranja-dark transition-colors disabled:opacity-40">↩ Registrar retorno</button>
          <button type="button" onClick={() => setSel(new Set())} className="text-xs text-white/70 hover:text-white px-1">Quitar</button>
        </div>
      )}

      {/* Historial de retornos, plegado */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <button type="button" onClick={() => setVerHistorial(v => !v)} aria-expanded={verHistorial}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gris/30 transition-colors">
          <span className={`text-[10px] text-gris-dark transition-transform ${verHistorial ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-xs font-bold text-gris-dark uppercase tracking-wider">Retornos registrados</span>
          <span className="font-mono text-xs text-gris-dark">{(verHistorial ? retornos?.total : stats?.devoluciones) ?? '—'}</span>
          {(busquedaServer || obraCod) && verHistorial && <span className="text-[11px] text-gris-dark">· con la búsqueda y la obra de arriba</span>}
        </button>
        {verHistorial && (
          cargandoRet ? (
            <div className="p-6 text-center text-sm text-gris-dark border-t border-gris">Cargando…</div>
          ) : itemsRet.length === 0 ? (
            <div className="p-6 text-center text-sm text-gris-dark italic border-t border-gris">{busquedaServer || obraCod ? 'Ningún retorno con esos filtros.' : 'Todavía no hay retornos registrados.'}</div>
          ) : (
            <>
              <table className="w-full text-sm border-t border-gris">
                <thead>
                  <tr className="bg-gris/40 text-[10px] uppercase tracking-wide text-gris-dark">
                    <th className="text-left px-3 py-1.5 font-bold w-24">Fecha</th>
                    <th className="text-left px-2 py-1.5 font-bold">Herramienta</th>
                    <th className="text-right px-2 py-1.5 font-bold w-16">Cant.</th>
                    <th className="text-left px-2 py-1.5 font-bold">Obra</th>
                    <th className="text-left px-2 py-1.5 font-bold hidden md:table-cell">Salida · pedido</th>
                    <th className="text-left px-3 py-1.5 font-bold hidden lg:table-cell">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gris">
                  {itemsRet.map(e => (
                    <tr key={e.id}>
                      <td className="px-3 py-1.5 font-mono text-xs text-carbon whitespace-nowrap">{fmtFecha(e.fecha)}</td>
                      <td className="px-2 py-1.5 font-medium text-carbon">{e.descripcion}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-verde">×{Number(e.cantidad)}</td>
                      <td className="px-2 py-1.5 text-xs text-carbon">{nombreObra(e.obra_cod)}</td>
                      <td className="px-2 py-1.5 hidden md:table-cell font-mono text-[11px] text-gris-dark whitespace-nowrap">
                        {e.salida_id ? `salida #${e.salida_id}` : ''}{e.salida_id && e.solicitud_id ? ' · ' : ''}{e.solicitud_id ? `pedido #${e.solicitud_id}` : ''}
                      </td>
                      <td className="px-3 py-1.5 hidden lg:table-cell text-[11px] text-gris-dark italic truncate max-w-xs" title={e.nota ?? ''}>{e.nota ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(retornos?.total ?? 0) > PAGE_SIZE && (
                <div className="p-3 border-t border-gris"><Pagination page={pageRet} total={retornos?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPageRet} /></div>
              )}
            </>
          )
        )}
      </div>

      <HerrRetornoModal open={retorno !== null} onClose={() => setRetorno(null)} salidas={retorno ?? []} obraNom={nombreObra} onListo={() => setSel(new Set())} />
    </div>
  )
}

function FiltroChip({ children, onQuitar }: { children: React.ReactNode; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-azul-light text-azul font-bold">
      {children}
      <button type="button" onClick={onQuitar} aria-label="Quitar filtro" className="w-4 h-4 rounded-full text-[10px] leading-none hover:bg-azul hover:text-white transition-colors">✕</button>
    </span>
  )
}
