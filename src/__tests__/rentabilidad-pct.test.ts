import { describe, it, expect } from 'vitest'
import { calcularRentabilidad, type RentabilidadParametros, type RentabilidadViajeInput } from '@/lib/utils/rentabilidad'

// Parámetros mínimos: todo lo prorrateable en 0 para aislar el pago del chofer.
const PARAMS: RentabilidadParametros = {
  tipo_cambio_usd_ars: 1000,
  alicuota_iva: 0.21,
  valor_tractor_usd: 0,
  valor_residual_tractor_usd: 0,
  vida_util_tractor_km: 0,
  valor_semirremolque_usd: 0,
  vida_util_batea_anios: 0,
  costo_service: 0,
  frecuencia_service_km: 0,
  costo_cubierta: 0,
  cubiertas_por_equipo: 0,
  vida_util_neumaticos_km: 0,
  cargas_sociales_mensual: 0,
  seguros_mensual: 0,
  patente_anual: 0,
  gomeria_mensual: 0,
  lavadero_mensual: 0,
  overhead_pct: 0,
}

const VIAJE_BASE: RentabilidadViajeInput = {
  km_total: 1000,
  toneladas: 28,
  viajes_por_mes: 4,
  tarifa_neta_por_ton: 18000,
  precio_gasoil: 0,
  consumo_camion: 0,
  peajes_total: 0,
  chofer_por_km: 130,
  chofer_por_dia: 0,
  modalidad_pago: 'pct_jornal',
  pct_sobre_tarifa: 15,
}

describe('calcularRentabilidad — chofer a % de la tarifa neta', () => {
  it('el % es número entero (15 = 15%) y se aplica sobre tarifa NETA × toneladas', () => {
    const r = calcularRentabilidad(VIAJE_BASE, PARAMS)
    // 18.000 neto × 28 t × 15% = 75.600 (no 18.000×28×15 = 7.560.000)
    expect(r.pago_chofer).toBeCloseTo(75_600, 2)
  })

  it('en modo % el pago por km NO interviene', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, chofer_por_km: 999 }, PARAMS)
    expect(r.pago_chofer).toBeCloseTo(75_600, 2)
  })

  it('chofer solo a % (jornal 0): el costo de chofer es únicamente la comisión', () => {
    const r = calcularRentabilidad(VIAJE_BASE, PARAMS)
    expect(r.jornal_chofer).toBe(0)
    expect(r.costos_directos).toBeCloseTo(75_600, 2)
  })

  it('modo km sigue igual: km × $/km, el % no interviene', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, modalidad_pago: 'km_jornal' }, PARAMS)
    expect(r.pago_chofer).toBeCloseTo(1000 * 130, 2)
  })

  it('la comisión sale del INGRESO neto: margen = ingreso − comisión con todo lo demás en 0', () => {
    const r = calcularRentabilidad(VIAJE_BASE, PARAMS)
    expect(r.ingreso).toBeCloseTo(18000 * 28, 2)
    expect(r.margen).toBeCloseTo(18000 * 28 - 75_600, 2)
  })
})

