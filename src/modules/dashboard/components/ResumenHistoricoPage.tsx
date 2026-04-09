'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import {
  getSemDays, toISO, getViernes, getSemLabel,
  getViernesCobro,
} from '@/lib/utils/dates'
import {
  totalHsLeg, costoLeg, fmtMonto, fmtHs,
  calcularTotalesSemana,
} from '@/lib/utils/costos'
import { Chip } from '@/components/ui/Chip'
import type { Hora, Tarifa, Cierre, Certificacion, Contratista } from '@/types/domain.types'
import { usePrestamos } from '@/modules/tarja/hooks/usePrestamos'

export function ResumenHistoricoPage() {
  const router = useRouter()

  // ── Filtros ──
  const [filtroCC, setFiltroCC] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  // ── Datos ──
  const { data: obras = [], isLoading: loadingObras } = useObras()
  const { data: personal = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()

  const { data: todasHoras = [], isLoading: loadingHoras } = useQuery({
    queryKey: ['horas', 'all'],
    queryFn: () => apiGet<Hora[]>('/api/horas/all'),
  })
  const { data: todasTarifas = [] } = useQuery({
    queryKey: ['tarifas', 'all'],
    queryFn: () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })
  const { data: todosCierres = [] } = useQuery({
    queryKey: ['cierres', 'all'],
    queryFn: () => apiGet<Cierre[]>('/api/cierres/all'),
  })
  const { data: todasCerts = [] } = useQuery({
    queryKey: ['certs', 'all'],
    queryFn: () => apiGet<Certificacion[]>('/api/contratistas/cert/all'),
  })
  const { data: contratistas = [] } = useQuery({
    queryKey: ['contratistas'],
    queryFn: () => apiGet<Contratista[]>('/api/contratistas'),
  })

  const { data: todasAsignaciones = [] } = useQuery({
    queryKey: ['asignaciones', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; baja_desde: string | null }>>('/api/asignaciones/all'),
  })

  const { data: todosPrestamos = [] } = usePrestamos()

  function getLegsActivos(obraCod: string, semKey: string): string[] {
    return todasAsignaciones
      .filter(a => a.obra_cod === obraCod)
      .filter(a => !a.baja_desde || semKey < a.baja_desde)
      .map(a => a.leg)
  }

  const { data: todasCatObra = [] } = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }>>('/api/cat-obra/all'),
  })



  // ── Centros de costo únicos ──
  const centrosCosto = useMemo(() => {
    return [...new Set(obras.map(o => o.cc ?? '').filter(Boolean))].sort()
  }, [obras])

  // ── Obras filtradas por CC ──
  const obrasFiltradas = useMemo(() => {
    if (!filtroCC) return obras
    return obras.filter(o => (o.cc ?? '') === filtroCC)
  }, [obras, filtroCC])

  // ── Semanas disponibles (de todas las horas + certificaciones) ──
  const semanasDisponibles = useMemo(() => {
    const sems = new Set<string>()
    todasHoras.forEach(h => {
      sems.add(toISO(getViernes(new Date(h.fecha + 'T12:00:00'))))
    })
    todasCerts.forEach(c => {
      sems.add(c.sem_key)
    })
    return [...sems].sort()
  }, [todasHoras, todasCerts])

  // ── Semana actual ──
  const semActualKey = toISO(getViernes(new Date()))
  const semActualDays = getSemDays(getViernes(new Date()))

  // ── RESUMEN SEMANA ACTUAL ──
  const resumenSemActual = useMemo(() => {
    let totalHs = 0
    let totalCosto = 0
    let totalContrat = 0
    const trabajadoresUnicos = new Set<string>()

    const cards = obrasFiltradas.map(o => {
      const horasObra = todasHoras.filter(
        h => h.obra_cod === o.cod &&
          h.fecha >= toISO(semActualDays[0]!) &&
          h.fecha <= toISO(semActualDays[6]!)
      )
      const legsConHoras = [...new Set(horasObra.map(h => h.leg))]

      let oHs = 0
      let oCosto = 0
      legsConHoras.forEach(leg => {
        trabajadoresUnicos.add(leg)
        const hs = totalHsLeg(todasHoras, o.cod, leg, semActualDays.map(toISO))
        oHs += hs
        oCosto += Math.round(costoLegConCatObra(o.cod, leg, semActualDays) / 1000) * 1000
      })

      // Certificaciones de esta semana
      const oContrat = todasCerts
        .filter(c => c.obra_cod === o.cod && c.sem_key === semActualKey)
        .reduce((s, c) => s + c.monto, 0)

      totalHs += oHs
      totalCosto += oCosto
      totalContrat += oContrat

      return { obra: o, hs: oHs, costo: oCosto, contrat: oContrat, legs: legsConHoras.length }
    }).filter(c => c.hs > 0 || c.contrat > 0)

    return { cards, totalHs, totalCosto, totalContrat, trabajadores: trabajadoresUnicos.size }
  }, [obrasFiltradas, todasHoras, personal, categorias, todasTarifas, todasCerts, todosCierres, todasAsignaciones, todasCatObra, filtroDesde, filtroHasta])

  // ── RESUMEN HISTÓRICO ──
  const resumenHistorico = useMemo(() => {
    let htHs = 0
    let htCosto = 0
    let htContrat = 0
    let htSemsCerradas = 0

    const filas = obrasFiltradas.map(o => {
      // Agrupar fechas de horas por semana
      const seenKeys = new Set<string>()
      todasHoras.filter(h => h.obra_cod === o.cod).forEach(h => {
        const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
        if (filtroDesde && sk < filtroDesde) return
        if (filtroHasta && sk > filtroHasta) return
        seenKeys.add(sk)
      })

      // También contar semanas de certificaciones
      todasCerts.filter(c => c.obra_cod === o.cod).forEach(c => {
        if (filtroDesde && c.sem_key < filtroDesde) return
        if (filtroHasta && c.sem_key > filtroHasta) return
        seenKeys.add(c.sem_key)
      })

      let oHs = 0
      let oCosto = 0
      const legsUnicos = new Set<string>()

      seenKeys.forEach(sk => {
        const days = getSemDays(new Date(sk + 'T12:00:00'))
        // Obtener legs desde las horas reales (no desde asignaciones)
        // para no perder workers con horas pero sin asignación formal
        const horasSem = todasHoras.filter(
          h => h.obra_cod === o.cod &&
            h.fecha >= toISO(days[0]!) &&
            h.fecha <= toISO(days[6]!)
        )
        const legsConHoras = [...new Set(horasSem.map(h => h.leg))]

        legsConHoras.forEach(leg => {
          const hs = totalHsLeg(todasHoras, o.cod, leg, days.map(toISO))
          if (hs > 0) legsUnicos.add(leg)
          oHs += hs
          oCosto += Math.round(costoLegConCatObra(o.cod, leg, days) / 1000) * 1000
        })
      })

      // Contratistas
      let oContrat = 0
      todasCerts.filter(c => c.obra_cod === o.cod).forEach(c => {
        if (filtroDesde && c.sem_key < filtroDesde) return
        if (filtroHasta && c.sem_key > filtroHasta) return
        oContrat += c.monto
      })

      // Semanas cerradas dentro del filtro
      const cerradas = todosCierres.filter(c => {
        if (c.obra_cod !== o.cod || c.estado !== 'cerrado') return false
        if (filtroDesde && c.sem_key < filtroDesde) return false
        if (filtroHasta && c.sem_key > filtroHasta) return false
        // Solo contar si tiene datos reales
        const dSem = getSemDays(new Date(c.sem_key + 'T12:00:00'))
        const legsAct = getLegsActivos(o.cod, c.sem_key)
        const hsSem = legsAct.reduce((s, leg) => s + totalHsLeg(todasHoras, o.cod, leg, dSem.map(toISO)), 0)
        const contratSem = todasCerts
          .filter(ct => ct.obra_cod === o.cod && ct.sem_key === c.sem_key)
          .reduce((s, ct) => s + ct.monto, 0)
        return hsSem > 0 || contratSem > 0
      }).length

      const nContrat = [...new Set(
        todasCerts
          .filter(c => c.obra_cod === o.cod)
          .filter(c => !filtroDesde || c.sem_key >= filtroDesde)
          .filter(c => !filtroHasta || c.sem_key <= filtroHasta)
          .map(c => c.contrat_id)
      )].length

      if (oHs === 0 && oCosto === 0 && oContrat === 0) return null

      htHs += oHs
      htCosto += oCosto
      htContrat += oContrat
      htSemsCerradas += cerradas

      return {
        obra: o,
        hs: oHs,
        costo: oCosto,
        contrat: oContrat,
        trabajadores: legsUnicos.size,
        nContrat,
        cerradas,
      }
    }).filter(Boolean) as Array<{
      obra: typeof obras[0]
      hs: number
      costo: number
      contrat: number
      trabajadores: number
      nContrat: number
      cerradas: number
    }>

    return { filas, htHs, htCosto, htContrat, htSemsCerradas }
  }, [obrasFiltradas, todasHoras, personal, categorias, todasTarifas, todasCerts, todosCierres, todasAsignaciones, filtroDesde, filtroHasta])

  function limpiarFiltros() {
    setFiltroCC('')
    setFiltroDesde('')
    setFiltroHasta('')
  }

  function getCatIdEfectivo(obraCod: string, leg: string, fechaRef: string): number | null {
    // 1. Buscar en cat_obra
    const catObraHist = todasCatObra
      .filter(co => co.obra_cod === obraCod && co.leg === leg)

    if (catObraHist.length > 0) {
      // Buscar el más reciente donde desde <= fechaRef
      let best: { cat_id: number; desde: string } | null = null
      for (const h of catObraHist) {
        if (h.desde <= fechaRef) {
          if (!best || h.desde >= best.desde) best = h
        }
      }
      if (best) return best.cat_id
      // Todas las entradas son posteriores → usar la más antigua (retroactivo)
      return catObraHist.reduce((a, b) => a.desde <= b.desde ? a : b).cat_id
    }

    // 2. Buscar en personal_cat_historial
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
  // Helper: costo de un trabajador usando cat_obra overrides
  function costoLegConCatObra(obraCod: string, leg: string, days: Date[]): number {
    const semStartStr = toISO(days[0]!)
    const hoyStr = toISO(new Date())
    const esSemActual = semStartStr === toISO(getViernes(new Date()))
    const fechaRef = esSemActual ? hoyStr : semStartStr

    const catId = getCatIdEfectivo(obraCod, leg, fechaRef)
    if (!catId) return 0

    // Buscar tarifa con lógica retroactiva (igual al base)
    const tarifaObraAll = todasTarifas
      .filter(t => t.obra_cod === obraCod && t.cat_id === catId)
      .sort((a, b) => a.desde.localeCompare(b.desde))

    let vh: number | null = null
    if (tarifaObraAll.length > 0) {
      // Buscar la más reciente donde desde <= fechaRef
      for (const t of tarifaObraAll) {
        if (t.desde <= fechaRef) vh = t.vh
        else break
      }
      // Si ninguna cubre esa fecha (todas futuras) → usar la más antigua (retroactivo)
      if (vh === null) vh = tarifaObraAll[0]!.vh
    } else {
      // Sin tarifa de obra → precio global de la categoría
      vh = categorias.find(c => c.id === catId)?.vh ?? 0
    }

    const hs = totalHsLeg(todasHoras, obraCod, leg, days.map(toISO))
    return hs * vh
  }


  if (loadingObras || loadingHoras) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando datos...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">

      {/* ══ RESUMEN GENERAL — SEMANA ACTUAL ══ */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="font-display text-[1.8rem] tracking-wider text-azul leading-none">
              📊 RESUMEN GENERAL
            </h1>
            <p className="text-sm text-gris-dark mt-1">
              Vista semana actual · {getSemLabel(getViernes(new Date()))}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip value={obrasFiltradas.length} label="Obras" />
            <Chip value={resumenSemActual.trabajadores} label="Personal" />
            <Chip value={fmtHs(resumenSemActual.totalHs)} label="Horas" />
            <Chip value={fmtMonto(resumenSemActual.totalCosto)} label="Operarios" variant="green" />
            <Chip value={fmtMonto(resumenSemActual.totalContrat)} label="Contratistas" />
            {(() => {
              const totalPrestamos = todosPrestamos
                .filter(p => p.sem_key === semActualKey)
                .reduce((s, p) => p.tipo === 'otorgado' ? s + p.monto : s - p.monto, 0)
              return totalPrestamos !== 0 ? (
                <Chip
                  value={fmtMonto(Math.abs(totalPrestamos))}
                  label={totalPrestamos > 0 ? 'Préstamos' : 'Descuentos'}
                  variant="orange"
                />
              ) : null
            })()}
            <Chip
              value={fmtMonto(resumenSemActual.totalCosto + resumenSemActual.totalContrat)}
              label="Total semana"
              variant="orange"
            />
          </div>
        </div>

        {/* Cards por obra */}
        {resumenSemActual.cards.length === 0 ? (
          <p className="text-gris-dark text-sm text-center py-4">
            No hay actividad esta semana.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumenSemActual.cards.map(c => (
              <button
                key={c.obra.cod}
                onClick={() => router.push(`/tarja/${encodeURIComponent(c.obra.cod)}`)}
                className="bg-gris/50 rounded-xl p-3 text-left hover:bg-naranja-light transition-colors border border-gris-mid hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[11px] bg-gris text-gris-dark px-2 py-0.5 rounded font-bold">
                    {c.obra.cod}
                  </span>
                  <span className="font-bold text-sm text-azul truncate">{c.obra.nom}</span>
                  {c.obra.cc && (
                    <span className="text-[10px] font-bold bg-azul-light text-azul-mid px-1.5 py-0.5 rounded">
                      {c.obra.cc}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-center">
                    <div className="font-mono text-sm font-bold text-carbon">{c.legs}</div>
                    <div className="text-[10px] text-gris-dark">Operarios</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-sm font-bold text-carbon">{fmtHs(c.hs)}</div>
                    <div className="text-[10px] text-gris-dark">Horas sem.</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-sm font-bold text-verde">{fmtMonto(c.costo)}</div>
                    <div className="text-[10px] text-gris-dark">Costo op.</div>
                  </div>
                  {c.contrat > 0 && (
                    <div className="text-center">
                      <div className="font-mono text-sm font-bold text-[#5A2D82]">{fmtMonto(c.contrat)}</div>
                      <div className="text-[10px] text-gris-dark">Contrat.</div>
                    </div>
                  )}
                  <div className="ml-auto text-right">
                    <div className="font-mono text-base font-bold text-naranja">
                      {fmtMonto(c.costo + c.contrat)}
                    </div>
                    <div className="text-[10px] text-gris-dark">total esta semana</div>
                  </div>
                </div>
                {(c.obra.dir || c.obra.resp) && (
                  <div className="text-[11px] text-gris-dark mt-1.5">
                    {c.obra.dir && `📍 ${c.obra.dir}`}
                    {c.obra.dir && c.obra.resp && ' · '}
                    {c.obra.resp && `👷 ${c.obra.resp}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ RESUMEN HISTÓRICO ══ */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-[1.4rem] tracking-wider text-azul">
              📊 RESUMEN HISTÓRICO — OBRAS ACTIVAS
            </h2>
            <p className="text-xs text-gris-dark mt-1">
              Acumulado total desde el inicio de cada obra
            </p>

            {/* Filtros */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Centro de costo
              </label>
              <select
                value={filtroCC}
                onChange={e => setFiltroCC(e.target.value)}
                className="px-2 py-1 border-[1.5px] border-gris-mid rounded-md text-xs outline-none bg-white font-semibold focus:border-naranja max-w-[200px]"
              >
                <option value="">Todos</option>
                {centrosCosto.map(cc => (
                  <option key={cc} value={cc}>{cc}</option>
                ))}
              </select>

              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider ml-2">
                Desde
              </label>
              <select
                value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="px-2 py-1 border-[1.5px] border-gris-mid rounded-md text-xs outline-none bg-white font-semibold focus:border-naranja max-w-[220px]"
              >
                <option value="">— Inicio —</option>
                {semanasDisponibles.map(sk => (
                  <option key={sk} value={sk}>
                    {getSemLabel(new Date(sk + 'T12:00:00'))}
                  </option>
                ))}
              </select>

              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider ml-2">
                Hasta
              </label>
              <select
                value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="px-2 py-1 border-[1.5px] border-gris-mid rounded-md text-xs outline-none bg-white font-semibold focus:border-naranja max-w-[220px]"
              >
                <option value="">— Fin —</option>
                {semanasDisponibles.map(sk => (
                  <option key={sk} value={sk}>
                    {getSemLabel(new Date(sk + 'T12:00:00'))}
                  </option>
                ))}
              </select>

              <button
                onClick={limpiarFiltros}
                className="text-xs font-bold px-2 py-1 rounded-md bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
              >
                ✕ Limpiar
              </button>
            </div>
          </div>

          {/* Chips totales históricos */}
          <div className="flex gap-2 flex-wrap">
            <Chip value={resumenHistorico.htSemsCerradas} label="Sem. cerradas" />
          </div>
        </div>

        {/* Tabla histórica */}
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-left uppercase tracking-wide">
                    Obra
                  </th>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-left uppercase tracking-wide">
                    Responsable
                  </th>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-center uppercase tracking-wide">
                    Trabajadores
                  </th>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-center uppercase tracking-wide">
                    Horas totales
                  </th>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-center uppercase tracking-wide">
                    Sem. cerradas
                  </th>
                  <th className="bg-azul text-white text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                    Operarios
                  </th>
                  <th className="bg-azul text-[#7DD9A2] text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                    Contratistas
                  </th>
                  <th className="bg-azul text-naranja text-[11px] font-bold px-3 py-2.5 text-right uppercase tracking-wide">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumenHistorico.filas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gris-dark text-sm">
                      No hay datos para el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  <>
                    {resumenHistorico.filas.map(f => (
                      <tr
                        key={f.obra.cod}
                        onClick={() => router.push(`/tarja/${encodeURIComponent(f.obra.cod)}`)}
                        className="border-b border-gris last:border-0 hover:bg-gris/40 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 border-b border-gris">
                          <span className="font-bold text-sm">{f.obra.nom}</span>
                          <span className="font-mono text-[11px] text-gris-dark ml-2">{f.obra.cod}</span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-sm text-gris-dark">
                          {f.obra.resp || '—'}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-center font-mono font-bold text-sm">
                          {f.trabajadores}
                          {f.nContrat > 0 && (
                            <span className="text-[11px] text-[#5A2D82] font-bold ml-1">
                              (+{f.nContrat}C)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-center font-mono font-bold text-sm">
                          {fmtHs(f.hs)}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-center">
                          <span className="bg-verde-light text-verde text-xs font-bold px-2 py-0.5 rounded">
                            {f.cerradas}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-right font-mono font-bold text-sm text-verde">
                          {fmtMonto(f.costo)}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-right font-mono font-bold text-sm text-[#5A2D82]">
                          {f.contrat > 0 ? fmtMonto(f.contrat) : '—'}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gris text-right font-mono font-bold text-sm text-naranja">
                          {fmtMonto(f.costo + f.contrat)}
                        </td>
                      </tr>
                    ))}

                    {/* Fila TOTAL */}
                    <tr>
                      <td colSpan={3} className="bg-azul text-white font-display text-base tracking-wide px-3 py-2.5">
                        TOTAL EMPRESA
                      </td>
                      <td className="bg-azul text-[#7DD9A2] font-mono font-bold text-sm text-center px-3 py-2.5">
                        {fmtHs(resumenHistorico.htHs)}
                      </td>
                      <td className="bg-azul text-[#7DD9A2] font-mono font-bold text-sm text-center px-3 py-2.5">
                        {resumenHistorico.htSemsCerradas}
                      </td>
                      <td className="bg-azul text-[#7DD9A2] font-mono font-bold text-sm text-right px-3 py-2.5">
                        {fmtMonto(resumenHistorico.htCosto)}
                      </td>
                      <td className="bg-azul text-[#C39BD3] font-mono font-bold text-sm text-right px-3 py-2.5">
                        {fmtMonto(resumenHistorico.htContrat)}
                      </td>
                      <td className="bg-azul text-naranja font-mono font-bold text-base text-right px-3 py-2.5">
                        {fmtMonto(resumenHistorico.htCosto + resumenHistorico.htContrat)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}