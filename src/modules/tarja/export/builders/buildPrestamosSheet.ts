/**
 * Hoja "Préstamos": filtrada a operarios que tarjaron en la obra (fix #2)
 * con saldo acumulado por leg ordenado por (nombre, fecha, sem_key).
 *
 * Exporta `PRESTAMOS_COL` y `PRESTAMOS_SHEET_NAME` para que el builder de
 * `Totales por Operario` arme SUMIFS contra esta hoja (reemplaza los
 * valores fijos por fórmulas vivas).
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
import { sumifs, sumRange } from '../helpers/formulas'
import type { ExportData } from '../types'

export const PRESTAMOS_SHEET_NAME = 'Préstamos'
export const PRESTAMOS_COL = {
  LEG:     1,
  NOMBRE:  2,
  TIPO:    3,
  MONTO:   4,
  CONCEPTO: 5,
  SEM_KEY: 6,
  FECHA:   7,
  SALDO:   8,
} as const

const HEADERS = [
  'Legajo',
  'Nombre',
  'Tipo',
  'Monto',
  'Concepto',
  'Sem_key',
  'Fecha',
  'Saldo acumulado',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3

export function buildPrestamosSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(PRESTAMOS_SHEET_NAME)
  setColWidths(ws, [10, 28, 14, 14, 28, 12, 12, 16])

  applyTitle(ws, `PRÉSTAMOS — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)
  applySubtitle(
    ws,
    `Período: ${data.meta.periodoLabel}  ·  ${data.prestamos.length} movimiento${data.prestamos.length !== 1 ? 's' : ''}`,
    COL_COUNT,
  )

  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (data.prestamos.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const p of data.prestamos) {
    const r = ws.getRow(row)

    r.getCell(PRESTAMOS_COL.LEG).value = p.leg
    r.getCell(PRESTAMOS_COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.NOMBRE).value = p.nom
    r.getCell(PRESTAMOS_COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.TIPO).value = p.tipo
    r.getCell(PRESTAMOS_COL.TIPO).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.MONTO).value  = p.monto
    r.getCell(PRESTAMOS_COL.MONTO).numFmt = FMT_MONEDA_CERO
    r.getCell(PRESTAMOS_COL.MONTO).alignment = { horizontal: 'right', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.CONCEPTO).value = p.concepto
    r.getCell(PRESTAMOS_COL.CONCEPTO).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.SEM_KEY).value = p.semKey
    r.getCell(PRESTAMOS_COL.SEM_KEY).alignment = { horizontal: 'center', vertical: 'middle' }

    if (p.fecha) {
      r.getCell(PRESTAMOS_COL.FECHA).value  = p.fecha
      r.getCell(PRESTAMOS_COL.FECHA).numFmt = FMT_FECHA
    }
    r.getCell(PRESTAMOS_COL.FECHA).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(PRESTAMOS_COL.SALDO).value  = p.saldoAcumulado
    r.getCell(PRESTAMOS_COL.SALDO).numFmt = FMT_MONEDA_CERO
    r.getCell(PRESTAMOS_COL.SALDO).alignment = { horizontal: 'right', vertical: 'middle' }

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // Fila TOTAL: suma de otorgados + suma de descontados.
  const totalRow = ws.getRow(row)
  totalRow.getCell(PRESTAMOS_COL.NOMBRE).value = 'TOTAL'
  totalRow.getCell(PRESTAMOS_COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  const tipoRange  = `$${colLetter(PRESTAMOS_COL.TIPO)}$${firstDataRow}:$${colLetter(PRESTAMOS_COL.TIPO)}$${lastDataRow}`
  const montoRange = `$${colLetter(PRESTAMOS_COL.MONTO)}$${firstDataRow}:$${colLetter(PRESTAMOS_COL.MONTO)}$${lastDataRow}`

  const tc = totalRow.getCell(PRESTAMOS_COL.MONTO)
  tc.value  = {
    formula: sumRange(`${colLetter(PRESTAMOS_COL.MONTO)}${firstDataRow}:${colLetter(PRESTAMOS_COL.MONTO)}${lastDataRow}`),
    result:  data.totalesObra.prestamosOtorgados + data.totalesObra.descuentos,
  }
  tc.numFmt = FMT_MONEDA_CERO
  tc.alignment = { horizontal: 'right', vertical: 'middle' }

  // Saldo final neto = otorgados − descontados (con SUMIFS por tipo).
  const saldoFormula = `${sumifs(montoRange, [{ range: tipoRange, criteria: 'Otorgado' }])}-${sumifs(montoRange, [{ range: tipoRange, criteria: 'Descontado' }])}`
  const sc = totalRow.getCell(PRESTAMOS_COL.SALDO)
  sc.value  = { formula: saldoFormula, result: data.totalesObra.prestamosOtorgados - data.totalesObra.descuentos }
  sc.numFmt = FMT_MONEDA_CERO
  sc.alignment = { horizontal: 'right', vertical: 'middle' }

  applyTotalRow(ws, row, COL_COUNT)

  freezeHeader(ws, HEADER_ROW)
  addAutofilter(ws, HEADER_ROW, COL_COUNT, lastDataRow)
}
