import { describe, expect, it } from 'vitest'
import { avisoLetraCondicion, cantidadDe } from '@/modules/pagos/utils/pagos.utils'
import { mensajeAvisoLectura, mensajeAvisoPagos } from '@/modules/pagos/utils/pagos.errores'

// Espejo del aviso LETRA_NO_COINCIDE_CONDICION del backend (20260925o): no bloquea.
describe('avisoLetraCondicion', () => {
  it('monotributista que factura A o B', () => {
    expect(avisoLetraCondicion(6, 'A')).toMatch(/factura C/)
    expect(avisoLetraCondicion(13, 'B')).toMatch(/factura C/)
    expect(avisoLetraCondicion(16, 'C')).toBeNull()
  })
  it('responsable inscripto que factura C', () => {
    expect(avisoLetraCondicion(1, 'C')).not.toBeNull()
    expect(avisoLetraCondicion(1, 'A')).toBeNull()
    expect(avisoLetraCondicion(1, 'B')).toBeNull()
  })
  it('exento que factura A', () => {
    expect(avisoLetraCondicion(4, 'A')).not.toBeNull()
    expect(avisoLetraCondicion(4, 'B')).toBeNull()
  })
  it('sin condición o sin letra no dice nada; recibos y tickets tampoco', () => {
    expect(avisoLetraCondicion(null, 'A')).toBeNull()
    expect(avisoLetraCondicion(6, null)).toBeNull()
    expect(avisoLetraCondicion(6, 'recibo')).toBeNull()
  })
})

describe('mensajes del aviso', () => {
  it('traduce el aviso seco con la condición como id o como texto', () => {
    expect(mensajeAvisoPagos({ code: 'LETRA_NO_COINCIDE_CONDICION', condicion: 6, letra: 'A' })).toMatch(/Responsable Monotributo/)
    expect(mensajeAvisoPagos({ code: 'LETRA_NO_COINCIDE_CONDICION', condicion: 'Monotributo', letra: 'A' })).toMatch(/«Monotributo»/)
  })
  it('la lectura acepta `code` además de `codigo`', () => {
    expect(mensajeAvisoLectura({ code: 'LETRA_NO_COINCIDE_CONDICION', letra: 'B' } as { code: string })).toMatch(/factura B/)
    expect(mensajeAvisoLectura({ codigo: 'X', mensaje: 'dice el backend' })).toBe('dice el backend')
  })
})

describe('cantidadDe', () => {
  it('número o lista', () => {
    expect(cantidadDe(3)).toBe(3)
    expect(cantidadDe([1, 2])).toBe(2)
    expect(cantidadDe(undefined)).toBe(0)
  })
})
