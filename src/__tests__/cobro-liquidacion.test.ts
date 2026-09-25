// Ventas › Cobranzas › «Cargar liquidación» y gastos descontados (20260930k):
// renglones del texto del PDF (pdfjs → lineasDeItems), el cuerpo del POST
// /cobros que sale de la propuesta, lo que bloquea la confirmación y el recibo
// con los gastos.
import { describe, expect, it } from 'vitest'
import { lineasDeItems, type ItemTexto } from '@/modules/facturacion/utils/textoPdf'
import {
  aCuentaLiquidacion, bloqueosLiquidacion, cuerpoCobroLiquidacion, edicionInicial, sinonimoSugerido,
} from '@/modules/facturacion/utils/liquidacion'
import { sinonimos } from '@/modules/facturacion/components/configuracion/GastoConceptosCard'
import { mensajeCodigoFacturacion } from '@/modules/facturacion/utils/facturacion.errores'
import { MOVIMIENTO_LABEL } from '@/modules/facturacion/utils/estadoCuenta'
import type { VentasCobroDetalle, VentasLiquidacionPropuesta } from '@/types/domain.types'

const it_ = (str: string, x: number, y: number, width = str.length * 5): ItemTexto => ({ str, transform: [1, 0, 0, 1, x, y], width })

describe('lineasDeItems (texto del PDF en renglones)', () => {
  it('junta por altura, ordena por x y separa los huecos con un espacio', () => {
    const items = [
      it_('240000.00', 400, 100), it_('CH/PROP', 10, 100), it_('14575857', 120, 100.8), it_('ICBC', 200, 99.5),
      it_('Detalle de Pagos', 150, 130), it_('', 0, 50), it_('01/11/2026', 300, 100),
    ]
    expect(lineasDeItems(items)).toEqual(['Detalle de Pagos', 'CH/PROP 14575857 ICBC 01/11/2026 240000.00'])
  })
  it('dos pedazos pegados (sin hueco) no llevan espacio', () => {
    expect(lineasDeItems([it_('Liquida', 10, 10, 35), it_('ción', 45, 10)])).toEqual(['Liquidación'])
  })
})

/** La LIQ 3179 de Casilda como la devuelve el backend. */
const PROP: VentasLiquidacionPropuesta = {
  fuente: 'texto', modelo: null,
  liquidacion: { numero: '3179', fecha: '2026-09-25', emisor_nombre: 'CASILDA COMBUSTIBLES S.R.L.', emisor_cuit: '30715675265', subtotal: 1496791.3, neto: 1484291.3, avisos: [] },
  cliente: { id: 48, razon_social: 'CASILDA COMBUSTIBLES S.R.L.', doc_nro: '30715675265' },
  ya_cargada: null,
  comprobantes: [{
    pto_vta: 10, numero: 255, numero_fmt: '00010-00000255', fecha: '2026-09-11', bruto: 1619133.7, comision: -122342.4, subtotal: 1496791.3,
    destino: { tipo: 'externo', id: 187, comprobante: 'CVLP A 00010-00000255', fecha: '2026-09-11', total: 1496791.3, saldo: 1496791.3 },
    imputar: 1496791.3, avisos: [],
  }],
  gastos: [
    { texto: 'Recupero Ley 25413', codigo: null, comprobante: null, fecha: null, importe: 8500, concepto_id: 1, reconocido_por: 'recupero ley 25413' },
    { texto: 'PAGO SEGURO DE CARGA - 1 VIAJE', codigo: 'PAGO SEGUR', comprobante: '51799', fecha: '2026-09-05', importe: 4000, concepto_id: null, reconocido_por: null },
  ],
  cheques: [
    { tipo: 'CH/PROP', numero: '14575857', banco: 'ICBC', fecha_cobro: '2026-11-01', importe: 700000, propio: true, librador: 'CASILDA COMBUSTIBLES S.R.L.', librador_cuit: '30715675265', avisos: ['EN_CARTERA'], cobro_existente_id: null },
    { tipo: 'CH/PROP', numero: '14575862', banco: 'ICBC', fecha_cobro: '2026-11-08', importe: 784291.3, propio: true, librador: 'CASILDA COMBUSTIBLES S.R.L.', librador_cuit: '30715675265', avisos: [], cobro_existente_id: null },
  ],
  controles: { suma_comprobantes: 1496791.3, suma_deducciones: 12500, suma_cheques: 1484291.3, cierra_subtotal: true, cierra_neto: true, cierra_cheques: true, ok: true },
  total_cobro: 1496791.3, total_imputar: 1496791.3, obs_sugerida: 'Liquidación Casilda N° 3179',
  adjunto: { storage_path: 'cobros/pendientes/a.pdf', nombre_archivo: 'LIQ_3179.pdf', mime: 'application/pdf', size: 1000, hash: 'x'.repeat(64) },
}
const HOY = '2026-09-25'

