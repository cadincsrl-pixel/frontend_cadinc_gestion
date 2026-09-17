/**
 * Export XLSX de la cuenta corriente (20260904ap).
 *
 *  - Hoja "Resumen": una fila por obra con los cuatro estados en columnas.
 *    Si el export es de una cuenta completa (solo filtro de obra), suma los
 *    pagos recibidos y el saldo; si hay otros filtros, esas dos columnas no
 *    van porque restar pagos completos a una deuda recortada da saldos falsos.
 *  - Hoja "Detalle": los renglones exportados, con Estado y Motivo.
 */
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { EMPRESA } from '@/lib/config/empresa'
import type { CuentaRenglon, CuentaResumenPagos, CuentaEstado, ResumenObraFila } from '@/types/domain.types'
import { ESTADO_META, MOTIVO_LABEL } from '../components/cuenta-corriente/cuentaCorriente.utils'

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
  rows:          CuentaRenglon[]
  pagos:         CuentaResumenPagos[]
  obraSel?:      string
  obraNom?:      string
  /** Texto que describe los filtros activos ("todos los renglones", "a cobrar · EPP"...). */
  filtroTxt:     string
  /** true si el único filtro es la obra: entonces Resumen lleva pagos y saldo. */
  cuentaCompleta: boolean
}

