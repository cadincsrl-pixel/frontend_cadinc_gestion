'use client'

import { useState, useMemo } from 'react'
import { useQuery }      from '@tanstack/react-query'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useObras }      from '@/modules/tarja/hooks/useObras'
import { TarjaTopbarActions } from './TarjaTopbarActions'
import { apiGet }        from '@/lib/api/client'
import { toISO, getViernes, getSemDays, getSemLabel, getViernesCobro, DIAS } from '@/lib/utils/dates'
import type { Hora, Tarifa } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[parseInt(m!) - 1]} ${y}`
}

export function HorasTrabajadorPage() {
  const hoy = new Date()

  const [legSel,       setLegSel]       = useState('')
  const [obraFilt,     setObraFilt]     = useState('')
  const [desde,        setDesde]        = useState(toISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)))
  const [hasta,        setHasta]        = useState(toISO(hoy))
  const [busqueda,     setBusqueda]     = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: obras       = [] } = useObras()

  const { data: todasTarifas = [] } = useQuery({
    queryKey: ['tarifas', 'all'],
    queryFn:  () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })

  const { data: horasData = [], isLoading } = useQuery({
    queryKey: ['horas', 'trabajador', legSel, desde, hasta],
    queryFn:  () => apiGet<Hora[]>(`/api/horas/trabajador/${legSel}?desde=${desde}&hasta=${hasta}`),
    enabled:  !!legSel,
  })

  const trabajador = personal.find(p => p.leg === legSel)
  const cat        = categorias.find(c => c.id === trabajador?.cat_id)

  const horasFiltradas = useMemo(() =>
    obraFilt ? horasData.filter(h => h.obra_cod === obraFilt) : horasData,
    [horasData, obraFilt]
  )

  function getVH(obraCod: string, fecha: string): number {
    if (!trabajador) return 0
    const tarOb = todasTarifas
      .filter(t => t.obra_cod === obraCod && t.cat_id === trabajador.cat_id && t.desde <= fecha)
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]
    return tarOb?.vh ?? cat?.vh ?? 0
  }

  const personalFiltrado = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return [...personal].sort((a, b) => a.nom.localeCompare(b.nom))
    return personal
      .filter(p =>
        p.nom.toLowerCase().includes(q) ||
        p.leg.toLowerCase().includes(q)  ||
        (p.dni ?? '').includes(q)
      )
      .sort((a, b) => a.nom.localeCompare(b.nom))
  }, [personal, busqueda])

  const semanas = useMemo(() => {
    const map = new Map<string, Hora[]>()
    horasFiltradas.forEach(h => {
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      if (!map.has(sk)) map.set(sk, [])
      map.get(sk)!.push(h)
    })
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([sk, hs]) => {
        const vie        = new Date(sk + 'T12:00:00')
        const days       = getSemDays(vie)
        const cobro      = getViernesCobro(vie)
        const totalHs    = hs.reduce((s, h) => s + h.horas, 0)
        const totalCosto = hs.reduce((s, h) => s + h.horas * getVH(h.obra_cod, h.fecha), 0)
        const obrasEnSem = [...new Set(hs.map(h => h.obra_cod))].map(cod => ({
          obra:  obras.find(o => o.cod === cod),
          hs:    hs.filter(h => h.obra_cod === cod).reduce((s, h) => s + h.horas, 0),
          costo: hs.filter(h => h.obra_cod === cod).reduce((s, h) => s + h.horas * getVH(h.obra_cod, h.fecha), 0),
        }))
        return { sk, vie, days, cobro, totalHs, totalCosto, obrasEnSem, horas: hs }
      })
  }, [horasFiltradas, obras, todasTarifas, trabajador, cat])

  const kpis = useMemo(() => {
    const totalHs       = horasFiltradas.reduce((s, h) => s + h.horas, 0)
    const totalCosto    = horasFiltradas.reduce((s, h) => s + h.horas * getVH(h.obra_cod, h.fecha), 0)
    const obrasUnicas   = new Set(horasFiltradas.map(h => h.obra_cod)).size
    const semanasConHs  = semanas.length
    const promedioHsSem = semanasConHs > 0 ? Math.round(totalHs / semanasConHs * 10) / 10 : 0
    return { totalHs, totalCosto, obrasUnicas, semanasConHs, promedioHsSem }
  }, [horasFiltradas, semanas])

  const obrasConHoras = useMemo(() =>
    [...new Set(horasData.map(h => h.obra_cod))]
      .map(cod => obras.find(o => o.cod === cod))
      .filter(Boolean),
    [horasData, obras]
  )

  const shortcuts = [
    { label: 'Este mes',  fn: () => { setDesde(toISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));    setHasta(toISO(hoy)) } },
    { label: 'Mes ant.',  fn: () => { setDesde(toISO(new Date(hoy.getFullYear(), hoy.getMonth()-1, 1))); setHasta(toISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0))) } },
    { label: 'Últ. 3m',  fn: () => { setDesde(toISO(new Date(hoy.getFullYear(), hoy.getMonth()-2, 1))); setHasta(toISO(hoy)) } },
    { label: 'Este año',  fn: () => { setDesde(toISO(new Date(hoy.getFullYear(), 0, 1)));                setHasta(toISO(hoy)) } },
  ]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <TarjaTopbarActions />

      {/* ── Header ── */}
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">HORAS POR TRABAJADOR</h1>
        <p className="text-sm text-gris-dark mt-0.5">Historial detallado de horas, obras y costos</p>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* ── Searchbar trabajador ── */}
          <div className="flex flex-col gap-1 relative">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Trabajador
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por nombre, legajo o DNI..."
                value={trabajador ? trabajador.nom : busqueda}
                onChange={e => {
                  setBusqueda(e.target.value)
                  setDropdownOpen(true)
                  if (legSel) { setLegSel(''); setObraFilt('') }
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                className="w-full pl-9 pr-10 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">
                🔍
              </span>
              {(legSel || busqueda) && (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setLegSel(''); setBusqueda(''); setObraFilt(''); setDropdownOpen(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-base w-5 h-5 flex items-center justify-center rounded transition-colors"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdown */}
            {dropdownOpen && !legSel && (
              <div className="absolute top-[calc(100%+2px)] left-0 right-0 z-[300] bg-white border-[1.5px] border-gris-mid rounded-xl shadow-card-lg max-h-64 overflow-y-auto">
                {personalFiltrado.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gris-dark">
                    No se encontraron resultados para "{busqueda}"
                  </div>
                ) : (
                  <>
                    {busqueda && (
                      <div className="px-3 py-1.5 text-[10px] font-bold text-gris-dark uppercase tracking-wider bg-gris border-b border-gris-mid sticky top-0">
                        {personalFiltrado.length} resultado{personalFiltrado.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    {personalFiltrado.map(p => {
                      const c        = categorias.find(c => c.id === p.cat_id)
                      const q        = busqueda.toLowerCase()
                      const matchDNI = !!(p.dni && p.dni.includes(busqueda))
                      const matchLeg = p.leg.toLowerCase().includes(q)
                      return (
                        <button
                          key={p.leg}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setLegSel(p.leg)
                            setBusqueda('')
                            setObraFilt('')
                            setDropdownOpen(false)
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-naranja-light transition-colors border-b border-gris last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-sm flex-shrink-0">
                            {p.nom.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm text-carbon truncate">{p.nom}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${matchLeg ? 'bg-naranja text-white' : 'bg-gris text-gris-dark'}`}>
                                Leg. {p.leg}
                              </span>
                              {p.dni && (
                                <span className={`text-[10px] font-mono ${matchDNI ? 'font-bold text-naranja-dark' : 'text-gris-dark'}`}>
                                  DNI {p.dni}
                                </span>
                              )}
                              {c && (
                                <span className="text-[10px] font-bold bg-azul-light text-azul-mid px-1.5 py-0.5 rounded">
                                  {c.nom}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Filtro obra ── */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Filtrar por obra
            </label>
            <select
              value={obraFilt}
              onChange={e => setObraFilt(e.target.value)}
              disabled={!legSel}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white disabled:opacity-50"
            >
              <option value="">Todas las obras</option>
              {obrasConHoras.map(o => o && (
                <option key={o.cod} value={o.cod}>{o.nom} ({o.cod})</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Rango de fechas ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-gris rounded-lg border border-gris-mid px-3 py-2">
            <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide whitespace-nowrap">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              className="text-sm font-mono outline-none bg-transparent text-carbon"
            />
          </div>
          <span className="text-gris-dark font-bold">→</span>
          <div className="flex items-center gap-2 bg-gris rounded-lg border border-gris-mid px-3 py-2">
            <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide whitespace-nowrap">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              className="text-sm font-mono outline-none bg-transparent text-carbon"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {shortcuts.map(s => (
              <button
                key={s.label}
                onClick={s.fn}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-white border border-gris-mid text-gris-dark hover:bg-azul hover:text-white hover:border-azul transition-all"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Info trabajador seleccionado ── */}
      {trabajador && (
        <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-naranja-light flex items-center justify-center text-naranja-dark font-bold text-xl flex-shrink-0">
              {trabajador.nom.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-azul text-lg leading-tight">{trabajador.nom}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                  Leg. {trabajador.leg}
                </span>
                {trabajador.dni && (
                  <span className="text-xs text-gris-dark">DNI {trabajador.dni}</span>
                )}
                {cat && (
                  <span className="text-xs font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">
                    {cat.nom}
                  </span>
                )}
              </div>
            </div>
          </div>
          {horasFiltradas.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <KPIChip value={`${kpis.totalHs}hs`}       label="Total horas"  color="azul"    />
              <KPIChip value={fmtM(kpis.totalCosto)}      label="Costo total"  color="verde"   />
              <KPIChip value={String(kpis.obrasUnicas)}   label="Obras"        color="naranja" />
              <KPIChip value={String(kpis.semanasConHs)}  label="Semanas"      color="azul"    />
              <KPIChip value={`${kpis.promedioHsSem}hs`} label="Prom/semana"  color="purple"  />
            </div>
          )}
        </div>
      )}

      {/* ── Estados vacíos ── */}
      {!legSel && (
        <div className="bg-white rounded-card shadow-card p-12 text-center text-gris-dark">
          <div className="text-4xl mb-3">👷</div>
          <p className="font-semibold text-azul text-base">Seleccioná un trabajador</p>
          <p className="text-sm mt-1">Buscá por nombre, legajo o DNI</p>
        </div>
      )}

      {legSel && isLoading && (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando horas...
        </div>
      )}

      {legSel && !isLoading && horasFiltradas.length === 0 && (
        <div className="bg-white rounded-card shadow-card p-10 text-center text-gris-dark">
          <div className="text-3xl mb-2">📋</div>
          <p className="font-semibold text-azul">Sin horas en este período</p>
          <p className="text-sm mt-1">Probá cambiar el rango de fechas o la obra seleccionada</p>
        </div>
      )}

      {/* ── Resumen por obras ── */}
      {legSel && !isLoading && horasFiltradas.length > 0 && (
        <>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gris flex items-center justify-between">
              <h3 className="font-bold text-azul">Resumen por obra</h3>
              <span className="text-xs text-gris-dark">
                {kpis.obrasUnicas} obra{kpis.obrasUnicas !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Código', 'Obra', 'Horas totales', 'Costo total', '% del total', 'Prom. semanal'].map(h => (
                      <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-2.5 text-left uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(horasFiltradas.map(h => h.obra_cod))]
                    .map(cod => {
                      const hsObra    = horasFiltradas.filter(h => h.obra_cod === cod)
                      const totalHs   = hsObra.reduce((s, h) => s + h.horas, 0)
                      const totalCost = hsObra.reduce((s, h) => s + h.horas * getVH(h.obra_cod, h.fecha), 0)
                      const obra      = obras.find(o => o.cod === cod)
                      const pct       = kpis.totalHs > 0 ? Math.round(totalHs / kpis.totalHs * 100) : 0
                      const semsObra  = new Set(hsObra.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00'))))).size
                      const promSem   = semsObra > 0 ? Math.round(totalHs / semsObra * 10) / 10 : 0
                      return { cod, obra, totalHs, totalCost, pct, promSem }
                    })
                    .sort((a, b) => b.totalHs - a.totalHs)
                    .map(row => (
                      <tr key={row.cod} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">{row.cod}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-sm text-carbon">{row.obra?.nom ?? row.cod}</td>
                        <td className="px-4 py-3 font-mono font-bold text-azul text-sm">{row.totalHs}hs</td>
                        <td className="px-4 py-3 font-mono font-bold text-verde text-sm">{fmtM(row.totalCost)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gris rounded-full h-2 min-w-[60px]">
                              <div className="bg-naranja h-2 rounded-full transition-all" style={{ width: `${row.pct}%` }} />
                            </div>
                            <span className="text-xs font-mono font-bold text-gris-dark w-8 text-right">{row.pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gris-dark">{row.promSem}hs</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Detalle semanal ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl tracking-wider text-azul">DETALLE SEMANAL</h3>
              <span className="text-xs text-gris-dark">
                {semanas.length} semana{semanas.length !== 1 ? 's' : ''} con actividad
              </span>
            </div>
            {semanas.map(sem => (
              <SemanaCard
                key={sem.sk}
                sem={sem}
                fmtM={fmtM}
                fmtFecha={fmtFecha}
                mostrarObra={!obraFilt}
              />
            ))}
          </div>
        </>
      )}

    </div>
  )
}

// ── KPIChip ──

function KPIChip({ value, label, color }: { value: string; label: string; color: string }) {
  const colors: Record<string, string> = {
    azul:    'bg-azul-light text-azul-mid',
    verde:   'bg-verde-light text-verde',
    naranja: 'bg-naranja-light text-naranja-dark',
    purple:  'bg-[#EEE8FF] text-[#5A2D82]',
  }
  return (
    <div className={`rounded-lg px-3 py-1.5 text-center ${colors[color]}`}>
      <div className="font-mono font-bold text-sm leading-none">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mt-0.5">{label}</div>
    </div>
  )
}

// ── SemanaCard ──

function SemanaCard({
  sem, fmtM, fmtFecha, mostrarObra,
}: {
  sem: any
  fmtM: (n: number) => string
  fmtFecha: (s: string) => string
  mostrarObra: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gris/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-azul text-sm">{getSemLabel(sem.vie)}</span>
          <span className="text-[10px] font-bold bg-gris text-gris-dark px-2 py-0.5 rounded-full">
            💰 cobro {fmtFecha(toISO(sem.cobro))}
          </span>
          {mostrarObra && sem.obrasEnSem.length > 1 && (
            <span className="text-[10px] font-bold bg-amarillo-light text-[#7A5000] px-2 py-0.5 rounded-full">
              ↔ {sem.obrasEnSem.length} obras
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="font-mono font-bold text-azul text-sm">{sem.totalHs}hs</div>
            <div className="font-mono font-bold text-verde text-xs">{fmtM(sem.totalCosto)}</div>
          </div>
          <span className="text-gris-dark text-lg">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gris overflow-x-auto">
          <table className="w-full border-collapse min-w-[560px]">
            <thead>
              <tr>
                {mostrarObra && (
                  <th className="bg-azul text-white text-xs font-bold px-3 py-2 text-left uppercase tracking-wide">Obra</th>
                )}
                {DIAS.map((dia, i) => (
                  <th
                    key={i}
                    className={`text-white text-xs font-bold px-2 py-2 text-center uppercase tracking-wide min-w-[70px] font-mono
                      ${i === 6 ? 'bg-[#8B3510]' : i === 1 || i === 2 ? 'bg-[#5A2008]' : 'bg-naranja'}
                    `}
                  >
                    {dia}<br />
                    <span className="text-[10px] opacity-80">
                      {sem.days[i].getDate()}/{sem.days[i].getMonth() + 1}
                    </span>
                  </th>
                ))}
                <th className="bg-verde text-white text-xs font-bold px-2 py-2 text-center uppercase tracking-wide">Total</th>
                <th className="bg-[#0F4A28] text-white text-xs font-bold px-3 py-2 text-right uppercase tracking-wide">Costo</th>
              </tr>
            </thead>
            <tbody>
              {sem.obrasEnSem.map((ob: any) => (
                <tr key={ob.obra?.cod ?? 'unknown'} className="border-b border-gris last:border-0">
                  {mostrarObra && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] bg-gris px-1.5 py-0.5 rounded text-gris-dark font-bold flex-shrink-0">
                          {ob.obra?.cod ?? '—'}
                        </span>
                        <span className="text-xs font-semibold text-carbon truncate max-w-[120px]">
                          {ob.obra?.nom ?? ob.obra?.cod}
                        </span>
                      </div>
                    </td>
                  )}
                  {sem.days.map((d: Date, i: number) => {
                    const iso = toISO(d)
                    const h   = sem.horas.find((x: Hora) => x.fecha === iso && x.obra_cod === (ob.obra?.cod ?? ''))
                    const val = h?.horas ?? 0
                    return (
                      <td key={i} className="px-2 py-2 text-center">
                        {val > 0 ? (
                          <span className={`
                            inline-block font-mono font-bold text-sm px-2 py-0.5 rounded
                            ${val >= 8 ? 'bg-verde-light text-verde' : val >= 5 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-gris text-carbon'}
                          `}>
                            {val}
                          </span>
                        ) : (
                          <span className="text-gris-mid text-sm">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center bg-verde-light">
                    <span className="font-mono font-bold text-verde text-sm">{ob.hs}</span>
                  </td>
                  <td className="px-3 py-2 text-right bg-azul-light">
                    <span className="font-mono font-bold text-azul-mid text-sm">{fmtM(ob.costo)}</span>
                  </td>
                </tr>
              ))}

              {sem.obrasEnSem.length > 1 && (
                <tr className="border-t-2 border-naranja">
                  {mostrarObra && (
                    <td className="bg-azul px-3 py-2">
                      <span className="font-display text-white text-sm tracking-wide">TOTAL</span>
                    </td>
                  )}
                  {sem.days.map((d: Date, i: number) => {
                    const iso      = toISO(d)
                    const totalDia = sem.horas
                      .filter((h: Hora) => h.fecha === iso)
                      .reduce((s: number, h: Hora) => s + h.horas, 0)
                    return (
                      <td key={i} className="bg-azul text-white font-mono text-sm font-bold text-center px-2 py-2">
                        {totalDia > 0 ? totalDia : '—'}
                      </td>
                    )
                  })}
                  <td className="bg-azul text-[#7DD9A2] font-mono text-sm font-bold text-center px-2 py-2">
                    {sem.totalHs}
                  </td>
                  <td className="bg-azul text-naranja font-mono text-sm font-bold text-right px-3 py-2">
                    {fmtM(sem.totalCosto)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}