// ── Comisión del dador de carga (20260914y) ──────────────────────────────────
//
// "A veces la tarifa que nos brindan incluye un porcentaje de comisión del
// dador de carga" — el pedido del user del 14/09. La tarifa que se carga es la
// que informa el dador; lo que entra de verdad es esa tarifa menos su comisión.
//
// Lo que NO es obvio: también baja el pago del chofer al %. En la liquidación
// real el chofer cobra sobre (ton × tarifa − comisión) / 1,21
// (liquidacion-math.ts), así que el simulador tiene que hacer lo mismo o
// sobreestima las dos puntas del viaje.
describe('calcularRentabilidad — comisión del dador', () => {
  it('sin comisión: el ingreso es la tarifa entera (los 28 viajes ya cargados)', () => {
    const r = calcularRentabilidad(VIAJE_BASE, PARAMS)
    expect(r.ingreso).toBeCloseTo(18_000 * 28, 2)
    expect(r.comision_dador).toBe(0)
  })

  it('comisión 8%: baja el ingreso Y la base del chofer al %', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, comision_pct: 8 }, PARAMS)
    // tarifa efectiva 18.000 × 0,92 = 16.560 → 16.560 × 28 = 463.680
    expect(r.ingreso).toBeCloseTo(463_680, 2)
    expect(r.comision_dador).toBeCloseTo(18_000 * 28 - 463_680, 2)
    // el chofer al 15% cobra sobre lo que queda, no sobre el bruto
    expect(r.pago_chofer).toBeCloseTo(463_680 * 0.15, 2)
    // y NO sobre la tarifa entera, que era el bug
    expect(r.pago_chofer).not.toBeCloseTo(18_000 * 28 * 0.15, 2)
  })

  it('el margen baja menos que el ingreso, porque el chofer también cobra menos', () => {
    const sin = calcularRentabilidad(VIAJE_BASE, PARAMS)
    const con = calcularRentabilidad({ ...VIAJE_BASE, comision_pct: 8 }, PARAMS)
    const caidaIngreso = sin.ingreso - con.ingreso
    const caidaMargen  = sin.margen - con.margen
    expect(caidaMargen).toBeLessThan(caidaIngreso)
    // exacto: la comisión menos lo que se ahorra en el chofer (15% de ella)
    expect(caidaMargen).toBeCloseTo(caidaIngreso * (1 - 0.15), 2)
  })

  it('con el chofer por km la comisión no toca su pago, solo el ingreso', () => {
    const base = { ...VIAJE_BASE, modalidad_pago: 'km_jornal' as const }
    const sin = calcularRentabilidad(base, PARAMS)
    const con = calcularRentabilidad({ ...base, comision_pct: 10 }, PARAMS)
    expect(con.pago_chofer).toBeCloseTo(sin.pago_chofer, 2)
    expect(sin.margen - con.margen).toBeCloseTo(18_000 * 28 * 0.10, 2)
  })

  it('replica la liquidación real: comisión sobre el bruto = comisión sobre el neto', () => {
    // En la realidad la comisión llega CON IVA y se resta del bruto con IVA:
    //   neto = (ton × tarifa_con_iva − comision_con_iva) / 1,21
    // Acá se aplica el % sobre la tarifa NETA. Da lo mismo porque las dos puntas
    // escalan por el mismo IVA — este test lo fija para que nadie lo "corrija".
    const IVA = 1.21
    const tarifaConIva = 18_000 * IVA
    const brutoConIva  = tarifaConIva * 28
    const comisionReal = brutoConIva * 0.08
    const netoReal     = (brutoConIva - comisionReal) / IVA

    const r = calcularRentabilidad({ ...VIAJE_BASE, comision_pct: 8 }, PARAMS)
    expect(r.ingreso).toBeCloseTo(netoReal, 2)
  })
})

describe('calcularRentabilidad — vuelve cargado (20260929v)', () => {
  const vuelta = { vuelve_cargado: true, toneladas_vuelta: 25, tarifa_vuelta_por_ton: 12000, comision_vuelta_pct: 10 }

  it('suma el ingreso de la vuelta, neto de su propia comisión', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, ...vuelta }, PARAMS)
    expect(r.ingreso_ida).toBeCloseTo(28 * 18000, 2)
    expect(r.ingreso_vuelta).toBeCloseTo(25 * 12000 * 0.9, 2)
    expect(r.ingreso).toBeCloseTo(28 * 18000 + 25 * 12000 * 0.9, 2)
    expect(r.comision_dador).toBeCloseTo(25 * 12000 * 0.1, 2)
  })

  it('el chofer al % cobra sobre las dos cargas', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, ...vuelta }, PARAMS)
    expect(r.pago_chofer).toBeCloseTo((28 * 18000 + 25 * 12000 * 0.9) * 0.15, 2)
  })

  it('sin tildar «vuelve cargado» la vuelta no cuenta aunque tenga datos', () => {
    const r = calcularRentabilidad({ ...VIAJE_BASE, ...vuelta, vuelve_cargado: false }, PARAMS)
    expect(r.ingreso_vuelta).toBe(0)
    expect(r.ingreso).toBeCloseTo(28 * 18000, 2)
  })
})
