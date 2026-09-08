import { describe, it, expect } from 'vitest'
import { parseNumeroAR, parseCantidadAR } from '@/lib/utils/numeros'

describe('parseNumeroAR', () => {
  it('acepta la coma, que es como se tipea en Argentina', () => {
    expect(parseNumeroAR('8,5')).toBe(8.5)
    expect(parseNumeroAR('0,5')).toBe(0.5)
    expect(parseNumeroAR('12,25')).toBe(12.25)
  })

  it('sigue aceptando el punto', () => {
    expect(parseNumeroAR('8.5')).toBe(8.5)
    expect(parseNumeroAR('8')).toBe(8)
  })

  // El bug que motivó todo esto: parseFloat('8,5') devuelve 8 y guarda
  // media hora de menos sin avisar.
  it('NO trunca en la coma como parseFloat', () => {
    expect(parseFloat('8,5')).toBe(8)      // el comportamiento viejo
    expect(parseNumeroAR('8,5')).toBe(8.5) // el nuevo
  })

  it('con los dos separadores, el último es el decimal', () => {
    expect(parseNumeroAR('1.234,56')).toBe(1234.56)   // es-AR
    expect(parseNumeroAR('1,234.56')).toBe(1234.56)   // en-US
    expect(parseNumeroAR('2.500,50')).toBe(2500.5)
  })

  it('rechaza lo que no es un número en vez de inventar uno', () => {
    expect(parseNumeroAR('8 hs')).toBeNull()
    expect(parseNumeroAR('ocho')).toBeNull()
    expect(parseNumeroAR('')).toBeNull()
    expect(parseNumeroAR('   ')).toBeNull()
    expect(parseNumeroAR(null)).toBeNull()
    expect(parseNumeroAR(undefined)).toBeNull()
    expect(parseNumeroAR(',')).toBeNull()
    expect(parseNumeroAR('.')).toBeNull()
  })

  it('tolera espacios alrededor y el signo', () => {
    expect(parseNumeroAR('  8,5  ')).toBe(8.5)
    expect(parseNumeroAR('-3')).toBe(-3)
  })
})

describe('parseCantidadAR', () => {
  it('rechaza negativos: no existen -2 horas', () => {
    expect(parseCantidadAR('-3')).toBeNull()
    expect(parseCantidadAR('-0,5')).toBeNull()
  })

  it('deja pasar el cero y los positivos', () => {
    expect(parseCantidadAR('0')).toBe(0)
    expect(parseCantidadAR('8,5')).toBe(8.5)
  })
})
