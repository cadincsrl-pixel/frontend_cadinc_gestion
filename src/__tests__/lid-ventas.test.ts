import { describe, it, expect } from 'vitest'
import { aAnsi, mesesRecientes, nombreArchivoLid, nombreMes } from '@/modules/facturacion/utils/lidVentas'

describe('Libro IVA ventas (frontend)', () => {
  it('aAnsi: un byte por carácter (Latin-1), CRLF intacto', () => {
    expect([...aAnsi('PEÑA\r\n')]).toEqual([0x50, 0x45, 0xd1, 0x41, 0x0d, 0x0a])
    expect([...aAnsi('€')]).toEqual([0x3f])
  })
  it('meses del selector, del más nuevo al más viejo', () => {
    expect(mesesRecientes(new Date(2026, 8, 24), 4)).toEqual(['2026-09', '2026-08', '2026-07', '2026-06'])
    expect(mesesRecientes(new Date(2026, 0, 5), 2)).toEqual(['2026-01', '2025-12'])
  })
  it('nombres', () => {
    expect(nombreArchivoLid('2026-09', 'cbte')).toBe('LIBRO_IVA_DIGITAL_VENTAS_CBTE_202609.txt')
    expect(nombreArchivoLid('2026-09', 'alicuotas')).toBe('LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_202609.txt')
    expect(nombreMes('2026-09')).toBe('septiembre 2026')
  })
})
