// Facturación electrónica (20260924): la matemática que tiene que dar EXACTO
// lo mismo que la base (`ventas_guardar_borrador`) y lo que va impreso.
import { describe, expect, it } from 'vitest'
import { calcularTotales, conIvaRenglon, netoRenglon, precioConIva } from '@/modules/facturacion/utils/facturacion.calculos'
import { enteroALetras, importeALetras } from '@/modules/facturacion/utils/numeroALetras'
import { jsonQrArca, urlQrArca, URL_QR_ARCA } from '@/modules/facturacion/utils/qrArca'
import {
  TOPE_CF_IDENTIFICACION, admiteFacturaA, cuitValido, letraDeCliente, letraDeTipo, muestraDescripcion, requiereIdentificacion,
  tipoPara,
} from '@/modules/facturacion/utils/facturacion.utils'
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
  const { armarFacturaDoc, nombreArchivoFactura, LEYENDA_FCE, MARGEN_PIE } = await import('@/modules/facturacion/utils/facturaPdf')
  const { normalizarDescripcion } = await import('@/modules/facturacion/utils/facturacion.utils')
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
  /** Todo lo que imprime: cuerpo + pie de la ÚLTIMA página (ahí va el cierre). */
  const todo = (doc: ReturnType<typeof armarFacturaDoc>, pag = 1, total = 1) =>
    JSON.stringify(doc.content) + JSON.stringify((doc.footer as (p: number, t: number) => unknown)(pag, total))

  it('lleva QR de ARCA, CAE y marca de agua en homologación', () => {
    const doc = armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null })
    const json = todo(doc)
    expect(json).toContain('https://www.afip.gob.ar/fe/qr/?p=')
    expect(json).toContain('86380923473688')
    expect(json).toContain('Cód. 001')
    expect(json).toContain('FACTURA')
    expect(json).toContain('ORIGINAL')
    expect(json).toContain('Cinco Mil Quinientos Ochenta y Seis Con 48/100')
    expect(doc.watermark).toMatchObject({ text: 'HOMOLOGACIÓN — SIN VALIDEZ FISCAL' })
  })

  it('factura B: precio y subtotal con IVA, sin IVA por alícuota, IVA contenido (Ley 27.743) y QR con doc 99 → 0', () => {
    const fb = {
      ...fj,
      factura: {
        ...base, cbte_tipo: 6, letra: 'B', tipo_nombre: 'Factura B', cod_cbte: '006',
        rec_doc_tipo: 99, rec_doc_nro: '0', rec_condicion_iva_id: 5, rec_razon_social: 'CONSUMIDOR FINAL',
      },
    }
    const doc = armarFacturaDoc(fb as unknown as VentasFacturaFJ, { logo: null })
    const json = todo(doc)
    expect(json).toContain('Cód. 006')
    expect(json).toContain('"text":"B"')
    expect(json).toContain('Sin identificar')
    // 1234,567 × 1,21 = 1493,82607 → 1.493,83; subtotal 3703,70 + 777,78 = 4.481,48
    expect(json).toContain('1.493,83')
    expect(json).toContain('4.481,48')
    expect(json).not.toContain('Subtotal c/IVA')
    expect(json).not.toContain('IVA 21 %')
    expect(json).toContain('IVA Contenido: $ 882,78')
    expect(json).toContain('Otros Impuestos Nacionales Indirectos: $ 0,00')
    const qr = json.match(/p=([A-Za-z0-9+/=]+)/)?.[1]
    const datos = JSON.parse(atob(qr!))
    expect(datos).toMatchObject({ tipoCmp: 6, tipoDocRec: 99, nroDocRec: 0 })
  })

  it('factura A no lleva la leyenda de transparencia fiscal', () => {
    const json = todo(armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null }))
    expect(json).not.toContain('IVA Contenido')
    expect(json).toContain('Subtotal c/IVA')
    expect(json).toContain('IVA 21 %')
  })

  it('el cierre va SOLO en el pie de la última página: con 2 páginas, la 1 no tiene totales', () => {
    const doc = armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null })
    const pie = doc.footer as (p: number, t: number) => unknown
    const p1 = JSON.stringify(pie(1, 2))
    const p2 = JSON.stringify(pie(2, 2))
    expect(p1).not.toContain('TOTAL')
    expect(p1).not.toContain('5.586,48')
    expect(p1).toContain('Continúa en la página siguiente')
    expect(p1).toContain('Pág. 1/2')
    expect(p2).toContain('TOTAL')
    expect(p2).toContain('$ 5.586,48')
    expect(p2).toContain('Son: ')
    expect(p2).toContain('86380923473688')
    expect(p2).toContain('Pág. 2/2')
    // El total NO está en el cuerpo: vive en el pie.
    expect(JSON.stringify(doc.content)).not.toContain('$ 5.586,48')
    expect(doc.pageMargins).toEqual([28, 28, 28, MARGEN_PIE])
  })

  it('sin domicilio no imprime la fila (ni "—")', () => {
    const sinDom = { ...fj, factura: { ...base, rec_domicilio: '' } }
    const json = JSON.stringify(armarFacturaDoc(sinDom as unknown as VentasFacturaFJ, { logo: null }).content)
    expect(json).not.toContain('Domicilio:')
    expect(JSON.stringify(armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null }).content)).toContain('Domicilio:')
  })

  it('borrador: marca de agua, "Borrador #id", sin QR ni CAE y archivo BORRADOR_', () => {
    const borr = {
      ...fj,
      factura: { ...base, estado: 'borrador', numero: null, numero_fmt: null, numero_intentado: null, numero_intentado_fmt: null, cae: null, cae_vto: null, es_homologacion: false, ambiente: 'prod' },
    } as unknown as VentasFacturaFJ
    const doc = armarFacturaDoc(borr, { logo: null })
    const json = todo(doc)
    expect(doc.watermark).toMatchObject({ text: 'BORRADOR — SIN VALIDEZ FISCAL' })
    expect(json).toContain('Borrador #4')
    expect(json).toContain('Sin CAE — comprobante no emitido')
    expect(json).not.toContain('"qr"')
    expect(json).not.toContain('afip.gob.ar/fe/qr')
    expect(json).not.toContain('CAE N°')
    expect(nombreArchivoFactura(borr)).toMatch(/^BORRADOR_FA_4_CLIENTE_PRUEBA\.pdf$/)
    // En homologación también se nota.
    const bh = armarFacturaDoc({ ...borr, factura: { ...borr.factura, es_homologacion: true } } as VentasFacturaFJ, { logo: null })
    expect(bh.watermark).toMatchObject({ text: 'BORRADOR — HOMOLOGACIÓN — SIN VALIDEZ FISCAL' })
  })

  it('FCE 201: título, recuadro con vto de pago, CBU/alias, referencia, transferencia y leyenda roja', () => {
    const fce = {
      ...fj,
      factura: {
        ...base, cbte_tipo: 201, cod_cbte: '201', es_fce: true, fch_vto_pago: '2026-10-24',
        fce_cbu: '0070397820000000473657', fce_alias: 'CADINC.GALICIA', fce_transmision: 'SCA', fce_referencia: '4500278113',
      },
    }
    const json = todo(armarFacturaDoc(fce as unknown as VentasFacturaFJ, { logo: null }))
    expect(json).toContain('FACTURA DE CRÉDITO ELECTRÓNICA MiPyMEs (FCE)')
    expect(json).toContain('Cód. 201')
    expect(json).toContain('Fecha de Vto. para el pago:')
    expect(json).toContain('24/10/2026')
    expect(json).toContain('0070397820000000473657')
    expect(json).toContain('CADINC.GALICIA')
    expect(json).toContain('Referencia Comercial:')
    expect(json).toContain('Sistema de Circulacion Abierta')
    expect(json).toContain(LEYENDA_FCE.slice(0, 60))
    const qr = json.match(/p=([A-Za-z0-9+/=]+)/)?.[1]
    expect(JSON.parse(atob(qr!))).toMatchObject({ tipoCmp: 201 })
  })

  it('NC FCE 203: título y comprobante asociado, sin CBU', () => {
    const nc = {
      ...fj,
      factura: { ...base, cbte_tipo: 203, cod_cbte: '203', es_nc: true, es_fce: true, nc_anulacion: 'N' },
      asociados: [{ asociada_id: 9, cbte_tipo: 201, pto_vta: 3, numero: 1, cuit: '33717191949', fecha_cbte: '2026-09-11' }],
    }
    const json = todo(armarFacturaDoc(nc as unknown as VentasFacturaFJ, { logo: null }))
    expect(json).toContain('NOTA DE CRÉDITO ELECTRÓNICA MiPyMEs (FCE)')
    expect(json).toContain('FCE A 00003-00000001 del 11/09/2026')
    expect(json).not.toContain('CBU del Emisor')
  })

  it('descripción: junta las palabras huérfanas, respeta párrafos, mayúsculas y viñetas', () => {
    expect(normalizarDescripcion('Avance de obra correspondiente a\nla\nobra de\nARCOR Arroyito'))
      .toBe('Avance de obra correspondiente a la obra de\nARCOR Arroyito')
    expect(normalizarDescripcion('Certificado 5\n\n\n- Mano de obra\n- Materiales\n'))
      .toBe('Certificado 5\n\n- Mano de obra\n- Materiales')
    expect(normalizarDescripcion('Línea uno\r\nlínea dos\nTres')).toBe('Línea uno línea dos\nTres')
    const doc = armarFacturaDoc({ ...fj, renglones: [{ ...fj.renglones[0], descripcion: 'Trabajos de\nla\nobra' }] } as unknown as VentasFacturaFJ, { logo: null })
    expect(JSON.stringify(doc.content)).toContain('Trabajos de la obra')
  })
})

