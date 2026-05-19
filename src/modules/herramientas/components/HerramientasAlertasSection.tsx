'use client'

import { useMemo } from 'react'
import { useHerramientas, useHerrMovimientosAll } from '../hooks/useHerramientas'
import type { Herramienta, HerrMovimiento } from '@/types/domain.types'

const DIAS_REPARACION_ALERTA  = 30
const DIAS_SIN_MOVIMIENTO     = 90
const MS_POR_DIA              = 86_400_000

interface AlertaItem {
  herramienta: Herramienta
  kind:        'reparacion_larga' | 'sin_movimiento'
  diasDesde:   number
  /** Fecha relevante (ISO) — del último movimiento que disparó la alerta. */
  fechaRef:    string | null
}

export function HerramientasAlertasSection({
  onSelectHerramienta,
}: {
  onSelectHerramienta?: (h: Herramienta) => void
}) {
  const { data: herramientas = [], isLoading: loadingH } = useHerramientas()
  const { data: movimientos = [], isLoading: loadingM } = useHerrMovimientosAll()

  const alertas = useMemo<AlertaItem[]>(() => {
    if (loadingH || loadingM) return []
    const now = Date.now()

    // Último movimiento por herramienta.
    const ultimoPorHerr = new Map<number, HerrMovimiento>()
    for (const m of movimientos) {
      const prev = ultimoPorHerr.get(m.herramienta_id)
      if (!prev || prev.fecha < m.fecha) ultimoPorHerr.set(m.herramienta_id, m)
    }

    // Último movimiento de tipo `reparacion` por herramienta (entrada al taller).
    const ultimoRepPorHerr = new Map<number, HerrMovimiento>()
    for (const m of movimientos) {
      if (m.tipo_key !== 'reparacion') continue
      const prev = ultimoRepPorHerr.get(m.herramienta_id)
      if (!prev || prev.fecha < m.fecha) ultimoRepPorHerr.set(m.herramienta_id, m)
    }

    const result: AlertaItem[] = []

    for (const h of herramientas) {
      if (h.estado_key === 'baja') continue

      if (h.estado_key === 'reparacion') {
        const rep = ultimoRepPorHerr.get(h.id)
        if (rep) {
          const dias = Math.floor((now - new Date(rep.fecha).getTime()) / MS_POR_DIA)
          if (dias >= DIAS_REPARACION_ALERTA) {
            result.push({ herramienta: h, kind: 'reparacion_larga', diasDesde: dias, fechaRef: rep.fecha })
            continue
          }
        }
      }

      const ult = ultimoPorHerr.get(h.id)
      const fechaRef = ult?.fecha ?? h.fecha_ingreso ?? null
      if (fechaRef) {
        const dias = Math.floor((now - new Date(fechaRef).getTime()) / MS_POR_DIA)
        if (dias >= DIAS_SIN_MOVIMIENTO) {
          result.push({ herramienta: h, kind: 'sin_movimiento', diasDesde: dias, fechaRef })
        }
      }
    }

    return result.sort((a, b) => b.diasDesde - a.diasDesde)
  }, [herramientas, movimientos, loadingH, loadingM])

  if (loadingH || loadingM) return null
  if (alertas.length === 0) return null

  const enReparacion = alertas.filter(a => a.kind === 'reparacion_larga')
  const sinMov       = alertas.filter(a => a.kind === 'sin_movimiento')

  function renderFila(a: AlertaItem) {
    const isRep = a.kind === 'reparacion_larga'
    const cls   = isRep ? 'border-rojo' : 'border-naranja'
    const badge = isRep ? 'bg-rojo text-white' : 'bg-naranja text-white'
    const txt   = isRep
      ? `${a.diasDesde}d en reparación`
      : `Sin mov. ${a.diasDesde}d`
    return (
      <button
        key={`${a.kind}-${a.herramienta.id}`}
        onClick={() => onSelectHerramienta?.(a.herramienta)}
        className={`bg-white rounded-lg shadow-sm border-l-4 ${cls} px-3 py-2 text-left flex items-center gap-3 flex-wrap hover:bg-gris/30 transition-colors w-full`}
      >
        <span className="font-mono font-bold text-sm text-carbon shrink-0">{a.herramienta.codigo}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-azul truncate">{a.herramienta.nom}</div>
          {a.herramienta.obra && (
            <div className="text-[11px] text-gris-dark">{a.herramienta.obra.nom}</div>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${badge}`}>
          {txt}
        </span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-amarillo">
      <div className="px-4 py-3 bg-amarillo-light/60 border-b border-amarillo/30">
        <h2 className="font-bold text-[#7A5500] text-base">
          🔔 Herramientas que requieren atención
        </h2>
        <p className="text-[11px] text-[#7A5500]/80 mt-0.5">
          {enReparacion.length} en reparación hace +{DIAS_REPARACION_ALERTA}d ·
          {' '}{sinMov.length} sin movimiento hace +{DIAS_SIN_MOVIMIENTO}d
        </p>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {enReparacion.map(renderFila)}
        {sinMov.map(renderFila)}
      </div>
    </div>
  )
}
