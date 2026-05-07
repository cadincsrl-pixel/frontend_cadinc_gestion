// Helpers para cruzar tramos + cobros + tarifas y calcular performance
// (ingresos, toneladas, viajes) agrupada por camión y chofer en un rango.
//
// Decisiones de cálculo:
// - Solo tramos `tipo='cargado' && estado='completado'` con `fecha_descarga`
//   en el rango se cuentan como "viaje" (un viaje cargado entrega producto y
//   genera ingreso).
// - Ingreso por tramo:
//   1) Si `cobro_id != null` → prorratea `cobro.total` por toneladas del
//      tramo sobre toneladas totales del cobro. Esto vale tanto para cobros
//      `pendiente` como `cobrado` (se considera facturación, no caja real).
//   2) Si `cobro_id == null` (todavía no facturado) → ingreso teórico =
//      `tarifa.valor_ton × ton_tramo`. La tarifa vigente es la más reciente
//      con `vigente_desde <= fecha_descarga` para el par (empresa, cantera).
//   3) Si no hay tarifa cargada → ingreso 0 + flag `sin_tarifa`.
// - Tramos sin empresa/cantera registrados se excluyen.

import type { Tramo, Cobro, TarifaEmpresaCantera, Liquidacion, Chofer } from '@/types/domain.types'

interface PerformanceFila {
  // id de la entidad agregada (camion_id o chofer_id)
  entidad_id:    number
  viajes:        number
  toneladas:     number
  ingresos:      number
  // Costo de mano de obra: suma de subtotal_basico + subtotal_km de las
  // liquidaciones cerradas asociadas al chofer/camión en el rango.
  // 0 si no se pasaron liquidaciones al cálculo.
  costo_mo:      number
  // Cuántos tramos se contaron sin tarifa cargada (ingreso = 0).
  sin_tarifa:    number
  // Cuántos tramos están sin cobrar todavía (ingreso teórico).
  sin_cobrar:    number
}

export interface PerformanceResultado {
  por_camion:        PerformanceFila[]
  por_chofer:        PerformanceFila[]
  totales: {
    viajes:    number
    toneladas: number
    ingresos:  number
    costo_mo:  number
  }
}

/**
 * Tarifa $/ton vigente para (empresa, cantera) a una fecha.
 * Retorna 0 si no hay tarifa con `vigente_desde <= fecha`.
 */
function tarifaVigentePara(
  tarifas: TarifaEmpresaCantera[],
  empresaId: number,
  canteraId: number,
  fecha: string,
): number {
  let mejor: TarifaEmpresaCantera | null = null
  for (const t of tarifas) {
    if (t.empresa_id !== empresaId) continue
    if (t.cantera_id !== canteraId) continue
    if (t.vigente_desde > fecha)    continue
    if (!mejor || t.vigente_desde > mejor.vigente_desde) mejor = t
  }
  return mejor?.valor_ton ?? 0
}

/**
 * Filtra tramos relevantes (cargado + completado + fecha en rango), calcula
 * ingreso por tramo, y agrega por camión y chofer. Si se pasan liquidaciones
 * cerradas + choferes, también suma el costo de mano de obra (básico + km
 * pagados al chofer) para calcular el margen real.
 *
 * Política de costo MO:
 * - Solo liquidaciones con `estado='cerrada'` y `fecha_hasta` en el rango.
 * - Costo bruto = `subtotal_basico + subtotal_km` (lo que la empresa eroga
 *   por el trabajo del chofer; los adelantos ya están adelantados, los
 *   reintegros corresponden a gastos en `gastos_logistica`, así que esos
 *   no se suman acá para no doble-contar).
 * - Camión asignado: `chofer.camion_id` actual. Aproximación; si el chofer
 *   cambió de camión durante el período, el costo va al camión actual.
 *
 * @param desde  ISO yyyy-mm-dd inclusive
 * @param hasta  ISO yyyy-mm-dd inclusive
 */
