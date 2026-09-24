/**
 * Excel del módulo Pagos.
 *
 *  - «Facturas»: lo que el contador manda al estudio y lo que el dueño mira
 *    para saber qué se debe. Incluye el centro de costo y las notas de crédito
 *    aplicadas, porque sin eso el saldo no se entiende.
 *  - «Proveedores»: el padrón con sus datos de pago y su saldo.
 *
 * Las NOTAS DE CRÉDITO (20260925) van en la misma hoja con la columna
 * «Clase» y los importes EN NEGATIVO: el total de la hoja es lo que se debe
 * neto de lo que el proveedor acreditó. Su saldo es 0 (nunca son deuda) y el
 * crédito que les queda va en «Crédito NC».
 *
 * Las filas vienen del endpoint `/export`, que pagina en el server de a 1000
 * con orden estable: nunca se exporta «la página que estoy viendo».
 */
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { EMPRESA } from '@/lib/config/empresa'
import { FORMAS_PREVISTAS, comprobanteTxt, conSigno, esNC, estadoLabel, formaPagoLabel, hoyAR } from './pagos.utils'
import type { PagosFactura, PagosOrdenExport, PagosProveedor } from '@/types/domain.types'

const FMT_MONEDA = '"$"#,##0;[Red]"-$"#,##0;"—"'
const FMT_FECHA  = 'dd/mm/yyyy'

const C_AZUL        = 'FF1F3A66'
const C_AZUL_HEADER = 'FF445C82'
const C_AZUL_LIGHT  = 'FFE8F0F8'
const C_GRIS_BORDE  = 'FFCCCCCC'
const C_GRIS_MEDIUM = 'FFE0E0E0'
const C_BLANCO      = 'FFFFFFFF'
const C_CARBON      = 'FF1C1C1E'

function fecha(s: string | null | undefined): Date | null {
  return s ? new Date(s.slice(0, 10) + 'T12:00:00') : null
}

function setColWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

function cabecera(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, ncols: number) {
  ws.mergeCells(1, 1, 1, ncols)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, ncols)
  const s = ws.getCell(2, 1)
  s.value = subtitulo
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }
}

function encabezados(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  row.height = 20
}