describe('letra B (fase 5): mismas reglas que la base y el backend', () => {
  it('la letra sale del cliente', () => {
    expect(letraDeCliente(80, 1)).toBe('A')
    expect(letraDeCliente(80, 6)).toBe('A')
    expect(letraDeCliente(80, 4)).toBe('B')
    expect(letraDeCliente(96, 5)).toBe('B')
    expect(letraDeCliente(99, 5)).toBe('B')
    for (const c of [7, 8, 9, 10, 15]) expect(letraDeCliente(80, c)).toBe('B')
    expect(letraDeCliente(96, 1)).toBeNull()   // RI sin CUIT: ni A ni B
    expect(letraDeCliente(99, 6)).toBeNull()
  })

  it('tipo por letra; letra por tipo', () => {
    expect([tipoPara('A', false), tipoPara('A', true), tipoPara('B', false), tipoPara('B', true)]).toEqual([1, 3, 6, 8])
    expect([letraDeTipo(1), letraDeTipo(3), letraDeTipo(6), letraDeTipo(8)]).toEqual(['A', 'A', 'B', 'B'])
  })

  it('consumidor final sin identificar: desde $ 10.000.000 inclusive (RG 5700/2025)', () => {
    expect(TOPE_CF_IDENTIFICACION).toBe(10_000_000)
    expect(requiereIdentificacion('B', 99, 9_999_999.99)).toBe(false)
    expect(requiereIdentificacion('B', 99, 10_000_000)).toBe(true)
    expect(requiereIdentificacion('B', 96, 20_000_000)).toBe(false)
    expect(requiereIdentificacion('A', 99, 20_000_000)).toBe(false)
  })

  it('precio con IVA del renglón (solo para mostrar en la B)', () => {
    expect(precioConIva(1234.567, 5)).toBe(1493.83)
    expect(precioConIva('1000', 4)).toBe(1105)
    expect(precioConIva(100, 3)).toBe(100)
    expect(precioConIva(0.005, 5)).toBe(0.01)
  })

  it('QR: consumidor final sin identificar va con nroDocRec 0', () => {
    const j = JSON.parse(jsonQrArca({
      fecha: '2026-09-23', cuit: '33717191949', ptoVta: 3, tipoCmp: 6, nroCmp: 2, importe: 6050.61,
      tipoDocRec: 99, nroDocRec: '', codAut: '86380923718275',
    }))
    expect(j.nroDocRec).toBe(0)
    expect(j.tipoDocRec).toBe(99)
  })
})

