/**
 * Hoja "Salidas de Caja": una fila por cada salida de plata de la semana,
 * lista para que el user las cargue manualmente en caja los viernes
 * después de liquidar.
 *
 * Tres tipos de salida:
 *   - Operarios: 1 fila por (obra, semana). Detalle "N op · NN hs". Monto
 *     consolidado de toda la obra esa semana.
 *   - Contratistas: 1 fila por (obra, semana, contratista). Detalle con
 *     nombre + especialidad + (opcional) descripción de la cert.
 *   - Préstamos otorgados: 1 fila por movimiento. Los descuentos NO van —
 *     entran a caja, no salen.
 *
 * Una tabla larga con autofilter. Filtro por semana → lo que pagás ese
 * viernes; por obra → lo que se pagó a esa obra.
 */
import type ExcelJS from 'exceljs'
import {
  addAutofilter,
  applyDataBorders,
  applyHeaderRow,
  applySubtitle,
  applyTitle,
  applyTotalRow,
  colLetter,
  freezeHeader,
  setColWidths,
} from '../helpers/cells'
import { FMT_FECHA, FMT_MONEDA_CERO } from '../helpers/formatters'
import { sumRange } from '../helpers/formulas'
import type { ExportData } from '../types'

const SHEET_NAME = 'Salidas de Caja'
const HEADERS = [
  'Obra',
  'Cód obra',
  'CC',
  'Semana',
  'Cobro',
  'Concepto',
  'Detalle',
  'Monto',
] as const
const COL_COUNT = HEADERS.length
const HEADER_ROW = 3
const COL = {
  OBRA:     1,
  COD:      2,
  CC:       3,
  SEMANA:   4,
  COBRO:    5,
  CONCEPTO: 6,
  DETALLE:  7,
  MONTO:    8,
} as const

type SalidaConcepto = 'Operarios' | 'Contratista' | 'Préstamos otorgados' | 'Cobranza préstamos'

interface SalidaCaja {
  obraNom:      string
  obraCod:      string
  obraCC:       string | null
  semKey:       string
  periodoCorto: string
  /** `null` para filas consolidadas (Préstamos / Cobranza) que no atan a una semana. */
  cobro:        Date | null
  concepto:     SalidaConcepto
  detalle:      string
  monto:        number
}

export function buildSalidasCajaSheet(wb: ExcelJS.Workbook, datas: ExportData[]): void {
  const ws = wb.addWorksheet(SHEET_NAME)
  setColWidths(ws, [24, 12, 14, 26, 12, 14, 40, 16])

  const titulo = `SALIDAS DE CAJA — ${datas.length} obra${datas.length !== 1 ? 's' : ''}`
  applyTitle(ws, titulo, COL_COUNT)

  const periodos = new Set(datas.map(d => d.meta.periodoLabel))
  const periodoCom = periodos.size === 1 ? [...periodos][0]! : 'rangos mixtos'
  applySubtitle(
    ws,
    `Período: ${periodoCom}  ·  Generado el ${fmtGeneradoEn(datas[0]?.meta.generadoEn ?? new Date())}`,
    COL_COUNT,
  )

  const headerRow = ws.getRow(HEADER_ROW)
  HEADERS.forEach((h, i) => { headerRow.getCell(i + 1).value = h })
  applyHeaderRow(ws, HEADER_ROW, COL_COUNT)

  const salidas = collectSalidas(datas)
  const totalOtorgados  = sumOf(datas, d => d.totalesObra.prestamosOtorgados)
  const totalDescuentos = sumOf(datas, d => d.totalesObra.descuentos)

  if (salidas.length === 0 && totalOtorgados === 0 && totalDescuentos === 0) {
    ws.mergeCells(HEADER_ROW + 1, 1, HEADER_ROW + 1, COL_COUNT)
    const c = ws.getCell(HEADER_ROW + 1, 1)
    c.value = 'Sin salidas en el rango seleccionado.'
    c.font = { name: 'Calibri', size: 11, italic: true }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    freezeHeader(ws, HEADER_ROW)
    return
  }

  let row = HEADER_ROW + 1
  const firstDataRow = row
  for (const s of salidas) {
    writeRow(ws, row, s)
    row++
  }

  // Préstamos otorgados consolidados — al final, sin desglose por operario.
  // Cuentan como salida de caja → entran al rango del TOTAL.
  if (totalOtorgados > 0) {
    writeRow(ws, row, {
      obraNom:      '',
      obraCod:      '',
      obraCC:       null,
      semKey:       '',
      periodoCorto: '',
      cobro:        null,
      concepto:     'Préstamos otorgados',
      detalle:      'Total del período',
      monto:        totalOtorgados,
    })
    row++
  }
  const lastDataRow = row - 1
  applyDataBorders(ws, firstDataRow, lastDataRow, COL_COUNT)

  // Fila TOTAL al pie (operarios + contratistas + préstamos otorgados).
  const totalRow = ws.getRow(row)
  totalRow.getCell(COL.DETALLE).value = 'TOTAL'
  totalRow.getCell(COL.DETALLE).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }

  const montoLetter = colLetter(COL.MONTO)
  const range = `${montoLetter}${firstDataRow}:${montoLetter}${lastDataRow}`
  const tc = totalRow.getCell(COL.MONTO)
  const totalSalidas = salidas.reduce((s, x) => s + x.monto, 0) + totalOtorgados
  tc.value  = { formula: sumRange(range), result: totalSalidas }
  tc.numFmt = FMT_MONEDA_CERO
  tc.alignment = { horizontal: 'right', vertical: 'middle' }
  applyTotalRow(ws, row, COL_COUNT)
  const totalRowIdx = row
  row++

  // Cobranzas (descuentos) — quedan FUERA del TOTAL porque son entradas de
  // caja, no salidas. Una fila gris informativa después del TOTAL.
  if (totalDescuentos > 0) {
    row++ // separador
    writeRow(ws, row, {
      obraNom:      '',
      obraCod:      '',
      obraCC:       null,
      semKey:       '',
      periodoCorto: '',
      cobro:        null,
      concepto:     'Cobranza préstamos',
      detalle:      'Total del período (entrada a caja — no incluido en TOTAL)',
      monto:        totalDescuentos,
    })
    const cobranzaCell = ws.getRow(row).getCell(COL.MONTO)
    cobranzaCell.font = { name: 'Calibri', size: 10, italic: true }
    row++
  }

  freezeHeader(ws, HEADER_ROW)
  // Autofilter cubre solo el rango "salidas + préstamos otorgados + TOTAL".
  // La cobranza queda fuera del filter porque está después del TOTAL.
  addAutofilter(ws, HEADER_ROW, COL_COUNT, totalRowIdx)
}

