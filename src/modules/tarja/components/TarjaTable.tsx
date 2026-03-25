'use client'

import { useCallback } from 'react'
import { useTarjaStore } from '../store/tarja.store'
import { useHorasSemana, useUpsertHora } from '../hooks/useHoras'
import { getSemDays, toISO, esFinde, esJueves, esHoy, DIAS } from '@/lib/utils/dates'
import { useToast } from '@/components/ui/Toast'
import type { Personal, Categoria, Hora } from '@/types/domain.types'

interface Props {
  obraCod: string
  personal: Personal[]
  categorias: Categoria[]
}

function getHoraClass(h: number | ''): string {
  if (h === '' || h === 0) return 'text-gris-mid'
  if (h >= 8) return 'bg-verde-light border-verde/40 text-verde'
  if (h >= 5) return 'bg-amarillo-light border-amarillo/40 text-[#7A5500]'
  return ''
}

export function TarjaTable({ obraCod, personal, categorias }: Props) {
  const { semActual } = useTarjaStore()
  const toast = useToast()
  const days = getSemDays(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

  const { data: horasData = [], isLoading } = useHorasSemana(obraCod, desde, hasta)
  const { mutate: upsertHora } = useUpsertHora()

  // Construir mapa horas: leg → fecha → horas
  const horasMap = horasData.reduce<Record<string, Record<string, number>>>(
    (acc, h: Hora) => {
      if (!acc[h.leg]) acc[h.leg] = {}
      acc[h.leg]![h.fecha] = h.horas
      return acc
    },
    {}
  )

  const getH = (leg: string, fecha: string): number =>
    horasMap[leg]?.[fecha] ?? 0

  const totalHsLeg = (leg: string): number =>
    days.reduce((s, d) => s + getH(leg, toISO(d)), 0)

  const totalHsSem = (): number =>
    personal.reduce((s, p) => s + totalHsLeg(p.leg), 0)

  const handleChange = useCallback(
    (leg: string, fecha: string, val: string) => {
      const horas = val === '' ? 0 : parseFloat(val)
      if (isNaN(horas) || horas < 0 || horas > 24) return
      upsertHora(
        { obra_cod: obraCod, fecha, leg, horas },
        {
          onError: () => toast('Error al guardar la hora', 'err'),
        }
      )
    },
    [obraCod, upsertHora, toast]
  )

  if (isLoading) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando horas...
      </div>
    )
  }

  if (personal.length === 0) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark">
        <p className="font-semibold text-azul mb-1">No hay trabajadores asignados</p>
        <p className="text-sm">Asigná trabajadores a esta obra para cargar horas.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="overflow-x-auto cursor-grab active:cursor-grabbing">
        <table className="border-collapse w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap">
                Leg.
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[170px]">
                Trabajador
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[140px]">
                Categoría
              </th>
              {days.map((d, i) => (
                <th
                  key={i}
                  className={`
                    text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[70px]
                    font-mono
                    ${esHoy(d) ? 'bg-verde' : ''}
                    ${esJueves(d) ? 'bg-[#8B3510]' : ''}
                    ${esFinde(d) ? 'bg-[#5A2008]' : ''}
                    ${!esHoy(d) && !esJueves(d) && !esFinde(d) ? 'bg-naranja' : ''}
                  `}
                >
                  {DIAS[i]}<br />
                  <span className="text-[10px] opacity-80">
                    {d.getDate()}/{d.getMonth() + 1}
                  </span>
                </th>
              ))}
              <th className="bg-verde text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {personal.map((p) => {
              const cat = categorias.find(c => c.id === p.cat_id)
              const totalLeg = totalHsLeg(p.leg)

              return (
                <tr
                  key={p.leg}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                >
                  <td className="font-mono text-xs text-gris-dark px-3 py-1.5 font-semibold whitespace-nowrap">
                    {p.leg}
                  </td>
                  <td className="font-bold text-sm px-3 py-1.5 whitespace-nowrap">
                    {p.nom}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded bg-naranja-light text-naranja-dark text-xs font-bold">
                      {cat?.nom ?? '—'}
                    </span>
                  </td>
                  {days.map((d, i) => {
                    const fecha = toISO(d)
                    const h = getH(p.leg, fecha)
                    return (
                      <td key={i} className="px-1.5 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          key={`${p.leg}-${fecha}-${h}`}
                          defaultValue={h || ''}
                          onBlur={e => handleChange(p.leg, fecha, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              handleChange(p.leg, fecha, (e.target as HTMLInputElement).value)
                              // Mover al siguiente input
                              const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
                              const idx = Array.from(inputs).indexOf(e.target as HTMLInputElement)
                              inputs[idx + 1]?.focus()
                            }
                          }}
                          className={`
                            w-14 h-8 border-[1.5px] border-gris-mid rounded-md
                            text-center font-mono text-sm font-bold
                            bg-white text-carbon outline-none transition-colors
                            focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.15)]
                            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                            [&::-webkit-inner-spin-button]:appearance-none
                            ${getHoraClass(h)}
                          `}
                        />
                      </td>
                    )
                  })}
                  <td className="text-center bg-verde-light font-mono text-sm font-bold text-verde px-2 py-1.5 whitespace-nowrap">
                    {totalLeg > 0 ? totalLeg : '—'}
                  </td>
                </tr>
              )
            })}

            {/* Fila totales */}
            <tr className="border-t-[3px] border-naranja">
              <td
                colSpan={3}
                className="bg-azul text-white font-display text-lg tracking-wide px-3 py-2.5"
              >
                TOTAL SEMANA
              </td>
              {days.map((d, i) => {
                const totalDia = personal.reduce(
                  (s, p) => s + getH(p.leg, toISO(d)), 0
                )
                return (
                  <td
                    key={i}
                    className="bg-azul text-white font-mono text-sm font-bold text-center px-2 py-2.5"
                  >
                    {totalDia > 0 ? totalDia : '—'}
                  </td>
                )
              })}
              <td className="bg-azul text-naranja font-mono text-sm font-bold text-center px-2 py-2.5">
                {totalHsSem()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}