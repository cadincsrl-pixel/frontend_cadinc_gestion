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
import { ESTADO_FACTURA_META, FORMAS_PREVISTAS, comprobanteTxt } from './pagos.utils'
import type { PagosFactura, PagosProveedor } from '@/types/domain.types'

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
