'use client'

import { useState } from 'react'
import { fmtM, fmtFecha } from '../utils/pagos.utils'
import type { PagosProveedorSaldo } from '@/types/domain.types'

/**
 * Cuánto se le debe a cada proveedor, arriba de la bandeja.
 *
 * Es la pregunta con la que se entra al módulo («¿a quién le debemos y
 * cuánto?»), así que va antes que la lista y con la fila clickeable para
 * filtrar. Muestra el vencido aparte del saldo: un proveedor con $2M de los
 * cuales $1,8M están vencidos no es lo mismo que uno con todo en término.
 *
 * `saldo_aprobado` es lo que el contador YA puede pagar; la diferencia con
 * `saldo` está esperando aprobación.
 *
 * Desde 20260925 la nota de crédito aprobada y sin aplicar es crédito a favor
 * (`nc_disponible`), igual que un pago a cuenta: NO baja el saldo de las
 * facturas hasta que se aplica a mano. Por eso se muestra aparte y el «Neto»
 * (`saldo_neto` = saldo − a cuenta − NC disponible) es lo que se debe de verdad.
 */

interface Props {
  filas:        PagosProveedorSaldo[]
  cargando:     boolean
  proveedorSel?: number
  onElegir:     (id: number) => void
}

const TOPE_INICIAL = 5

export function DeudaPorProveedor({ filas, cargando, proveedorSel, onElegir }: Props) {
  const [verTodos, setVerTodos] = useState(false)

  const conDeuda = filas.filter(f => f.saldo > 0 || f.a_cuenta_sin_aplicar > 0 || Number(f.nc_disponible ?? 0) > 0)
  if (cargando && filas.length === 0) {
    return <div className="bg-white rounded-card shadow-card p-4 text-center text-xs text-gris-dark">Calculando la deuda por proveedor…</div>
  }
  if (conDeuda.length === 0) return null

  const visibles = verTodos ? conDeuda : conDeuda.slice(0, TOPE_INICIAL)
  const tot = conDeuda.reduce((s, f) => ({
    saldo:    s.saldo + Number(f.saldo ?? 0),
    aprobado: s.aprobado + Number(f.saldo_aprobado ?? 0),
    vencido:  s.vencido + Number(f.vencido ?? 0),
    credito:  s.credito + Number(f.nc_disponible ?? 0),
    neto:     s.neto + Number(f.saldo_neto ?? 0),
  }), { saldo: 0, aprobado: 0, vencido: 0, credito: 0, neto: 0 })

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">Deuda por proveedor</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gris-dark">Total <b className="font-mono tabular-nums text-carbon">{fmtM(tot.saldo)}</b></span>
          <span className="text-gris-dark">Listo para pagar <b className="font-mono tabular-nums text-azul">{fmtM(tot.aprobado)}</b></span>
          {tot.vencido > 0 && <span className="text-rojo">Vencido <b className="font-mono tabular-nums">{fmtM(tot.vencido)}</b></span>}
          {tot.credito > 0 && (
            <span className="text-[#5A2D82]" title="Notas de crédito aprobadas que todavía no se aplicaron a ninguna factura">
              NC sin aplicar <b className="font-mono tabular-nums">{fmtM(tot.credito)}</b>
            </span>
          )}
          <span className="text-gris-dark" title="Saldo − pagos a cuenta − notas de crédito sin aplicar">Neto <b className="font-mono tabular-nums text-carbon">{fmtM(tot.neto)}</b></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr>
              {['Proveedor', 'Facturas', 'Saldo', 'Listo para pagar', 'Vencido', 'Más vieja', 'A cuenta', 'NC sin aplicar', 'Neto'].map((h, i) => (
                <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-1.5 uppercase tracking-wide whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(f => {
              const sel = proveedorSel === f.proveedor_id
              return (
                <tr
                  key={f.proveedor_id}
                  onClick={() => onElegir(f.proveedor_id)}
                  className={`border-t border-gris cursor-pointer transition ${sel ? 'bg-naranja-light/40' : 'hover:bg-azul-light/30'}`}
                  title={sel ? 'Quitar el filtro por este proveedor' : 'Ver solo las facturas de este proveedor'}
                >
                  <td className="px-3 py-2 text-sm">
                    <span className="font-semibold">{f.razon_social}</span>
                    {!f.activo && <span className="ml-1 text-[10px] text-gris-dark uppercase">dado de baja</span>}
                    {f.para_aprobar > 0 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-azul-light text-azul font-bold" title="Facturas y notas de crédito esperando aprobación">
                        {f.para_aprobar} p/ aprobar
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{f.facturas_abiertas}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">{fmtM(f.saldo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-azul">{f.saldo_aprobado > 0 ? fmtM(f.saldo_aprobado) : <span className="text-gris-mid">—</span>}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${f.vencido > 0 ? 'text-rojo font-bold' : ''}`}>
                    {f.vencido > 0 ? fmtM(f.vencido) : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{fmtFecha(f.mas_vieja)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums" title="Pagos a cuenta todavía sin aplicar a una factura">
                    {f.a_cuenta_sin_aplicar > 0 ? <span className="text-verde">{fmtM(f.a_cuenta_sin_aplicar)}</span> : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums" title="Notas de crédito aprobadas sin aplicar: se aplican a mano desde la ficha de la NC">
                    {Number(f.nc_disponible ?? 0) > 0 ? <span className="text-[#5A2D82]">{fmtM(f.nc_disponible)}</span> : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold" title="Saldo − a cuenta − NC sin aplicar">
                    {fmtM(f.saldo_neto)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {conDeuda.length > TOPE_INICIAL && (
        <button
          type="button"
          onClick={() => setVerTodos(v => !v)}
          className="w-full px-4 py-1.5 text-xs text-gris-dark hover:bg-gris/40 border-t border-gris"
        >
          {verTodos ? '▴ Ver solo los 5 más grandes' : `▾ Ver los ${conDeuda.length} proveedores`}
        </button>
      )}
    </div>
  )
}
