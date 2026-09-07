import { describe, it, expect } from 'vitest'
import { venceEl, entregaVencida } from '../lib/utils/ropa'

describe('venceEl', () => {
  it('suma meses y respeta el fin de mes', () => {
    expect(venceEl('2026-03-15', 6)).toBe('2026-09-15')
    expect(venceEl('2026-01-31', 1)).toBe('2026-02-28')
    expect(venceEl('2026-08-31', 6)).toBe('2027-02-28')
  })
  it('0 meses = sin vencimiento', () => {
    expect(venceEl('2026-03-15', 0)).toBeNull()
  })
})

describe('entregaVencida', () => {
  it('sin entrega está vencido; con entrega depende de la fecha', () => {
    expect(entregaVencida(null, 6, '2026-09-07')).toBe(true)
    expect(entregaVencida('2026-03-07', 6, '2026-09-07')).toBe(true)   // vence hoy
    expect(entregaVencida('2026-03-08', 6, '2026-09-07')).toBe(false)  // vence mañana
  })
  it('una categoría que no vence nunca está vencida si hubo entrega', () => {
    expect(entregaVencida('2020-01-01', 0, '2026-09-07')).toBe(false)
  })
})
