'use client'

import { useMemo } from 'react'
import { useCuentaOrigenSugerida, useCuentasOrigen } from '../hooks/usePagos'
import type { PagosCuentaOrigen, PagosFormaPagoOP } from '@/types/domain.types'

/**
 * «Sale de la cuenta» (20260926g): de qué cuenta propia de CADINC (banco, caja,
 * valores, tarjeta o billetera, 20260927h) salió la plata de la OP. Opcional: «— sin indicar —» manda null,
 * igual que todas las OP anteriores.
 *
 * No filtra por la forma de pago, solo ORDENA: las del tipo que sugiere la
 * forma van primero (efectivo → caja; tarjeta → tarjetas; transferencia,
 * cheque, e-cheq y débito → banco). Las cuentas se cargan en Contabilidad › Plan de cuentas.
 *
 * Con `auto`, lo vacío no es «sin indicar» sino «automática: X» (20261009e):
 * la base le pone a la OP la cuenta que diga `_pagos_cuenta_origen_sugerida`
 * y acá solo se muestra cuál va a ser.
 */

export const TIPO_CUENTA_ORIGEN_LABEL: Record<PagosCuentaOrigen['tipo'], string> = {
  banco: 'Bancos', caja: 'Caja', valores: 'Valores', tarjeta: 'Tarjetas', billetera: 'Billeteras',
}

export function tipoSugerido(forma: PagosFormaPagoOP | null | undefined): PagosCuentaOrigen['tipo'] | null {
  if (forma === 'efectivo') return 'caja'
  if (forma === 'tarjeta') return 'tarjeta'
  if (forma === 'transferencia' || forma === 'cheque' || forma === 'echeq' || forma === 'debito_automatico') return 'banco'
  return null
}

export function SelectCuentaOrigen({ value, onChange, forma, className, disabled, actualNombre, auto }: {
  /** '' = sin indicar. */
  value:      string
  /** Nombre de la cuenta guardada, por si ya no está activa y no viene en la lista. */
  actualNombre?: string | null
  onChange:   (v: string) => void
  forma?:     PagosFormaPagoOP | null
  className?: string
  disabled?:  boolean
  /** OP nueva: vacío = la cuenta automática, que se muestra en la opción vacía. */
  auto?: { proveedorId?: number | null; cheques?: Array<{ banco?: string | null; es_propio?: boolean }> }
}) {
  const { data, isLoading, isError } = useCuentasOrigen()
  const sug = useCuentaOrigenSugerida(auto && forma && value === '' ? { proveedor_id: auto.proveedorId, forma_pago: forma, cheques: auto.cheques } : null)
  const vacioLabel = isLoading ? 'Cargando…'
    : !auto ? '— sin indicar —'
    : sug.data?.nombre ? `Automática: ${sug.data.nombre}`
    : sug.isFetching ? 'Automática…'
    : '— sin cuenta —'

  const grupos = useMemo(() => {
    const lista = data ?? []
    const sug = tipoSugerido(forma)
    const orden: PagosCuentaOrigen['tipo'][] = ['banco', 'caja', 'valores', 'tarjeta', 'billetera']
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
    : auto ? 'De qué cuenta propia salió la plata. Si no elegís, se toma la automática'
    : 'De qué cuenta propia salió la plata (opcional)'

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled || vacia || isError}
      title={titulo}
      className={className}
    >
      <option value="">{vacioLabel}</option>
      {huerfana && <option value={value}>{actualNombre ?? `Cuenta #${value}`} (dada de baja)</option>}
      {grupos.map(g => (
        <optgroup key={g.tipo} label={TIPO_CUENTA_ORIGEN_LABEL[g.tipo]}>
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
