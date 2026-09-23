// Facturación electrónica (20260924): la matemática que tiene que dar EXACTO
// lo mismo que la base (`ventas_guardar_borrador`) y lo que va impreso.
import { describe, expect, it } from 'vitest'
import { calcularTotales, conIvaRenglon, netoRenglon } from '@/modules/facturacion/utils/facturacion.calculos'
import { enteroALetras, importeALetras } from '@/modules/facturacion/utils/numeroALetras'
import { jsonQrArca, urlQrArca, URL_QR_ARCA } from '@/modules/facturacion/utils/qrArca'
import { admiteFacturaA, cuitValido } from '@/modules/facturacion/utils/facturacion.utils'
import type { VentasFacturaFJ } from '@/types/domain.types'

describe('totales de la factura (espejo de la base)', () => {
  it('caso del contrato: 3 × 1234,567 al 21 % + 1 × 1000 al 10,5 %', () => {
    const t = calcularTotales([
      { cantidad: '3', precio_unit: '1234.567', alicuota_id: 5 },
      { cantidad: '1', precio_unit: '1000', alicuota_id: 4 },
    ])
    expect(t.netos).toEqual([3703.70, 1000])
    expect(t.neto).toBe(4703.70)
    expect(t.iva).toBe(882.78)
    expect(t.total).toBe(5586.48)
    expect(t.alicuotas).toEqual([
      { alicuota_id: 4, tasa: 0.105, base_imp: 1000, importe: 105 },
      { alicuota_id: 5, tasa: 0.21, base_imp: 3703.70, importe: 777.78 },
    ])
  })

  it('el IVA va por alícuota agrupada, no renglón por renglón', () => {
    // Cada renglón: 0,05 × 21 % = 0,0105 → por renglón redondearía a 0,01 × 3 = 0,03.
    // Agrupado: 0,15 × 21 % = 0,0315 → 0,03. Con 0,07: por renglón 0,01×3; agrupado 0,0441 → 0,04.
    const t = calcularTotales([
      { cantidad: 1, precio_unit: 0.07, alicuota_id: 5 },
      { cantidad: 1, precio_unit: 0.07, alicuota_id: 5 },
      { cantidad: 1, precio_unit: 0.07, alicuota_id: 5 },
    ])
    expect(t.neto).toBe(0.21)
    expect(t.iva).toBe(0.04)
  })

  it('redondea el neto del renglón a centavos con la mitad hacia arriba', () => {
    expect(netoRenglon({ cantidad: '1', precio_unit: '0.005' })).toBe(0.01)
    expect(netoRenglon({ cantidad: '1', precio_unit: '0.004' })).toBe(0)
    expect(netoRenglon({ cantidad: '2.5', precio_unit: '0.333' })).toBe(0.83)   // 0,8325
    expect(netoRenglon({ cantidad: '0.3525', precio_unit: '1000000' })).toBe(352500)
  })

  it('un renglón a medio cargar suma cero y no rompe', () => {
    const t = calcularTotales([
      { cantidad: '', precio_unit: '100', alicuota_id: 5 },
      { cantidad: '2', precio_unit: '', alicuota_id: 5 },
    ])
    expect(t.total).toBe(0)
  })

  it('0 % no suma IVA pero aparece como alícuota', () => {
    const t = calcularTotales([{ cantidad: 1, precio_unit: 500, alicuota_id: 3 }])
    expect(t.iva).toBe(0)
    expect(t.total).toBe(500)
    expect(t.alicuotas).toEqual([{ alicuota_id: 3, tasa: 0, base_imp: 500, importe: 0 }])
  })

  it('subtotal con IVA de muestra por renglón', () => {
    expect(conIvaRenglon(3703.70, 5)).toBe(4481.48)
    expect(conIvaRenglon(1000, 4)).toBe(1105)
  })
})

describe('Son: (importe en letras)', () => {
  it('el ejemplo del modelo de Finnegans', () => {
    expect(importeALetras(2736959.50))
      .toBe('Dos Millones Setecientos Treinta y Seis Mil Novecientos Cincuenta y Nueve Con 50/100')
  })
  it('casos borde del castellano', () => {
    expect(enteroALetras(0)).toBe('Cero')
    expect(enteroALetras(1)).toBe('Uno')
    expect(enteroALetras(100)).toBe('Cien')
    expect(enteroALetras(101)).toBe('Ciento Uno')
    expect(enteroALetras(1000)).toBe('Mil')
    expect(enteroALetras(21000)).toBe('Veintiún Mil')
    expect(enteroALetras(31031)).toBe('Treinta y Un Mil Treinta y Uno')
    expect(enteroALetras(1_000_000)).toBe('Un Millón')
    expect(enteroALetras(21_000_000)).toBe('Veintiún Millones')
    expect(enteroALetras(100_100_100)).toBe('Cien Millones Cien Mil Cien')
    expect(enteroALetras(1_000_000_000)).toBe('Mil Millones')
  })
  it('centavos siempre con dos dígitos', () => {
    expect(importeALetras(5586.48)).toBe('Cinco Mil Quinientos Ochenta y Seis Con 48/100')
    expect(importeALetras(1)).toBe('Uno Con 00/100')
    expect(importeALetras(0.05)).toBe('Cero Con 05/100')
  })
})

