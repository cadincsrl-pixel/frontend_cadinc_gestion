'use client'

import { useState, useMemo } from 'react'
import { useMovimientos, type Movimiento } from '../hooks/useCaja'

type Periodo = 'semana' | 'mes' | 'mesant' | 'custom'

function startOfWeek(d: Date) {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0]!
}

function fmtMonto(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

function getPeriodRange(periodo: Periodo, custom: { desde: string; hasta: string }) {
  const now = new Date()
  if (periodo === 'semana') {
    const lunes = startOfWeek(new Date())
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    return { desde: toISO(lunes), hasta: toISO(domingo) }
  }
  if (periodo === 'mes') {
    const desde = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const hasta = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    return { desde, hasta }
  }
  if (periodo === 'mesant') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const hasta = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    return { desde, hasta }
  }
  return custom
}

export function ResumenTab() {
  const { data: movimientos = [] } = useMovimientos()
  const [periodo,  setPeriodo]  = useState<Periodo>('mes')
  const [custom,   setCustom]   = useState({ desde: '', hasta: '' })

  const { desde, hasta } = getPeriodRange(periodo, custom)

  const filtrados = useMemo(() =>
    movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta),
    [movimientos, desde, hasta]
  )

  const totalIngresos    = filtrados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalEgresos     = filtrados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
  const resultado        = totalIngresos - totalEgresos
  const cantMovimientos  = filtrados.length

  // Agrupado por centro de costo
  const porCC = useMemo(() => {
    const map: Record<string, { ingresos: number; egresos: number }> = {}
    for (const m of filtrados) {
      const key = m.centro_costo ?? '(sin centro)'
      if (!map[key]) map[key] = { ingresos: 0, egresos: 0 }
      if (m.tipo === 'ingreso') map[key]!.ingresos += m.monto
      else map[key]!.egresos += m.monto
    }
    return Object.entries(map).sort((a, b) => (b[1].ingresos + b[1].egresos) - (a[1].ingresos + a[1].egresos))
  }, [filtrados])

  // Agrupado por concepto
  const porConcepto = useMemo(() => {
    const map: Record<string, { tipo: string; total: number; count: number }> = {}
    for (const m of filtrados) {
      if (!map[m.concepto]) map[m.concepto] = { tipo: m.tipo, total: 0, count: 0 }
      map[m.concepto]!.total += m.monto
      map[m.concepto]!.count++
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [filtrados])

  const TABS: { key: Periodo; label: string }[] = [
    { key: 'semana',  label: 'Esta semana' },
    { key: 'mes',     label: 'Este mes'    },
    { key: 'mesant',  label: 'Mes anterior'},
    { key: 'custom',  label: 'Personalizado'},
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* Selector de período */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-wrap items-center gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setPeriodo(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              periodo === t.key
                ? 'bg-azul text-white'
                : 'bg-gris text-carbon hover:bg-gris-dark/20'
            }`}
          >
            {t.label}
          </button>
        ))}
        {periodo === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={custom.desde}
              onChange={e => setCustom(p => ({ ...p, desde: e.target.value }))}
              className="border border-gris rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-azul"
            />
            <span className="text-gris-dark text-sm">→</span>
            <input
              type="date"
              value={custom.hasta}
              onChange={e => setCustom(p => ({ ...p, hasta: e.target.value }))}
              className="border border-gris rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-azul"
            />
          </div>
        )}
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Ingresos" value={`$ ${fmtMonto(totalIngresos)}`} color="verde" icon="▲" />
        <Card label="Egresos"  value={`$ ${fmtMonto(totalEgresos)}`}  color="rojo"  icon="▼" />
        <Card
          label="Resultado"
          value={`$ ${fmtMonto(Math.abs(resultado))}`}
          color={resultado >= 0 ? 'verde' : 'rojo'}
          icon={resultado >= 0 ? '✓' : '✗'}
          sub={resultado >= 0 ? 'superávit' : 'déficit'}
        />
        <Card label="Movimientos" value={String(cantMovimientos)} color="azul" icon="📋" />
      </div>

      {/* Por centro de costo */}
      {porCC.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris">
            <h3 className="font-display text-lg tracking-wider text-azul">Por Centro de Costo</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gris bg-gris/30">
                <th className="text-left px-4 py-2 text-xs font-bold text-gris-dark uppercase">Centro</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-verde uppercase">Ingresos</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-rojo uppercase">Egresos</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-gris-dark uppercase">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {porCC.map(([cc, vals]) => {
                const res = vals.ingresos - vals.egresos
                return (
                  <tr key={cc} className="border-b border-gris last:border-0 hover:bg-gris/20">
                    <td className="px-4 py-2.5 font-semibold text-carbon">{cc}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-verde">$ {fmtMonto(vals.ingresos)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-rojo">$ {fmtMonto(vals.egresos)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${res >= 0 ? 'text-verde' : 'text-rojo'}`}>
                      $ {fmtMonto(Math.abs(res))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Por concepto */}
      {porConcepto.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris">
            <h3 className="font-display text-lg tracking-wider text-azul">Por Concepto</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gris bg-gris/30">
                <th className="text-left px-4 py-2 text-xs font-bold text-gris-dark uppercase">Concepto</th>
                <th className="text-center px-4 py-2 text-xs font-bold text-gris-dark uppercase">Tipo</th>
                <th className="text-center px-4 py-2 text-xs font-bold text-gris-dark uppercase">Cant.</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-gris-dark uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {porConcepto.map(([concepto, vals]) => (
                <tr key={concepto} className="border-b border-gris last:border-0 hover:bg-gris/20">
                  <td className="px-4 py-2.5 font-semibold text-carbon">{concepto}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vals.tipo === 'ingreso' ? 'bg-verde/10 text-verde' : 'bg-rojo/10 text-rojo'}`}>
                      {vals.tipo === 'ingreso' ? '▲ ing' : '▼ egr'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gris-dark">{vals.count}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold ${vals.tipo === 'ingreso' ? 'text-verde' : 'text-rojo'}`}>
                    $ {fmtMonto(vals.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtrados.length === 0 && (
        <div className="bg-white rounded-card shadow-card p-10 text-center text-gris-dark text-sm">
          No hay movimientos en el período seleccionado.
        </div>
      )}
    </div>
  )
}

function Card({ label, value, color, icon, sub }: {
  label: string; value: string; color: string; icon: string; sub?: string
}) {
  const colors: Record<string, string> = {
    verde: 'border-verde bg-verde/5 text-verde',
    rojo:  'border-rojo  bg-rojo/5  text-rojo',
    azul:  'border-azul  bg-azul/5  text-azul',
  }
  return (
    <div className={`bg-white rounded-card shadow-card p-4 border-l-4 ${colors[color] ?? colors['azul']}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-gris-dark">{label}</span>
      </div>
      <div className={`font-mono font-bold text-lg ${colors[color]?.split(' ').pop()}`}>{value}</div>
      {sub && <div className="text-xs text-gris-dark mt-0.5 font-semibold uppercase">{sub}</div>}
    </div>
  )
}
