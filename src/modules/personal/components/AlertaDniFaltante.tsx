'use client'

import { useMemo, useState } from 'react'
import type { Hora, Personal } from '@/types/domain.types'
import { getViernes, toISO } from '@/lib/utils/dates'
import { useResumenDocumentos } from '../hooks/usePersonalDocumentos'

interface Props {
  personal: Personal[]
  horas:    Hora[]
  /** Callback opcional cuando el user clickea una fila → abrir modal de edición. */
  onSelect?: (p: Personal) => void
}

/**
 * Banner amarillo: trabajadores ACTIVOS que no tienen ningún documento
 * tipo 'dni' subido. Sirve para que RR.HH. / admin completen los legajos
 * antes de que haga falta el papelito (alta AFIP, ART, etc.).
 *
 * Definición de "activo" replica `PersonalPage.esActivo`:
 *   - `activo_override === true` → activo manual.
 *   - `activo_override === false` → inactivo manual (queda fuera).
 *   - `null` → auto: activo si tuvo horas en las últimas 3 semanas.
 *   - Mensualizados (`modalidad === 'mes'`) cuentan como activos siempre
 *     porque no cargan horas.
 *
 * Sólo se renderiza si hay matches. Sin gate de verPii — cualquier user
 * con acceso a /personal lo ve.
 */
export function AlertaDniFaltante({ personal, horas, onSelect }: Props) {
  const [expandido, setExpandido] = useState(false)
  const { data: resumen } = useResumenDocumentos()

  const faltantes = useMemo(() => {
    if (!personal.length || !resumen) return []
    const legsConDni = new Set(resumen.dni ?? [])

    // legs con horas en las últimas 3 semanas → "activos auto"
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
      if (legsConDni.has(p.leg)) return false
      // Mensualizados: no cargan horas pero están activos por defecto.
      if (p.modalidad === 'mes') {
        return p.activo_override !== false
      }
      // Por hora: usa la regla esActivo.
      if (p.activo_override === true)  return true
      if (p.activo_override === false) return false
      return legsActivos3sem.has(p.leg)
    })
  }, [personal, horas, resumen])

  if (faltantes.length === 0) return null

  const titulo =
    faltantes.length === 1
      ? '1 trabajador activo sin DNI subido'
      : `${faltantes.length} trabajadores activos sin DNI subido`

  return (
    <div className="bg-[#FFF3CD] border-l-[5px] border-[#E0A800] rounded-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FFF3CD]/70 transition-colors"
        aria-expanded={expandido}
      >
        <span className="text-2xl flex-shrink-0">📇</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[#7A5000]">{titulo}</div>
          <div className="text-[11px] text-[#7A5000]/80">
            Cargales el frente del DNI en el legajo para tener el papelito al día.
            Click para ver el detalle.
          </div>
        </div>
        <span className={`text-xs text-[#7A5000] font-bold transition-transform ${expandido ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expandido && (
        <ul className="border-t border-[#E0A800]/20 bg-white divide-y divide-gris max-h-80 overflow-y-auto">
          {faltantes.map(p => (
            <li
              key={p.leg}
              className={`px-4 py-2.5 flex items-center gap-3 transition-colors ${onSelect ? 'hover:bg-[#FFF3CD]/30 cursor-pointer' : ''}`}
              onClick={onSelect ? () => onSelect(p) : undefined}
            >
              <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold flex-shrink-0">
                {p.leg}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-carbon truncate">{p.nom}</div>
                <div className="text-[11px] text-gris-dark flex items-center gap-1.5 flex-wrap">
                  {p.dni
                    ? <span className="font-mono">DNI {p.dni}</span>
                    : <span className="italic">Sin número de DNI cargado</span>}
                  <span>·</span>
                  <span>{p.modalidad === 'mes' ? 'Mensualizado' : 'Por hora'}</span>
                  {p.condicion && (<><span>·</span><span className="capitalize">{p.condicion}</span></>)}
                </div>
              </div>
              {onSelect && (
                <span className="text-[11px] font-bold px-2 py-1 rounded bg-[#E0A800] text-white flex-shrink-0">
                  Abrir
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
