'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHerrEntregas, useHerrEntregasStats } from '../hooks/useHerrEntregas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePermisos } from '@/hooks/usePermisos'
import { Pagination } from '@/components/ui/Pagination'
import { Input } from '@/components/ui/Input'
import { HerrRetornoModal } from './HerrRetornoModal'
import { ORIGEN_LABEL, fmtFecha } from './HerrSalidas'
import type { HerrEntrega } from '@/types/domain.types'

/**
 * Retorno de obra: qué herramientas siguen en cada obra y registrar cuando
 * vuelven al pañol. Arriba, las salidas vivas con algo todavía en obra
 * (selección múltiple → un retorno por salida, parcial permitido); abajo, los
 * retornos ya registrados. Todo sale del mismo ledger que Salidas a obra.
 */

const PAGE_SIZE = 25

export function HerrRetornos() {
  const { puedeEditar } = usePermisos('herramientas')

  const [obraCod, setObraCod]   = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pageEnObra, setPageEnObra] = useState(1)
  const [pageRet, setPageRet]   = useState(1)
  const [sel, setSel]           = useState<Set<number>>(new Set())
  const [retorno, setRetorno]   = useState<HerrEntrega[] | null>(null)

  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPageEnObra(1); setPageRet(1) }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const base = {
    ...(obraCod ? { obra_cod: obraCod } : {}),
    ...(busquedaAplicada ? { q: busquedaAplicada } : {}),
  }
  const { data: enObra, isLoading: cargandoEnObra, isFetching } = useHerrEntregas({ ...base, en_obra: true, limit: PAGE_SIZE, offset: (pageEnObra - 1) * PAGE_SIZE })
  const { data: retornos, isLoading: cargandoRet } = useHerrEntregas({ ...base, sentido: 'devolucion', estados: 'confirmada,pendiente,revisar', limit: PAGE_SIZE, offset: (pageRet - 1) * PAGE_SIZE })
  const { data: stats } = useHerrEntregasStats()
  const { data: obras = [] } = useObras()

  const obraNom = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of obras) m.set(o.cod, o.nom)
    return m
  }, [obras])
  const nombreObra = (cod: string | null) => (cod ? (obraNom.get(cod) ?? cod) : 'sin obra')

  const itemsEnObra = useMemo(() => enObra?.items ?? [], [enObra])
  const itemsRet    = useMemo(() => retornos?.items ?? [], [retornos])
  const obrasConEnObra = (stats?.obras_lista ?? []).filter(o => Number(o.n_en_obra) > 0)

  const todosPagina = itemsEnObra.length > 0 && itemsEnObra.every(e => sel.has(e.id))
  const elegidos = itemsEnObra.filter(e => sel.has(e.id))

  function toggle(id: number) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  function togglePagina() {
    setSel(prev => { const n = new Set(prev); if (todosPagina) itemsEnObra.forEach(e => n.delete(e.id)); else itemsEnObra.forEach(e => n.add(e.id)); return n })
  }

  const btn = (extra: string) => `text-xs font-bold px-3 py-1.5 rounded transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed ${extra}`

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-carbon">↩ Retorno de obra</h1>
        <p className="text-xs text-gris-dark mt-1 max-w-2xl">
          Lo que cada obra todavía tiene del pañol, y el registro de lo que volvió. Elegí las herramientas que
          volvieron y registrá el retorno; si volvió una parte, bajá la cantidad.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.en_obra ?? '—'}</b><span className="text-gris-dark ml-1">salidas en obra</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{obrasConEnObra.length}</b><span className="text-gris-dark ml-1">obras con herramientas</span></span>
        <span className="px-3 py-1.5 rounded-lg bg-white shadow-card text-xs"><b className="text-carbon">{stats?.devoluciones ?? '—'}</b><span className="text-gris-dark ml-1">retornos registrados</span></span>
      </div>

      <div className="bg-white rounded-card shadow-card p-3 flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <Input placeholder="Buscar por herramienta…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select value={obraCod} onChange={e => { setObraCod(e.target.value); setPageEnObra(1); setPageRet(1); setSel(new Set()) }}
          className="px-3 py-2 text-sm border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white sm:w-80">
          <option value="">Todas las obras</option>
          {obrasConEnObra.map(o => (
            <option key={o.cod} value={o.cod}>{nombreObra(o.cod)} ({o.n_en_obra} en obra · {o.n_devoluciones} retorno{Number(o.n_devoluciones) !== 1 ? 's' : ''})</option>
          ))}
        </select>
      </div>

      {/* En obra */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gris bg-gris/40">
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">🏗 En obra <span className="font-mono normal-case tracking-normal">({(enObra?.total ?? 0).toLocaleString('es-AR')})</span></h3>
          {isFetching && <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />}
          <label className="ml-auto flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
            <input type="checkbox" checked={todosPagina} disabled={itemsEnObra.length === 0} onChange={togglePagina} />
            Elegir la página
          </label>
          <button disabled={!puedeEditar || elegidos.length === 0} onClick={() => setRetorno(elegidos)} className={btn('bg-azul text-white hover:opacity-90')}>
            ↩ Registrar retorno{elegidos.length > 0 ? ` (${elegidos.length})` : ''}
          </button>
        </div>
        {cargandoEnObra ? (
          <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
        ) : itemsEnObra.length === 0 ? (
          <div className="p-8 text-center text-sm text-gris-dark italic">{obraCod || busquedaAplicada ? 'Nada en obra con estos filtros.' : 'No hay herramientas en obra.'}</div>
        ) : (
          <div className="divide-y divide-gris">
            {itemsEnObra.map(e => (
              <div key={e.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 ${sel.has(e.id) ? 'bg-azul-light/30' : ''}`}>
                <input type="checkbox" className="mt-1" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
                <div className="flex-1 min-w-[12rem]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-carbon">{e.descripcion}</span>
                    <span className="text-[11px] font-mono font-bold text-azul">×{Number(e.en_obra)}</span>
                    {Number(e.devuelto) > 0 && <span className="text-[10px] text-gris-dark">de {Number(e.cantidad)} salieron, {Number(e.devuelto)} ya volvieron</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ORIGEN_LABEL[e.origen].cls}`} title={ORIGEN_LABEL[e.origen].title}>{ORIGEN_LABEL[e.origen].txt}</span>
                    {e.estado === 'pendiente' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark" title="Todavía nadie la confirmó en Salidas a obra">sin revisar</span>}
                  </div>
                  <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-carbon">{nombreObra(e.obra_cod)}</span>
                    <span>·</span><span className="font-mono">salió {fmtFecha(e.fecha)}</span>
                    {e.remito_numero && <><span>·</span><span className="font-mono text-naranja font-bold">{e.remito_numero}</span></>}
                    {e.solicitud_id && <><span>·</span><span className="font-mono">pedido #{e.solicitud_id}</span></>}
                  </div>
                </div>
                <button disabled={!puedeEditar} onClick={() => setRetorno([e])} className={btn('bg-azul-light text-azul hover:opacity-80')} title="Volvió al pañol">↩ Volvió</button>
              </div>
            ))}
          </div>
        )}
        {(enObra?.total ?? 0) > PAGE_SIZE && (
          <div className="p-3 border-t border-gris"><Pagination page={pageEnObra} total={enObra?.total ?? 0} pageSize={PAGE_SIZE} onChange={p => { setPageEnObra(p); setSel(new Set()) }} /></div>
        )}
      </div>

      {/* Retornos registrados */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gris bg-gris/40">
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">↩ Retornos registrados <span className="font-mono normal-case tracking-normal">({(retornos?.total ?? 0).toLocaleString('es-AR')})</span></h3>
        </div>
        {cargandoRet ? (
          <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
        ) : itemsRet.length === 0 ? (
          <div className="p-8 text-center text-sm text-gris-dark italic">Todavía no hay retornos registrados{obraCod ? ' en esta obra' : ''}.</div>
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
