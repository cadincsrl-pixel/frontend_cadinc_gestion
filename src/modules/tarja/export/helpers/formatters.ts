/**
 * Formateo canónico de fechas, períodos y números para el export.
 *
 * Regla del export: las celdas de fecha se escriben como `Date` con `numFmt`
 * (formateo lo hace Excel), no como string. Solo los **labels** de período
 * y los **títulos de hoja** usan strings con formato "Vie 13/3 → Jue 19/3".
 */
import { DIAS, getSemDays, getSemLabel, getViernes, toISO } from '@/lib/utils/dates'

// ── Number formats de exceljs ─────────────────────────────────────
export const FMT_MONEDA      = '"$"#,##0;[Red]"-$"#,##0'
export const FMT_MONEDA_CERO = '"$"#,##0;[Red]"-$"#,##0;"—"'
export const FMT_FECHA       = 'dd/mm/yyyy'
export const FMT_HORAS       = '#,##0.##" hs"'
export const FMT_HORAS_INT   = '#,##0" hs"'

// ── Parsers ───────────────────────────────────────────────────────

/** "2026-03-13" → Date (mediodía local para evitar saltos por TZ). */
export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12)
}

// ── Labels ────────────────────────────────────────────────────────

/** "Vie 13/3 → Jue 19/3" — siempre con el mismo abreviado de día. */
export function fmtPeriodoCorto(semKey: string): string {
  const s = parseISODate(semKey)
  if (!s) return semKey
  const days = getSemDays(s)
  const vie = days[0]!
  const jue = days[6]!
  return `${DIAS[0]} ${vie.getDate()}/${vie.getMonth() + 1} → ${DIAS[6]} ${jue.getDate()}/${jue.getMonth() + 1}`
}

/** Etiqueta para el header del archivo: "Todo el historial" / "Vie 13/3 → Jue 19/3" / "Semana del Vie 13/3 al Jue 19/3 → Vie 17/4 al Jue 23/4". */
export function fmtPeriodoLabel(filtro: { desde: string; hasta: string } | null): string {
  if (!filtro) return 'Todo el historial'
  if (filtro.desde === filtro.hasta) {
    return fmtPeriodoCorto(filtro.desde)
  }
  return `${fmtPeriodoCorto(filtro.desde)}  →  ${fmtPeriodoCorto(filtro.hasta)}`
}

/** Día abreviado para una fecha — usa la tabla DIAS del proyecto (`Vie`, `Sáb`, …). */
export function fmtDiaSemana(d: Date): string {
  // getSemDays + DIAS usan el orden viernes(0) → jueves(6).
  // Pero `d.getDay()` es 0=domingo … 6=sábado en JS estándar.
  // Mapeo: domingo=2, lunes=3, martes=4, miércoles=5, jueves=6, viernes=0, sábado=1.
  const map: Record<number, number> = { 5: 0, 6: 1, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6 }
  const idx = map[d.getDay()]!
  return DIAS[idx]!
}

/** Reexport de helpers de dates para uso del export sin duplicar imports. */
export { toISO, getViernes, getSemDays, getSemLabel }
