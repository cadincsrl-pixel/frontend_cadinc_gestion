// Ventas › Cobranzas (20260924k…o): la aplicación de comprobantes en centavos,
// el parser del Excel de ARCA («Mis Comprobantes — Emitidos») y el armado del
// recibo y del estado de cuenta.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  aCent, aPagina, aplicarAutomatico, centATexto, conVencido, imputacionesDe, numeroRecibo, sumarDias, validarAplicacion,
} from '@/modules/facturacion/utils/cobranzas.utils'
import {
  codigoDeTipo, docTipoDeCelda, fechaDeCelda, filaParaApi, leerFilasArca, monedaDeCelda, numeroDeCelda, parsearComprobantesArca,
} from '@/modules/facturacion/utils/arcaImport'
import type { VentasCobroDetalle, VentasEstadoCuenta } from '@/types/domain.types'

describe('aplicación de comprobantes (centavos)', () => {
  const pend = [
    { clave: 'f3', saldo: 1000,    vence_el: '2026-09-30', fecha: '2026-08-31', numero: 3 },
    { clave: 'e1', saldo: '250.10', vence_el: '2026-07-15', fecha: '2026-06-15', numero: 1143 },
    { clave: 'f2', saldo: 500,     vence_el: '2026-09-30', fecha: '2026-08-30', numero: 2 },
  ]

  it('«Aplicar automático» va del más viejo al más nuevo, cada uno hasta su saldo', () => {
    expect(aplicarAutomatico(pend, aCent(900))).toEqual({ e1: '250.10', f2: '500.00', f3: '149.90' })
  })

  it('con más plata que deuda cubre todo y el resto queda a cuenta', () => {
    const a = aplicarAutomatico(pend, aCent(2000))
    expect(a).toEqual({ e1: '250.10', f2: '500.00', f3: '1000.00' })
    expect(validarAplicacion(pend, a, aCent(2000)).aCuentaCent).toBe(24990)
  })

  it('sin plata no aplica nada', () => {
    expect(aplicarAutomatico(pend, 0)).toEqual({})
  })

  it('no se cae con los decimales de float (0,1 + 0,2)', () => {
    const p = [{ clave: 'a', saldo: 0.1, vence_el: '2026-01-01', fecha: '2026-01-01', numero: 1 },
               { clave: 'b', saldo: 0.2, vence_el: '2026-01-02', fecha: '2026-01-01', numero: 2 }]
    const a = aplicarAutomatico(p, aCent(0.3))
    const v = validarAplicacion(p, a, aCent(0.3))
    expect(v.aplicadoCent).toBe(30)
    expect(v.aCuentaCent).toBe(0)
    expect(v.superaTotal).toBe(false)
  })

  it('valida en vivo: aplicado > saldo y Σ > total', () => {
    const v = validarAplicacion(pend, { f2: '500.01', f3: '10' }, aCent(400))
    expect(v.errores).toEqual({ f2: 'Supera el saldo' })
    expect(v.superaTotal).toBe(true)
  })

  it('arma las imputaciones que pide la API, solo con importe', () => {
    const filas = [
      { clave: 'f3', factura_id: 3, externo_id: null },
      { clave: 'e1', factura_id: null, externo_id: 1 },
      { clave: 'f2', factura_id: 2, externo_id: null },
    ]
    expect(imputacionesDe(filas, { f3: '149.9', e1: '250.10', f2: '' })).toEqual([
      { factura_id: 3, importe: 149.9 },
      { externo_id: 1, importe: 250.1 },
    ])
  })

  it('formatos: centavos, recibo, días, páginas', () => {
    expect(centATexto(123456)).toBe('1234.56')
    expect(numeroRecibo(12)).toBe('RC 0001-00000012')
    expect(sumarDias('2026-09-24', 30)).toBe('2026-10-24')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(aPagina([1, 2])).toEqual({ rows: [1, 2], total: 2 })
    expect(aPagina({ rows: [1], total: 9 })).toEqual({ rows: [1], total: 9 })
  })

  it('el filtro del aviso de la campana es «tiene algo vencido»', () => {
    expect(conVencido({ vencido: 0 })).toBe(false)
    expect(conVencido({ vencido: 0.004 })).toBe(false)
    expect(conVencido({ vencido: '10.5' as unknown as number })).toBe(true)
  })
})

// ── Parser de ARCA ──────────────────────────────────────────────────────

