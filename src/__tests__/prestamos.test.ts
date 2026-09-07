import { describe, it, expect } from 'vitest'
import { resumenPrestamos, labelTipoPrestamo } from '@/lib/utils/prestamos'
import type { Prestamo } from '@/types/domain.types'

const mov = (leg: string, sem_key: string, tipo: Prestamo['tipo'], monto: number, id = 1): Prestamo =>
  ({ id, leg, sem_key, tipo, monto, concepto: null, created_by: null, created_at: '2026-09-04T12:00:00Z' } as Prestamo)

describe('resumenPrestamos', () => {
  const prestamos = [
    mov('012', '2026-09-04', 'otorgado', 50000, 1),
    mov('012', '2026-09-04', 'descontado', 20000, 2),
    mov('012', '2026-09-04', 'descontado', 5000, 3),
    mov('012', '2026-08-28', 'descontado', 99999, 4),  // otra semana
    mov('015', '2026-09-04', 'incobrable', 30000, 5),
    mov('015', '2026-09-04', 'otorgado', 1000, 6),
  ]

  it('suma todos los movimientos del legajo en la semana, no solo el primero', () => {
    const r = resumenPrestamos(prestamos, '2026-09-04', '012')
    expect(r).toMatchObject({ otorgados: 50000, descontados: 25000, incobrables: 0, neto: 25000 })
    expect(r.movimientos).toHaveLength(3)
  })

  it('el incobrable no suma ni resta al neto', () => {
    const r = resumenPrestamos(prestamos, '2026-09-04', '015')
    expect(r).toMatchObject({ otorgados: 1000, descontados: 0, incobrables: 30000, neto: 1000 })
  })

  it('sin legajo agrega toda la semana', () => {
    const r = resumenPrestamos(prestamos, '2026-09-04')
    expect(r).toMatchObject({ otorgados: 51000, descontados: 25000, incobrables: 30000, neto: 26000 })
  })

  it('etiquetas', () => {
    expect(labelTipoPrestamo('incobrable')).toBe('Incobrable')
    expect(labelTipoPrestamo('descontado')).toBe('Descontado')
  })
})
