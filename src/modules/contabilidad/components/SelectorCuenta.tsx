'use client'

import { useMemo } from 'react'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import type { CtbAuxiliarTipo, CtbCuenta, CtbRubro } from '@/types/contabilidad.types'
import { useCuentas } from '../hooks/useContabilidad'
import { rubroLabel } from '../utils/contabilidad.utils'

/**
 * Elegir una cuenta contable por código o por nombre ("1.1.01.003" o
 * "galicia"). El rubro va en `group`, NUNCA en `sub`: el filtro del Combobox
 * corre sobre label+sub+search y con el rubro en `sub` «activo» traería todas
 * las cuentas del rubro (§5.15).
 *
 * `modo`:
 *   - `imputables` (asientos): solo imputables activas. La que ya está
 *     elegida se muestra igual aunque esté dada de baja, para no vaciar una
 *     línea vieja.
 *   - `todas` (mayor, filtro de asientos): también los títulos, que suman a
 *     sus descendientes, y las dadas de baja (su historia sigue ahí).
 */
export function SelectorCuenta({
  value, onChange, modo = 'imputables', rubros, auxiliares, filtrar, label, placeholder, disabled, className,
}: {
  /** id como string; '' = ninguna. */
  value:        string
  onChange:     (id: string, cuenta: CtbCuenta | null) => void
  modo?:        'imputables' | 'todas'
  /** Restringe a esos rubros (tesorería: solo activo). */
  rubros?:      CtbRubro[]
  /** Restringe al tipo de auxiliar de la cuenta (mapeos: lo que acepta cada clave). */
  auxiliares?:  CtbAuxiliarTipo[]
  /** Filtro extra (bienes de uso: solo las «Valores originales» 1.2.2.XX.01). */
  filtrar?:     (c: CtbCuenta) => boolean
  label?:       string
  placeholder?: string
  disabled?:    boolean
  className?:   string
}) {
  // Siempre con las inactivas (una sola query en caché para toda la grilla):
  // el filtro de abajo las esconde salvo la que ya está elegida.
  const { data, isLoading, isError } = useCuentas({ incluirInactivas: true })
  const cuentas = useMemo(() => data ?? [], [data])

  const opciones = useMemo<ComboboxOption[]>(() => cuentas
    .filter(c => String(c.id) === value || (
      (modo === 'todas' || (c.activo && c.imputable))
      && (!rubros || rubros.includes(c.rubro))
      && (!auxiliares || auxiliares.includes(c.auxiliar))
      && (!filtrar || filtrar(c))
    ))
    .map(c => ({
      value:  String(c.id),
      label:  `${c.codigo} — ${c.nombre}`,
      group:  rubroLabel(c.rubro),
      sub:    [
        !c.imputable ? 'título: suma sus subcuentas' : null,
        !c.activo ? 'dada de baja' : null,
      ].filter(Boolean).join(' · ') || undefined,
      search: [c.codigo, c.nombre],
    })), [cuentas, value, modo, rubros, auxiliares, filtrar])

  const ph = isLoading ? 'Cargando cuentas…'
    : isError ? 'No se pudo traer el plan'
    : cuentas.length === 0 ? 'El plan de cuentas está vacío'
    : placeholder ?? 'Código o nombre…'

  return (
    <Combobox
      label={label}
      placeholder={ph}
      options={opciones}
      value={value}
      disabled={disabled || isLoading}
      className={className}
      onChange={v => onChange(v, cuentas.find(c => String(c.id) === v) ?? null)}
    />
  )
}
