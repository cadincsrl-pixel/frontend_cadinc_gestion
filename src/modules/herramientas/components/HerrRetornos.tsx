'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHerrEntregas, useHerrEntregasStats, fetchHerrEntregasTodas, ENTREGAS_KEY } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { Pagination } from '@/components/ui/Pagination'
import { Input } from '@/components/ui/Input'
import { HerrRetornoModal } from './HerrRetornoModal'
import { ORIGEN_LABEL, fmtFecha } from './HerrSalidas'
import type { HerrEntrega } from '@/types/domain.types'

/**
 * Retorno de obra: una barra colapsable por obra con las herramientas que
 * todavía tiene (salidas confirmadas sin devolver). Se abren, se eligen las
 * que volvieron y se registra el retorno (parcial permitido). Abajo, el
 * historial de retornos. Todo sale del mismo ledger que Salidas a obra.
 *
 * Las salidas en obra se traen TODAS de a 200 y se agrupan acá: hoy son ~400
 * y bajan a medida que se registran retornos, así que agrupar en el cliente
 * es más simple que una query por obra y evita el techo de 1000 (§5.7).
 */

const PAGE_SIZE = 25

interface GrupoObra {
  cod:      string
  items:    HerrEntrega[]
  unidades: number
}

export function HerrRetornos() {
  const { puedeEditar } = usePermisos('herramientas')

  const [busqueda, setBusqueda] = useState('')
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [sel, setSel]           = useState<Set<number>>(new Set())
  const [retorno, setRetorno]   = useState<HerrEntrega[] | null>(null)
  const [pageRet, setPageRet]   = useState(1)

  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPageRet(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtroQ = busquedaAplicada ? { q: busquedaAplicada } : {}
  const { data: enObra = [], isLoading: cargandoEnObra, isFetching } = useQuery({
    queryKey: [...ENTREGAS_KEY, 'en-obra-todas', busquedaAplicada],
    queryFn:  () => fetchHerrEntregasTodas({ ...filtroQ, en_obra: true }),
    staleTime: 60_000,
  })
  const { data: retornos, isLoading: cargandoRet } = useHerrEntregas({ ...filtroQ, sentido: 'devolucion', estados: 'confirmada,pendiente,revisar', limit: PAGE_SIZE, offset: (pageRet - 1) * PAGE_SIZE })
  const { data: stats } = useHerrEntregasStats()
  const { data: obras = [] } = useObras()

  const obraNom = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])
  const nombreObra = (cod: string | null) => (cod ? (obraNom.get(cod) ?? cod) : 'sin obra')

  // Una barra por obra, ordenadas por cantidad de herramientas en obra.
  const grupos = useMemo<GrupoObra[]>(() => {
    const m = new Map<string, GrupoObra>()
    for (const e of enObra) {
      const cod = e.obra_cod ?? ''
      let g = m.get(cod)
      if (!g) { g = { cod, items: [], unidades: 0 }; m.set(cod, g) }
      g.items.push(e)
      g.unidades += Number(e.en_obra)
    }
    for (const g of m.values()) g.items.sort((a, b) => a.descripcion.localeCompare(b.descripcion) || (a.fecha < b.fecha ? 1 : -1))
    return [...m.values()].sort((a, b) => b.items.length - a.items.length || nombreObra(a.cod).localeCompare(nombreObra(b.cod)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enObra, obraNom])

  // Con búsqueda, las barras que matchean se abren solas; sin búsqueda, se abren a mano.
  const abiertaEfectiva = (cod: string) => busquedaAplicada ? !abiertas.has(cod) : abiertas.has(cod)
  function toggleObra(cod: string) {
    setAbiertas(prev => { const n = new Set(prev); if (n.has(cod)) n.delete(cod); else n.add(cod); return n })
  }

  const elegidos = useMemo(() => enObra.filter(e => sel.has(e.id)), [enObra, sel])
  function toggle(id: number) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function toggleObraEntera(g: GrupoObra) {
    const todas = g.items.every(e => sel.has(e.id))
    setSel(prev => { const n = new Set(prev); g.items.forEach(e => todas ? n.delete(e.id) : n.add(e.id)); return n })
  }

  const itemsRet = useMemo(() => retornos?.items ?? [], [retornos])
  const btn = (extra: string) => `text-xs font-bold px-3 py-1.5 rounded transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed ${extra}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-carbon">↩ Retorno de obra</h1>
        <p className="text-xs text-gris-dark mt-1 max-w-2xl">
          Una barra por obra con las herramientas que todavía tiene (salidas confirmadas sin devolver). Abrila, elegí las
          que volvieron y registrá el retorno; si volvió una parte, bajá la cantidad.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{enObra.length}</b><span className="text-gris-dark ml-1">herramientas en obra</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{grupos.length}</b><span className="text-gris-dark ml-1">obras</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.devoluciones ?? '—'}</b><span className="text-gris-dark ml-1">retornos registrados</span></span>
        {(stats?.pendientes ?? 0) > 0 && (
          <span className="px-3 py-1.5 rounded-lg bg-naranja-light text-naranja-dark text-xs font-bold" title="Hasta que se confirmen en Salidas a obra no aparecen acá">
            {stats?.pendientes} sin revisar en Salidas a obra
          </span>
        )}
        {isFetching && <span className="self-center w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="bg-white rounded-card shadow-card p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1 min-w-0">
          <Input placeholder="Buscar una herramienta en todas las obras…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-azul font-bold hover:underline" onClick={() => setAbiertas(busquedaAplicada ? new Set() : new Set(grupos.map(g => g.cod)))}>Abrir todas</button>
          <span className="text-gris-mid">·</span>
          <button type="button" className="text-xs text-azul font-bold hover:underline" onClick={() => setAbiertas(busquedaAplicada ? new Set(grupos.map(g => g.cod)) : new Set())}>Cerrar todas</button>
        </div>
      </div>

      {/* Barra de selección */}
      {sel.size > 0 && (
        <div className="bg-carbon text-white rounded-card px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold mr-2">{elegidos.length} elegida{elegidos.length !== 1 ? 's' : ''}</span>
          <button disabled={!puedeEditar || elegidos.length === 0} onClick={() => setRetorno(elegidos)} className={btn('bg-azul-light text-azul hover:opacity-80')}>↩ Registrar retorno</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-xs text-white/70 hover:text-white">Quitar selección</button>
        </div>
      )}

      {/* Acordeón por obra */}
      {cargandoEnObra ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando…</div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">
          {busquedaAplicada ? 'Ninguna obra tiene esa herramienta.' : 'No hay herramientas confirmadas en obra. Lo que está sin revisar se confirma en Salidas a obra.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {grupos.map(g => {
            const abierta = abiertaEfectiva(g.cod)
            const nSel = g.items.filter(e => sel.has(e.id)).length
            const todas = nSel === g.items.length
            return (
              <div key={g.cod} className="bg-white rounded-card shadow-card overflow-hidden">
                <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${abierta ? 'border-b border-gris' : ''}`} onClick={() => toggleObra(g.cod)}>
                  <span className={`text-gris-dark text-xs transition-transform ${abierta ? 'rotate-90' : ''}`}>▶</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-carbon">{nombreObra(g.cod)}</div>
                    <div className="text-[11px] text-gris-dark font-mono">{g.cod}</div>
                  </div>
                  <span className="text-xs text-gris-dark whitespace-nowrap">
                    <b className="text-carbon">{g.items.length}</b> herramienta{g.items.length !== 1 ? 's' : ''}{g.unidades !== g.items.length && <> · <b className="text-carbon">{g.unidades}</b> unidades</>}
                  </span>
                  {nSel > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul text-white">{nSel} elegida{nSel !== 1 ? 's' : ''}</span>}
                </div>
                {abierta && (
                  <>
                    <div className="flex items-center gap-3 px-4 py-2 bg-gris/40 text-xs text-gris-dark">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={todas} onChange={() => toggleObraEntera(g)} />
                        Elegir toda la obra
                      </label>
                      <button disabled={!puedeEditar || nSel === 0} onClick={() => setRetorno(g.items.filter(e => sel.has(e.id)))} className={`ml-auto ${btn('bg-azul text-white hover:opacity-90')}`}>
                        ↩ Registrar retorno{nSel > 0 ? ` (${nSel})` : ''}
                      </button>
                    </div>
                    <div className="divide-y divide-gris">
                      {g.items.map(e => (
                        <div key={e.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 ${sel.has(e.id) ? 'bg-azul-light/30' : ''}`}>
                          <input type="checkbox" className="mt-1" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
                          <div className="flex-1 min-w-[12rem]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-carbon">{e.descripcion}</span>
                              <span className="text-[11px] font-mono font-bold text-azul">×{Number(e.en_obra)}</span>
                              {Number(e.devuelto) > 0 && <span className="text-[10px] text-gris-dark">de {Number(e.cantidad)} salieron, {Number(e.devuelto)} ya volvieron</span>}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ORIGEN_LABEL[e.origen].cls}`} title={ORIGEN_LABEL[e.origen].title}>{ORIGEN_LABEL[e.origen].txt}</span>
                            </div>
                            <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono">salió {fmtFecha(e.fecha)}</span>
                              {e.remito_numero && <><span>·</span><span className="font-mono text-naranja font-bold">{e.remito_numero}</span></>}
                              {e.solicitud_id && <><span>·</span><span className="font-mono">pedido #{e.solicitud_id}</span></>}
                              {e.nota && <span className="italic">· {e.nota}</span>}
                            </div>
                          </div>
                          <button disabled={!puedeEditar} onClick={() => setRetorno([e])} className={btn('bg-azul-light text-azul hover:opacity-80')} title="Volvió al pañol">↩ Volvió</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Retornos registrados */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gris bg-gris/40">
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">↩ Retornos registrados <span className="font-mono normal-case tracking-normal">({(retornos?.total ?? 0).toLocaleString('es-AR')})</span></h3>
        </div>
        {cargandoRet ? (
          <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
        ) : itemsRet.length === 0 ? (
          <div className="p-8 text-center text-sm text-gris-dark italic">Todavía no hay retornos registrados.</div>
        ) : (
          <div className="divide-y divide-gris">
            {itemsRet.map(e => (
              <div key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="flex-1 min-w-[12rem]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-carbon">{e.descripcion}</span>
                    <span className="text-[11px] font-mono font-bold text-verde">×{Number(e.cantidad)}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-verde-light text-verde">↩ volvió al pañol</span>
                  </div>
                  <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-carbon">{nombreObra(e.obra_cod)}</span>
                    <span>·</span><span className="font-mono">{fmtFecha(e.fecha)}</span>
                    {e.salida_id && <><span>·</span><span className="font-mono">salida #{e.salida_id}</span></>}
                    {e.solicitud_id && <><span>·</span><span className="font-mono">pedido #{e.solicitud_id}</span></>}
                    {e.nota && <span className="italic">· {e.nota}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(retornos?.total ?? 0) > PAGE_SIZE && (
          <div className="p-3 border-t border-gris"><Pagination page={pageRet} total={retornos?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPageRet} /></div>
        )}
      </div>

      <HerrRetornoModal open={retorno !== null} onClose={() => setRetorno(null)} salidas={retorno ?? []} obraNom={nombreObra} onListo={() => setSel(new Set())} />
    </div>
  )
}
