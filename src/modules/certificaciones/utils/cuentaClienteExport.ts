/**
 * Export XLSX del tab "Cuenta del cliente" — para mandarle al cliente como
 * rendición de materiales (lo que CADINC adelantó vs lo que pagó directo).
 *
 * Estructura del archivo:
 *  - Hoja "Resumen": 1 fila por obra con Debe / Pagó directo / Total.
 *    Fila de TOTAL GENERAL al pie con `=SUM(...)` por columna.
 *  - Hoja "Detalle": tabla larga con todas las filas (respetando el filtro
 *    de pagador activo). Autofilter habilitado.
 */
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { EMPRESA } from '@/lib/config/empresa'
import type { CuentaClienteRow } from '../hooks/useCuentaCliente'
import type { Obra } from '@/types/domain.types'

const FMT_MONEDA = '"$"#,##0;[Red]"-$"#,##0;"—"'
const FMT_FECHA  = 'dd/mm/yyyy'

const C_AZUL        = 'FF1F3A66'
const C_AZUL_HEADER = 'FF445C82'
const C_AZUL_LIGHT  = 'FFE8F0F8'
const C_GRIS_BORDE  = 'FFCCCCCC'
const C_GRIS_MEDIUM = 'FFE0E0E0'
const C_BLANCO      = 'FFFFFFFF'
const C_CARBON      = 'FF1C1C1E'

interface ExportOpts {
  rows:        CuentaClienteRow[]
  obrasMap:    Map<string, Obra>
  obraFiltro:  string  // '' si "todas las obras"
  pagadorFiltro: 'todos' | 'cadinc' | 'cliente'
}

export async function exportarCuentaCliente(opts: ExportOpts): Promise<void> {
  const { rows, obrasMap, obraFiltro, pagadorFiltro } = opts
  const generadoEn = new Date()

  const wb = new ExcelJS.Workbook()
  wb.creator  = EMPRESA.nombre
  wb.created  = generadoEn
  wb.modified = generadoEn

  buildResumenSheet(wb, rows, obrasMap, generadoEn, pagadorFiltro)
  buildDetalleSheet(wb, rows, obrasMap)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildFilename(obraFiltro, obrasMap, pagadorFiltro, generadoEn)
  a.click()
  URL.revokeObjectURL(url)
}

// ── Hoja 1: Resumen por obra ──────────────────────────────────────

function buildResumenSheet(
  wb: ExcelJS.Workbook,
  rows: CuentaClienteRow[],
  obrasMap: Map<string, Obra>,
  generadoEn: Date,
  pagadorFiltro: 'todos' | 'cadinc' | 'cliente',
): void {
  const ws = wb.addWorksheet('Resumen')
  setColWidths(ws, [12, 30, 18, 18, 18])

  // Título
  ws.mergeCells(1, 1, 1, 5)
  const t = ws.getCell(1, 1)
  t.value = 'CUENTA DEL CLIENTE — Materiales a cuenta'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  // Subtítulo
  ws.mergeCells(2, 1, 2, 5)
  const s = ws.getCell(2, 1)
  const filtroTxt = pagadorFiltro === 'todos' ? 'todos los pagadores'
                  : pagadorFiltro === 'cadinc' ? `solo deuda (${EMPRESA.nombre} adelantó)`
                  : 'solo pagado directo por cliente'
  s.value = `Generado: ${fmtFechaCorta(generadoEn)}  ·  Filtro: ${filtroTxt}`
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }

  // Header
  const headers = ['Cód obra', 'Obra', 'Debe el cliente', 'Pagó directo', 'Total']
  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  headerRow.height = 20

  // Agrupar por obra
  const byObra = new Map<string, { debeCadinc: number; pagoCliente: number }>()
  for (const r of rows) {
    const acc = byObra.get(r.obra_cod) ?? { debeCadinc: 0, pagoCliente: 0 }
    const total = Number(r.precio_total ?? 0)
    if (r.pagado_por === 'cliente') acc.pagoCliente += total
    else                            acc.debeCadinc  += total
    byObra.set(r.obra_cod, acc)
  }

  let row = 4
  const firstDataRow = row
  const obrasOrdenadas = [...byObra.keys()].sort((a, b) => {
    const na = obrasMap.get(a)?.nom ?? a
    const nb = obrasMap.get(b)?.nom ?? b
    return na.localeCompare(nb)
  })
  for (const cod of obrasOrdenadas) {
    const r = ws.getRow(row)
    const nom = obrasMap.get(cod)?.nom ?? cod
    const v = byObra.get(cod)!
    r.getCell(1).value = cod
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(2).value = nom
    r.getCell(3).value = v.debeCadinc
    r.getCell(3).numFmt = FMT_MONEDA
    r.getCell(4).value = v.pagoCliente
    r.getCell(4).numFmt = FMT_MONEDA
    r.getCell(5).value = { formula: `C${row}+D${row}`, result: v.debeCadinc + v.pagoCliente }
    r.getCell(5).numFmt = FMT_MONEDA
    for (let c = 1; c <= 5; c++) {
      r.getCell(c).border = {
        top:    { style: 'hair', color: { argb: C_GRIS_BORDE } },
        bottom: { style: 'hair', color: { argb: C_GRIS_BORDE } },
        left:   { style: 'hair', color: { argb: C_GRIS_BORDE } },
        right:  { style: 'hair', color: { argb: C_GRIS_BORDE } },
      }
    }
    row++
  }
  const lastDataRow = row - 1

  // Fila TOTAL GENERAL
  if (obrasOrdenadas.length > 0) {
    const tr = ws.getRow(row)
    tr.getCell(2).value = 'TOTAL GENERAL'
    tr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (const col of [3, 4, 5]) {
      const letter = ['', 'A', 'B', 'C', 'D', 'E'][col]!
      const range = `${letter}${firstDataRow}:${letter}${lastDataRow}`
      const cell = tr.getCell(col)
      cell.value  = { formula: `SUM(${range})`, result: sumColumn(byObra, col) }
      cell.numFmt = FMT_MONEDA
    }
    for (let c = 1; c <= 5; c++) {
      tr.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } }
      tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
      tr.getCell(c).border = {
        top:    { style: 'double', color: { argb: C_AZUL } },
        bottom: { style: 'thin',   color: { argb: C_AZUL } },
      }
    }
    tr.height = 22
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
}

