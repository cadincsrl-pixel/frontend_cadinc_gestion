import { toISO } from './dates'

/**
 * Vencimiento de ropa de trabajo. Una sola regla para el filtro "solo
 * vencidos", el borde rojo de la fila y el chip de cada prenda (antes eran
 * dos cálculos distintos que discrepaban a fin de mes).
 */

/** Fecha en que vence una entrega, o null si la categoría no vence (meses <= 0). */
export function venceEl(fechaEntregaISO: string, mesesVencimiento: number): string | null {
  if (!(mesesVencimiento > 0)) return null
  const d = new Date(fechaEntregaISO + 'T12:00:00')
  const dia = d.getDate()
  d.setMonth(d.getMonth() + mesesVencimiento)
  // 31/01 + 1 mes no es 03/03: si el mes destino es más corto, último día.
  if (d.getDate() !== dia) d.setDate(0)
  return toISO(d)
}

/** Vencido = sin entrega, o entrega cuya fecha de vencimiento ya llegó. */
export function entregaVencida(
  ultimaEntregaISO: string | null | undefined,
  mesesVencimiento: number,
  hoyISO: string = toISO(new Date()),
): boolean {
  if (!ultimaEntregaISO) return true
  const v = venceEl(ultimaEntregaISO, mesesVencimiento)
  return v !== null && v <= hoyISO
}