describe('Cargar liquidación: bloqueos y cuerpo del cobro', () => {
  it('edición inicial: fecha del papel (si no es futura), obs sugerida, conceptos reconocidos', () => {
    const e = edicionInicial(PROP, HOY)
    expect(e).toMatchObject({ fecha: '2026-09-25', obs: 'Liquidación Casilda N° 3179', conceptos: [1, null], aceptaACuenta: false })
    expect(edicionInicial({ ...PROP, liquidacion: { ...PROP.liquidacion, fecha: '2026-12-01' } }, HOY).fecha).toBe(HOY)
  })

  it('falta el concepto del seguro → bloquea; elegido → se puede', () => {
    const e = edicionInicial(PROP, HOY)
    expect(bloqueosLiquidacion(PROP, e, HOY)).toEqual(['Elegí el concepto de un gasto.'])
    expect(bloqueosLiquidacion(PROP, { ...e, conceptos: [1, 2] }, HOY)).toEqual([])
  })

  it('ya cargada, fecha futura, cheque en otro cobro, descuadre y a cuenta sin aceptar', () => {
    const p: VentasLiquidacionPropuesta = {
      ...PROP, ya_cargada: { cobro_id: 90, numero_fmt: 'RC 0001-00000012' },
      cheques: [{ ...PROP.cheques[0]!, avisos: ['YA_EN_OTRO_COBRO'] }, PROP.cheques[1]!],
      controles: { ...PROP.controles, cierra_cheques: false, ok: false }, total_imputar: 1000,
    }
    const b = bloqueosLiquidacion(p, { ...edicionInicial(p, HOY), conceptos: [1, 2], fecha: '2026-09-30' }, HOY)
    expect(b).toHaveLength(5)
    expect(b.join(' ')).toMatch(/ya está cargada.*posterior a hoy.*14575857 ya está en otro cobro.*no cierran.*a cuenta/)
    expect(aCuentaLiquidacion(p)).toBe(1495791.3)
    expect(bloqueosLiquidacion(p, { ...edicionInicial(p, HOY), conceptos: [1, 2], aceptaACuenta: true, aceptaDescuadre: true }, HOY)).toHaveLength(2)
  })

  it('el POST /cobros: cheques con librador y CUIT, gastos con concepto, imputación al CVLP, número y adjuntos', () => {
    const e = { ...edicionInicial(PROP, HOY), conceptos: [1, 2], fecha: '2026-09-24' }
    const b = cuerpoCobroLiquidacion(PROP, e, { ambiente: 'prod', otrosAdjuntos: [{ tipo: 'otro', storage_path: 'cobros/pendientes/c.pdf', nombre_archivo: 'CVLP.pdf' }] })
    expect(b.cobro).toEqual({ fecha: '2026-09-24', cliente_id: 48, obs: 'Liquidación Casilda N° 3179', liquidacion_numero: '3179', ambiente: 'prod' })
    expect(b.medios).toHaveLength(2)
    expect(b.medios[0]).toMatchObject({ forma: 'cheque', importe: 700000, cheque_numero: '14575857', cheque_banco: 'ICBC', cheque_librador: 'CASILDA COMBUSTIBLES S.R.L.', cheque_librador_cuit: '30715675265', cheque_fecha_cobro: '2026-11-01' })
    expect(b.gastos).toEqual([
      { concepto_id: 1, importe: 8500, obs: 'Recupero Ley 25413' },
      { concepto_id: 2, importe: 4000, obs: 'PAGO SEGURO DE CARGA - 1 VIAJE · comp. 51799' },
    ])
    expect(b.imputaciones).toEqual([{ externo_id: 187, importe: 1496791.3 }])
    expect(b.retenciones).toEqual([])
    expect(b.adjuntos?.map(a => a.tipo)).toEqual(['liquidacion', 'otro'])
    // medios + gastos = lo imputado: no queda nada a cuenta.
    const total = b.medios.reduce((s, m) => s + m.importe, 0) + (b.gastos ?? []).reduce((s, g) => s + g.importe, 0)
    expect(Math.round(total * 100)).toBe(Math.round(1496791.3 * 100))
  })

  it('un CVLP ya cobrado (imputar 0) no va en las imputaciones', () => {
    const p = { ...PROP, comprobantes: [{ ...PROP.comprobantes[0]!, imputar: 0, avisos: ['YA_COBRADO' as const] }], total_imputar: 0 }
    expect(cuerpoCobroLiquidacion(p, { ...edicionInicial(p, HOY), conceptos: [1, 2] }).imputaciones).toEqual([])
  })

  it('sinónimos: sugerido y parseo de la lista', () => {
    expect(sinonimoSugerido('PAGO DE PLAYA - GONZÁLEZ JOSÉ')).toBe('pago de playa gonzalez jose')
    expect(sinonimos('pago de playa, playa;  pago de playa \n faltante')).toEqual(['pago de playa', 'playa', 'faltante'])
  })
})