async function descargar(wb: ExcelJS.Workbook, nombre: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

// ── Facturas ──────────────────────────────────────────────────────────

export const HEADERS_FACTURAS = [
  'Proveedor', 'Código proveedor', 'CUIT', 'Tipo y número', 'Clase', 'Concepto', 'Emitida', 'Vence', 'Días',
  'Total', 'Neto', 'IVA', 'Percepciones', 'Imputable',
  'Pagado', 'Notas de crédito', 'Saldo', 'Crédito NC',
  'Estado', 'Cliente / obra', 'Reparto', 'Forma prevista', 'Descripción', 'Cargó', 'Aprobó', 'Última OP',
] as const
/** Columnas (base 1) con plata y con fecha, para el formato. */
const COLS_MONEDA_FACT = [10, 11, 12, 13, 14, 15, 16, 17, 18]
const COLS_FECHA_FACT  = [7, 8]
/** Columna (base 1) por nombre: que el formato no dependa de contar a mano. */
const colFact = (h: (typeof HEADERS_FACTURAS)[number]) => HEADERS_FACTURAS.indexOf(h) + 1

type Celda = string | number | Date | null
const nulo = (v: number | null | undefined, clase: PagosFactura['clase']) =>
  v != null ? conSigno(v, clase) : null

/**
 * Una fila de la hoja «Facturas». Pura, para poder testearla: la NC va con
 * los importes en negativo y sin forma prevista.
 */
export function filaExcelFactura(f: PagosFactura): Celda[] {
  const nc = esNC(f)
  return [
    f.proveedor_nom, f.proveedor_codigo ?? '', f.proveedor_cuit ?? '', comprobanteTxt(f.tipo_comprobante, f.numero),
    nc ? 'Nota de crédito' : 'Factura', f.concepto ?? '',
    fecha(f.fecha), fecha(f.vence_el), nc ? null : (f.dias_vencida ?? null),
    conSigno(f.total, f.clase), nulo(f.neto, f.clase), nulo(f.iva, f.clase),
    nulo(f.percepciones, f.clase), conSigno(f.imputable, f.clase),
    Number(f.pagado) || null, Number(f.acreditado) || null, nc ? null : (Number(f.saldo) || null),
    nc ? (Number(f.nc_disponible) || null) : null,
    estadoLabel(f.estado, f.clase),
    f.centro_costo ?? '', f.centros ?? '',
    nc ? '—' : (FORMAS_PREVISTAS.find(x => x.key === f.forma_pago_prevista)?.label ?? f.forma_pago_prevista),
    f.descripcion, f.created_by_nombre ?? '', f.aprobada_por_nombre ?? '', f.ultima_op ?? '',
  ]
}

/** La fila TOTAL: total e imputable con signo (la NC resta); saldo solo de facturas. */
export function totalesExcelFacturas(filas: PagosFactura[]): Celda[] {
  const suma = (k: (f: PagosFactura) => number) => Math.round(filas.reduce((s, f) => s + (Number(k(f)) || 0), 0) * 100) / 100
  return ['TOTAL', '', '', '', '', '', null, null, null,
    suma(f => conSigno(f.total, f.clase)), null, null, null, suma(f => conSigno(f.imputable, f.clase)),
    suma(f => f.pagado), suma(f => f.acreditado), suma(f => (esNC(f) ? 0 : f.saldo)),
    suma(f => (esNC(f) ? f.nc_disponible : 0))]
}

export async function exportarFacturasPagos(filas: PagosFactura[]): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn

  const ws = wb.addWorksheet('Facturas')
  const headers = [...HEADERS_FACTURAS]
  setColWidths(ws, [28, 12, 14, 20, 15, 22, 12, 12, 8, 14, 13, 12, 13, 14, 14, 15, 14, 14, 16, 22, 34, 16, 34, 18, 18, 12])

  const sinPDF = filas.filter(f => !f.tiene_factura_adj).length
  const vencidas = filas.filter(f => f.vencida).length
  const ncs = filas.filter(esNC).length
  cabecera(ws, 'PAGOS — Facturas de proveedor', [
    `Generado: ${generadoEn.toLocaleDateString('es-AR')}`,
    'Importes finales con IVA',
    ncs > 0 ? `${ncs} nota(s) de crédito, en negativo` : '',
    'El reparto por obra se hace sobre el total menos las percepciones',
    vencidas > 0 ? `⚠ ${vencidas} vencida(s)` : '',
    sinPDF > 0 ? `${sinPDF} sin PDF adjunto` : '',
  ].filter(Boolean).join('  ·  '), headers.length)
  encabezados(ws, headers)

  let r = 4
  for (const f of filas) {
    const row = ws.getRow(r++)
    row.values = filaExcelFactura(f)
    for (const c of COLS_MONEDA_FACT) row.getCell(c).numFmt = FMT_MONEDA
    for (const c of COLS_FECHA_FACT) row.getCell(c).numFmt = FMT_FECHA
    if (f.vencida) row.getCell(colFact('Vence')).font = { color: { argb: 'FFC00000' }, bold: true }
    row.getCell(colFact('Saldo')).font = { bold: true }
    row.eachCell({ includeEmpty: true }, c => {
      c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } }
    })
  }

  const tot = ws.getRow(r)
  tot.values = totalesExcelFacturas(filas)
  for (const h of ['Total', 'Imputable', 'Pagado', 'Notas de crédito', 'Saldo', 'Crédito NC'] as const) tot.getCell(colFact(h)).numFmt = FMT_MONEDA
  tot.eachCell({ includeEmpty: true }, c => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } }

  await descargar(wb, `Pagos_facturas_${toISO(generadoEn)}.xlsx`)
}

// ── Proveedores ───────────────────────────────────────────────────────

