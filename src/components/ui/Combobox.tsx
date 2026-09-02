'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { matchesSearch, normalizeText, searchScore } from '@/lib/utils/text'

export interface ComboboxOption {
  value: string
  label: string
  sub?:  string
  /**
   * Si se define en al menos una option, el dropdown agrupa visualmente
   * los items bajo un header con el nombre del grupo. Backward-compatible:
   * sin `group` el render es igual al legacy.
   */
  group?: string
  /**
   * Texto extra que entra al buscador pero NO se muestra en el dropdown.
   * Sirve para sinónimos / nombres alternativos: la obra pide "lija 150"
   * y el catálogo guarda "Lija al agua N°150". Poniendo los alias acá el
   * match funciona sin ensuciar la UI. Opcional: sin `search` el filtro
   * es igual al legacy (label + sub).
   *
   * Pasarlo como **array** cuando son sinónimos discretos: además del
   * filtro difuso, habilita el match exacto por alias que usa `exactMatch`
   * para no ofrecer "crear" algo que ya existe bajo otro nombre. Como
   * string unido el filtro anda igual, pero el match exacto no puede
   * separar los términos ("chapa acanalada" no es una palabra suelta).
   */
  search?: string | string[]
}

/** Todo el texto contra el que se busca una option: label + sub + sinónimos. */
function textoBuscable(o: ComboboxOption): string {
  return `${o.label} ${o.sub ?? ''} ${searchTerms(o).join(' ')}`
}

/** Los términos de búsqueda de una option, siempre como array. */
function searchTerms(o: ComboboxOption): string[] {
  if (!o.search) return []
  return Array.isArray(o.search) ? o.search : [o.search]
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
  // query debe aparecer en label, sub o search (ver matchesSearch).
  // Concatenamos los tres para que un token pueda matchear en cualquiera.
  // `search` es invisible: lleva los sinónimos (ver ComboboxOption.search).
  // Coincidencia exacta: TODOS los tokens del query tienen que aparecer.
  const exactas = query.trim()
    ? options.filter(o => matchesSearch(textoBuscable(o), query))
    : options

  // Segundo intento. Si la exacta no trajo nada, en vez de dejar la lista
  // vacía (que es lo que empuja al usuario al texto libre) mostramos las que
  // matchean PARTE del query, ordenadas por cuánto matchean.
  //
  // El caso que motivó esto: en el pedido de Hipódromo del 2026-09-02 alguien
  // escribió "arena m3" y "puerta placa oblak 0.80x2.05". Los dos materiales
  // estaban en el catálogo, pero como agregaron la unidad y la marca —dos
  // cosas que el catálogo no guarda— la lista quedó vacía y terminaron en
  // texto libre. Con esto "arena m3" puntúa 0.5 y la fila aparece.
  //
  // El umbral de 0.4 y el tope de 8 son para no devolver ruido: con un query
  // de una sola palabra el score es 0 o 1, así que esto solo entra a jugar
  // cuando el usuario escribió varias.
  const parciales = useMemo(() => {
    if (!query.trim() || exactas.length > 0) return []
    return options
      .map(o => ({ o, score: searchScore(textoBuscable(o), query) }))
      .filter(x => x.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.o)
  }, [options, query, exactas.length])

  const filtered = exactas.length > 0 ? exactas : parciales
  const mostrandoParciales = exactas.length === 0 && parciales.length > 0

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
  //
  // Mira `label` Y los alias de `search` (cuando vienen como array). Sin
  // esto, tipear "ceresita" ofrecía "＋ Crear: ceresita" aunque el material
  // ya exista como "Hidrófugo x 5lts" con ese sinónimo — o sea, la UI
  // invitaba a crear justo el duplicado que el candado del backend intenta
  // evitar. Un alias que apunta a varios materiales (las 4 largos de chapa
  // acanalada) igual cuenta como "ya existe": lo que falta ahí es que el
  // usuario elija el tamaño, no dar de alta otra fila.
  const queryTrim = query.trim()
  const queryNorm = normalizeText(queryTrim)
  const exactMatch = queryTrim
    ? options.some(o =>
        normalizeText(o.label) === queryNorm ||
        searchTerms(o).some(t => normalizeText(t) === queryNorm))
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
              {/* Aviso obligatorio: si no decimos que son parciales, el usuario
                  cree que el catálogo le está ofreciendo lo que pidió y elige
                  una medida o un modelo que no es. Peor que la lista vacía. */}
              {mostrandoParciales && (
                <div className="px-4 py-2 text-[11px] text-gris-dark bg-gris/60 border-b border-gris-mid sticky top-0">
                  Nada coincide exacto. Lo más parecido:
                </div>
              )}
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
