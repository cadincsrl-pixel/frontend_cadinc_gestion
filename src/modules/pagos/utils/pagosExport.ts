/**
 * Excel del módulo Pagos.
 *
 *  - «Facturas»: lo que el contador manda al estudio y lo que el dueño mira
 *    para saber qué se debe. Incluye el centro de costo y las notas de crédito
 *    aplicadas, porque sin eso el saldo no se entiende.
 *  - «Proveedores»: el padrón con sus datos de pago y su saldo.
 *
 * Las filas vienen del endpoint `/export`, que pagina en el server de a 1000
 * con orden estable: nunca se exporta «la página que estoy viendo».
 */
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { EMPRESA } from '@/lib/config/empresa'
import { ESTADO_FACTURA_META, FORMAS_PREVISTAS, comprobanteTxt, formaPagoLabel, hoyAR } from './pagos.utils'
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

export async function exportarFacturasPagos(filas: PagosFactura[]): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn

  const ws = wb.addWorksheet('Facturas')
  const headers = [
    'Proveedor', 'CUIT', 'Tipo y número', 'Emitida', 'Vence', 'Días',
    'Total', 'Neto', 'IVA', 'Percepciones', 'Imputable',
    'Pagado', 'Notas de crédito', 'Saldo',
    'Estado', 'Centro de costo', 'Reparto', 'Forma prevista', 'Descripción', 'Cargó', 'Aprobó', 'Última OP',
  ]
  setColWidths(ws, [28, 14, 20, 12, 12, 8, 14, 13, 12, 13, 14, 14, 15, 14, 14, 22, 34, 16, 34, 18, 18, 12])

  const sinPDF = filas.filter(f => !f.tiene_factura_adj).length
  const vencidas = filas.filter(f => f.vencida).length
  cabecera(ws, 'PAGOS — Facturas de proveedor', [
    `Generado: ${generadoEn.toLocaleDateString('es-AR')}`,
    'Importes finales con IVA',
    'El reparto por obra se hace sobre el total menos las percepciones',
    vencidas > 0 ? `⚠ ${vencidas} vencida(s)` : '',
    sinPDF > 0 ? `${sinPDF} sin PDF adjunto` : '',
  ].filter(Boolean).join('  ·  '), headers.length)
  encabezados(ws, headers)

  let r = 4
  for (const f of filas) {
    const row = ws.getRow(r++)
    row.values = [
      f.proveedor_nom, f.proveedor_cuit ?? '', comprobanteTxt(f.tipo_comprobante, f.numero),
      fecha(f.fecha), fecha(f.vence_el), f.dias_vencida ?? null,
      Number(f.total), f.neto != null ? Number(f.neto) : null, f.iva != null ? Number(f.iva) : null,
      f.percepciones != null ? Number(f.percepciones) : null, Number(f.imputable),
      Number(f.pagado) || null, Number(f.acreditado) || null, Number(f.saldo) || null,
      ESTADO_FACTURA_META[f.estado]?.label ?? f.estado,
      f.centro_costo ?? '', f.centros ?? '',
      FORMAS_PREVISTAS.find(x => x.key === f.forma_pago_prevista)?.label ?? f.forma_pago_prevista,
      f.descripcion, f.created_by_nombre ?? '', f.aprobada_por_nombre ?? '', f.ultima_op ?? '',
    ]
    for (const c of [7, 8, 9, 10, 11, 12, 13, 14]) row.getCell(c).numFmt = FMT_MONEDA
    for (const c of [4, 5]) row.getCell(c).numFmt = FMT_FECHA
    if (f.vencida) row.getCell(5).font = { color: { argb: 'FFC00000' }, bold: true }
    row.getCell(14).font = { bold: true }
    row.eachCell({ includeEmpty: true }, c => {
      c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } }
    })
  }

  const tot = ws.getRow(r)
  const suma = (k: (f: PagosFactura) => number) => filas.reduce((s, f) => s + Number(k(f) ?? 0), 0)
  tot.values = ['TOTAL', '', '', null, null, null,
    suma(f => f.total), null, null, null, suma(f => f.imputable),
    suma(f => f.pagado), suma(f => f.acreditado), suma(f => f.saldo)]
  for (const c of [7, 11, 12, 13, 14]) tot.getCell(c).numFmt = FMT_MONEDA
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
  const headers = ['Razón social', 'CUIT', 'CBU', 'Alias', 'Banco', 'Plazo (días)', 'Facturas', 'Saldo', 'Listo para pagar', 'Último pago', 'Estado', 'Contacto', 'Teléfono', 'Email']
  setColWidths(ws, [30, 14, 26, 20, 18, 12, 10, 14, 16, 13, 12, 20, 16, 24])

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
      p.razon_social, p.cuit ?? '', p.cbu ?? '', p.alias_cbu ?? '', p.banco ?? '',
      p.plazo_pago_dias, p.facturas, Number(p.saldo) || null, Number(p.saldo_aprobado) || null,
      fecha(p.ultimo_pago), p.activo ? 'Activo' : 'Baja', p.contacto ?? '', p.telefono ?? '', p.email ?? '',
    ]
    for (const c of [8, 9]) row.getCell(c).numFmt = FMT_MONEDA
    row.getCell(10).numFmt = FMT_FECHA
    row.getCell(3).font = { name: 'Consolas', size: 10 }
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
    'OP', 'Fecha', 'Proveedor', 'CUIT', 'Forma', 'Referencia',
    'Pagado', 'Notas de crédito', 'Qué cubre', 'Facturas', 'A cuenta',
    'Cheques', '1er cobro', 'Comprobante', 'Estado', 'Registró', 'Anuló', 'Motivo', 'OP Finnegans',
  ]
  setColWidths(ws, [10, 12, 28, 14, 16, 18, 15, 15, 40, 10, 13, 9, 12, 13, 12, 18, 18, 28, 14])
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
      o.numero_fmt, fecha(o.fecha), o.proveedor_nom, o.proveedor_cuit ?? '',
      formaPagoLabel(o.forma_pago), o.referencia,
      Number(o.monto_pagado) || null, Number(o.monto_nc) || null,
      o.facturas ?? '', o.cantidad_facturas || null, Number(o.a_cuenta) || null,
      o.cheques.length || null, o.cheques.length > 0 ? fecha(o.fecha_cobro) : null,
      o.comprobante_requerido ? (o.tiene_comprobante ? 'Sí' : 'FALTA') : '—',
      anulada ? 'Anulada' : 'Emitida',
      o.created_by_nombre ?? '', o.anulado_por_nombre ?? '', o.motivo_anulacion ?? '',
      o.numero_finnegans ?? (anulada ? '' : 'SIN REGISTRAR'),
    ]
    for (const c of [7, 8, 11]) row.getCell(c).numFmt = FMT_MONEDA
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
  tot.values = ['TOTAL', null, `${vigentes.length} orden(es) vigente(s)`, '', '', '',
    suma(o => o.monto_pagado), suma(o => o.monto_nc), '', null, suma(o => o.a_cuenta)]
  for (const c of [7, 8, 11]) tot.getCell(c).numFmt = FMT_MONEDA
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
