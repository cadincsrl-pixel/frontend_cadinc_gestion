// Golden numbers de la atribución de mano de obra en Gastos > Reportes.
// CONGELA el comportamiento de calcularPerformance() en src/lib/utils/performance.ts.
// Los valores esperados están calculados A MANO (la cuenta va al lado) — nunca
// llamando a la función. Si un test de acá falla, cambió cómo se le imputa el
// sueldo del chofer a un mes: NO ajustes el número sin entender qué reportes
// pasados cambia.
//
// Caso que motivó el archivo (2026-07-29): el dueño reportó que la columna
// MANO OBRA estaba mal. Había dos problemas distintos —
//   1. Liquidaciones 'cerradas' duplicadas y vacías (liq 23 y 25, gemelas de la
//      24 y la 29) que el reporte sumaba dos veces: $10.538.550 fantasma.
//   2. El costo se imputaba entero al mes en que CERRÓ la liquidación, mientras
//      los ingresos se cuentan el día del viaje. 9 de 13 liquidaciones cruzan
//      un borde de mes, así que casi ninguna fila del reporte era comparable.

import { describe, it, expect } from 'vitest'
import { calcularPerformance } from '@/lib/utils/performance'
import type {
  Tramo, Cobro, TarifaEmpresaCantera, Liquidacion, Chofer, Ruta, RelevoLiquidado, Estadia, Camion,
} from '@/types/domain.types'

// ── Factories ────────────────────────────────────────────────────────────────

function mkTramo(over: Partial<Tramo> = {}): Tramo {
  return {
    id: 1,
    chofer_id: 10,
    camion_id: 3,
    tipo: 'cargado',
    estado: 'completado',
    empresa_id: null,
    cantera_id: null,
    deposito_id: null,
    tarifa_variante: null,
    fecha_carga: null,
    toneladas_carga: null,
    remito_carga: null,
    remito_carga_img_url: null,
    fecha_descarga: null,
    toneladas_descarga: null,
    remito_descarga: null,
    remito_descarga_img_url: null,
    fecha_vacio: null,
    liquidacion_id: null,
    cobro_id: null,
    obs: null,
    orden_dia: null,
    created_at: '2026-07-01T12:00:00Z',
    updated_at: '2026-07-01T12:00:00Z',
    created_by: null,
    updated_by: null,
    ...over,
  }
}

function mkLiq(over: Partial<Liquidacion> & Pick<Liquidacion, 'id' | 'chofer_id'>): Liquidacion {
  return {
    fecha_desde: '2026-06-01',
    fecha_hasta: '2026-06-30',
    dias_trabajados: 0,
    basico_dia: 0,
    km_totales: null,
    precio_km: null,
    subtotal_basico: 0,
    subtotal_km: null,
    subtotal_km_cargado: null,
    subtotal_km_vacio: null,
    total_adelantos: 0,
    total_reintegros: null,
    total_estadias: null,
    total_neto: 0,
    estado: 'cerrada',
    obs: null,
    created_at: '2026-06-30T12:00:00Z',
    ...over,
  }
}

function mkChofer(over: Partial<Chofer> & Pick<Chofer, 'id'>): Chofer {
  return {
    nombre: 'CHOFER TEST',
    cuil: null,
    telefono: null,
    estado: 'activo',
    camion_id: null,
    batea_id: null,
    basico_dia: 0,
    precio_km_cargado: 0,
    precio_km_vacio: 0,
    modalidad_pago: 'km_jornal',
    pct_tarifa: null,
    obs: null,
    created_at: '2026-01-01T12:00:00Z',
    ...over,
  } as Chofer
}

function mkRuta(cantera_id: number, deposito_id: number, km: number): Ruta {
  return {
    id: cantera_id * 100 + deposito_id,
    cantera_id, deposito_id, km_ida_vuelta: km,
    obs: null, verificada: true, verificada_en: null, verificada_por: null,
    origen_km: 'manual',
  } as Ruta
}

const SIN_COBROS:  Cobro[] = []
const SIN_TARIFAS: TarifaEmpresaCantera[] = []

// ── Escenario base: la liquidación REAL de Gonzalez (liq 24) ─────────────────
//
// Datos de producción al 2026-07-29:
//   período 2026-05-13 → 2026-07-26 = 75 días de calendario
//   subtotal_basico 2.250.000  (75 días × $30.000 — verificado en la DB)
//   subtotal_km     5.574.680
// Le colgamos 2 viajes de 100 km cada uno, uno en junio y otro en julio, para
// que el prorrateo de km tenga de dónde agarrarse.

const CHOFER  = 10
const CAMION  = 3
const RUTAS   = [mkRuta(5, 2, 100)]
const CHOFERES = [mkChofer({ id: CHOFER, camion_id: CAMION })]

const VIAJE_JUNIO = mkTramo({
  id: 501, chofer_id: CHOFER, camion_id: CAMION,
  cantera_id: 5, deposito_id: 2,
  fecha_descarga: '2026-06-20', toneladas_descarga: 30,
  liquidacion_id: 24,
})
const VIAJE_JULIO = mkTramo({
  id: 502, chofer_id: CHOFER, camion_id: CAMION,
  cantera_id: 5, deposito_id: 2,
  fecha_descarga: '2026-07-20', toneladas_descarga: 30,
  liquidacion_id: 24,
})
const TRAMOS = [VIAJE_JUNIO, VIAJE_JULIO]

