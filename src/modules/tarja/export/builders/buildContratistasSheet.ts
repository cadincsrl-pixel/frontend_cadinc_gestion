/**
 * Hoja "Contratistas": certificaciones de la obra ordenadas por semana → nombre.
 * Mismas columnas que el export viejo, con subtotal al pie.
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
import { FMT_FECHA, FMT_MONEDA_CERO } from '../helpers/formatters'
import { sumRange } from '../helpers/formulas'
import type { ExportData } from '../types'

const SHEET_NAME = 'Contratistas'
const HEADERS = [
  'Período',
  'Cobro',
  'Contratista',
  'Especialidad',
  'Descripción / avance',
  'Monto',
  'Estado',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3
const COL = {
  PERIODO:     1,
  COBRO:       2,
  CONTRATISTA: 3,
  ESPECIALIDAD: 4,
  DESCRIPCION: 5,
  MONTO:       6,
  ESTADO:      7,
} as const

export function buildContratistasSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [26, 12, 26, 18, 32, 16, 12])

  applyTitle(ws, `CONTRATISTAS — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)
  applySubtitle(
    ws,
    `Período: ${data.meta.periodoLabel}  ·  ${data.contratistas.length} certificación${data.contratistas.length !== 1 ? 'es' : ''}`,
    COL_COUNT,
  )

  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (data.contratistas.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const c of data.contratistas) {
    const r = ws.getRow(row)

    r.getCell(COL.PERIODO).value = c.periodoCorto
    r.getCell(COL.PERIODO).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.COBRO).value  = c.cobro
    r.getCell(COL.COBRO).numFmt = FMT_FECHA
    r.getCell(COL.COBRO).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.CONTRATISTA).value = c.nombre
    r.getCell(COL.CONTRATISTA).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.ESPECIALIDAD).value = c.especialidad
    r.getCell(COL.ESPECIALIDAD).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.DESCRIPCION).value = c.descripcion
    r.getCell(COL.DESCRIPCION).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.MONTO).value  = c.monto
    r.getCell(COL.MONTO).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.MONTO).alignment = { horizontal: 'right', vertical: 'middle' }

    r.getCell(COL.ESTADO).value = c.estado === 'cerrado' ? 'Cerrado' : 'Pendiente'
    r.getCell(COL.ESTADO).alignment = { horizontal: 'center', vertical: 'middle' }

    row++
  }
  const lastDataRow = row - 1

  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // Fila TOTAL al pie.
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.CONTRATISTA).value = 'TOTAL'
  totalRow.getCell(COL.CONTRATISTA).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  const montoLetter = colLetter(COL.MONTO)
  const range = `${montoLetter}${firstDataRow}:${montoLetter}${lastDataRow}`
  const tc = totalRow.getCell(COL.MONTO)
  tc.value  = { formula: sumRange(range), result: data.totalesObra.costoContratistas }
  tc.numFmt = FMT_MONEDA_CERO
  tc.alignment = { horizontal: 'right', vertical: 'middle' }

  applyTotalRow(ws, row, COL_COUNT)

  freezeHeader(ws, HEADER_ROW)
  addAutofilter(ws, HEADER_ROW, COL_COUNT, lastDataRow)
}
