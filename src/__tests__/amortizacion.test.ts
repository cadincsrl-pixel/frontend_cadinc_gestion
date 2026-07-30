// Golden numbers de la amortización de equipos del "margen económico"
// (Gastos > Reportes). Valores esperados calculados A MANO con los parámetros
// REALES de producción al 2026-07-30. Si un test falla, cambió cuánta plata se
// reserva para reponer los camiones — no ajustes el número sin entender.

import { describe, it, expect } from 'vitest'
import { amortizacionEquipos, cargasSocialesPeriodo } from '@/lib/utils/amortizacion'

// Parámetros vigentes en rentabilidad_parametros (30/07/2026).
const PARAMS = {
  valor_tractor_usd:          100_000,
  valor_residual_tractor_usd: 40_000,
  vida_util_tractor_km:       1_200_000,
  valor_semirremolque_usd:    45_000,
  vida_util_batea_anios:      20,
  tipo_cambio_usd_ars:        1_505,
}

describe('amortizacionEquipos', () => {
  it('CASO REAL julio 2026: 48.779 km, 31 días, 5 equipos', () => {
    const a = amortizacionEquipos(PARAMS, 48_779, 31, 5)!
    // Tractores: (100.000 − 40.000) / 1.200.000 = 0,05 USD/km
    //            0,05 × 48.779 = 2.438,95 USD × 1.505 = 3.670.619,75
    expect(a.tractores).toBeCloseTo(3_670_619.75, 2)
    // Bateas: 45.000 / 20 / 365 = 6,164383… USD/día por equipo
    //         × 31 días × 1.505 × 5 equipos = 1.437.941,78…
    expect(a.bateas).toBeCloseTo(45_000 / 20 / 365 * 31 * 1_505 * 5, 2)
    expect(a.total).toBeCloseTo(a.tractores + a.bateas, 6)
  })

  it('sin km no hay amortización de tractor, pero la batea corre igual (es por tiempo)', () => {
    const a = amortizacionEquipos(PARAMS, 0, 31, 5)!
    expect(a.tractores).toBe(0)
    expect(a.bateas).toBeGreaterThan(0)
  })

  it('tipo de cambio en 0 → null (mejor no mostrar que mostrar un margen falso)', () => {
    expect(amortizacionEquipos({ ...PARAMS, tipo_cambio_usd_ars: 0 }, 48_779, 31, 5)).toBeNull()
  })

  it('vida útil en 0 → null, no división por cero', () => {
    expect(amortizacionEquipos({ ...PARAMS, vida_util_tractor_km: 0 }, 48_779, 31, 5)).toBeNull()
    expect(amortizacionEquipos({ ...PARAMS, vida_util_batea_anios: 0 }, 48_779, 31, 5)).toBeNull()
  })

  it('residual mayor que el valor (typo) → tractor clampeado a 0, nunca amortización negativa', () => {
    const a = amortizacionEquipos({ ...PARAMS, valor_residual_tractor_usd: 150_000 }, 48_779, 31, 5)!
    expect(a.tractores).toBe(0)
  })

  it('sin parámetros → null', () => {
    expect(amortizacionEquipos(null, 48_779, 31, 5)).toBeNull()
  })
})

describe('cargasSocialesPeriodo', () => {
  it('CASO REAL julio: $700.000/chofer × 6 choferes × 31 días', () => {
    // 700.000 × 12 / 365 = 23.013,6986…/día por chofer
    // × 31 días × 6 choferes = 4.280.547,945…
    const v = cargasSocialesPeriodo(700_000, 31, 6)
    expect(v).toBeCloseTo(700_000 * 12 / 365 * 31 * 6, 2)
    expect(v).toBeGreaterThan(4_280_000)
    expect(v).toBeLessThan(4_281_000)
  })

  it('un año completo devuelve exactamente 12 meses por chofer', () => {
    expect(cargasSocialesPeriodo(700_000, 365, 1)).toBeCloseTo(8_400_000, 6)
  })

  it('sin parámetro o sin choferes → 0', () => {
    expect(cargasSocialesPeriodo(0, 31, 6)).toBe(0)
    expect(cargasSocialesPeriodo(700_000, 31, 0)).toBe(0)
  })
})
