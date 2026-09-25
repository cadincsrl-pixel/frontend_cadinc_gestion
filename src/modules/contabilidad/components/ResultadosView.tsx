'use client'

import Link from 'next/link'
import type { CtbEstadoFila, CtbResultadosRes, CtbSeccionResultados } from '@/types/contabilidad.types'
import { fmtM, fmtN } from '../utils/contabilidad.utils'
import { Tarjeta } from './Comun'

/**
 * Estado de resultados de un rango: Ingresos, Gastos y Resultado. En modo
 * comparativo, una columna por mes más el total, con la primera columna fija
 * al hacer scroll horizontal. Totales del server, no sumados en el cliente.
 */
export function ResultadosView({ res }: { res: CtbResultadosRes }) {
  const cols = res.comparativo ? res.columnas : []
  const hrefMayor = (f: CtbEstadoFila) => `/contabilidad?tab=mayor&cuenta_id=${f.cuenta_id}&desde=${res.desde}&hasta=${res.hasta}`
  const ganancia = res.resultado.total >= 0

  return (
    <Tarjeta className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${420 + cols.length * 120}px` }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide text-left">Cuenta</th>
              {cols.map(c => (
                <th key={c.clave} className="bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide text-right whitespace-nowrap">{c.etiqueta}</th>
              ))}
              <th className="bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <Seccion titulo="Ingresos" s={res.ingresos} ncols={cols.length} hrefMayor={hrefMayor} />
            <Seccion titulo="Gastos" s={res.gastos} ncols={cols.length} hrefMayor={hrefMayor} />
            <tr className="border-t-2 border-azul">
              <td className={`sticky left-0 bg-white px-3 py-2 text-xs font-bold uppercase ${ganancia ? 'text-verde' : 'text-rojo'}`}>
                Resultado ({ganancia ? 'ganancia' : 'pérdida'})
              </td>
              {cols.map((c, i) => {
                const v = res.resultado.totales_col[i] ?? 0
                return <td key={c.clave} className={`px-3 py-2 text-xs text-right font-mono font-bold tabular-nums ${v >= 0 ? 'text-verde' : 'text-rojo'}`}>{fmtN(v, '0,00')}</td>
              })}
              <td className={`px-3 py-2 text-sm text-right font-mono font-bold tabular-nums ${ganancia ? 'text-verde' : 'text-rojo'}`}>{fmtM(res.resultado.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

function Seccion({ titulo, s, ncols, hrefMayor }: {
  titulo: string; s: CtbSeccionResultados; ncols: number; hrefMayor: (f: CtbEstadoFila) => string
}) {
  return (
    <>
      <tr className="bg-azul-light/40">
        <td className="sticky left-0 bg-azul-light px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-azul" colSpan={1}>{titulo}</td>
        <td colSpan={ncols + 1} />
      </tr>
      {s.filas.length === 0 && (
        <tr><td className="px-3 py-2 text-xs text-gris-dark italic" colSpan={ncols + 2}>Sin movimientos.</td></tr>
      )}
      {s.filas.map((f, i) => (
        <tr key={`${f.cuenta_id ?? 'x'}-${i}`} className="border-t border-gris">
          <td className="sticky left-0 bg-white py-1 pr-3 text-xs" style={{ paddingLeft: `${0.75 + Math.max(0, f.nivel - 2) * 0.9}rem` }}>
            {f.imputable && f.cuenta_id ? (
              <Link href={hrefMayor(f)} className="hover:underline" title="Ver el mayor de la cuenta">
                <span className="font-mono">{f.codigo}</span> {f.nombre}
              </Link>
            ) : (
              <span className="font-semibold"><span className="font-mono">{f.codigo}</span> {f.nombre}</span>
            )}
          </td>
          {Array.from({ length: ncols }, (_, j) => (
            <td key={j} className="px-3 py-1 text-xs text-right font-mono tabular-nums">{fmtN(f.importes?.[j] ?? 0)}</td>
          ))}
          <td className={`px-3 py-1 text-xs text-right font-mono tabular-nums ${f.imputable ? '' : 'font-semibold'}`}>{fmtN(f.saldo, '0,00')}</td>
        </tr>
      ))}
      <tr className="border-t border-gris-mid">
        <td className="sticky left-0 bg-white px-3 py-1.5 text-xs font-bold">Total {titulo.toLowerCase()}</td>
        {Array.from({ length: ncols }, (_, j) => (
          <td key={j} className="px-3 py-1.5 text-xs text-right font-mono font-bold tabular-nums">{fmtN(s.totales_col[j] ?? 0, '0,00')}</td>
        ))}
        <td className="px-3 py-1.5 text-xs text-right font-mono font-bold tabular-nums">{fmtM(s.total)}</td>
      </tr>
    </>
  )
}