const LIQ_BUENA = mkLiq({
  id: 24, chofer_id: CHOFER,
  fecha_desde: '2026-05-13', fecha_hasta: '2026-07-26',
  dias_trabajados: 75, basico_dia: 30_000,
  subtotal_basico: 2_250_000, subtotal_km: 5_574_680,
})

function correr(desde: string, hasta: string, liqs: Liquidacion[] = [LIQ_BUENA], relevos: RelevoLiquidado[] = []) {
  return calcularPerformance(
    TRAMOS, SIN_COBROS, SIN_TARIFAS, desde, hasta,
    liqs, CHOFERES, RUTAS, relevos,
  )
}

describe('prorrateo de la mano de obra al rango', () => {
  it('julio: básico por los 26 días del período que caen en julio + la mitad de los km', () => {
    // Básico: el período solapa julio del 01 al 26 (fecha_hasta) = 26 días.
    //         2.250.000 / 75 = $30.000/día × 26 = 780.000
    // Km:     de los 2 viajes (200 km), 100 km caen en julio = la mitad.
    //         5.574.680 × 100/200 = 2.787.340
    // Total:  780.000 + 2.787.340 = 3.567.340
    const r = correr('2026-07-01', '2026-07-31')
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(3_567_340, 6)
  })

  it('junio: 30 días de básico + la otra mitad de los km', () => {
    // Básico: junio entero está dentro del período = 30 días × 30.000 = 900.000
    // Km:     el viaje del 20/06 = 100 de 200 km → 2.787.340
    // Total:  3.687.340
    const r = correr('2026-06-01', '2026-06-30')
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(3_687_340, 6)
  })

  it('mayo: solo básico desde el 13 (19 días), sin km porque no hubo viajes', () => {
    // Básico: 05-13 a 05-31 = 19 días × 30.000 = 570.000
    // Km:     ningún viaje en mayo → 0
    const r = correr('2026-05-01', '2026-05-31')
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(570_000, 6)
  })

  it('INVARIANTE: meses disjuntos suman exactamente el total de la liquidación', () => {
    // Es la propiedad que hace confiable el prorrateo: no crea ni pierde plata.
    // 570.000 + 3.687.340 + 3.567.340 = 7.824.680 = subtotal_basico + subtotal_km
    const mayo  = correr('2026-05-01', '2026-05-31').totales.costo_mo_cerrado
    const junio = correr('2026-06-01', '2026-06-30').totales.costo_mo_cerrado
    const julio = correr('2026-07-01', '2026-07-31').totales.costo_mo_cerrado
    expect(mayo + junio + julio).toBeCloseTo(2_250_000 + 5_574_680, 6)
    expect(mayo + junio + julio).toBeCloseTo(7_824_680, 6)
  })

  it('el rango completo del período da el total entero', () => {
    const r = correr('2026-05-13', '2026-07-26')
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(7_824_680, 6)
  })

  it('LA QUEJA DEL DUEÑO: en junio Gonzalez ya no aparece con mano de obra vacía', () => {
    // Antes: su liquidación cierra el 26/07, así que un reporte de junio le
    // mostraba 240 t facturadas y mano de obra "—", indistinguible de no haber
    // trabajado. Ahora le imputa los $3.687.340 que corresponden a junio.
    const r = correr('2026-06-01', '2026-06-30')
    const fila = r.por_chofer.find(f => f.entidad_id === CHOFER)
    expect(fila).toBeDefined()
    expect(fila!.costo_mo).toBeGreaterThan(0)
    expect(fila!.costo_mo).toBeCloseTo(3_687_340, 6)
  })

  it('un mes sin solape con el período no imputa nada', () => {
    const r = correr('2026-08-01', '2026-08-31')
    expect(r.totales.costo_mo_cerrado).toBe(0)
  })

  it('el costo se reparte al camión REAL de los viajes del rango', () => {
    const r = correr('2026-07-01', '2026-07-31')
    expect(r.por_camion.find(f => f.entidad_id === CAMION)?.costo_mo).toBeCloseTo(3_567_340, 6)
  })

  it('si la liquidación no tiene km cargados en sus rutas, el km cae al prorrateo por días', () => {
    // Sin rutas → kmTramo = 0 para todos → no hay base de km.
    // Se reparte el subtotal_km por días para no perder el monto:
    //   2.250.000 × 26/75 = 780.000  (básico)
    //   5.574.680 × 26/75 = 1.932.555,7333…  (km, prorrateado por días)
    const r = calcularPerformance(
      TRAMOS, SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [LIQ_BUENA], CHOFERES, [], [],
    )
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(780_000 + 5_574_680 * 26 / 75, 6)
  })
})

// ── El caso real de las cáscaras duplicadas ──────────────────────────────────

