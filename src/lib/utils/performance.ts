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

import type { Tramo, Cobro, TarifaEmpresaCantera, Liquidacion, Chofer, Ruta, RelevoLiquidado, Estadia, Camion } from '@/types/domain.types'
import { tarifaParaFecha, unidadDelCamion } from '@/modules/logistica/utils/tarifas'
import { diasEntreFechas } from '@/modules/logistica/utils/liquidacion-math'
import { basicoDiaEnFecha, precioKmEnFecha, type ChoferConHist } from './tarifas-chofer'

// Una "unidad de trabajo" liquidada: un tramo propio del chofer o una pata de
// relevo que cobró. Es la base del prorrateo de km y del reparto por camión.
interface UnidadLiquidada {
  fecha:     string | null
  km:        number
  camion_id: number
}

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
  // Parte de `costo_mo` que son estadías (días de espera para cargar o
  // descargar, pagados por día). Se lleva aparte sólo para poder mostrarlo
  // desglosado: ya está sumado dentro de costo_mo y de cerrado/parcial.
  costo_estadias:    number
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
    /** Parte de `costo_mo` que son estadías. Ya está incluida en costo_mo. */
    costo_estadias:    number
    /** `true` si algún chofer tiene `costo_mo_parcial > 0` — la UI muestra un chip "parcial estimado". */
    tiene_parcial:     boolean
    // Desglose de `ingresos` por qué tan real es la plata (suman ingresos):
    /** Viajes en cobros con estado 'cobrado' — plata que efectivamente entró. */
    ingresos_cobrado:      number
    /** Viajes ya facturados/en cobro pero con el cobro 'pendiente'. */
    ingresos_por_cobrar:   number
    /** Viajes sin cobro todavía, valuados a tarifa teórica (misma escalera que facturación). */
    ingresos_sin_facturar: number
  }
}