describe('bandeja de Finnegans: chip de la descripción', () => {
  it('primer renglón truncado y +N por los demás', () => {
    expect(muestraDescripcion(['Flete'])).toBe('Flete')
    expect(muestraDescripcion(['Flete', 'Espera', 'Peaje'])).toBe('Flete +2')
    expect(muestraDescripcion(['Certificado N° 5  —\n avance de obra septiembre 2026 en la obra de calle Maipú'], 32))
      .toBe('Certificado N° 5 — avance de ob…')   // 31 caracteres + «…»
    expect(muestraDescripcion([])).toBe('')
  })
})

describe('FCE MiPyME (fase 6): espejo del backend', async () => {
  const u = await import('@/modules/facturacion/utils/facturacion.utils')
  it('tipo 201/203 con letra A', () => {
    expect(u.tipoPara('A', false, true)).toBe(201)
    expect(u.tipoPara('A', true, true)).toBe(203)
    expect(u.tipoPara('A', false)).toBe(1)
    expect(u.esTipoFce(203)).toBe(true)
    expect(u.esTipoNc(203)).toBe(true)
  })
  it('¿corresponde FCE? obligado y total ≥ monto; sin dato no bloquea', () => {
    expect(u.correspondeFce({ obligado: true, monto_desde: 5_549_862 }, 5_549_862)).toBe(true)
    expect(u.correspondeFce({ obligado: true, monto_desde: 5_549_862 }, 5_549_861.99)).toBe(false)
    expect(u.correspondeFce({ obligado: false, monto_desde: null }, 1e9)).toBe(false)
    expect(u.correspondeFce({ obligado: null, monto_desde: null }, 1e9)).toBeNull()
    expect(u.correspondeFce(undefined, 1e9)).toBeNull()
    expect(u.MONTO_MINIMO_FCE).toBe(5_549_862)
  })
  it('CBU con dígitos verificadores', () => {
    expect(u.cbuValido('0070397820000000473657')).toBe(true)
    expect(u.cbuValido('2850140230094250465501')).toBe(true)
    expect(u.cbuValido('0070397820000000473658')).toBe(false)
    expect(u.cbuValido('123')).toBe(false)
  })
  it('los tipos FCE tienen nombre corto para la bandeja', () => {
    expect(u.cortoTipo(201)).toBe('FCE A')
    expect(u.cortoTipo(203)).toBe('NC FCE A')
  })
})
