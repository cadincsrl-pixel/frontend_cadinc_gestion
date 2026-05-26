/**
 * Orquestador del export "Tarja por Obra".
 *
 * Tres modos de uso del entry point `exportarTarjaObras(inputs, modo)`:
 *   - `'detallado'`: XLSX detallado por obra. Si N>1, ZIP con XLSX
 *     individuales + Comparativa.
 *   - `'general'`: 1 XLSX "Salidas de Caja" con las salidas de la(s)
 *     semana(s) listadas por obra (operarios consolidados, contratistas
 *     individuales, préstamos otorgados). Para cargar en caja después de
 *     liquidar.
 *   - `'ambos'`: descarga un ZIP con todo lo del detallado + el General.
 *
 * APIs internas reutilizables:
 *   - `buildTarjaObraWorkbook(input)`  → arma Workbook de 1 obra (no descarga).
 */
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { collectData } from './collectData'
import { buildResumenSheet } from './builders/buildResumenSheet'
import { buildTotalesOperarioSheet } from './builders/buildTotalesOperarioSheet'
import { buildDetalleSemanalSheet } from './builders/buildDetalleSemanalSheet'
import { buildPlanillasTarjaSheet } from './builders/buildPlanillasTarjaSheet'
import { buildContratistasSheet } from './builders/buildContratistasSheet'
import { buildPrestamosSheet } from './builders/buildPrestamosSheet'
import { buildPersonalSheet } from './builders/buildPersonalSheet'
import { buildComparativaWorkbook } from './buildComparativa'
import { buildGeneralCajaWorkbook } from './buildGeneralCaja'
import type { ExportInput, ExportData, FiltroSemanas } from './types'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type ExportModo = 'detallado' | 'general' | 'ambos'

// ── API pública ───────────────────────────────────────────────────

/**
 * Entry point único del export. El componente decide qué modo según
 * el radio del modal.
 */
export async function exportarTarjaObras(
  inputs: ExportInput[],
  modo: ExportModo = 'detallado',
): Promise<void> {
  if (inputs.length === 0) return

  // Pre-cómputo de ExportData[]: lo usamos en cualquier modo. Lo armamos
  // una sola vez para no duplicar trabajo.
  const datas: ExportData[] = []
  const workbooks: ExcelJS.Workbook[] = []
  for (const input of inputs) {
    const { wb, data } = buildTarjaObraWorkbook(input)
    datas.push(data)
    workbooks.push(wb)
  }

  // Período común del filtro (asumimos que todos los inputs comparten filtro
  // — es lo que hace el modal). Si en algún momento permitimos por-obra,
  // hay que pasar a "rangos-mixtos".
  const periodo = periodoSlug(inputs[0]!.filtroSem)
  const N = inputs.length

  if (modo === 'general') {
    const wb = buildGeneralCajaWorkbook(datas)
    const blob = await workbookToBlob(wb)
    downloadBlob(blob, `TarjaObras_General_${N}${N === 1 ? 'obra' : 'obras'}_${periodo}.xlsx`)
    return
  }

  if (modo === 'detallado' && N === 1) {
    const blob = await workbookToBlob(workbooks[0]!)
    downloadBlob(blob, obraFilename(datas[0]!.meta.obraNom, periodo))
    return
  }

  // Para 'detallado' con N>1 o 'ambos': ZIP.
  const zip = new JSZip()

  for (let i = 0; i < workbooks.length; i++) {
    const buffer = await workbooks[i]!.xlsx.writeBuffer()
    zip.file(obraFilename(datas[i]!.meta.obraNom, periodo), buffer)
  }

  // Comparativa: solo cuando hay >1 obra y el modo es 'detallado' o 'ambos'.
  if (N > 1) {
    const wbComp = buildComparativaWorkbook(datas)
    const bufferComp = await wbComp.xlsx.writeBuffer()
    zip.file(`TarjaObras_Comparativa_${N}${N === 1 ? 'obra' : 'obras'}_${periodo}.xlsx`, bufferComp)
  }

  if (modo === 'ambos') {
    const wbGen = buildGeneralCajaWorkbook(datas)
    const bufferGen = await wbGen.xlsx.writeBuffer()
    zip.file(`TarjaObras_General_${N}${N === 1 ? 'obra' : 'obras'}_${periodo}.xlsx`, bufferGen)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `TarjaObras_${N}${N === 1 ? 'obra' : 'obras'}_${periodo}.zip`)
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

/** Filename del XLSX detallado por obra: `TarjaObra_<nombre>_<periodo>.xlsx`. */
function obraFilename(obraNom: string, periodo: string): string {
  return `TarjaObra_${sanitize(obraNom)}_${periodo}.xlsx`
}

/**
 * Slug del período para meter en filenames.
 *   - sin filtro            → "todas"
 *   - 1 semana              → "sem-2026-03-13"
 *   - rango                 → "2026-03-13_a_2026-05-22"
 */
function periodoSlug(filtro: FiltroSemanas): string {
  if (!filtro) return 'todas'
  if (filtro.desde === filtro.hasta) return `sem-${filtro.desde}`
  return `${filtro.desde}_a_${filtro.hasta}`
}

/** Colapsa todo lo que no sea `[a-z0-9_-]` a `_` y recorta los `_` del borde. */
function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '')
}