describe('cáscaras duplicadas de liquidación', () => {
  const CASCARA = mkLiq({
    id: 23, chofer_id: CHOFER,
    fecha_desde: '2026-05-13', fecha_hasta: '2026-07-26',
    dias_trabajados: 75, basico_dia: 30_000,
    subtotal_basico: 2_250_000, subtotal_km: 5_574_680,
  })

  it('con la cáscara al lado, NO duplica el costo de julio', () => {
    const sola = correr('2026-07-01', '2026-07-31', [LIQ_BUENA]).totales.costo_mo
    const conCascara = correr('2026-07-01', '2026-07-31', [LIQ_BUENA, CASCARA]).totales.costo_mo
    expect(conCascara).toBeCloseTo(sola, 6)
    expect(conCascara).toBeCloseTo(3_567_340, 6)
  })

  it('descarta la cáscara aunque venga primero en el array (no depende del orden)', () => {
    const r = correr('2026-07-01', '2026-07-31', [CASCARA, LIQ_BUENA])
    expect(r.totales.costo_mo).toBeCloseTo(3_567_340, 6)
  })

  it('sobrevive la que tiene viajes, no la de id más alto', () => {
    // Espejo del caso real de Zelarayan: la buena es la 29 (con tramos) y la
    // cáscara la 25, pero acá lo invertimos a propósito — la buena es la de id
    // MENOR — para probar que el criterio es "tiene hijos", no "id más alto".
    const buenaBaja  = mkLiq({ ...LIQ_BUENA, id: 25 })
    const cascaraAlta = mkLiq({ ...CASCARA, id: 29 })
    const tramosEn25 = TRAMOS.map(t => ({ ...t, liquidacion_id: 25 }))
    const r = calcularPerformance(
      tramosEn25, SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [buenaBaja, cascaraAlta], CHOFERES, RUTAS, [],
    )
    expect(r.totales.costo_mo).toBeCloseTo(3_567_340, 6)
  })

  it('NO descarta dos liquidaciones cerradas del mismo chofer con períodos DISTINTOS', () => {
    // Caso legítimo: dos quincenas seguidas.
    const q1 = mkLiq({
      id: 40, chofer_id: CHOFER,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-15',
      subtotal_basico: 450_000, subtotal_km: 0,   // 15 días × 30.000
    })
    const q2 = mkLiq({
      id: 41, chofer_id: CHOFER,
      fecha_desde: '2026-07-16', fecha_hasta: '2026-07-31',
      subtotal_basico: 480_000, subtotal_km: 0,   // 16 días × 30.000
    })
    const r = calcularPerformance(
      TRAMOS, SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [q1, q2], CHOFERES, RUTAS, [],
    )
    // Las dos caen enteras dentro de julio: 450.000 + 480.000 = 930.000
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(930_000, 6)
  })

  it('NO descarta dos liquidaciones del mismo período de choferes DISTINTOS', () => {
    // Caso real de las liq 12 y 13 (Maldonado y Robles): mismo período, mismo
    // monto exacto, y las dos legítimas.
    const a = mkLiq({
      id: 12, chofer_id: 10,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      subtotal_basico: 930_000, subtotal_km: 0,
    })
    const b = mkLiq({
      id: 13, chofer_id: 11,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      subtotal_basico: 930_000, subtotal_km: 0,
    })
    const r = calcularPerformance(
      TRAMOS, SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [a, b], [mkChofer({ id: 10 }), mkChofer({ id: 11 })], RUTAS, [],
    )
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(1_860_000, 6)
  })

  it('una cáscara con relevos vinculados NO se descarta (los relevos cuentan como hijos)', () => {
    const relevo: RelevoLiquidado = {
      id: 1, tramo_id: 502, liquidacion_id: 23, chofer_id: CHOFER,
      km_cargado: 100, km_vacio: 0,
      tramo: { camion_id: CAMION, tipo: 'cargado' },
    }
    const r = correr('2026-07-01', '2026-07-31', [LIQ_BUENA, CASCARA], [relevo])
    // La 23 ya no está vacía: tiene una pata de relevo del 20/07 con 100 km, o
    // sea 100% de sus km en el rango → 780.000 + 5.574.680 = 6.354.680.
    // Más la 24 normal (3.567.340) = 9.922.020.
    expect(r.totales.costo_mo_cerrado).toBeCloseTo(6_354_680 + 3_567_340, 6)
  })
})

// ── El básico del "parcial" (trabajo sin liquidar) ───────────────────────────