export async function exportarProveedoresPagos(filas: PagosProveedor[]): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn

  const ws = wb.addWorksheet('Proveedores')
  const headers = ['Código', 'Razón social', 'CUIT', 'CBU', 'Alias', 'Banco', 'Plazo (días)', 'Facturas', 'Saldo', 'Listo para pagar', 'Último pago', 'Estado', 'Contacto', 'Teléfono', 'Email', 'Crédito NC']
  setColWidths(ws, [11, 30, 14, 26, 20, 18, 12, 10, 14, 16, 13, 12, 20, 16, 24, 14])

  const sinCuit = filas.filter(f => !f.cuit).length
  const sinDatos = filas.filter(f => f.sin_datos_pago).length
  cabecera(ws, 'PAGOS — Padrón de proveedores', [
    `Generado: ${generadoEn.toLocaleDateString('es-AR')}`,
    'Padrón propio del módulo Pagos (distinto del de Compras)',
    sinCuit > 0 ? `${sinCuit} sin CUIT` : '',
    sinDatos > 0 ? `${sinDatos} sin datos de pago` : '',
  ].filter(Boolean).join('  ·  '), headers.length)
  encabezados(ws, headers)

  let r = 4
  for (const p of filas) {
    const row = ws.getRow(r++)
    row.values = [
      p.codigo ?? '', p.razon_social, p.cuit ?? '', p.cbu ?? '', p.alias_cbu ?? '', p.banco ?? '',
      p.plazo_pago_dias, p.facturas, Number(p.saldo) || null, Number(p.saldo_aprobado) || null,
      fecha(p.ultimo_pago), p.activo ? 'Activo' : 'Baja', p.contacto ?? '', p.telefono ?? '', p.email ?? '',
      Number(p.nc_disponible ?? 0) || null,
    ]
    for (const c of [9, 10, 16]) row.getCell(c).numFmt = FMT_MONEDA
    row.getCell(11).numFmt = FMT_FECHA
    row.getCell(4).font = { name: 'Consolas', size: 10 }
    if (!p.activo) row.eachCell({ includeEmpty: true }, c => { c.font = { ...(c.font ?? {}), color: { argb: 'FF888888' } } })
    row.eachCell({ includeEmpty: true }, c => {
      c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } }
    })
  }
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } }

  await descargar(wb, `Pagos_proveedores_${toISO(generadoEn)}.xlsx`)
}

// ── Órdenes de pago ───────────────────────────────────────────────────

/**
 * El Excel de lo PAGADO (2026-09-21).
 *
 * Pedido del dueño: «estaría bueno poder extraer un resumen Excel según lo
 * filtrado». El de facturas ya existía; el tab de órdenes no tenía ninguno,
 * así que no había forma de sacar qué se pagó, con qué y qué cheques salieron.
 *
 * Dos hojas, porque son dos preguntas distintas y meterlas en una sola tabla
 * obliga a repetir la orden en cada cheque:
 *   · «Órdenes» — una fila por OP: a quién, cuánto, con qué forma, qué cubre.
 *   · «Cheques» — una fila por cheque, ordenada POR FECHA DE COBRO, que es la
 *     pregunta real: qué cae esta semana y cuánto hay todavía en cartera.
 *
 * Las anuladas se exportan igual, marcadas: una OP que se anuló es parte de la
 * historia y el contador la va a ver en el banco.
 */
