/**
 * Orquestador del export "Tarja por Obra" (XLSX, una sola obra).
 *
 * Pipeline:
 *   1. `collectData(input)` → arma `ExportData` (filas y totales derivados).
 *   2. Cada builder agrega una hoja al workbook.
 *   3. `writeBuffer` + descarga via blob link.
 *
 * En este PR (2) solo enchufamos la hoja `Resumen`. Las hojas restantes
 * (Detalle Semanal, Totales por Operario, Planillas Tarja, Contratistas,
 * Préstamos, Personal) se van sumando en los PRs siguientes — cada una
 * en su builder propio.
 */
import ExcelJS from 'exceljs'
import { toISO } from '@/lib/utils/dates'
import { collectData } from './collectData'
import { buildResumenSheet } from './builders/buildResumenSheet'
import { buildTotalesOperarioSheet } from './builders/buildTotalesOperarioSheet'
import { buildDetalleSemanalSheet } from './builders/buildDetalleSemanalSheet'
import { buildPlanillasTarjaSheet } from './builders/buildPlanillasTarjaSheet'
import type { ExportInput } from './types'

export async function exportarTarjaObra(input: ExportInput): Promise<void> {
  const data = collectData(input)

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'CADINC ERP'
  wb.created  = data.meta.generadoEn
  wb.modified = data.meta.generadoEn

  buildResumenSheet(wb, data)
  buildTotalesOperarioSheet(wb, data)
  buildDetalleSemanalSheet(wb, data)
  buildPlanillasTarjaSheet(wb, data)

  // ── Descarga ──
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildFilename(data.meta.obraCod, data.meta.generadoEn)
  a.click()
  URL.revokeObjectURL(url)
}

function buildFilename(obraCod: string, generadoEn: Date): string {
  // Sanitizamos `obraCod` por si tiene espacios u otros caracteres raros.
  const safe = obraCod.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
  return `TarjaObra_${safe}_${toISO(generadoEn)}.xlsx`
}
