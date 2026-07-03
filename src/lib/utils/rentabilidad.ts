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
  km_ida:               number
  km_vuelta:            number
  toneladas:            number
  viajes_por_mes:       number
  tarifa_neta_por_ton:  number
  precio_gasoil:        number
  consumo_camion:       number   // km/L
  peajes_total:         number   // ARS con IVA (ida + vuelta)
  chofer_por_km:        number
  chofer_por_dia:       number
  modalidad_pago:       ModalidadPago
  pct_sobre_tarifa:     number   // ej 0.15
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
  ingreso:                   number
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
  overhead: 0, costo_total: 0, ingreso: 0, margen: 0,
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

  const km_total   = v.km_ida + v.km_vuelta
  const ivaPlus1   = 1 + p.alicuota_iva   // factor de neteo ARS con IVA → neto

  // ── Costos DIRECTOS por viaje ───────────────────────────────────────
  const combustible_neto      = v.consumo_camion > 0
    ? km_total / v.consumo_camion * v.precio_gasoil / ivaPlus1
    : 0
  // Sueldo / jornal / cargas del chofer: NO se netean de IVA (costo laboral, no
  // lleva IVA — ya son netos). Las cargas sociales son un fijo mensual prorrateado.
  const pago_chofer           = v.modalidad_pago === 'pct_jornal'
    ? v.tarifa_neta_por_ton * v.toneladas * v.pct_sobre_tarifa
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
  const ingreso      = v.tarifa_neta_por_ton * v.toneladas
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
    overhead, costo_total, ingreso, margen, margen_pct,
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
