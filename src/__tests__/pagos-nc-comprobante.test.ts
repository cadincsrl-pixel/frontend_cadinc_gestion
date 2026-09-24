import { describe, it, expect } from 'vitest'
import {
  conSigno, estadoLabel, repartirPagoEntreFacturas, repartoProrrateado, topePagable,
} from '@/modules/pagos/utils/pagos.utils'
import { aplicaADe, validarAcredita } from '@/modules/pagos/components/AcreditaA'
import type { PagosFactura } from '@/types/domain.types'

// La NC de proveedor es un COMPROBANTE (20260925): baja deuda al aprobarse,
// mientras tanto RESERVA lo que declara acreditar, y nunca es deuda ella misma.

describe('topePagable', () => {
  it('manda saldo_pagable: lo reservado por una NC sin aprobar no se paga con plata', () => {
    expect(topePagable({ saldo: 1000, saldo_pagable: 700 })).toBe(700)
  })
  it('sin la columna (backend viejo) cae al saldo', () => {
    expect(topePagable({ saldo: 1000 })).toBe(1000)
  })
  it('nunca negativo', () => {
    expect(topePagable({ saldo: 100, saldo_pagable: -5 })).toBe(0)
  })
  it('el reparto del pago respeta el tope pagable', () => {
    const r = repartirPagoEntreFacturas(1000, [{ id: 1, vence_el: '2026-10-01', tope: topePagable({ saldo: 1000, saldo_pagable: 700 }) }])
    expect(r.porFactura.get(1)).toBe(700)
    expect(r.aCuenta).toBe(300)
  })
})

describe('signo y etiquetas', () => {
  it('la NC resta, la factura suma', () => {
    expect(conSigno(300, 'nota_credito')).toBe(-300)
    expect(conSigno(300, 'factura')).toBe(300)
    expect(conSigno(null, 'factura')).toBe(0)
  })
  it('los estados de una NC se leen distinto', () => {
    expect(estadoLabel('aprobada', 'nota_credito')).toBe('Crédito disponible')
    expect(estadoLabel('pagada_parcial', 'nota_credito')).toBe('Aplicada en parte')
    expect(estadoLabel('pagada', 'nota_credito')).toBe('Aplicada')
    expect(estadoLabel('pagada', 'factura')).toBe('Pagada')
  })
})

describe('repartoProrrateado', () => {
  it('una NC sobre una factura 2/3 – 1/3 reparte igual', () => {
    const r = repartoProrrateado([{
      aplicado: 300, imputable: 900,
      imputaciones: [{ obra_cod: 'LAM', monto: 600 }, { obra_cod: 'CC', monto: 300 }],
    }], 300)
    expect(r).toEqual([{ obra_cod: 'LAM', monto: 200 }, { obra_cod: 'CC', monto: 100 }])
  })

  it('varias facturas suman por obra y la suma cierra al centavo', () => {
    const r = repartoProrrateado([
      { aplicado: 100, imputable: 300, imputaciones: [{ obra_cod: 'A', monto: 100 }, { obra_cod: 'B', monto: 100 }, { obra_cod: 'C', monto: 100 }] },
      { aplicado: 50, imputable: 50, imputaciones: [{ obra_cod: 'A', monto: 50 }] },
    ], 150)
    const suma = Math.round(r.reduce((s, x) => s + x.monto, 0) * 100) / 100
    expect(suma).toBe(150)
    expect(r.find(x => x.obra_cod === 'A')!.monto).toBeCloseTo(83.33, 2)
  })

  it('escala a lo imputable de la NC (total − percepciones)', () => {
    const r = repartoProrrateado([{ aplicado: 1000, imputable: 1000, imputaciones: [{ obra_cod: 'A', monto: 1000 }] }], 950)
    expect(r).toEqual([{ obra_cod: 'A', monto: 950 }])
  })

  it('sin facturas imputadas no inventa nada', () => {
    expect(repartoProrrateado([{ aplicado: 100, imputable: 0, imputaciones: [] }], 100)).toEqual([])
    expect(repartoProrrateado([], 100)).toEqual([])
  })
})

