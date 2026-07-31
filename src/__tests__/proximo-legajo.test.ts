import { describe, it, expect } from 'vitest'
import { proximoLegajo } from '@/modules/personal/components/ModalNuevoTrabajador'

describe('proximoLegajo', () => {
  it('sugiere el mayor legajo numérico + 1 con padding a 3', () => {
    expect(proximoLegajo(['099', '100', '101'])).toBe('102')
  })

  it('mantiene el padding con legajos bajos', () => {
    expect(proximoLegajo(['001', '002', '010'])).toBe('011')
  })

  it('ignora legajos no numéricos', () => {
    expect(proximoLegajo(['099', 'EXT-1', '101', 'temp'])).toBe('102')
  })

  it('sin legajos numéricos no sugiere nada', () => {
    expect(proximoLegajo(['EXT-1'])).toBe('')
    expect(proximoLegajo([])).toBe('')
  })

  it('pasa de 999 sin recortar', () => {
    expect(proximoLegajo(['999'])).toBe('1000')
  })
})
