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
 * CVLP (060, la cuenta de venta y líquido producto que emite CASILDA por
 * cuenta de CADINC): el Anexo VII del LID dice que el comitente la registra en
 * Ventas, pero queda apagada hasta que el contador confirme cómo la carga.
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
  const [incluirCvlp, setIncluirCvlp] = useState(false)
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
            title="Cuenta de venta y líquido producto (tipo 060) que emite el comisionista por cuenta de CADINC. Según el Anexo VII del Libro IVA Digital, el comitente la registra en Ventas; confirmalo con el contador antes de incluirla.">
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
