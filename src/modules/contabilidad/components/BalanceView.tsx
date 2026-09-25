'use client'

import Link from 'next/link'
import type { CtbBalanceRes, CtbEstadoFila, CtbGrupoBalance } from '@/types/contabilidad.types'
import { fmtFecha, fmtM, fmtN } from '../utils/contabilidad.utils'
import { grupoDeFila } from '../utils/exportarEstados'
import { Aviso, Tarjeta } from './Comun'

/**
 * Estado de situación patrimonial a una fecha: Activo por un lado, Pasivo +
 * PN por el otro, con sangría por nivel y subtotales por grupo (corriente /
 * no corriente). Los totales vienen del server (de las raíces del plan):
 * nunca se suman las filas visibles, que dependen del nivel elegido.
 */
export function BalanceView({ res }: { res: CtbBalanceRes }) {
  const hrefMayor = (f: CtbEstadoFila) =>
    `/contabilidad?tab=mayor&cuenta_id=${f.cuenta_id}&desde=${res.ejercicio.desde}&hasta=${res.fecha}`

  return (
    <div className="flex flex-col gap-3">
      {res.sin_apertura && (
        <Aviso tono="amarillo">
          El ejercicio todavía no tiene asiento de apertura: los saldos son solo los movimientos desde el {fmtFecha(res.ejercicio.desde)}.
        </Aviso>
      )}
      {!res.cuadra && (
        <Aviso tono="rojo">
          El balance no cuadra: Activo − (Pasivo + PN) = {fmtM(res.diferencia)}. Revisá los asientos del período.
        </Aviso>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <Seccion titulo="Activo" total={res.activo.total} filas={res.activo.filas} grupos={res.activo.grupos} hrefMayor={hrefMayor} />
        <div className="flex flex-col gap-3">
          <Seccion titulo="Pasivo" total={res.pasivo.total} filas={res.pasivo.filas} grupos={res.pasivo.grupos} hrefMayor={hrefMayor} />
          <Seccion titulo="Patrimonio neto" total={res.pn.total} filas={res.pn.filas} grupos={[]} hrefMayor={hrefMayor}
            ayudaVirtual={`Ingresos menos gastos desde el ${fmtFecha(res.ejercicio.desde)} hasta el ${fmtFecha(res.fecha)}, sin asiento de cierre`} />
          <Tarjeta className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-azul">Total Pasivo + PN</span>
            <span className={`font-mono font-bold tabular-nums ${res.cuadra ? 'text-azul' : 'text-rojo'}`}>{fmtM(res.pasivo_mas_pn)}</span>
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}

function Seccion({ titulo, total, filas, grupos, hrefMayor, ayudaVirtual }: {
  titulo: string; total: number; filas: CtbEstadoFila[]; grupos: CtbGrupoBalance[]
  hrefMayor: (f: CtbEstadoFila) => string; ayudaVirtual?: string
}) {
  // Subtotal de cada grupo al terminar sus filas (mismo criterio que el Excel).
  const renglones: ({ tipo: 'fila'; f: CtbEstadoFila } | { tipo: 'grupo'; g: CtbGrupoBalance })[] = []
  const impresos = new Set<CtbGrupoBalance>()
  let actual: CtbGrupoBalance | null = null
  for (const f of filas) {
    const g = grupoDeFila(f, grupos)
    if (actual && g !== actual) { renglones.push({ tipo: 'grupo', g: actual }); impresos.add(actual) }
    actual = g
    renglones.push({ tipo: 'fila', f })
  }
  if (actual) { renglones.push({ tipo: 'grupo', g: actual }); impresos.add(actual) }
  for (const g of grupos) if (!impresos.has(g)) renglones.push({ tipo: 'grupo', g })

  return (
    <Tarjeta className="overflow-hidden">
      <div className="px-3 py-2 bg-azul-light/40 text-xs font-bold uppercase tracking-wide text-azul">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[420px]">
          <tbody>
            {renglones.length === 0 && (
              <tr><td className="px-3 py-2 text-xs text-gris-dark italic" colSpan={2}>Sin saldos.</td></tr>
            )}
            {renglones.map((r, i) => r.tipo === 'grupo' ? (
              <tr key={`g-${r.g.codigo ?? 'x'}-${i}`} className="border-t border-gris bg-gris/40">
                <td className="px-3 py-1 text-xs font-semibold">Total {r.g.nombre}</td>
                <td className="px-3 py-1 text-xs text-right font-mono font-semibold tabular-nums w-[150px]">{fmtN(r.g.total, '0,00')}</td>
              </tr>
            ) : (
              <tr key={`f-${r.f.cuenta_id ?? 'v'}-${i}`} className="border-t border-gris">
                <td className="py-1 pr-3 text-xs" style={{ paddingLeft: `${0.75 + (r.f.nivel - 1) * 0.9}rem` }}>
                  {r.f.virtual ? (
                    <span className="italic" title={ayudaVirtual}>{r.f.nombre}</span>
                  ) : r.f.imputable && r.f.cuenta_id ? (
                    <Link href={hrefMayor(r.f)} className="hover:underline" title="Ver el mayor de la cuenta">
                      <span className="font-mono">{r.f.codigo}</span> {r.f.nombre}
                    </Link>
                  ) : (
                    <span className={r.f.imputable ? '' : 'font-semibold'}><span className="font-mono">{r.f.codigo}</span> {r.f.nombre}</span>
                  )}
                </td>
                <td className={`px-3 py-1 text-xs text-right font-mono tabular-nums w-[150px] ${r.f.imputable || r.f.virtual ? '' : 'font-semibold'}`}>
                  {fmtN(r.f.saldo, '0,00')}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-azul">
              <td className="px-3 py-1.5 text-xs font-bold uppercase text-azul">Total {titulo}</td>
              <td className="px-3 py-1.5 text-sm text-right font-mono font-bold tabular-nums text-azul">{fmtM(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}
