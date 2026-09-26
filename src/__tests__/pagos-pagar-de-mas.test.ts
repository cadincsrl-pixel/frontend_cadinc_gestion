import { describe, it, expect } from 'vitest'
import { lineasDeOrden, normalizarPago, resultadoDelPago, type FilaFactura } from '@/modules/pagos/utils/pagoForm'
import type { PagosFactura } from '@/types/domain.types'

// Pagar de más no se prohíbe, se avisa (2026-09-26, dueño: «puedo transferir
// de más si quiero»). Lo que una fila pone por encima de lo pagable pasa a
// «A cuenta»; el total del pago no cambia.
const fila = (id: number, saldo: number, monto: number): FilaFactura => ({
  factura: { id, saldo, saldo_pagable: saldo } as unknown as PagosFactura,
  monto: String(monto),
})

describe('pagar de más', () => {
  it('lo que pasa del saldo de una fila va a cuenta, sin cambiar el total', () => {
    const r = normalizarPago([fila(1, 231194.7, 240000)], '')
    expect(r.filas[0]!.monto).toBe('231194.7')
    expect(r.aCuenta).toBe(8805.3)
  })

  it('las líneas de la OP salen con la factura al tope y el resto a cuenta', () => {
    const l = lineasDeOrden([fila(1, 231194.7, 240000)], '')
    expect(l).toEqual([
      { tipo: 'factura', factura_id: 1, monto: 231194.7 },
      { tipo: 'a_cuenta', factura_id: null, monto: 8805.3 },
    ])
  })

  it('se suma a lo que ya estaba a cuenta', () => {
    const r = normalizarPago([fila(1, 1000, 1500)], '200')
    expect(r.aCuenta).toBe(700)
  })

  it('resultado: a favor y lo que se sigue debiendo', () => {
    expect(resultadoDelPago([fila(1, 1000, 1500), fila(2, 800, 300)], '')).toEqual({ aFavor: 500, quedaDebiendo: 500 })
    expect(resultadoDelPago([fila(1, 1000, 1000)], '')).toEqual({ aFavor: 0, quedaDebiendo: 0 })
  })
})
