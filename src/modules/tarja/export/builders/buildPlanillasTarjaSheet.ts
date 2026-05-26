/**
 * Hoja "Planillas Tarja": matrices semanales apiladas verticalmente en una
 * sola pestaña, una abajo de la otra con un separador claro por semana.
 *
 * Formato familiar de la app TarjaTable y la planilla de papel:
 *   Leg | Nombre | Categoría | Vie | Sáb | Dom | Lun | Mar | Mié | Jue | HsExt | TOTAL | Costo
 *
 * Cada bloque termina con una fila TOTAL (sumas por columna). El costo de
 * la semana se calcula en `collectData.planillas[].sem.costoOperarios`.
 *
 * Decisión vs alternativas:
 *  - Una pestaña por semana (versión previa): incómodo navegar entre
 *    docenas de pestañas en exports largos.
 *  - Tabla larga (versión original): difícil de leer un día/semana
 *    específico sin pivotar.
 *  - Matrices apiladas (esta): un solo lugar para scrollear, formato
 *    familiar, costo total por semana visible al pie del bloque.
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
import { FMT_HORAS, FMT_MONEDA_CERO, fmtDiaSemana } from '../helpers/formatters'
import { sumRange } from '../helpers/formulas'
import { C_AZUL_LIGHT, C_CARBON } from '../helpers/styles'
import { getSemDays, toISO } from '@/lib/utils/dates'
import type { ExportData, PlanillaMatrix } from '../types'

const SHEET_NAME = 'Planillas Tarja'
const COL_COUNT = 13
const COL = {
  LEG:    1,
  NOMBRE: 2,
  CAT:    3,
  // D..J → 7 días (índices 4..10)
  HS_EXT: 11,
  TOTAL:  12,
  COSTO:  13,
} as const

export function buildPlanillasTarjaSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [8, 28, 18, 9, 9, 9, 9, 9, 9, 9, 10, 10, 14])

  // ── Fila 1: título ─────────────────────────────────────────────
  applyTitle(ws, `PLANILLAS DE TARJA — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)

  // ── Fila 2: subtítulo ──────────────────────────────────────────
  applySubtitle(
    ws,
    `Período: ${data.meta.periodoLabel}  ·  ${data.planillas.length} semana${data.planillas.length !== 1 ? 's' : ''}  ·  ${data.totalesObra.hsTotal} hs totales`,
    COL_COUNT,
  )

  if (data.planillas.length === 0) {
    ws.mergeCells(4, 1, 4, COL_COUNT)
    const c = ws.getCell(4, 1)
    c.value = 'Sin datos en el rango seleccionado.'
    c.font = { name: 'Calibri', size: 11, italic: true }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    return
  }

  // ── Filas 4+: matrices apiladas ────────────────────────────────
  let row = 4
  for (const matrix of data.planillas) {
    row = writeMatrix(ws, row, matrix)
    row += 1 // separador entre bloques
  }

  // Freeze del título + subtítulo, no del header (porque cada bloque tiene su propio header).
  freezeHeader(ws, 2)
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Escribe un bloque (semana) empezando en `startRow`. Devuelve la fila
 * siguiente al bloque (donde el caller puede agregar separador o el
 * siguiente bloque).
 */
