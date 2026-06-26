'use client'

import { useMemo, useState } from 'react'
import { useHerramientas, useHerrMovimientosAll } from '../hooks/useHerramientas'
import type { Herramienta, HerrMovimiento } from '@/types/domain.types'

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtFechaHora(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const MOV_COLORS: Record<string, string> = {
  verde: 'bg-verde-light text-verde',
  naranja: 'bg-naranja-light text-naranja-dark',
  rojo: 'bg-rojo-light text-rojo',
  azul: 'bg-azul-light text-azul-mid',
  gris: 'bg-gris text-gris-dark',
}

interface ObraGroup {
  cod:    string
  nom:    string
  herrs:  Array<Herramienta & { desde: string | null }>
  histor: HerrMovimiento[]
}

export function HerrPorObra() {
  const { data: herrs = [], isLoading: loadingHerrs } = useHerramientas()
  const { data: movs = [], isLoading: loadingMovs } = useHerrMovimientosAll()

  const [busqueda, setBusqueda] = useState('')
  const [obraAbierta, setObraAbierta] = useState<string | null>(null)
  const [historAbierto, setHistorAbierto] = useState<Set<string>>(new Set())

  // ── Agrupar herramientas por obra (solo las que están en una obra hoy) ──
  // "desde" por herramienta = última fecha con obra_destino_cod = obra_cod
  // actual de la herr. Si nunca tuvo movimiento (alta directa a esa obra),
  // fallback a `fecha_ingreso` o `created_at`.
  const grupos = useMemo((): ObraGroup[] => {
    const porObra = new Map<string, ObraGroup>()

    for (const h of herrs) {
      if (!h.obra_cod || !h.activo) continue
      const nom = h.obra?.nom ?? `[${h.obra_cod}]`
      if (!porObra.has(h.obra_cod)) {
        porObra.set(h.obra_cod, { cod: h.obra_cod, nom, herrs: [], histor: [] })
      }
      const ultimoMov = movs
        .filter(m => m.herramienta_id === h.id && m.obra_destino_cod === h.obra_cod)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
      const desde = ultimoMov?.fecha ?? h.fecha_ingreso ?? h.created_at
      porObra.get(h.obra_cod)!.herrs.push({ ...h, desde })
    }

    // Historial por obra: todos los movimientos donde la obra aparece como
    // origen o destino. Ordenado desc por fecha.
    for (const m of movs) {
      if (m.obra_origen_cod && porObra.has(m.obra_origen_cod)) {
        porObra.get(m.obra_origen_cod)!.histor.push(m)
      }
      if (m.obra_destino_cod && porObra.has(m.obra_destino_cod) && m.obra_destino_cod !== m.obra_origen_cod) {
        porObra.get(m.obra_destino_cod)!.histor.push(m)
      }
    }

    for (const g of porObra.values()) {
      g.herrs.sort((a, b) => a.nom.localeCompare(b.nom))
      g.histor.sort((a, b) => b.fecha.localeCompare(a.fecha))
    }

    return [...porObra.values()].sort((a, b) => a.nom.localeCompare(b.nom))
  }, [herrs, movs])

  const gruposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return grupos
    return grupos
      .map(g => ({
        ...g,
        herrs: g.herrs.filter(h =>
          g.nom.toLowerCase().includes(q) ||
          g.cod.toLowerCase().includes(q) ||
          h.nom.toLowerCase().includes(q) ||
          h.codigo.toLowerCase().includes(q) ||
          (h.marca ?? '').toLowerCase().includes(q) ||
          (h.modelo ?? '').toLowerCase().includes(q) ||
          (h.responsable ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.herrs.length > 0)
  }, [grupos, busqueda])

  function toggleObra(cod: string) {
    setObraAbierta(prev => prev === cod ? null : cod)
  }

  function toggleHistor(cod: string) {
    setHistorAbierto(prev => {
      const next = new Set(prev)
      if (next.has(cod)) next.delete(cod)
      else next.add(cod)
      return next
    })
  }

  if (loadingHerrs || loadingMovs) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando herramientas por obra...
      </div>
    )
  }

  const totalHerrs = grupos.reduce((s, g) => s + g.herrs.length, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-xl text-carbon tracking-wide">🏗 HERRAMIENTAS POR OBRA</h1>
        <span className="text-xs text-gris-dark font-bold">
          {grupos.length} obra{grupos.length !== 1 ? 's' : ''} · {totalHerrs} herramienta{totalHerrs !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Buscador */}
      <div className="relative max-w-[400px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
        <input
          type="text"
          autoComplete="off"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por obra, herramienta, marca, modelo o responsable..."
          className="w-full pl-9 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Lista de obras (acordeón) */}
      {gruposFiltrados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {busqueda ? `Sin resultados para "${busqueda}"` : 'Ninguna obra tiene herramientas asignadas.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {gruposFiltrados.map(g => {
            const abierta = obraAbierta === g.cod
            const histAbierto = historAbierto.has(g.cod)
            return (
              <div key={g.cod} className="bg-white rounded-card shadow-card overflow-hidden">
                {/* Header obra (clickeable) */}
                <button
                  onClick={() => toggleObra(g.cod)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gris/40 transition-colors"
                  aria-expanded={abierta}
                >
                  <span className="font-mono text-xs bg-azul text-white px-2 py-0.5 rounded font-bold">
                    {g.cod}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{g.nom}</div>
                  </div>
                  <span className="text-[11px] font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">
                    {g.herrs.length} herr{g.herrs.length !== 1 ? 's' : ''}
                  </span>
                  <span className={`text-xs text-naranja-dark font-bold transition-transform ${abierta ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {abierta && (
                  <div className="border-t border-gris bg-white">
                    {/* Tabla de herramientas actuales */}
                    <div className="overflow-x-auto">
                      <table className="border-collapse w-full text-sm">
                        <thead>
                          <tr className="bg-gris/30">
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Código</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Herramienta</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Tipo</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Marca / Modelo</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Estado</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Responsable</th>
                            <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Desde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.herrs.map(h => (
                            <tr key={h.id} className="border-t border-gris hover:bg-naranja-light/20">
                              <td className="px-3 py-2 font-mono text-xs text-gris-dark">{h.codigo}</td>
                              <td className="px-3 py-2 font-semibold text-carbon">{h.nom}</td>
                              <td className="px-3 py-2 text-xs text-gris-dark">{h.tipo?.nom ?? '—'}</td>
                              <td className="px-3 py-2 text-xs text-gris-dark">
                                {[h.marca_ref?.nom ?? h.marca, h.modelo_ref?.nom ?? h.modelo].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <span className="font-mono">{h.estado?.nom ?? h.estado_key}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-gris-dark">{h.responsable ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs">{fmtFecha(h.desde)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Historial (colapsable) */}
                    <button
                      onClick={() => toggleHistor(g.cod)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-gris bg-gris/20 hover:bg-gris/40 text-left transition-colors"
                      aria-expanded={histAbierto}
                    >
                      <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">
                        📜 Historial de movimientos
                      </span>
                      <span className="text-[11px] text-gris-dark">
                        ({g.histor.length})
                      </span>
                      <span className={`ml-auto text-xs text-gris-dark font-bold transition-transform ${histAbierto ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>

                    {histAbierto && (
                      <div className="overflow-x-auto border-t border-gris bg-white">
                        {g.histor.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-gris-dark italic text-center">
                            Sin movimientos registrados para esta obra.
                          </div>
                        ) : (
                          <table className="border-collapse w-full text-sm">
                            <thead>
                              <tr className="bg-gris/20">
                                <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Fecha</th>
                                <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Tipo</th>
                                <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Herramienta</th>
                                <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Origen → Destino</th>
                                <th className="text-left text-xs font-bold text-gris-dark px-3 py-2 uppercase tracking-wide">Responsable</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.histor.map(m => {
                                const tipoNom = m.tipo?.nom ?? m.tipo_key
                                const tipoColor = MOV_COLORS[m.tipo?.color ?? 'gris'] ?? MOV_COLORS.gris
                                const origenNom = m.obra_origen?.nom ?? (m.obra_origen_cod ? `[${m.obra_origen_cod}]` : '—')
                                const destinoNom = m.obra_destino?.nom ?? (m.obra_destino_cod ? `[${m.obra_destino_cod}]` : '—')
                                return (
                                  <tr key={m.id} className="border-t border-gris">
                                    <td className="px-3 py-2 font-mono text-xs text-gris-dark whitespace-nowrap">{fmtFechaHora(m.fecha)}</td>
                                    <td className="px-3 py-2">
                                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${tipoColor}`}>
                                        {m.tipo?.icono ? `${m.tipo.icono} ` : ''}{tipoNom}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-carbon">
                                      <span className="font-mono text-gris-dark">{m.herramienta?.codigo ?? `#${m.herramienta_id}`}</span>
                                      {' · '}
                                      <span className="font-semibold">{m.herramienta?.nom ?? '—'}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-carbon">
                                      <span className={m.obra_origen_cod === g.cod ? 'font-bold text-naranja-dark' : ''}>{origenNom}</span>
                                      <span className="text-gris-dark mx-1">→</span>
                                      <span className={m.obra_destino_cod === g.cod ? 'font-bold text-naranja-dark' : ''}>{destinoNom}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gris-dark">{m.responsable ?? '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