describe('parcial estimado: el básico se cuenta por día corrido', () => {
  it('dos viajes al principio y al final del mes pagan los días del medio', () => {
    // Es como se liquida de verdad: verificado en las 13 liquidaciones vivas,
    // el básico se paga por día de calendario del período, no por día con
    // viaje (Alderete cobró 64 días teniendo 28 con viajes).
    const chofer = mkChofer({ id: 77, camion_id: CAMION, basico_dia: 30_000 })
    const t1 = mkTramo({ id: 601, chofer_id: 77, camion_id: CAMION, cantera_id: 5, deposito_id: 2, fecha_descarga: '2026-07-01', toneladas_descarga: 30 })
    const t2 = mkTramo({ id: 602, chofer_id: 77, camion_id: CAMION, cantera_id: 5, deposito_id: 2, fecha_descarga: '2026-07-10', toneladas_descarga: 30 })
    const r = calcularPerformance(
      [t1, t2], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [chofer], RUTAS, [],
    )
    // 01/07 al 10/07 = 10 días corridos × 30.000 = 300.000
    // (antes contaba 2 días con viaje = 60.000)
    // Km: precio_km 0 → no suma.
    expect(r.totales.costo_mo_parcial).toBe(300_000)
    expect(r.totales.tiene_parcial).toBe(true)
  })

  it('un solo día de viaje paga un solo día', () => {
    const chofer = mkChofer({ id: 78, camion_id: CAMION, basico_dia: 30_000 })
    const t1 = mkTramo({ id: 603, chofer_id: 78, camion_id: CAMION, cantera_id: 5, deposito_id: 2, fecha_descarga: '2026-07-05', toneladas_descarga: 30 })
    const r = calcularPerformance(
      [t1], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [chofer], RUTAS, [],
    )
    expect(r.totales.costo_mo_parcial).toBe(30_000)
  })

  it('los días ya cubiertos por una liquidación cerrada no se estiman de nuevo', () => {
    // Anti doble-conteo: el trabajo de la liq 24 está prorrateado en el lado
    // "cerrado", así que el parcial tiene que dar 0 para ese chofer.
    const choferConLiq = mkChofer({ id: CHOFER, camion_id: CAMION, basico_dia: 30_000 })
    const r = calcularPerformance(
      TRAMOS, SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [LIQ_BUENA], [choferConLiq], RUTAS, [],
    )
    expect(r.totales.costo_mo_parcial).toBe(0)
    expect(r.totales.costo_mo).toBeCloseTo(3_567_340, 6)
  })
})

// ── Tarifas versionadas: un aumento NO re-valúa el trabajo viejo ─────────────
//
// El bug que esto previene: el "parcial" valuaba con `chofer.basico_dia` y
// `chofer.precio_km_*` ACTUALES, que se pisaban in-place al guardar un aumento.
// O sea que subirle la tarifa a un chofer recalculaba hacia atrás todo su
// trabajo pendiente de liquidar. Es exactamente lo que pasó en tarja el
// 2026-06-26 y hubo que recuperar los históricos de un Excel.
// Migración 20260729g: choferes_basico_hist + choferes_km_hist.

describe('tarifas de chofer versionadas', () => {
  const CH = 88
  // Dos viajes de 100 km: uno en junio, otro en julio.
  const vJunio = mkTramo({
    id: 701, chofer_id: CH, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
    fecha_descarga: '2026-06-10', toneladas_descarga: 30,
  })
  const vJulio = mkTramo({
    id: 702, chofer_id: CH, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
    fecha_descarga: '2026-07-10', toneladas_descarga: 30,
  })

  // Aumento del $/km cargado a partir del 1/7: de 150 a 180. El básico no cambia.
  const choferConAumento = {
    ...mkChofer({ id: CH, camion_id: CAMION, basico_dia: 30_000, precio_km_cargado: 180 }),
    choferes_basico_hist: [{ valor_dia: 30_000, desde: '2026-04-01' }],
    choferes_km_hist: [
      { valor_km: 150, desde: '2026-04-01', tipo: 'cargado' as const },
      { valor_km: 180, desde: '2026-07-01', tipo: 'cargado' as const },
    ],
  } as Chofer

  it('el viaje de junio se paga a la tarifa VIEJA aunque hoy la tarifa sea otra', () => {
    const r = calcularPerformance(
      [vJunio], SIN_COBROS, SIN_TARIFAS, '2026-06-01', '2026-06-30',
      [], [choferConAumento], RUTAS, [],
    )
    // 1 día de básico (30.000) + 100 km × 150 (tarifa vigente al 10/06) = 45.000
    expect(r.totales.costo_mo_parcial).toBe(30_000 + 100 * 150)
  })

  it('el viaje de julio se paga a la tarifa NUEVA', () => {
    const r = calcularPerformance(
      [vJulio], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [choferConAumento], RUTAS, [],
    )
    // 1 día de básico + 100 km × 180 = 48.000
    expect(r.totales.costo_mo_parcial).toBe(30_000 + 100 * 180)
  })

  it('en un rango que cruza el aumento, cada viaje lleva su propia tarifa', () => {
    const r = calcularPerformance(
      [vJunio, vJulio], SIN_COBROS, SIN_TARIFAS, '2026-06-01', '2026-07-31',
      [], [choferConAumento], RUTAS, [],
    )
    // Básico: del 10/06 al 10/07 = 31 días corridos × 30.000 = 930.000
    // Km: 100 × 150 (junio) + 100 × 180 (julio) = 33.000
    expect(r.totales.costo_mo_parcial).toBe(31 * 30_000 + 100 * 150 + 100 * 180)
  })

  it('sin historial cargado cae al valor cacheado del chofer (no a cero)', () => {
    // Un 0 silencioso haría desaparecer el costo en vez de mostrar el problema.
    const sinHist = mkChofer({ id: 89, camion_id: CAMION, basico_dia: 30_000, precio_km_cargado: 150 })
    const t = mkTramo({
      id: 703, chofer_id: 89, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-10', toneladas_descarga: 30,
    })
    const r = calcularPerformance(
      [t], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [sinHist], RUTAS, [],
    )
    expect(r.totales.costo_mo_parcial).toBe(30_000 + 100 * 150)
  })

  it('una fecha anterior a todo el historial cae a la versión más vieja', () => {
    const t = mkTramo({
      id: 704, chofer_id: CH, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-03-15', toneladas_descarga: 30,
    })
    const r = calcularPerformance(
      [t], SIN_COBROS, SIN_TARIFAS, '2026-03-01', '2026-03-31',
      [], [choferConAumento], RUTAS, [],
    )
    // Marzo es previo al 01/04: usa la versión más vieja (150), nunca 0.
    expect(r.totales.costo_mo_parcial).toBe(30_000 + 100 * 150)
  })
})

