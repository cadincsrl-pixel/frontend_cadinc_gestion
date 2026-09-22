import { describe, it, expect } from 'vitest'
import { formaSegunLoPrevisto } from '@/modules/pagos/components/ModalRegistrarPago'
import type { PagosFactura } from '@/types/domain.types'

// El modal de registrar pago arranca con la forma que la factura ya tenía
// prevista. Antes arrancaba fijo en «Transferencia» aunque la factura dijera
// otra cosa, así que elegir la forma al cargar no servía para nada al pagar.
const f = (forma_pago_prevista: string) => ({ forma_pago_prevista } as PagosFactura)

describe('formaSegunLoPrevisto', () => {
  it('sin facturas cae al default', () => {
    expect(formaSegunLoPrevisto([])).toBe('transferencia')
  })

  it('una factura: la forma que ya tenía prevista', () => {
    expect(formaSegunLoPrevisto([f('cheque')])).toBe('cheque')
    expect(formaSegunLoPrevisto([f('echeq')])).toBe('echeq')
    expect(formaSegunLoPrevisto([f('efectivo')])).toBe('efectivo')
  })

  it('varias que coinciden: esa misma', () => {
    expect(formaSegunLoPrevisto([f('cheque'), f('cheque'), f('cheque')])).toBe('cheque')
  })

  it('varias que NO coinciden: default, adivinar sería peor', () => {
    expect(formaSegunLoPrevisto([f('cheque'), f('efectivo')])).toBe('transferencia')
  })

  it('cuenta corriente no es una forma de pagar: cae al default', () => {
    // `cta_cte` se puede prever en la factura pero no se puede elegir en la OP
    // (quedar en cuenta corriente no es un pago). Es justo la factura que llega
    // al momento de pagarse sin saber todavía con qué se paga.
    expect(formaSegunLoPrevisto([f('cta_cte')])).toBe('transferencia')
  })

  it('una forma desconocida no rompe ni se cuela en el select', () => {
    expect(formaSegunLoPrevisto([f('vale_de_la_esquina')])).toBe('transferencia')
  })
})
