/**
 * Cómo se reparten los cheques de una orden de pago: cuántos y a qué plazo.
 *
 * El backend exige que Σ cheques sea EXACTAMENTE lo que sale de plata y que
 * ninguno se cobre antes de la fecha del pago, así que estos dos helpers
 * tienen que cerrar al centavo y nunca generar una fecha anterior.
 */
import { describe, it, expect } from 'vitest'
import { fechasEscalonadas, partirEnPartes, plazoLabel, sumarDiasISO } from '@/modules/pagos/utils/pagos.utils'

const FECHA = '2026-09-21'

describe('fechasEscalonadas', () => {
  it('al día: el primero se cobra el mismo día del pago', () => {
    expect(fechasEscalonadas(FECHA, 1, 0, 30)).toEqual(['2026-09-21'])
  })

  it('0/30/60: la primera entrega es al día y después cada 30', () => {
    expect(fechasEscalonadas(FECHA, 3, 0, 30)).toEqual(['2026-09-21', '2026-10-21', '2026-11-20'])
  })

  it('30/60/90: el clásico, el primero ya a plazo', () => {
    expect(fechasEscalonadas(FECHA, 3, 30, 30)).toEqual(['2026-10-21', '2026-11-20', '2026-12-20'])
  })

  it('7 y 15 días, que es como se pagan las chicas', () => {
    expect(fechasEscalonadas(FECHA, 1, 7, 30)).toEqual(['2026-09-28'])
    expect(fechasEscalonadas(FECHA, 2, 15, 15)).toEqual(['2026-10-06', '2026-10-21'])
  })

  it('cruza fin de mes y año sin corrimientos', () => {
    expect(fechasEscalonadas('2026-12-15', 2, 30, 30)).toEqual(['2027-01-14', '2027-02-13'])
  })

  it('ninguna fecha cae antes del pago, ni con plazos negativos', () => {
    for (const f of fechasEscalonadas(FECHA, 4, -10, -5)) expect(f >= FECHA).toBe(true)
  })

  it('cantidad cero o negativa no genera nada', () => {
    expect(fechasEscalonadas(FECHA, 0, 30, 30)).toEqual([])
    expect(fechasEscalonadas(FECHA, -2, 30, 30)).toEqual([])
  })
})

describe('partirEnPartes + fechasEscalonadas juntos', () => {
  it('la suma de los importes da exacto el total aunque no divida', () => {
    const total = 1_000_000.01
    for (const n of [1, 2, 3, 4, 6, 7, 12]) {
      const partes = partirEnPartes(total, n)
      expect(partes).toHaveLength(n)
      const suma = partes.reduce((a, b) => a + b, 0)
      expect(Math.round(suma * 100)).toBe(Math.round(total * 100))
    }
  })

  it('hay una fecha por cada importe', () => {
    const partes = partirEnPartes(900000, 3)
    expect(fechasEscalonadas(FECHA, partes.length, 0, 30)).toHaveLength(3)
  })
})

describe('plazoLabel', () => {
  it('0 se lee «Al día», el resto en días', () => {
    expect(plazoLabel(0)).toBe('Al día')
    expect(plazoLabel(30)).toBe('30 días')
  })
})

describe('sumarDiasISO', () => {
  it('no se corre por zona horaria', () => {
    expect(sumarDiasISO('2026-09-21', 0)).toBe('2026-09-21')
    expect(sumarDiasISO('2026-03-31', 1)).toBe('2026-04-01')
  })
})
