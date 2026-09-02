// Matemática pura de liquidaciones de choferes (extraída de LiquidacionesTab.tsx
// para poder testearla — los tests de src/__tests__/liquidacion-math.test.ts
// congelan estos números; si cambiás una fórmula acá, van a gritar A PROPÓSITO).
//
// Fórmula canónica del neto:
//   neto = días × básico/día + kmC × $/kmC + kmV × $/kmV − adelantos + reintegros + estadías

import type { Tramo, Ruta, RelevoPendiente, TarifaEmpresaCantera, Camion } from '@/types/domain.types'
import { tarifaParaFecha, unidadDelCamion } from './tarifas'
import { IVA } from '@/lib/utils/iva'

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


// ── Modalidad pct: % de la facturación neta de los viajes ────────────────────
//
// Pedido del dueño 2026-07-30. Decisiones que fijan la cuenta:
//   · El % es sobre el NETO SIN IVA: ton × tarifa vigente (la MISMA escalera
//     que usa facturación: depósito+unidad > depósito > unidad > general) ÷ 1,21.
//   · Los tramos VACÍOS no pagan (no facturan): se vinculan a la liquidación
//     para salir de "pendientes", pero suman $0.
//   · Un viaje sin facturar se liquida igual, a tarifa vigente — sin esperar
//     la factura del cliente.
//   · El jornal diario es opcional (basico_dia del chofer; 0 = solo %).
//
// CONTRA FACTURA DE INTERMEDIARIOS (2026-09-01, decisión del dueño):
//   Cuando el viaje se le factura a una empresa INTERMEDIARIA (hoy solo
//   LOGISTICA GLOBAL; flag `empresas_transportistas.contra_factura`), esa
//   empresa nos emite una contra factura por su comisión, que RESTA del bruto
//   del viaje. El chofer pct cobra su % sobre lo que efectivamente nos queda:
//
//       neto = (ton × tarifa − comisión_intermediario) ÷ 1,21
//
//   Los dos montos vienen CON IVA, así que la resta va ANTES de la división
//   (sigue habiendo UNA sola división por IVA en todo el flujo pct).
//   · `comision_intermediario = 0` es un valor válido (contra factura por $0):
//     no descuenta nada y NO bloquea.
//   · `comision_intermediario = null` en una empresa marcada = la contra
//     factura TODAVÍA NO LLEGÓ → el tramo cae en `sin_comision` y BLOQUEA el
//     cierre (mismo tratamiento que `sin_tarifa`). El dueño decidió esperar la
//     contra factura antes de liquidar, en vez de liquidar de más y corregir.
//   · Empresa NO marcada → el campo se IGNORA aunque tenga valor.

export interface BasePctResultado {
  /** Σ netos de los viajes cargados: (ton × tarifa − contra factura) ÷ IVA. */
  base_neta:   number
  /** Σ comisiones por tramo, cada una con el % vigente A LA FECHA de ese tramo
   *  (solo si el caller pasó `pctDe`; sin callback queda en 0). */
  subtotal_pct: number
  /** Detalle por tramo para mostrar en el preview y el PDF.
   *  `comision_intermediario` es el monto (CON IVA) que se restó del bruto
   *  antes de netear; 0 cuando la empresa no contra factura. */
  detalle:     Array<{ tramo_id: number; fecha: string | null; ton: number; tarifa_final: number; neto: number; pct: number; comision: number; comision_intermediario: number }>
  /** Tramos cargados SIN tarifa para su empresa/cantera/depósito: bloquean la
   *  liquidación — pagarlos en $0 en silencio sería robarle al chofer. */
  sin_tarifa:  Tramo[]
  /** Tramos cargados con toneladas ≤ 0: no suman comisión, pero se AVISAN —
   *  antes se salteaban en silencio y el chofer perdía el viaje sin enterarse. */
  sin_toneladas: Tramo[]
  /** Tramos cargados de una empresa que contra factura y todavía SIN el monto
   *  de la contra factura (`comision_intermediario == null`): bloquean el
   *  cierre igual que `sin_tarifa` — liquidar antes pagaría un % sobre un
   *  bruto que después baja. OJO: 0 es un monto válido y NO cae acá. */
  sin_comision: Tramo[]
}

