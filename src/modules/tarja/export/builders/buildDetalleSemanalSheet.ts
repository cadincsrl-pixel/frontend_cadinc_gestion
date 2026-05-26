/**
 * Hoja "Detalle Semanal": el dataset granular del export.
 *
 * Estructura: una fila por (semana, operario) → seguido por una fila por
 * (semana, contratista) → seguido por una fila de subtotal de la semana.
 * El orden global ya está resuelto por `collectData.detalleSemanal[]`,
 * acá solo escribimos y pintamos según `tipo`.
 *
 * Cambios vs. export viejo:
 *  - Removida la columna `Centro de Costo` (irrelevante en una sola obra).
 *  - Subtotales por semana con estilo gris claro + bold. Fix problema #5.
 *  - Autofilter en el rango completo y freeze del header. Fix usabilidad.
 *  - Estado y Cobro: filas subtotal los dejan vacíos a propósito.
 */
import type ExcelJS from 'exceljs'
import {
  addAutofilter,
  applyDataBorders,
  applyHeaderRow,
  applySubtitle,
  applySubtotalRow,
  applyTitle,
  freezeHeader,
  setColWidths,
} from '../helpers/cells'
import { FMT_FECHA, FMT_HORAS, FMT_MONEDA_CERO } from '../helpers/formatters'
import type { DetalleRow, ExportData } from '../types'

const SHEET_NAME = 'Detalle Semanal'
const HEADERS = [
  'Tipo',
  'Período',
  'Cobro',
  'Nombre / Contratista',
  'Categoría / Especialidad',
  'Horas',
  'Monto',
  'Estado',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3

export function buildDetalleSemanalSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [12, 26, 12, 28, 24, 10, 16, 12])

  // ── Fila 1: título ────────────────────────────────────────────
  applyTitle(ws, `DETALLE SEMANAL — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)

  // ── Fila 2: subtítulo (período + total de filas) ──────────────
  const totalDatos = data.detalleSemanal.filter(r => r.tipo !== 'subtotal').length
  const subtituloPartes = [
    `Período: ${data.meta.periodoLabel}`,
    `${data.semanas.length} semana${data.semanas.length !== 1 ? 's' : ''}`,
    `${totalDatos} ${totalDatos !== 1 ? 'filas' : 'fila'}`,
  ]
  applySubtitle(ws, subtituloPartes.join('  ·  '), COL_COUNT)

  // ── Fila 3: header de tabla ───────────────────────────────────
  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  // Sin filas de datos: igual congelo header y devuelvo.
  if (data.detalleSemanal.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  // ── Filas 4+: datos ───────────────────────────────────────────
  let row = HEADER_ROW + 1
  for (const r of data.detalleSemanal) {
    writeRow(ws, row, r)
    row++
  }
  const lastDataRow = row - 1

  // Bordes hairline a todas las filas de datos (operario/contratista).
  // Las subtotal ya pisaron border con `applySubtotalRow`, las pisamos de
  // vuelta para que dominen.
  applyDataBorders(ws, HEADER_ROW + 1, lastDataRow, COL_COUNT)
  for (let r = HEADER_ROW + 1; r <= lastDataRow; r++) {
    const dr = data.detalleSemanal[r - HEADER_ROW - 1]!
    if (dr.tipo === 'subtotal') applySubtotalRow(ws, r, COL_COUNT)
  }

  // ── UX: freeze + autofilter ───────────────────────────────────
  freezeHeader(ws, HEADER_ROW)
  addAutofilter(ws, HEADER_ROW, COL_COUNT, lastDataRow)
}

// ── Internals ─────────────────────────────────────────────────────

function writeRow(ws: ExcelJS.Worksheet, rowIdx: number, r: DetalleRow): void {
  const row = ws.getRow(rowIdx)

  // Col 1: Tipo
  row.getCell(1).value = labelTipo(r.tipo)
  row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  // Col 2: Período
  row.getCell(2).value = r.periodoCorto
  row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

  // Col 3: Cobro (Date para que se formatee con dd/mm/yyyy)
  if (r.cobro) {
    row.getCell(3).value = r.cobro
    row.getCell(3).numFmt = FMT_FECHA
  }
  row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }

  // Col 4: Nombre / Contratista
  row.getCell(4).value = r.nombre
  row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' }
  if (r.tipo === 'subtotal') row.getCell(4).font = { name: 'Calibri', size: 10, bold: true }

  // Col 5: Categoría / Especialidad
  row.getCell(5).value = r.catEspecialidad
  row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle' }

  // Col 6: Horas (null → "—")
  if (r.horas !== null) {
    row.getCell(6).value = r.horas
    row.getCell(6).numFmt = FMT_HORAS
  } else {
    row.getCell(6).value = '—'
  }
  row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }

  // Col 7: Monto
  row.getCell(7).value = r.monto
  row.getCell(7).numFmt = FMT_MONEDA_CERO
  row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }

  // Col 8: Estado (vacío en subtotales)
  if (r.estado) {
    row.getCell(8).value = r.estado === 'cerrado' ? 'Cerrado' : 'Pendiente'
  }
  row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }
}

function labelTipo(tipo: DetalleRow['tipo']): string {
  switch (tipo) {
    case 'operario':    return 'Operario'
    case 'contratista': return 'Contratista'
    case 'subtotal':    return ''
  }
}
