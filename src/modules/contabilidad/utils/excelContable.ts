// Excel de los libros y estados contables (tanda 4). Un encabezado para
// rubricar (razón social, CUIT, ejercicio y rango) y los importes con formato
// numérico `#,##0.00`: SheetJS CE escribe el formato de número (`z`), no estilos.

import * as XLSX from 'xlsx'
import type { CtbEjercicio } from '@/types/contabilidad.types'
import { fmtFecha, fmtFechaHora } from './contabilidad.utils'

export const EMPRESA = { razon_social: 'CADINC S.R.L.', cuit: '33-71719194-9' } as const

export type Celda = string | number | null

export function ejercicioTexto(ejercicios: Pick<CtbEjercicio, 'nombre' | 'desde' | 'hasta'>[]): string {
  if (ejercicios.length === 0) return ''
  if (ejercicios.length === 1) {
    const e = ejercicios[0]!
    return `Ejercicio ${e.nombre} (${fmtFecha(e.desde)} al ${fmtFecha(e.hasta)})`
  }
  return `Ejercicios ${ejercicios.map(e => e.nombre).join(' y ')}`
}

/** Los ejercicios que toca el rango [desde, hasta]. */
export function ejerciciosDelRango<T extends Pick<CtbEjercicio, 'desde' | 'hasta'>>(todos: T[], desde: string, hasta: string): T[] {
  return todos.filter(e => e.desde <= hasta && e.hasta >= desde).sort((a, b) => a.desde.localeCompare(b.desde))
}

export function encabezadoRubrica(o: { titulo: string; ejercicio: string; rango: string; emitido?: string }): Celda[][] {
  return [
    [EMPRESA.razon_social],
    [`CUIT ${EMPRESA.cuit}`],
    [o.titulo],
    [o.ejercicio],
    [o.rango],
    [`Emitido el ${o.emitido ?? fmtFechaHora(new Date().toISOString())}`],
    [],
  ]
}

/** Hoja con formato numérico en las columnas de importes y anchos razonables. */
export function hojaConFormato(aoa: Celda[][], colsNumericas: number[], anchos?: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  aoa.forEach((fila, r) => {
    for (const c of colsNumericas) {
      if (typeof fila[c] !== 'number') continue
      const ref = XLSX.utils.encode_cell({ r, c })
      const cell = ws[ref] as XLSX.CellObject | undefined
      if (cell) cell.z = '#,##0.00'
    }
  })
  if (anchos) ws['!cols'] = anchos.map(wch => ({ wch }))
  return ws
}

export function descargar(ws: XLSX.WorkSheet, hoja: string, nombreArchivo: string): void {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31))
  XLSX.writeFile(wb, nombreArchivo)
}
