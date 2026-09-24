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

/** Lo que hace falta de la ficha del trabajador para precargar el talle. */
export interface TallesFicha {
  talle_pantalon?: string | null
  talle_botines?:  string | null
  talle_camisa?:   string | null
}

/**
 * El talle con el que se precarga una prenda: el de la ficha del trabajador
 * según `talle_de` de la categoría (20260923o). Una categoría sin `talle_de`
 * (guantes, casco) arranca vacía.
 */
export function talleDeFicha(
  p: TallesFicha | null | undefined,
  talleDe: 'pantalon' | 'botines' | 'camisa' | null | undefined,
): string {
  if (!p || !talleDe) return ''
  const t = talleDe === 'pantalon' ? p.talle_pantalon : talleDe === 'botines' ? p.talle_botines : p.talle_camisa
  return (t ?? '').toString().trim()
}

/**
 * Las prendas que le tocan a un trabajador hoy: las que nunca recibió y las
 * vencidas. Es lo que la entrega por obra deja tildado de entrada.
 */
export function prendasQueLeFaltan(
  leg: string,
  categorias: ReadonlyArray<{ id: number; meses_vencimiento: number }>,
  ultima: (leg: string, catId: number) => string | null | undefined,
  hoyISO: string = toISO(new Date()),
): number[] {
  return categorias
    .filter(c => entregaVencida(ultima(leg, c.id), c.meses_vencimiento ?? 6, hoyISO))
    .map(c => c.id)
}
