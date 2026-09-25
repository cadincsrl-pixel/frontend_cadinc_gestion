// Movimientos de fondos a Excel (tanda 5). Función pura `filasMovimientos`
// (testeable) + la descarga. Los anulados salen con su estado y NO suman.

import type { TesMovimiento } from '@/types/contabilidad.types'
import { fmtFecha } from './contabilidad.utils'
import { descargar, encabezadoRubrica, hojaConFormato, type Celda } from './excelContable'
import { numeroMovimiento, tipoMovimiento } from './fondos'

const r2 = (v: number) => Math.round(Number(v || 0) * 100) / 100

export const ENCABEZADO_MOVIMIENTOS: Celda[] = [
  'N°', 'Fecha', 'Tipo', 'Cuenta', 'Destino', 'Concepto', 'Obra', 'Referencia', 'Moneda', 'Importe', 'Cotización', 'Importe en $', 'Estado', 'Asiento', 'Observaciones',
]

export function filasMovimientos(items: TesMovimiento[]): Celda[][] {
  const out: Celda[][] = [ENCABEZADO_MOVIMIENTOS]
  let ingresos = 0
  let egresos = 0
  let transferencias = 0
  for (const m of items) {
    const vigente = m.estado === 'vigente'
    if (vigente) {
      if (m.tipo === 'ingreso') ingresos += m.importe_ars
      else if (m.tipo === 'egreso') egresos += m.importe_ars
      else transferencias += m.importe_ars
    }
    out.push([
      numeroMovimiento(m.numero), fmtFecha(m.fecha), tipoMovimiento(m.tipo).label, m.tesoreria_nombre, m.destino_nombre,
      m.concepto_nombre, m.obra_cod, m.referencia || null, m.tesoreria_moneda, r2(m.importe), m.cotizacion,
      r2(m.importe_ars), vigente ? 'Vigente' : `Anulado: ${m.motivo_anulacion ?? ''}`.trim(),
      m.asiento_id ? (m.asiento_numero ? `N° ${m.asiento_numero}` : 's/n') : 'Sin asiento', m.obs || null,
    ])
  }
  out.push([])
  out.push([null, null, null, null, null, null, null, null, null, null, 'Ingresos', r2(ingresos)])
  out.push([null, null, null, null, null, null, null, null, null, null, 'Egresos', r2(egresos)])
  out.push([null, null, null, null, null, null, null, null, null, null, 'Transferencias', r2(transferencias)])
  return out
}

export function exportarMovimientos(o: { items: TesMovimiento[]; desde: string; hasta: string }): void {
  const rango = o.desde || o.hasta
    ? `Del ${o.desde ? fmtFecha(o.desde) : 'inicio'} al ${o.hasta ? fmtFecha(o.hasta) : 'hoy'}`
    : 'Todas las fechas'
  const aoa = [
    ...encabezadoRubrica({ titulo: 'MOVIMIENTOS DE FONDOS', ejercicio: '', rango }),
    ...filasMovimientos(o.items),
  ]
  descargar(hojaConFormato(aoa, [9, 11], [11, 11, 13, 24, 24, 30, 10, 18, 8, 16, 11, 16, 20, 11, 40]),
    'Movimientos de fondos', `MovimientosFondos_${o.desde || 'inicio'}_${o.hasta || 'hoy'}.xlsx`)
}
