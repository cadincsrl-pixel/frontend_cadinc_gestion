'use client'

import type { CuentaGrupo } from '@/types/domain.types'
import { fmtM, fmtFecha, fmtMes, type FilaGrupo } from './cuentaCorriente.utils'

/**
 * Una fila por obra, mes o proveedor con los cuatro estados en columnas.
 * Responde a los mismos filtros que la lista de renglones. Con grupo "obra",
 * click en la fila elige esa obra.
 */

interface Props {
  filas:       FilaGrupo[]
  grupo:       CuentaGrupo
  onElegirObra: (cod: string) => void
}

const th = (right = false) =>
  `bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`
const num = (n: number, bold = false) =>
  <td className={`px-3 py-2 text-right font-mono text-xs whitespace-nowrap ${bold ? 'font-bold' : ''}`}>{n > 0 ? fmtM(n) : <span className="text-gris-mid">—</span>}</td>

export function ResumenTabla({ filas, grupo, onElegirObra }: Props) {
  const tot = filas.reduce((s, f) => ({
    a_cobrar: s.a_cobrar + f.a_cobrar, cobrado: s.cobrado + f.cobrado, pago_directo: s.pago_directo + f.pago_directo,
    gasto_cadinc: s.gasto_cadinc + f.gasto_cadinc, total: s.total + f.total, renglones: s.renglones + f.renglones, sin_precio: s.sin_precio + f.sin_precio,
  }), { a_cobrar: 0, cobrado: 0, pago_directo: 0, gasto_cadinc: 0, total: 0, renglones: 0, sin_precio: 0 })

  const titulo = grupo === 'obra' ? 'Obra' : grupo === 'mes' ? 'Mes' : 'Proveedor'

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">Por {titulo.toLowerCase()}</h3>
        <span className="text-[11px] text-gris-dark">{filas.length} {grupo === 'obra' ? 'obras' : grupo === 'mes' ? 'meses' : 'proveedores'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr>
              <th className={th()}>{titulo}</th>
              {grupo === 'obra' && <th className={th()}>Modalidad</th>}
              <th className={th(true)}>A cobrar</th>
              <th className={th(true)}>Cobrado</th>
              <th className={th(true)}>Pagó directo</th>
              <th className={th(true)}>Gasto CADINC</th>
              <th className={th(true)}>Total</th>
              <th className={th(true)}>Renglones</th>
              <th className={th(true)}>Último</th>
              {grupo === 'obra' && <th className={th()} />}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gris-dark italic">Nada para mostrar con estos filtros.</td></tr>
            )}
            {filas.map(f => (
              <tr
                key={f.grupo}
                className={`border-t border-gris ${grupo === 'obra' ? 'hover:bg-azul-light/30 cursor-pointer' : ''}`}
                onClick={grupo === 'obra' ? () => onElegirObra(f.grupo) : undefined}
              >
                <td className="px-3 py-2">
                  <div className="text-sm font-bold">{grupo === 'mes' ? fmtMes(f.grupo) : f.grupo_nom}</div>
                  {grupo === 'obra' && <div className="text-[10px] text-gris-dark font-mono">{f.grupo}</div>}
                </td>
                {grupo === 'obra' && (
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {f.modalidad === 'cadinc'
                      ? <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded">LLAVE EN MANO</span>
                      : <span className="text-[10px] text-gris-dark">Materiales a cargo del cliente</span>}
                    {f.pagos > 0 && <div className="text-[10px] text-verde mt-0.5">{f.pagos} pago{f.pagos !== 1 ? 's' : ''} · {fmtM(f.monto_pagos)}</div>}
                  </td>
                )}
                {num(f.a_cobrar)}
                {num(f.cobrado)}
                {num(f.pago_directo)}
                <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                  {f.gasto_cadinc > 0 ? fmtM(f.gasto_cadinc) : <span className="text-gris-mid">—</span>}
                  {f.gasto_epp > 0 && <div className="text-[10px] text-gris-dark font-sans">EPP {fmtM(f.gasto_epp)}</div>}
                </td>
                {num(f.total, true)}
                <td className="px-3 py-2 text-right text-xs text-gris-dark whitespace-nowrap">
                  {f.renglones}
                  {f.sin_precio > 0 && <span className="ml-1.5 text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded">{f.sin_precio} sin precio</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-gris-dark whitespace-nowrap">{fmtFecha(f.ultimo)}</td>
                {grupo === 'obra' && <td className="px-3 py-2 text-right text-xs text-azul font-bold whitespace-nowrap">Ver →</td>}
              </tr>
            ))}
          </tbody>
          {filas.length > 1 && (
            <tfoot className="bg-gris/50">
              <tr className="border-t border-gris-mid">
                <td className="px-3 py-2 text-xs font-bold text-gris-dark uppercase tracking-wider" colSpan={grupo === 'obra' ? 2 : 1}>Total</td>
                {num(tot.a_cobrar, true)}
                {num(tot.cobrado, true)}
                {num(tot.pago_directo, true)}
                {num(tot.gasto_cadinc, true)}
                {num(tot.total, true)}
                <td className="px-3 py-2 text-right text-xs font-bold text-gris-dark">
                  {tot.renglones}
                  {tot.sin_precio > 0 && <span className="ml-1.5 text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded">{tot.sin_precio} sin precio</span>}
                </td>
                <td colSpan={grupo === 'obra' ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
