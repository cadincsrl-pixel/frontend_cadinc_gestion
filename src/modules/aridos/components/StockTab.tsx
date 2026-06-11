'use client'

import { useStockAridos } from '../hooks/useAridos'

function fmtCant(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function StockTab() {
  const { data: stock = [], isLoading } = useStockAridos()

  // Solo materiales por m³ (el escombro por viaje no acumula stock) y
  // los que tengan algún movimiento aunque estén inactivos.
  const filas = stock.filter(s => s.unidad === 'm3' && (s.activo || s.entradas + s.salidas + s.ajustes !== 0))

  if (isLoading) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando stock...</div>
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[560px]">
          <thead>
            <tr>
              {['Material', 'Acopios (entradas)', 'Ventas desde depósito', 'Ajustes', 'Stock disponible'].map((h, i) => (
                <th key={i} className={`bg-azul text-white text-xs font-bold px-4 py-3 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(s => (
              <tr key={s.material_id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-bold text-sm text-carbon">
                  {s.nombre}
                  {!s.activo && <span className="text-[10px] text-gris-dark font-normal ml-2">(inactivo)</span>}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-verde">+{fmtCant(s.entradas)}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-rojo">−{fmtCant(s.salidas)}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gris-dark">{s.ajustes >= 0 ? '+' : ''}{fmtCant(s.ajustes)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${s.stock < 0 ? 'text-rojo' : 'text-carbon'}`}>
                  {fmtCant(s.stock)} m³
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gris-dark italic">
                  Sin movimientos todavía. El stock se arma con los acopios de cantera y se descuenta con las ventas desde depósito.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gris-dark px-4 py-2 border-t border-gris">
        Las ventas directas de cantera no pasan por acá. Si el stock físico difiere, cargá un ajuste desde el tab Acopios.
      </p>
    </div>
  )
}
