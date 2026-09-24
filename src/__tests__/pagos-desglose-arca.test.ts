// El desglose de la factura como lo pide ARCA (20260924u): mismas cuentas que
// la base (`_pagos_guardar_desglose`) y el backend (`importesEfectivos`).
import { describe, it, expect } from 'vitest'
import { resumirDesglose, ivaDe, ivaNoCuadra, esPercepcion, sinDesglose } from '@/modules/pagos/utils/desglose'

describe('resumirDesglose', () => {
  it('factura A con IVA 21 % y dos percepciones (ABC, 21/09)', () => {
    const r = resumirDesglose({
      iva: [{ alicuota_id: 5, base: 111598.71, importe: 23435.73 }],
      tributos: [{ tipo: 'percepcion_iva', importe: 3347.96 }],
      neto: 0, noGravado: 0, exento: 0, total: 138382.40,
    })
    expect(r.netoGravado).toBe(111598.71)
    expect(r.iva).toBe(23435.73)
    expect(r.percepciones).toBe(3347.96)
    expect(r.cierra).toBe(true)
    // Las percepciones no se reparten entre obras.
    expect(r.imputable).toBe(135034.44)
  })
  it('varias alícuotas, no gravado, exento e impuestos internos', () => {
    const r = resumirDesglose({
      iva: [{ alicuota_id: 5, base: 1000, importe: 210 }, { alicuota_id: 4, base: 200, importe: 21 }],
      tributos: [{ tipo: 'impuestos_internos', importe: 50 }, { tipo: 'percepcion_iibb', importe: 30 }],
      neto: 999, noGravado: 100, exento: 40, total: 1651,
    })
    expect(r.netoGravado).toBe(1200)   // con alícuotas, el neto suelto no cuenta
    expect(r.otros).toBe(50)
    expect(r.suma).toBe(1651)
    expect(r.cierra).toBe(true)
    expect(r.imputable).toBe(1621)
  })
  it('sin alícuotas (B/C): usa el neto; y dice cuánto falta', () => {
    const r = resumirDesglose({ iva: [], tributos: [], neto: 1000, noGravado: 0, exento: 0, total: 1000.5 })
    expect(r.netoGravado).toBe(1000)
    expect(r.cierra).toBe(false)
    expect(r.diferencia).toBe(0.5)
  })
  it('tolera un centavo (Zeramiko: 18.999,99 contra 19.000)', () => {
    const r = resumirDesglose({
      iva: [{ alicuota_id: 5, base: 15541.92, importe: 3263.8 }],
      tributos: [{ tipo: 'percepcion_iibb', importe: 194.27 }],
      neto: 0, noGravado: 0, exento: 0, total: 19000,
    })
    expect(r.cierra).toBe(true)
  })
})

describe('IVA por alícuota', () => {
  it('sugiere y controla el importe', () => {
    expect(ivaDe(1000, 5)).toBe(210)
    expect(ivaDe(1000, 4)).toBe(105)
    expect(ivaNoCuadra(1000, 210.4, 5)).toBe(false)
    expect(ivaNoCuadra(1000, 105, 5)).toBe(true)
  })
  it('percepciones', () => {
    expect(esPercepcion('percepcion_municipal')).toBe(true)
    expect(esPercepcion('impuestos_internos')).toBe(false)
  })
})

describe('sinDesglose (20260924v)', () => {
  it('sin neto o IVA, o marcada a revisar: le falta; anulada no cuenta', () => {
    expect(sinDesglose({ estado: 'pagada', neto: null, iva: null })).toBe(true)
    expect(sinDesglose({ estado: 'pagada', neto: 100, iva: 21 })).toBe(false)
    expect(sinDesglose({ estado: 'pagada', neto: 100, iva: 21, desglose_a_revisar: true })).toBe(true)
    expect(sinDesglose({ estado: 'anulada', neto: null, iva: null })).toBe(false)
  })
})
