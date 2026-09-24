'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'

/**
 * Contraseña + confirmación, con ojito para verla, «Generar» y «Copiar».
 * Lo usan el alta de usuario y el cambio de contraseña. El backend exige
 * 6 caracteres (`usuarios.routes.ts`); acá se repite para no mandar un
 * formulario que va a rebotar.
 */

export const CLAVE_MINIMO = 6

/** null = la contraseña sirve. Si no, qué le falta, para mostrarlo. */
export function problemaDeClave(clave: string, confirmacion: string): string | null {
  if (clave.length < CLAVE_MINIMO) return `La contraseña tiene que tener al menos ${CLAVE_MINIMO} caracteres.`
  if (clave !== confirmacion) return 'Las dos contraseñas no coinciden.'
  return null
}

// Sin letras que se confunden al dictarla o leerla (0/O, 1/l/I).
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generarClave(largo = 10): string {
  const bytes = new Uint32Array(largo)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALFABETO[b % ALFABETO.length]).join('')
}

export function CamposClave({
  clave, confirmacion, onClave, onConfirmacion, labelClave = 'Contraseña',
}: {
  clave:          string
  confirmacion:   string
  onClave:        (v: string) => void
  onConfirmacion: (v: string) => void
  labelClave?:    string
}) {
  const [ver, setVer]         = useState(false)
  const [copiada, setCopiada] = useState(false)

  const largoOk   = clave.length >= CLAVE_MINIMO
  const coincide  = confirmacion.length > 0 && clave === confirmacion
  const errorConf = confirmacion.length > 0 && clave !== confirmacion ? 'No coincide con la contraseña.' : undefined

  function generar() {
    const nueva = generarClave()
    onClave(nueva)
    onConfirmacion(nueva)
    setVer(true)          // una generada hay que poder leerla para pasársela al usuario
    setCopiada(false)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave)
      setCopiada(true)
    } catch {
      setCopiada(false)
    }
  }

  const ojo = (
    <button
      type="button"
      onClick={() => setVer(v => !v)}
      aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      title={ver ? 'Ocultar' : 'Mostrar'}
      className="absolute right-2 top-[26px] h-9 w-9 flex items-center justify-center rounded hover:bg-gris transition-colors text-base"
    >
      {ver ? '🙈' : '👁'}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Input
            label={labelClave}
            type={ver ? 'text' : 'password'}
            placeholder={`Mínimo ${CLAVE_MINIMO} caracteres`}
            value={clave}
            onChange={e => { onClave(e.target.value); setCopiada(false) }}
            className="pr-10 font-mono"
            autoComplete="new-password"
          />
          {ojo}
        </div>
        <div className="relative">
          <Input
            label="Repetir contraseña"
            type={ver ? 'text' : 'password'}
            placeholder="La misma de nuevo"
            value={confirmacion}
            onChange={e => onConfirmacion(e.target.value)}
            error={errorConf}
            className="pr-10 font-mono"
            autoComplete="new-password"
          />
          {ojo}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ul className="flex gap-4 text-xs">
          <li className={largoOk ? 'text-verde font-semibold' : 'text-gris-dark'}>
            {largoOk ? '✓' : '○'} Al menos {CLAVE_MINIMO} caracteres
          </li>
          <li className={coincide ? 'text-verde font-semibold' : 'text-gris-dark'}>
            {coincide ? '✓' : '○'} Las dos coinciden
          </li>
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={generar}
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gris-mid hover:bg-gris transition-colors"
            title="Arma una contraseña de 10 caracteres y la completa en los dos campos">
            🎲 Generar
          </button>
          <button type="button" onClick={copiar} disabled={!clave}
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gris-mid hover:bg-gris transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Copiar la contraseña para pasársela al usuario">
            {copiada ? '✓ Copiada' : '📋 Copiar'}
          </button>
        </div>
      </div>
    </div>
  )
}
