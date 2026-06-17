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

import type { Tramo, Cobro, TarifaEmpresaCantera, Liquidacion, Chofer, Ruta } from '@/types/domain.types'

interface PerformanceFila {
  // id de la entidad agregada (camion_id o chofer_id)
  entidad_id:        number
  viajes:            number
  toneladas:         number
  ingresos:          number
  // Costo total de mano de obra = `costo_mo_cerrado + costo_mo_parcial`.
  costo_mo:          number
  // Subset que viene de liquidaciones en estado `cerrada`.
  costo_mo_cerrado:  number
  // Subset estimado "vivo" para días con tramos del chofer que NO están
  // cubiertos por ninguna liquidación cerrada. Permite ver un margen real
  // aproximado cuando hay choferes con varios meses sin cerrar liquidación.
  // Calculado como `(días vivos × chofer.basico_dia) + Σ (km × precio_km)`.
  // Cuando el chofer cierra la liquidación, este monto migra a `costo_mo_cerrado`.
  costo_mo_parcial:  number
  // Cuántos tramos se contaron sin tarifa cargada (ingreso = 0).
  sin_tarifa:        number
  // Cuántos tramos están sin cobrar todavía (ingreso teórico).
  sin_cobrar:        number
}

export interface PerformanceResultado {
  por_camion:        PerformanceFila[]
  por_chofer:        PerformanceFila[]
  totales: {
    viajes:            number
    toneladas:         number
    ingresos:          number
    costo_mo:          number
    costo_mo_cerrado:  number
    costo_mo_parcial:  number
    /** `true` si algún chofer tiene `costo_mo_parcial > 0` — la UI muestra un chip "parcial estimado". */
    tiene_parcial:     boolean
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
 * - Atribución a camión: se reparte el costo entre los camiones que el chofer
 *   EFECTIVAMENTE manejó según los tramos de esa liquidación
 *   (`tramo.liquidacion_id`), ponderando por km de cada tramo (fallback:
 *   cantidad de tramos). Usa el camión REAL del viaje, igual que los ingresos
 *   — NO la preasignación estática `chofer.camion_id` (que no refleja la
 *   rotación de camiones y desviaba el costo al camión equivocado o lo perdía
 *   cuando el chofer no tenía camión asignado). Fallback a `chofer.camion_id`
 *   solo si la liquidación no tiene tramos linkeados. El total por chofer y el
 *   total general no cambian; solo cambia el reparto por camión.
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
  rutas:         Ruta[]        = [],
): PerformanceResultado {
  // Mapa cobro_id → cobro para lookup O(1).
  const cobroPorId = new Map<number, Cobro>()
  for (const c of cobros) cobroPorId.set(c.id, c)

  // Acumuladores por entidad.
  const accCamion = new Map<number, PerformanceFila>()
  const accChofer = new Map<number, PerformanceFila>()
  const totales = {
    viajes: 0, toneladas: 0, ingresos: 0,
    costo_mo: 0, costo_mo_cerrado: 0, costo_mo_parcial: 0,
    tiene_parcial: false,
  }

  function getOrInit(map: Map<number, PerformanceFila>, id: number): PerformanceFila {
    let f = map.get(id)
    if (!f) {
      f = {
        entidad_id: id, viajes: 0, toneladas: 0, ingresos: 0,
        costo_mo: 0, costo_mo_cerrado: 0, costo_mo_parcial: 0,
        sin_tarifa: 0, sin_cobrar: 0,
      }
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

  // ── Helpers de atribución de MO al camión REAL del tramo ──
  const choferPorId = new Map<number, Chofer>()
  for (const c of choferes) choferPorId.set(c.id, c)

  // km de UNA pata por ruta direccional cantera→depósito (el dato se carga
  // one-way; cargado y vacío son tramos separados con su propia ruta).
  const kmPorRuta = new Map<string, number>()
  for (const r of rutas) kmPorRuta.set(`${r.cantera_id}->${r.deposito_id}`, r.km_ida_vuelta)
  function kmTramo(t: Tramo): number {
    if (!t.cantera_id || !t.deposito_id) return 0
    return kmPorRuta.get(`${t.cantera_id}->${t.deposito_id}`) ?? 0
  }

  // Tramos agrupados por liquidación (para repartir la MO al camión real).
  const tramosPorLiquidacion = new Map<number, Tramo[]>()
  for (const t of tramos) {
    if (t.liquidacion_id == null) continue
    const arr = tramosPorLiquidacion.get(t.liquidacion_id) ?? []
    arr.push(t)
    tramosPorLiquidacion.set(t.liquidacion_id, arr)
  }

  // Reparte `monto` entre los camiones de `ref`, ponderando por km de cada
  // tramo (fallback: cantidad de tramos si no hay km cargado). La suma de las
  // partes == `monto`, así que no infla ni pierde costo.
  function repartirPorCamion(monto: number, ref: Tramo[]): Map<number, number> {
    const out = new Map<number, number>()
    if (ref.length === 0 || monto <= 0) return out
    const kmPorCamion = new Map<number, number>()
    let kmTotal = 0
    for (const t of ref) {
      const k = kmTramo(t)
      kmPorCamion.set(t.camion_id, (kmPorCamion.get(t.camion_id) ?? 0) + k)
      kmTotal += k
    }
    if (kmTotal > 0) {
      for (const [cid, k] of kmPorCamion) out.set(cid, monto * (k / kmTotal))
    } else {
      const cnt = new Map<number, number>()
      for (const t of ref) cnt.set(t.camion_id, (cnt.get(t.camion_id) ?? 0) + 1)
      for (const [cid, c] of cnt) out.set(cid, monto * (c / ref.length))
    }
    return out
  }

  // ── Costo de mano de obra por liquidaciones cerradas en rango ──
  for (const liq of liquidaciones) {
    if (liq.estado !== 'cerrada')   continue
    if (!liq.fecha_hasta)            continue
    if (liq.fecha_hasta < desde)    continue
    if (liq.fecha_hasta > hasta)    continue

    const costo = Number(liq.subtotal_basico ?? 0) + Number(liq.subtotal_km ?? 0)
    if (costo <= 0) continue

    // Por chofer (siempre identificado) — el total por chofer no cambia.
    const fch = getOrInit(accChofer, liq.chofer_id)
    fch.costo_mo         += costo
    fch.costo_mo_cerrado += costo

    // Por camión: repartir entre los camiones REALES de los tramos de esta
    // liquidación. Si no hay tramos linkeados, fallback al camión preasignado.
    const reparto = repartirPorCamion(costo, tramosPorLiquidacion.get(liq.id) ?? [])
    if (reparto.size > 0) {
      for (const [cid, parte] of reparto) {
        const fc = getOrInit(accCamion, cid)
        fc.costo_mo         += parte
        fc.costo_mo_cerrado += parte
      }
    } else {
      const chofer = choferPorId.get(liq.chofer_id)
      if (chofer?.camion_id != null) {
        const fc = getOrInit(accCamion, chofer.camion_id)
        fc.costo_mo         += costo
        fc.costo_mo_cerrado += costo
      }
    }
    totales.costo_mo         += costo
    totales.costo_mo_cerrado += costo
  }

  // ── Parcial estimado para choferes con tramos en rango pero sin liq que cubra esos días ──
  // Para cada chofer:
  //   1) días con tramos `completados` en rango (cargado o vacío)
  //   2) días cubiertos por liquidaciones cerradas suyas (expandiendo
  //      liq.fecha_desde..liq.fecha_hasta, sin importar si caen en rango —
  //      esos días ya están contabilizados en costo_mo_cerrado)
  //   3) días vivos = (1) − (2)
  //   4) costo = días_vivos × basico_dia + Σ km_tramo × precio_km
  //
  // Cuando el chofer cierre la liquidación, esos días caen en (2) y el
  // parcial se va a 0 — el total `costo_mo` queda igual (migración interna
  // de parcial → cerrado).
  if (rutas.length > 0 || choferes.length > 0) {
    // Agrupar tramos por chofer.
    const tramosPorChofer = new Map<number, Tramo[]>()
    for (const t of tramos) {
      if (t.estado !== 'completado') continue
      const fechaTramo = t.tipo === 'cargado' ? t.fecha_descarga : t.fecha_vacio
      if (!fechaTramo || fechaTramo < desde || fechaTramo > hasta) continue
      const arr = tramosPorChofer.get(t.chofer_id) ?? []
      arr.push(t)
      tramosPorChofer.set(t.chofer_id, arr)
    }

    // Liquidaciones cerradas por chofer (todas, no solo las del rango — el
    // set de días cubiertos importa para ver qué tramo queda sin cubrir).
    const liqCerradasPorChofer = new Map<number, Liquidacion[]>()
    for (const liq of liquidaciones) {
      if (liq.estado !== 'cerrada') continue
      const arr = liqCerradasPorChofer.get(liq.chofer_id) ?? []
      arr.push(liq)
      liqCerradasPorChofer.set(liq.chofer_id, arr)
    }

    for (const [choferId, tramosChofer] of tramosPorChofer) {
      const chofer = choferPorId.get(choferId)
      if (!chofer) continue
      const basicoDia       = Number(chofer.basico_dia ?? 0)
      const precioKmCargado = Number(chofer.precio_km_cargado ?? 0)
      const precioKmVacio   = Number(chofer.precio_km_vacio ?? 0)

      // Set de días cubiertos por liq cerradas (ISO yyyy-mm-dd).
      const diasCubiertos = new Set<string>()
      for (const liq of liqCerradasPorChofer.get(choferId) ?? []) {
        if (!liq.fecha_desde || !liq.fecha_hasta) continue
        const d0 = new Date(liq.fecha_desde + 'T12:00:00')
        const d1 = new Date(liq.fecha_hasta + 'T12:00:00')
        for (const d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
          diasCubiertos.add(d.toISOString().slice(0, 10))
        }
      }

      // Días con tramos no cubiertos + km vivos (y los tramos vivos, para
      // repartir el costo al camión real de cada uno).
      const diasVivos = new Set<string>()
      const tramosVivos: Tramo[] = []
      let kmVivosCargado = 0
      let kmVivosVacio   = 0
      for (const t of tramosChofer) {
        const fechaTramo = t.tipo === 'cargado' ? t.fecha_descarga : t.fecha_vacio
        if (!fechaTramo) continue
        if (diasCubiertos.has(fechaTramo)) continue
        diasVivos.add(fechaTramo)
        tramosVivos.push(t)
        const km = kmTramo(t)
        if (t.tipo === 'cargado') kmVivosCargado += km
        else                       kmVivosVacio   += km
      }

      const costoParcial =
        diasVivos.size * basicoDia
        + kmVivosCargado * precioKmCargado
        + kmVivosVacio   * precioKmVacio
      if (costoParcial <= 0) continue

      const fch = getOrInit(accChofer, choferId)
      fch.costo_mo         += costoParcial
      fch.costo_mo_parcial += costoParcial

      // Por camión: repartir entre los camiones REALES de los tramos vivos.
      // Fallback al camión preasignado si no se pudo repartir.
      const reparto = repartirPorCamion(costoParcial, tramosVivos)
      if (reparto.size > 0) {
        for (const [cid, parte] of reparto) {
          const fc = getOrInit(accCamion, cid)
          fc.costo_mo         += parte
          fc.costo_mo_parcial += parte
        }
      } else if (chofer.camion_id != null) {
        const fc = getOrInit(accCamion, chofer.camion_id)
        fc.costo_mo         += costoParcial
        fc.costo_mo_parcial += costoParcial
      }
      totales.costo_mo         += costoParcial
      totales.costo_mo_parcial += costoParcial
      totales.tiene_parcial = true
    }
  }

  return {
    por_camion: [...accCamion.values()].sort((a, b) => b.ingresos - a.ingresos),
    por_chofer: [...accChofer.values()].sort((a, b) => b.ingresos - a.ingresos),
    totales,
  }
}
