'use client'

import { useMemo, useState } from 'react'
import type { Hora, Personal } from '@/types/domain.types'
import { getViernes, toISO } from '@/lib/utils/dates'
import { useResumenDocumentos } from '../hooks/usePersonalDocumentos'

interface Props {
  personal: Personal[]
  horas:    Hora[]
  onSelect?: (p: Personal) => void
}

type DatoFaltante = 'dni' | 'dir' | 'tel'

interface Faltante {
  persona: Personal
  faltan:  DatoFaltante[]
}

const LABEL: Record<DatoFaltante, string> = {
  dni: 'DNI',
  dir: 'Dirección',
  tel: 'Teléfono',
}

export function AlertaDniFaltante({ personal, horas, onSelect }: Props) {
  const [expandido, setExpandido] = useState(false)
  const { data: resumen } = useResumenDocumentos()

  const faltantes = useMemo(() => {
    if (!personal.length || !resumen) return [] as Faltante[]
    const legsConDni = new Set(resumen.dni ?? [])

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

    const esActivo = (p: Personal) => {
      if (p.modalidad === 'mes') return p.activo_override !== false
      if (p.activo_override === true) return true
      if (p.activo_override === false) return false
      return legsActivos3sem.has(p.leg)
    }

    const resultado: Faltante[] = []
    for (const p of personal) {
      if (!esActivo(p)) continue
      const faltan: DatoFaltante[] = []
      if (!legsConDni.has(p.leg)) faltan.push('dni')
      if (!p.dir?.trim()) faltan.push('dir')
      if (!p.tel?.trim()) faltan.push('tel')
      if (faltan.length > 0) resultado.push({ persona: p, faltan })
    }
    return resultado
  }, [personal, horas, resumen])

  if (faltantes.length === 0) return null

  const titulo =
    faltantes.length === 1
      ? '1 trabajador activo con datos faltantes'
      : `${faltantes.length} trabajadores activos con datos faltantes`

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
            Completá DNI, dirección y teléfono en el legajo.
            Click para ver el detalle.
          </div>
        </div>
        <span className={`text-xs text-[#7A5000] font-bold transition-transform ${expandido ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expandido && (
        <ul className="border-t border-[#E0A800]/20 bg-white divide-y divide-gris max-h-80 overflow-y-auto">
          {faltantes.map(({ persona: p, faltan }) => (
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
                  <span>Falta: {faltan.map(f => LABEL[f]).join(', ')}</span>
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
