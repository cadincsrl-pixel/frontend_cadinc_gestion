'use client'

import { useState, useMemo } from 'react'
import { useObras }      from '@/modules/tarja/hooks/useObras'
import { usePersonal }   from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { TarjaTopbarActions } from '@/modules/tarja/components/TarjaTopbarActions'
import { useQuery }      from '@tanstack/react-query'
import { apiGet }        from '@/lib/api/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie,
  Cell,
} from 'recharts'
import type { Hora, Tarifa } from '@/types/domain.types'
import { toISO, getViernes } from '@/lib/utils/dates'

const COLORS = ['#E8621A', '#0F2744', '#1A6B3C', '#F5A623', '#C0392B', '#1D3F6E', '#5A2D82', '#1A7A45']

function fmtM(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

function fmtFecha(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function DashboardPage() {
  const hoy = new Date()

  const [desde, setDesde] = useState(
    toISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1))
  )
  const [hasta, setHasta] = useState(toISO(hoy))

  const { data: obras      = [] } = useObras()
  const { data: personal   = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()

  const { data: todasHoras   = [], isLoading: loadingHoras } = useQuery({
    queryKey: ['dashboard', 'horas'],
    queryFn:  () => apiGet<Hora[]>('/api/horas/all'),
  })

  const { data: todasTarifas = [] } = useQuery({
    queryKey: ['dashboard', 'tarifas'],
    queryFn:  () => apiGet<Tarifa[]>('/api/tarifas/all'),
  })

  // Horas filtradas por rango
  const horasFiltradas = useMemo(
    () => todasHoras.filter(h => h.fecha >= desde && h.fecha <= hasta),
    [todasHoras, desde, hasta]
  )

  // KPIs
  const totalHs = horasFiltradas.reduce((s, h) => s + h.horas, 0)

  const costoTotal = useMemo(() => horasFiltradas.reduce((sum, h) => {
    const p   = personal.find(x => x.leg === h.leg)
    if (!p) return sum
    const cat = categorias.find(c => c.id === p.cat_id)
    const tarifaObra = todasTarifas
      .filter(t => t.obra_cod === h.obra_cod && t.cat_id === p.cat_id && t.desde <= h.fecha)
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]
    const vh = tarifaObra?.vh ?? cat?.vh ?? 0
    return sum + h.horas * vh
  }, 0), [horasFiltradas, personal, categorias, todasTarifas])

  // Horas por semana
  const hsPorSemana = useMemo(() => {
    const map: Record<string, number> = {}
    horasFiltradas.forEach(h => {
      const semKey = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      map[semKey] = (map[semKey] ?? 0) + h.horas
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semKey, hs]) => {
        const d = new Date(semKey + 'T12:00:00')
        return { sem: `${d.getDate()}/${d.getMonth() + 1}`, hs }
      })
  }, [horasFiltradas])

  // Horas por obra
  const hsPorObra = useMemo(() => {
    const map: Record<string, number> = {}
    horasFiltradas.forEach(h => {
      map[h.obra_cod] = (map[h.obra_cod] ?? 0) + h.horas
    })
    return Object.entries(map)
      .map(([cod, hs]) => ({
        obra: obras.find(o => o.cod === cod)?.nom ?? cod,
        cod,
        hs,
      }))
      .sort((a, b) => b.hs - a.hs)
      .slice(0, 8)
  }, [horasFiltradas, obras])

  // Distribución por categoría
  const hsPorCategoria = useMemo(() => {
    const map: Record<number, number> = {}
    horasFiltradas.forEach(h => {
      const p = personal.find(x => x.leg === h.leg)
      if (!p) return
      map[p.cat_id] = (map[p.cat_id] ?? 0) + h.horas
    })
    return Object.entries(map)
      .map(([catId, hs]) => ({
        name: categorias.find(c => c.id === Number(catId))?.nom ?? `Cat #${catId}`,
        hs,
      }))
      .sort((a, b) => b.hs - a.hs)
  }, [horasFiltradas, personal, categorias])

  // Top trabajadores
  const topTrabajadores = useMemo(() => {
    const map: Record<string, number> = {}
    horasFiltradas.forEach(h => {
      map[h.leg] = (map[h.leg] ?? 0) + h.horas
    })
    return Object.entries(map)
      .map(([leg, hs]) => ({
        nom: personal.find(p => p.leg === leg)?.nom ?? leg,
        hs,
      }))
      .sort((a, b) => b.hs - a.hs)
      .slice(0, 10)
  }, [horasFiltradas, personal])

  // Costo por obra
  const costoPorObra = useMemo(() => {
    const map: Record<string, number> = {}
    horasFiltradas.forEach(h => {
      const p   = personal.find(x => x.leg === h.leg)
      if (!p) return
      const cat = categorias.find(c => c.id === p.cat_id)
      const tarifaObra = todasTarifas
        .filter(t => t.obra_cod === h.obra_cod && t.cat_id === p.cat_id && t.desde <= h.fecha)
        .sort((a, b) => b.desde.localeCompare(a.desde))[0]
      const vh = tarifaObra?.vh ?? cat?.vh ?? 0
      map[h.obra_cod] = (map[h.obra_cod] ?? 0) + h.horas * vh
    })
    return Object.entries(map)
      .map(([cod, costo]) => ({
        obra:  obras.find(o => o.cod === cod)?.nom ?? cod,
        costo,
      }))
      .sort((a, b) => b.costo - a.costo)
      .slice(0, 8)
  }, [horasFiltradas, obras, personal, categorias, todasTarifas])

  const shortcuts = [
    {
      label: 'Esta semana',
      fn: () => {
        const vie = getViernes(hoy)
        const jue = new Date(vie); jue.setDate(jue.getDate() + 6)
        setDesde(toISO(vie)); setHasta(toISO(jue))
      },
    },
    {
      label: 'Este mes',
      fn: () => {
        setDesde(toISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)))
        setHasta(toISO(hoy))
      },
    },
    {
      label: 'Últ. 3 meses',
      fn: () => {
        setDesde(toISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)))
        setHasta(toISO(hoy))
      },
    },
    {
      label: 'Este año',
      fn: () => {
        setDesde(toISO(new Date(hoy.getFullYear(), 0, 1)))
        setHasta(toISO(hoy))
      },
    },
  ]

  if (loadingHoras) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando datos del dashboard...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <TarjaTopbarActions />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">DASHBOARD</h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {fmtFecha(desde)} → {fmtFecha(hasta)}
          </p>
        </div>

        {/* Filtros de fecha */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gris-mid px-3 py-2 shadow-card">
              <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide whitespace-nowrap">
                Desde
              </span>
              <input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                className="text-sm font-mono outline-none bg-transparent text-carbon"
              />
            </div>
            <span className="text-gris-dark font-bold">→</span>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gris-mid px-3 py-2 shadow-card">
              <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wide whitespace-nowrap">
                Hasta
              </span>
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                className="text-sm font-mono outline-none bg-transparent text-carbon"
              />
            </div>
          </div>
          {/* Shortcuts */}
          <div className="flex gap-1 flex-wrap justify-end">
            {shortcuts.map(s => (
              <button
                key={s.label}
                onClick={s.fn}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-gris-mid text-gris-dark hover:bg-azul hover:text-white hover:border-azul transition-all shadow-card"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon="🏗"
          label="Obras activas"
          value={obras.length}
          sub={`${horasFiltradas.map(h => h.obra_cod).filter((v, i, a) => a.indexOf(v) === i).length} con actividad`}
          color="naranja"
        />
        <KPICard
          icon="👷"
          label="Trabajadores"
          value={personal.length}
          sub={`${horasFiltradas.map(h => h.leg).filter((v, i, a) => a.indexOf(v) === i).length} activos en período`}
          color="azul"
        />
        <KPICard
          icon="⏱"
          label="Horas totales"
          value={`${totalHs.toLocaleString('es-AR')}hs`}
          sub={`${hsPorSemana.length} semanas`}
          color="verde"
        />
        <KPICard
          icon="💰"
          label="Costo estimado"
          value={fmtM(costoTotal)}
          sub="Mano de obra"
          color="purple"
        />
      </div>

      {/* Gráfico línea — horas por semana */}
      <ChartCard
        title="📈 Horas por semana"
        subtitle="Evolución temporal del total de horas cargadas en el período"
      >
        {hsPorSemana.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={hsPorSemana} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEB" />
              <XAxis
                dataKey="sem"
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                formatter={(v: any) => [`${v}hs`, 'Horas']}
                labelFormatter={l => `Sem. del ${l}`}
                contentStyle={{ fontFamily: 'Syne', fontSize: 12, borderRadius: 8 }}
              />
              <Line
                type="monotone"
                dataKey="hs"
                stroke="#E8621A"
                strokeWidth={2.5}
                dot={{ fill: '#E8621A', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Horas por obra + distribución categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="🏗 Horas por obra"
          subtitle="Top obras por horas acumuladas"
        >
          {hsPorObra.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hsPorObra} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEB" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis
                  type="category"
                  dataKey="obra"
                  width={130}
                  tick={{ fontSize: 10, fontFamily: 'Syne' }}
                />
                <Tooltip
                  formatter={(v: any) => [`${v}hs`, 'Horas']}
                  contentStyle={{ fontFamily: 'Syne', fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="hs" fill="#0F2744" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="💼 Distribución por categoría"
          subtitle="Porcentaje de horas por rol"
        >
          {hsPorCategoria.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={hsPorCategoria}
                  dataKey="hs"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={45}
                >
                  {hsPorCategoria.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, name: any) => [`${v}hs`, name]}
                  contentStyle={{ fontFamily: 'Syne', fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* Leyenda manual */}
          <div className="flex flex-wrap gap-2 mt-3 px-2">
            {hsPorCategoria.map((c, i) => (
              <div key={c.name} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs text-gris-dark font-semibold">
                  {c.name} ({c.hs}hs)
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Costo por obra */}
      <ChartCard
        title="💰 Costo estimado por obra"
        subtitle="Costo de mano de obra acumulado en el período"
      >
        {costoPorObra.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costoPorObra} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEB" />
              <XAxis
                dataKey="obra"
                tick={{ fontSize: 10, fontFamily: 'Syne' }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={55}
              />
              <YAxis
                tickFormatter={v => fmtM(v)}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <Tooltip
                formatter={(v: any) => [fmtM(Number(v)), 'Costo']}
                contentStyle={{ fontFamily: 'Syne', fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="costo" fill="#1A6B3C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top trabajadores */}
      <ChartCard
        title="👷 Top trabajadores"
        subtitle="Por horas acumuladas en el período seleccionado"
      >
        {topTrabajadores.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topTrabajadores} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EFEB" />
              <XAxis
                dataKey="nom"
                tick={{ fontSize: 10, fontFamily: 'Syne' }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                formatter={(v: any) => [`${v}hs`, 'Horas']}
                contentStyle={{ fontFamily: 'Syne', fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="hs" fill="#E8621A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

    </div>
  )
}

// ── Componentes auxiliares ──

function KPICard({
  icon, label, value, sub, color,
}: {
  icon: string
  label: string
  value: string | number
  sub: string
  color: 'naranja' | 'azul' | 'verde' | 'purple'
}) {
  const borders: Record<string, string> = {
    naranja: 'border-naranja',
    azul:    'border-azul',
    verde:   'border-verde',
    purple:  'border-[#5A2D82]',
  }
  return (
    <div className={`bg-white rounded-card shadow-card p-4 border-l-4 ${borders[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gris-dark">
          {label}
        </span>
      </div>
      <div className="font-display text-2xl tracking-wider text-azul leading-none">
        {value}
      </div>
      <div className="text-xs text-gris-dark mt-1">{sub}</div>
    </div>
  )
}

function ChartCard({
  title, subtitle, children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-card shadow-card p-4">
      <div className="mb-4">
        <h3 className="font-bold text-azul text-base">{title}</h3>
        <p className="text-xs text-gris-dark mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[250px] flex items-center justify-center">
      <p className="text-gris-dark text-sm">Sin datos para el período seleccionado.</p>
    </div>
  )
}