export function calcularPerformance(
  tramos:        Tramo[],
  cobros:        Cobro[],
  tarifas:       TarifaEmpresaCantera[],
  desde:         string,
  hasta:         string,
  liquidaciones: Liquidacion[] = [],
  choferes:      Chofer[]      = [],
): PerformanceResultado {
  // Mapa cobro_id → cobro para lookup O(1).
  const cobroPorId = new Map<number, Cobro>()
  for (const c of cobros) cobroPorId.set(c.id, c)

  // Acumuladores por entidad.
  const accCamion = new Map<number, PerformanceFila>()
  const accChofer = new Map<number, PerformanceFila>()
  const totales = { viajes: 0, toneladas: 0, ingresos: 0, costo_mo: 0 }

  function getOrInit(map: Map<number, PerformanceFila>, id: number): PerformanceFila {
    let f = map.get(id)
    if (!f) {
      f = { entidad_id: id, viajes: 0, toneladas: 0, ingresos: 0, costo_mo: 0, sin_tarifa: 0, sin_cobrar: 0 }
      map.set(id, f)
    }
    return f
  }

  for (const t of tramos) {
    if (t.tipo !== 'cargado')       continue
    if (t.estado !== 'completado')  continue
    if (!t.fecha_descarga)          continue
    if (t.fecha_descarga < desde)   continue
    if (t.fecha_descarga > hasta)   continue

    // Tomamos toneladas descargadas; si vino null/undefined, fallback a las
    // de carga. Si ambas son 0 o negativas (dato sucio), se descarta el
    // tramo del agregado — no aporta ni a viajes ni a ingresos.
    const ton = t.toneladas_descarga ?? t.toneladas_carga ?? 0
    if (ton <= 0) continue

    let ingreso = 0
    let sinTarifa = false
    let sinCobrar = false

    if (t.cobro_id != null) {
      // Tiene cobro: prorrateo por toneladas.
      const cobro = cobroPorId.get(t.cobro_id)
      if (cobro && cobro.toneladas_totales > 0) {
        ingreso = cobro.total * (ton / cobro.toneladas_totales)
      }
    } else {
      // Sin cobro: tarifa vigente.
      sinCobrar = true
      if (t.empresa_id != null && t.cantera_id != null) {
        const tarifa = tarifaVigentePara(tarifas, t.empresa_id, t.cantera_id, t.fecha_descarga)
        if (tarifa > 0) {
          ingreso = tarifa * ton
        } else {
          sinTarifa = true
        }
      } else {
        sinTarifa = true
      }
    }

    // Agregar a camión y chofer.
    const fc = getOrInit(accCamion, t.camion_id)
    fc.viajes    += 1
    fc.toneladas += ton
    fc.ingresos  += ingreso
    if (sinTarifa) fc.sin_tarifa += 1
    if (sinCobrar) fc.sin_cobrar += 1

    const fch = getOrInit(accChofer, t.chofer_id)
    fch.viajes    += 1
    fch.toneladas += ton
    fch.ingresos  += ingreso
    if (sinTarifa) fch.sin_tarifa += 1
    if (sinCobrar) fch.sin_cobrar += 1

    totales.viajes    += 1
    totales.toneladas += ton
    totales.ingresos  += ingreso
  }

  // ── Costo de mano de obra por liquidaciones cerradas en rango ──
  const choferPorId = new Map<number, Chofer>()
  for (const c of choferes) choferPorId.set(c.id, c)

  for (const liq of liquidaciones) {
    if (liq.estado !== 'cerrada')   continue
    if (!liq.fecha_hasta)            continue
    if (liq.fecha_hasta < desde)    continue
    if (liq.fecha_hasta > hasta)    continue

    const costo = Number(liq.subtotal_basico ?? 0) + Number(liq.subtotal_km ?? 0)
    if (costo <= 0) continue

    // Por chofer (siempre identificado).
    const fch = getOrInit(accChofer, liq.chofer_id)
    fch.costo_mo += costo

    // Por camión: usamos el camión asignado actual del chofer.
    const chofer = choferPorId.get(liq.chofer_id)
    if (chofer?.camion_id != null) {
      const fc = getOrInit(accCamion, chofer.camion_id)
      fc.costo_mo += costo
    }
    totales.costo_mo += costo
  }

  return {
    por_camion: [...accCamion.values()].sort((a, b) => b.ingresos - a.ingresos),
    por_chofer: [...accChofer.values()].sort((a, b) => b.ingresos - a.ingresos),
    totales,
  }
}
