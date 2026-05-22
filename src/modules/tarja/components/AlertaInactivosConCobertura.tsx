'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Hora, Personal } from '@/types/domain.types'
import { getViernes, toISO } from '@/lib/utils/dates'

interface Props {
  personal: Personal[]
  horas:    Hora[]
}

/**
 * Banner naranja: trabajadores **inactivos** que conservan cobertura (`blanco`
 * o `asegurado`). Si están inactivos pero CADINC sigue pagando ART o seguro
 * privado, hay sangrado financiero.
 *
 * Definición de **inactivo** (replica `PersonalPage.esActivo`):
 *   - `activo_override === false` → inactivo manual.
 *   - `activo_override === null` y SIN horas en las últimas 3 semanas → inactivo auto.
 *
 * Sólo se renderiza si hay matches. Click expande la lista con link al tab
 * Personal de cada legajo para que el admin baje la cobertura.
 */
export function AlertaInactivosConCobertura({ personal, horas }: Props) {
  const [expandido, setExpandido] = useState(false)

  const inactivosConCobertura = useMemo(() => {
    if (!personal.length) return []

    // Legs con horas en las últimas 3 semanas (calculado por viernes ISO).
    const hoy = new Date()
    const semCorte3 = (() => {
      const d = new Date(hoy); d.setDate(d.getDate() - 3 * 7)
      return toISO(getViernes(d))
    })()
    const legsActivos3sem = new Set(
      horas
        .filter(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) >= semCorte3)
        .map(h => h.leg),
    )

    return personal.filter(p => {
      // Mensualizados nunca cargan horas → la regla "sin horas en 3 sem"
      // los marcaría siempre como inactivos. Quedan fuera de la alerta.
      if (p.modalidad === 'mes') return false
      const tieneCobertura = p.condicion === 'blanco' || p.condicion === 'asegurado'
      if (!tieneCobertura) return false
      // ¿Está inactivo según la regla esActivo invertida?
      if (p.activo_override === true)  return false           // activo manual → no
      if (p.activo_override === false) return true            // inactivo manual → sí
      return !legsActivos3sem.has(p.leg)                      // auto: inactivo si sin horas recientes
    })
  }, [personal, horas])

  if (inactivosConCobertura.length === 0) return null

  const titulo =
    inactivosConCobertura.length === 1
      ? '1 trabajador inactivo con cobertura activa'
      : `${inactivosConCobertura.length} trabajadores inactivos con cobertura activa`

  return (
    <div className="bg-naranja-light border-l-[5px] border-naranja rounded-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-naranja-light/70 transition-colors"
        aria-expanded={expandido}
      >
        <span className="text-2xl flex-shrink-0">💸</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-naranja-dark">{titulo}</div>
          <div className="text-[11px] text-naranja-dark/80">
            Sin horas en las últimas 3 semanas, pero todavía en blanco o asegurado.
            Click para ver el detalle.
          </div>
        </div>
        <span className={`text-xs text-naranja-dark font-bold transition-transform ${expandido ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expandido && (
        <ul className="border-t border-naranja/20 bg-white divide-y divide-gris">
          {inactivosConCobertura.map(p => {
            const motivo = p.activo_override === false ? 'baja manual' : 'sin horas >3 sem'
            const condChip = p.condicion === 'blanco' ? 'En blanco' : 'Asegurado'
            return (
              <li key={p.leg} className="px-4 py-2.5 flex items-center gap-3 hover:bg-naranja-light/30 transition-colors">
                <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold flex-shrink-0">
                  {p.leg}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-carbon truncate">{p.nom}</div>
                  <div className="text-[11px] text-gris-dark flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-naranja-dark">{condChip}</span>
                    <span>·</span>
                    <span>{motivo}</span>
                    {p.dni && (<><span>·</span><span className="font-mono">DNI {p.dni}</span></>)}
                  </div>
                </div>
                <Link
                  href={`/personal?leg=${encodeURIComponent(p.leg)}`}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-naranja text-white hover:bg-naranja-dark transition-colors flex-shrink-0"
                >
                  Revisar
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
