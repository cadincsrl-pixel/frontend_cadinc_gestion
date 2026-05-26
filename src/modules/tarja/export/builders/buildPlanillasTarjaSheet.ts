/**
 * Hojas "Sem dd-mm-yy": una pestaña por semana en formato matriz
 * (operarios × 7 días + Hs Extras + TOTAL). Es el formato familiar de la
 * app TarjaTable y la planilla de papel.
 *
 * Si hay N semanas en el rango exportado, se crean N hojas con nombre
 * "Sem 13-03-26" (viernes de la semana, dd-mm-aa, ordenable
 * alfabéticamente). Cada hoja es compacta y autocontenida — para ver una
 * semana específica el user va directo a esa pestaña.
 *
 * Layout por hoja:
 *   A: Legajo · B: Nombre · C: Categoría
 *   D–J: 7 días (Vie a Jue) con header "Vie 13/3"
 *   K: Hs Extras
 *   L: TOTAL (fórmula =SUM(D:K))
 *
 * Fila TOTAL al pie con `=SUM(<col>)` por cada columna numérica.
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
import { FMT_HORAS, fmtDiaSemana } from '../helpers/formatters'
import { sumRange } from '../helpers/formulas'
import { getSemDays, toISO } from '@/lib/utils/dates'
import type { ExportData, SemanaTotal } from '../types'

const COL_COUNT = 12
const HEADER_ROW = 3
const COL = {
  LEG:    1,
  NOMBRE: 2,
  CAT:    3,
  // D..J → días (índices 4..10)
  HS_EXT: 11,
  TOTAL:  12,
} as const

export function buildPlanillasTarjaSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  if (data.semanas.length === 0) {
    // Sin datos: emitimos una hoja vacía como marcador para que el archivo
    // no se vea "trunco" entre Planillas Tarja y Contratistas.
    const ws = wb.addWorksheet('Planillas Tarja')
    applyTitle(ws, `PLANILLAS DE TARJA — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)
    applySubtitle(ws, 'Sin datos en el rango seleccionado.', COL_COUNT)
    return
  }

  for (const sem of data.semanas) {
    buildOneSheet(wb, data, sem)
  }
}

// ── Una hoja por semana ───────────────────────────────────────────

function buildOneSheet(wb: ExcelJS.Workbook, data: ExportData, sem: SemanaTotal): void {
  const ws = wb.addWorksheet(sheetNameFor(sem.semKey))
  setColWidths(ws, [8, 28, 18, 9, 9, 9, 9, 9, 9, 9, 10, 10])

  // ── Fila 1: título ─────────────────────────────────────────────
  applyTitle(ws, `${sem.periodoCorto} — ${data.meta.obraNom} (${data.meta.obraCod})`, COL_COUNT)

  // ── Fila 2: subtítulo ──────────────────────────────────────────
  applySubtitle(
    ws,
    `${sem.hsRegulares + sem.hsExtras} hs totales  ·  Cobro ${fmtCobro(sem.cobro)}  ·  Estado: ${sem.estado === 'cerrado' ? 'Cerrado' : 'Pendiente'}`,
    COL_COUNT,
  )

  // ── Fila 3: header ─────────────────────────────────────────────
  const days = getSemDays(new Date(sem.semKey + 'T12:00:00'))
  const headers = [
    'Legajo',
    'Nombre',
    'Categoría',
    ...days.map(d => `${fmtDiaSemana(d)} ${d.getDate()}/${d.getMonth() + 1}`),
    'Hs Extras',
    'TOTAL',
  ]
  const headerRow = ws.getRow(HEADER_ROW)
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h
  })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  // ── Reagrupar planillasLong por leg para esta semana ───────────
  const filasSem = data.planillasLong.filter(p => p.semKey === sem.semKey)
  if (filasSem.length === 0) {
    freezeHeader(ws, HEADER_ROW)
    return
  }

  // Map<leg, { nombre, catNom, horasPorDia: Record<isoFecha, number>, hsExtras }>
  const porLeg = new Map<string, {
    nombre: string
    catNom: string
    horasPorDia: Record<string, number>
    hsExtras: number
  }>()

  for (const r of filasSem) {
    const entry = porLeg.get(r.leg) ?? {
      nombre:      r.nom,
      catNom:      r.catNom,
      horasPorDia: {},
      hsExtras:    0,
    }
    if (r.tipo === 'Regular') {
      entry.horasPorDia[toISO(r.fecha)] = r.horas
    } else {
      entry.hsExtras += r.horas
    }
    porLeg.set(r.leg, entry)
  }

  // ── Filas 4+: operarios (alfabético) ───────────────────────────
  const operariosOrdenados = [...porLeg.entries()].sort(
    ([, a], [, b]) => a.nombre.localeCompare(b.nombre),
  )

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const [leg, info] of operariosOrdenados) {
    const r = ws.getRow(row)

    r.getCell(COL.LEG).value = leg
    r.getCell(COL.LEG).alignment = { horizontal: 'center', vertical: 'middle' }

    r.getCell(COL.NOMBRE).value = info.nombre
    r.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle' }

    r.getCell(COL.CAT).value = info.catNom
    r.getCell(COL.CAT).alignment = { horizontal: 'left', vertical: 'middle' }

    // Días: D..J (4..10).
    days.forEach((d, i) => {
      const col = 4 + i
      const hs = info.horasPorDia[toISO(d)] ?? 0
      const cell = r.getCell(col)
      if (hs > 0) {
        cell.value  = hs
        cell.numFmt = FMT_HORAS
      } else {
        cell.value = '—'
      }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    })

    // Hs Extras (col K).
    const ext = r.getCell(COL.HS_EXT)
    if (info.hsExtras > 0) {
      ext.value  = info.hsExtras
      ext.numFmt = FMT_HORAS
    } else {
      ext.value = '—'
    }
    ext.alignment = { horizontal: 'right', vertical: 'middle' }

    // TOTAL (col L) con fórmula =SUM(D<row>:K<row>).
    // Las celdas con "—" cuentan como 0 en SUM (Excel ignora texto).
    const totFormula = `SUM(${colLetter(4)}${row}:${colLetter(COL.HS_EXT)}${row})`
    const totCell = r.getCell(COL.TOTAL)
    const totResult = days.reduce((s, d) => s + (info.horasPorDia[toISO(d)] ?? 0), 0) + info.hsExtras
    totCell.value  = { formula: totFormula, result: totResult }
    totCell.numFmt = FMT_HORAS
    totCell.font   = { name: 'Calibri', size: 10, bold: true }
    totCell.alignment = { horizontal: 'right', vertical: 'middle' }

    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // ── Fila TOTAL al pie ──────────────────────────────────────────
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.NOMBRE).value = 'TOTAL'
  totalRow.getCell(COL.NOMBRE).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  // Sumas por columna (D..K + L).
  for (let c = 4; c <= COL.TOTAL; c++) {
    const letter = colLetter(c)
    const range = `${letter}${firstDataRow}:${letter}${lastDataRow}`
    // Resultado total: re-derivado de info.horasPorDia y sumas.
    let result = 0
    if (c >= 4 && c <= 10) {
      const dayIdx = c - 4
      const fecha = toISO(days[dayIdx]!)
      result = [...porLeg.values()].reduce((s, info) => s + (info.horasPorDia[fecha] ?? 0), 0)
    } else if (c === COL.HS_EXT) {
      result = [...porLeg.values()].reduce((s, info) => s + info.hsExtras, 0)
    } else if (c === COL.TOTAL) {
      result = sem.hsRegulares + sem.hsExtras
    }
    const cell = totalRow.getCell(c)
    cell.value  = { formula: sumRange(range), result }
    cell.numFmt = FMT_HORAS
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  applyTotalRow(ws, row, COL_COUNT)

  freezeHeader(ws, HEADER_ROW)
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Sheet name: "Sem 13-03-26". Excel prohíbe `\ / ? * [ ]` y limita a 31 chars.
 * Formato dd-mm-aa: 11 chars total, ordenable alfabéticamente *dentro del
 * mismo año* (que es el caso típico de un export filtrado).
 */
function sheetNameFor(semKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(semKey)
  if (!m) return `Sem ${semKey}`
  const [, y, mo, d] = m
  return `Sem ${d}-${mo}-${y!.slice(2)}`
}

function fmtCobro(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