export function calcularBasePctViajes(
  tramos:   Tramo[],
  tarifas:  TarifaEmpresaCantera[],
  camiones: Pick<Camion, 'id' | 'categoria'>[],
  /** % vigente a la fecha del tramo (hist versionado — pisa al cache, misma
   *  regla que categoria_tarifas y que el reporte de performance). El caller
   *  resuelve el fallback para fecha null. Sin callback → comisiones en 0. */
  pctDe?:   (fecha: string | null) => number,
  /** ids de empresas con `contra_factura = true` (intermediarias). Solo para
   *  esas empresas se descuenta `comision_intermediario` y se exige que esté
   *  cargado. Default vacío = ninguna contra factura (back-comp con los
   *  callers que no lo pasan). */
  empresasContraFactura: ReadonlySet<number> = new Set<number>(),
): BasePctResultado {
  let base_neta = 0
  let subtotal_pct = 0
  const detalle: BasePctResultado['detalle'] = []
  const sin_tarifa: Tramo[] = []
  const sin_toneladas: Tramo[] = []
  const sin_comision: Tramo[] = []

  for (const t of tramos) {
    if (t.tipo !== 'cargado') continue   // los vacíos no facturan → no pagan
    const ton = Number(t.toneladas_descarga ?? t.toneladas_carga ?? 0)
    if (ton <= 0) { sin_toneladas.push(t); continue }
    const fecha  = t.fecha_descarga ?? t.fecha_carga ?? null
    const tarifa = t.empresa_id != null && t.cantera_id != null
      ? tarifaParaFecha(
          tarifas, t.empresa_id, t.cantera_id, t.deposito_id ?? null,
          fecha,
          unidadDelCamion(camiones as Camion[], t.camion_id),
          // El chofer cobra el % sobre la MISMA variante que se le factura al
          // cliente. Variante sin tarifa → el tramo cae en sin_tarifa (bloquea).
          t.tarifa_variante ?? null,
        )
      : 0
    if (!(tarifa > 0)) { sin_tarifa.push(t); continue }
    // Contra factura del intermediario: resta del bruto (los dos montos con
    // IVA). Sin el monto cargado el viaje BLOQUEA — igual que sin tarifa, no
    // se liquida sobre un bruto que después baja.
    const contraFactura = t.empresa_id != null && empresasContraFactura.has(t.empresa_id)
    if (contraFactura && t.comision_intermediario == null) { sin_comision.push(t); continue }
    const comision_intermediario = contraFactura ? Number(t.comision_intermediario ?? 0) : 0
    const neto     = (ton * tarifa - comision_intermediario) / IVA   // ÚNICA división por IVA de todo el flujo pct
    const pct      = pctDe ? pctDe(fecha) : 0
    const comision = neto * pct / 100
    base_neta    += neto
    subtotal_pct += comision
    detalle.push({ tramo_id: t.id, fecha, ton, tarifa_final: tarifa, neto, pct, comision, comision_intermediario })
  }

  return { base_neta, subtotal_pct, detalle, sin_tarifa, sin_toneladas, sin_comision }
}

/**
 * % efectivo ponderado a persistir en `pct_aplicado`: mantiene el invariante
 * subtotal_pct ≈ base_neta × pct_aplicado / 100 aunque el % haya cambiado en
 * el medio del período (cada tramo cobró el suyo). Con base 0 no hay ponderación
 * posible → cae al % vigente al fin del período (lo pasa el caller).
 */
export function pctAplicadoEfectivo(subtotal_pct: number, base_neta: number, pctFallback: number): number {
  return base_neta > 0 ? (subtotal_pct / base_neta) * 100 : pctFallback
}

export interface TotalesPctInput {
  dias:           number
  /** Jornal diario opcional (0 = el arreglo es solo %). */
  jornal_dia:     number
  /** Σ comisiones por tramo (cada una con el % vigente a SU fecha), ya
   *  calculado por calcularBasePctViajes — acá no se re-aplica ningún %. */
  subtotal_pct:   number
  descuentos:     number   // adelantos
  reintegros:     number   // gastos pagados por el chofer
  total_estadias: number
}

export interface TotalesPct {
  subtotal_bas: number
  subtotal_pct: number
  neto:         number
}

export function calcularTotalesLiquidacionPct(i: TotalesPctInput): TotalesPct {
  const subtotal_bas = i.dias * i.jornal_dia
  return {
    subtotal_bas,
    subtotal_pct: i.subtotal_pct,
    neto: subtotal_bas + i.subtotal_pct - i.descuentos + i.reintegros + i.total_estadias,
  }
}
