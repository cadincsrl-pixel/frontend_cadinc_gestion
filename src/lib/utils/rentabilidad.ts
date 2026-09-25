// =====================================================================
// Cálculo de rentabilidad por viaje.
//
// Función pura que reproduce las fórmulas del Excel YTL_Simulador_Rentabilidad
// (hojas Datos / Simulador). Cada componente del costo está separado para
// mostrar el detalle en la UI ("Resultado en vivo" del modal de viaje).
//
// El cálculo es 100% en cliente — los datos persistidos son inputs, no
// outputs. Si se cambia un parámetro compartido, todos los viajes se
// recalculan automáticamente al renderizar.
// =====================================================================

export type ModalidadPago = 'km_jornal' | 'pct_jornal'

// Días del mes usados para prorratear. Los días por viaje se derivan como
// DIAS_MES / viajes_por_mes (el chofer cobra ~30 jornales al mes sin importar
// cuántos viajes haga; por viaje, el jornal se diluye según la cantidad).
export const DIAS_MES = 30

export interface RentabilidadParametros {
  alicuota_iva:                number   // 0.21
  tipo_cambio_usd_ars:         number
  valor_tractor_usd:           number
  valor_residual_tractor_usd:  number
  vida_util_tractor_km:        number
  valor_semirremolque_usd:     number
  vida_util_batea_anios:       number
  costo_service:               number
  frecuencia_service_km:       number
  costo_cubierta:              number
  cubiertas_por_equipo:        number
  vida_util_neumaticos_km:     number
  cargas_sociales_mensual:     number
  seguros_mensual:             number
  patente_anual:               number
  gomeria_mensual:             number
  lavadero_mensual:            number
  overhead_pct:                number   // 0.01
}

export interface RentabilidadViajeInput {
  /** Km del viaje completo (ida + vuelta). Antes eran dos campos, pero siempre
   *  se usó la suma y en la práctica la ida y la vuelta son el mismo número. */
  km_total:             number
  toneladas:            number
  viajes_por_mes:       number
  tarifa_neta_por_ton:  number
  precio_gasoil:        number
  consumo_camion:       number   // km/L
  peajes_total:         number   // ARS con IVA (ida + vuelta)
  chofer_por_km:        number
  chofer_por_dia:       number
  modalidad_pago:       ModalidadPago
  // Porcentaje como número entero (15 = 15%), misma convención que
  // pct_facturacion en la ficha del chofer. Se aplica sobre la tarifa NETA
  // ya descontada la comisión del dador, igual que en la liquidación real.
  pct_sobre_tarifa:     number   // ej 15
  /** Comisión del dador de carga, entero (8 = 8%). La tarifa que pasa el dador
   *  YA la incluye, así que se descuenta para saber qué entra de verdad.
   *  Opcional: los viajes cargados antes de 20260914y no la tienen. */
  comision_pct?:        number   // ej 8
  /** Vuelve con otra carga (20260929v): se suma al ingreso con sus propias
   *  toneladas, tarifa y comisión. Los km, el gasoil y los peajes no cambian
   *  (ya son de ida + vuelta). Sin esto, la vuelta se supone vacía. */
  vuelve_cargado?:        boolean
  toneladas_vuelta?:      number
  tarifa_vuelta_por_ton?: number
  comision_vuelta_pct?:   number
}

export type Diagnostico =
  | 'sin_datos'
  | 'perdida'
  | 'muy_bajo'
  | 'bajo'
  | 'saludable'
  | 'alto'

export interface RentabilidadResultado {
  // Días por viaje derivados = DIAS_MES / viajes_por_mes.
  dias_por_viaje:            number
  // Desglose de costos directos
  combustible_neto:          number
  pago_chofer:               number
  jornal_chofer:             number
  cargas_sociales_prorr:     number
  peajes_neto:               number
  neumaticos_prorr:          number
  gomeria_prorr:             number
  lavadero_prorr:            number
  costos_directos:           number
  // Desglose de costos fijos
  amortizacion_tractor:      number
  amortizacion_batea:        number
  service:                   number
  seguros_prorr:             number
  patente_prorr:             number
  costos_fijos:              number
  // Totales
  overhead:                  number
  costo_total:               number
  /** Lo que se queda el dador de carga por viaje. No es un costo: ya está
   *  descontado del ingreso. Se expone sólo para poder mostrarlo. */
  comision_dador:            number
  /** Ingreso YA neto de la comisión del dador: ida + vuelta (si vuelve cargado). */
  ingreso:                   number
  /** Lo que deja cada carga, neto de su comisión (20260929v). */
  ingreso_ida:               number
  ingreso_vuelta:            number
  margen:                    number
  margen_pct:                number
  // Margen SIN descontar los costos fijos (amortizaciones, service, seguros,
  // patente). = ingreso − directos − overhead = margen + costos_fijos. Es lo
  // que deja el viaje para cubrir los fijos de la flota + la ganancia.
  margen_sin_fijos:          number
  margen_sin_fijos_pct:      number
  margen_mensual:            number
  margen_anual_usd:          number
  diagnostico:               Diagnostico
}

