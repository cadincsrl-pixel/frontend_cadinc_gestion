// Datos REALES de SOSA CRISTIAN DANIEL (leg. 066) traidos de prod el 11/09:
// personal_cat_historial = Medio Oficial (2) desde 2026-03-19, Oficial Albañil (1) desde 2026-09-04.
// personal.cat_id = 1 (Oficial Albañil, la de HOY). Sin overrides de cat_obra.
import { describe, it, expect } from 'vitest'
import { getCatIdEfectivo } from '@/lib/utils/costos'

const personal = [{
  leg: '066', nom: 'SOSA CRISTIAN DANIEL', cat_id: 1,
  personal_cat_historial: [
    { cat_id: 2, desde: '2026-03-19' },
    { cat_id: 1, desde: '2026-09-04' },
  ],
}] as never

describe('categoría de Sosa por semana (leg. 066)', () => {
  const en = (sem: string) => getCatIdEfectivo([], personal, 'CC DEPOSITO', '066', sem)

  it('en agosto es Medio Oficial, no la categoría de hoy', () => {
    expect(en('2026-08-07')).toBe(2)
    expect(en('2026-08-14')).toBe(2)
    expect(en('2026-08-21')).toBe(2)
    expect(en('2026-08-28')).toBe(2)
  })

  it('desde la semana del 04/09 es Oficial Albañil', () => {
    expect(en('2026-09-04')).toBe(1)
    expect(en('2026-09-11')).toBe(1)
  })

  it('antes del primer registro de historial cae a la ficha', () => {
    expect(en('2026-03-06')).toBe(1)
  })
})
