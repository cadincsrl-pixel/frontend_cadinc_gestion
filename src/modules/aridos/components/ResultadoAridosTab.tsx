'use client'

import { useMemo, useState } from 'react'
import { Select } from '@/components/ui/Select'
import { useResultadoMes, useGastosPorCategoria, useCargasCombustible } from '../hooks/useAridos'
import type { ResultadoMesArido } from '../types'

function fmtPlata(n: number, conSigno = false) {
  const v = Number(n)
  const s = `$${Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  if (v < 0) return `−${s}`
  return conSigno && v > 0 ? `+${s}` : s
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}
function nombreMes(iso: string) {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`)
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function mesesRecientes(): Array<{ value: string; label: string }> {
  const hoy = new Date()
  const out: Array<{ value: string; label: string }> = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    const value = d.toISOString().slice(0, 7)
    out.push({ value, label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) })
  }
  return out
}

function Celda({ valor, tono }: { valor: number; tono: 'ingreso' | 'egreso' | 'neutro' }) {
  const color = tono === 'ingreso' ? 'text-verde'
    : tono === 'egreso' ? 'text-rojo'
    : 'text-gris-dark'
  return (
    <td className={`px-3 py-2.5 text-sm text-right font-mono whitespace-nowrap ${color}`}>
      {valor === 0 ? <span className="text-gris-dark">—</span>
        : tono === 'egreso' ? `−${fmtPlata(valor)}` : fmtPlata(valor)}
    </td>
  )
}