export async function exportarOrdenesPagos(filas: PagosOrdenExport[]): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn

  const vigentes = filas.filter(o => o.estado !== 'anulada')
  const anuladas = filas.length - vigentes.length
  const sinComp  = vigentes.filter(o => o.comprobante_requerido && !o.tiene_comprobante).length

  // ── Hoja 1: las órdenes ──
  const ws = wb.addWorksheet('Órdenes')
  const headers = [
    'OP', 'Fecha', 'Proveedor', 'Código proveedor', 'CUIT', 'Forma', 'Referencia',
    'Pagado', 'Qué cubre', 'Facturas', 'A cuenta',
    'Cheques', '1er cobro', 'Comprobante', 'Estado', 'Registró', 'Anuló', 'Motivo',
  ]
  setColWidths(ws, [10, 12, 28, 12, 14, 16, 18, 15, 40, 10, 13, 9, 12, 13, 12, 18, 18, 28])
  cabecera(ws, 'PAGOS — Órdenes de pago', [
    `Generado: ${generadoEn.toLocaleDateString('es-AR')}`,
    'Los totales cuentan solo las órdenes vigentes',
    anuladas > 0 ? `${anuladas} anulada(s), marcadas y sin sumar` : '',
    sinComp > 0 ? `⚠ ${sinComp} sin comprobante` : '',
  ].filter(Boolean).join('  ·  '), headers.length)
  encabezados(ws, headers)

  let r = 4
  for (const o of filas) {
    const anulada = o.estado === 'anulada'
    const row = ws.getRow(r++)
    row.values = [
      o.numero_fmt, fecha(o.fecha), o.proveedor_nom, o.proveedor_codigo ?? '', o.proveedor_cuit ?? '',
      formaPagoLabel(o.forma_pago), o.referencia,
      Number(o.monto_pagado) || null,
      o.facturas ?? '', o.cantidad_facturas || null, Number(o.a_cuenta) || null,
      o.cheques.length || null, o.cheques.length > 0 ? fecha(o.fecha_cobro) : null,
      o.comprobante_requerido ? (o.tiene_comprobante ? 'Sí' : 'FALTA') : '—',
      anulada ? 'Anulada' : 'Emitida',
      o.created_by_nombre ?? '', o.anulado_por_nombre ?? '', o.motivo_anulacion ?? '',
    ]
    for (const c of [8, 11]) row.getCell(c).numFmt = FMT_MONEDA
    for (const c of [2, 13]) row.getCell(c).numFmt = FMT_FECHA
    if (anulada) row.eachCell({ includeEmpty: true }, c => { c.font = { strike: true, color: { argb: 'FF999999' } } })
    if (!anulada && o.comprobante_requerido && !o.tiene_comprobante) {
      row.getCell(14).font = { color: { argb: 'FFC00000' }, bold: true }
    }
    row.eachCell({ includeEmpty: true }, c => {
      c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } }
    })
  }
  const tot = ws.getRow(r)
  const suma = (k: (o: PagosOrdenExport) => number) => vigentes.reduce((s, o) => s + Number(k(o) ?? 0), 0)
  tot.values = ['TOTAL', null, `${vigentes.length} orden(es) vigente(s)`, '', '', '', '',
    suma(o => o.monto_pagado), '', null, suma(o => o.a_cuenta)]
  for (const c of [8, 11]) tot.getCell(c).numFmt = FMT_MONEDA
  tot.eachCell({ includeEmpty: true }, c => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } }

  // ── Hoja 2: los cheques, por fecha de cobro ──
  const chs = filas.flatMap(o => o.cheques.map(c => ({ o, c })))
  if (chs.length > 0) {
    chs.sort((a, b) => a.c.fecha_cobro.localeCompare(b.c.fecha_cobro))
    const wc = wb.addWorksheet('Cheques')
    const hc = ['Cobro', 'Número', 'Banco', 'Importe', 'Propio / endosado', 'Librador', 'Proveedor', 'OP', 'Fecha OP', 'Estado OP']
    setColWidths(wc, [12, 16, 20, 15, 18, 26, 28, 10, 12, 12])
    const hoy = hoyAR()
    const enCartera = chs.filter(x => x.o.estado !== 'anulada' && x.c.fecha_cobro > hoy)
    cabecera(wc, 'PAGOS — Cheques entregados', [
      'Ordenados por fecha de cobro',
      `En cartera (todavía no se cobraron): ${enCartera.length}`,
      'Los de órdenes anuladas van tachados y no suman',
    ].join('  ·  '), hc.length)
    encabezados(wc, hc)

    let rc = 4
    for (const { o, c } of chs) {
      const anulada = o.estado === 'anulada'
      const row = wc.getRow(rc++)
      row.values = [
        fecha(c.fecha_cobro), c.numero, c.banco, Number(c.monto),
        c.es_propio ? 'Propio' : 'Endosado', c.es_propio ? '' : c.librador,
        o.proveedor_nom, o.numero_fmt, fecha(o.fecha), anulada ? 'Anulada' : 'Emitida',
      ]
      row.getCell(4).numFmt = FMT_MONEDA
      for (const k of [1, 9]) row.getCell(k).numFmt = FMT_FECHA
      if (anulada) row.eachCell({ includeEmpty: true }, x => { x.font = { strike: true, color: { argb: 'FF999999' } } })
      else if (c.fecha_cobro > hoy) row.getCell(1).font = { bold: true, color: { argb: 'FF1F6FB2' } }
      row.eachCell({ includeEmpty: true }, x => {
        x.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } }
      })
    }
    const tc = wc.getRow(rc)
    tc.values = ['TOTAL', `${chs.filter(x => x.o.estado !== 'anulada').length} cheque(s)`, '',
      chs.filter(x => x.o.estado !== 'anulada').reduce((s, x) => s + Number(x.c.monto), 0)]
    tc.getCell(4).numFmt = FMT_MONEDA
    tc.eachCell({ includeEmpty: true }, x => {
      x.font = { bold: true }
      x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
    })
    wc.views = [{ state: 'frozen', ySplit: 3 }]
    wc.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: hc.length } }
  }

  await descargar(wb, `Pagos_ordenes_${toISO(generadoEn)}.xlsx`)
}
