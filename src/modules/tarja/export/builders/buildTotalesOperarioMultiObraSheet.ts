/**
 * Hoja "Totales por Operario" consolidada multi-obra: 1 fila por (obra, leg).
 *
 * Útil para:
 *   - Detectar operarios que tarjaron en más de una obra en el período.
 *   - Sumar el pago total que recibió un operario combinando obras.
 *   - Tener todos los totales individuales en una sola vista filtrable.
 *
 * Las filas se ordenan por nombre del operario → obra. Si filtrás por
 * nombre en Excel, ves todas las obras donde trabajó esa persona seguidas.
 */
import type ExcelJS from 'exceljs'
import {
  addAutofilter,
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

const SHEET_NAME = 'Totales por Operario'
const HEADERS = [
  'Legajo',
  'Nombre',
  'Obra',
  'Cód obra',
  'Categoría',
  'Hs reg.',
  'Hs extras',
  'Hs totales',
  'Monto bruto',
  'Préstamos (+)',
  'Descuentos (−)',
  'Neto',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3
const COL = {
  LEG:        1,
  NOMBRE:     2,
  OBRA:       3,
  COD:        4,
  CAT:        5,
  HS_REG:     6,
  HS_EXT:     7,
  HS_TOT:     8,
  MONTO:      9,
  OTORGADOS:  10,
  DESCUENTOS: 11,
  NETO:       12,
} as const

interface FilaConsolidada {
  leg:                string
  nom:                string
  obraNom:            string
  obraCod:            string
  catNomActual:       string
  hsRegulares:        number
  hsExtras:           number
  hsTotal:            number
  montoBruto:         number
  prestamosOtorgados: number
  descuentos:         number
  neto:               number
}

export function buildTotalesOperarioMultiObraSheet(wb: ExcelJS.Workbook, datas: ExportData[]): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [10, 28, 24, 12, 18, 10, 10, 10, 16, 14, 14, 16])

  applyTitle(ws, `TOTALES POR OPERARIO — CONSOLIDADO MULTI-OBRA`, COL_COUNT)
  const filas = collectFilas(datas)
  applySubtitle(
    ws,
    `${filas.length} fila${filas.length !== 1 ? 's' : ''} · ${datas.length} obra${datas.length !== 1 ? 's' : ''}`,
    COL_COUNT,
  )

  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => { headerRow.getCell(i + 1).value = h })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (filas.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const f of filas) {
    const r = ws.getRow(row)

    r.getCell(COL.LEG).value = f.leg
    r.getCell(COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value = f.nom
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.OBRA).value = f.obraNom
    r.getCell(COL.OBRA).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.COD).value = f.obraCod
    r.getCell(COL.COD).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.CAT).value = f.catNomActual
    r.getCell(COL.CAT).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.HS_REG).value  = f.hsRegulares
    r.getCell(COL.HS_REG).numFmt = FMT_HORAS

    r.getCell(COL.HS_EXT).value  = f.hsExtras
    r.getCell(COL.HS_EXT).numFmt = FMT_HORAS

    r.getCell(COL.HS_TOT).value = {
      formula: `${colLetter(COL.HS_REG)}${row}+${colLetter(COL.HS_EXT)}${row}`,
      result:  f.hsTotal,
    }
    r.getCell(COL.HS_TOT).numFmt = FMT_HORAS

    r.getCell(COL.MONTO).value  = f.montoBruto
    r.getCell(COL.MONTO).numFmt = FMT_MONEDA_CERO

    r.getCell(COL.OTORGADOS).value  = f.prestamosOtorgados
    r.getCell(COL.OTORGADOS).numFmt = FMT_MONEDA_CERO

    r.getCell(COL.DESCUENTOS).value  = f.descuentos
    r.getCell(COL.DESCUENTOS).numFmt = FMT_MONEDA_CERO

    const netoFormula = `${colLetter(COL.MONTO)}${row}+${colLetter(COL.OTORGADOS)}${row}-${colLetter(COL.DESCUENTOS)}${row}`
    r.getCell(COL.NETO).value  = { formula: netoFormula, result: f.neto }
    r.getCell(COL.NETO).numFmt = FMT_MONEDA_CERO

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // Fila TOTAL al pie.
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.NOMBRE).value = 'TOTAL'
  totalRow.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  const totalsByCol: Array<{ col: number; result: number; fmt: string }> = [
    { col: COL.HS_REG,     fmt: FMT_HORAS,       result: sumOf(filas, f => f.hsRegulares) },
    { col: COL.HS_EXT,     fmt: FMT_HORAS,       result: sumOf(filas, f => f.hsExtras) },
    { col: COL.HS_TOT,     fmt: FMT_HORAS,       result: sumOf(filas, f => f.hsTotal) },
    { col: COL.MONTO,      fmt: FMT_MONEDA_CERO, result: sumOf(filas, f => f.montoBruto) },
    { col: COL.OTORGADOS,  fmt: FMT_MONEDA_CERO, result: sumOf(filas, f => f.prestamosOtorgados) },
    { col: COL.DESCUENTOS, fmt: FMT_MONEDA_CERO, result: sumOf(filas, f => f.descuentos) },
    { col: COL.NETO,       fmt: FMT_MONEDA_CERO, result: sumOf(filas, f => f.neto) },
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
  addAutofilter(ws, HEADER_ROW, COL_COUNT, lastDataRow)
}

// ── Internals ─────────────────────────────────────────────────────

function collectFilas(datas: ExportData[]): FilaConsolidada[] {
  const filas: FilaConsolidada[] = []
  for (const data of datas) {
    for (const op of data.operarios) {
      filas.push({
        leg:                op.leg,
        nom:                op.nom,
        obraNom:            data.meta.obraNom,
        obraCod:            data.meta.obraCod,
        catNomActual:       op.catNomActual,
        hsRegulares:        op.hsRegulares,
        hsExtras:           op.hsExtras,
        hsTotal:            op.hsTotal,
        montoBruto:         op.montoBruto,
        prestamosOtorgados: op.prestamosOtorgados,
        descuentos:         op.descuentos,
        neto:               op.neto,
      })
    }
  }
  return filas.sort((a, b) =>
    a.nom.localeCompare(b.nom) || a.obraNom.localeCompare(b.obraNom),
  )
}

function sumOf<T>(items: T[], fn: (it: T) => number): number {
  return items.reduce((s, it) => s + fn(it), 0)
}
