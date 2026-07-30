'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

// ⓘ que abre un globito con la definición de un número: qué suma, qué no suma,
// cómo trata el IVA y una advertencia opcional. Nace para Gastos > Reportes
// (2026-07-30): el dueño no podía saber si los márgenes eran con o sin IVA ni
// qué incluía cada KPI.
//
// Estructura fija de 4 renglones a propósito: si cada popover tiene un formato
// distinto, dejan de leerse. `incluye`/`noIncluye` cortos — el detalle fino va
// en la documentación, no acá.
//
// Sin portal, igual que Modal: se posiciona absolute contra el padre relative.
// El botón para el click del contenedor (los KPI están dentro de cards que a
// veces tienen onClick).

interface InfoPopoverProps {
  titulo:    string
  incluye:   string[]
  noIncluye?: string[]
  iva?:      string | null
  ojo?:      string | null
  /** Contenido extra libre (ej: desglose con montos). Va al final. */
  extra?:    ReactNode
}

export function InfoPopover({ titulo, incluye, noIncluye = [], iva, ojo, extra }: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar con click afuera o Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Qué incluye ${titulo}`}
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none transition-colors ${
          open ? 'bg-azul text-white' : 'bg-gris-mid/40 text-gris-dark hover:bg-azul hover:text-white'
        }`}
      >
        i
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 top-6 left-1/2 -translate-x-1/2 w-72 max-w-[85vw] bg-white rounded-card shadow-lg border border-gris-mid p-3 text-left cursor-default"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-xs font-bold text-carbon mb-2">{titulo}</div>

          <div className="flex flex-col gap-2 text-[11px] leading-snug">
            <div>
              <div className="font-bold text-verde uppercase tracking-wide text-[9px] mb-0.5">Qué suma</div>
              <ul className="list-disc pl-4 text-gris-dark flex flex-col gap-0.5">
                {incluye.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>

            {noIncluye.length > 0 && (
              <div>
                <div className="font-bold text-rojo uppercase tracking-wide text-[9px] mb-0.5">Qué no suma</div>
                <ul className="list-disc pl-4 text-gris-dark flex flex-col gap-0.5">
                  {noIncluye.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}

            {iva && (
              <div>
                <div className="font-bold text-azul uppercase tracking-wide text-[9px] mb-0.5">IVA</div>
                <p className="text-gris-dark">{iva}</p>
              </div>
            )}

            {ojo && (
              <div className="bg-amarillo-light/60 rounded-lg px-2 py-1.5 text-[11px] text-carbon">
                ⚠ {ojo}
              </div>
            )}

            {extra}
          </div>
        </div>
      )}
    </div>
  )
}
