'use client'

import { useMemo } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { useJurisdicciones } from '@/hooks/useJurisdicciones'
import { PREFIJO_SIN_NORMALIZAR, opcionesJurisdiccion } from '@/lib/utils/jurisdicciones'
import type { JurisdiccionElegida } from '@/types/config.types'

interface Props {
  /** `{ id: null, nombre: '' }` = sin jurisdicción; `{ id: null, nombre: 'x' }` = texto viejo sin resolver. */
  value:           JurisdiccionElegida
  onChange:        (v: JurisdiccionElegida) => void
  label?:          string
  placeholder?:    string
  disabled?:       boolean
  className?:      string
  /** Clases del input de texto que se usa si el backend todavía no tiene el catálogo. */
  inputClassName?: string
}

/**
 * Selector de jurisdicción (20260929f), compartido por Compras (tributos de la
 * factura) y Ventas (retenciones). Busca por nombre y alias; provincias
 * primero y los municipios agrupados por provincia. Un texto viejo que no
 * resolvió a ninguna se muestra con «⚠ … (a normalizar)» hasta que se elija
 * una del catálogo. Contra un backend sin catálogo (404) es el campo de texto
 * de siempre.
 */
export function JurisdiccionSelect({ value, onChange, label, placeholder, disabled, className, inputClassName }: Props) {
  const { jurisdicciones, respaldo, isLoading } = useJurisdicciones()
  const opciones = useMemo(() => opcionesJurisdiccion(jurisdicciones, value.id), [jurisdicciones, value.id])

  if (respaldo) {
    return (
      <div className={`flex flex-col gap-1 ${className ?? ''}`}>
        {label && <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{label}</label>}
        <input value={value.nombre} disabled={disabled} placeholder={placeholder}
          className={inputClassName ?? 'w-full border border-gris-mid rounded-lg px-3 py-2 text-sm'}
          onChange={e => onChange({ id: null, nombre: e.target.value })} />
      </div>
    )
  }

  const enCatalogo = value.id != null && opciones.some(o => o.value === String(value.id))
  const nombre = value.nombre.trim()
  // Con freeText el Combobox muestra el valor literal cuando no es una opción:
  // un texto sin resolver, o el nombre mientras se carga el catálogo.
  const valor = enCatalogo ? String(value.id)
    : nombre ? (value.id == null && !isLoading ? `${PREFIJO_SIN_NORMALIZAR}${nombre} (a normalizar)` : nombre)
      : ''

  return (
    <div className={className} title={value.id == null && nombre ? 'Texto que no coincide con ninguna jurisdicción del catálogo: elegí una de la lista' : undefined}>
      <Combobox
        label={label}
        placeholder={placeholder ?? 'Provincia o municipio'}
        options={opciones}
        value={valor}
        freeText
        disabled={disabled}
        onChange={v => {
          if (!v) { onChange({ id: null, nombre: '' }); return }
          const j = jurisdicciones.find(x => String(x.id) === v)
          if (j) onChange({ id: j.id, nombre: j.nombre })
        }}
      />
    </div>
  )
}