export function ResultadoAridosTab() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))

  const { data: filas = [], isLoading } = useResultadoMes(mes)
  const { data: porCategoria = [] }     = useGastosPorCategoria(mes)
  const { data: cargas = [] }           = useCargasCombustible({
    desde: `${mes}-01`,
    hasta: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10),
  })

  const totales = useMemo(() => filas.reduce((acc, f: ResultadoMesArido) => ({
    ingresos:       acc.ingresos       + Number(f.ingresos),
    costo_material: acc.costo_material + Number(f.costo_material),
    gastos:         acc.gastos         + Number(f.gastos),
    mano_obra:      acc.mano_obra      + Number(f.mano_obra),
    costo_acopio:   acc.costo_acopio   + Number(f.costo_acopio),
    resultado:      acc.resultado      + Number(f.resultado),
  }), { ingresos: 0, costo_material: 0, gastos: 0, mano_obra: 0, costo_acopio: 0, resultado: 0 }), [filas])

  const margen = totales.ingresos > 0 ? totales.resultado / totales.ingresos : 0

  // El gasoil se mira aparte porque es el egreso que más se mueve y el único
  // que tiene un precio de referencia contra el cual comparar.
  const litros = cargas.reduce((s, c) => s + Number(c.litros), 0)
  const gastoCombustible = cargas.reduce((s, c) => s + Number(c.monto), 0)
  const precioLitroProm = litros > 0 ? gastoCombustible / litros : 0

  const categoriasDelMes = useMemo(() => {
    const acc = new Map<string, { nombre: string; total: number }>()
    for (const g of porCategoria) {
      const prev = acc.get(g.categoria_codigo)
      acc.set(g.categoria_codigo, {
        nombre: g.categoria,
        total: (prev?.total ?? 0) + Number(g.total),
      })
    }
    return [...acc.values()].sort((a, b) => b.total - a.total)
  }, [porCategoria])

  const sinDatos = !isLoading && filas.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-3">
        <Select label="Mes" options={mesesRecientes()} value={mes}
          onChange={e => setMes(e.target.value)} className="min-w-[190px]" />
        <p className="text-xs text-gris-dark ml-auto max-w-[420px]">
          Lo facturado en ventas menos lo que cobra la cantera por el material, los gastos de los
          camiones y los jornales de los choferes.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Calculando…</div>
      ) : sinDatos ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          No hay movimientos en {nombreMes(mes)}.
        </div>
      ) : (
        <>
          {/* Los cuatro números que se miran primero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-verde">
              <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Facturado</p>
              <p className="font-mono text-xl font-bold text-verde mt-1">{fmtPlata(totales.ingresos)}</p>
            </div>
            <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-rojo">
              <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Material de cantera</p>
              <p className="font-mono text-xl font-bold text-rojo mt-1">−{fmtPlata(totales.costo_material)}</p>
            </div>
            <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
              <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Gastos y jornales</p>
              <p className="font-mono text-xl font-bold text-naranja mt-1">
                −{fmtPlata(totales.gastos + totales.mano_obra)}
              </p>
            </div>
            <div className={`bg-white rounded-card shadow-card p-4 border-l-[5px] ${totales.resultado >= 0 ? 'border-azul' : 'border-rojo'}`}>
              <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Resultado</p>
              <p className={`font-mono text-xl font-bold mt-1 ${totales.resultado >= 0 ? 'text-azul' : 'text-rojo'}`}>
                {fmtPlata(totales.resultado, true)}
              </p>
              {totales.ingresos > 0 && (
                <p className="text-[11px] text-gris-dark mt-0.5">{fmtPct(margen)} de lo facturado</p>
              )}
            </div>
          </div>

          {/* El desglose por camión, que es la pregunta original */}
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[820px]">
                <thead>
                  <tr>
                    {['Camión', 'Facturado', 'Material', 'Gastos', 'Jornales', 'Resultado', 'Margen'].map((h, i) => (
                      <th key={i} className={`bg-azul text-white text-xs font-bold px-3 py-3 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => {
                    const m = Number(f.ingresos) > 0 ? Number(f.resultado) / Number(f.ingresos) : null
                    return (
                      <tr key={`${f.mes}-${f.unidad_id ?? 'area'}`} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                        <td className="px-3 py-2.5 text-sm font-bold text-carbon">
                          {f.unidad}
                          {f.patente && <span className="text-[11px] text-gris-dark font-normal font-mono ml-2">{f.patente}</span>}
                        </td>
                        <Celda valor={Number(f.ingresos)}       tono="ingreso" />
                        <Celda valor={Number(f.costo_material)} tono="egreso" />
                        <Celda valor={Number(f.gastos)}         tono="egreso" />
                        <Celda valor={Number(f.mano_obra)}      tono="egreso" />
                        <td className={`px-3 py-2.5 text-sm text-right font-mono font-bold whitespace-nowrap ${Number(f.resultado) >= 0 ? 'text-carbon' : 'text-rojo'}`}>
                          {fmtPlata(Number(f.resultado), true)}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-right font-mono text-gris-dark whitespace-nowrap">
                          {m == null ? '—' : fmtPct(m)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gris/60 border-t-2 border-azul">
                    <td className="px-3 py-2.5 text-sm font-bold text-carbon">Total del mes</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-verde">{fmtPlata(totales.ingresos)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-rojo">−{fmtPlata(totales.costo_material)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-rojo">−{fmtPlata(totales.gastos)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-rojo">−{fmtPlata(totales.mano_obra)}</td>
                    <td className={`px-3 py-2.5 text-sm text-right font-mono font-bold ${totales.resultado >= 0 ? 'text-azul' : 'text-rojo'}`}>
                      {fmtPlata(totales.resultado, true)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-gris-dark">
                      {totales.ingresos > 0 ? fmtPct(margen) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {totales.mano_obra === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 px-4 py-2 border-t border-gris">
                Los jornales figuran en cero: todavía no hay días de chofer cargados en este mes, así que
                el resultado está incompleto por arriba.
              </p>
            )}
            {totales.costo_acopio > 0 && (
              <p className="text-[11px] text-gris-dark px-4 py-2 border-t border-gris">
                Además se compraron {fmtPlata(totales.costo_acopio)} de material a stock. No se descuenta acá:
                es costo recién cuando ese material se vende.
              </p>
            )}
            <p className="text-[11px] text-gris-dark px-4 py-2 border-t border-gris">
              Un renglón &quot;Del área&quot; no es un error: son las ventas con flete del cliente y los gastos
              que no son de un camión en particular, como un seguro anual.
            </p>
          </div>

          {/* En qué se fue la plata */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              <h3 className="bg-azul text-white text-xs font-bold px-4 py-2.5 uppercase tracking-wide">En qué se fue</h3>
              {categoriasDelMes.length === 0 ? (
                <p className="p-6 text-center text-sm text-gris-dark italic">Sin gastos cargados en el mes.</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {categoriasDelMes.map(c => {
                      const pct = totales.gastos > 0 ? c.total / totales.gastos : 0
                      return (
                        <tr key={c.nombre} className="border-b border-gris last:border-0">
                          <td className="px-4 py-2 text-sm text-carbon w-[45%]">{c.nombre}</td>
                          <td className="px-4 py-2">
                            <div className="h-2 bg-gris rounded-full overflow-hidden">
                              <div className="h-full bg-naranja rounded-full" style={{ width: `${Math.max(pct * 100, 2)}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-carbon whitespace-nowrap">{fmtPlata(c.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-card shadow-card overflow-hidden">
              <h3 className="bg-azul text-white text-xs font-bold px-4 py-2.5 uppercase tracking-wide">Combustible del mes</h3>
              {cargas.length === 0 ? (
                <p className="p-6 text-center text-sm text-gris-dark italic">Sin cargas registradas.</p>
              ) : (
                <div className="p-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Litros</p>
                    <p className="font-mono text-lg font-bold text-carbon mt-1">{litros.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Gasto</p>
                    <p className="font-mono text-lg font-bold text-carbon mt-1">{fmtPlata(gastoCombustible)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gris-dark font-bold">Precio x litro</p>
                    <p className="font-mono text-lg font-bold text-carbon mt-1">{fmtPlata(precioLitroProm)}</p>
                  </div>
                </div>
              )}
              {cargas.some(c => (c.warnings ?? []).length > 0) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 px-4 py-2 border-t border-gris">
                  Hay cargas con avisos de odómetro o consumo. El gasto se contó igual; revisalas en el tab Gastos.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
