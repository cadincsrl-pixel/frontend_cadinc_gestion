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
  Tramo, Cobro, TarifaEmpresaCantera, Liquidacion, Chofer, Ruta, RelevoLiquidado,
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

// ── El caso real de las cáscaras duplicadas ──────────────────────────────────
//
// Reproduce la situación exacta de producción al 2026-07-29:
//   liq 24 — Gonzalez, 13/05→26/07, subtotal_basico 2.250.000 + km 5.574.680,
//            con 1 tramo vinculado.
//   liq 23 — la MISMA, idéntica en fechas y montos, con 0 tramos vinculados.
// Un reporte de julio tomaba las dos y duplicaba $7.824.680.

describe('cáscaras duplicadas de liquidación', () => {
  const CHOFER_ID = 10
  const tramoLiquidado = mkTramo({
    id: 500, chofer_id: CHOFER_ID, camion_id: 3,
    fecha_descarga: '2026-07-20', toneladas_descarga: 30,
    liquidacion_id: 24,
  })
  const buena = mkLiq({
    id: 24, chofer_id: CHOFER_ID,
    fecha_desde: '2026-05-13', fecha_hasta: '2026-07-26',
    subtotal_basico: 2_250_000, subtotal_km: 5_574_680,
  })
  const cascara = mkLiq({
    id: 23, chofer_id: CHOFER_ID,
    fecha_desde: '2026-05-13', fecha_hasta: '2026-07-26',
    subtotal_basico: 2_250_000, subtotal_km: 5_574_680,
  })
  const choferes = [mkChofer({ id: CHOFER_ID, camion_id: 3 })]

  function correr(liqs: Liquidacion[]) {
    return calcularPerformance(
      [tramoLiquidado], SIN_COBROS, SIN_TARIFAS,
      '2026-07-01', '2026-07-31',
      liqs, choferes, [], [],
    )
  }

  it('sola, la liquidación buena imputa su costo una vez: 2.250.000 + 5.574.680 = 7.824.680', () => {
    const r = correr([buena])
    expect(r.totales.costo_mo).toBe(7_824_680)
  })

  it('con la cáscara al lado, NO duplica — sigue en 7.824.680 (antes daba 15.649.360)', () => {
    const r = correr([buena, cascara])
    expect(r.totales.costo_mo).toBe(7_824_680)
    const fila = r.por_chofer.find(f => f.entidad_id === CHOFER_ID)
    expect(fila?.costo_mo).toBe(7_824_680)
  })

  it('descarta la cáscara aunque venga primero en el array (no depende del orden)', () => {
    const r = correr([cascara, buena])
    expect(r.totales.costo_mo).toBe(7_824_680)
  })

  it('sobrevive la que tiene tramos, no la de id más alto: si la cáscara es la 29 y la buena la 25, gana la 25', () => {
    const buena25 = mkLiq({
      ...buena, id: 25,
    })
    const cascara29 = mkLiq({ ...cascara, id: 29 })
    const tramoEn25 = mkTramo({ ...tramoLiquidado, liquidacion_id: 25 })
    const r = calcularPerformance(
      [tramoEn25], SIN_COBROS, SIN_TARIFAS,
      '2026-07-01', '2026-07-31',
      [buena25, cascara29], choferes, [], [],
    )
    // Una sola vez, y el reparto por camión cae en el camión REAL del tramo (3),
    // que es lo que prueba que sobrevivió la 25 y no la 29 (sin hijos, iría al
    // camión preasignado por fallback — que acá es el mismo, así que además
    // verificamos el total).
    expect(r.totales.costo_mo).toBe(7_824_680)
    expect(r.por_camion.find(f => f.entidad_id === 3)?.costo_mo).toBe(7_824_680)
  })

  it('NO descarta dos liquidaciones cerradas del mismo chofer con períodos DISTINTOS', () => {
    // Caso legítimo: dos quincenas seguidas, las dos cerradas en el rango.
    const q1 = mkLiq({
      id: 40, chofer_id: CHOFER_ID,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-15',
      subtotal_basico: 500_000, subtotal_km: 0,
    })
    const q2 = mkLiq({
      id: 41, chofer_id: CHOFER_ID,
      fecha_desde: '2026-07-16', fecha_hasta: '2026-07-31',
      subtotal_basico: 700_000, subtotal_km: 0,
    })
    const r = calcularPerformance(
      [tramoLiquidado], SIN_COBROS, SIN_TARIFAS,
      '2026-07-01', '2026-07-31',
      [q1, q2], choferes, [], [],
    )
    // 500.000 + 700.000 = 1.200.000 — ninguna se descarta.
    expect(r.totales.costo_mo).toBe(1_200_000)
  })

  it('NO descarta dos liquidaciones del mismo período de choferes DISTINTOS', () => {
    const a = mkLiq({
      id: 12, chofer_id: 10,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      subtotal_basico: 1_332_150, subtotal_km: 0,
    })
    const b = mkLiq({
      id: 13, chofer_id: 11,
      fecha_desde: '2026-07-01', fecha_hasta: '2026-07-31',
      subtotal_basico: 1_332_150, subtotal_km: 0,
    })
    const r = calcularPerformance(
      [tramoLiquidado], SIN_COBROS, SIN_TARIFAS,
      '2026-07-01', '2026-07-31',
      [a, b], [mkChofer({ id: 10 }), mkChofer({ id: 11 })], [], [],
    )
    // Es el caso real de las liq 12 y 13 (Maldonado y Robles, mismo período,
    // mismo monto exacto): 1.332.150 × 2 = 2.664.300.
    expect(r.totales.costo_mo).toBe(2_664_300)
  })

  it('una cáscara con relevos vinculados NO se descarta (los relevos cuentan como hijos)', () => {
    const relevo: RelevoLiquidado = {
      id: 1, tramo_id: 500, liquidacion_id: 23, chofer_id: CHOFER_ID,
      km_cargado: 100, km_vacio: 0,
      tramo: { camion_id: 3, tipo: 'cargado' },
    }
    const r = calcularPerformance(
      [tramoLiquidado], SIN_COBROS, SIN_TARIFAS,
      '2026-07-01', '2026-07-31',
      [buena, cascara], choferes, [], [relevo],
    )
    // Las dos tienen hijos → las dos son "reales" y se suman. El filtro no
    // adivina: sólo desempata cuando una está genuinamente vacía.
    expect(r.totales.costo_mo).toBe(15_649_360)
  })
})
