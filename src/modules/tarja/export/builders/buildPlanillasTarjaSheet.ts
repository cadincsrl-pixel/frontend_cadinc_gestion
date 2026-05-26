/**
 * Hoja "Planillas Tarja": tabla larga, una fila por (leg, día) con horas > 0
 * + una fila aparte por (leg, semana) con hs extras > 0 (`Tipo='Extra'`,
 * fecha = viernes de la semana).
 *
 * Decisión del user: formato largo siempre (en vez de una hoja por semana).
 * Beneficio: lista para pivotar/filtrar/sumar desde Excel sin abrir 10
 * pestañas. Fix del problema #3 del prompt (planillas apiladas verticalmente
 * con filas en blanco entre bloques).
 */
import type ExcelJS from 'exceljs'
import {
  addAutofilter,
  applyDataBorders,
  applyHeaderRow,
  applySubtitle,
  applyTitle,
  freezeHeader,
  setColWidths,
} from '../helpers/cells'
import { FMT_FECHA, FMT_HORAS } from '../helpers/formatters'
import type { ExportData } from '../types'

const SHEET_NAME = 'Planillas Tarja'
const HEADERS = [
  'Sem_key',
  'Período',
  'Legajo',
  'Nombre',
  'Categoría',
  'Fecha',
  'Día',
  'Horas',
  'Tipo',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3

const COL = {
  SEM_KEY:  1,
  PERIODO:  2,
  LEG:      3,
  NOMBRE:   4,
  CAT:      5,
  FECHA:    6,
  DIA:      7,
  HORAS:    8,
  TIPO:     9,
} as const

export function buildPlanillasTarjaSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [12, 26, 8, 28, 22, 12, 7, 10, 10])

  // ── Fila 1: título ─────────────────────────────────────────────
  applyTitle(ws, `PLANILLAS DE TARJA — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)

  // ── Fila 2: subtítulo ──────────────────────────────────────────
  const totalFilas = data.planillasLong.length
  const subtituloPartes = [
    `Período: ${data.meta.periodoLabel}`,
    `${totalFilas} ${totalFilas !== 1 ? 'filas' : 'fila'}`,
    'Lista para pivotar (Insertar → Tabla dinámica)',
  ]
  applySubtitle(ws, subtituloPartes.join('  ·  '), COL_COUNT)

  // ── Fila 3: header ─────────────────────────────────────────────
  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  if (data.planillasLong.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  // ── Filas 4+: datos ────────────────────────────────────────────
  let row = HEADER_ROW + 1
  const firstDataRow = row

  for (const p of data.planillasLong) {
    const r = ws.getRow(row)

    r.getCell(COL.SEM_KEY).value = p.semKey
    r.getCell(COL.SEM_KEY).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.PERIODO).value = p.periodoCorto
    r.getCell(COL.PERIODO).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.LEG).value = p.leg
    r.getCell(COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value = p.nom
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.CAT).value = p.catNom
    r.getCell(COL.CAT).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.FECHA).value  = p.fecha
    r.getCell(COL.FECHA).numFmt = FMT_FECHA
    r.getCell(COL.FECHA).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.DIA).value = p.diaSemana
    r.getCell(COL.DIA).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.HORAS).value  = p.horas
    r.getCell(COL.HORAS).numFmt = FMT_HORAS
    r.getCell(COL.HORAS).alignment = { horizontal: 'right', vertical: 'middle' }

    r.getCell(COL.TIPO).value = p.tipo
    r.getCell(COL.TIPO).alignment = { horizontal: 'center', vertical: 'middle' }
    if (p.tipo === 'Extra') {
      r.getCell(COL.TIPO).font = { name: 'Calibri', size: 10, italic: true }
    }

    row++
  }
  const lastDataRow = row - 1

  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // ── UX ─────────────────────────────────────────────────────────
  freezeHeader(ws, HEADER_ROW)
  addAutofilter(ws, HEADER_ROW, COL_COUNT, lastDataRow)
}
