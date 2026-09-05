'use client'

import type { ReactNode } from 'react'

/**
 * Piezas compartidas de las barras de filtros del pañol (Salidas a obra y
 * Retorno de obra): el buscador con su ✕, el chip de filtro activo y la clase
 * de los <select> compactos. Mismo alto (py-2) que el Combobox de obra.
 */

export function Buscador({ value, onChange, placeholder, className = '', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
      <input
        type="search" value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onChange('') }}
        placeholder={placeholder} autoFocus={autoFocus}
        autoComplete="off" data-1p-ignore data-lpignore="true"
        className="w-full pl-9 pr-8 py-2 text-sm border-[1.5px] border-gris-mid rounded-lg bg-blanco text-carbon placeholder:text-gris-mid outline-none transition-colors focus:border-naranja focus:bg-white [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Borrar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[11px] text-gris-dark hover:bg-gris hover:text-carbon">✕</button>
      )}
    </div>
  )
}

export function FiltroChip({ children, onQuitar }: { children: ReactNode; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-azul-light text-azul font-bold">
      {children}
      <button type="button" onClick={onQuitar} aria-label="Quitar filtro" className="w-4 h-4 rounded-full text-[10px] leading-none hover:bg-azul hover:text-white transition-colors">✕</button>
    </span>
  )
}

/** <select> de la barra: se marca en azul cuando tiene algo elegido. */
export function selectCls(activo: boolean): string {
  return `px-2.5 py-2 text-sm border-[1.5px] rounded-lg bg-blanco outline-none focus:border-naranja cursor-pointer ${activo ? 'border-azul text-azul font-bold' : 'border-gris-mid text-carbon'}`
}

/** <input type="date"> de la barra, con su etiqueta a la izquierda. */
export function FechaFiltro({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border-[1.5px] rounded-lg bg-blanco ${value ? 'border-azul text-azul font-bold' : 'border-gris-mid text-gris-dark'}`}>
      {label}
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="bg-transparent text-sm text-carbon outline-none font-normal" />
    </label>
  )
}

/** Botón chico de acción en filas y barras (confirmar, volvió, etc.). */
export const btnMini = 'text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
