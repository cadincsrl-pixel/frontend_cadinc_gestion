'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTarjaStore } from '../store/tarja.store'
import { useHorasSemana, useUpsertHora } from '../hooks/useHoras'
import { useHsExtras, useUpsertHsExtra } from '../hooks/useHsExtras'
import { useQuitarDeSemana } from '../hooks/useAsignaciones'
import { useCatObraSemana, useSetCatObra } from '../hooks/useCatObra'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { getSemDays, toISO, esFinde, esJueves, esHoy, DIAS } from '@/lib/utils/dates'
import { costoLeg, getVHenFecha, getTarifaEnFecha, fmtMonto, getHsExtrasLeg } from '@/lib/utils/costos'
import { useToast } from '@/components/ui/Toast'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type { Personal, Categoria, Hora, Tarifa } from '@/types/domain.types'

interface Props {
  obraCod: string
  personal: Personal[]
  categorias: Categoria[]
  tarifas: Tarifa[]
  onUndoStateChange?: (count: number, fn: () => void) => void
  readonly?: boolean
}

interface UndoEntry {
  leg: string
  fecha: string
  antes: number
}

function getHoraClass(h: number): string {
  if (h === 0) return 'border-gris-mid bg-white text-gris-mid'
  if (h >= 8) return 'border-verde/40 bg-verde-light text-verde'
  return 'border-[#E0A800] bg-[#FFF3CD] text-[#7A5000]'
}
export function TarjaTable({ obraCod, personal, categorias, tarifas, onUndoStateChange, readonly = false }: Props) {
  const { semActual } = useTarjaStore()
  const toast = useToast()
  const { puedeEditar, puedeEliminar } = usePermisos('tarja')
  const days = getSemDays(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

  const { data: horasData = [], isLoading } = useHorasSemana(obraCod, desde, hasta)
  const { data: hsExtrasData = [] } = useHsExtras(obraCod, desde, hasta)
  const { mutate: upsertHora } = useUpsertHora()
  const { mutateAsync: upsertHsExtra } = useUpsertHsExtra()
  const { mutate: quitarDeSemana } = useQuitarDeSemana()
  const perfiles = usePerfilesMap()

  // sem_key para esta semana = viernes (días[0] es viernes por getSemDays(semActual))
  const semKey = desde

  // ── Undo ──
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)

  // ── Categorías por obra+semana ──
  const { data: catObraData = [] } = useCatObraSemana(obraCod, desde)
  const { mutate: setCatObra } = useSetCatObra()

  // Mapa: leg → cat_id override para esta semana
  const catObraMap = catObraData.reduce<Record<string, number>>((acc, co) => {
    acc[co.leg] = co.cat_id
    return acc
  }, {})

  // Categoría efectiva: cat_obra override > personal.cat_id
  function getCatEfectiva(p: Personal): Categoria | undefined {
    const overrideCatId = catObraMap[p.leg]
    if (overrideCatId) return categorias.find(c => c.id === overrideCatId)
    return categorias.find(c => c.id === p.cat_id)
  }

  function handleCatChange(leg: string, catId: number) {
    setCatObra(
      { obra_cod: obraCod, leg, cat_id: catId, desde },
      {
        onSuccess: () => toast('✓ Categoría actualizada', 'ok'),
        onError: () => toast('Error al cambiar categoría', 'err'),
      }
    )
  }

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

  // Detectar trabajadores en múltiples obras esta semana
  const { data: horasSemana = [] } = useQuery({
    queryKey: ['horas', 'semana', desde, hasta],
    queryFn: () => apiGet<Hora[]>(`/api/horas/all?desde=${desde}&hasta=${hasta}`),
  })

  const multiObra = useMemo(() => {
    const legObras = new Map<string, Set<string>>()
    horasSemana.forEach(h => {
      if (!legObras.has(h.leg)) legObras.set(h.leg, new Set())
      legObras.get(h.leg)!.add(h.obra_cod)
    })
    return new Set(
      [...legObras.entries()]
        .filter(([, obras]) => obras.size > 1)
        .map(([leg]) => leg)
    )
  }, [horasSemana])

  // Totales usando la categoría efectiva (catObra override) de cada trabajador
  const { totalHs, totalCosto } = (() => {
    let hs = 0, costo = 0
    for (const p of personal) {
      const catId = catObraMap[p.leg] ?? p.cat_id
      const hsDias = days.reduce((s, d) => s + (horasMap[p.leg]?.[toISO(d)] ?? 0), 0)
      const hsExtra = getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey)
      hs += hsDias + hsExtra
      const vh = getVHenFecha(personal, categorias, tarifas, obraCod, p.leg, desde, catId)
      const costoBase = costoLeg(horasData, personal, categorias, tarifas, obraCod, p.leg, days, catId)
      const costoExtra = hsExtra * vh
      costo += Math.round((costoBase + costoExtra) / 1000) * 1000
    }
    return { totalHs: hs, totalCosto: costo }
  })()

  const handleChange = useCallback(
    (leg: string, fecha: string, val: string, antes: number) => {
      const horas = val === '' ? 0 : parseFloat(val)
      if (isNaN(horas) || horas < 0) return
      if (antes !== horas) {
        undoStack.current.push({ leg, fecha, antes })
        if (undoStack.current.length > 50) undoStack.current.shift()
        setUndoCount(undoStack.current.length)
      }
      upsertHora(
        { obra_cod: obraCod, fecha, leg, horas },
        { onError: () => toast('Error al guardar la hora', 'err') }
      )
    },
    [obraCod, upsertHora, toast]
  )

  const handleExtraChange = useCallback(
    (leg: string, val: string) => {
      const raw = val.trim()
      const hs = raw === '' ? 0 : parseFloat(raw)
      if (isNaN(hs) || hs < 0) return
      // Optimistic update + toast de error via el hook
      upsertHsExtra({ obra_cod: obraCod, leg, sem_key: semKey, hs }).catch(() => {
        // el toast ya se dispara desde el hook
      })
    },
    [obraCod, semKey, upsertHsExtra],
  )

  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    upsertHora(
      { obra_cod: obraCod, fecha: entry.fecha, leg: entry.leg, horas: entry.antes },
      {
        onSuccess: () => toast('↩ Deshecho', 'ok'),
        onError: () => toast('Error al deshacer', 'err'),
      }
    )
  }, [obraCod, upsertHora, toast])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (undoStack.current.length > 0) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  useEffect(() => {
    onUndoStateChange?.(undoCount, handleUndo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoCount])

  function handleQuitar(p: Personal) {
    if (!confirm(`¿Quitar a ${p.nom} de esta semana? Se borrarán sus horas cargadas.`)) return
    quitarDeSemana(
      { obraCod, leg: p.leg, desde, hasta },
      {
        onSuccess: () => toast(`✓ ${p.nom} quitado de esta semana`, 'ok'),
        onError: () => toast('Error al quitar trabajador', 'err'),
      }
    )
  }

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
        <p className="font-semibold text-azul mb-1">No hay trabajadores en esta semana</p>
        <p className="text-sm">Agregá trabajadores o copiá la semana anterior.</p>
      </div>
    )
  }

  return (
    <div id="tarja-table-top" className="bg-white rounded-card shadow-card overflow-hidden">

      <div className="overflow-x-auto">
        <table className="border-collapse w-full min-w-[750px]">
          <thead>
            <tr>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap w-8" />
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap">
                Leg.
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[170px]">
                Trabajador
              </th>
              <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[160px]">
                Categoría
              </th>
              {days.map((d, i) => (
                <th
                  key={i}
                  className={`
                    text-white text-xs font-bold px-2 py-2.5 text-center uppercase
                    tracking-wide min-w-[70px] font-mono
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
              <th className="bg-[#8B3510] text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[72px]">
                Extras
              </th>
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
              const catEfectiva = getCatEfectiva(p)
              const catId = catEfectiva?.id ?? p.cat_id
              const hsDiasLeg = days.reduce((s, d) => s + getH(p.leg, toISO(d)), 0)
              const hsExtraLeg = getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey)
              const totalLeg = hsDiasLeg + hsExtraLeg
              const fechaRef = toISO(days[0]!)
              const vh = getVHenFecha(personal, categorias, tarifas, obraCod, p.leg, fechaRef, catId)
              const costoBase = costoLeg(horasData, personal, categorias, tarifas, obraCod, p.leg, days, catId)
              const costo = costoBase + hsExtraLeg * vh

              // Última hora editada de este trabajador en la semana
              const lastHora = horasData
                .filter((h: Hora) => h.leg === p.leg && h.updated_by)
                .sort((a: Hora, b: Hora) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
                [0] as Hora | undefined

              return (
                <tr
                  key={p.leg}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                >
                  <td className="px-1 py-1.5 text-center">
                    {puedeEliminar && (
                      <button
                        onClick={() => handleQuitar(p)}
                        title={`Quitar ${p.nom} de esta semana`}
                        className="w-6 h-6 rounded flex items-center justify-center text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                  <td className="font-mono text-xs text-gris-dark px-3 py-1.5 font-semibold whitespace-nowrap">
                    {p.leg}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm">{p.nom}</span>
                      {multiObra.has(p.leg) && (
                        <span
                          className="text-[10px] font-bold bg-[#E0A800] text-white px-1.5 py-0.5 rounded"
                          title="Este trabajador tiene horas en otra obra esta semana"
                        >
                          ↔
                        </span>
                      )}
                    </div>
                    {lastHora?.updated_by && (
                      <div className="text-[9px] text-gris-dark leading-tight mt-0.5">
                        ✎ {perfiles.get(lastHora.updated_by) ?? '…'}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <select
                      value={catId}
                      disabled={!puedeEditar}
                      onChange={puedeEditar ? (e) => handleCatChange(p.leg, Number(e.target.value)) : undefined}
                      className={`
                        w-full px-2 py-1 rounded border-[1.5px]
                        text-xs font-bold bg-white text-carbon outline-none
                        transition-colors
                        ${getTarifaEnFecha(tarifas, obraCod, catId, fechaRef) !== null
                          ? 'border-naranja text-naranja'
                          : 'border-gris-mid'
                        }
                        ${puedeEditar
                          ? 'cursor-pointer hover:border-naranja focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.15)]'
                          : 'cursor-not-allowed opacity-60'
                        }
                      `}
                    >
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nom} — ${cat.vh.toLocaleString('es-AR')}/h
                        </option>
                      ))}
                    </select>
                    {getTarifaEnFecha(tarifas, obraCod, catId, fechaRef) !== null && (
                      <div className="text-[10px] font-bold text-naranja mt-0.5 flex items-center gap-0.5">
                        <span>★</span>
                        <span>${vh.toLocaleString('es-AR')}/h</span>
                      </div>
                    )}
                  </td>
                  {days.map((d, i) => {
                    const fecha = toISO(d)
                    const h = getH(p.leg, fecha)
                    return (
                      <td key={i} className="px-1.5 py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          key={`${p.leg}-${fecha}-${h}`}
                          defaultValue={h || ''}
                          readOnly={!puedeEditar || readonly}
                          onBlur={puedeEditar && !readonly ? e => handleChange(p.leg, fecha, e.target.value, h) : undefined}
                          onKeyDown={puedeEditar && !readonly ? e => {
                            if (e.key === 'Enter') {
                              const antes = h
                              handleChange(p.leg, fecha, (e.target as HTMLInputElement).value, antes)
                              const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]')
                              const idx = Array.from(inputs).indexOf(e.target as HTMLInputElement)
                              inputs[idx + 1]?.focus()
                            }
                          } : undefined}
                          className={`
                              w-14 h-8 border-[1.5px] rounded-md
                              text-center font-mono text-sm font-bold
                              outline-none transition-colors
                              ${puedeEditar
                                ? 'focus:border-naranja focus:shadow-[0_0_0_3px_rgba(232,98,26,.15)]'
                                : 'cursor-not-allowed opacity-60'
                              }
                              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                              [&::-webkit-inner-spin-button]:appearance-none
                              ${getHoraClass(h)}
                            `}
                        />
                      </td>
                    )
                  })}
                  <td className="px-1.5 py-1.5 text-center">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      max={200}
                      key={`extra-${p.leg}-${semKey}-${hsExtraLeg}`}
                      defaultValue={hsExtraLeg || ''}
                      readOnly={!puedeEditar || readonly}
                      title="Horas extras de la semana"
                      onBlur={puedeEditar && !readonly
                        ? e => handleExtraChange(p.leg, e.target.value)
                        : undefined}
                      onKeyDown={puedeEditar && !readonly ? e => {
                        if (e.key === 'Enter') {
                          handleExtraChange(p.leg, (e.target as HTMLInputElement).value)
                          ;(e.target as HTMLInputElement).blur()
                        }
                      } : undefined}
                      className={`
                          w-14 h-8 border-[1.5px] rounded-md
                          text-center font-mono text-sm font-bold
                          outline-none transition-colors
                          ${puedeEditar && !readonly
                            ? 'focus:border-[#8B3510] focus:shadow-[0_0_0_3px_rgba(139,53,16,.15)]'
                            : 'cursor-not-allowed opacity-60'
                          }
                          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                          [&::-webkit-inner-spin-button]:appearance-none
                          ${hsExtraLeg > 0
                            ? 'border-[#8B3510] bg-[#FFF3CD] text-[#7A3510]'
                            : 'border-gris-mid bg-white text-gris-mid'}
                        `}
                    />
                  </td>
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
              <td colSpan={4} className="bg-azul text-white font-display text-lg tracking-wide px-3 py-2.5">
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
              <td className="bg-azul text-[#E8B478] font-mono text-sm font-bold text-center px-2 py-2.5">
                {(() => {
                  const totExtras = personal.reduce((s, p) => s + getHsExtrasLeg(hsExtrasData, obraCod, p.leg, semKey), 0)
                  return totExtras > 0 ? totExtras : '—'
                })()}
              </td>
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
