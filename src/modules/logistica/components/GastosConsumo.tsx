'use client'

import { useState } from 'react'
import {
  useReporteConsumoCamion, useRankingChoferesCombustible,
  useCamiones,
} from '../hooks/useLogistica'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

const fmt$  = (n: number | string | null | undefined) =>
  n == null ? '—' : `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtKmL = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toFixed(2)} km/L`
const fmtInt = (n: number | string | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('es-AR')
const fmtFecha = (s: string | null) => s ? new Date(s + 'T00:00').toLocaleDateString('es-AR') : '—'

function isoHoy() { return new Date().toISOString().slice(0, 10) }
function primerDiaMes(base: Date) { const d = new Date(base); d.setDate(1); return d.toISOString().slice(0, 10) }
function ultimoDiaMes(base: Date) { const d = new Date(base.getFullYear(), base.getMonth() + 1, 0); return d.toISOString().slice(0, 10) }
function primerDiaAnio(base: Date){ return `${base.getFullYear()}-01-01` }
function isoSumDias(base: Date, dias: number) { const d = new Date(base); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }

export function GastosConsumo() {
  const today = new Date()
  const [desde, setDesde]   = useState(primerDiaMes(today))
  const [hasta, setHasta]   = useState(isoHoy())
  const [camionId, setCamionId] = useState<number | null>(null)

  function preset(kind: 'mes_actual' | 'mes_anterior' | 'ult_30' | 'anio') {
    const t = new Date()
    if (kind === 'mes_actual')   { setDesde(primerDiaMes(t));                              setHasta(isoHoy()) }
    if (kind === 'mes_anterior') { const m = new Date(t.getFullYear(), t.getMonth()-1, 15); setDesde(primerDiaMes(m)); setHasta(ultimoDiaMes(m)) }
    if (kind === 'ult_30')       { setDesde(isoSumDias(t, -30));                           setHasta(isoHoy()) }
    if (kind === 'anio')         { setDesde(primerDiaAnio(t));                             setHasta(isoHoy()) }
  }

  const { data: camiones = [] }       = useCamiones()
  const { data: ranking, isLoading: lr } = useRankingChoferesCombustible(desde, hasta, 20)
  const { data: consumoCamion, isLoading: lc } = useReporteConsumoCamion(camionId, desde, hasta)

  const top    = ranking?.items.slice(0, 3)  ?? []
  const bottom = ranking?.items.slice(-3).reverse() ?? []
  const mejorKmL   = ranking?.items[0]?.km_por_litro
  const peorKmL    = ranking?.items[ranking.items.length - 1]?.km_por_litro
  const litrosTotal = ranking?.items.reduce((s, r) => s + r.total_litros, 0) ?? 0
  const gastoTotal  = ranking?.items.reduce((s, r) => s + r.total_gasto, 0) ?? 0
  const flotaKmL    = (() => {
    if (!ranking?.items?.length) return null
    const totKm = ranking.items.reduce((s, r) => s + r.total_km, 0)
    const totL  = ranking.items.reduce((s, r) => s + r.total_litros, 0)
    return totL > 0 ? Number((totKm / totL).toFixed(2)) : null
  })()

  return (
    <div className="flex flex-col gap-4">

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-2">
        <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => preset('mes_actual')}>Mes actual</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('mes_anterior')}>Mes anterior</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('ult_30')}>Últimos 30 días</Button>
          <Button variant="secondary" size="sm" onClick={() => preset('anio')}>Año en curso</Button>
        </div>
      </div>

      {/* KPIs */}
      {lr ? (
        <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark">Cargando…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Flota km/L"           value={fmtKmL(flotaKmL)}  accent="azul" />
          <Kpi label="Mejor km/L"           value={fmtKmL(mejorKmL)}  accent="verde" />
          <Kpi label="Peor km/L"            value={fmtKmL(peorKmL)} />
          <Kpi label="Litros totales"       value={fmtInt(Math.round(litrosTotal))} />
        </div>
      )}

      {/* Secundarios */}
      {ranking && ranking.items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Kpi label="Gasto total combustible"  value={fmt$(gastoTotal)} />
          <Kpi label="Choferes rankeados"       value={fmtInt(ranking.items.length)} />
        </div>
      )}

      {/* Ranking */}
      <Section title="Ranking de choferes (km/L)">
        {lr ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (ranking?.items.length ?? 0) === 0 ? (
            <span className="text-gris-dark text-sm">
              Sin datos. Necesitás al menos {ranking?.umbral_min_cargas ?? 3} cargas con litros por chofer en el rango.
            </span>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Chofer</th>
                  <th className="text-right px-3 py-2">km</th>
                  <th className="text-right px-3 py-2">Litros</th>
                  <th className="text-right px-3 py-2">km/L</th>
                  <th className="text-right px-3 py-2">Gasto</th>
                  <th className="text-right px-3 py-2">Cargas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {ranking!.items.map((r, i) => {
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
                  const isBottom = i === ranking!.items.length - 1 && ranking!.items.length > 3
                  return (
                    <tr key={r.chofer_id} className={isBottom ? 'bg-rojo-light/10' : ''}>
                      <td className="px-3 py-2">{medal || i + 1}</td>
                      <td className="px-3 py-2 font-semibold">{r.nombre}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInt(Math.round(r.total_km))}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInt(Math.round(r.total_litros))}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtKmL(r.km_por_litro)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt$(r.total_gasto)}</td>
                      <td className="px-3 py-2 text-right">{r.cargas_count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </Section>

      {/* Evolución por camión */}
      <Section title="Evolución de consumo por camión (odómetro)">
        <div className="mb-3">
          <Select
            label="Camión"
            value={camionId ? String(camionId) : ''}
            onChange={e => setCamionId(e.target.value ? Number(e.target.value) : null)}
            options={[{ value: '', label: 'Elegí un camión' }, ...camiones.map((c: any) => ({ value: String(c.id), label: c.patente }))]}
          />
        </div>

        {!camionId ? (
          <p className="text-gris-dark text-sm">Elegí un camión para ver su historial de tanqueos.</p>
        ) : lc ? (
          <span className="text-gris-dark text-sm">Cargando…</span>
        ) : (consumoCamion?.filas.length ?? 0) === 0 ? (
          <p className="text-gris-dark text-sm">
            Sin datos. Se necesitan al menos 2 cargas con odómetro + tanque lleno para calcular km/L.
          </p>
        ) : (
          <>
            <div className="mb-3 text-xs text-gris-dark">
              Total: <b>{fmtInt(consumoCamion!.total_km)} km</b> · <b>{fmtInt(Math.round(consumoCamion!.total_litros))} L</b> · promedio <b>{fmtKmL(consumoCamion!.km_por_litro_promedio)}</b>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-right px-3 py-2">Odómetro</th>
                  <th className="text-right px-3 py-2">km recorridos</th>
                  <th className="text-right px-3 py-2">Litros intervalo</th>
                  <th className="text-right px-3 py-2">km/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {consumoCamion!.filas.map((f, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{fmtFecha(f.fecha)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(f.odometro_km)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(f.km_recorridos)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(Math.round(f.litros_intervalo))}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmtKmL(f.km_por_litro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'azul' | 'verde' | 'naranja' }) {
  const accentCls = accent === 'azul'    ? 'border-azul-light text-azul-mid'
                  : accent === 'verde'   ? 'border-verde-light text-verde'
                  : accent === 'naranja' ? 'border-naranja-light text-naranja-dark'
                  : 'border-gris-mid text-carbon'
  return (
    <div className={`bg-white rounded-card shadow-card p-3 border-l-[4px] ${accentCls}`}>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className="font-mono font-bold text-xl mt-1">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-3 py-2 border-b border-gris bg-gris-light">
        <h3 className="text-sm font-bold text-carbon">{title}</h3>
      </div>
      <div className="p-3 overflow-x-auto">{children}</div>
    </div>
  )
}