describe('errores y etiquetas nuevas', () => {
  it.each([
    ['GASTO_INVALIDO', { indice: 2, campo: 'concepto_id' }, /concepto.*gasto descontado 2/],
    ['LIQUIDACION_DUPLICADA', { liquidacion_numero: '3179', numero_fmt: 'RC 0001-00000012' }, /3179.*RC 0001-00000012.*anulá/],
    ['LIQUIDACION_SIN_CLIENTE', { cuit: '30715675265' }, /30715675265.*Elegí el cliente/],
    ['LIQUIDACION_ILEGIBLE', { motivo: 'SIN_API_KEY' }, /IA no está configurada/],
    ['GASTO_CONCEPTO_DUPLICADO', { campo: 'alias', alias: ['seguro de carga'] }, /«seguro de carga»/],
    ['MEDIO_INVALIDO', { indice: 1, campo: 'cheque_librador_cuit' }, /CUIT del librador/],
  ])('%s', (code, detail, re) => {
    expect(mensajeCodigoFacturacion(code, detail)).toMatch(re)
  })
  it('estado de cuenta: el gasto tiene etiqueta', () => {
    expect(MOVIMIENTO_LABEL.gasto).toBe('Gasto descontado')
  })
})

describe('recibo PDF con gastos descontados', async () => {
  const { armarReciboDoc, detalleMedio } = await import('@/modules/facturacion/utils/reciboPdf')
  const d = {
    cobro: {
      id: 77, ambiente: 'prod', numero: 77, numero_fmt: 'RC 0001-00000077', fecha: '2026-09-25', cliente_id: 48,
      cliente_razon_social: 'CASILDA COMBUSTIBLES S.R.L.', cliente_doc_nro: '30715675265', total_medios: 1484291.3, total_retenciones: 0,
      total_gastos: 12500, total: 1496791.3, aplicado: 1496791.3, a_cuenta: 0, estado: 'vigente', obs: 'Liquidación Casilda N° 3179',
      es_homologacion: false, liquidacion_numero: '3179',
    },
    medios: [{ id: 1, cobro_id: 77, orden: 1, forma: 'cheque', importe: 1484291.3, cuenta_bancaria_id: null, cheque_numero: '14575857',
      cheque_banco: 'ICBC', cheque_librador: 'CASILDA COMBUSTIBLES S.R.L.', cheque_librador_cuit: '30715675265', cheque_fecha_cobro: '2026-11-01', obs: '' }],
    retenciones: [],
    gastos: [
      { id: 1, cobro_id: 77, orden: 1, concepto_id: 1, concepto_nombre: 'Recupero Ley 25413 (impuesto al cheque)', importe: 8500, obs: 'Recupero Ley 25413' },
      { id: 2, cobro_id: 77, orden: 2, concepto_id: 2, concepto_nombre: 'Seguro de carga', importe: 4000, obs: '' },
    ],
    imputaciones: [{ id: 1, importe: 1496791.3, anulada: false, destino_fmt: 'CVLP A 00010-00000255', destino_fecha: '2026-09-11', destino_total: 1496791.3 }],
  } as unknown as VentasCobroDetalle

  it('sección de gastos, fila en los totales y CUIT del librador', () => {
    const doc = armarReciboDoc(d, { logo: null })
    const json = JSON.stringify(doc.content)
    expect(json).toContain('Gastos descontados por el cliente')
    expect(json).toContain('Recupero Ley 25413 (impuesto al cheque)')
    expect(json).toContain('Seguro de carga')
    expect(json).toContain('Gastos descontados')
    expect(json).toContain('12.500,00')
    expect(json).toContain('Un Millón Cuatrocientos Noventa y Seis Mil Setecientos Noventa y Uno Con 30/100')
    expect(detalleMedio(d.medios[0]!)).toBe('N° 14575857 · ICBC · Librador: CASILDA COMBUSTIBLES S.R.L. (30-71567526-5) · Cobro: 01/11/2026')
  })
})
