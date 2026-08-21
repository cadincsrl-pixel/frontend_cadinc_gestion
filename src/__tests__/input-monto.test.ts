import { describe, it, expect } from 'vitest'
import { aRaw, aDisplay, reformatear } from '@/components/ui/InputMonto'

// El contrato del InputMonto: lo tipeado/pegado (es-AR) se convierte a
// formato máquina ("1234567.89") y el display siempre muestra miles con
// punto y decimales con coma. Number(raw) debe funcionar SIEMPRE.

describe('aRaw (display/tipeo → formato máquina)', () => {
  it('dígitos pelados', () => {
    expect(aRaw('1234567', 2)).toBe('1234567')
  })
  it('descarta puntos de miles', () => {
    expect(aRaw('1.234.567', 2)).toBe('1234567')
  })
  it('coma como separador decimal', () => {
    expect(aRaw('1.234,56', 2)).toBe('1234.56')
  })
  it('recorta decimales de más', () => {
    expect(aRaw('10,999', 2)).toBe('10.99')
  })
  it('coma colgante = sin decimal', () => {
    expect(aRaw('1.234,', 2)).toBe('1234')
  })
  it('decimales=0 descarta la parte decimal (no la pega como dígitos)', () => {
    expect(aRaw('1.234,56', 0)).toBe('1234')
  })
  it('pegado es-AR completo', () => {
    expect(aRaw('1.234.567,89', 2)).toBe('1234567.89')
  })
  it('solo decimal arranca en 0', () => {
    expect(aRaw(',5', 2)).toBe('0.5')
  })
  it('vacío y basura', () => {
    expect(aRaw('', 2)).toBe('')
    expect(aRaw('abc', 2)).toBe('')
  })
  it('Number(raw) siempre es finito o NaN de vacío', () => {
    for (const t of ['1.234.567,89', '500', '0,5', '1.000']) {
      expect(Number.isFinite(Number(aRaw(t, 2)))).toBe(true)
    }
  })
})

describe('aDisplay (formato máquina → es-AR)', () => {
  it('miles con punto', () => {
    expect(aDisplay('1234567')).toBe('1.234.567')
  })
  it('decimales con coma', () => {
    expect(aDisplay('1234567.8')).toBe('1.234.567,8')
    expect(aDisplay(1234567.89)).toBe('1.234.567,89')
  })
  it('números chicos sin separador', () => {
    expect(aDisplay('999')).toBe('999')
    expect(aDisplay(0)).toBe('0')
  })
  it('vacío/null/undefined → vacío', () => {
    expect(aDisplay('')).toBe('')
    expect(aDisplay(null)).toBe('')
    expect(aDisplay(undefined)).toBe('')
  })
})

describe('reformatear (lo tipeado → display, conservando coma colgante)', () => {
  it('agrega miles mientras se tipea', () => {
    expect(reformatear('1234', 2)).toBe('1.234')
    expect(reformatear('1234567', 2)).toBe('1.234.567')
  })
  it('conserva la coma recién tipeada', () => {
    expect(reformatear('1234,', 2)).toBe('1.234,')
  })
  it('no conserva coma si decimales=0', () => {
    expect(reformatear('1234,', 0)).toBe('1.234')
  })
  it('round-trip estable: reformatear(display) === display', () => {
    for (const raw of ['1234567', '1234567.89', '500', '0.5']) {
      const disp = aDisplay(raw)
      expect(reformatear(disp, 2)).toBe(disp)
      expect(aRaw(disp, 2)).toBe(raw)
    }
  })
})