// ── Estadías como mano de obra ───────────────────────────────────────────────
//
// Decisión del dueño el 2026-07-29: las estadías (días de espera para cargar o
// descargar, pagados por día) son mano de obra. Antes no figuraban en NINGUNA
// columna — ni en Gastos ni en Mano obra: $400.000 en el limbo.
//
// Se atribuyen por las fechas de la propia estadía, no prorrateando
// `liquidacion.total_estadias`. Verificado en los datos reales: `dias` es
// siempre (fecha_hasta − fecha_desde + 1) y `dias × monto_dia == total`.

function mkEstadia(over: Partial<Estadia> & Pick<Estadia, 'id' | 'chofer_id'>): Estadia {
  return {
    fecha_desde: '2026-07-14',
    fecha_hasta: '2026-07-17',
    dias: 4,
    monto_dia: 50_000,
    total: 200_000,
    obs: null,
    liquidacion_id: null,
    ...over,
  }
}

describe('estadías', () => {
  const CH = 55
  const choferes55 = [mkChofer({ id: CH, camion_id: CAMION })]

  it('CASO REAL (Robles, 14→17/07, sin liquidar): $200.000 al parcial', () => {
    // 4 días × $50.000 = 200.000
    const est = mkEstadia({ id: 4, chofer_id: CH })
    const r = calcularPerformance(
      [], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], choferes55, RUTAS, [], [est],
    )
    expect(r.totales.costo_estadias).toBe(200_000)
    expect(r.totales.costo_mo_parcial).toBe(200_000)
    expect(r.totales.costo_mo).toBe(200_000)
  })

  it('CASO REAL (Zelarayan, liquidada en la 29): $200.000 al cerrado, no al parcial', () => {
    const est = mkEstadia({ id: 3, chofer_id: CH, liquidacion_id: 29 })
    const r = calcularPerformance(
      [], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], choferes55, RUTAS, [], [est],
    )
    expect(r.totales.costo_mo_cerrado).toBe(200_000)
    expect(r.totales.costo_mo_parcial).toBe(0)
  })

  it('una estadía que cruza el borde de mes se parte por sus días', () => {
    // 28/06 al 03/07 = 6 días × 50.000 = 300.000
    //   junio: 28, 29, 30 = 3 días → 150.000
    //   julio: 01, 02, 03 = 3 días → 150.000
    const est = mkEstadia({
      id: 9, chofer_id: CH,
      fecha_desde: '2026-06-28', fecha_hasta: '2026-07-03',
      dias: 6, total: 300_000,
    })
    const junio = calcularPerformance([], SIN_COBROS, SIN_TARIFAS, '2026-06-01', '2026-06-30', [], choferes55, RUTAS, [], [est])
    const julio = calcularPerformance([], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31', [], choferes55, RUTAS, [], [est])
    expect(junio.totales.costo_estadias).toBe(150_000)
    expect(julio.totales.costo_estadias).toBe(150_000)
    // INVARIANTE: los meses disjuntos suman el total de la estadía.
    expect(junio.totales.costo_estadias + julio.totales.costo_estadias).toBe(300_000)
  })

  it('una estadía fuera del rango no cuenta', () => {
    const est = mkEstadia({ id: 10, chofer_id: CH })
    const r = calcularPerformance(
      [], SIN_COBROS, SIN_TARIFAS, '2026-08-01', '2026-08-31',
      [], choferes55, RUTAS, [], [est],
    )
    expect(r.totales.costo_estadias).toBe(0)
  })

  it('sin viajes en el rango, la estadía va al camión preasignado del chofer', () => {
    const est = mkEstadia({ id: 11, chofer_id: CH })
    const r = calcularPerformance(
      [], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], choferes55, RUTAS, [], [est],
    )
    expect(r.por_camion.find(f => f.entidad_id === CAMION)?.costo_estadias).toBe(200_000)
  })

  it('la estadía se suma al costo de mano de obra, no lo reemplaza', () => {
    // Un viaje sin liquidar (básico + km) MÁS la estadía.
    const chofer = mkChofer({ id: 56, camion_id: CAMION, basico_dia: 30_000, precio_km_cargado: 150 })
    const t = mkTramo({
      id: 801, chofer_id: 56, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-05', toneladas_descarga: 30,
    })
    const est = mkEstadia({ id: 12, chofer_id: 56 })
    const r = calcularPerformance(
      [t], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [chofer], RUTAS, [], [est],
    )
    // Viaje: 1 día × 30.000 + 100 km × 150 = 45.000. Estadía: 200.000.
    expect(r.totales.costo_mo).toBe(45_000 + 200_000)
    expect(r.totales.costo_estadias).toBe(200_000)
  })
})

