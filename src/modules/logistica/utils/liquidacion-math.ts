// Matemática pura de liquidaciones de choferes (extraída de LiquidacionesTab.tsx
// para poder testearla — los tests de src/__tests__/liquidacion-math.test.ts
// congelan estos números; si cambiás una fórmula acá, van a gritar A PROPÓSITO).
//
// Fórmula canónica del neto:
//   neto = días × básico/día + kmC × $/kmC + kmV × $/kmV − adelantos + reintegros + estadías

import type { Tramo, Ruta, RelevoPendiente } from '@/types/domain.types'

/** Fechas únicas de tramos completados */
export function diasUnicos(tramos: Tramo[]): number {
  const inicios = tramos.map(t => t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  const fines   = tramos.map(t => t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  if (!inicios.length) return 0
  const desde = inicios.reduce((a, b) => a < b ? a : b)
  const hasta = fines.length ? fines.reduce((a, b) => a > b ? a : b) : desde
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

/** Días calendario entre dos fechas (inclusive) */
export function diasEntreFechas(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

// Devuelve la fecha "representativa" de un tramo según su tipo:
// cargado → fecha_carga, vacio → fecha_vacio. Para filtros de rango.
export function fechaTramo(t: Tramo): string | null {
  return (t.tipo === 'vacio' ? t.fecha_vacio : t.fecha_carga) ?? null
}

export function tramoEnRango(t: Tramo, desde?: string, hasta?: string): boolean {
  const f = fechaTramo(t)
  if (!f) return false
  if (desde && f < desde) return false
  if (hasta && f > hasta) return false
  return true
}

// Lookup DIRECCIONAL cantera→depósito. cantera_id y deposito_id salen de
// tablas DISTINTAS (canteras/depositos) con ids solapados, así que el match
// invertido (cantera↔depósito) podía devolver la ruta de OTRO par por
// colisión de ids (ej. tramo DELTA ARENAS→MASUR agarraba YESO→BASE NEXA).
// Cada tramo apunta a su ruta del sentido real — igual que ViajesTab.
export function kmTramo(t: Tramo, rutas: Ruta[]): number {
  if (!t.cantera_id || !t.deposito_id) return 0
  const ruta = rutas.find(r =>
    r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id
  )
  return ruta?.km_ida_vuelta ?? 0
}

// ── Helpers de relevos (Fase 2) ──
// Fecha representativa del tramo embebido en una fila de relevo (igual criterio
// que fechaTramo: cargado→fecha_carga, vacio→fecha_vacio).
export function fechaRelevo(r: RelevoPendiente): string | null {
  if (!r.tramo) return null
  return (r.tramo.tipo === 'vacio' ? r.tramo.fecha_vacio : r.tramo.fecha_carga) ?? null
}

// Km de la PATA del relevo (lo que manejó ese chofer), según el tipo del tramo.
export function kmRelevo(r: RelevoPendiente): number {
  if (!r.tramo) return 0
  return r.tramo.tipo === 'vacio' ? Number(r.km_vacio) : Number(r.km_cargado)
}

export function relevoEnRango(r: RelevoPendiente, desde?: string, hasta?: string): boolean {
  const f = fechaRelevo(r)
  if (!f) return false
  if (desde && f < desde) return false
  if (hasta && f > hasta) return false
  return true
}

// Rango de fechas combinando tramos propios + tramos de relevo (para encuadrar
// el período por default al abrir el modal cuando el chofer solo tiene relevos).
export function rangoConRelevos(tramos: Tramo[], relevos: RelevoPendiente[]): { desde: string; hasta: string } {
  const fechas: string[] = []
  for (const t of tramos) {
    const f = t.fecha_carga ?? t.fecha_vacio
    const g = t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio
    if (f) fechas.push(f)
    if (g) fechas.push(g)
  }
  for (const r of relevos) {
    const f = fechaRelevo(r)
    if (f) fechas.push(f)
  }
  if (!fechas.length) return { desde: '', hasta: '' }
  return { desde: fechas.reduce((a, b) => a < b ? a : b), hasta: fechas.reduce((a, b) => a > b ? a : b) }
}

// Reparto del básico con relevos: parte de `baseDias` (días del rango), resta
// los días cubiertos EXCLUSIVAMENTE por relevos (no los que ya tienen tramo
// propio) y suma Σ jornales del relevo. Así cada chofer cobra su jornal del
// relevo sin duplicar el día. Devuelve los días efectivos (>= 0).
export function diasConRelevos(baseDias: number, desde: string, hasta: string, ownDates: Set<string>, relevos: RelevoPendiente[]): number {
  const restar = new Set<string>()
  let jornales = 0
  for (const r of relevos) {
    jornales += Number(r.jornales ?? 0)
    const f = fechaRelevo(r)
    if (f && baseDias > 0 && (!desde || f >= desde) && (!hasta || f <= hasta) && !ownDates.has(f)) {
      restar.add(f)
    }
  }
  return Math.max(0, baseDias - restar.size + jornales)
}

// ── Agregación final ──────────────────────────────────────────────────────────
export interface TotalesLiquidacionInput {
  dias:             number
  basico_dia:       number
  km_cargados:      number
  precio_km_cargado: number
  km_vacios:        number
  precio_km_vacio:  number
  descuentos:       number   // Σ adelantos (RESTAN)
  reintegros:       number   // Σ gastos pagados por el chofer (SUMAN)
  total_estadias:   number   // Σ estadías (SUMAN)
}

export interface TotalesLiquidacion {
  subtotal_bas:        number
  subtotal_km_cargado: number
  subtotal_km_vacio:   number
  subtotal_km:         number
  km_totales:          number
  /** Promedio ponderado para back-compat con la columna `precio_km`. */
  precio_km:           number
  neto:                number
}

export function calcularTotalesLiquidacion(i: TotalesLiquidacionInput): TotalesLiquidacion {
  const subtotal_bas        = i.dias * i.basico_dia
  const subtotal_km_cargado = i.km_cargados * i.precio_km_cargado
  const subtotal_km_vacio   = i.km_vacios   * i.precio_km_vacio
  const subtotal_km         = subtotal_km_cargado + subtotal_km_vacio
  const km_totales          = i.km_cargados + i.km_vacios
  const precio_km           = km_totales > 0 ? subtotal_km / km_totales : i.precio_km_cargado
  return {
    subtotal_bas, subtotal_km_cargado, subtotal_km_vacio, subtotal_km, km_totales, precio_km,
    neto: subtotal_bas + subtotal_km - i.descuentos + i.reintegros + i.total_estadias,
  }
}
