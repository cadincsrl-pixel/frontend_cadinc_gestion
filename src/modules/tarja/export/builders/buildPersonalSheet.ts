/**
 * Hoja "Personal": solo legs que tarjaron en esta obra (fix #1), sin la
 * basura visual del export viejo (Observaciones e Historial categorías).
 */
import type ExcelJS from 'exceljs'
import {
  applyDataBorders,
  applyHeaderRow,
  applySubtitle,
  applyTitle,
  freezeHeader,
  setColWidths,
} from '../helpers/cells'
import { FMT_FECHA, FMT_MONEDA_CERO, parseISODate } from '../helpers/formatters'
import type { ExportData } from '../types'

const SHEET_NAME = 'Personal'
const HEADERS = [
  'Legajo',
  'Nombre',
  'DNI',
  'Categoría actual',
  'Valor hora',
  'Teléfono',
  'Dirección',
  'Fecha nac.',
  'Antigüedad en obra',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3
const COL = {
  LEG:        1,
  NOMBRE:     2,
  DNI:        3,
  CAT:        4,
  VH:         5,
  TEL:        6,
  DIR:        7,
  FECHA_NAC:  8,
  ANTIGUEDAD: 9,
} as const

export function buildPersonalSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [10, 28, 12, 22, 14, 14, 32, 12, 14])

  applyTitle(ws, `PERSONAL — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)
  applySubtitle(
    ws,
    `${data.personalDeObra.length} operario${data.personalDeObra.length !== 1 ? 's' : ''} que tarjaron en la obra`,
    COL_COUNT,
  )

  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (data.personalDeObra.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const p of data.personalDeObra) {
    const r = ws.getRow(row)

    r.getCell(COL.LEG).value = p.leg
    r.getCell(COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value = p.nom
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.DNI).value = p.dni ?? ''
    r.getCell(COL.DNI).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.CAT).value = p.catNomActual
    r.getCell(COL.CAT).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.VH).value  = p.vh
    r.getCell(COL.VH).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.VH).alignment = { horizontal: 'right', vertical: 'middle' }

    r.getCell(COL.TEL).value = p.tel ?? ''
    r.getCell(COL.TEL).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.DIR).value = p.dir ?? ''
    r.getCell(COL.DIR).alignment = { horizontal: 'left', vertical: 'middle' }

    const fechaNac = parseISODate(p.fechaNac)
    if (fechaNac) {
      r.getCell(COL.FECHA_NAC).value  = fechaNac
      r.getCell(COL.FECHA_NAC).numFmt = FMT_FECHA
    }
    r.getCell(COL.FECHA_NAC).alignment = { horizontal: 'center', vertical: 'middle' }

    if (p.antiguedadObra) {
      r.getCell(COL.ANTIGUEDAD).value  = p.antiguedadObra
      r.getCell(COL.ANTIGUEDAD).numFmt = FMT_FECHA
    }
    r.getCell(COL.ANTIGUEDAD).alignment = { horizontal: 'center', vertical: 'middle' }

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  freezeHeader(ws, HEADER_ROW)
}