function sumColumn(byObra: Map<string, { debeCadinc: number; pagoCliente: number }>, col: number): number {
  let total = 0
  for (const v of byObra.values()) {
    if (col === 3) total += v.debeCadinc
    else if (col === 4) total += v.pagoCliente
    else if (col === 5) total += v.debeCadinc + v.pagoCliente
  }
  return total
}

// ── Hoja 2: Detalle ────────────────────────────────────────────────

function buildDetalleSheet(
  wb: ExcelJS.Workbook,
  rows: CuentaClienteRow[],
  obrasMap: Map<string, Obra>,
): void {
  const ws = wb.addWorksheet('Detalle')
  setColWidths(ws, [12, 12, 28, 32, 10, 8, 24, 14, 14, 12, 14, 18])

  // Título + subtítulo
  ws.mergeCells(1, 1, 1, 12)
  const t = ws.getCell(1, 1)
  t.value = 'DETALLE — Materiales a cuenta del cliente'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, 12)
  const s = ws.getCell(2, 1)
  s.value = `${rows.length} fila${rows.length !== 1 ? 's' : ''}`
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }

  // Header
  const headers = [
    'Fecha', 'Cód obra', 'Obra', 'Descripción', 'Cant.', 'Unid.',
    'Proveedor', 'Origen', 'Pagador', 'P. unit.', 'Total', 'Factura',
  ]
  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  headerRow.height = 20

  let row = 4
  const firstDataRow = row
  for (const r of rows) {
    const tr = ws.getRow(row)
    const fecha = parseISODate(r.fecha_resolucion)
    if (fecha) {
      tr.getCell(1).value = fecha
      tr.getCell(1).numFmt = FMT_FECHA
    }
    tr.getCell(2).value = r.obra_cod
    tr.getCell(3).value = obrasMap.get(r.obra_cod)?.nom ?? r.obra_cod
    tr.getCell(4).value = r.descripcion
    tr.getCell(5).value = Number(r.cantidad)
    tr.getCell(6).value = r.unidad
    tr.getCell(7).value = r.proveedores?.nombre ?? ''
    tr.getCell(8).value = r.origen === 'proveedor' ? 'Proveedor' : 'Depósito'
    tr.getCell(9).value = r.pagado_por === 'cliente' ? 'Cliente' : 'CADINC'
    tr.getCell(10).value  = Number(r.precio_unit ?? 0)
    tr.getCell(10).numFmt = FMT_MONEDA
    tr.getCell(11).value  = Number(r.precio_total ?? 0)
    tr.getCell(11).numFmt = FMT_MONEDA
    tr.getCell(12).value = r.facturas_compra?.numero ?? ''
    row++
  }
  const lastDataRow = row - 1

  // Total al pie
  if (rows.length > 0) {
    const tr = ws.getRow(row)
    tr.getCell(10).value = 'TOTAL'
    tr.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' }
    tr.getCell(11).value = { formula: `SUM(K${firstDataRow}:K${lastDataRow})`, result: rows.reduce((s, r) => s + Number(r.precio_total ?? 0), 0) }
    tr.getCell(11).numFmt = FMT_MONEDA
    for (let c = 1; c <= 12; c++) {
      tr.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } }
      tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
      tr.getCell(c).border = {
        top:    { style: 'double', color: { argb: C_AZUL } },
        bottom: { style: 'thin',   color: { argb: C_AZUL } },
      }
    }
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
  if (lastDataRow >= firstDataRow) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: lastDataRow, column: 12 } }
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function setColWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12)
}

function fmtFechaCorta(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
}

function buildFilename(
  obraFiltro: string,
  obrasMap: Map<string, Obra>,
  pagadorFiltro: 'todos' | 'cadinc' | 'cliente',
  generadoEn: Date,
): string {
  const obraSlug = obraFiltro
    ? sanitize(obrasMap.get(obraFiltro)?.nom ?? obraFiltro)
    : 'todas-obras'
  const pagadorSlug = pagadorFiltro === 'todos' ? '' : `_${pagadorFiltro}`
  return `CuentaCliente_${obraSlug}${pagadorSlug}_${toISO(generadoEn)}.xlsx`
}