// ── El ingreso teórico usa la MISMA escalera de tarifas que facturación ──────
//
// Caso real del 2026-07-29: el tramo 296 de Paramerica (TRACTOR, 35,32 t,
// cantera 10 → depósito 13) se valuaba a $102.850/t — la tarifa CHASIS, que era
// la más nueva — en vez de los $169.400/t a los que después se facturaba:
// $2.350.546 subvaluados en un solo viaje. La búsqueda vieja ignoraba el
// depósito y el tipo de camión.

describe('ingreso teórico con la escalera de facturación', () => {
  const EMP = 7, CANT = 10, DEP = 13
  const TARIFAS = [
    // General (sin unidad): $169.400 desde el 26/06.
    { id: 19, empresa_id: EMP, cantera_id: CANT, deposito_id: DEP, tipo_unidad: null,
      valor_ton: 169_400, vigente_desde: '2026-06-26' },
    // Chasis (más NUEVA): $102.850 desde el 29/06 — la trampa del caso real.
    { id: 21, empresa_id: EMP, cantera_id: CANT, deposito_id: DEP, tipo_unidad: 'chasis',
      valor_ton: 102_850, vigente_desde: '2026-06-29' },
  ] as TarifaEmpresaCantera[]

  const CAMIONES = [
    { id: 3, patente: 'AH568GK', categoria: 'tractor' },
    { id: 9, patente: 'CHASIS1', categoria: 'chasis' },
  ] as Camion[]

  function viaje(camionId: number) {
    return mkTramo({
      id: 296, chofer_id: 10, camion_id: camionId,
      empresa_id: EMP, cantera_id: CANT, deposito_id: DEP,
      fecha_descarga: '2026-07-27', toneladas_descarga: 35.32,
    })
  }

  it('CASO REAL 296: un TRACTOR se valúa a la tarifa general, no a la chasis más nueva', () => {
    const r = calcularPerformance(
      [viaje(3)], SIN_COBROS, TARIFAS, '2026-07-01', '2026-07-31',
      [], [], [], [], [], CAMIONES,
    )
    // 35,32 × 169.400 = 5.983.208 (antes daba 35,32 × 102.850 = 3.632.662)
    expect(r.totales.ingresos).toBeCloseTo(35.32 * 169_400, 6)
  })

  it('un CHASIS sí se valúa a la tarifa chasis', () => {
    const r = calcularPerformance(
      [viaje(9)], SIN_COBROS, TARIFAS, '2026-07-01', '2026-07-31',
      [], [], [], [], [], CAMIONES,
    )
    expect(r.totales.ingresos).toBeCloseTo(35.32 * 102_850, 6)
  })

  it('sin lista de camiones cae a batea (general), nunca a chasis', () => {
    const r = calcularPerformance(
      [viaje(3)], SIN_COBROS, TARIFAS, '2026-07-01', '2026-07-31',
      [], [], [], [], [], [],
    )
    expect(r.totales.ingresos).toBeCloseTo(35.32 * 169_400, 6)
  })

  it('CASO REAL 275: la tarifa de OTRO depósito no se aplica', () => {
    // Cantera 15: general $77.077 (01/07) y una específica del depósito 19 a
    // $86.601,52 (20/07, más nueva). El viaje fue al depósito 18 → general.
    const tarifas275 = [
      { id: 25, empresa_id: 11, cantera_id: 15, deposito_id: null, tipo_unidad: null,
        valor_ton: 77_077, vigente_desde: '2026-07-01' },
      { id: 28, empresa_id: 11, cantera_id: 15, deposito_id: 19, tipo_unidad: null,
        valor_ton: 86_601.52, vigente_desde: '2026-07-20' },
    ] as TarifaEmpresaCantera[]
    const t = mkTramo({
      id: 275, chofer_id: 10, camion_id: 3,
      empresa_id: 11, cantera_id: 15, deposito_id: 18,
      fecha_descarga: '2026-07-20', toneladas_descarga: 25.96,
    })
    const r = calcularPerformance(
      [t], SIN_COBROS, tarifas275, '2026-07-01', '2026-07-31',
      [], [], [], [], [], CAMIONES,
    )
    expect(r.totales.ingresos).toBeCloseTo(25.96 * 77_077, 6)
  })
})

// ── Desglose de ingresos: cobrado / por cobrar / sin facturar ────────────────

