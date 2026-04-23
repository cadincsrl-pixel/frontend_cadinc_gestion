'use client'

import { useState, useMemo } from 'react'
import {
  useGastosResumen, useGastosPorCamion, useGastosPorChofer, useGastosPorCategoria,
} from '../hooks/useLogistica'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'

const fmt$ = (n: number | string) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtInt = (n: number | string) => Number(n).toLocaleString('es-AR')

function isoHoy() { return new Date().toISOString().slice(0, 10) }
function isoSumDias(base: Date, dias: number) {
  const d = new Date(base); d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}
function primerDiaMes(base: Date) { const d = new Date(base); d.setDate(1); return d.toISOString().slice(0, 10) }
function ultimoDiaMes(base: Date) { const d = new Date(base.getFullYear(), base.getMonth() + 1, 0); return d.toISOString().slice(0, 10) }
function primerDiaAnio(base: Date){ return `${base.getFullYear()}-01-01` }

export function GastosReportes() {
  // Default: mes actual
  const today = new Date()
  const [desde, setDesde] = useState(primerDiaMes(today))
  const [hasta, setHasta] = useState(isoHoy())

  function preset(kind: 'mes_actual' | 'mes_anterior' | 'ult_30' | 'anio') {
    const t = new Date()
    if (kind === 'mes_actual') {
      setDesde(primerDiaMes(t)); setHasta(isoHoy())
    } else if (kind === 'mes_anterior') {
      const mesAnt = new Date(t.getFullYear(), t.getMonth() - 1, 15)
      setDesde(primerDiaMes(mesAnt)); setHasta(ultimoDiaMes(mesAnt))
    } else if (kind === 'ult_30') {
      setDesde(isoSumDias(t, -30)); setHasta(isoHoy())
    } else if (kind === 'anio') {
      setDesde(primerDiaAnio(t)); setHasta(isoHoy())
    }
  }

  const enabled = !!desde && !!hasta
  const { data: resumen,     isLoading: lr } = useGastosResumen(desde, hasta, enabled)
  const { data: porCamion,   isLoading: lc } = useGastosPorCamion(desde, hasta, enabled)
  const { data: porChofer,   isLoading: lch } = useGastosPorChofer(desde, hasta, enabled)
  const { data: porCat,      isLoading: lca } = useGastosPorCategoria(desde, hasta, enabled)

  return (
    <div className="flex flex-col gap-4">

      {/* Filtro de rango + presets */}
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
        <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark">Cargando resumen…</div>
      ) : resumen && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total del período" value={fmt$(resumen.total)} accent="azul" />
            <Kpi label="Cantidad de gastos" value={fmtInt(resumen.count)} />
            <Kpi label="Promedio por gasto" value={fmt$(resumen.promedio)} />
            <Kpi label="Reintegros pendientes" value={fmt$(resumen.reintegros_pendientes)} accent="naranja" />
          </div>

          {resumen.pendientes_aprobacion > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-card p-3 text-sm text-amber-900">
              ⚠ Hay {fmt$(resumen.pendientes_aprobacion)} en gastos <b>pendientes de aprobación</b> dentro del rango.
            </div>
          )}

          {/* Breakdown del resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DistribCard title="Por estado"       rows={resumen.por_estado}      total={resumen.total} />
            <DistribCard title="Por quién pagó"   rows={resumen.por_pagado_por}  total={resumen.total} />
            <DistribCard title="Por método de pago" rows={resumen.por_metodo_pago} total={resumen.total} />
          </div>
        </>
      )}

      {/* Por categoría */}
      <Section title="Gastos por categoría">
        {lca ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porCat?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Categoría</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2 w-1/3">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porCat!.map(r => (
                  <tr key={r.categoria_id}>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2">
                      <Bar pct={r.pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      {/* Por camión */}
      <Section title="Gastos por camión">
        {lc ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porCamion?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Camión</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Top categorías</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porCamion!.map(r => (
                  <tr key={r.camion_id}>
                    <td className="px-3 py-2 font-mono font-bold">{r.patente}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2"><TopCategorias data={r.por_categoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      {/* Por chofer */}
      <Section title="Gastos por chofer">
        {lch ? <span className="text-gris-dark text-sm">Cargando…</span>
          : (porChofer?.length ?? 0) === 0 ? <span className="text-gris-dark text-sm">Sin datos en el rango.</span>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gris-light text-xs text-gris-dark uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Chofer</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Reintegros pend.</th>
                  <th className="text-left px-3 py-2">Top categorías</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {porChofer!.map(r => (
                  <tr key={r.chofer_id}>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(r.count)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2 text-right font-mono text-naranja-dark">
                      {r.reintegros_pendientes > 0 ? fmt$(r.reintegros_pendientes) : '—'}
                    </td>
                    <td className="px-3 py-2"><TopCategorias data={r.por_categoria} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'azul' | 'naranja' }) {
  const accentCls = accent === 'azul'    ? 'border-azul-light text-azul-mid'
                  : accent === 'naranja' ? 'border-naranja-light text-naranja-dark'
                  : 'border-gris-mid text-carbon'
  return (
    <div className={`bg-white rounded-card shadow-card p-3 border-l-[4px] ${accentCls}`}>
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className="font-mono font-bold text-xl mt-1">{value}</div>
    </div>
  )
}

function DistribCard({ title, rows, total }: {
  title: string
  rows: Record<string, { total: number; count: number }>
  total: number
}) {
  const entries = useMemo(() => Object.entries(rows).sort(([,a],[,b]) => b.total - a.total), [rows])
  return (
    <div className="bg-white rounded-card shadow-card p-3">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">{title}</div>
      {entries.length === 0 ? (
        <div className="text-sm text-gris-mid italic">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map(([k, v]) => {
            const pct = total > 0 ? (v.total / total) * 100 : 0
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate">{k}</span>
                <Bar pct={pct} />
                <span className="font-mono font-bold text-right w-24">{fmt$(v.total)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Bar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gris rounded-full overflow-hidden">
        <div className="h-full bg-azul" style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-gris-dark font-mono w-12 text-right">{clamped.toFixed(1)}%</span>
    </div>
  )
}

function TopCategorias({ data }: { data: Record<string, number> }) {
  const top = Object.entries(data).sort(([,a],[,b]) => b - a).slice(0, 3)
  if (top.length === 0) return <span className="text-gris-mid italic text-xs">—</span>
  return (
    <div className="flex gap-1.5 flex-wrap">
      {top.map(([cat, monto]) => (
        <span key={cat} className="text-[10px] bg-gris-light text-gris-dark px-1.5 py-0.5 rounded-full font-mono">
          {cat}: {fmt$(monto)}
        </span>
      ))}
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