const RESULTADO_VACIO: Omit<RentabilidadResultado, 'diagnostico'> = {
  dias_por_viaje: 0,
  combustible_neto: 0, pago_chofer: 0, jornal_chofer: 0,
  cargas_sociales_prorr: 0, peajes_neto: 0, neumaticos_prorr: 0,
  gomeria_prorr: 0, lavadero_prorr: 0, costos_directos: 0,
  amortizacion_tractor: 0, amortizacion_batea: 0, service: 0,
  seguros_prorr: 0, patente_prorr: 0, costos_fijos: 0,
  overhead: 0, costo_total: 0, comision_dador: 0, ingreso: 0, ingreso_ida: 0, ingreso_vuelta: 0, margen: 0,
  margen_pct: 0, margen_sin_fijos: 0, margen_sin_fijos_pct: 0,
  margen_mensual: 0, margen_anual_usd: 0,
}

export function calcularRentabilidad(
  v: RentabilidadViajeInput,
  p: RentabilidadParametros,
): RentabilidadResultado {
  // Sin viajes/mes no podemos prorratear los fijos mensuales. Sin tipo de
  // cambio (>0) las amortizaciones en USD colapsarían a 0 e inflarían el margen
  // en silencio → mejor marcar 'sin_datos' que mostrar un margen falso.
  if (v.viajes_por_mes <= 0 || p.tipo_cambio_usd_ars <= 0) {
    return { ...RESULTADO_VACIO, diagnostico: 'sin_datos' }
  }

  const km_total   = v.km_total
  const ivaPlus1   = 1 + p.alicuota_iva   // factor de neteo ARS con IVA → neto

  // ── Comisión del dador de carga ─────────────────────────────────────
  // La tarifa que pasa el dador ya la tiene adentro: lo que entra de verdad es
  // la tarifa menos su comisión. Como es un %, da igual aplicarlo sobre la neta
  // o sobre el bruto (las dos escalan por el mismo IVA).
  //
  // El chofer al % cobra sobre la tarifa YA descontada, que es lo que hace la
  // liquidación real (liquidacion-math.ts: neto = (ton*tarifa − comision)/1,21).
  // Sin esto el simulador se equivocaba en las dos puntas de un viaje con
  // comisión: cobraba de más y le pagaba de más al chofer.
  const comision_pct   = Math.min(Math.max(v.comision_pct ?? 0, 0), 100)
  const tarifa_efectiva = v.tarifa_neta_por_ton * (1 - comision_pct / 100)
  // La vuelta cargada (20260929v) es otra carga, con su propio dador.
  const vuelta          = !!v.vuelve_cargado
  const comision_v_pct  = Math.min(Math.max(v.comision_vuelta_pct ?? 0, 0), 100)
  const tarifa_v        = vuelta ? (v.tarifa_vuelta_por_ton ?? 0) : 0
  const ton_v           = vuelta ? (v.toneladas_vuelta ?? 0) : 0
  const tarifa_v_efectiva = tarifa_v * (1 - comision_v_pct / 100)
  const ingreso_ida     = tarifa_efectiva * v.toneladas
  const ingreso_vuelta  = tarifa_v_efectiva * ton_v
  const comision_dador  = (v.tarifa_neta_por_ton - tarifa_efectiva) * v.toneladas + (tarifa_v - tarifa_v_efectiva) * ton_v

  // ── Costos DIRECTOS por viaje ───────────────────────────────────────
  const combustible_neto      = v.consumo_camion > 0
    ? km_total / v.consumo_camion * v.precio_gasoil / ivaPlus1
    : 0
  // Sueldo / jornal / cargas del chofer: NO se netean de IVA (costo laboral, no
  // lleva IVA — ya son netos). Las cargas sociales son un fijo mensual prorrateado.
  const pago_chofer           = v.modalidad_pago === 'pct_jornal'
    ? (ingreso_ida + ingreso_vuelta) * v.pct_sobre_tarifa / 100
    : km_total * v.chofer_por_km
  // Días por viaje = días del mes / viajes por mes (v.viajes_por_mes > 0 acá,
  // garantizado por el early-return de arriba). El jornal por viaje es el
  // jornal mensual (~30 días) prorrateado entre los viajes del mes.
  const dias_por_viaje        = DIAS_MES / v.viajes_por_mes
  const jornal_chofer         = dias_por_viaje * v.chofer_por_dia
  const cargas_sociales_prorr = p.cargas_sociales_mensual / v.viajes_por_mes
  const peajes_neto           = v.peajes_total / ivaPlus1
  const neumaticos_prorr      = p.vida_util_neumaticos_km > 0
    ? km_total / p.vida_util_neumaticos_km * p.cubiertas_por_equipo * p.costo_cubierta / ivaPlus1
    : 0
  const gomeria_prorr         = p.gomeria_mensual  / ivaPlus1 / v.viajes_por_mes
  const lavadero_prorr        = p.lavadero_mensual / ivaPlus1 / v.viajes_por_mes

  const costos_directos =
    combustible_neto + pago_chofer + jornal_chofer +
    cargas_sociales_prorr + peajes_neto + neumaticos_prorr +
    gomeria_prorr + lavadero_prorr

  // ── Costos FIJOS prorrateados al viaje ──────────────────────────────
  // Amortizaciones: el valor del tractor/batea y el residual se cargan SIN IVA,
  // así que NO se netean. El tractor se clampea a >=0 por si el residual quedó
  // cargado mayor que el valor (typo) → evita una amortización negativa que
  // bajaría el costo e inflaría el margen.
  const amortizacion_tractor  = p.vida_util_tractor_km > 0
    ? Math.max(0, (p.valor_tractor_usd - p.valor_residual_tractor_usd) / p.vida_util_tractor_km * km_total * p.tipo_cambio_usd_ars)
    : 0
  const amortizacion_batea    = p.vida_util_batea_anios > 0
    ? p.valor_semirremolque_usd / p.vida_util_batea_anios / (v.viajes_por_mes * 12) * p.tipo_cambio_usd_ars
    : 0
  const service               = p.frecuencia_service_km > 0
    ? km_total / p.frecuencia_service_km * p.costo_service / ivaPlus1
    : 0
  const seguros_prorr         = p.seguros_mensual / ivaPlus1 / v.viajes_por_mes
  // Patente + tasas: son tributos SIN IVA → no se netean (la VTV sí lleva IVA
  // pero es una fracción menor del rubro).
  const patente_prorr         = p.patente_anual / (v.viajes_por_mes * 12)

  const costos_fijos =
    amortizacion_tractor + amortizacion_batea + service +
    seguros_prorr + patente_prorr

  // ── Overhead + total ────────────────────────────────────────────────
  const overhead     = (costos_directos + costos_fijos) * p.overhead_pct
  const costo_total  = costos_directos + costos_fijos + overhead
  const ingreso      = ingreso_ida + ingreso_vuelta
  const margen       = ingreso - costo_total
  const margen_pct   = ingreso > 0 ? margen / ingreso : 0

  // Margen sin descontar los costos fijos (= margen + costos_fijos). No resta
  // amortizaciones/service/seguros/patente; sí resta directos y overhead.
  const margen_sin_fijos     = margen + costos_fijos
  const margen_sin_fijos_pct = ingreso > 0 ? margen_sin_fijos / ingreso : 0

  const margen_mensual    = margen * v.viajes_por_mes
  const margen_anual_usd  = p.tipo_cambio_usd_ars > 0
    ? margen_mensual * 12 / p.tipo_cambio_usd_ars
    : 0

  let diagnostico: Diagnostico
  if      (margen_pct <  0)    diagnostico = 'perdida'
  else if (margen_pct <  0.05) diagnostico = 'muy_bajo'
  else if (margen_pct <  0.10) diagnostico = 'bajo'
  else if (margen_pct <  0.20) diagnostico = 'saludable'
  else                         diagnostico = 'alto'

  return {
    dias_por_viaje,
    combustible_neto, pago_chofer, jornal_chofer,
    cargas_sociales_prorr, peajes_neto, neumaticos_prorr,
    gomeria_prorr, lavadero_prorr, costos_directos,
    amortizacion_tractor, amortizacion_batea, service,
    seguros_prorr, patente_prorr, costos_fijos,
    overhead, costo_total, comision_dador, ingreso, ingreso_ida, ingreso_vuelta, margen, margen_pct,
    margen_sin_fijos, margen_sin_fijos_pct,
    margen_mensual, margen_anual_usd, diagnostico,
  }
}

// Etiqueta human-readable del diagnóstico (la usa la UI con Badge).
export function diagnosticoLabel(d: Diagnostico): string {
  switch (d) {
    case 'sin_datos': return 'Sin datos'
    case 'perdida':   return 'Pérdida'
    case 'muy_bajo':  return 'Muy bajo'
    case 'bajo':      return 'Bajo'
    case 'saludable': return 'Saludable'
    case 'alto':      return 'Alto'
  }
}
