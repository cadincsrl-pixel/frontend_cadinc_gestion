/**
 * Hoja "Totales por Operario": una fila por legajo con su consolidado
 * de horas, monto, préstamos y neto en la obra.
 *
 * Es la hoja que el user más mira para liquidar — fix problema #4 del
 * prompt ("no existe un total acumulado por operario en la obra").
 *
 * Fórmulas:
 *  - `Monto bruto`: `SUMIFS('Detalle Semanal'!Monto, 'Detalle Semanal'!Tipo, "Operario", 'Detalle Semanal'!Legajo, <Legajo>)`.
 *    Si el user edita un monto en `Detalle Semanal`, este total recalcula.
 *  - `Neto`: `=MontoBruto + Otorgados − Descuentos`.
 *  - `Préstamos otorgados` / `Descuentos`: `SUMIFS` contra hoja `Préstamos`
 *    filtrando por (Tipo, Legajo). Si el user agrega un préstamo manual
 *    en esa hoja, este total recalcula.
 *  - Fila TOTAL al pie con `SUM(...)` por columna.
 *
 * Estilo:
 *  - Filas de operarios con `sinTarifaVigente = true` se pintan con
 *    fondo amarillo (`STYLE_WARNING`) — antes pasaban silenciosos con
 *    monto $0.
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
import { sumRange, sumifs } from '../helpers/formulas'
import { STYLE_WARNING } from '../helpers/styles'
import type { ExportData } from '../types'
import { DETALLE_COL, DETALLE_SHEET_NAME } from './buildDetalleSemanalSheet'
import { PRESTAMOS_COL, PRESTAMOS_SHEET_NAME } from './buildPrestamosSheet'

const SHEET_NAME = 'Totales por Operario'
const HEADERS = [
  'Legajo',
  'Nombre',
  'Categoría',
  'Hs regulares',
  'Hs extras',
  'Monto bruto',
  'Préstamos (+)',
  'Descuentos (−)',
  'Neto a pagar',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3

// Columnas (1-based) en ESTA hoja.
const COL = {
  LEG:        1,
  NOMBRE:     2,
  CAT:        3,
  HS_REG:     4,
  HS_EXT:     5,
  MONTO:      6,
  OTORGADOS:  7,
  DESCUENTOS: 8,
  NETO:       9,
} as const

export function buildTotalesOperarioSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [10, 28, 22, 12, 12, 16, 14, 14, 16])

  // ── Fila 1: título ─────────────────────────────────────────────
  applyTitle(ws, `TOTALES POR OPERARIO — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)

  // ── Fila 2: subtítulo ──────────────────────────────────────────
  applySubtitle(
    ws,
    `Período: ${data.meta.periodoLabel}  ·  ${data.operarios.length} operario${data.operarios.length !== 1 ? 's' : ''}`,
    COL_COUNT,
  )

  // ── Fila 3: header ─────────────────────────────────────────────
  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (data.operarios.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  // ── Filas 4+: operarios ────────────────────────────────────────
  // Pre-calculo rangos para el SUMIFS de Monto bruto.
  // Rango aprox del cuerpo de `Detalle Semanal`. Como no sabemos el
  // último row exacto, usamos `:1048576` (max row de Excel) — los SUMIFS
  // sobre columnas enteras son lentos pero válidos. Suficiente para los
  // volúmenes de tarja (cientos de filas).
  const detTipoRange   = `'${DETALLE_SHEET_NAME}'!$${colLetter(DETALLE_COL.TIPO)}:$${colLetter(DETALLE_COL.TIPO)}`
  const detLegRange    = `'${DETALLE_SHEET_NAME}'!$${colLetter(DETALLE_COL.LEG)}:$${colLetter(DETALLE_COL.LEG)}`
  const detMontoRange  = `'${DETALLE_SHEET_NAME}'!$${colLetter(DETALLE_COL.MONTO)}:$${colLetter(DETALLE_COL.MONTO)}`
  const prLegRange     = `'${PRESTAMOS_SHEET_NAME}'!$${colLetter(PRESTAMOS_COL.LEG)}:$${colLetter(PRESTAMOS_COL.LEG)}`
  const prTipoRange    = `'${PRESTAMOS_SHEET_NAME}'!$${colLetter(PRESTAMOS_COL.TIPO)}:$${colLetter(PRESTAMOS_COL.TIPO)}`
  const prMontoRange   = `'${PRESTAMOS_SHEET_NAME}'!$${colLetter(PRESTAMOS_COL.MONTO)}:$${colLetter(PRESTAMOS_COL.MONTO)}`

  let row = HEADER_ROW + 1
  const firstDataRow = row

  for (const op of data.operarios) {
    const r = ws.getRow(row)

    r.getCell(COL.LEG).value       = op.leg
    r.getCell(COL.LEG).alignment   = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value    = op.nom
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.CAT).value       = op.catNomActual
    r.getCell(COL.CAT).alignment   = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.HS_REG).value    = op.hsRegulares
    r.getCell(COL.HS_REG).numFmt   = FMT_HORAS
    r.getCell(COL.HS_REG).alignment = { horizontal: 'right', vertical: 'middle' }

    r.getCell(COL.HS_EXT).value    = op.hsExtras
    r.getCell(COL.HS_EXT).numFmt   = FMT_HORAS
    r.getCell(COL.HS_EXT).alignment = { horizontal: 'right', vertical: 'middle' }

    // Monto bruto: SUMIFS contra Detalle Semanal por (Tipo="Operario", Legajo=A<n>).
    const sumifsFormula = sumifs(detMontoRange, [
      { range: detTipoRange, criteria: 'Operario' },
      { range: detLegRange,  criteria: `${colLetter(COL.LEG)}${row}` },
    ])
    r.getCell(COL.MONTO).value  = { formula: sumifsFormula, result: op.montoBruto }
    r.getCell(COL.MONTO).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.MONTO).alignment = { horizontal: 'right', vertical: 'middle' }

    // Préstamos: SUMIFS contra hoja Préstamos por (Tipo, Legajo).
    const otorgadosFormula = sumifs(prMontoRange, [
      { range: prTipoRange, criteria: 'Otorgado' },
      { range: prLegRange,  criteria: `${colLetter(COL.LEG)}${row}` },
    ])
    r.getCell(COL.OTORGADOS).value  = { formula: otorgadosFormula, result: op.prestamosOtorgados }
    r.getCell(COL.OTORGADOS).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.OTORGADOS).alignment = { horizontal: 'right', vertical: 'middle' }

    const descuentosFormula = sumifs(prMontoRange, [
      { range: prTipoRange, criteria: 'Descontado' },
      { range: prLegRange,  criteria: `${colLetter(COL.LEG)}${row}` },
    ])
    r.getCell(COL.DESCUENTOS).value  = { formula: descuentosFormula, result: op.descuentos }
    r.getCell(COL.DESCUENTOS).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.DESCUENTOS).alignment = { horizontal: 'right', vertical: 'middle' }

    // Neto = Monto + Otorgados − Descuentos.
    const netoFormula = `${colLetter(COL.MONTO)}${row}+${colLetter(COL.OTORGADOS)}${row}-${colLetter(COL.DESCUENTOS)}${row}`
    r.getCell(COL.NETO).value  = { formula: netoFormula, result: op.neto }
    r.getCell(COL.NETO).numFmt = FMT_MONEDA_CERO
    r.getCell(COL.NETO).alignment = { horizontal: 'right', vertical: 'middle' }

    // Aviso amarillo si no tuvo tarifa vigente en ninguna semana tarjada.
    if (op.sinTarifaVigente) {
      for (let c = 1; c <= COL_COUNT; c++) {
        r.getCell(c).fill = STYLE_WARNING.fill!
      }
    }

    row++
  }
  const lastDataRow = row - 1

  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // ── Fila TOTAL al pie ──────────────────────────────────────────
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.LEG).value = ''
  totalRow.getCell(COL.NOMBRE).value = 'TOTAL'
  totalRow.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  totalRow.getCell(COL.CAT).value = ''

  const totalsByCol: Array<{ col: number; result: number; fmt: string }> = [
    { col: COL.HS_REG,     result: data.totalesObra.hsRegulares,        fmt: FMT_HORAS },
    { col: COL.HS_EXT,     result: data.totalesObra.hsExtras,           fmt: FMT_HORAS },
    { col: COL.MONTO,      result: data.totalesObra.costoOperarios,     fmt: FMT_MONEDA_CERO },
    { col: COL.OTORGADOS,  result: data.totalesObra.prestamosOtorgados, fmt: FMT_MONEDA_CERO },
    { col: COL.DESCUENTOS, result: data.totalesObra.descuentos,         fmt: FMT_MONEDA_CERO },
    {
      col:    COL.NETO,
      result: data.totalesObra.costoOperarios + data.totalesObra.prestamosOtorgados - data.totalesObra.descuentos,
      fmt:    FMT_MONEDA_CERO,
    },
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

  // ── UX ─────────────────────────────────────────────────────────
  freezeHeader(ws, HEADER_ROW)
}