function writeRow(ws: ExcelJS.Worksheet, rowIdx: number, s: SalidaCaja): void {
  const r = ws.getRow(rowIdx)
  r.getCell(COL.OBRA).value = s.obraNom
  r.getCell(COL.OBRA).alignment = { horizontal: 'left', vertical: 'middle' }

  r.getCell(COL.COD).value = s.obraCod
  r.getCell(COL.COD).alignment = { horizontal: 'center', vertical: 'middle' }

  r.getCell(COL.CC).value = s.obraCC ?? ''
  r.getCell(COL.CC).alignment = { horizontal: 'left', vertical: 'middle' }

  r.getCell(COL.SEMANA).value = s.periodoCorto
  r.getCell(COL.SEMANA).alignment = { horizontal: 'left', vertical: 'middle' }

  if (s.cobro) {
    r.getCell(COL.COBRO).value  = s.cobro
    r.getCell(COL.COBRO).numFmt = FMT_FECHA
  }
  r.getCell(COL.COBRO).alignment = { horizontal: 'center', vertical: 'middle' }

  r.getCell(COL.CONCEPTO).value = s.concepto
  r.getCell(COL.CONCEPTO).alignment = { horizontal: 'left', vertical: 'middle' }

  r.getCell(COL.DETALLE).value = s.detalle
  r.getCell(COL.DETALLE).alignment = { horizontal: 'left', vertical: 'middle' }

  r.getCell(COL.MONTO).value  = s.monto
  r.getCell(COL.MONTO).numFmt = FMT_MONEDA_CERO
  r.getCell(COL.MONTO).alignment = { horizontal: 'right', vertical: 'middle' }
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Construye las salidas detalladas (operarios + contratistas) ordenadas por:
 *   semana ASC → obra alfabética → Operarios → Contratista (alfabético).
 *
 * Los préstamos NO se incluyen acá — van consolidados al final del listado
 * en el caller (1 fila "Préstamos otorgados" sin detalle por operario).
 */
function collectSalidas(datas: ExportData[]): SalidaCaja[] {
  const out: SalidaCaja[] = []

  for (const data of datas) {
    for (const sem of data.semanas) {
      // Operarios consolidados: 1 fila por obra-semana si hay monto > 0.
      if (sem.costoOperarios > 0) {
        const planilla = data.planillas.find(p => p.sem.semKey === sem.semKey)
        const nOperarios = planilla?.operarios.length ?? 0
        out.push({
          obraNom:      data.meta.obraNom,
          obraCod:      data.meta.obraCod,
          obraCC:       data.meta.obraCC,
          semKey:       sem.semKey,
          periodoCorto: sem.periodoCorto,
          cobro:        sem.cobro,
          concepto:     'Operarios',
          detalle:      `${nOperarios} op · ${sem.hsTotal} hs`,
          monto:        sem.costoOperarios,
        })
      }

      // Contratistas de esta obra-semana.
      const contratsSem = data.contratistas
        .filter(c => c.semKey === sem.semKey)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
      for (const c of contratsSem) {
        const detalle = c.descripcion
          ? `${c.nombre} · ${c.especialidad} — ${c.descripcion}`
          : `${c.nombre} · ${c.especialidad}`
        out.push({
          obraNom:      data.meta.obraNom,
          obraCod:      data.meta.obraCod,
          obraCC:       data.meta.obraCC,
          semKey:       sem.semKey,
          periodoCorto: sem.periodoCorto,
          cobro:        sem.cobro,
          concepto:     'Contratista',
          detalle,
          monto:        c.monto,
        })
      }
    }
  }

  return out.sort((a, b) =>
    a.semKey.localeCompare(b.semKey)
    || a.obraNom.localeCompare(b.obraNom)
    || conceptoOrden(a.concepto) - conceptoOrden(b.concepto),
  )
}

function conceptoOrden(c: SalidaConcepto): number {
  return c === 'Operarios' ? 0 : 1
}

function sumOf<T>(items: T[], fn: (it: T) => number): number {
  return items.reduce((s, it) => s + fn(it), 0)
}

function fmtGeneradoEn(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
