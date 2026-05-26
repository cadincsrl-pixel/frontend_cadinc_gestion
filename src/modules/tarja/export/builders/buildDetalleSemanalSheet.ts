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

export const DETALLE_SHEET_NAME = 'Detalle Semanal'
// Columnas (1-based) — se exportan para que otros builders puedan armar
// fórmulas referenciando esta hoja sin duplicar magic numbers.
export const DETALLE_COL = {
  TIPO:     1,
  LEG:      2,
  PERIODO:  3,
  COBRO:    4,
  NOMBRE:   5,
  CAT_ESP:  6,
  HORAS:    7,
  MONTO:    8,
  ESTADO:   9,
} as const
const HEADERS = [
  'Tipo',
  'Legajo',
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
  const ws = wb.addWorksheet(DETALLE_SHEET_NAME)
  setColWidths(ws, [12, 10, 26, 12, 28, 24, 10, 16, 12])

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

  row.getCell(DETALLE_COL.TIPO).value = labelTipo(r.tipo)
  row.getCell(DETALLE_COL.TIPO).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  // Legajo (vacío en contratistas y subtotales).
  if (r.leg) row.getCell(DETALLE_COL.LEG).value = r.leg
  row.getCell(DETALLE_COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

  row.getCell(DETALLE_COL.PERIODO).value = r.periodoCorto
  row.getCell(DETALLE_COL.PERIODO).alignment = { horizontal: 'left', vertical: 'middle' }

  // Cobro (Date para que se formatee con dd/mm/yyyy).
  if (r.cobro) {
    row.getCell(DETALLE_COL.COBRO).value = r.cobro
    row.getCell(DETALLE_COL.COBRO).numFmt = FMT_FECHA
  }
  row.getCell(DETALLE_COL.COBRO).alignment = { horizontal: 'center', vertical: 'middle' }

  row.getCell(DETALLE_COL.NOMBRE).value = r.nombre
  row.getCell(DETALLE_COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }
  if (r.tipo === 'subtotal') row.getCell(DETALLE_COL.NOMBRE).font = { name: 'Calibri', size: 10, bold: true }

  row.getCell(DETALLE_COL.CAT_ESP).value = r.catEspecialidad
  row.getCell(DETALLE_COL.CAT_ESP).alignment = { horizontal: 'left', vertical: 'middle' }

  // Horas (null → "—").
  if (r.horas !== null) {
    row.getCell(DETALLE_COL.HORAS).value = r.horas
    row.getCell(DETALLE_COL.HORAS).numFmt = FMT_HORAS
  } else {
    row.getCell(DETALLE_COL.HORAS).value = '—'
  }
  row.getCell(DETALLE_COL.HORAS).alignment = { horizontal: 'right', vertical: 'middle' }

  row.getCell(DETALLE_COL.MONTO).value = r.monto
  row.getCell(DETALLE_COL.MONTO).numFmt = FMT_MONEDA_CERO
  row.getCell(DETALLE_COL.MONTO).alignment = { horizontal: 'right', vertical: 'middle' }

  if (r.estado) {
    row.getCell(DETALLE_COL.ESTADO).value = r.estado === 'cerrado' ? 'Cerrado' : 'Pendiente'
  }
  row.getCell(DETALLE_COL.ESTADO).alignment = { horizontal: 'center', vertical: 'middle' }
}

function labelTipo(tipo: DetalleRow['tipo']): string {
  switch (tipo) {
    case 'operario':    return 'Operario'
    case 'contratista': return 'Contratista'
    case 'subtotal':    return ''
  }
}
