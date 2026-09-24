import { describe, expect, it } from 'vitest'
import { leerFilasRecibidos, separadorCsv } from '@/modules/pagos/utils/arcaRecibidos'

// «Mis Comprobantes Recibidos» (20260927c). El layout real de jul–sep todavía
// no llegó: estos casos cubren las dos variantes descriptas en la spec.
// Cuando lleguen los archivos del dueño, sumarlos como fixture.

const CLASICO = [
  ['Comprobantes Recibidos - CUIT 33717191949'],
  ['Fecha', 'Tipo', 'Punto de Venta', 'Número Desde', 'Número Hasta', 'Cód. Autorización', 'Tipo Doc. Emisor', 'Nro. Doc. Emisor',
   'Denominación Emisor', 'Tipo Cambio', 'Moneda', 'Imp. Neto Gravado', 'Imp. Neto No Gravado', 'Imp. Op. Exentas', 'Otros Tributos', 'IVA', 'Imp. Total'],
  ['01/07/2026', '1 - Factura A', 3, 1234, 1234, '76123456789012', 'CUIT', 30714014346, 'NORTE SA', 1, '$', 1000, 0, 0, 30, 210, 1240],
  ['15/07/2026', '3 - Nota de Crédito A', 3, 99, '', '', 'CUIT', '30714014346', 'NORTE SA', 1, '$', -100, 0, 0, 0, -21, -121],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
]

describe('leerFilasRecibidos — formato clásico', () => {
  const r = leerFilasRecibidos(CLASICO, 'julio.xlsx')

  it('encuentra el encabezado aunque haya título', () => {
    expect(r.errores).toEqual([])
    expect(r.formato).toBe('clasico')
    expect(r.filas).toHaveLength(2)
  })

  it('arma la fila como la espera el backend', () => {
    const f = r.filas[0]!
    expect(f).toMatchObject({
      fecha: '2026-07-01', cbte_tipo: 1, pto_vta: 3, numero: 1234, numero_hasta: 1234,
      cod_autorizacion: '76123456789012', emisor_doc_tipo: 80, emisor_doc_nro: '30714014346',
      emisor_razon_social: 'NORTE SA', moneda: 'PES', tipo_cambio: 1,
      neto_gravado: 1000, otros_tributos: 30, iva: 210, total: 1240, alicuotas: null,
    })
    expect(f.filaExcel).toBe(3)
  })

  it('las NC en negativo pasan en valor absoluto (el signo lo pone el tipo)', () => {
    expect(r.filas[1]).toMatchObject({ cbte_tipo: 3, neto_gravado: 100, iva: 21, total: 121 })
  })
})

describe('leerFilasRecibidos — formato nuevo por alícuota', () => {
  const filas = [
    ['Fecha de Emisión', 'Tipo de Comprobante', 'Número de Comprobante', 'Tipo Doc. Emisor', 'Nro. Doc. Emisor', 'Denominación Emisor',
     'Moneda', 'Neto Grav. IVA 21%', 'IVA 21%', 'Neto Grav. IVA 10,5%', 'IVA 10,5%', 'Total Neto Gravado', 'Total IVA', 'Imp. Total'],
    ['2026-09-02', 6, '00003-00001234', 80, '30714014346', 'NORTE SA', 'PES', 1000, 210, 200, 21, 1200, 231, 1431],
  ]
  const r = leerFilasRecibidos(filas, 'sep.csv')

  it('parte punto de venta y número de la misma columna', () => {
    expect(r.errores).toEqual([])
    expect(r.filas[0]).toMatchObject({ pto_vta: 3, numero: 1234, cbte_tipo: 6 })
  })

  it('arma las alícuotas y lee los totales', () => {
    expect(r.formato).toBe('por_alicuota')
    const f = r.filas[0]!
    expect(f.neto_gravado).toBe(1200)
    expect(f.iva).toBe(231)
    expect(f.alicuotas).toEqual(expect.arrayContaining([
      { alicuota_id: 5, base_imp: 1000, importe: 210 },
      { alicuota_id: 4, base_imp: 200, importe: 21 },
    ]))
  })
})

describe('leerFilasRecibidos — archivos equivocados', () => {
  it('reconoce el archivo de EMITIDOS', () => {
    const r = leerFilasRecibidos([['Fecha', 'Tipo', 'Punto de Venta', 'Número Desde', 'Denominación Comprador', 'Imp. Total']], 'x.xlsx')
    expect(r.filas).toEqual([])
    expect(r.errores[0]!.motivo).toMatch(/EMITIDOS/)
  })

  it('sin encabezados avisa y no inventa filas', () => {
    const r = leerFilasRecibidos([['a', 'b'], [1, 2]], 'x.xlsx')
    expect(r.filas).toEqual([])
    expect(r.errores).toHaveLength(1)
  })
})

describe('separadorCsv', () => {
  it('elige ; si la primera línea tiene más ; que ,', () => {
    expect(separadorCsv('Fecha;Tipo;Imp. Total\n01/07/2026;1;1,5')).toBe(';')
    expect(separadorCsv('Fecha,Tipo,Imp. Total\n')).toBe(',')
  })
})

describe('«Comprobantes de Compras» (dice Vendedor, sin columna de otros tributos)', () => {
  const enc = ['Fecha', 'Tipo', 'Punto de Venta', 'Número Desde', 'Número Hasta', 'Tipo Doc. Vendedor', 'Nro. Doc. Vendedor', 'Denominación Vendedor', 'Tipo Cambio', 'Moneda', 'Neto Gravado', 'No Gravado', 'Exento', 'IVA', 'Total']
  it('lee al vendedor y la diferencia con el total va a otros tributos (salvo en C)', () => {
    const r = leerFilasRecibidos([
      ['Comprobantes de Compras - CUIT 33717191949'], enc,
      ['01/07/2026', '1 - Factura A', 123, 10143, null, 'CUIT', 33717354899, 'EMPRESA MAYORISTA', 1, '$', 3171356.69, 0, 0, 665984.9, 3876983.55],
      ['02/07/2026', '11 - Factura C', 1, 523, null, 'CUIT', 30626453593, 'CAMARA TUCUMANA', 1, '$', 0, 0, 0, 0, 145000],
      ['01/07/2026', '1 - Factura A', 2, 45154, null, 'CUIT', 30709370401, 'MINDEO S A', 1, '$', 53195.41, 0, 0, 11171.04, 64366.45],
    ], 'jul.xlsx')
    expect(r.errores).toEqual([])
    expect(r.filas.map(f => f.emisor_doc_nro)).toEqual(['33717354899', '30626453593', '30709370401'])
    expect(r.filas[0]!.emisor_razon_social).toBe('EMPRESA MAYORISTA')
    expect(r.filas[0]!.otros_tributos).toBe(39641.96)
    expect(r.filas[1]!.otros_tributos).toBe(0)
    expect(r.filas[2]!.otros_tributos).toBe(0)
  })
})
