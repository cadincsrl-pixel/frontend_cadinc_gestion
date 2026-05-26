/**
 * Hoja "Resumen": KPIs de la obra en formato label/valor con 3 secciones:
 *   - Métricas de operación (horas)
 *   - Costos
 *   - Préstamos y neto a cobrar
 *
 * Sin tabla de "obras" (porque exportamos una sola) y sin "TOTAL GENERAL"
 * redundante. Fix de los problemas #4 y #6 del prompt.
 *
 * Decisiones:
 *  - Layout 2 columnas (A=label, B=valor). Es lo más legible.
 *  - Los totales por sección usan **fórmulas** (`=B5+B6`) en vez de valores
 *    hardcodeados — si el user edita una celda, el total recalcula.
 *  - Si `flags.sinDatos`, la hoja queda con un aviso en lugar de las cards.
 */
import type ExcelJS from 'exceljs'
import {
  applyHeaderRow,
  applySubtitle,
  applyTitle,
  applyTotalRow,
  setColWidths,
} from '../helpers/cells'
import { FMT_HORAS, FMT_MONEDA } from '../helpers/formatters'
import {
  C_AZUL_LIGHT,
  STYLE_DATA,
} from '../helpers/styles'
import type { ExportData } from '../types'

const SHEET_NAME = 'Resumen'

export function buildResumenSheet(wb: ExcelJS.Workbook, data: ExportData): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [32, 22])

  // Fila 1: título.
  const tituloObra = `RESUMEN — ${data.meta.obraNom} (${data.meta.obraCod})`
  applyTitle(ws, tituloObra, 2)

  // Fila 2: subtítulo con CC + período + fecha generación.
  const partesSub: string[] = []
  if (data.meta.obraCC) partesSub.push(`CC ${data.meta.obraCC}`)
  partesSub.push(`Período: ${data.meta.periodoLabel}`)
  partesSub.push(`Generado el ${formatGeneradoEn(data.meta.generadoEn)}`)
  applySubtitle(ws, partesSub.join('  ·  '), 2)

  // Fila 3: separador en blanco.
  ws.getRow(3).height = 8

  if (data.flags.sinDatos) {
    ws.mergeCells(4, 1, 4, 2)
    const c = ws.getCell(4, 1)
    c.value = 'Sin datos en el rango seleccionado.'
    c.font = { name: 'Calibri', size: 11, italic: true }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }
    ws.getRow(4).height = 28
    return
  }

  let row = 4

  // ── Sección: MÉTRICAS DE OPERACIÓN ──────────────────────────────
  row = writeSectionHeader(ws, row, 'MÉTRICAS DE OPERACIÓN')
  const opRows = [
    ['Horas regulares', data.totalesObra.hsRegulares, FMT_HORAS],
    ['Horas extras',    data.totalesObra.hsExtras,    FMT_HORAS],
  ] as const
  const opStart = row
  for (const [label, value, fmt] of opRows) {
    writeKpiRow(ws, row, label, value, fmt)
    row++
  }
  // Total horas con fórmula (B<opStart>+B<opStart+1>).
  writeTotalRow(ws, row, 'Horas totales', {
    formula: `B${opStart}+B${opStart + 1}`,
    result: data.totalesObra.hsTotal,
  }, FMT_HORAS)
  row += 2

  // ── Sección: COSTOS DE LA OBRA ──────────────────────────────────
  row = writeSectionHeader(ws, row, 'COSTOS DE LA OBRA')
  const costoOperRow = row
  writeKpiRow(ws, row, 'Costo operarios',     data.totalesObra.costoOperarios,    FMT_MONEDA)
  row++
  const costoContRow = row
  writeKpiRow(ws, row, 'Costo contratistas',  data.totalesObra.costoContratistas, FMT_MONEDA)
  row++
  // Total costos = suma de los dos.
  const costosTotalRow = row
  writeTotalRow(ws, row, 'Total costos', {
    formula: `B${costoOperRow}+B${costoContRow}`,
    result: data.totalesObra.costoOperarios + data.totalesObra.costoContratistas,
  }, FMT_MONEDA)
  row += 2

  // ── Sección: PRÉSTAMOS Y NETO ───────────────────────────────────
  row = writeSectionHeader(ws, row, 'PRÉSTAMOS Y NETO A PAGAR')
  const otorgadosRow = row
  writeKpiRow(ws, row, 'Préstamos otorgados (+)', data.totalesObra.prestamosOtorgados, FMT_MONEDA)
  row++
  const descuentosRow = row
  writeKpiRow(ws, row, 'Descuentos (−)',          data.totalesObra.descuentos,         FMT_MONEDA)
  row++
  // Neto = total costos + otorgados − descuentos. Referencia a otra fila por celda.
  writeTotalRow(ws, row, 'Neto a pagar', {
    formula: `B${costosTotalRow}+B${otorgadosRow}-B${descuentosRow}`,
    result: data.totalesObra.neto,
  }, FMT_MONEDA)

  // Aviso de operarios sin tarifa vigente al pie (si aplica).
  const sinTarifa = data.operarios.filter(o => o.sinTarifaVigente)
  if (sinTarifa.length > 0) {
    row += 2
    ws.mergeCells(row, 1, row, 2)
    const c = ws.getCell(row, 1)
    c.value = `⚠ ${sinTarifa.length} operario${sinTarifa.length !== 1 ? 's' : ''} sin tarifa vigente — sus costos pueden estar en $0. Revisar tarifas en la obra.`
    c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFC0392B' } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  }
}

// ── Internals ─────────────────────────────────────────────────────

function writeSectionHeader(ws: ExcelJS.Worksheet, row: number, text: string): number {
  ws.mergeCells(row, 1, row, 2)
  const c = ws.getCell(row, 1)
  c.value = text
  applyHeaderRow(ws, row, 2)
  c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  return row + 1
}

function writeKpiRow(
  ws:     ExcelJS.Worksheet,
  row:    number,
  label:  string,
  value:  number,
  fmt:    string,
): void {
  const cLabel = ws.getCell(row, 1)
  cLabel.value     = label
  cLabel.font      = { name: 'Calibri', size: 10 }
  cLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  cLabel.border    = STYLE_DATA.border!

  const cValue = ws.getCell(row, 2)
  cValue.value     = value
  cValue.numFmt    = fmt
  cValue.font      = { name: 'Calibri', size: 10 }
  cValue.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
  cValue.border    = STYLE_DATA.border!
}

function writeTotalRow(
  ws:     ExcelJS.Worksheet,
  row:    number,
  label:  string,
  value:  { formula: string; result: number },
  fmt:    string,
): void {
  const cLabel = ws.getCell(row, 1)
  cLabel.value = label
  cLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

  const cValue = ws.getCell(row, 2)
  cValue.value  = { formula: value.formula, result: value.result }
  cValue.numFmt = fmt
  cValue.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }

  applyTotalRow(ws, row, 2)
}

function formatGeneradoEn(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
