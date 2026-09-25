// Estados contables a Excel (tanda 4): Estado de situación patrimonial y
// Estado de resultados. Funciones puras `filasBalance` / `filasResultados`
// (testeables) + la descarga. La sangría va con espacios en el nombre.

import type { CtbBalanceRes, CtbEstadoFila, CtbGrupoBalance, CtbResultadosRes } from '@/types/contabilidad.types'
import { fmtFecha } from './contabilidad.utils'
import { descargar, encabezadoRubrica, ejercicioTexto, hojaConFormato, type Celda } from './excelContable'

const r2 = (v: number) => Math.round(v * 100) / 100

function sangria(f: Pick<CtbEstadoFila, 'nivel'>): string {
  return '   '.repeat(Math.max(0, f.nivel - 1))
}

function nombreFila(f: CtbEstadoFila): string {
  return `${sangria(f)}${f.codigo ? `${f.codigo} ` : ''}${f.nombre}`
}

export function tituloBalance(fecha: string): string {
  return `ESTADO DE SITUACIÓN PATRIMONIAL al ${fmtFecha(fecha)}`
}

export function tituloResultados(desde: string, hasta: string): string {
  return `ESTADO DE RESULTADOS del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`
}

/** El grupo (corriente / no corriente) al que pertenece una fila, por prefijo de código. */
export function grupoDeFila(f: Pick<CtbEstadoFila, 'codigo'>, grupos: CtbGrupoBalance[]): CtbGrupoBalance | null {
  if (!f.codigo) return null
  return grupos.find(g => g.codigo && (f.codigo === g.codigo || f.codigo!.startsWith(`${g.codigo}.`))) ?? null
}

/** Filas de una sección con el subtotal de cada grupo al terminar sus filas. */
function seccionConGrupos(filas: CtbEstadoFila[], grupos: CtbGrupoBalance[]): Celda[][] {
  const out: Celda[][] = []
  const impresos = new Set<CtbGrupoBalance>()
  let actual: CtbGrupoBalance | null = null
  for (const f of filas) {
    const g = grupoDeFila(f, grupos)
    if (actual && g !== actual) { out.push([`   Total ${actual.nombre}`, r2(actual.total)]); impresos.add(actual) }
    actual = g
    out.push([nombreFila(f), r2(f.saldo)])
  }
  if (actual) { out.push([`   Total ${actual.nombre}`, r2(actual.total)]); impresos.add(actual) }
  // Grupos sin filas visibles (nivel 1): igual se informa su total.
  for (const g of grupos) if (!impresos.has(g)) out.push([`   Total ${g.nombre}`, r2(g.total)])
  return out
}

/** Cuerpo del balance: Activo, y Pasivo + PN, con totales de las raíces (nunca sumando filas). */
export function filasBalance(res: CtbBalanceRes): Celda[][] {
  const out: Celda[][] = [['Cuenta', 'Saldo']]
  out.push(['ACTIVO', null])
  out.push(...seccionConGrupos(res.activo.filas, res.activo.grupos))
  out.push(['TOTAL ACTIVO', r2(res.activo.total)])
  out.push([])
  out.push(['PASIVO', null])
  out.push(...seccionConGrupos(res.pasivo.filas, res.pasivo.grupos))
  out.push(['TOTAL PASIVO', r2(res.pasivo.total)])
  out.push([])
  out.push(['PATRIMONIO NETO', null])
  for (const f of res.pn.filas) out.push([nombreFila(f), r2(f.saldo)])
  out.push(['TOTAL PATRIMONIO NETO', r2(res.pn.total)])
  out.push([])
  out.push(['TOTAL PASIVO + PATRIMONIO NETO', r2(res.pasivo_mas_pn)])
  out.push([res.cuadra ? 'Cuadra' : `No cuadra: diferencia ${r2(res.diferencia)}`, null])
  if (res.sin_apertura) out.push(['El ejercicio todavía no tiene asiento de apertura: los saldos son solo los movimientos del ejercicio.', null])
  return out
}

/** Cuerpo del estado de resultados; con columnas por mes si es comparativo. */
export function filasResultados(res: CtbResultadosRes): Celda[][] {
  const cols = res.comparativo ? res.columnas : []
  const out: Celda[][] = [['Cuenta', ...cols.map(c => c.etiqueta), 'Total']]
  const fila = (f: CtbEstadoFila): Celda[] => [
    nombreFila(f),
    ...cols.map((_, i) => r2(f.importes?.[i] ?? 0)),
    r2(f.saldo),
  ]
  const total = (label: string, porCol: number[], t: number): Celda[] => [label, ...cols.map((_, i) => r2(porCol[i] ?? 0)), r2(t)]

  out.push(['INGRESOS', ...cols.map(() => null), null])
  for (const f of res.ingresos.filas) out.push(fila(f))
  out.push(total('TOTAL INGRESOS', res.ingresos.totales_col, res.ingresos.total))
  out.push([])
  out.push(['GASTOS', ...cols.map(() => null), null])
  for (const f of res.gastos.filas) out.push(fila(f))
  out.push(total('TOTAL GASTOS', res.gastos.totales_col, res.gastos.total))
  out.push([])
  out.push(total(res.resultado.total >= 0 ? 'RESULTADO (GANANCIA)' : 'RESULTADO (PÉRDIDA)', res.resultado.totales_col, res.resultado.total))
  return out
}

export function exportarBalance(res: CtbBalanceRes): void {
  const aoa = [
    ...encabezadoRubrica({ titulo: tituloBalance(res.fecha), ejercicio: ejercicioTexto([res.ejercicio]), rango: `Al ${fmtFecha(res.fecha)}` }),
    ...filasBalance(res),
  ]
  descargar(hojaConFormato(aoa, [1], [60, 18]), 'Situación patrimonial', `EstadoSituacionPatrimonial_${res.fecha}.xlsx`)
}

export function exportarResultados(res: CtbResultadosRes): void {
  const cuerpo = filasResultados(res)
  const nCols = (cuerpo[0]?.length ?? 2)
  const aoa = [
    ...encabezadoRubrica({ titulo: tituloResultados(res.desde, res.hasta), ejercicio: ejercicioTexto([res.ejercicio]), rango: `Del ${fmtFecha(res.desde)} al ${fmtFecha(res.hasta)}` }),
    ...cuerpo,
  ]
  const numericas = Array.from({ length: nCols - 1 }, (_, i) => i + 1)
  descargar(hojaConFormato(aoa, numericas, [55, ...numericas.map(() => 16)]), 'Resultados', `EstadoResultados_${res.desde}_${res.hasta}.xlsx`)
}
