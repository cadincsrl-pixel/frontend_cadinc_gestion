/**
 * Helpers para armar fórmulas de Excel desde código.
 *
 * Decisiones:
 *  - Las referencias entre hojas usan `'NombreHoja'!Col$From:$To` con `$`
 *    para que sigan apuntando al rango correcto si alguien arrastra fórmulas.
 *  - Si el nombre de hoja tiene espacios, exceljs se encarga del escape al
 *    serializar — nosotros igual ponemos comillas simples por seguridad.
 *  - Para `SUMIFS`, devolvemos el string completo (sin el `=` inicial; exceljs
 *    lo agrega al setear `cell.value = { formula: ... }`).
 */
import { colLetter } from './cells'

/** "'Detalle Semanal'!$E$4:$E$50" */
export function rangeRef(
  sheet:     string,
  col:       number | string,
  fromRow:   number,
  toRow:     number,
  absolute = true,
): string {
  const letter = typeof col === 'string' ? col : colLetter(col)
  const $ = absolute ? '$' : ''
  return `'${sheet}'!${$}${letter}${$}${fromRow}:${$}${letter}${$}${toRow}`
}

/** "'Detalle Semanal'!$G$4" */
export function cellRef(
  sheet:    string,
  col:      number | string,
  row:      number,
  absolute = true,
): string {
  const letter = typeof col === 'string' ? col : colLetter(col)
  const $ = absolute ? '$' : ''
  return `'${sheet}'!${$}${letter}${$}${row}`
}

/**
 * SUMIFS con criterios variádicos. `criteria` puede ser:
 *  - número/string literal → se cita: `"...""`
 *  - referencia a celda → se pasa tal cual (ej: "B4")
 *
 * Detección heurística: si empieza con letra mayúscula seguida de número
 * (o tiene `!`), lo tratamos como referencia.
 */
export function sumifs(
  sumRange: string,
  pairs:    Array<{ range: string; criteria: string | number }>,
): string {
  const parts: string[] = [sumRange]
  for (const p of pairs) {
    parts.push(p.range)
    parts.push(formatCriteria(p.criteria))
  }
  return `SUMIFS(${parts.join(', ')})`
}

/** SUM(range) — wrapper trivial para consistencia visual. */
export function sumRange(range: string): string {
  return `SUM(${range})`
}

/** Forma `A4-B4+C4` para neto = bruto + otorgados − descuentos. */
export function netoFormula(
  bruto:       string,
  otorgados:   string,
  descuentos:  string,
): string {
  return `${bruto}+${otorgados}-${descuentos}`
}

// ── Internals ─────────────────────────────────────────────────────

function formatCriteria(c: string | number): string {
  if (typeof c === 'number') return String(c)
  // Referencia a celda: A4, $A$4, Sheet!A4
  if (/^[A-Z$]+\$?\d+$/.test(c) || c.includes('!')) return c
  // Literal string → escape comillas dobles + envolver
  return `"${c.replace(/"/g, '""')}"`
}