function writeMatrix(ws: ExcelJS.Worksheet, startRow: number, matrix: PlanillaMatrix): number {
  const { sem, operarios } = matrix
  const days = getSemDays(new Date(sem.semKey + 'T12:00:00'))

  // ── Section header: "Sem Vie 13/3 → Jue 19/3 · Cobro 20/3 · Estado" ──
  ws.mergeCells(startRow, 1, startRow, COL_COUNT)
  const sectionCell = ws.getCell(startRow, 1)
  sectionCell.value = `${sem.periodoCorto}  ·  Cobro ${fmtFecha(sem.cobro)}  ·  ${sem.estado === 'cerrado' ? 'Cerrado' : 'Pendiente'}`
  sectionCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_CARBON } }
  sectionCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }
  ws.getRow(startRow).height = 22

  // ── Header de tabla ────────────────────────────────────────────
  const headerRowIdx = startRow + 1
  const headers = [
    'Legajo',
    'Nombre',
    'Categoría',
    ...days.map(d => `${fmtDiaSemana(d)} ${d.getDate()}/${d.getMonth() + 1}`),
    'Hs Extras',
    'TOTAL',
    'Costo',
  ]
  const headerRow = ws.getRow(headerRowIdx)
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, headerRowIdx, COL_COUNT)

  // ── Filas de operarios ─────────────────────────────────────────
  let row = headerRowIdx + 1
  const firstDataRow = row

  if (operarios.length === 0) {
    ws.mergeCells(row, 1, row, COL_COUNT)
    const c = ws.getCell(row, 1)
    c.value = 'Sin trabajadores con horas esta semana.'
    c.font = { name: 'Calibri', size: 10, italic: true }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    return row + 1
  }

  for (const op of operarios) {
    const r = ws.getRow(row)

    r.getCell(COL.LEG).value = op.leg
    r.getCell(COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value = op.nom
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.CAT).value = op.catNom
    r.getCell(COL.CAT).alignment = { horizontal: 'left', vertical: 'middle' }

    // Días: D..J (4..10).
    days.forEach((d, i) => {
      const col = 4 + i
      const hs = op.horasPorDia[toISO(d)] ?? 0
      const cell = r.getCell(col)
      if (hs > 0) {
        cell.value  = hs
        cell.numFmt = FMT_HORAS
      } else {
        cell.value = '—'
      }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    })

    // Hs Extras (K).
    const ext = r.getCell(COL.HS_EXT)
    if (op.hsExtras > 0) {
      ext.value  = op.hsExtras
      ext.numFmt = FMT_HORAS
    } else {
      ext.value = '—'
    }
    ext.alignment = { horizontal: 'right', vertical: 'middle' }

    // TOTAL (L) con fórmula =SUM(D<row>:K<row>).
    // Excel ignora celdas de texto ("—") en SUM, así que el total es correcto.
    const totFormula = `SUM(${colLetter(4)}${row}:${colLetter(COL.HS_EXT)}${row})`
    const totCell = r.getCell(COL.TOTAL)
    totCell.value  = { formula: totFormula, result: op.totalHs }
    totCell.numFmt = FMT_HORAS
    totCell.font   = { name: 'Calibri', size: 10, bold: true }
    totCell.alignment = { horizontal: 'right', vertical: 'middle' }

    // Costo (M) — viene pre-calculado de collectData.
    const costoCell = r.getCell(COL.COSTO)
    costoCell.value  = op.monto
    costoCell.numFmt = FMT_MONEDA_CERO
    costoCell.alignment = { horizontal: 'right', vertical: 'middle' }

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // ── Fila TOTAL al pie del bloque ───────────────────────────────
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.NOMBRE).value = 'TOTAL'
  totalRow.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  // Sumas por columna (D..K → horas; L → total; M → costo).
  for (let c = 4; c <= COL.COSTO; c++) {
    const letter = colLetter(c)
    const range = `${letter}${firstDataRow}:${letter}${lastDataRow}`
    let result = 0
    if (c >= 4 && c <= 10) {
      const dayIdx = c - 4
      const fecha = toISO(days[dayIdx]!)
      result = operarios.reduce((s, op) => s + (op.horasPorDia[fecha] ?? 0), 0)
    } else if (c === COL.HS_EXT) {
      result = operarios.reduce((s, op) => s + op.hsExtras, 0)
    } else if (c === COL.TOTAL) {
      result = sem.hsRegulares + sem.hsExtras
    } else if (c === COL.COSTO) {
      result = sem.costoOperarios
    }
    const cell = totalRow.getCell(c)
    cell.value  = { formula: sumRange(range), result }
    cell.numFmt = c === COL.COSTO ? FMT_MONEDA_CERO : FMT_HORAS
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  applyTotalRow(ws, row, COL_COUNT)

  // Devuelvo la fila siguiente para que el caller agregue el separador.
  return row + 1
}

function fmtFecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