describe('QR de ARCA', () => {
  const datos = {
    fecha: '2026-09-24', cuit: '33-71719194-9', ptoVta: 3, tipoCmp: 1, nroCmp: 12,
    importe: 5586.48, tipoDocRec: 80, nroDocRec: '30-50279317-5', codAut: '86380923473688',
  }
  it('arma el JSON con las claves y los tipos de la especificación', () => {
    expect(jsonQrArca(datos)).toBe(
      '{"ver":1,"fecha":"2026-09-24","cuit":33717191949,"ptoVta":3,"tipoCmp":1,"nroCmp":12,' +
      '"importe":5586.48,"moneda":"PES","ctz":1,"tipoDocRec":80,"nroDocRec":30502793175,' +
      '"tipoCodAut":"E","codAut":86380923473688}',
    )
  })
  it('la URL es la de ARCA con el JSON en base64', () => {
    const url = urlQrArca(datos)
    expect(url.startsWith(URL_QR_ARCA)).toBe(true)
    const p = url.slice(URL_QR_ARCA.length)
    expect(Buffer.from(p, 'base64').toString('utf8')).toBe(jsonQrArca(datos))
  })
})

describe('receptor de factura A', () => {
  it('CUIT con dígito verificador', () => {
    expect(cuitValido('33-71719194-9')).toBe(true)
    expect(cuitValido('33717191940')).toBe(false)
    expect(cuitValido('123')).toBe(false)
  })
  it('A solo para RI / monotributo con CUIT', () => {
    expect(admiteFacturaA(80, 1)).toBe(true)
    expect(admiteFacturaA(80, 6)).toBe(true)
    expect(admiteFacturaA(80, 5)).toBe(false)
    expect(admiteFacturaA(96, 1)).toBe(false)
  })
})

describe('PDF de la factura (armado)', async () => {
  const { armarFacturaDoc } = await import('@/modules/facturacion/utils/facturaPdf')
  const base = {
    id: 4, ambiente: 'homo', pto_vta: 3, cbte_tipo: 1, numero: 2, numero_intentado: 2, estado: 'autorizada',
    concepto: 3, fecha_cbte: '2026-09-24', fch_vto_pago: '2026-09-24', cliente_id: 2,
    rec_razon_social: 'CLIENTE PRUEBA', rec_doc_tipo: 80, rec_doc_nro: '30502793175', rec_condicion_iva_id: 1,
    rec_domicilio: 'Calle 1', obra_cod: null, producto: 'AVANCE DE OBRA', centro_costo: 'ARCOR',
    provincia_origen: 'Tucuman', provincia_destino: 'Cordoba', condicion_pago: 'Cc Clientes', remitos: '',
    observaciones: 'OC 1', moneda: 'PES', cotizacion: 1, imp_neto: 4703.7, imp_iva: 882.78, imp_trib: 0,
    imp_op_ex: 0, imp_tot_conc: 0, imp_total: 5586.48, cae: '86380923473688', cae_vto: '2026-10-04',
    resultado: 'A', observaciones_arca: null, errores_arca: null, intento_at: null, intento_n: 1,
    emitida_por: null, emitida_at: '2026-09-24T12:00:00Z', numero_finnegans: null, registrada_at: null,
    registrada_por: null, obs_interna: '', created_at: '', updated_at: '', created_by: null, updated_by: null,
    letra: 'A', tipo_nombre: 'Factura A', cod_cbte: '001', es_nc: false, numero_fmt: '00003-00000002',
    numero_intentado_fmt: '00003-00000002', es_homologacion: true, pendiente_finnegans: true, mes: '2026-09',
    cliente_razon_social: 'CLIENTE PRUEBA', cliente_activo: true, cliente_email: '', obra_nom: null,
    created_by_nombre: null, emitida_por_nombre: null, registrada_por_nombre: null, nc_autorizadas: 0,
    saldo_nc: 5586.48, asociada_id: null, asociada_numero_fmt: null, asociada_cbte_tipo: null,
  } as const
  const fj = {
    factura: { ...base },
    renglones: [{ id: 1, orden: 1, descripcion: 'Avance', cantidad: 3, unidad: 'Unidades', precio_unit: 1234.567, alicuota_id: 5 as const, tasa: 0.21, importe_neto: 3703.7 }],
    alicuotas: [{ alicuota_id: 5 as const, tasa: 0.21, base_imp: 3703.7, importe: 777.78 }],
    asociados: [],
  }
  it('lleva QR de ARCA, CAE y marca de agua en homologación', () => {
    const doc = armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null })
    const json = JSON.stringify(doc.content)
    expect(json).toContain('https://www.afip.gob.ar/fe/qr/?p=')
    expect(json).toContain('86380923473688')
    expect(json).toContain('Cod.:001')
    expect(json).toContain('FACTURA ORIGINAL')
    expect(json).toContain('Cinco Mil Quinientos Ochenta y Seis Con 48/100')
    expect(doc.watermark).toMatchObject({ text: 'HOMOLOGACIÓN — SIN VALIDEZ FISCAL' })
  })
})