describe('desglose de ingresos', () => {
  const TARIFA = [{
    id: 1, empresa_id: 7, cantera_id: 10, deposito_id: null, tipo_unidad: null,
    valor_ton: 100_000, vigente_desde: '2026-07-01',
  }] as TarifaEmpresaCantera[]

  function tramoCon(id: number, cobroId: number | null) {
    return mkTramo({
      id, chofer_id: 10, camion_id: 3,
      empresa_id: 7, cantera_id: 10,
      fecha_descarga: '2026-07-10', toneladas_descarga: 10,
      cobro_id: cobroId,
    })
  }
  const COBROS = [
    { id: 1, empresa_id: 7, fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      toneladas_totales: 10, total: 1_210_000, estado: 'cobrado',
      obs: null, factura_nro: null, factura_fecha: null, created_at: '' },
    { id: 2, empresa_id: 7, fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      toneladas_totales: 10, total: 1_210_000, estado: 'pendiente',
      obs: null, factura_nro: null, factura_fecha: null, created_at: '' },
  ] as Cobro[]

  it('cada viaje cae en su bucket y los tres suman el total', () => {
    const r = calcularPerformance(
      [tramoCon(1, 1), tramoCon(2, 2), tramoCon(3, null)],
      COBROS, TARIFA, '2026-07-01', '2026-07-31',
      [], [], [], [], [], [],
    )
    expect(r.totales.ingresos_cobrado).toBe(1_210_000)       // cobro 1, cobrado
    expect(r.totales.ingresos_por_cobrar).toBe(1_210_000)    // cobro 2, pendiente
    expect(r.totales.ingresos_sin_facturar).toBe(1_000_000)  // 10 t × 100.000 teórico
    expect(
      r.totales.ingresos_cobrado + r.totales.ingresos_por_cobrar + r.totales.ingresos_sin_facturar,
    ).toBeCloseTo(r.totales.ingresos, 6)
  })
})

// ── Desglose del sueldo: básico / km / estadías ──────────────────────────────
//
// Pedido del dueño el 2026-07-30: "en un mes en particular, dónde puedo filtrar
// lo que gasto en sueldos entre el básico y los km". El motor ya calculaba las
// dos partes por separado; esto las expone.

describe('desglose básico / km / estadías', () => {
  it('INVARIANTE: basico + km + estadias == costo_mo, en cerrado', () => {
    const r = correr('2026-07-01', '2026-07-31')
    const t = r.totales
    expect(t.costo_mo_basico + t.costo_mo_km + t.costo_estadias).toBeCloseTo(t.costo_mo, 6)
    // Números a mano: básico julio = 2.250.000 × 26/75 = 780.000;
    // km julio = 5.574.680 × 100/200 = 2.787.340.
    expect(t.costo_mo_basico).toBeCloseTo(780_000, 6)
    expect(t.costo_mo_km).toBeCloseTo(2_787_340, 6)
  })

  it('INVARIANTE: también con parcial y estadías mezclados', () => {
    const chofer = mkChofer({ id: 91, camion_id: CAMION, basico_dia: 30_000, precio_km_cargado: 150 })
    const viaje = mkTramo({
      id: 901, chofer_id: 91, camion_id: CAMION, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-05', toneladas_descarga: 30,
    })
    const est = mkEstadia({ id: 20, chofer_id: 91 })
    const r = calcularPerformance(
      [viaje], SIN_COBROS, SIN_TARIFAS, '2026-07-01', '2026-07-31',
      [], [chofer], RUTAS, [], [est],
    )
    const t = r.totales
    // básico 1 día × 30.000 · km 100 × 150 = 15.000 · estadías 200.000
    expect(t.costo_mo_basico).toBe(30_000)
    expect(t.costo_mo_km).toBe(15_000)
    expect(t.costo_estadias).toBe(200_000)
    expect(t.costo_mo_basico + t.costo_mo_km + t.costo_estadias).toBeCloseTo(t.costo_mo, 6)
  })

  it('el desglose por fila de chofer reconstruye su costo_mo', () => {
    const r = correr('2026-07-01', '2026-07-31')
    for (const f of r.por_chofer) {
      expect(f.costo_mo_basico + f.costo_mo_km + f.costo_estadias).toBeCloseTo(f.costo_mo, 6)
    }
  })

  it('la suma del desglose por camión reconstruye el desglose del total', () => {
    const r = correr('2026-07-01', '2026-07-31')
    const sumBasico = r.por_camion.reduce((s, f) => s + f.costo_mo_basico, 0)
    const sumKm     = r.por_camion.reduce((s, f) => s + f.costo_mo_km, 0)
    expect(sumBasico).toBeCloseTo(r.totales.costo_mo_basico, 6)
    expect(sumKm).toBeCloseTo(r.totales.costo_mo_km, 6)
  })
})

// ── Modalidad pct en Reportes (2026-07-30) ───────────────────────────────────
// El chofer a % sin liquidar se estima con su comisión (% × ton × tarifa neta,
// solo cargados), no con km. Una liquidación pct cerrada prorratea su
// subtotal_pct por los km cargados de sus viajes en el rango.