describe('validarAcredita', () => {
  const f = (id: number, saldo_pagable: number) => ({ id, saldo: saldo_pagable, saldo_pagable } as PagosFactura)

  it('suma lo tipeado y avisa la fila que se pasa de lo que le queda', () => {
    const v = validarAcredita({ '1': '500', '2': '200' }, [f(1, 400), f(2, 1000)], 1000)
    expect(v.suma).toBe(700)
    expect(Object.keys(v.errores)).toEqual(['1'])
    expect(v.resto).toBe(300)
    expect(v.excedeTotal).toBe(false)
  })

  it('al editar, la reserva de la propia NC vuelve al tope', () => {
    const v = validarAcredita({ '1': '500' }, [f(1, 400)], 1000, { 1: 100 })
    expect(v.errores).toEqual({})
  })

  it('no puede acreditar más que el total de la NC', () => {
    expect(validarAcredita({ '1': '500', '2': '600' }, [f(1, 1000), f(2, 1000)], 1000).excedeTotal).toBe(true)
  })

  it('al backend viajan solo las filas con monto', () => {
    expect(aplicaADe({ '1': '500', '2': '', '3': '0' })).toEqual([{ factura_id: 1, monto: 500 }])
  })
})

// ── Traducción de errores: los dos formatos (20260925) ────────────────
import { codigoErrorPagos, mensajeErrorPagos } from '@/modules/pagos/utils/pagos.errores'
import { nombreEnZip } from '@/modules/pagos/utils/pagosPaquete'
import type { PagosPaqueteOrden, PagosPaqueteArchivo } from '@/types/domain.types'

class HttpErrorFake extends Error {
  constructor(message: string, public body: unknown) { super(message) }
}

describe('mensajeErrorPagos con reglas de NC', () => {
  it('lee el {error, detail} de siempre', () => {
    const e = new HttpErrorFake('NC_SIN_CREDITO', { error: 'NC_SIN_CREDITO', detail: { nc_id: 3, nc_disponible: 0 } })
    expect(codigoErrorPagos(e)).toBe('NC_SIN_CREDITO')
    expect(mensajeErrorPagos(e)).toContain('crédito disponible')
  })

  it('lee el 400 de zod del validador (issues serializados en error.message)', () => {
    const issues = [{ code: 'custom', path: ['orden'], message: 'NC_NO_SE_PAGA' }]
    const e = new HttpErrorFake('x', { success: false, error: { name: 'ZodError', message: JSON.stringify(issues) } })
    expect(codigoErrorPagos(e)).toBe('NC_NO_SE_PAGA')
    expect(mensajeErrorPagos(e)).toContain('no se paga')
  })

  it('acepta «campo:CODIGO» en el mensaje y usa el campo', () => {
    const e = new HttpErrorFake('x', { issues: [{ path: ['x'], message: 'vence_el:NC_TIPO_INVALIDO' }] })
    expect(mensajeErrorPagos(e)).toBe('Una nota de crédito no lleva vencimiento.')
  })

  it('un issue que no es código de negocio no se inventa como código', () => {
    const e = new HttpErrorFake('POST → 400', { success: false, error: { name: 'ZodError', message: JSON.stringify([{ path: ['total'], message: 'Too small' }]) } })
    expect(codigoErrorPagos(e)).toBe('POST → 400')
  })
})

describe('paquete del contador con NC', () => {
  it('el papel de la NC va en la carpeta de la OP con su número', () => {
    const o = { id: 8, numero: 8, numero_fmt: 'OP-0008', fecha: '2026-09-21', proveedor_nom: 'NORTE' } as PagosPaqueteOrden
    const a = { adjunto_id: 5, tipo: 'factura', origen: 'nota_credito', nombre_archivo: 'nc.pdf', mime_type: 'application/pdf', size_bytes: 1, url: 'x' } as PagosPaqueteArchivo
    const n = nombreEnZip(o, a, new Set(), undefined, {
      nc_id: 5, tipo_comprobante: 'A', numero: '0003-00000012', fecha: '2026-09-20', total: 300,
      estado: 'aprobada', aprobada: true, monto_aplicado: 300, archivos: [],
    })
    expect(n).toMatch(/^2026-09\/OP-0008_NORTE\/nc__A-0003-00000012\.pdf$/)
  })
})
