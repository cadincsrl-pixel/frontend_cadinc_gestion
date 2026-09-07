import type { Prestamo } from '@/types/domain.types'

export interface ResumenPrestamos {
  otorgados:   number
  descontados: number
  incobrables: number
  /** Lo que suma o resta al recibo: otorgados − descontados. Los incobrables no entran. */
  neto:        number
  movimientos: Prestamo[]
}

/**
 * Suma los movimientos de préstamos de una semana (y opcionalmente de un
 * legajo). Un operario puede tener varios en la misma semana (un préstamo y
 * un descuento, dos descuentos), y `incobrable` es una baja de saldo: no es
 * plata que se le descuenta ni que se le da, así que no toca el neto.
 * Hasta el 2026-09-06 el recibo tomaba solo el primer movimiento
 * (`prestamos.find`) y trataba el incobrable como descuento.
 */
export function resumenPrestamos(
  prestamos: Prestamo[],
  semKey: string,
  leg?: string,
): ResumenPrestamos {
  const movimientos = prestamos.filter(p => p.sem_key === semKey && (leg === undefined || p.leg === leg))
  let otorgados = 0, descontados = 0, incobrables = 0
  for (const p of movimientos) {
    if (p.tipo === 'otorgado') otorgados += p.monto
    else if (p.tipo === 'descontado') descontados += p.monto
    else if (p.tipo === 'incobrable') incobrables += p.monto
  }
  return { otorgados, descontados, incobrables, neto: otorgados - descontados, movimientos }
}

export function labelTipoPrestamo(tipo: Prestamo['tipo']): string {
  return tipo === 'otorgado' ? 'Otorgado' : tipo === 'descontado' ? 'Descontado' : 'Incobrable'
}
