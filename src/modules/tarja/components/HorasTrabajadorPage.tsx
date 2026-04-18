'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import {
  toISO, getViernes, getSemDays, getSemLabel, DIAS,
  esHoy, esJueves, esFinde,
} from '@/lib/utils/dates'
import { totalHsLeg } from '@/lib/utils/costos'
import { exportarHorasTrabajador } from '@/lib/utils/excel'
import { Chip } from '@/components/ui/Chip'
import { useToast } from '@/components/ui/Toast'
import { useUpsertHora } from '@/modules/tarja/hooks/useHoras'
import { usePermisos } from '@/hooks/usePermisos'
import type { Hora, Tarifa, Personal, Categoria } from '@/types/domain.types'

export function HorasTrabajadorPage() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { puedeEditar } = usePermisos('tarja')
  const { mutate: upsertHora } = useUpsertHora()
  const perfiles = usePerfilesMap()

  // ── Estado ──
  const [semActual, setSemActual] = useState(() => getViernes(new Date()))
  const [filtroObra, setFiltroObra] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // ── Semana ──
  const days = getSemDays(semActual)
  const semKey = toISO(semActual)
  const desde = toISO(days[0]!)
  const hasta = toISO(days[6]!)

  // ── Datos ──
  const { data: personal = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: obras = [] } = useObras()

  const { data: todasHoras = [], isLoading } = useQuery({
    queryKey: ['horas', 'semana', desde, hasta],
    queryFn: () => apiGet<Hora[]>(`/api/horas/all?desde=${desde}&hasta=${hasta}`),
  })
  const { data: todasTarifas = [] } = useQuery({
    queryKey: ['tarifas', 'all'],
    queryFn: () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })
  const { data: todasCatObra = [] } = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }>>('/api/cat-obra/all'),
  })

  function navSem(dir: number) {
    const nueva = new Date(semActual)
    nueva.setDate(nueva.getDate() + dir * 7)
    setSemActual(nueva)
  }
  function irHoy() {
    setSemActual(getViernes(new Date()))
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const semanasPickerList = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const vie = getViernes(new Date())
      vie.setDate(vie.getDate() + (2 - i) * 7)
      return new Date(vie)
    }).reverse()
  }, [])

  const esHoyFlag = toISO(semActual) === toISO(getViernes(new Date()))



  // ── Helpers ──
  function getLegsActivos(obraCod: string): string[] {
    return [...new Set(
      todasHoras
        .filter(h => h.obra_cod === obraCod && h.fecha >= desde && h.fecha <= hasta)
        .map(h => h.leg)
    )]
  }

  function getCatIdEfectivo(obraCod: string, leg: string, fechaRef: string): number | null {
    const catObraAll = todasCatObra
      .filter(co => co.obra_cod === obraCod && co.leg === leg)
    if (catObraAll.length > 0) {
      let best: { cat_id: number; desde: string } | null = null
      for (const h of catObraAll) {
        if (h.desde <= fechaRef) {
          if (!best || h.desde >= best.desde) best = h
        }
      }
      if (best) return best.cat_id
      return catObraAll.reduce((a, b) => a.desde <= b.desde ? a : b).cat_id
    }
    const p = personal.find(x => x.leg === leg)
    if (!p) return null
    const hist = [...(p.personal_cat_historial ?? [])]
      .sort((a, b) => a.desde.localeCompare(b.desde))
    let catId = p.cat_id
    for (const h of hist) {
      if (h.desde <= fechaRef) catId = h.cat_id
    }
    return catId
  }

  function getCostoLeg(obraCod: string, leg: string): number {
    const semStartStr = toISO(days[0]!)
    const hoyStr = toISO(new Date())
    const esSemActualFlag = semStartStr === toISO(getViernes(new Date()))
    const fechaRef = esSemActualFlag ? hoyStr : semStartStr

    const catId = getCatIdEfectivo(obraCod, leg, fechaRef)
    if (!catId) return 0

    const tarifaObraAll = todasTarifas
      .filter(t => t.obra_cod === obraCod && t.cat_id === catId)
      .sort((a, b) => a.desde.localeCompare(b.desde))

    let vh: number | null = null
    if (tarifaObraAll.length > 0) {
      for (const t of tarifaObraAll) {
        if (t.desde <= fechaRef) vh = t.vh
        else break
      }
      if (vh === null) vh = tarifaObraAll[0]!.vh
    } else {
      vh = categorias.find(c => c.id === catId)?.vh ?? 0
    }

    const hs = totalHsLeg(todasHoras, obraCod, leg, days.map(toISO))
    return hs * vh
  }

  function getCatNom(catId: number | null): string {
    if (!catId) return '—'
    return categorias.find(c => c.id === catId)?.nom ?? '—'
  }

  function fmtM(n: number): string {
    return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR')
  }

  function getH(obraCod: string, fecha: string, leg: string): number {
    return todasHoras.find(
      h => h.obra_cod === obraCod && h.fecha === fecha && h.leg === leg
    )?.horas ?? 0
  }

  // ── Filas: una por leg+obra ──
  const obrasTarget = useMemo(() => {
    return filtroObra ? obras.filter(o => o.cod === filtroObra) : obras
  }, [obras, filtroObra])

  const filas = useMemo(() => {
    const result: Array<{
      p: Personal
      obra: typeof obras[0]
      horasPorDia: Record<string, number>
      totalHs: number
      totalCosto: number
      leg: string
    }> = []

    obrasTarget.forEach(o => {
      const legsActivos = getLegsActivos(o.cod)
      legsActivos.forEach(leg => {
        const p = personal.find(x => x.leg === leg)
        if (!p) return

        const horasPorDia: Record<string, number> = {}
        let tHs = 0
        days.forEach(d => {
          const ds = toISO(d)
          const h = getH(o.cod, ds, leg)
          horasPorDia[ds] = h
          tHs += h
        })

        // Omitir filas vacías salvo filtro específico de obra
        if (tHs === 0 && !filtroObra) return

        const totalCosto = Math.round(getCostoLeg(o.cod, leg) / 1000) * 1000
        result.push({ p, obra: o, horasPorDia, totalHs: tHs, totalCosto, leg })
      })
    })

    // Ordenar por nombre y luego obra
    result.sort((a, b) => a.p.nom.localeCompare(b.p.nom) || a.obra.cod.localeCompare(b.obra.cod))

    return result
  }, [obrasTarget, personal, todasHoras, todasTarifas, todasCatObra, categorias, days, semKey, desde, hasta, filtroObra])

  // Filtrar por búsqueda
  const filasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return filas
    return filas.filter(f =>
      f.p.nom.toLowerCase().includes(q) ||
      f.p.leg.toLowerCase().includes(q) ||
      (f.p.dni ?? '').includes(q)
    )
  }, [filas, busqueda])

  // Detectar legs en múltiples obras
  const multiObra = useMemo(() => {
    const legCount = new Map<string, Set<string>>()
    filasFiltradas.forEach(f => {
      if (!legCount.has(f.leg)) legCount.set(f.leg, new Set())
      legCount.get(f.leg)!.add(f.obra.cod)
    })
    return new Set(
      [...legCount.entries()].filter(([, obras]) => obras.size > 1).map(([leg]) => leg)
    )
  }, [filasFiltradas])

  // Totales
  const totHs = filasFiltradas.reduce((s, f) => s + f.totalHs, 0)
  const totCosto = filasFiltradas.reduce((s, f) => s + f.totalCosto, 0)
  const uniqueLegs = new Set(filasFiltradas.map(f => f.leg)).size

  // ── Lista de render: inserta fila de subtotal después de cada worker multi-obra ──
  type FilaData = typeof filasFiltradas[0]
  type FilaRender =
    | { type: 'fila'; data: FilaData }
    | { type: 'subtotal'; leg: string; p: Personal; obraCount: number; totalHs: number; totalCosto: number; horasPorDia: Record<string, number> }

  const filasRender = useMemo((): FilaRender[] => {
    const result: FilaRender[] = []
    let i = 0
    while (i < filasFiltradas.length) {
      const leg = filasFiltradas[i]!.leg
      let j = i
      while (j < filasFiltradas.length && filasFiltradas[j]!.leg === leg) j++
      const legRows = filasFiltradas.slice(i, j)
      legRows.forEach(r => result.push({ type: 'fila', data: r }))
      if (legRows.length > 1) {
        const totalHs   = legRows.reduce((s, r) => s + r.totalHs,   0)
        const totalCosto = legRows.reduce((s, r) => s + r.totalCosto, 0)
        const horasPorDia: Record<string, number> = {}
        days.forEach(d => {
          const ds = toISO(d)
          horasPorDia[ds] = legRows.reduce((s, r) => s + (r.horasPorDia[ds] ?? 0), 0)
        })
        result.push({ type: 'subtotal', leg, p: legRows[0]!.p, obraCount: legRows.length, totalHs, totalCosto, horasPorDia })
      }
      i = j
    }
    return result
  }, [filasFiltradas, days])

  // ── Edición inline ──
  const [editingCell, setEditingCell] = useState<{ key: string; val: string } | null>(null)

  function cellKey(leg: string, obraCod: string, fecha: string) {
    return `${leg}-${obraCod}-${fecha}`
  }

  function handleCellChange(leg: string, obraCod: string, fecha: string, val: string) {
    setEditingCell({ key: cellKey(leg, obraCod, fecha), val })
  }

  function handleCellBlur(leg: string, obraCod: string, fecha: string, antes: number, val: string) {
    setEditingCell(null)
    const horas = val === '' ? 0 : parseFloat(val)
    if (isNaN(horas) || horas < 0) return
    if (horas === antes) return
    upsertHora(
      { obra_cod: obraCod, fecha, leg, horas },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['horas', 'semana'] })
          toast('✓ Hora guardada', 'ok')
        },
        onError: () => toast('Error al guardar', 'err'),
      }
    )
  }

  const mostrarObra = !filtroObra

  const hoyRef = toISO(new Date())

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* ── Header con navegación de semana ── */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-[1.8rem] tracking-wider text-azul leading-none">
              📋 HORAS POR TRABAJADOR
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="relative" ref={pickerRef}>
                <div className="flex items-center bg-white border-[1.5px] border-gris-mid rounded-[9px] shadow-card overflow-hidden">
                  <button
                    onClick={() => navSem(-1)}
                    className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setPickerOpen(p => !p)}
                    className="px-4 py-2 text-sm font-bold text-azul border-x border-gris-mid min-w-[230px] text-center whitespace-nowrap hover:bg-gris transition-colors"
                  >
                    {getSemLabel(semActual)}
                    {esHoyFlag && (
                      <span className="ml-2 bg-naranja text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Actual
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => navSem(1)}
                    className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
                  >
                    ›
                  </button>
                </div>

                {pickerOpen && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-[500] bg-white border-[1.5px] border-gris-mid rounded-xl shadow-card-lg min-w-[300px] max-h-[360px] overflow-y-auto">
                    <div className="px-4 py-2 text-[10px] font-bold text-gris-dark uppercase tracking-wider bg-gris border-b border-gris-mid rounded-t-xl sticky top-0">
                      Elegí una semana
                    </div>
                    {semanasPickerList.map(vie => {
                      const sk = toISO(vie)
                      const isSelected = sk === toISO(semActual)
                      const isActual = sk === toISO(getViernes(new Date()))

                      return (
                        <button
                          key={sk}
                          onClick={() => { setSemActual(vie); setPickerOpen(false) }}
                          className={`
                w-full flex items-center justify-between px-4 py-2.5 text-left
                border-b border-gris last:border-0 transition-colors
                ${isSelected ? 'bg-azul-light font-bold text-azul' : 'hover:bg-gris'}
              `}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-carbon">
                              {getSemLabel(vie)}
                            </span>
                            {isActual && (
                              <span className="text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded-full">
                                Actual
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {!esHoyFlag && (
                <button
                  onClick={irHoy}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-gris text-gris-dark hover:bg-azul hover:text-white transition-all border border-gris-mid"
                >
                  Semana actual
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Chip value={uniqueLegs} label="Trabajadores" />
            <Chip value={totHs > 0 ? `${totHs}` : '0'} label="Horas totales" />
            <Chip value={fmtM(totCosto)} label="Costo total" variant="green" />
            <button
              onClick={() => exportarHorasTrabajador(
                semActual,
                filasFiltradas.map(f => ({
                  leg:         f.leg,
                  nom:         f.p.nom,
                  dni:         f.p.dni,
                  catNom:      getCatNom(getCatIdEfectivo(f.obra.cod, f.leg, hoyRef)),
                  obraCod:     f.obra.cod,
                  obraNom:     f.obra.nom,
                  horasPorDia: f.horasPorDia,
                  totalHs:     f.totalHs,
                  totalCosto:  f.totalCosto,
                }))
              )}
              disabled={filasFiltradas.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-verde-light text-verde border border-verde/30 text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              📊 Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filtroObra}
          onChange={e => setFiltroObra(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
        >
          <option value="">Todas las obras</option>
          {obras.map(o => (
            <option key={o.cod} value={o.cod}>{o.nom}</option>
          ))}
        </select>

        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, legajo o DNI..."
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

        {busqueda && (
          <span className="text-xs text-gris-dark">
            {filasFiltradas.length} resultado{filasFiltradas.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Tabla ── */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando horas...
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse w-full min-w-[750px]">
              <thead>
                <tr>
                  <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[58px]">
                    Leg.
                  </th>
                  <th className="bg-azul text-white text-xs font-bold px-3 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[165px]">
                    Nombre
                  </th>
                  {mostrarObra && (
                    <th className="bg-azul text-white text-xs font-bold px-2 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[75px]">
                      Obra
                    </th>
                  )}
                  <th className="bg-azul text-white text-xs font-bold px-2 py-2.5 text-left uppercase tracking-wide whitespace-nowrap min-w-[120px]">
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
                      {esJueves(d) && (
                        <>
                          <br />
                          <span className="text-[9px] opacity-70">CIERRE</span>
                        </>
                      )}
                    </th>
                  ))}
                  <th className="bg-verde text-white text-xs font-bold px-2 py-2.5 text-center uppercase tracking-wide min-w-[80px]">
                    Total Hs
                  </th>
                  <th className="bg-[#0F4A28] text-white text-xs font-bold px-3 py-2.5 text-right uppercase tracking-wide min-w-[120px]">
                    Costo ($)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4 + (mostrarObra ? 1 : 0) + days.length + 2}
                      className="text-center py-8 text-gris-dark text-sm"
                    >
                      No hay trabajadores con horas esta semana.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filasRender.map((item, idx) => {
                      // ── Fila subtotal ──
                      if (item.type === 'subtotal') {
                        const { leg, p, obraCount, totalHs: subHs, totalCosto: subCosto, horasPorDia } = item
                        return (
                          <tr key={`${leg}-subtotal`} className="border-b-2 border-[#C89500]">
                            <td className="font-mono text-xs px-3 py-2 font-bold text-[#7A5000] bg-[#FFF3CD] whitespace-nowrap">
                              {leg}
                            </td>
                            <td className="px-3 py-2 bg-[#FFF3CD] whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm text-[#7A5000]">{p.nom}</span>
                                <span className="text-[10px] font-bold bg-[#E0A800] text-white px-1.5 py-0.5 rounded">
                                  ↔ {obraCount} obras
                                </span>
                              </div>
                            </td>
                            {mostrarObra && (
                              <td className="px-2 py-2 bg-[#FFF3CD] text-gris-mid text-xs">—</td>
                            )}
                            <td className="px-2 py-2 bg-[#FFF3CD]" />
                            {days.map((d, i) => {
                              const ds = toISO(d)
                              const val = horasPorDia[ds] ?? 0
                              return (
                                <td key={i} className="px-1.5 py-2 text-center bg-[#FFF3CD]">
                                  {val > 0
                                    ? <span className="font-mono text-sm font-bold text-[#7A5000]">{val}</span>
                                    : <span className="text-gris-mid text-xs">—</span>
                                  }
                                </td>
                              )
                            })}
                            <td className="text-center bg-[#E0A800] font-mono text-sm font-bold text-white px-2 py-2 whitespace-nowrap">
                              {subHs > 0 ? subHs : '—'}
                            </td>
                            <td className="text-right bg-[#E0A800] px-3 py-2 whitespace-nowrap font-mono text-sm font-bold text-white">
                              {subCosto > 0 ? fmtM(subCosto) : '—'}
                            </td>
                          </tr>
                        )
                      }

                      // ── Fila normal ──
                      const f = item.data
                      const catId = getCatIdEfectivo(f.obra.cod, f.leg, hoyRef)
                      const catNom = getCatNom(catId)
                      const esMulti = multiObra.has(f.leg)

                      // Última hora editada de este trabajador en esta obra
                      const lastHora = todasHoras
                        .filter(h => h.obra_cod === f.obra.cod && h.leg === f.leg && h.updated_by)
                        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
                        [0] as Hora | undefined

                      return (
                        <tr
                          key={`${f.leg}-${f.obra.cod}`}
                          className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors"
                        >
                          <td className="font-mono text-xs text-gris-dark px-3 py-1.5 font-semibold whitespace-nowrap">
                            {f.leg}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm">{f.p.nom}</span>
                              {esMulti && (
                                <span className="text-[10px] font-bold bg-[#E0A800] text-white px-1.5 py-0.5 rounded">
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
                          {mostrarObra && (
                            <td className="px-2 py-1.5">
                              <span
                                className="text-[11px] bg-azul-light text-azul-mid px-1.5 py-0.5 rounded font-bold cursor-pointer hover:bg-azul hover:text-white transition-colors truncate max-w-[160px] inline-block"
                                title={f.obra.nom}
                                onClick={() => router.push(`/tarja/${encodeURIComponent(f.obra.cod)}`)}
                              >
                                {f.obra.nom}
                              </span>
                            </td>
                          )}
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded bg-naranja-light text-naranja-dark text-xs font-bold">
                              {catNom}
                            </span>
                          </td>
                          {days.map((d, i) => {
                            const ds = toISO(d)
                            const val = f.horasPorDia[ds] ?? 0
                            const ck = cellKey(f.leg, f.obra.cod, ds)
                            const isEditing = editingCell?.key === ck
                            const displayVal = isEditing ? editingCell!.val : (val || '')
                            let cls = 'w-14 h-8 border-[1.5px] rounded-md text-center font-mono text-sm font-bold outline-none focus:border-naranja focus:ring-1 focus:ring-naranja/30'

                            if (val === 0 && !isEditing) {
                              cls += ' border-gris-mid bg-white text-gris-mid'
                            } else if (esMulti) {
                              cls += ' border-[#E0A800] bg-[#FFF3CD] text-[#7A5000]'
                            } else if (val >= 8) {
                              cls += ' border-verde/40 bg-verde-light text-verde'
                            } else {
                              cls += ' border-amarillo/40 bg-amarillo-light text-[#7A5500]'
                            }

                            return (
                              <td key={i} className="px-1.5 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={displayVal}
                                  readOnly={!puedeEditar}
                                  onChange={puedeEditar ? e => handleCellChange(f.leg, f.obra.cod, ds, e.target.value) : undefined}
                                  onBlur={puedeEditar ? e => handleCellBlur(f.leg, f.obra.cod, ds, val, e.target.value) : undefined}
                                  onFocus={puedeEditar ? e => { setEditingCell({ key: ck, val: e.target.value }); e.target.select() } : undefined}
                                  className={`${cls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none${!puedeEditar ? ' cursor-not-allowed opacity-60' : ''}`}
                                />
                              </td>
                            )
                          })}
                          <td className="text-center bg-verde-light font-mono text-sm font-bold text-verde px-2 py-1.5 whitespace-nowrap">
                            {f.totalHs > 0 ? f.totalHs : '—'}
                          </td>
                          <td className="text-right bg-azul-light px-3 py-1.5 whitespace-nowrap font-mono text-sm font-bold text-azul-mid">
                            {f.totalCosto > 0 ? fmtM(f.totalCosto) : '—'}
                          </td>
                        </tr>
                      )
                    })}

                    {/* Fila totales */}
                    <tr className="border-t-[3px] border-naranja">
                      <td
                        colSpan={2 + (mostrarObra ? 1 : 0) + 1}
                        className="bg-azul text-white font-display text-base tracking-wide px-3 py-2.5"
                      >
                        TOTALES DÍA
                      </td>
                      {days.map((d, i) => {
                        const ds = toISO(d)
                        const totalDia = filasFiltradas.reduce(
                          (s, f) => s + (f.horasPorDia[ds] ?? 0), 0
                        )
                        return (
                          <td key={i} className="bg-azul text-white font-mono text-sm font-bold text-center px-2 py-2.5">
                            {totalDia > 0 ? totalDia : '—'}
                          </td>
                        )
                      })}
                      <td className="bg-azul text-[#7DD9A2] font-mono text-sm font-bold text-center px-2 py-2.5">
                        {totHs > 0 ? totHs : '—'}
                      </td>
                      <td className="bg-azul text-naranja font-mono text-sm font-bold text-right px-3 py-2.5">
                        {totCosto > 0 ? fmtM(totCosto) : '—'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}