/** Recorte fiel del Excel real (mismo título, encabezados y tipos de celda), con compradores inventados. */
const RECORTE: unknown[][] = [
  ['Comprobantes de Ventas - CUIT 33717191949'],
  ['Fecha', 'Tipo', 'Punto de Venta', 'Número Desde', 'Número Hasta', 'Tipo Doc. Comprador', 'Nro. Doc. Comprador',
   'Denominación Comprador', 'Tipo Cambio', 'Moneda', 'Neto Gravado', 'No Gravado', 'Exento', 'IVA', 'Total'],
  ['01/07/2026', '1 - Factura A', 2, 1158, null, 'CUIT', 30716052121, 'TRANSPORTE PRUEBA S.A.S.', 1, '$', 1006950, 0, 0, 211459.5, 1218409.5],
  ['03/07/2026', '3 - Nota de Crédito A', 2, 118, null, 'CUIT', 30716052121, 'TRANSPORTE PRUEBA S.A.S.', 1, '$', 1000, 0, 0, 210, 1210],
  ['31/07/2026', '60 - Cuenta de Venta y Líquido Producto A', 10, 4213, null, 'CUIT', 20296846601, 'COMPRADOR  DE  PRUEBA', 1, '$', 7719007.52, 0, 0, 1620991.58, 9339999.1],
  ['12/08/2026', '201 - Factura de Crédito Electrónica MiPyMEs (FCE) A', 1, 7, null, 'CUIT', 30500000002, 'EMPRESA GRANDE SA', 1, '$', 5000000, 0, 0, 1050000, 6050000],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ['15/08/2026', '6 - Factura B', 2, 50, 55, 'DNI', 30111222, 'CONSUMIDOR', 1, '$', 100, 0, 0, 21, 121],
  ['32/08/2026', '6 - Factura B', 2, 56, null, 'DNI', 30111222, 'CONSUMIDOR', 1, '$', 100, 0, 0, 21, 121],
]

describe('parser de «Mis Comprobantes — Emitidos» de ARCA', () => {
  it('celdas sueltas', () => {
    expect(codigoDeTipo('201 - Factura de Crédito Electrónica MiPyMEs (FCE) A')).toBe(201)
    expect(codigoDeTipo('60 - Cuenta de Venta y Líquido Producto A')).toBe(60)
    expect(codigoDeTipo('Factura A')).toBeNull()
    expect(fechaDeCelda('01/07/2026')).toBe('2026-07-01')
    expect(fechaDeCelda('31/02/2026')).toBeNull()
    expect(fechaDeCelda(46204)).toBe('2026-07-01')
    expect(numeroDeCelda('1.218.409,50')).toBe(1218409.5)
    expect(numeroDeCelda('1218409.50')).toBe(1218409.5)
    expect(docTipoDeCelda('CUIT')).toBe(80)
    expect(docTipoDeCelda('96')).toBe(96)
    expect(monedaDeCelda('$')).toBe('PES')
    expect(monedaDeCelda('USD')).toBe('DOL')
  })

  it('lee el recorte: 4 comprobantes, el rango y la fecha mala quedan como error de parseo', () => {
    const r = leerFilasArca(RECORTE, 'recorte.xlsx')
    expect(r.filas).toHaveLength(4)
    expect(r.errores.map(e => e.filaExcel)).toEqual([8, 9])
    expect(r.errores[0]!.motivo).toMatch(/rango/)
    const [fa, nc, cvlp, fce] = r.filas
    expect(filaParaApi(fa!)).toEqual({
      cbte_tipo: 1, pto_vta: 2, numero: 1158, fecha: '2026-07-01', rec_doc_tipo: 80, rec_doc_nro: '30716052121',
      rec_razon_social: 'TRANSPORTE PRUEBA S.A.S.', neto: 1006950, no_gravado: 0, exento: 0, iva: 211459.5,
      total: 1218409.5, moneda: 'PES', tipo_cambio: 1,
    })
    expect(fa!.filaExcel).toBe(3)
    expect(nc!.cbte_tipo).toBe(3)
    expect(cvlp!.pto_vta).toBe(10)
    expect(cvlp!.rec_razon_social).toBe('COMPRADOR DE PRUEBA')
    expect(fce!.cbte_tipo).toBe(201)
  })

  it('lee el archivo binario (xlsx en memoria) por la hoja Sheet1', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['otra cosa']]), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(RECORTE), 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const r = parsearComprobantesArca(buf, 'mem.xlsx')
    expect(r.hoja).toBe('Sheet1')
    expect(r.filas).toHaveLength(4)
  })

  it('un Excel que no es de ARCA avisa en vez de devolver vacío', () => {
    const r = leerFilasArca([['Legajo', 'Nombre'], [1, 'x']], 'otro.xlsx')
    expect(r.filas).toHaveLength(0)
    expect(r.errores[0]!.motivo).toMatch(/encabezados/)
  })

  // Los tres Excel reales del dueño (jul–sep 2026). Solo corre en la máquina
  // que los tiene: no se versionan porque traen datos de clientes.
  const dir = path.join(homedir(), 'CADINC/Notas-CADINC/Adjuntos/ventas-arca')
  const reales = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.xlsx')) : []
  it.skipIf(reales.length === 0)('los Excel reales: 203 comprobantes, sin errores de parseo', () => {
    const filas = reales.flatMap(f => {
      const buf = readFileSync(path.join(dir, f))
      const r = parsearComprobantesArca(new Uint8Array(buf), f)
      expect(r.errores).toEqual([])
      return r.filas
    })
    expect(filas).toHaveLength(203)
    const cuenta = (t: number, pv: number) => filas.filter(x => x.cbte_tipo === t && x.pto_vta === pv).length
    expect(cuenta(1, 2)).toBe(144)
    expect(cuenta(3, 2)).toBe(21)
    expect(cuenta(6, 2)).toBe(4)
    expect(cuenta(8, 2)).toBe(2)
    expect(cuenta(60, 10)).toBe(26)
    expect(cuenta(201, 1)).toBe(6)
    expect(new Set(filas.map(f => f.rec_doc_nro)).size).toBe(28)
    expect(filas.every(f => f.rec_doc_tipo === 80 && f.rec_doc_nro.length === 11 && f.total > 0)).toBe(true)
  })
})

