// Montos de ARCA con vigencia (tanda 6, 20260929e): las reglas reciben el
// valor vigente a la fecha; sin él, las constantes de antes.
import { describe, it, expect } from 'vitest'
import {
  MONTO_MINIMO_FCE, TOPE_CF_IDENTIFICACION, correspondeFce, parametrosRespaldo, requiereIdentificacion,
} from '@/modules/facturacion/utils/facturacion.utils'
import { mensajeCodigoFacturacion } from '@/modules/facturacion/utils/facturacion.errores'

describe('reglas con el monto vigente', () => {
  it('requiereIdentificacion usa el tope pasado; sin tope, la constante', () => {
    expect(requiereIdentificacion('B', 99, 12_000_000)).toBe(true)
    expect(requiereIdentificacion('B', 99, 12_000_000, 15_000_000)).toBe(false)
    expect(requiereIdentificacion('B', 99, 15_000_000, 15_000_000)).toBe(true)
  })

  it('correspondeFce usa el mínimo pasado cuando ARCA no da monto del receptor', () => {
    expect(correspondeFce({ obligado: true, monto_desde: null }, 6_000_000)).toBe(true)
    expect(correspondeFce({ obligado: true, monto_desde: null }, 6_000_000, 6_500_000)).toBe(false)
    // El monto del receptor manda sobre el mínimo general.
    expect(correspondeFce({ obligado: true, monto_desde: 5_000_000 }, 6_000_000, 6_500_000)).toBe(true)
  })

  it('respaldo = los valores de antes', () => {
    expect(parametrosRespaldo('2026-09-25')).toEqual({
      fecha: '2026-09-25', monto_minimo_fce: MONTO_MINIMO_FCE, tope_cf_identificacion: TOPE_CF_IDENTIFICACION,
    })
  })
})

describe('errores de montos de ARCA', () => {
  it('PARAMETRO_RETROACTIVO dice cuántas facturas y desde cuándo', () => {
    const m = mensajeCodigoFacturacion('PARAMETRO_RETROACTIVO', { facturas: 5, vigente_desde: '2026-09-01' })
    expect(m).toContain('5 factura')
    expect(m).toContain('01/09/2026')
  })
  it('PARAMETRO_YA_VIGENTE y PARAMETRO_DUPLICADO', () => {
    expect(mensajeCodigoFacturacion('PARAMETRO_YA_VIGENTE')).toContain('no se borra')
    expect(mensajeCodigoFacturacion('PARAMETRO_DUPLICADO', { vigente_desde: '2026-12-01' })).toContain('01/12/2026')
  })
})
