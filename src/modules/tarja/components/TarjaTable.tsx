'use client'

import { useCallback } from 'react'
import { useTarjaStore } from '../store/tarja.store'
import { useHorasSemana, useUpsertHora } from '../hooks/useHoras'
import { getSemDays, toISO, esFinde, esJueves, esHoy, DIAS } from '@/lib/utils/dates'
import { costoLeg, getVHenFecha, calcularTotalesSemana, fmtMonto } from '@/lib/utils/costos'
import { useToast } from '@/components/ui/Toast'
import type { Personal, Categoria, Hora, Tarifa } from '@/types/domain.types'

interface Props {
  obraCod: string
  personal: Personal[]
  categorias: Categoria[]
  tarifas: Tarifa[]
}

function getHoraClass(h: number): string {
  if (h === 0) return 'text-gris-mid'
  if (h >= 8)  return 'bg-verde-light border-verde/40 text-verde'
  if (h >= 5)  return 'bg-amarillo-light border-amarillo/40 text-[#7A5500]'
  return ''
}

export function TarjaTable({ obraCod, personal, categorias, tarifas }: Props) {
  const { semActual } = useTarjaStore()
  const toast = useToast()
  const days  = getSemDays(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

  const { data: horasData = [], isLoading } = useHorasSemana(obraCod, desde, hasta)
  const { mutate: upsertHora } = useUpsertHora()

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

  const { totalHs, totalCosto } = calcularTotalesSemana(
    horasData, personal, categorias, tarifas, obraCod, days
  )

  const handleChange = useCallback(
    (leg: string, fecha: string, val: string) => {
      const horas = val === '' ? 0 : parseFloat(val)
      if (isNaN(horas) || horas < 0 || horas > 24) return
      upsertHora(
        { obra_cod: obraCod, fecha, leg, horas },
        { onError: () => toast('Error al guardar la hora', 'err') }
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
      <div className="overflow-x-auto">
        <table className="border-collapse w-full min-w-[700px]">
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
                    text-white text-xs font-bold px-2 py-2.5 text-center uppercase
                    tracking-wide min-w-[70px] font-mono
                    ${esHoy(d)    ? 'bg-verde'     : ''}
                    ${esJueves(d) ? 'bg-[#8B3510]' : ''}
                    ${esFinde(d)  ? 'bg-[#5A2008]' : ''}
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
              <th className="bg-[#0F4A28] text-white text-xs font-bold px-3 py-2.5 text-right uppercase tracking-wide min-w-[130px]">
                Costo · $/h
              </th>
            </tr>
          </thead>
          <tbody>
            {personal.map((p) => {
              const cat      = categorias.find(c => c.id === p.cat_id)
              const totalLeg = days.reduce((s, d) => s + getH(p.leg, toISO(d)), 0)
              const fechaRef = toISO(days[0]!)
              const vh       = getVHenFecha(personal, categorias, tarifas, obraCod, p.leg, fechaRef)
              const costo    = costoLeg(horasData, personal, categorias, tarifas, obraCod, p.leg, days)

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
                    const h     = getH(p.leg, fecha)
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
                  <td className="text-right bg-azul-light px-3 py-1.5 whitespace-nowrap">
                    <div className="font-mono text-sm font-bold text-azul-mid">
                      {costo > 0 ? fmtMonto(costo) : '—'}
                    </div>
                    <div className="text-[10px] text-gris-dark font-mono">
                      ${vh.toLocaleString('es-AR')}/h
                    </div>
                  </td>
                </tr>
              )
            })}

            {/* Fila totales */}
            <tr className="border-t-[3px] border-naranja">
              <td colSpan={3} className="bg-azul text-white font-display text-lg tracking-wide px-3 py-2.5">
                TOTAL SEMANA
              </td>
              {days.map((d, i) => {
                const totalDia = personal.reduce((s, p) => s + getH(p.leg, toISO(d)), 0)
                return (
                  <td key={i} className="bg-azul text-white font-mono text-sm font-bold text-center px-2 py-2.5">
                    {totalDia > 0 ? totalDia : '—'}
                  </td>
                )
              })}
              <td className="bg-azul text-[#7DD9A2] font-mono text-sm font-bold text-center px-2 py-2.5">
                {totalHs > 0 ? totalHs : '—'}
              </td>
              <td className="bg-azul text-naranja font-mono text-sm font-bold text-right px-3 py-2.5">
                {totalCosto > 0 ? fmtMonto(totalCosto) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}