// ── Recibo y estado de cuenta ───────────────────────────────────────────

describe('recibo PDF (armado)', async () => {
  const { armarReciboDoc, nombreArchivoRecibo, detalleMedio } = await import('@/modules/facturacion/utils/reciboPdf')
  const d = {
    cobro: {
      id: 12, ambiente: 'prod', numero: 12, numero_fmt: 'RC 0001-00000012', fecha: '2026-09-24', cliente_id: 5,
      cliente_razon_social: 'ARCOR S.A.I.C.', cliente_doc_nro: '30500120882', total_medios: 900000, total_retenciones: 35000.5,
      total: 935000.5, aplicado: 900000, a_cuenta: 35000.5, estado: 'vigente', anulado_motivo: null, anulado_por: null,
      anulado_por_nombre: null, anulado_el: null, obs: 'Pago OC 4455', es_homologacion: false,
    },
    medios: [
      { id: 1, cobro_id: 12, orden: 1, forma: 'transferencia', importe: 500000, cuenta_bancaria_id: 1, cheque_numero: null,
        cheque_banco: null, cheque_librador: null, cheque_fecha_cobro: null, obs: '', cuenta_banco: 'Banco Macro', cuenta_alias: 'CADINC.MACRO', cuenta_cbu: null },
      { id: 2, cobro_id: 12, orden: 2, forma: 'echeq', importe: 400000, cuenta_bancaria_id: null, cheque_numero: '8812',
        cheque_banco: 'Galicia', cheque_librador: 'ARCOR', cheque_fecha_cobro: '2026-10-24', obs: '' },
    ],
    retenciones: [
      { id: 1, cobro_id: 12, orden: 1, tipo: 'iibb', jurisdiccion: 'Tucumán', certificado_numero: 'R-001', fecha: '2026-09-24',
        importe: 35000.5, adjunto_path: null, adjunto_nombre: null, adjunto_hash: null, adjunto_mime: null, adjunto_size: null, obs: '' },
    ],
    imputaciones: [
      { id: 1, importe: 900000, anulada: false, destino_fmt: 'FA 00004-00000031', destino_fecha: '2026-08-20', destino_vence_el: '2026-09-19', destino_total: 1200000 },
      { id: 2, importe: 5, anulada: true, destino_fmt: 'FA 00004-00000099', destino_fecha: '2026-08-20', destino_vence_el: '2026-09-19', destino_total: 5 },
    ],
  } as unknown as VentasCobroDetalle

  it('RC, cliente, medios, retenciones, aplicados vigentes, a cuenta y total en letras', () => {
    const json = JSON.stringify(armarReciboDoc(d, { logo: null }).content)
    expect(json).toContain('RECIBO')
    expect(json).toContain('RC 0001-00000012')
    expect(json).toContain('ARCOR S.A.I.C.')
    expect(json).toContain('30-50012088-2')
    expect(json).toContain('Novecientos Treinta y Cinco Mil Con 50/100')
    expect(json).toContain('Banco Macro · CADINC.MACRO')
    expect(json).toContain('N° 8812 · Galicia · Librador: ARCOR · Cobro: 24/10/2026')
    expect(json).toContain('IIBB')
    expect(json).toContain('R-001')
    expect(json).toContain('FA 00004-00000031')
    expect(json).not.toContain('FA 00004-00000099')   // imputación anulada: no va
    expect(json).toContain('35.000,50')
    expect(json).toContain('Pago OC 4455')
  })

  it('pie con el sistema de gestión, y sin marca de agua si está vigente', () => {
    const doc = armarReciboDoc(d, { logo: null })
    expect(JSON.stringify((doc.footer as (p: number, t: number) => unknown)(1, 1))).toContain('Emitido por el sistema de gestión de CADINC SRL')
    expect(doc.watermark).toBeUndefined()
  })

  it('anulado: marca de agua, motivo y archivo con prefijo', () => {
    const an = { ...d, cobro: { ...d.cobro, estado: 'anulado', anulado_motivo: 'cheque rechazado', anulado_el: '2026-09-25T15:00:00Z' } } as VentasCobroDetalle
    const doc = armarReciboDoc(an, { logo: null })
    expect(JSON.stringify(doc.watermark)).toContain('ANULADO')
    expect(JSON.stringify(doc.content)).toContain('cheque rechazado')
    expect(nombreArchivoRecibo(an)).toBe('ANULADO_RC_0001-00000012_ARCOR_S_A_I_C.pdf')
    expect(nombreArchivoRecibo(d)).toBe('RC_0001-00000012_ARCOR_S_A_I_C.pdf')
  })

  it('detalle del medio', () => {
    expect(detalleMedio(d.medios[0]!)).toBe('A Banco Macro · CADINC.MACRO')
  })
})

