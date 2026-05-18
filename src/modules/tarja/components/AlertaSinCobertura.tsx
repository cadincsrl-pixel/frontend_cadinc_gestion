'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Hora, Personal } from '@/types/domain.types'
import { getSemDays, getViernes, toISO } from '@/lib/utils/dates'

interface Props {
  personal:  Personal[]
  horas:     Hora[]
}

/**
 * Banner de alerta: gente trabajando esta semana sin cobertura.
 *
 * Trabajando = al menos 1 hora REAL (>0) en algún día de la semana actual
 * (vie→jue).
 *
 * Sin cobertura = `condicion = null`. No es ni 'blanco' (relación de
 * dependencia) ni 'asegurado' (informal con seguro).
 *
 * Si no hay coincidencias el componente no renderiza nada. Si hay 1+, se
 * muestra un banner rojo con el conteo. Click sobre el banner expande la
 * lista de personas con link al tab Personal de cada legajo.
 */
export function AlertaSinCobertura({ personal, horas }: Props) {
  const [expandido, setExpandido] = useState(false)

  const sinCobertura = useMemo(() => {
    if (!personal.length || !horas.length) return []
    const semDays = new Set(getSemDays(getViernes(new Date())).map(toISO))
    const legajosTrabajando = new Set(
      horas
        .filter(h => h.horas > 0 && semDays.has(h.fecha))
        .map(h => h.leg),
    )
    return personal.filter(p =>
      legajosTrabajando.has(p.leg) && p.condicion == null,
    )
  }, [personal, horas])

  if (sinCobertura.length === 0) return null

  const titulo =
    sinCobertura.length === 1
      ? '1 persona sin cobertura trabajando esta semana'
      : `${sinCobertura.length} personas sin cobertura trabajando esta semana`

  return (
    <div className="bg-rojo-light border-l-[5px] border-rojo rounded-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-rojo-light/70 transition-colors"
        aria-expanded={expandido}
      >
        <span className="text-2xl flex-shrink-0">🚨</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-rojo">{titulo}</div>
          <div className="text-[11px] text-rojo/80">
            Ni en blanco, ni con seguro contratado. Click para ver el detalle.
          </div>
        </div>
        <span className={`text-xs text-rojo font-bold transition-transform ${expandido ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expandido && (
        <ul className="border-t border-rojo/20 bg-white divide-y divide-gris">
          {sinCobertura.map(p => (
            <li key={p.leg} className="px-4 py-2.5 flex items-center gap-3 hover:bg-rojo-light/30 transition-colors">
              <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold flex-shrink-0">
                {p.leg}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-carbon truncate">{p.nom}</div>
                {p.dni && (
                  <div className="text-[11px] text-gris-dark font-mono">DNI {p.dni}</div>
                )}
              </div>
              <Link
                href={`/tarja?tab=personal&leg=${encodeURIComponent(p.leg)}`}
                className="text-[11px] font-bold px-2 py-1 rounded bg-rojo text-white hover:bg-rojo-dark transition-colors flex-shrink-0"
              >
                Revisar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
