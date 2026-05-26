/**
 * Helpers de bajo nivel sobre `ExcelJS.Worksheet`: aplicar estilos a una fila
 * o rango, setear anchos de columna, congelar header, agregar autofilter.
 *
 * Convención: los builders trabajan con índices 1-based de exceljs y nunca
 * tocan el `.style`/`.fill`/`.border` directo de las celdas — pasan por estos
 * helpers.
 */
import type ExcelJS from 'exceljs'
import {
  STYLE_TITLE,
  STYLE_SUBTITLE,
  STYLE_TABLE_HEADER,
  STYLE_SUBTOTAL,
  STYLE_TOTAL,
  STYLE_DATA,
} from './styles'

// ── Helpers de columna A=1, B=2, ..., Z=26, AA=27, ... ─────────────

/** 1 → "A", 27 → "AA". */
export function colLetter(idx: number): string {
  if (idx < 1) throw new Error(`colLetter: idx debe ser >=1, recibí ${idx}`)
  let n = idx
  let res = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    res = String.fromCharCode(65 + rem) + res
    n = Math.floor((n - 1) / 26)
  }
  return res
}

// ── Aplicar estilos a filas ───────────────────────────────────────

/**
 * Setea el título de la hoja (fila 1, merged hasta `lastCol`).
 * Eleva la altura de fila para que quede prominente.
 */
export function applyTitle(
  ws: ExcelJS.Worksheet,
  text: string,
  lastCol: number,
): void {
  ws.mergeCells(1, 1, 1, lastCol)
  const cell = ws.getCell(1, 1)
  cell.value = text
  cell.font      = STYLE_TITLE.font!
  cell.alignment = STYLE_TITLE.alignment!
  cell.fill      = STYLE_TITLE.fill!
  ws.getRow(1).height = 26
}

/** Fila de subtítulo (fila 2 por convención): merged + estilo claro. */
export function applySubtitle(
  ws: ExcelJS.Worksheet,
  text: string,
  lastCol: number,
  rowIdx = 2,
): void {
  ws.mergeCells(rowIdx, 1, rowIdx, lastCol)
  const cell = ws.getCell(rowIdx, 1)
  cell.value = text
  cell.font      = STYLE_SUBTITLE.font!
  cell.alignment = STYLE_SUBTITLE.alignment!
  cell.fill      = STYLE_SUBTITLE.fill!
  ws.getRow(rowIdx).height = 18
}

/**
 * Aplica el estilo de header a una fila completa. Asume que los `value` ya
 * están seteados — solo aplica fill, font, border, alignment.
 */
export function applyHeaderRow(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number): void {
  const row = ws.getRow(rowIdx)
  for (let i = 1; i <= colCount; i++) {
    const c = row.getCell(i)
    c.font      = STYLE_TABLE_HEADER.font!
    c.alignment = STYLE_TABLE_HEADER.alignment!
    c.fill      = STYLE_TABLE_HEADER.fill!
    c.border    = STYLE_TABLE_HEADER.border!
  }
  row.height = 22
}

/** Aplica el estilo de subtotal (gris claro + negrita) a una fila. */
export function applySubtotalRow(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number): void {
  const row = ws.getRow(rowIdx)
  for (let i = 1; i <= colCount; i++) {
    const c = row.getCell(i)
    c.font   = STYLE_SUBTOTAL.font!
    c.fill   = STYLE_SUBTOTAL.fill!
    c.border = STYLE_SUBTOTAL.border!
  }
}

/** Aplica el estilo de total general (border doble + fondo gris medio). */
export function applyTotalRow(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number): void {
  const row = ws.getRow(rowIdx)
  for (let i = 1; i <= colCount; i++) {
    const c = row.getCell(i)
    c.font   = STYLE_TOTAL.font!
    c.fill   = STYLE_TOTAL.fill!
    c.border = STYLE_TOTAL.border!
  }
  row.height = 20
}

/**
 * Aplica borde hairline a un rango de datos. Útil para el "cuerpo" de la
 * tabla, no para headers ni totales (que ya traen border propio).
 */
export function applyDataBorders(
  ws: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  colCount: number,
): void {
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).border = STYLE_DATA.border!
    }
  }
}

// ── Layout helpers ────────────────────────────────────────────────

/** Setea anchos de columna en orden (índice 1-based). */
export function setColWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
}

/**
 * Congela las primeras `frozenRows` filas. Útil para que el header siga
 * visible al hacer scroll. Por defecto congela header de fila 3.
 */
export function freezeHeader(ws: ExcelJS.Worksheet, frozenRows = 3): void {
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: frozenRows }]
}

/**
 * Habilita autofilter sobre un rango. `headerRow` es la fila del header.
 * `colCount` cuántas columnas cubre.
 */
export function addAutofilter(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  colCount: number,
  lastDataRow: number,
): void {
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to:   { row: lastDataRow, column: colCount },
  }
}
