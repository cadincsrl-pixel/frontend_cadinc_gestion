/**
 * Workbook "General — Salidas de Caja": un único XLSX con una hoja
 * "Salidas de Caja" para que el user cargue las salidas de plata de la
 * semana en la caja después de liquidar el viernes.
 *
 * Las hojas detalladas por obra no van — eso lo cubre el otro flujo
 * (detallado o ZIP comparativo). Acá solo importa el listado de qué se
 * pagó, a quién, en qué obra y cuándo.
 */
import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/config/empresa'
import { buildSalidasCajaSheet } from './builders/buildSalidasCajaSheet'
import type { ExportData } from './types'

export function buildGeneralCajaWorkbook(datas: ExportData[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator  = EMPRESA.nombre
  const generadoEn = datas[0]?.meta.generadoEn ?? new Date()
  wb.created  = generadoEn
  wb.modified = generadoEn

  buildSalidasCajaSheet(wb, datas)

  return wb
}
