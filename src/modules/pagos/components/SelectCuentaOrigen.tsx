'use client'

import { useMemo } from 'react'
import { useCuentasOrigen } from '../hooks/usePagos'
import type { PagosCuentaOrigen, PagosFormaPagoOP } from '@/types/domain.types'

/**
 * «Sale de la cuenta» (20260926g): de qué cuenta propia de CADINC (banco, caja
 * o valores) salió la plata de la OP. Opcional: «— sin indicar —» manda null,
 * igual que todas las OP anteriores.
 *
 * No filtra por la forma de pago, solo ORDENA: las del tipo que sugiere la
 * forma van primero (efectivo → caja; transferencia, cheque, e-cheq y débito →
 * banco). Las cuentas se cargan en Contabilidad › Plan de cuentas.
 */

const TIPO_LABEL: Record<PagosCuentaOrigen['tipo'], string> = {
  banco: 'Bancos', caja: 'Caja', valores: 'Valores',
}

function tipoSugerido(forma: PagosFormaPagoOP | null | undefined): PagosCuentaOrigen['tipo'] | null {
  if (forma === 'efectivo') return 'caja'
  if (forma === 'transferencia' || forma === 'cheque' || forma === 'echeq' || forma === 'debito_automatico') return 'banco'
  return null
}

export function SelectCuentaOrigen({ value, onChange, forma, className, disabled, actualNombre }: {
  /** '' = sin indicar. */
  value:      string
  /** Nombre de la cuenta guardada, por si ya no está activa y no viene en la lista. */
  actualNombre?: string | null
  onChange:   (v: string) => void
  forma?:     PagosFormaPagoOP | null
  className?: string
  disabled?:  boolean
}) {
  const { data, isLoading, isError } = useCuentasOrigen()

  const grupos = useMemo(() => {
    const lista = data ?? []
    const sug = tipoSugerido(forma)
    const orden: PagosCuentaOrigen['tipo'][] = ['banco', 'caja', 'valores']
    const tipos = sug ? [sug, ...orden.filter(t => t !== sug)] : orden
    return tipos
      .map(t => ({ tipo: t, items: lista.filter(c => c.tipo === t) }))
      .filter(g => g.items.length > 0)
  }, [data, forma])

  // La OP puede apuntar a una cuenta que después se dio de baja: se muestra igual.
  const huerfana = !isLoading && value !== '' && !(data ?? []).some(c => String(c.id) === value)
  const vacia = !isLoading && (data ?? []).length === 0 && !huerfana
  const titulo = isError ? 'No se pudieron traer las cuentas de tesorería'
    : vacia ? 'No hay cuentas de tesorería: se cargan en Contabilidad › Plan'
    : 'De qué cuenta propia salió la plata (opcional)'

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled || vacia || isError}
      title={titulo}
      className={className}
    >
      <option value="">{isLoading ? 'Cargando…' : '— sin indicar —'}</option>
      {huerfana && <option value={value}>{actualNombre ?? `Cuenta #${value}`} (dada de baja)</option>}
      {grupos.map(g => (
        <optgroup key={g.tipo} label={TIPO_LABEL[g.tipo]}>
          {g.items.map(c => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}{c.moneda !== 'ARS' ? ` (${c.moneda})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** '' → null; "12" → 12. */
export function cuentaOrigenId(v: string): number | null {
  const n = Number(v)
  return v && Number.isInteger(n) && n > 0 ? n : null
}
