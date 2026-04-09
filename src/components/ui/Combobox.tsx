'use client'

import { useState, useRef, useEffect } from 'react'

interface ComboboxProps {
  label?:       string
  placeholder?: string
  options:      { value: string; label: string; sub?: string }[]
  value:        string
  onChange:     (value: string) => void
  disabled?:    boolean
  className?:   string
}

export function Combobox({
  label, placeholder = 'Buscar...', options, value, onChange, disabled, className = '',
}: ComboboxProps) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Texto visible: si hay valor seleccionado, mostrar su label
  const selected = options.find(o => o.value === value)

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sub ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Cerrar al clickear fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(val: string) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange('')
  }

  return (
    <div ref={ref} className={`flex flex-col gap-1 relative ${className}`}>
      {label && (
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); setQuery('') }}
          placeholder={placeholder}
          className={`
            w-full pl-9 pr-3 py-2 border-[1.5px] rounded-lg text-sm outline-none transition-colors
            placeholder:text-gris-mid
            ${open ? 'border-naranja bg-white' : 'border-gris-mid'}
            ${disabled ? 'opacity-50 cursor-not-allowed bg-gris' : 'bg-white cursor-text'}
            ${selected && !open ? 'font-semibold text-carbon' : 'text-carbon'}
          `}
        />
        {selected && !open && (
          <button
            onClick={() => { onChange(''); setQuery('') }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gris-mid hover:text-carbon text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gris-mid rounded-xl shadow-card-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gris-dark text-center">
              Sin resultados
            </div>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                onMouseDown={() => handleSelect(o.value)}
                className={`
                  w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-gris last:border-0
                  hover:bg-naranja-light hover:text-naranja-dark
                  ${o.value === value ? 'bg-azul-light text-azul font-bold' : 'text-carbon'}
                `}
              >
                <div className="font-semibold">{o.label}</div>
                {o.sub && <div className="text-[11px] text-gris-dark mt-0.5">{o.sub}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
