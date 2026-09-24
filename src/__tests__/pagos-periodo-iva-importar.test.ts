import { describe, expect, it } from 'vitest'
import { periodoIvaDelArchivo } from '@/modules/pagos/utils/arcaRecibidos'

// Período IVA al importar «Recibidos» (20260928g): el archivo del contador
// viene por período de IVA y trae comprobantes de meses anteriores.
describe('periodoIvaDelArchivo', () => {
  it('el de julio con una factura del 07/06 → julio, 1 anterior', () => {
    expect(periodoIvaDelArchivo(['2026-07-01', '2026-07-15', '2026-06-07', '2026-07-31'])).toEqual({ mes: '2026-07-01', anteriores: 1 })
  })
  it('todo del mismo mes → 0 anteriores', () => {
    expect(periodoIvaDelArchivo(['2026-08-01', '2026-08-20'])).toEqual({ mes: '2026-08-01', anteriores: 0 })
  })
  it('empate → el mes más nuevo', () => {
    expect(periodoIvaDelArchivo(['2026-06-10', '2026-07-10'])).toEqual({ mes: '2026-07-01', anteriores: 1 })
  })
  it('los posteriores al predominante no cuentan como anteriores', () => {
    expect(periodoIvaDelArchivo(['2026-07-01', '2026-07-02', '2026-08-01'])).toEqual({ mes: '2026-07-01', anteriores: 0 })
  })
  it('sin fechas → null', () => {
    expect(periodoIvaDelArchivo([])).toBeNull()
  })
})
