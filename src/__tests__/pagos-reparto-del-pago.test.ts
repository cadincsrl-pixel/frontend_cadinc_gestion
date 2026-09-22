import { describe, it, expect } from 'vitest'
import { repartirPagoEntreFacturas, type FacturaARepartir } from '@/modules/pagos/utils/pagos.utils'

// Cuando se paga con cheques, los cheques SON el pago: ya están escritos y
// entregados. El total de arriba es una consecuencia, no un dato a tipear.
// Esto reparte ese total entre las facturas: lo más viejo primero, que es como
// se imputa un pago, y lo que sobra va a cuenta.
const f = (id: number, vence_el: string | null, tope: number): FacturaARepartir => ({ id, vence_el, tope })

describe('repartirPagoEntreFacturas', () => {
  it('una sola factura cubierta justo', () => {
    const r = repartirPagoEntreFacturas(24995, [f(9, '2026-10-21', 24995)])
    expect(r.porFactura.get(9)).toBe(24995)
    expect(r.aCuenta).toBe(0)
  })

  it('una sola factura y se pagó de MENOS: queda parcial, sin sobrante', () => {
    const r = repartirPagoEntreFacturas(10000, [f(9, '2026-10-21', 24995)])
    expect(r.porFactura.get(9)).toBe(10000)
    expect(r.aCuenta).toBe(0)
  })

  it('una sola factura y se pagó de MÁS: el excedente va a cuenta', () => {
    const r = repartirPagoEntreFacturas(30000, [f(9, '2026-10-21', 24995)])
    expect(r.porFactura.get(9)).toBe(24995)
    expect(r.aCuenta).toBe(5005)
  })

  it('varias: cancela la más vieja primero y sigue con la que le sigue', () => {
    const r = repartirPagoEntreFacturas(150000, [
      f(1, '2026-11-30', 100000),   // la más nueva
      f(2, '2026-09-30', 90000),    // la más vieja
    ])
    expect(r.porFactura.get(2)).toBe(90000)   // se cancela entera
    expect(r.porFactura.get(1)).toBe(60000)   // el resto
    expect(r.aCuenta).toBe(0)
  })

  it('el orden de entrada no cambia el resultado: manda el vencimiento', () => {
    const facturas = [f(1, '2026-11-30', 100000), f(2, '2026-09-30', 90000)]
    const a = repartirPagoEntreFacturas(150000, facturas)
    const b = repartirPagoEntreFacturas(150000, [...facturas].reverse())
    expect([...a.porFactura.entries()].sort()).toEqual([...b.porFactura.entries()].sort())
  })

  it('las sin vencimiento van al final', () => {
    const r = repartirPagoEntreFacturas(100, [f(1, null, 100), f(2, '2026-09-30', 80)])
    expect(r.porFactura.get(2)).toBe(80)
    expect(r.porFactura.get(1)).toBe(20)
  })

  it('un tope en 0 (la NC ya cubrió la factura) no se lleva nada', () => {
    const r = repartirPagoEntreFacturas(5000, [f(1, '2026-09-30', 0), f(2, '2026-10-30', 5000)])
    expect(r.porFactura.get(1)).toBe(0)
    expect(r.porFactura.get(2)).toBe(5000)
  })

  it('reparte con centavos sin arrastrar el error del punto flotante', () => {
    const r = repartirPagoEntreFacturas(24994.52, [f(1, '2026-09-30', 10000.01), f(2, '2026-10-30', 20000.02)])
    expect(r.porFactura.get(1)).toBe(10000.01)
    expect(r.porFactura.get(2)).toBe(14994.51)
    expect(r.aCuenta).toBe(0)
    // Y la suma cierra exacta contra lo pagado: el backend compara por igualdad.
    const suma = [...r.porFactura.values()].reduce((s, v) => s + v, 0) + r.aCuenta
    expect(Math.round(suma * 100)).toBe(Math.round(24994.52 * 100))
  })

  it('un importe en 0 no asigna nada y no deja sobrante', () => {
    const r = repartirPagoEntreFacturas(0, [f(1, '2026-09-30', 5000)])
    expect(r.porFactura.get(1)).toBe(0)
    expect(r.aCuenta).toBe(0)
  })

  it('sin facturas todo queda a cuenta', () => {
    const r = repartirPagoEntreFacturas(5000, [])
    expect(r.aCuenta).toBe(5000)
  })

  it('un importe negativo no genera asignaciones negativas', () => {
    const r = repartirPagoEntreFacturas(-100, [f(1, '2026-09-30', 5000)])
    expect(r.porFactura.get(1)).toBe(0)
    expect(r.aCuenta).toBe(0)
  })
})
