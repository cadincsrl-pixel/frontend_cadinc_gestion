// Libro diario a Excel (tanda 4), en cualquier modo. Función pura `filasDiario`
// (testeable) + la descarga. Columnas: N° | Fecha | Cuenta | Nombre de la
// cuenta | Detalle | Debe | Haber. Por ítem: encabezado, líneas y subtotal.

import type { CtbDiarioItem, CtbDiarioModo } from '@/types/contabilidad.types'
import { fmtFecha } from './contabilidad.utils'
import { descargar, encabezadoRubrica, hojaConFormato, type Celda } from './excelContable'

export const ENCABEZADO_DIARIO: Celda[] = ['N°', 'Fecha', 'Cuenta', 'Nombre de la cuenta', 'Detalle', 'Debe', 'Haber']

const MODO_TITULO: Record<CtbDiarioModo, string> = {
  detallado: 'Detallado',
  dia:       'Resumido por día',
  mes:       'Resumido por mes',
}

export function tituloDiario(modo: CtbDiarioModo): string {
  return `LIBRO DIARIO — ${MODO_TITULO[modo]}`
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Rango de números reales de un resumen: «12 a 57», «12», «s/n» o «12 a 57 (+3 s/n)». */
export function numeroResumen(it: { numero_desde: number | null; numero_hasta: number | null; sin_numero: number; cantidad_asientos: number }): string {
  if (it.sin_numero >= it.cantidad_asientos || it.numero_desde === null) return 's/n'
  const rango = it.numero_desde === it.numero_hasta ? String(it.numero_desde) : `${it.numero_desde} a ${it.numero_hasta}`
  return it.sin_numero > 0 ? `${rango} (+${it.sin_numero} s/n)` : rango
}

/**
 * Las filas del cuerpo (sin el encabezado de rúbrica). La columna N° es la
 * posición correlativa en el libro (`orden`); el número real del asiento o
 * el rango de números va en Detalle.
 */
export function filasDiario(
  items: CtbDiarioItem[],
  totales: { total_debe: number; total_haber: number },
): Celda[][] {
  const out: Celda[][] = [ENCABEZADO_DIARIO]
  for (const it of items) {
    if (it.clase === 'resumen') {
      out.push([it.orden, fmtFecha(it.fecha), null, null, `${it.glosa} · N° ${numeroResumen(it)}`, null, null])
      for (const l of it.lineas) {
        out.push([null, null, l.cuenta_codigo, l.cuenta_nombre, null, l.debe > 0 ? r2(l.debe) : null, l.haber > 0 ? r2(l.haber) : null])
      }
      const d = r2(it.lineas.reduce((s, l) => s + l.debe, 0))
      const h = r2(it.lineas.reduce((s, l) => s + l.haber, 0))
      out.push([null, null, null, null, 'Subtotal', d, h])
    } else {
      const num = it.numero ? `N° ${it.numero}` : 's/n'
      out.push([it.orden, fmtFecha(it.fecha), null, null, `${it.glosa} · ${num}`, null, null])
      for (const l of it.lineas) {
        const det = [l.aux_nombre, l.obra_cod, l.glosa].filter(Boolean).join(' · ') || null
        out.push([null, null, l.cuenta_codigo, l.cuenta_nombre, det, l.debe > 0 ? r2(l.debe) : null, l.haber > 0 ? r2(l.haber) : null])
      }
      const d = r2(it.lineas.reduce((s, l) => s + l.debe, 0))
      const h = r2(it.lineas.reduce((s, l) => s + l.haber, 0))
      out.push([null, null, null, null, 'Subtotal', d, h])
    }
  }
  out.push([])
  out.push([null, null, null, null, 'TOTALES', r2(totales.total_debe), r2(totales.total_haber)])
  const cuadra = Math.round(totales.total_debe * 100) === Math.round(totales.total_haber * 100)
  out.push([null, null, null, null, cuadra ? 'Cuadra' : 'No cuadra', null, null])
  return out
}

export function exportarDiario(o: {
  items: CtbDiarioItem[]
  totales: { total_debe: number; total_haber: number }
  modo: CtbDiarioModo
  desde: string
  hasta: string
  ejercicio: string
}): void {
  const aoa = [
    ...encabezadoRubrica({ titulo: tituloDiario(o.modo), ejercicio: o.ejercicio, rango: `Del ${fmtFecha(o.desde)} al ${fmtFecha(o.hasta)}` }),
    ...filasDiario(o.items, o.totales),
  ]
  const ws = hojaConFormato(aoa, [5, 6], [8, 11, 14, 40, 60, 16, 16])
  descargar(ws, 'Libro diario', `LibroDiario_${o.modo}_${o.desde}_${o.hasta}.xlsx`)
}
