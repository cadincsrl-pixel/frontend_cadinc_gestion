// Cuadro de amortizaciones de bienes de uso a Excel (tanda 5). Dos hojas:
// «Cuadro» (un bien por fila, agrupado por rubro con su subtotal) y «Por
// rubro» (los subtotales y el control contra el mayor). Funciones puras
// `filasCuadro` / `filasPorRubro` (testeables) + la descarga.

import * as XLSX from 'xlsx'
import type { CtbCuadroBienes } from '@/types/contabilidad.types'
import { fmtFecha } from './contabilidad.utils'
import { encabezadoRubrica, ejercicioTexto, hojaConFormato, type Celda } from './excelContable'

const r2 = (v: number) => Math.round(Number(v || 0) * 100) / 100

export const ENCABEZADO_CUADRO: Celda[] = [
  'Código', 'Descripción', 'Identificador', 'Fecha de alta', 'Fecha de baja', 'Vida útil (años)',
  'Valor de origen', 'Valor residual', 'Amort. acum. al inicio', 'Amort. del ejercicio', 'Amort. acum. al cierre', 'Valor neto', 'Falta amortizar',
]

/** Columnas con importes (índices en ENCABEZADO_CUADRO). */
export const COLS_NUM_CUADRO = [6, 7, 8, 9, 10, 11, 12]

export function tituloCuadro(hasta: string): string {
  return `CUADRO DE BIENES DE USO Y AMORTIZACIONES al ${fmtFecha(hasta)}`
}

/** Un bloque por rubro (en el orden de `rubros`), con su subtotal, y el total general. */
export function filasCuadro(res: CtbCuadroBienes): Celda[][] {
  const out: Celda[][] = [ENCABEZADO_CUADRO]
  const codigos = res.rubros.map(r => r.rubro_codigo)
  // Rubros que no vinieron en `rubros` (por las dudas): al final, en orden de aparición.
  for (const f of res.filas) if (!codigos.includes(f.rubro_codigo)) codigos.push(f.rubro_codigo)
  for (const cod of codigos) {
    const filas = res.filas.filter(f => f.rubro_codigo === cod)
    const rub = res.rubros.find(r => r.rubro_codigo === cod)
    const nombre = rub?.rubro_nombre ?? filas[0]?.rubro_nombre ?? cod
    out.push([`${cod} ${nombre}`.trim(), null, null, null, null, null, null, null, null, null, null, null, null])
    for (const f of filas) {
      out.push([
        f.codigo, f.descripcion, f.identificador || null, fmtFecha(f.fecha_alta), f.fecha_baja ? fmtFecha(f.fecha_baja) : null,
        f.vida_util_anios ?? 'No se amortiza',
        r2(f.valor_origen), r2(f.valor_residual), r2(f.amort_acum_inicio), r2(f.amort_ejercicio), r2(f.amort_acum_cierre),
        r2(f.valor_neto), r2(f.falta_amortizar_teorico),
      ])
    }
    const s = (k: 'valor_origen' | 'valor_residual' | 'amort_acum_inicio' | 'amort_ejercicio' | 'amort_acum_cierre' | 'valor_neto' | 'falta_amortizar_teorico') =>
      r2(rub ? rub[k] : filas.reduce((a, f) => a + Number(f[k] || 0), 0))
    out.push([
      null, `Total ${nombre}`, null, null, null, null,
      s('valor_origen'), s('valor_residual'), s('amort_acum_inicio'), s('amort_ejercicio'), s('amort_acum_cierre'), s('valor_neto'), s('falta_amortizar_teorico'),
    ])
  }
  const tot = (k: 'valor_origen' | 'valor_residual' | 'amort_acum_inicio' | 'amort_ejercicio' | 'amort_acum_cierre' | 'valor_neto' | 'falta_amortizar_teorico') =>
    r2(res.filas.reduce((a, f) => a + Number(f[k] || 0), 0))
  out.push([])
  out.push([
    null, 'TOTAL GENERAL', null, null, null, null,
    tot('valor_origen'), tot('valor_residual'), tot('amort_acum_inicio'), tot('amort_ejercicio'), tot('amort_acum_cierre'), tot('valor_neto'), tot('falta_amortizar_teorico'),
  ])
  return out
}

export const ENCABEZADO_RUBROS: Celda[] = [
  'Rubro', 'Nombre', 'Bienes', 'Valor de origen', 'Valor residual', 'Amort. acum. al inicio', 'Amort. del ejercicio', 'Amort. acum. al cierre', 'Valor neto', 'Falta amortizar',
]

/** Subtotales por rubro y, abajo, el control inventario contra mayor. */
export function filasPorRubro(res: CtbCuadroBienes): Celda[][] {
  const out: Celda[][] = [ENCABEZADO_RUBROS]
  for (const r of res.rubros) {
    out.push([
      r.rubro_codigo, r.rubro_nombre, r.cantidad, r2(r.valor_origen), r2(r.valor_residual), r2(r.amort_acum_inicio),
      r2(r.amort_ejercicio), r2(r.amort_acum_cierre), r2(r.valor_neto), r2(r.falta_amortizar_teorico),
    ])
  }
  if (res.control_mayor.length > 0) {
    out.push([])
    out.push(['CONTROL CONTRA EL MAYOR'])
    out.push(['Cuenta', 'Nombre', null, 'Inventario', 'Mayor', 'Diferencia'])
    for (const c of res.control_mayor) {
      out.push([c.codigo, c.nombre, null, r2(c.inventario), r2(c.mayor), r2(c.diferencia)])
    }
  }
  return out
}

export function exportarCuadroBienes(res: CtbCuadroBienes): void {
  const cab = encabezadoRubrica({
    titulo: tituloCuadro(res.hasta), ejercicio: ejercicioTexto([res.ejercicio]),
    rango: `Del ${fmtFecha(res.ejercicio.desde)} al ${fmtFecha(res.hasta)}`,
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,
    hojaConFormato([...cab, ...filasCuadro(res)], COLS_NUM_CUADRO, [10, 42, 16, 12, 12, 10, 16, 14, 16, 16, 16, 16, 16]), 'Cuadro')
  XLSX.utils.book_append_sheet(wb,
    hojaConFormato([...cab, ...filasPorRubro(res)], [3, 4, 5, 6, 7, 8, 9], [14, 36, 8, 16, 16, 16, 16, 16, 16, 16]), 'Por rubro')
  XLSX.writeFile(wb, `CuadroBienesDeUso_${res.hasta}.xlsx`)
}