describe('estado de cuenta (PDF y Excel)', async () => {
  const { armarEstadoCuentaDoc, filasExcelEstadoCuenta, saldoFinal } = await import('@/modules/facturacion/utils/estadoCuenta')
  const ec: VentasEstadoCuenta = {
    cliente: null, desde: '2026-08-01', hasta: '2026-09-30',
    movimientos: [
      { orden: 1, fecha: '2026-08-01', movimiento: 'saldo_anterior', comprobante: null, detalle: 'Saldo anterior', vence_el: null, debe: 1000, haber: 0, saldo: 1000, factura_id: null, externo_id: null, cobro_id: null, retencion_id: null },
      { orden: 2, fecha: '2026-08-20', movimiento: 'factura', comprobante: 'FA 00004-00000031', detalle: 'OBRA X', vence_el: '2026-09-19', debe: 1200, haber: 0, saldo: 2200, factura_id: 31, externo_id: null, cobro_id: null, retencion_id: null },
      { orden: 3, fecha: '2026-09-24', movimiento: 'cobro', comprobante: 'RC 0001-00000012', detalle: 'transferencia', vence_el: null, debe: 0, haber: 900, saldo: 1300, factura_id: null, externo_id: null, cobro_id: 12, retencion_id: null },
      { orden: 4, fecha: '2026-09-24', movimiento: 'retencion', comprobante: 'RC 0001-00000012', detalle: 'Retención IIBB', vence_el: null, debe: 0, haber: 35, saldo: 1265, factura_id: null, externo_id: null, cobro_id: 12, retencion_id: 1 },
    ],
  }
  const datos = { ec, razonSocial: 'ARCOR S.A.I.C.', docNro: '30500120882' }

  it('saldo final = el de la última fila (el de la base, sin recalcular)', () => {
    expect(saldoFinal(ec.movimientos)).toBe(1265)
  })

  it('el PDF lleva cliente, período, movimientos y saldo a pagar', () => {
    const json = JSON.stringify(armarEstadoCuentaDoc(datos, { logo: null, hoy: '2026-09-25' }).content)
    expect(json).toContain('ESTADO DE CUENTA')
    expect(json).toContain('del 01/08/2026 al 30/09/2026')
    expect(json).toContain('FA 00004-00000031')
    expect(json).toContain('SALDO A PAGAR')
    expect(json).toContain('1.265,00')
  })

  it('el Excel tiene una fila por movimiento y el saldo final', () => {
    const f = filasExcelEstadoCuenta(datos)
    expect(f[2]).toEqual(['Fecha', 'Movimiento', 'Comprobante', 'Detalle', 'Vence', 'Debe', 'Haber', 'Saldo'])
    expect(f).toHaveLength(3 + 4 + 2)
    expect(f[f.length - 1]![7]).toBe(1265)
  })
})
