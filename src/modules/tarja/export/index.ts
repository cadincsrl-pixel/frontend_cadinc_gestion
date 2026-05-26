/**
 * Orquestador del export "Tarja por Obra".
 *
 * Tres modos de uso:
 *   - `exportarTarjaObra(input)`     → 1 obra, descarga XLSX directo.
 *   - `exportarTarjaObras(inputs[])` → N obras, descarga 1 ZIP con N XLSX
 *     individuales + 1 XLSX "Comparativa" con resumen multi-obra y
 *     totales por operario consolidados.
 *   - `buildTarjaObraWorkbook(input)` → solo arma el Workbook (no descarga),
 *     útil para combinar en ZIP.
 */
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { toISO } from '@/lib/utils/dates'
import { collectData } from './collectData'
import { buildResumenSheet } from './builders/buildResumenSheet'
import { buildTotalesOperarioSheet } from './builders/buildTotalesOperarioSheet'
import { buildDetalleSemanalSheet } from './builders/buildDetalleSemanalSheet'
import { buildPlanillasTarjaSheet } from './builders/buildPlanillasTarjaSheet'
import { buildContratistasSheet } from './builders/buildContratistasSheet'
import { buildPrestamosSheet } from './builders/buildPrestamosSheet'
import { buildPersonalSheet } from './builders/buildPersonalSheet'
import { buildComparativaWorkbook } from './buildComparativa'
import type { ExportInput, ExportData } from './types'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ── API pública: 1 obra ───────────────────────────────────────────

export async function exportarTarjaObra(input: ExportInput): Promise<void> {
  const { wb, data } = buildTarjaObraWorkbook(input)
  const blob = await workbookToBlob(wb)
  downloadBlob(blob, buildFilename(data.meta.obraCod, data.meta.generadoEn))
}

// ── API pública: N obras → 1 ZIP ──────────────────────────────────

export async function exportarTarjaObras(inputs: ExportInput[]): Promise<void> {
  if (inputs.length === 0) return
  if (inputs.length === 1) {
    await exportarTarjaObra(inputs[0]!)
    return
  }

  const generadoEn = new Date()
  const zip = new JSZip()

  // Un XLSX individual por obra + recolectar los ExportData para la comparativa.
  const dataPorObra: ExportData[] = []
  for (const input of inputs) {
    const { wb, data } = buildTarjaObraWorkbook(input)
    dataPorObra.push(data)
    const buffer = await wb.xlsx.writeBuffer()
    zip.file(buildFilename(data.meta.obraCod, generadoEn), buffer)
  }

  // XLSX "Comparativa" con resumen multi-obra + totales por operario consolidados.
  const wbComp = buildComparativaWorkbook(dataPorObra)
  const bufferComp = await wbComp.xlsx.writeBuffer()
  zip.file(`TarjaObras_Comparativa_${toISO(generadoEn)}.xlsx`, bufferComp)

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `TarjaObras_${toISO(generadoEn)}.zip`)
}

// ── Internals reutilizables ───────────────────────────────────────

function buildTarjaObraWorkbook(input: ExportInput): { wb: ExcelJS.Workbook; data: ExportData } {
  const data = collectData(input)

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'CADINC ERP'
  wb.created  = data.meta.generadoEn
  wb.modified = data.meta.generadoEn

  buildResumenSheet(wb, data)
  buildTotalesOperarioSheet(wb, data)
  buildDetalleSemanalSheet(wb, data)
  buildPlanillasTarjaSheet(wb, data)
  buildContratistasSheet(wb, data)
  buildPrestamosSheet(wb, data)
  buildPersonalSheet(wb, data)

  return { wb, data }
}

async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildFilename(obraCod: string, generadoEn: Date): string {
  const safe = obraCod.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
  return `TarjaObra_${safe}_${toISO(generadoEn)}.xlsx`
}
