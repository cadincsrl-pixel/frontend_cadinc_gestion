'use client'

import { useState, useRef, useEffect } from 'react'
import { matchesSearch, normalizeText } from '@/lib/utils/text'

interface ComboboxOption {
  value: string
  label: string
  sub?:  string
  /**
   * Si se define en al menos una option, el dropdown agrupa visualmente
   * los items bajo un header con el nombre del grupo. Backward-compatible:
   * sin `group` el render es igual al legacy.
   */
  group?: string
}

interface ComboboxProps {
  label?:       string
  placeholder?: string
  options:      ComboboxOption[]
  value:        string
  onChange:     (value: string) => void
  disabled?:    boolean
  className?:   string
  /**
   * Si está definido, habilita "creatable mode": cuando el usuario
   * tipea un valor que no coincide exactamente con ningún label, se
   * muestra una opción extra "＋ Crear: 'XXX'". Al elegirla, se
   * llama `onCreate(texto)` en lugar de `onChange`.
   */
  onCreate?:    (query: string) => void | Promise<void>
  /** Texto del item de creación. Default: "Crear". */
  createLabel?: string
  /**
   * Si true, cuando el `value` actual no matchea ningún `option.value`,
   * el input muestra el `value` literal (modo texto libre). Útil cuando
   * el value es texto humano editable (ej. nombre de material) en vez
   * de un ID opaco. Default: false (mantiene comportamiento legacy).
   */
  freeText?:    boolean
}

// Altura aproximada del dropdown (max-h-52 = 13rem ≈ 208px). Se usa para
// decidir si abrir hacia arriba o hacia abajo.
const DROPDOWN_HEIGHT = 208

function OptionButton({ o, selected, onSelect }: {
  o: ComboboxOption
  selected: boolean
  onSelect: (v: string) => void
}) {
  return (
    <button
      onMouseDown={() => onSelect(o.value)}
      className={`
        w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-gris last:border-0
        hover:bg-naranja-light hover:text-naranja-dark
        ${selected ? 'bg-azul-light text-azul font-bold' : 'text-carbon'}
      `}
    >
      <div className="font-semibold">{o.label}</div>
      {o.sub && <div className="text-[11px] text-gris-dark mt-0.5">{o.sub}</div>}
    </button>
  )
}

function renderOptions(filtered: ComboboxOption[], value: string, onSelect: (v: string) => void) {
  const anyGrouped = filtered.some(o => o.group)
  if (!anyGrouped) {
    return filtered.map(o => (
      <OptionButton key={o.value} o={o} selected={o.value === value} onSelect={onSelect} />
    ))
  }
  // Agrupar manteniendo el orden de primera aparición de cada grupo.
  const groups: { name: string; items: ComboboxOption[] }[] = []
  for (const o of filtered) {
    const name = o.group ?? 'Otros'
    let g = groups.find(x => x.name === name)
    if (!g) { g = { name, items: [] }; groups.push(g) }
    g.items.push(o)
  }
  return groups.map(g => (
    <div key={g.name}>
      <div className="px-4 py-1 text-[10px] font-bold text-gris-dark uppercase tracking-wider bg-gris/60 border-b border-gris-mid sticky top-0">
        {g.name}
      </div>
      {g.items.map(o => (
        <OptionButton key={o.value} o={o} selected={o.value === value} onSelect={onSelect} />
      ))}
    </div>
  ))
}

export function Combobox({
  label, placeholder = 'Buscar...', options, value, onChange, disabled, className = '',
  onCreate, createLabel = 'Crear', freeText = false,
}: ComboboxProps) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLInputElement>(null)

  // Texto visible: si hay valor seleccionado, mostrar su label.
  // En modo freeText, si el value no matchea ningún option, igual lo
  // mostramos como label (para que el usuario vea lo que tipeó libre).
  const selected = options.find(o => o.value === value)
    ?? (freeText && value ? { value, label: value } : undefined)

  // Búsqueda tolerante a acentos y al orden de los términos: cada palabra del
  // query debe aparecer en label o sub (ver matchesSearch). Concatenamos
  // label + sub para que un token pueda matchear en cualquiera de los dos.
  const filtered = query.trim()
    ? options.filter(o => matchesSearch(`${o.label} ${o.sub ?? ''}`, query))
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

  // Decidir si abrir el dropdown hacia arriba: si el espacio debajo del
  // trigger no alcanza para mostrarlo y arriba hay más espacio.
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    setFlipUp(spaceBelow < DROPDOWN_HEIGHT && spaceAbove > spaceBelow)
  }, [open])

  function handleSelect(val: string) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  async function handleCreate() {
    if (!onCreate) return
    const q = query.trim()
    if (!q) return
    await onCreate(q)
    setOpen(false)
    setQuery('')
  }

  // Mostramos la opción de "crear" cuando hay query no vacío y ningún label
  // matchea exacto (case-insensitive). Así un usuario que tipea "Bosch" y
  // ya existe "Bosch" en la lista no ve la opción duplicada.
  const queryTrim = query.trim()
  const exactMatch = queryTrim
    ? options.some(o => normalizeText(o.label) === normalizeText(queryTrim))
    : false
  const showCreate = !!onCreate && !!queryTrim && !exactMatch

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
          ref={triggerRef}
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); setQuery('') }}
          placeholder={placeholder}
          // Es un buscador, no un campo de formulario real: cortamos el autofill
          // del navegador y de los gestores de contraseñas (1Password/LastPass),
          // que ofrecían rellenarlo "como si fuera usuario/contraseña".
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          name="search"
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
        <div className={`absolute left-0 right-0 z-50 bg-white border border-gris-mid rounded-xl shadow-card-lg max-h-52 overflow-y-auto ${flipUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {filtered.length === 0 && !showCreate ? (
            <div className="px-4 py-3 text-sm text-gris-dark text-center">
              Sin resultados
            </div>
          ) : (
            <>
              {renderOptions(filtered, value, handleSelect)}
              {showCreate && (
                <button
                  onMouseDown={handleCreate}
                  className="w-full text-left px-4 py-2.5 text-sm transition-colors border-t border-gris-mid bg-naranja-light/30 hover:bg-naranja text-naranja-dark hover:text-white font-bold"
                >
                  ＋ {createLabel}: <span className="font-mono">&ldquo;{queryTrim}&rdquo;</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
