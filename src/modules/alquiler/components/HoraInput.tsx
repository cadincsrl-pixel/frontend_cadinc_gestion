'use client'

// Input de hora en formato 24 hs con auto-formato, para reemplazar a los
// <input type="time"> nativos (cuyo formato AM/PM vs 24 hs lo decide el
// navegador y no se puede forzar). Tecleás dígitos y el ":" se inserta solo:
// "1330" → "13:30", "830" → "8:30" (al salir del campo se normaliza "08:30").
// Mantiene el contrato value/onChange con strings "HH:MM" (o '' vacío),
// compatible con timeToMinutes/calcularHorasParte.

import { useState } from 'react'

interface Props {
  label:     string
  value:     string
  onChange:  (v: string) => void
  disabled?: boolean
}

// Inserta el ":" según la cantidad de dígitos tipeados.
function formatear(raw: string): string {
  const d = raw.replace(/[^\d]/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, -2)}:${d.slice(-2)}`
}

// Al salir del campo: completar. "9" → "09:00", "930" → "09:30".
// Devuelve null si la hora es inválida (> 23:59) para que el caller la marque
// como error en vez de borrarla en silencio (antes el operario perdía el dato
// sin enterarse y el parte se guardaba con menos horas → menos importe).
function normalizar(v: string): string | null {
  const d = v.replace(/[^\d]/g, '')
  if (d.length === 0) return ''
  let h: number, m: number
  if (d.length <= 2)      { h = Number(d); m = 0 }
  else                    { h = Number(d.slice(0, -2)); m = Number(d.slice(-2)) }
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function HoraInput({ label, value, onChange, disabled }: Props) {
  const [error, setError] = useState(false)

  function handleChange(raw: string) {
    if (error) setError(false)   // al re-tipear se limpia el error
    onChange(formatear(raw))
  }

  function handleBlur() {
    if (value === '') { setError(false); return }
    const norm = normalizar(value)
    if (norm === null) {
      // Hora inválida: conservar lo tipeado y marcar en rojo para que el
      // usuario corrija (no la borramos silenciosamente).
      setError(true)
    } else {
      setError(false)
      if (norm !== value) onChange(norm)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="hh:mm"
        maxLength={5}
        value={value}
        disabled={disabled}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        aria-invalid={error}
        className={`
          w-full px-3 py-2 border-[1.5px] rounded-lg
          font-mono text-sm text-carbon bg-blanco text-center
          outline-none transition-colors
          focus:border-naranja
          disabled:opacity-60 disabled:cursor-not-allowed
          placeholder:font-sans placeholder:text-gris-mid
          ${error ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}
        `}
        title={error ? 'Hora inválida (00:00 a 23:59)' : undefined}
      />
    </div>
  )
}
