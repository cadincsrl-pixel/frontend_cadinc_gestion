'use client'

import { useEffect, useRef, useState } from 'react'
import { OptionButton, clickElige } from '@/components/ui/Combobox'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { CtbAuxiliarTipo } from '@/types/contabilidad.types'
import { useAuxiliares } from '../hooks/useContabilidad'

type TipoAux = Exclude<CtbAuxiliarTipo, 'none'>

const PLACEHOLDER: Record<TipoAux, string> = {
  cliente:   'Buscar cliente…',
  proveedor: 'Buscar proveedor…',
  tesoreria: 'Buscar cuenta…',
}

/**
 * Cliente, proveedor o cuenta de tesorería de una línea (según el `auxiliar`
 * de la cuenta). Busca en el SERVER a medida que se tipea: el padrón de
 * clientes y proveedores puede ser grande y el backend devuelve hasta 30 por
 * búsqueda, así que un Combobox con la lista entera en memoria no alcanza.
 *
 * Reusa `OptionButton` y `clickElige` del Combobox (se elige con click
 * completo sobre la misma fila, no con mousedown: ver Combobox.tsx).
 */
export function SelectorAuxiliar({ tipo, value, nombre, onChange, disabled, error }: {
  tipo:      TipoAux
  /** id como string; '' = ninguno. */
  value:     string
  /** Nombre del elegido (viene del asiento o de la última elección). */
  nombre:    string
  onChange:  (id: string, nombre: string) => void
  disabled?: boolean
  error?:    string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query, 300)
  const ref = useRef<HTMLDivElement>(null)
  const apretada = useRef<string | null>(null)
  const { data, isFetching, isError } = useAuxiliares(open ? tipo : null, q)

  // Sin nombre (p. ej. un asiento viejo), se resuelve por id.
  const porId = useAuxiliares(value && !nombre ? tipo : null, '', value ? [Number(value)] : undefined)
  const nombreVisible = nombre || porId.data?.find(a => String(a.id) === value)?.nombre || (value ? `#${value}` : '')

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const opciones = (data ?? []).map(a => ({
    value: String(a.id),
    label: a.nombre,
    sub:   [a.doc, a.activo ? null : 'dado de baja'].filter(Boolean).join(' · ') || undefined,
  }))

  function elegir(v: string, teclado: boolean) {
    const ok = clickElige(apretada.current, v, teclado)
    apretada.current = null
    if (!ok) return
    const o = opciones.find(x => x.value === v)
    onChange(v, o?.label ?? '')
    setOpen(false)
    setQuery('')
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={open ? query : nombreVisible}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (!open) { setOpen(true); setQuery('') } }}
          placeholder={PLACEHOLDER[tipo]}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className={`w-full pl-2.5 pr-7 py-2 border-[1.5px] rounded-lg text-sm outline-none bg-white
            ${error ? 'border-rojo bg-rojo-light' : open ? 'border-naranja' : 'border-gris-mid'}
            ${disabled ? 'opacity-50 cursor-not-allowed bg-gris' : ''}`}
        />
        {value && !open && !disabled && (
          <button type="button" onClick={() => onChange('', '')} aria-label="Quitar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-mid hover:text-carbon text-xs">✕</button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gris-mid rounded-xl shadow-card-lg max-h-52 overflow-y-auto min-w-[220px]">
          {isError ? (
            <div className="px-4 py-3 text-sm text-rojo text-center">No se pudo buscar</div>
          ) : opciones.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gris-dark text-center">{isFetching ? 'Buscando…' : 'Sin resultados'}</div>
          ) : (
            opciones.map(o => (
              <OptionButton key={o.value} o={o} selected={o.value === value}
                onSelect={elegir} onPress={v => { apretada.current = v }} />
            ))
          )}
        </div>
      )}
      {error && <span className="text-xs text-rojo font-semibold">{error}</span>}
    </div>
  )
}
