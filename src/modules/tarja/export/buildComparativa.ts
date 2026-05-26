/**
 * Workbook "Comparativa" multi-obra:
 *   - Hoja 1 "Resumen Multi-Obra": 1 fila por obra con KPIs + TOTAL GENERAL al pie.
 *   - Hoja 2 "Totales por Operario": 1 fila por (obra, leg) — útil para ver
 *     operarios que tarjaron en más de una obra y cuál fue el pago total
 *     que recibieron sumando obras.
 */
import ExcelJS from 'exceljs'
import { buildResumenMultiObraSheet } from './builders/buildResumenMultiObraSheet'
import { buildTotalesOperarioMultiObraSheet } from './builders/buildTotalesOperarioMultiObraSheet'
import type { ExportData } from './types'

export function buildComparativaWorkbook(datas: ExportData[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'CADINC ERP'
  const generadoEn = datas[0]?.meta.generadoEn ?? new Date()
  wb.created  = generadoEn
  wb.modified = generadoEn

  buildResumenMultiObraSheet(wb, datas)
  buildTotalesOperarioMultiObraSheet(wb, datas)

  return wb
}