export async function exportarCuentaCorriente(opts: ExportOpts): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn
  wb.modified = generadoEn

  buildResumen(wb, opts, generadoEn)
  buildDetalle(wb, opts.rows)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `CuentaCorriente_${opts.obraSel ? sanitize(opts.obraNom ?? opts.obraSel) : 'todas-obras'}_${toISO(generadoEn)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Hoja 1: Resumen por obra ──────────────────────────────────────

interface AccObra { a_cobrar: number; cobrado: number; pago_directo: number; gasto_cadinc: number; sin_precio: number; pagos: number }

function buildResumen(wb: ExcelJS.Workbook, { rows, pagos, filtroTxt, cuentaCompleta }: ExportOpts, generadoEn: Date): void {
  const ws = wb.addWorksheet('Resumen')
  const headers = cuentaCompleta
    ? ['Cód obra', 'Obra', 'A cobrar', 'Cobrado', 'Pagos recibidos', 'Saldo', 'Pagó directo', 'Gasto CADINC', 'Sin precio']
    : ['Cód obra', 'Obra', 'A cobrar', 'Cobrado', 'Pagó directo', 'Gasto CADINC', 'Sin precio']
  const NCOLS = headers.length
  setColWidths(ws, [14, 30, ...Array(NCOLS - 2).fill(16)])

  ws.mergeCells(1, 1, 1, NCOLS)
  const t = ws.getCell(1, 1)
  t.value = 'CUENTA CORRIENTE — Materiales por obra'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, NCOLS)
  const s = ws.getCell(2, 1)
  const sinTasar = rows.filter(r => Number(r.precio_unit) === 0).length
  const warn = sinTasar > 0 ? `  ·  ⚠ ${sinTasar} ${sinTasar === 1 ? 'renglón' : 'renglones'} sin precio (a $0)` : ''
  s.value = `Generado: ${fmtFechaCorta(generadoEn)}  ·  Filtro: ${filtroTxt}${warn}  ·  Precios finales, IVA incluido`
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: sinTasar > 0 ? 'FFC05621' : C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }

  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  headerRow.height = 20

  const byObra = new Map<string, AccObra & { nom: string }>()
  for (const r of rows) {
    const acc = byObra.get(r.obra_cod) ?? { nom: r.obra_nom, a_cobrar: 0, cobrado: 0, pago_directo: 0, gasto_cadinc: 0, sin_precio: 0, pagos: 0 }
    acc[r.estado] += Number(r.precio_total ?? 0)
    if (Number(r.precio_unit) === 0) acc.sin_precio++
    byObra.set(r.obra_cod, acc)
  }
  if (cuentaCompleta) {
    for (const p of pagos) {
      const acc = byObra.get(p.obra_cod)
      if (acc) acc.pagos += Number(p.monto)
    }
  }

  let row = 4
  const first = row
  const cods = [...byObra.keys()].sort((a, b) => (byObra.get(a)!.nom).localeCompare(byObra.get(b)!.nom))
  for (const cod of cods) {
    const v = byObra.get(cod)!
    const r = ws.getRow(row)
    const vals: (number | string)[] = cuentaCompleta
      ? [cod, v.nom, v.a_cobrar, v.cobrado, v.pagos, v.a_cobrar + v.cobrado - v.pagos, v.pago_directo, v.gasto_cadinc, v.sin_precio]
      : [cod, v.nom, v.a_cobrar, v.cobrado, v.pago_directo, v.gasto_cadinc, v.sin_precio]
    vals.forEach((val, i) => {
      const cell = r.getCell(i + 1)
      cell.value = val
      if (i >= 2 && i < NCOLS - 1) cell.numFmt = FMT_MONEDA
      if (i === 0) cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'hair', color: { argb: C_GRIS_BORDE } }, bottom: { style: 'hair', color: { argb: C_GRIS_BORDE } }, left: { style: 'hair', color: { argb: C_GRIS_BORDE } }, right: { style: 'hair', color: { argb: C_GRIS_BORDE } } }
    })
    row++
  }
  const last = row - 1

  if (cods.length > 0) {
    const tr = ws.getRow(row)
    tr.getCell(2).value = 'TOTAL GENERAL'
    tr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let col = 3; col <= NCOLS; col++) {
      const letter = String.fromCharCode(64 + col)
      tr.getCell(col).value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: 0 }
      if (col < NCOLS) tr.getCell(col).numFmt = FMT_MONEDA
    }
    for (let c = 1; c <= NCOLS; c++) {
      tr.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } }
      tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
      tr.getCell(c).border = { top: { style: 'double', color: { argb: C_AZUL } }, bottom: { style: 'thin', color: { argb: C_AZUL } } }
    }
    tr.height = 22
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
}

// ── Hoja 2: Detalle ────────────────────────────────────────────────

function buildDetalle(wb: ExcelJS.Workbook, rows: CuentaRenglon[]): void {
  const ws = wb.addWorksheet('Detalle')
  const headers = ['Fecha', 'Cód obra', 'Obra', 'Pedido', 'Material', 'Cant.', 'Unid.', 'Proveedor', 'Origen', 'P. unit.', 'Total', 'Estado', 'Motivo', 'Factura', 'Rubro']
  const NCOLS = headers.length
  setColWidths(ws, [12, 14, 26, 9, 36, 9, 8, 22, 12, 14, 14, 14, 14, 16, 18])

  ws.mergeCells(1, 1, 1, NCOLS)
  const t = ws.getCell(1, 1)
  t.value = 'DETALLE — Cuenta corriente de materiales'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, NCOLS)
  const s = ws.getCell(2, 1)
  s.value = `${rows.length} ${rows.length === 1 ? 'renglón' : 'renglones'}`
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }

  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  headerRow.height = 20

  let row = 4
  const first = row
  for (const r of rows) {
    const tr = ws.getRow(row)
    const fecha = parseISODate(r.fecha_resolucion)
    if (fecha) { tr.getCell(1).value = fecha; tr.getCell(1).numFmt = FMT_FECHA }
    tr.getCell(2).value = r.obra_cod
    tr.getCell(3).value = r.obra_nom
    tr.getCell(4).value = r.solicitud_id
    tr.getCell(5).value = r.descripcion
    tr.getCell(6).value = Number(r.cantidad)
    tr.getCell(7).value = r.unidad
    tr.getCell(8).value = r.proveedor_nom ?? ''
    tr.getCell(9).value = r.origen === 'proveedor' ? 'Proveedor' : 'Depósito'
    tr.getCell(10).value = Number(r.precio_unit ?? 0); tr.getCell(10).numFmt = FMT_MONEDA
    tr.getCell(11).value = Number(r.precio_total ?? 0); tr.getCell(11).numFmt = FMT_MONEDA
    tr.getCell(12).value = ESTADO_META[r.estado as CuentaEstado]?.label ?? r.estado
    tr.getCell(13).value = r.motivo_cadinc ? MOTIVO_LABEL[r.motivo_cadinc] : ''
    tr.getCell(14).value = r.factura_numero ?? ''
    tr.getCell(15).value = r.rubro_nom ?? ''
    row++
  }
  const last = row - 1

  if (rows.length > 0) {
    const tr = ws.getRow(row)
    tr.getCell(10).value = 'TOTAL'
    tr.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' }
    tr.getCell(11).value = { formula: `SUM(K${first}:K${last})`, result: rows.reduce((s, r) => s + Number(r.precio_total ?? 0), 0) }
    tr.getCell(11).numFmt = FMT_MONEDA
    for (let c = 1; c <= NCOLS; c++) {
      tr.getCell(c).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } }
      tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
      tr.getCell(c).border = { top: { style: 'double', color: { argb: C_AZUL } }, bottom: { style: 'thin', color: { argb: C_AZUL } } }
    }
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
  if (last >= first) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: NCOLS } }
}

// ── Helpers ────────────────────────────────────────────────────────

function setColWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}
function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
}
function fmtFechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
}

// ── Resumen de todas las obras (17/09): cuánto debe cada una ─────────
// Una hoja, una fila por obra, las tres patas con su %, total, pagado, notas
// y saldo. En presupuesto cerrado jornales y contratistas van como costo y
// NO suman al total — la misma regla que la pantalla.

export async function exportarResumenObras(filas: ResumenObraFila[], conTarja: boolean): Promise<void> {
  const generadoEn = new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = generadoEn
  wb.modified = generadoEn

  const ws = wb.addWorksheet('Cuánto debe cada obra')
  const headers = ['Centro de costo', 'Cód obra', 'Obra', 'Régimen', 'Jornales', '% jorn.', 'Contratistas', '% contr.', 'Materiales', '% mat.', 'Total', 'Pagado', 'Notas de crédito', 'Saldo', 'Sin precio']
  const NCOLS = headers.length
  setColWidths(ws, [18, 14, 30, 20, 16, 8, 16, 8, 16, 8, 16, 16, 16, 16, 10])

  ws.mergeCells(1, 1, 1, NCOLS)
  const t = ws.getCell(1, 1)
  t.value = 'CUENTA CORRIENTE — Cuánto debe cada obra'
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, NCOLS)
  const s = ws.getCell(2, 1)
  const sinPrecio = filas.reduce((n, f) => n + f.materiales.sin_precio, 0)
  s.value = `Generado: ${fmtFechaCorta(generadoEn)}  ·  Precios finales, IVA incluido`
    + (conTarja ? '' : '  ·  Sin costos de tarja: jornales y contratistas no incluidos')
    + (sinPrecio > 0 ? `  ·  ⚠ ${sinPrecio} renglones sin precio (valen $0 acá)` : '')
    + '  ·  En presupuesto cerrado, jornales y contratistas son costo y no suman al total'
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: sinPrecio > 0 ? 'FFC05621' : C_CARBON } }
  s.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }

  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
  })
  headerRow.height = 20

  const gris = { argb: 'FF888888' }
  // Agrupadas por centro de costo y, adentro, por saldo: así el Excel se lee
  // como la pantalla agrupada, y un subtotal por cliente sale con un filtro.
  const ordenadas = [...filas].sort((a, b) => a.centro_costo.localeCompare(b.centro_costo) || b.saldo - a.saldo)
  let r = 4
  for (const f of ordenadas) {
    const row = ws.getRow(r++)
    const pata = (p: ResumenObraFila['jornales']) => p ? p.facturable : null
    row.values = [
      f.centro_costo, f.obra_cod, f.obra_nom + (f.archivada ? ' (archivada)' : ''),
      f.regimen === 'administracion' ? 'Por administración' : 'Presupuesto cerrado',
      pata(f.jornales), f.jornales?.pct ?? null,
      pata(f.contratistas), f.contratistas?.pct ?? null,
      f.materiales.facturable, f.materiales.pct,
      f.total, f.pagado, f.notas, f.saldo,
      f.materiales.sin_precio || null,
    ]
    for (const col of [5, 7, 9, 11, 12, 13, 14]) row.getCell(col).numFmt = FMT_MONEDA
    for (const col of [6, 8, 10]) row.getCell(col).numFmt = '0"%"'
    // Costo que no se factura: en gris, igual que en pantalla.
    if (f.jornales && !f.jornales.en_cuenta) { row.getCell(5).font = { color: gris }; row.getCell(7).font = { color: gris } }
    row.getCell(14).font = { bold: true, color: f.saldo < 0 ? { argb: 'FFC00000' } : undefined }
    row.eachCell({ includeEmpty: true }, c => { c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } } })
  }

  const totRow = ws.getRow(r)
  const suma = (k: (f: ResumenObraFila) => number) => filas.reduce((s, f) => s + k(f), 0)
  totRow.values = ['', '', 'TOTAL', '', null, null, null, null, null, null, suma(f => f.total), suma(f => f.pagado), suma(f => f.notas), suma(f => f.saldo), suma(f => f.materiales.sin_precio) || null]
  for (const col of [11, 12, 13, 14]) totRow.getCell(col).numFmt = FMT_MONEDA
  totRow.eachCell({ includeEmpty: true }, c => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `CuentaCorriente_resumen-obras_${toISO(generadoEn)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