describe('mano de obra de choferes a porcentaje', () => {
  const TARIFA_PCT = [{
    id: 50, empresa_id: 7, cantera_id: 5, deposito_id: null, tipo_unidad: null,
    valor_ton: 121_000, vigente_desde: '2026-07-01',   // neta $100.000
  }] as TarifaEmpresaCantera[]
  const CAMIONES_P = [{ id: 3, patente: 'AA111AA', categoria: 'tractor' }] as Camion[]

  const choferPct = {
    ...mkChofer({ id: 60, camion_id: 3, basico_dia: 0 }),
    modalidad_pago: 'pct' as const,
    pct_facturacion: 10,
    choferes_pct_hist: [{ pct: 10, desde: '2026-07-01' }],
  } as Chofer

  it('PARCIAL: comisión = % × ton × tarifa neta, solo viajes cargados', () => {
    const cargado = mkTramo({
      id: 950, chofer_id: 60, camion_id: 3, empresa_id: 7, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-10', toneladas_descarga: 30,
    })
    const vacio = mkTramo({
      id: 951, chofer_id: 60, camion_id: 3, tipo: 'vacio', fecha_vacio: '2026-07-11',
      toneladas_carga: null, toneladas_descarga: null,
    })
    const r = calcularPerformance(
      [cargado, vacio], SIN_COBROS, TARIFA_PCT, '2026-07-01', '2026-07-31',
      [], [choferPct], RUTAS, [], [], CAMIONES_P,
    )
    // 30 t × $100.000 neta = 3.000.000 × 10% = 300.000. El vacío no paga.
    // Jornal 0 → solo comisión.
    expect(r.totales.costo_mo_parcial).toBeCloseTo(300_000, 6)
    expect(r.totales.costo_mo_pct).toBeCloseTo(300_000, 6)
    expect(r.totales.costo_mo_km).toBe(0)
  })

  it('PARCIAL: con jornal opcional suma días corridos × jornal + comisión', () => {
    const conJornal = {
      ...choferPct,
      basico_dia: 20_000,
      choferes_basico_hist: [{ valor_dia: 20_000, desde: '2026-07-01' }],
    } as Chofer
    const t1 = mkTramo({
      id: 952, chofer_id: 60, camion_id: 3, empresa_id: 7, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-10', toneladas_descarga: 30,
    })
    const t2 = mkTramo({
      id: 953, chofer_id: 60, camion_id: 3, empresa_id: 7, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-14', toneladas_descarga: 30,
    })
    const r = calcularPerformance(
      [t1, t2], SIN_COBROS, TARIFA_PCT, '2026-07-01', '2026-07-31',
      [], [conJornal], RUTAS, [], [], CAMIONES_P,
    )
    // Jornal: 10→14 = 5 días corridos × 20.000 = 100.000
    // Comisión: 2 × 300.000 = 600.000
    expect(r.totales.costo_mo_parcial).toBeCloseTo(700_000, 6)
    expect(r.totales.costo_mo_basico).toBeCloseTo(100_000, 6)
    expect(r.totales.costo_mo_pct).toBeCloseTo(600_000, 6)
  })

  it('CERRADA pct: el subtotal_pct se prorratea por los km cargados del rango', () => {
    // Liquidación pct que cruza junio-julio con un viaje cargado en cada mes
    // (mismos km) → mitad y mitad.
    const vJun = mkTramo({
      id: 960, chofer_id: 60, camion_id: 3, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-06-20', toneladas_descarga: 30, liquidacion_id: 80,
    })
    const vJul = mkTramo({
      id: 961, chofer_id: 60, camion_id: 3, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-10', toneladas_descarga: 30, liquidacion_id: 80,
    })
    const liqPct = {
      ...mkLiq({
        id: 80, chofer_id: 60,
        fecha_desde: '2026-06-15', fecha_hasta: '2026-07-15',
        subtotal_basico: 0, subtotal_km: 0,
      }),
      modalidad: 'pct' as const, pct_aplicado: 10, base_neta: 6_000_000, subtotal_pct: 600_000,
    } as Liquidacion
    const julio = calcularPerformance(
      [vJun, vJul], SIN_COBROS, TARIFA_PCT, '2026-07-01', '2026-07-31',
      [liqPct], [choferPct], RUTAS, [], [], CAMIONES_P,
    )
    const junio = calcularPerformance(
      [vJun, vJul], SIN_COBROS, TARIFA_PCT, '2026-06-01', '2026-06-30',
      [liqPct], [choferPct], RUTAS, [], [], CAMIONES_P,
    )
    expect(julio.totales.costo_mo_cerrado).toBeCloseTo(300_000, 6)
    expect(junio.totales.costo_mo_cerrado).toBeCloseTo(300_000, 6)
    // INVARIANTE: los dos meses reconstruyen el subtotal_pct completo.
    expect(julio.totales.costo_mo_cerrado + junio.totales.costo_mo_cerrado).toBeCloseTo(600_000, 6)
  })

  it('INVARIANTE con pct: basico + km + pct + estadias == costo_mo', () => {
    const t1 = mkTramo({
      id: 970, chofer_id: 60, camion_id: 3, empresa_id: 7, cantera_id: 5, deposito_id: 2,
      fecha_descarga: '2026-07-10', toneladas_descarga: 30,
    })
    const est = mkEstadia({ id: 30, chofer_id: 60 })
    const r = calcularPerformance(
      [t1], SIN_COBROS, TARIFA_PCT, '2026-07-01', '2026-07-31',
      [], [choferPct], RUTAS, [], [est], CAMIONES_P,
    )
    const t = r.totales
    expect(t.costo_mo_basico + t.costo_mo_km + t.costo_mo_pct + t.costo_estadias)
      .toBeCloseTo(t.costo_mo, 6)
  })
})
