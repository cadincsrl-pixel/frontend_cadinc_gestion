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
