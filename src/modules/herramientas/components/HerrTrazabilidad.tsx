'use client'

import { useState, useMemo } from 'react'
import { useHerramientas, useHerrMovimientos } from '../hooks/useHerramientas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import type { HerrMovimiento } from '@/types/domain.types'

function fmtFecha(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const ESTADO_COLORS: Record<string, string> = {
  disponible: 'bg-verde-light text-verde border-verde/20',
  uso:        'bg-naranja-light text-naranja-dark border-naranja/20',
  reparacion: 'bg-rojo-light text-rojo border-rojo/20',
  baja:       'bg-gris text-gris-dark border-gris-mid',
}

const MOV_DOT: Record<string, string> = {
  verde:   'bg-verde-light text-verde',
  naranja: 'bg-naranja-light text-naranja-dark',
  rojo:    'bg-rojo-light text-rojo',
  azul:    'bg-azul-light text-azul-mid',
  gris:    'bg-gris text-gris-dark',
}

export function HerrTrazabilidad() {
  const [herrSel,  setHerrSel]  = useState('')
  const [obraFilt, setObraFilt] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const { data: herramientas = [] } = useHerramientas()
  const { data: obras        = [] } = useObras()

  const herramientaId = herrSel ? Number(herrSel) : 0
  const { data: movimientos = [], isLoading } = useHerrMovimientos(herramientaId)

  const herramientaActual = herramientas.find(h => String(h.id) === herrSel) ?? null

  // Filtrar herramientas por búsqueda para el selector
  const herrFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    if (!q) return herramientas
    return herramientas.filter(h =>
      h.codigo.toLowerCase().includes(q) ||
      h.nom.toLowerCase().includes(q)    ||
      (h.marca ?? '').toLowerCase().includes(q)
    )
  }, [herramientas, busqueda])

  // Filtrar movimientos por obra si hay filtro
  const movFiltrados = useMemo(() => {
    if (!obraFilt) return movimientos
    return movimientos.filter(m =>
      m.obra_origen_cod  === obraFilt ||
      m.obra_destino_cod === obraFilt
    )
  }, [movimientos, obraFilt])

  // Obras donde estuvo la herramienta seleccionada
  const obrasInvolucradas = useMemo(() => {
    const cods = new Set<string>()
    movimientos.forEach(m => {
      if (m.obra_origen_cod)  cods.add(m.obra_origen_cod)
      if (m.obra_destino_cod) cods.add(m.obra_destino_cod)
    })
    return obras.filter(o => cods.has(o.cod))
  }, [movimientos, obras])

  // Stats de la herramienta
  const stats = useMemo(() => {
    if (!movimientos.length) return null
    const totalMov    = movimientos.length
    const obrasCount  = new Set([
      ...movimientos.map(m => m.obra_origen_cod).filter(Boolean),
      ...movimientos.map(m => m.obra_destino_cod).filter(Boolean),
    ]).size
    const enRep       = movimientos.filter(m => m.tipo_key === 'reparacion').length
    const traslados   = movimientos.filter(m => m.tipo_key === 'traslado').length
    const primerMov   = movimientos[movimientos.length - 1]
    const ultimoMov   = movimientos[0]
    return { totalMov, obrasCount, enRep, traslados, primerMov, ultimoMov }
  }, [movimientos])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">

      {/* Header */}
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">TRAZABILIDAD</h1>
        <p className="text-sm text-gris-dark mt-0.5">Historial completo de ubicación y movimientos</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Buscar herramienta */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Buscar herramienta
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                placeholder="Código, nombre o marca..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
              />
            </div>
          </div>

          {/* Selector herramienta */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Seleccioná herramienta
            </label>
            <select
              value={herrSel}
              onChange={e => { setHerrSel(e.target.value); setObraFilt('') }}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
            >
              <option value="">— Seleccioná una herramienta —</option>
              {herrFiltradas.map(h => (
                <option key={h.id} value={String(h.id)}>
                  [{h.codigo}] {h.nom}
                  {h.marca ? ` · ${h.marca}` : ''}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Filtro por obra — solo si hay herramienta seleccionada */}
        {herrSel && obrasInvolucradas.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Filtrar por obra
            </label>
            <select
              value={obraFilt}
              onChange={e => setObraFilt(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
            >
              <option value="">Todas las obras</option>
              {obrasInvolucradas.map(o => (
                <option key={o.cod} value={o.cod}>{o.nom} ({o.cod})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Estado vacío */}
      {!herrSel && (
        <div className="bg-white rounded-card shadow-card p-12 text-center text-gris-dark">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-semibold text-azul text-base">Seleccioná una herramienta</p>
          <p className="text-sm mt-1">Buscá por código, nombre o marca para ver su historial completo</p>
        </div>
      )}

      {herrSel && isLoading && (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando historial...
        </div>
      )}

      {/* Ficha de la herramienta */}
      {herrSel && !isLoading && herramientaActual && (
        <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark text-2xl flex-shrink-0">
                {herramientaActual.tipo?.icono ?? '🔧'}
              </div>
              <div>
                <h2 className="font-bold text-azul text-lg leading-tight">
                  {herramientaActual.nom}
                </h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                    {herramientaActual.codigo}
                  </span>
                  {herramientaActual.marca && (
                    <span className="text-xs text-gris-dark">{herramientaActual.marca}</span>
                  )}
                  {herramientaActual.tipo && (
                    <span className="text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                      {herramientaActual.tipo.icono} {herramientaActual.tipo.nom}
                    </span>
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${ESTADO_COLORS[herramientaActual.estado_key]}`}>
                    {herramientaActual.estado?.icono} {herramientaActual.estado?.nom ?? herramientaActual.estado_key}
                  </span>
                </div>
              </div>
            </div>

            {/* Ubicación actual */}
            <div className="text-right">
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">
                Ubicación actual
              </div>
              {herramientaActual.obra ? (
                <div>
                  <div className="font-bold text-azul">{herramientaActual.obra.nom}</div>
                  <div className="font-mono text-xs text-gris-dark">{herramientaActual.obra.cod}</div>
                </div>
              ) : (
                <div className="font-bold text-verde">Depósito</div>
              )}
              {herramientaActual.responsable && (
                <div className="text-xs text-gris-dark mt-0.5">
                  Responsable: {herramientaActual.responsable}
                </div>
              )}
            </div>
          </div>

          {/* Stats rápidos */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gris">
              <MiniStat label="Movimientos"  value={String(stats.totalMov)}   color="azul"    />
              <MiniStat label="Obras"        value={String(stats.obrasCount)} color="naranja" />
              <MiniStat label="Reparaciones" value={String(stats.enRep)}      color="rojo"    />
              <MiniStat label="Traslados"    value={String(stats.traslados)}  color="verde"   />
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {herrSel && !isLoading && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris flex items-center justify-between">
            <h3 className="font-bold text-azul">Línea de tiempo</h3>
            <span className="text-xs text-gris-dark">
              {movFiltrados.length} movimiento{movFiltrados.length !== 1 ? 's' : ''}
              {obraFilt ? ` en ${obras.find(o => o.cod === obraFilt)?.nom ?? obraFilt}` : ''}
            </span>
          </div>

          {movFiltrados.length === 0 ? (
            <div className="p-10 text-center text-gris-dark text-sm">
              <div className="text-3xl mb-2">📋</div>
              <p>No hay movimientos registrados para esta herramienta</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="relative">
                {/* Línea vertical */}
                <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gris-mid" />

                <div className="flex flex-col gap-0">
                  {movFiltrados.map((m, idx) => {
                    const color    = m.tipo?.color ?? 'azul'
                    const origen   = m.obra_origen?.nom  ?? 'Depósito'
                    const destino  = m.obra_destino?.nom ?? 'Depósito'
                    const esUltimo = idx === 0

                    return (
                      <div key={m.id} className="flex items-start gap-4 pb-6 last:pb-0 relative">
                        {/* Dot */}
                        <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center
                          font-bold text-sm flex-shrink-0 z-10 border-2 border-white
                          ${MOV_DOT[color]}
                          ${esUltimo ? 'ring-2 ring-naranja ring-offset-1' : ''}
                        `}>
                          {m.tipo?.icono ?? '→'}
                        </div>

                        {/* Contenido */}
                        <div className={`
                          flex-1 bg-gris rounded-xl p-3
                          ${esUltimo ? 'border border-naranja/30' : ''}
                        `}>
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                              <div className="font-bold text-sm text-carbon">
                                {m.tipo?.nom ?? m.tipo_key}
                                {esUltimo && (
                                  <span className="ml-2 text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded-full">
                                    Último
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {(m.obra_origen_cod || m.obra_destino_cod) && (
                                  <span className="text-xs text-gris-dark font-mono">
                                    {origen}
                                    {(m.obra_origen_cod || m.obra_destino_cod) && (
                                      <span className="text-naranja mx-1">→</span>
                                    )}
                                    {destino}
                                  </span>
                                )}
                                {m.responsable && (
                                  <span className="text-xs text-gris-dark">
                                    · {m.responsable}
                                  </span>
                                )}
                              </div>
                              {m.obs && (
                                <div className="text-xs text-gris-dark mt-1 italic">
                                  "{m.obs}"
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-gris-dark text-right flex-shrink-0">
                              {fmtFecha(m.fecha)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    azul:    'text-azul',
    naranja: 'text-naranja-dark',
    rojo:    'text-rojo',
    verde:   'text-verde',
  }
  return (
    <div className="text-center">
      <div className={`font-mono font-bold text-2xl ${colors[color]}`}>{value}</div>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}