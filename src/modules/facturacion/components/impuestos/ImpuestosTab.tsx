'use client'

import { useMemo, useState } from 'react'
import { usePermisos } from '@/hooks/usePermisos'
import { mesesRecientes, nombreMes } from '../../utils/lidVentas'
import { LibroIvaCompras } from './LibroIvaCompras'
import { LibroIvaVentas } from './LibroIvaVentas'
import { PosicionIva } from './PosicionIva'

/**
 * Tab «Impuestos» (24/09): los impuestos se llevan desde el ERP, no en
 * Finnegans. El mes (default: el anterior, que es el que se declara) y la
 * opción de la CVLP se eligen una vez y valen para las tres vistas.
 *
 * CVLP (060, la cuenta de venta y líquido producto): Casilda Combustibles
 * (Logística Integral) cobra fletes de camiones de CADINC por cuenta y orden y
 * le liquida con su comisión ya descontada. Según el Anexo VII del LID, CADINC
 * es el VENDEDOR y la registra en Ventas (modalidad general: subtotal neto, IVA
 * y total del papel; la comisión descontada no va a ningún libro). Verificado
 * con la 0010-00000254 el 24/09 y sin facturas de CADINC a Casilda que la
 * dupliquen: va incluida por defecto; el tilde queda para verlo sin ellas.
 */

type Vista = 'posicion' | 'ventas' | 'compras'
const VISTAS: { key: Vista; label: string }[] = [
  { key: 'posicion', label: 'Posición de IVA' },
  { key: 'ventas',   label: 'Libro IVA ventas' },
  { key: 'compras',  label: 'Libro IVA compras' },
]

function mesAnterior(): string {
  const h = new Date()
  const d = new Date(h.getFullYear(), h.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ImpuestosTab() {
  const { puedeVer } = usePermisos('facturacion')
  const meses = useMemo(() => mesesRecientes(new Date()), [])
  const [periodo, setPeriodo] = useState(mesAnterior)
  const [incluirCvlp, setIncluirCvlp] = useState(true)
  const [vista, setVista] = useState<Vista>('posicion')

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">No tenés permiso para ver los impuestos.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Período</label>
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white capitalize">
            {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
          </select>
        </div>
        {vista !== 'compras' && (
          <label className="flex items-center gap-2 text-sm py-2 cursor-pointer"
            title="Cuentas de venta y líquido producto (060) de Casilda: fletes cobrados por cuenta de CADINC con la comisión descontada. Según el Anexo VII del Libro IVA Digital, CADINC (vendedor) las registra en Ventas con el neto, el IVA y el total del papel.">
            <input type="checkbox" checked={incluirCvlp} onChange={e => setIncluirCvlp(e.target.checked)} className="accent-naranja w-4 h-4" />
            Incluir CVLP (060)
          </label>
        )}
        <div className="flex gap-2 flex-wrap sm:ml-auto">
          {VISTAS.map(v => (
            <button key={v.key} type="button" onClick={() => setVista(v.key)}
              className={`text-xs px-3 py-1.5 rounded border font-semibold transition ${vista === v.key
                ? 'border-naranja bg-naranja-light text-naranja-dark' : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'posicion' && <PosicionIva periodo={periodo} incluirCvlp={incluirCvlp} onVer={setVista} />}
      {vista === 'ventas'   && <LibroIvaVentas periodo={periodo} incluirCvlp={incluirCvlp} />}
      {vista === 'compras'  && <LibroIvaCompras periodo={periodo} />}
    </div>
  )
}
