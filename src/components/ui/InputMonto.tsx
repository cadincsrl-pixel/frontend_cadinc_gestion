'use client'

/**
 * Input de dinero con separador de miles en vivo (es-AR): "1234567" se ve
 * "1.234.567" a medida que se tipea, y la coma es el separador decimal
 * ("1.234,56"). El PUNTO TAMBIÉN separa decimales: es el que está en el
 * teclado numérico, así que "24994.52" y "24994,52" son lo mismo. Cuando el
 * punto es de miles ("1.234.567,89" pegado de es-AR) se descarta — la regla
 * completa está en `normalizarDecimal`.
 *
 * El valor que viaja al form es SIEMPRE formato máquina ("1234567.89"):
 * `Number(data.campo)` sigue funcionando en todos los submits existentes.
 *
 * Uso con react-hook-form (Controller — register no alcanza porque el
 * display formateado no es el valor):
 *
 *   <Controller
 *     name="monto"
 *     control={form.control}
 *     render={({ field }) => (
 *       <InputMonto label="Monto ($)" value={field.value} onChange={field.onChange} />
 *     )}
 *   />
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface InputMontoProps {
  label?:       string
  error?:       string
  hint?:        string
  placeholder?: string
  disabled?:    boolean
  /** Para los editores en línea, que se abren ya enfocados. */
  autoFocus?:   boolean
  className?:   string
  /** Decimales permitidos (con coma). Default 2; 0 = solo enteros. */
  decimales?:   number
  /** Valor en formato máquina ("1234567.89") — string, number o vacío. */
  value:        string | number | null | undefined
  /** Recibe el valor nuevo en formato máquina ("1234567.89" | ""). */
  onChange:     (raw: string) => void
  onBlur?:      () => void
  onKeyDown?:   (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/**
 * El punto del teclado numérico también separa decimales (2026-09-21).
 *
 * Pedido del dueño: «en el teclado numérico tenemos el punto, que se ponga
 * punto o coma indistintamente». Y había una incoherencia que lo hacía peor:
 * el modal de comprar exigía coma y el de cargar el precio de un enviado
 * exigía punto, en el mismo módulo.
 *
 * El punto es ambiguo en es-AR, así que se decide por la FORMA, no por gusto:
 *
 *   hay una coma             → la coma manda, los puntos son miles ("1.234,56")
 *   un punto, 3 dígitos
 *     detrás y algo adelante → miles, como se pega de es-AR ("1.234")
 *   un punto, cualquier otra
 *     cantidad detrás        → DECIMAL ("24994.52", "1.5", "1000.", "0.75")
 *   dos o más puntos         → miles ("1.234.567")
 *
 * El caso feo sería "1.234" queriendo decir un peso con 234 milésimas, pero
 * los montos llevan dos decimales: no existe.
 */
export function normalizarDecimal(texto: string): string {
  if (texto.includes(',')) return texto
  const puntos = (texto.match(/\./g) ?? []).length
  if (puntos !== 1) return texto
  const i = texto.indexOf('.')
  const detras   = texto.slice(i + 1).replace(/\D/g, '')
  const adelante = texto.slice(0, i).replace(/\D/g, '')
  if (detras.length === 3 && adelante.length > 0) return texto   // "1.234" son mil doscientos treinta y cuatro
  return texto.slice(0, i) + ',' + texto.slice(i + 1)
}

/** "1.234,56" o "1234.56" (lo que sea que tipearon) → "1234.56" formato máquina. */
export function aRaw(textoCrudo: string, decimales: number): string {
  const texto = decimales > 0 ? normalizarDecimal(textoCrudo) : textoCrudo
  // Los puntos que quedan son miles (se descartan); la coma es el decimal.
  const limpio = texto.replace(/\./g, '')
  const [ent, ...resto] = limpio.split(',')
  const dig = (ent ?? '').replace(/\D/g, '')
  if (decimales <= 0 || resto.length === 0) return dig
  const dec = resto.join('').replace(/\D/g, '').slice(0, decimales)
  if (dec === '') return dig   // coma colgando: raw sin decimal
  return `${dig || '0'}.${dec}`
}

/** Formato máquina/number → display es-AR ("1234567.8" → "1.234.567,8"). */
export function aDisplay(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const s = String(value)
  const [ent = '', dec] = s.split('.')
  const digEnt = ent.replace(/\D/g, '')
  const entFmt = digEnt.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dec !== undefined && dec !== '' ? `${entFmt},${dec}` : entFmt
}

/** Reformatea lo tipeado conservando una coma colgante ("1234," → "1.234,"). */
export function reformatear(textoCrudo: string, decimales: number): string {
  // La normalización va primero: si tipearon "1234." ese punto ya es la coma
  // colgante, y sin esto el separador desaparecía apenas se escribía.
  const texto = decimales > 0 ? normalizarDecimal(textoCrudo) : textoCrudo
  const raw = aRaw(texto, decimales)
  const base = aDisplay(raw)
  const comaColgante = decimales > 0 && /,\D*$/.test(texto) && !raw.includes('.')
  return comaColgante && base !== '' ? `${base},` : base
}

export function InputMonto({
  label, error, hint, placeholder, disabled, autoFocus, className = '',
  decimales = 2, value, onChange, onBlur, onKeyDown,
}: InputMontoProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Cuántos dígitos quedan a la DERECHA del cursor: es la métrica estable
  // ante el reformateo (los puntos de miles aparecen/desaparecen a la
  // izquierda). null = no hay reposición pendiente.
  const caretDesdeDerecha = useRef<number | null>(null)
  const [display, setDisplay] = useState(() => aDisplay(value))

  // Sync externo (reset del form, edición): solo si el valor de afuera no
  // coincide con lo que ya representa el display (evita pisar "1.234," → 1234).
  useEffect(() => {
    const rawExterno = aRaw(aDisplay(value), decimales)
    if (aRaw(display, decimales) !== rawExterno) setDisplay(aDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useLayoutEffect(() => {
    const el = inputRef.current
    const desde = caretDesdeDerecha.current
    if (!el || desde === null) return
    caretDesdeDerecha.current = null
    // Posición tal que a la derecha queden `desde` caracteres significativos
    // (dígitos y coma; los puntos de miles no cuentan).
    let restantes = desde
    let pos = el.value.length
    while (pos > 0 && restantes > 0) {
      pos--
      if (/[\d,]/.test(el.value[pos]!)) restantes--
    }
    el.setSelectionRange(pos, pos)
  }, [display])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const texto = e.target.value
    const caret = e.target.selectionStart ?? texto.length
    caretDesdeDerecha.current = (texto.slice(caret).match(/[\d,]/g) ?? []).length
    setDisplay(reformatear(texto, decimales))
    onChange(aRaw(texto, decimales))
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode={decimales > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`
          w-full px-3 py-2 border-[1.5px] rounded-lg
          font-sans text-sm text-carbon bg-blanco
          outline-none transition-colors
          placeholder:text-gris-mid
          focus:border-naranja focus:bg-white
          disabled:opacity-60 disabled:cursor-not-allowed
          ${error ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}
          ${className}
        `}
      />
      {error && <span className="text-xs text-rojo font-semibold">{error}</span>}
      {hint && !error && <span className="text-xs text-gris-dark">{hint}</span>}
    </div>
  )
}
