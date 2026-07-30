/**
 * Amortización de equipos (tractores + bateas) para el "margen económico" de
 * Gastos > Reportes.
 *
 * Pedido del dueño (2026-07-30): "¿cómo podemos tener otro margen descontando
 * la amortización del equipo?". El margen real de Reportes es caja operativa y
 * no reserva nada para reponer los camiones; este cálculo agrega esa reserva
 * usando los MISMOS parámetros y fórmulas del simulador de Rentabilidad
 * (src/lib/utils/rentabilidad.ts), aplicados a los km y días REALES del
 * período filtrado.
 *
 * Qué NO incluye, a propósito:
 * - Cubiertas y services: ya entran a Reportes como gastos reales el mes en
 *   que se pagan. Meterlos acá también sería el doble conteo que el dueño
 *   preguntó explícitamente si existía.
 * - Seguros y patente: ídem — se cargan como gastos cuando se pagan.
 * Amortización acá = SOLO el desgaste del capital (tractor por km, batea por
 * tiempo), que no tiene comprobante posible.
 *
 * Los valores USD y las vidas útiles se cargan SIN IVA (igual que en el
 * simulador), así que no se netean.
 */

export interface ParametrosAmortizacion {
  valor_tractor_usd:          number
  valor_residual_tractor_usd: number
  vida_util_tractor_km:       number
  valor_semirremolque_usd:    number
  vida_util_batea_anios:      number
  tipo_cambio_usd_ars:        number
}

export interface AmortizacionEquipos {
  tractores: number
  bateas:    number
  total:     number
}

/**
 * @param kmPeriodo      Km reales recorridos por la flota propia en el período
 *                       (cargados + vacíos, por ruta).
 * @param diasPeriodo    Días de calendario del período filtrado.
 * @param cantidadEquipos Cantidad de equipos propios (camión + batea van
 *                       siempre juntos — regla operativa del 29/07).
 *
 * Devuelve null si faltan parámetros para calcular sin inventar (tipo de
 * cambio en 0, vidas útiles en 0): mejor no mostrar el margen económico que
 * mostrar uno falso — el mismo criterio 'sin_datos' del simulador.
 */
export function amortizacionEquipos(
  params: ParametrosAmortizacion | null | undefined,
  kmPeriodo: number,
  diasPeriodo: number,
  cantidadEquipos: number,
): AmortizacionEquipos | null {
  if (!params) return null
  const tc = Number(params.tipo_cambio_usd_ars)
  if (!(tc > 0)) return null
  if (!(Number(params.vida_util_tractor_km) > 0)) return null
  if (!(Number(params.vida_util_batea_anios) > 0)) return null

  // Tractor: por km. Clamp a >=0 por si el residual quedó cargado mayor que el
  // valor (mismo guard que el simulador — un typo no puede INFLAR el margen).
  const usdPorKm = Math.max(0, Number(params.valor_tractor_usd) - Number(params.valor_residual_tractor_usd))
    / Number(params.vida_util_tractor_km)
  const tractores = usdPorKm * kmPeriodo * tc

  // Batea: por tiempo (no se desgasta por km sino por años), prorrateada a los
  // días del período y multiplicada por la cantidad de equipos propios.
  const bateas = Number(params.valor_semirremolque_usd) / Number(params.vida_util_batea_anios) / 365
    * Math.max(0, diasPeriodo) * tc * Math.max(0, cantidadEquipos)

  return { tractores, bateas, total: tractores + bateas }
}