/**
 * Filtra tramos relevantes (cargado + completado + fecha en rango), calcula
 * ingreso por tramo, y agrega por camión y chofer. Si se pasan liquidaciones
 * cerradas + choferes, también suma el costo de mano de obra (básico + km
 * pagados al chofer) para calcular el margen real.
 *
 * Política de costo MO:
 * - Solo liquidaciones con `estado='cerrada'`, y PRORRATEADAS al rango: el
 *   básico por día de calendario del período, los km por los viajes que caen
 *   dentro. Ya no se imputa el subtotal completo al mes de cierre — eso hacía
 *   que el sueldo y los ingresos del mismo viaje cayeran en meses distintos.
 * - Costo bruto = `subtotal_basico + subtotal_km` (lo que la empresa eroga
 *   por el trabajo del chofer; los adelantos ya están adelantados, los
 *   reintegros corresponden a gastos en `gastos_logistica`, así que esos
 *   no se suman acá para no doble-contar).
 * - Las estadías SÍ cuentan como mano de obra (decisión del dueño el
 *   2026-07-29): son días de espera para cargar o descargar que se le pagan al
 *   chofer por su tiempo. No se prorratean desde `liquidacion.total_estadias`
 *   sino desde cada fila de `estadias`, que tiene sus PROPIAS fechas — más
 *   preciso, y una estadía que cruza un borde de mes se parte por sus días.
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
  tramoChoferes: RelevoLiquidado[] = [],
  estadias:      Estadia[]         = [],
  // Para resolver el tipo de unidad (chasis/batea) del ingreso teórico. Sin
  // esto, la escalera cae a 'batea' para todos.
  camiones:      Camion[]          = [],
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
    costo_estadias: 0,
    tiene_parcial: false,
    ingresos_cobrado: 0, ingresos_por_cobrar: 0, ingresos_sin_facturar: 0,
  }

  function getOrInit(map: Map<number, PerformanceFila>, id: number): PerformanceFila {
    let f = map.get(id)
    if (!f) {
      f = {
        entidad_id: id, viajes: 0, toneladas: 0, ingresos: 0,
        costo_mo: 0, costo_mo_cerrado: 0, costo_mo_parcial: 0,
        costo_estadias: 0,
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

    let via: 'cobrado' | 'por_cobrar' | 'sin_facturar' = 'sin_facturar'
    if (t.cobro_id != null) {
      // Tiene cobro: prorrateo por toneladas.
      const cobro = cobroPorId.get(t.cobro_id)
      via = cobro?.estado === 'cobrado' ? 'cobrado' : 'por_cobrar'
      if (cobro && cobro.toneladas_totales > 0) {
        ingreso = cobro.total * (ton / cobro.toneladas_totales)
      }
    } else {
      // Sin cobro: tarifa vigente.
      sinCobrar = true
      if (t.empresa_id != null && t.cantera_id != null) {
        // La MISMA escalera de tarifas que usa el modal de facturación
        // (depósito+unidad > depósito > unidad > general). Antes acá había una
        // búsqueda naive por (empresa, cantera) que ignoraba el depósito y el
        // tipo de camión: el 29/07 valuaba un tractor de Paramerica a la tarifa
        // CHASIS (la más nueva) — $2.350.546 subvaluados en un solo viaje que
        // después la facturación cobraba bien. El teórico tiene que anticipar
        // lo que se va a facturar, no otra cosa.
        const tarifa = tarifaParaFecha(
          tarifas, t.empresa_id, t.cantera_id, t.deposito_id ?? null,
          t.fecha_descarga, unidadDelCamion(camiones, t.camion_id),
        )
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
    if (via === 'cobrado')      totales.ingresos_cobrado      += ingreso
    else if (via === 'por_cobrar') totales.ingresos_por_cobrar += ingreso
    else                        totales.ingresos_sin_facturar += ingreso
  }

  // ── Helpers de atribución de MO al camión REAL del tramo ──
  // ChoferConHist: el endpoint embute el historial de tarifas, que es lo que
  // hace falta para valuar el trabajo sin liquidar con la tarifa de SU fecha.
  const choferPorId = new Map<number, ChoferConHist>()
  for (const c of choferes) choferPorId.set(c.id, c as ChoferConHist)

  // km de UNA pata por ruta direccional cantera→depósito (el dato se carga
  // one-way; cargado y vacío son tramos separados con su propia ruta).
  const kmPorRuta = new Map<string, number>()
  for (const r of rutas) kmPorRuta.set(`${r.cantera_id}->${r.deposito_id}`, r.km_ida_vuelta)
  function kmTramo(t: Tramo): number {
    if (!t.cantera_id || !t.deposito_id) return 0
    return kmPorRuta.get(`${t.cantera_id}->${t.deposito_id}`) ?? 0
  }

  // Fecha "de trabajo" de un tramo: la del hecho que se pagó.
  function fechaDeTramo(t: Tramo): string | null {
    return (t.tipo === 'cargado' ? t.fecha_descarga : t.fecha_vacio) ?? null
  }

  const tramoPorId = new Map<number, Tramo>()
  for (const t of tramos) tramoPorId.set(t.id, t)

  // Unidades de trabajo de cada liquidación: sus tramos propios + las patas de
  // relevo que cobra. El tramo de un relevo tiene liquidacion_id NULL (el
  // vínculo lo carga la fila tramo_choferes), así que sin esto ni la MO del
  // relevista cae en el camión real ni sus km entran al prorrateo.
  const unidadesPorLiquidacion = new Map<number, UnidadLiquidada[]>()
  function agregarUnidad(liqId: number, u: UnidadLiquidada) {
    const arr = unidadesPorLiquidacion.get(liqId) ?? []
    arr.push(u)
    unidadesPorLiquidacion.set(liqId, arr)
  }
  for (const t of tramos) {
    if (t.liquidacion_id == null) continue
    agregarUnidad(t.liquidacion_id, { fecha: fechaDeTramo(t), km: kmTramo(t), camion_id: t.camion_id })
  }
  for (const tc of tramoChoferes) {
    if (tc.liquidacion_id == null || !tc.tramo) continue
    const km = tc.tramo.tipo === 'vacio' ? Number(tc.km_vacio ?? 0) : Number(tc.km_cargado ?? 0)
    const tramoDelRelevo = tramoPorId.get(tc.tramo_id)
    agregarUnidad(tc.liquidacion_id, {
      fecha: tramoDelRelevo ? fechaDeTramo(tramoDelRelevo) : null,
      km,
      camion_id: tc.tramo.camion_id,
    })
  }

  // Reparte `monto` entre camiones según `ref` (entradas {camion_id, km}),
  // ponderando por km (fallback: cantidad de entradas si no hay km cargado).
  // La suma de las partes == `monto`, así que no infla ni pierde costo.
  function repartirPorCamion(monto: number, ref: Array<{ camion_id: number; km: number }>): Map<number, number> {
    const out = new Map<number, number>()
    if (ref.length === 0 || monto <= 0) return out
    const kmPorCamion = new Map<number, number>()
    let kmTotal = 0
    for (const e of ref) {
      kmPorCamion.set(e.camion_id, (kmPorCamion.get(e.camion_id) ?? 0) + e.km)
      kmTotal += e.km
    }
    if (kmTotal > 0) {
      for (const [cid, k] of kmPorCamion) out.set(cid, monto * (k / kmTotal))
    } else {
      const cnt = new Map<number, number>()
      for (const e of ref) cnt.set(e.camion_id, (cnt.get(e.camion_id) ?? 0) + 1)
      for (const [cid, c] of cnt) out.set(cid, monto * (c / ref.length))
    }
    return out
  }

  // Entradas {camion_id, km} de tramos propios (km de la ruta completa).
  function entradasTramos(ts: Tramo[]): Array<{ camion_id: number; km: number }> {
    return ts.map(t => ({ camion_id: t.camion_id, km: kmTramo(t) }))
  }

  // ── Cáscaras duplicadas: liquidaciones 'cerradas' que quedaron vacías ──
  // Cerrar un borrador sin nada vinculado deja una fila 'cerrada' con los
  // subtotales intactos y 0 tramos / 0 adelantos / 0 gastos. Pasó el 2026-07-26:
  // las liq 23 (Gonzalez) y 25 (Zelarayan) son gemelas de la 24 y la 29, y el
  // reporte sumaba las dos → $10.538.550 de mano de obra fantasma en julio.
  //
  // Se descarta por (chofer, período) en vez de "toda cerrada sin tramos":
  // así nunca se tira una liquidación única. Si el día que `tramos` llegue al
  // cap de 1000 filas de PostgREST una liquidación legítima apareciera sin
  // hijos, un filtro ciego le borraría el costo en silencio — que es peor que
  // el problema que arregla.
  const idsDescartados = new Set<number>()
  {
    const porChoferYPeriodo = new Map<string, Liquidacion[]>()
    for (const liq of liquidaciones) {
      if (liq.estado !== 'cerrada') continue
      const k = `${liq.chofer_id}|${liq.fecha_desde}|${liq.fecha_hasta}`
      const arr = porChoferYPeriodo.get(k) ?? []
      arr.push(liq)
      porChoferYPeriodo.set(k, arr)
    }
    const tieneHijos = (l: Liquidacion) =>
      (unidadesPorLiquidacion.get(l.id)?.length ?? 0) > 0
    for (const grupo of porChoferYPeriodo.values()) {
      if (grupo.length < 2) continue
      // Sólo se descartan las VACÍAS, y sólo si alguna hermana tiene hijos.
      // Si las dos tienen tramos distintos adentro, las dos son plata real y
      // se suman las dos (alguien partió el período en dos liquidaciones);
      // descartar una ahí sería perder costo. Si ninguna tiene hijos no se
      // toca ninguna: sin hijos no hay forma de saber cuál era la buena, y
      // borrar a ciegas esconde el problema en vez de mostrarlo.
      if (!grupo.some(tieneHijos)) continue
      for (const l of grupo) if (!tieneHijos(l)) idsDescartados.add(l.id)
    }
  }

  // ── Costo de mano de obra de liquidaciones cerradas, PRORRATEADO al rango ──
  //
  // Antes se imputaba el subtotal completo al mes en que la liquidación CERRÓ,
  // mientras los ingresos se cuentan el día del viaje. Como las liquidaciones no
  // son mensuales (la de Gonzalez va del 13/05 al 26/07, la de Alderete del
  // 21/04 al 23/06 — 9 de 13 cruzan un borde de mes), casi ninguna fila del
  // reporte era comparable: Alderete cargaba dos meses de sueldo contra un mes
  // de ingresos, y Gonzalez aparecía con 240 t facturadas y mano de obra "—",
  // indistinguible de no haber trabajado.
  //
  // Ahora cada componente se reparte por su propia base, y con los montos
  // REALMENTE pagados (no recalculando con las tarifas de hoy, que no tienen
  // historial y re-valuarían retroactivamente todos los meses ya cerrados):
  //   · básico → por día de calendario del período que cae en el rango.
  //     Verificado en las 13 liquidaciones vivas: dias_trabajados es siempre
  //     (fecha_hasta − fecha_desde + 1) y dias × basico_dia == subtotal_basico
  //     exacto. O sea que el básico se paga por día corrido, no por día con
  //     viaje (Alderete cobró 64 días teniendo 28 con viajes).
  //   · km → por los km de los viajes que caen en el rango. Ahí sí importa
  //     dónde estuvo el camión, no el calendario.
  //
  // Prorratear sobre el subtotal ya pagado garantiza que la suma de rangos
  // disjuntos da el total de la liquidación: no se crea ni se pierde plata.
  for (const liq of liquidaciones) {
    if (liq.estado !== 'cerrada')   continue
    if (idsDescartados.has(liq.id)) continue
    if (!liq.fecha_desde || !liq.fecha_hasta) continue

    const montoBasico = Number(liq.subtotal_basico ?? 0)
    const montoKm     = Number(liq.subtotal_km ?? 0)
    if (montoBasico <= 0 && montoKm <= 0) continue

    // Básico: proporción de días de calendario del período dentro del rango.
    const diasPeriodo   = diasEntreFechas(liq.fecha_desde, liq.fecha_hasta)
    const solapeDesde   = liq.fecha_desde > desde ? liq.fecha_desde : desde
    const solapeHasta   = liq.fecha_hasta < hasta ? liq.fecha_hasta : hasta
    const diasEnRango   = solapeDesde <= solapeHasta ? diasEntreFechas(solapeDesde, solapeHasta) : 0
    const basicoEnRango = diasPeriodo > 0 ? montoBasico * (diasEnRango / diasPeriodo) : 0

    // Km: proporción de km de las unidades de trabajo dentro del rango. Si no
    // hay km cargados (rutas sin km), cae al prorrateo por días para no perder
    // el monto — mal repartido es mejor que desaparecido.
    const unidades       = unidadesPorLiquidacion.get(liq.id) ?? []
    const unidadesRango  = unidades.filter(u => u.fecha != null && u.fecha >= desde && u.fecha <= hasta)
    const kmTodos        = unidades.reduce((s, u) => s + u.km, 0)
    const kmDelRango     = unidadesRango.reduce((s, u) => s + u.km, 0)
    const kmEnRango      = kmTodos > 0
      ? montoKm * (kmDelRango / kmTodos)
      : diasPeriodo > 0 ? montoKm * (diasEnRango / diasPeriodo) : 0

    const costo = basicoEnRango + kmEnRango
    if (costo <= 0) continue

    // Por chofer (siempre identificado).
    const fch = getOrInit(accChofer, liq.chofer_id)
    fch.costo_mo         += costo
    fch.costo_mo_cerrado += costo

    // Por camión: repartir entre los camiones REALES de las unidades del rango.
    // Si el período solapa pero no hubo viajes en el rango (el básico corre
    // igual), se reparte por todas las unidades de la liquidación; si tampoco
    // hay, fallback al camión preasignado.
    const referencia = unidadesRango.length > 0 ? unidadesRango : unidades
    const reparto = repartirPorCamion(costo, referencia)
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
      if (idsDescartados.has(liq.id)) continue
      const arr = liqCerradasPorChofer.get(liq.chofer_id) ?? []
      arr.push(liq)
      liqCerradasPorChofer.set(liq.chofer_id, arr)
    }

    for (const [choferId, tramosChofer] of tramosPorChofer) {
      const chofer = choferPorId.get(choferId)
      if (!chofer) continue
      // Tarifas VIGENTES en el trabajo que se está estimando, no las de hoy.
      // Antes se usaba `chofer.basico_dia` directo, así que un aumento re-valuaba
      // retroactivamente todo lo pendiente de liquidar (con un 20% se movían
      // $1.168.584 solos). Es el mismo bug que tarja el 2026-06-26.
      // Referencia: el tramo vivo más viejo del rango — es el trabajo que se está
      // valuando. Se calcula abajo, después de saber cuáles quedaron vivos.

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
      // Los km se valúan tramo por tramo con la tarifa vigente EN SU fecha: si
      // hubo un aumento en el medio del período, cada viaje queda con el precio
      // que le corresponde.
      const diasVivos = new Set<string>()
      const tramosVivos: Tramo[] = []
      let montoKmVivos = 0
      for (const t of tramosChofer) {
        const fechaTramo = t.tipo === 'cargado' ? t.fecha_descarga : t.fecha_vacio
        if (!fechaTramo) continue
        if (diasCubiertos.has(fechaTramo)) continue
        diasVivos.add(fechaTramo)
        tramosVivos.push(t)
        montoKmVivos += kmTramo(t) * precioKmEnFecha(chofer, fechaTramo, t.tipo)
      }

      // Básico del parcial: días CORRIDOS del tramo vivo más viejo al más nuevo
      // (acotado al rango), no cantidad de días con viaje. Así estima con la
      // misma regla con la que se va a pagar: verificado en las 13
      // liquidaciones vivas, el básico se liquida por día de calendario del
      // período (Alderete cobró 64 días con 28 días de viaje). Contar sólo los
      // días con viaje subestimaba el costo — y hacía que la mitad "cerrada" y
      // la mitad "estimada" de la misma columna usaran reglas distintas.
      const fechasVivas = [...diasVivos].sort()
      const diasBasico  = fechasVivas.length > 0
        ? diasEntreFechas(fechasVivas[0], fechasVivas[fechasVivas.length - 1])
        : 0
      // Básico con la tarifa vigente al arranque del tramo vivo más viejo.
      const basicoDia = fechasVivas.length > 0
        ? basicoDiaEnFecha(chofer, fechasVivas[0]!)
        : 0

      const costoParcial = diasBasico * basicoDia + montoKmVivos
      if (costoParcial <= 0) continue

      const fch = getOrInit(accChofer, choferId)
      fch.costo_mo         += costoParcial
      fch.costo_mo_parcial += costoParcial

      // Por camión: repartir entre los camiones REALES de los tramos vivos.
      // Fallback al camión preasignado si no se pudo repartir.
      const reparto = repartirPorCamion(costoParcial, entradasTramos(tramosVivos))
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

  // ── Estadías: días de espera pagados al chofer ───────────────────────────────
  // Cuentan como mano de obra (decisión del dueño el 2026-07-29): es plata que
  // se le paga por su tiempo. Antes no figuraban en ninguna columna — ni en
  // Gastos ni en Mano obra.
  //
  // Se atribuyen por SUS propias fechas, no prorrateando `total_estadias` de la
  // liquidación: la fila de estadía tiene fecha_desde/fecha_hasta, así que una
  // que cruza un borde de mes se parte por sus días y cada mes se lleva lo suyo.
  // Verificado en los datos: `dias` es siempre (fecha_hasta − fecha_desde + 1) y
  // `dias × monto_dia == total`, así que prorratear por día es exacto.
  //
  // Liquidada → cuenta como cerrado; sin liquidar → como parcial (igual que el
  // resto, y migra sola cuando se cierre la liquidación).
  for (const est of estadias) {
    if (!est.fecha_desde || !est.fecha_hasta) continue
    const solapeDesde = est.fecha_desde > desde ? est.fecha_desde : desde
    const solapeHasta = est.fecha_hasta < hasta ? est.fecha_hasta : hasta
    if (solapeDesde > solapeHasta) continue

    const diasEnRango = diasEntreFechas(solapeDesde, solapeHasta)
    const montoDia    = Number(est.monto_dia ?? 0)
    const monto       = diasEnRango * montoDia
    if (monto <= 0) continue

    // Una estadía de una liquidación descartada (cáscara duplicada) no cuenta.
    // Hoy no puede pasar —las cáscaras no tienen hijos— pero si alguna vez
    // pasara, contarla resucitaría plata que ya se decidió ignorar.
    if (est.liquidacion_id != null && idsDescartados.has(est.liquidacion_id)) continue

    const cerrada = est.liquidacion_id != null
    const fch = getOrInit(accChofer, est.chofer_id)
    fch.costo_mo       += monto
    fch.costo_estadias += monto
    if (cerrada) fch.costo_mo_cerrado += monto
    else         fch.costo_mo_parcial += monto

    // Por camión: la estadía no tiene camión propio (el chofer esperó, el camión
    // estaba con él). Se reparte entre los camiones que ese chofer manejó en el
    // rango; si no manejó ninguno, al camión preasignado de su ficha.
    const chofer = choferPorId.get(est.chofer_id)
    const unidadesDelChofer = tramos
      .filter(t => t.chofer_id === est.chofer_id)
      .map(t => ({ camion_id: t.camion_id, km: kmTramo(t), fecha: fechaDeTramo(t) }))
      .filter(u => u.fecha != null && u.fecha >= desde && u.fecha <= hasta)
    const reparto = repartirPorCamion(monto, unidadesDelChofer)
    if (reparto.size > 0) {
      for (const [cid, parte] of reparto) {
        const fc = getOrInit(accCamion, cid)
        fc.costo_mo       += parte
        fc.costo_estadias += parte
        if (cerrada) fc.costo_mo_cerrado += parte
        else         fc.costo_mo_parcial += parte
      }
    } else if (chofer?.camion_id != null) {
      const fc = getOrInit(accCamion, chofer.camion_id)
      fc.costo_mo       += monto
      fc.costo_estadias += monto
      if (cerrada) fc.costo_mo_cerrado += monto
      else         fc.costo_mo_parcial += monto
    }

    totales.costo_mo       += monto
    totales.costo_estadias += monto
    if (cerrada) totales.costo_mo_cerrado += monto
    else       { totales.costo_mo_parcial += monto; totales.tiene_parcial = true }
  }

  return {
    por_camion: [...accCamion.values()].sort((a, b) => b.ingresos - a.ingresos),
    por_chofer: [...accChofer.values()].sort((a, b) => b.ingresos - a.ingresos),
    totales,
  }
}
