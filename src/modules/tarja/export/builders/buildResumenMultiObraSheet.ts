/**
 * Hoja "Resumen Multi-Obra" del XLSX Comparativa: 1 fila por obra con sus
 * KPIs + fila TOTAL GENERAL al pie con SUM por columna.
 *
 * Permite ver de un vistazo "cuánto pesó cada obra" en el período exportado
 * y cuánto pagó CADINC en total.
 */
import type ExcelJS from 'exceljs'
import {
  applyDataBorders,
  applyHeaderRow,
  applySubtitle,
  applyTitle,
  applyTotalRow,
  colLetter,
  freezeHeader,
  setColWidths,
} from '../helpers/cells'
import { FMT_HORAS, FMT_MONEDA_CERO } from '../helpers/formatters'
import { sumRange } from '../helpers/formulas'
import type { ExportData } from '../types'

const SHEET_NAME = 'Resumen Multi-Obra'
const HEADERS = [
  'Código',
  'Obra',
  'Centro Costo',
  'Horas reg.',
  'Hs extras',
  'Hs totales',
  'Costo operarios',
  'Costo contratistas',
  'Préstamos (+)',
  'Descuentos (−)',
  'Neto',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3
const COL = {
  COD:        1,
  OBRA:       2,
  CC:         3,
  HS_REG:     4,
  HS_EXT:     5,
  HS_TOT:     6,
  COSTO_OP:   7,
  COSTO_CONT: 8,
  OTORGADOS:  9,
  DESCUENTOS: 10,
  NETO:       11,
} as const

export function buildResumenMultiObraSheet(wb: ExcelJS.Workbook, datas: ExportData[]): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [12, 28, 16, 12, 12, 12, 18, 18, 14, 14, 18])

  // ── Fila 1: título ─────────────────────────────────────────────
  applyTitle(ws, `COMPARATIVA MULTI-OBRA — ${datas.length} obra${datas.length !== 1 ? 's' : ''}`, COL_COUNT)

  // ── Fila 2: subtítulo (período común si todos coinciden) ──────
  const periodos = new Set(datas.map(d => d.meta.periodoLabel))
  const periodoCom = periodos.size === 1 ? [...periodos][0]! : 'rangos mixtos'
  applySubtitle(ws, `Período: ${periodoCom}  ·  Generado el ${fmtGeneradoEn(datas[0]!.meta.generadoEn)}`, COL_COUNT)

  // ── Fila 3: header ─────────────────────────────────────────────
  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => { headerRow.getCell(i + 1).value = h })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  // ── Filas 4+: una por obra ────────────────────────────────────
  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const data of datas) {
    const r = ws.getRow(row)

    r.getCell(COL.COD).value = data.meta.obraCod
    r.getCell(COL.COD).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.OBRA).value = data.meta.obraNom
    r.getCell(COL.OBRA).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.CC).value = data.meta.obraCC ?? ''
    r.getCell(COL.CC).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.HS_REG).value  = data.totalesObra.hsRegulares
    r.getCell(COL.HS_REG).numFmt = FMT_HORAS

    r.getCell(COL.HS_EXT).value  = data.totalesObra.hsExtras
    r.getCell(COL.HS_EXT).numFmt = FMT_HORAS

    // Hs totales con fórmula =D<n>+E<n>.
    r.getCell(COL.HS_TOT).value = {
      formula: `${colLetter(COL.HS_REG)}${row}+${colLetter(COL.HS_EXT)}${row}`,
      result:  data.totalesObra.hsTotal,
    }
    r.getCell(COL.HS_TOT).numFmt = FMT_HORAS

    r.getCell(COL.COSTO_OP).value  = data.totalesObra.costoOperarios
    r.getCell(COL.COSTO_OP).numFmt = FMT_MONEDA_CERO

    r.getCell(COL.COSTO_CONT).value  = data.totalesObra.costoContratistas
    r.getCell(COL.COSTO_CONT).numFmt = FMT_MONEDA_CERO

    r.getCell(COL.OTORGADOS).value  = data.totalesObra.prestamosOtorgados
    r.getCell(COL.OTORGADOS).numFmt = FMT_MONEDA_CERO

    r.getCell(COL.DESCUENTOS).value  = data.totalesObra.descuentos
    r.getCell(COL.DESCUENTOS).numFmt = FMT_MONEDA_CERO

    // Neto = costoOp + costoCont + otorgados - descuentos (con fórmula).
    const netoFormula = `${colLetter(COL.COSTO_OP)}${row}+${colLetter(COL.COSTO_CONT)}${row}+${colLetter(COL.OTORGADOS)}${row}-${colLetter(COL.DESCUENTOS)}${row}`
    r.getCell(COL.NETO).value  = { formula: netoFormula, result: data.totalesObra.neto }
    r.getCell(COL.NETO).numFmt = FMT_MONEDA_CERO

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // ── Fila TOTAL GENERAL ─────────────────────────────────────────
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.OBRA).value = 'TOTAL GENERAL'
  totalRow.getCell(COL.OBRA).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  const totalsByCol: Array<{ col: number; fmt: string; result: number }> = [
    { col: COL.HS_REG,     fmt: FMT_HORAS,        result: sumOf(datas, d => d.totalesObra.hsRegulares) },
    { col: COL.HS_EXT,     fmt: FMT_HORAS,        result: sumOf(datas, d => d.totalesObra.hsExtras) },
    { col: COL.HS_TOT,     fmt: FMT_HORAS,        result: sumOf(datas, d => d.totalesObra.hsTotal) },
    { col: COL.COSTO_OP,   fmt: FMT_MONEDA_CERO,  result: sumOf(datas, d => d.totalesObra.costoOperarios) },
    { col: COL.COSTO_CONT, fmt: FMT_MONEDA_CERO,  result: sumOf(datas, d => d.totalesObra.costoContratistas) },
    { col: COL.OTORGADOS,  fmt: FMT_MONEDA_CERO,  result: sumOf(datas, d => d.totalesObra.prestamosOtorgados) },
    { col: COL.DESCUENTOS, fmt: FMT_MONEDA_CERO,  result: sumOf(datas, d => d.totalesObra.descuentos) },
    { col: COL.NETO,       fmt: FMT_MONEDA_CERO,  result: sumOf(datas, d => d.totalesObra.neto) },
  ]
  for (const t of totalsByCol) {
    const letter = colLetter(t.col)
    const range = `${letter}${firstDataRow}:${letter}${lastDataRow}`
    const cell = totalRow.getCell(t.col)
    cell.value  = { formula: sumRange(range), result: t.result }
    cell.numFmt = t.fmt
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  applyTotalRow(ws, row, COL_COUNT)

  freezeHeader(ws, HEADER_ROW)
}

// ── Internals ─────────────────────────────────────────────────────

function sumOf<T>(items: T[], fn: (it: T) => number): number {
  return items.reduce((s, it) => s + fn(it), 0)
}

function fmtGeneradoEn(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
