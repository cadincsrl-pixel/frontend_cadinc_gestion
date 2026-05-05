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

import type { Tramo, Cobro, TarifaEmpresaCantera } from '@/types/domain.types'

interface PerformanceFila {
  // id de la entidad agregada (camion_id o chofer_id)
  entidad_id:    number
  viajes:        number
  toneladas:     number
  ingresos:      number
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
 * ingreso por tramo, y agrega por camión y chofer.
 *
 * @param desde  ISO yyyy-mm-dd inclusive
 * @param hasta  ISO yyyy-mm-dd inclusive
 */
export function calcularPerformance(
  tramos:   Tramo[],
  cobros:   Cobro[],
  tarifas:  TarifaEmpresaCantera[],
  desde:    string,
  hasta:    string,
): PerformanceResultado {
  // Mapa cobro_id → cobro para lookup O(1).
  const cobroPorId = new Map<number, Cobro>()
  for (const c of cobros) cobroPorId.set(c.id, c)

  // Acumuladores por entidad.
  const accCamion = new Map<number, PerformanceFila>()
  const accChofer = new Map<number, PerformanceFila>()
  const totales = { viajes: 0, toneladas: 0, ingresos: 0 }

  function getOrInit(map: Map<number, PerformanceFila>, id: number): PerformanceFila {
    let f = map.get(id)
    if (!f) {
      f = { entidad_id: id, viajes: 0, toneladas: 0, ingresos: 0, sin_tarifa: 0, sin_cobrar: 0 }
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

  return {
    por_camion: [...accCamion.values()].sort((a, b) => b.ingresos - a.ingresos),
    por_chofer: [...accChofer.values()].sort((a, b) => b.ingresos - a.ingresos),
    totales,
  }
}
