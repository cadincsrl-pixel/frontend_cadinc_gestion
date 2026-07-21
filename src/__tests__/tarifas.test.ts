// Tests "golden number" de src/modules/logistica/utils/tarifas.ts
//
// CONGELAN la matemática de plata de facturación de logística tal como está
// hoy (2026-07). Todos los valores esperados están calculados A MANO (la
// cuenta está en el comentario al lado de cada assert) — NUNCA generados
// llamando a la función bajo test.
//
// Si uno de estos tests falla, cambió una fórmula que toca facturas reales
// a empresas transportistas. NO ajustar el número esperado sin entender
// qué factura va a salir distinta.

import { describe, it, expect } from 'vitest'
import { IVA, netaAFinal, finalANeta, tarifaParaFecha, unidadDelCamion } from '@/modules/logistica/utils/tarifas'
import type { TarifaEmpresaCantera, Camion } from '@/types/domain.types'

// ── Helpers de fixtures (objetos mínimos, el resto de campos no participa) ──

let nextId = 1
function tarifa(t: {
  empresa_id: number
  cantera_id: number
  deposito_id?: number | null
  tipo_unidad?: 'batea' | 'chasis' | null
  valor_ton: number
  vigente_desde: string
}): TarifaEmpresaCantera {
  return {
    id: nextId++,
    empresa_id: t.empresa_id,
    cantera_id: t.cantera_id,
    deposito_id: t.deposito_id ?? null,
    tipo_unidad: t.tipo_unidad ?? null,
    valor_ton: t.valor_ton,
    vigente_desde: t.vigente_desde,
    obs: null,
    updated_at: null,
    updated_by: null,
  }
}

function camion(id: number, categoria: 'tractor' | 'chasis'): Camion {
  return { id, categoria } as Camion
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) netaAFinal / finalANeta — IVA 21%
// ─────────────────────────────────────────────────────────────────────────────

describe('netaAFinal — neta del transportista → valor final c/IVA que se factura', () => {
  it('la constante IVA es 1.21 (21%) — si cambia, cambia TODA la facturación', () => {
    expect(IVA).toBe(1.21)
  })

  it('caso real: chasis de Paramérica $85.000 neta → $102.850 final', () => {
    // 85000 × 1.21 = 85000 + 17850 = 102850
    expect(netaAFinal(85000)).toBe(102850)
  })

  it('todas las netas reales de prod dan el final guardado en la DB', () => {
    // 48000 × 1.21 = 48000 + 10080   = 58080
    expect(netaAFinal(48000)).toBe(58080)
    // 80000 × 1.21 = 80000 + 16800   = 96800
    expect(netaAFinal(80000)).toBe(96800)
    // 140000 × 1.21 = 140000 + 29400 = 169400
    expect(netaAFinal(140000)).toBe(169400)
    // 52000 × 1.21 = 52000 + 10920   = 62920
    expect(netaAFinal(52000)).toBe(62920)
    // 25480 × 1.21 = 25480 + 5350.8  = 30830.8
    expect(netaAFinal(25480)).toBe(30830.8)
    // 40950 × 1.21 = 40950 + 8599.5  = 49549.5
    expect(netaAFinal(40950)).toBe(49549.5)
    // 63700 × 1.21 = 63700 + 13377   = 77077
    expect(netaAFinal(63700)).toBe(77077)
  })

  it('neta 0 → final 0 (no inventa plata)', () => {
    expect(netaAFinal(0)).toBe(0)
  })
})

describe('finalANeta — prefill de edición: final guardado → neta que pasó el transportista', () => {
  it('todos los finales reales de la DB de prod vuelven a su neta exacta', () => {
    // 58080 / 1.21   = 48000  (48000 × 1.21 = 58080)
    expect(finalANeta(58080)).toBe(48000)
    // 96800 / 1.21   = 80000
    expect(finalANeta(96800)).toBe(80000)
    // 169400 / 1.21  = 140000
    expect(finalANeta(169400)).toBe(140000)
    // 62920 / 1.21   = 52000
    expect(finalANeta(62920)).toBe(52000)
    // 30830.8 / 1.21 = 25480
    expect(finalANeta(30830.8)).toBe(25480)
    // 49549.5 / 1.21 = 40950
    expect(finalANeta(49549.5)).toBe(40950)
    // 77077 / 1.21   = 63700
    expect(finalANeta(77077)).toBe(63700)
    // 102850 / 1.21  = 85000 (el chasis de Paramérica)
    expect(finalANeta(102850)).toBe(85000)
  })

  it('ROUNDTRIP netaAFinal(finalANeta(x)) === x para todos los finales de prod', () => {
    // Garantiza que editar una tarifa sin tocar la neta NO corre el valor
    // final guardado ni un centavo (los finales de la DB tienen ≤2 decimales).
    const finalesReales = [58080, 96800, 169400, 62920, 30830.8, 49549.5, 77077, 102850]
    for (const final of finalesReales) {
      expect(netaAFinal(finalANeta(final))).toBe(final)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (b) tarifaParaFecha — escalera de prioridad + vigencia
// ─────────────────────────────────────────────────────────────────────────────

// Empresa y lugares ficticios pero con IDs y montos de magnitud real
const EMPRESA = 7        // "Paramérica" en los casos reales
const CANTERA_INGENIO = 3
const DEPO_LULES = 12
const OTRA_CANTERA = 99

describe('tarifaParaFecha — escalera depósito+unidad > depósito > unidad > general', () => {
  it('sin tarifas específicas usa la general (empresa+cantera, deposito null, unidad null)', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      // Ruido: otra cantera y otra empresa no deben contaminar
      tarifa({ empresa_id: EMPRESA, cantera_id: OTRA_CANTERA, valor_ton: 999999, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: 8, cantera_id: CANTERA_INGENIO, valor_ton: 888888, vigente_desde: '2026-05-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15')).toBe(169400)
  })

  it('la tarifa depósito-específica gana sobre la general', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, deposito_id: DEPO_LULES, valor_ton: 152000, vigente_desde: '2026-05-01' }),
    ]
    // Descarga en el depósito Lules → 152000, no 169400
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15')).toBe(152000)
    // Descarga en otro depósito (sin tarifa propia) → cae a la general
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, 44, '2026-06-15')).toBe(169400)
  })

  it('la tarifa unidad-específica (chasis, sin depósito) gana sobre la general', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, tipo_unidad: 'chasis', valor_ton: 102850, vigente_desde: '2026-05-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15', 'chasis')).toBe(102850)
  })

  it('depósito+unidad gana sobre depósito solo, unidad sola y general', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, deposito_id: DEPO_LULES, valor_ton: 152000, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, tipo_unidad: 'chasis', valor_ton: 102850, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, deposito_id: DEPO_LULES, tipo_unidad: 'chasis', valor_ton: 98000, vigente_desde: '2026-05-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15', 'chasis')).toBe(98000)
  })

  it('REGRESIÓN factura 2-1163: cantera INGENIO, general $169.400 + chasis $102.850', () => {
    // La factura 2-1163 salió mal porque el viaje en chasis se cobró con la
    // tarifa de batea. Este set es el real de prod: general (batea) 169400,
    // chasis 102850.
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, tipo_unidad: 'chasis', valor_ton: 102850, vigente_desde: '2026-05-01' }),
    ]
    // Viaje en chasis → tarifa chasis
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-20', 'chasis')).toBe(102850)
    // Viaje en batea → no hay tarifa batea-específica, cae a la general
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-20', 'batea')).toBe(169400)
  })

  it('POOL VACÍO cae al siguiente escalón: pido depósito+unidad, solo existe depósito → usa depósito', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, deposito_id: DEPO_LULES, valor_ton: 152000, vigente_desde: '2026-05-01' }),
    ]
    // No hay tarifa depósito+chasis NI chasis sola → gana la depósito-específica
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15', 'chasis')).toBe(152000)
  })
})

describe('tarifaParaFecha — vigente_desde (versionado de tarifas)', () => {
  it('con dos tarifas del mismo pool gana la más reciente que no supera la fecha', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 140000, vigente_desde: '2026-02-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
    ]
    // Descarga en junio → rige el aumento de mayo
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-06-15')).toBe(169400)
    // Descarga en marzo → rige todavía la vieja
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-03-10')).toBe(140000)
    // Descarga EXACTO el día del aumento → ya rige la nueva (<= es inclusivo)
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-05-01')).toBe(169400)
  })

  it('una tarifa futura NO aplica (aunque sea la única, devuelve 0)', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 200000, vigente_desde: '2026-08-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-07-10')).toBe(0)
  })

  it('una tarifa futura no pisa a la vigente', () => {
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 200000, vigente_desde: '2026-08-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-07-10')).toBe(169400)
  })

  it('EMPATE de vigente_desde: gana la que aparece PRIMERA en la lista', () => {
    // OJO: el código no desempata por id ni updated_at — el sort por fecha es
    // estable, así que con dos tarifas del mismo pool y misma vigente_desde
    // gana la que venga primera en el array (o sea, el orden con que el
    // backend las devolvió). Si algún día se cargan dos tarifas iguales el
    // mismo día, cuál rige depende del ORDER BY del fetch. Congelamos ese
    // comportamiento, no lo bendecimos.
    const tarifas = [
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
      tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 175000, vigente_desde: '2026-05-01' }),
    ]
    expect(tarifaParaFecha(tarifas, EMPRESA, CANTERA_INGENIO, null, '2026-06-15')).toBe(169400)
  })
})

describe('tarifaParaFecha — casos borde (ceros, nulls, listas vacías)', () => {
  const conTarifa = [
    tarifa({ empresa_id: EMPRESA, cantera_id: CANTERA_INGENIO, valor_ton: 169400, vigente_desde: '2026-05-01' }),
  ]

  it('sin cantera (null) → 0, aunque haya tarifas cargadas', () => {
    expect(tarifaParaFecha(conTarifa, EMPRESA, null, DEPO_LULES, '2026-06-15')).toBe(0)
  })

  it('sin fecha (null) → 0, aunque haya tarifas cargadas', () => {
    expect(tarifaParaFecha(conTarifa, EMPRESA, CANTERA_INGENIO, DEPO_LULES, null)).toBe(0)
  })

  it('lista de tarifas vacía → 0', () => {
    expect(tarifaParaFecha([], EMPRESA, CANTERA_INGENIO, DEPO_LULES, '2026-06-15')).toBe(0)
  })

  it('empresa sin tarifas para esa cantera → 0 (no agarra tarifas de otra empresa)', () => {
    expect(tarifaParaFecha(conTarifa, 55, CANTERA_INGENIO, DEPO_LULES, '2026-06-15')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (c) unidadDelCamion
// ─────────────────────────────────────────────────────────────────────────────

describe('unidadDelCamion — qué unidad paga el viaje según el camión', () => {
  const flota = [
    camion(1, 'tractor'),
    camion(2, 'chasis'),
  ]

  it('camión chasis → chasis', () => {
    expect(unidadDelCamion(flota, 2)).toBe('chasis')
  })

  it('camión tractor → batea', () => {
    expect(unidadDelCamion(flota, 1)).toBe('batea')
  })

  it('camión inexistente en la flota → batea (default histórico: todo era batea)', () => {
    expect(unidadDelCamion(flota, 999)).toBe('batea')
  })

  it('viaje sin camión asignado (null) → batea', () => {
    expect(unidadDelCamion(flota, null)).toBe('batea')
  })

  it('viaje sin camión asignado (undefined) → batea', () => {
    expect(unidadDelCamion(flota, undefined)).toBe('batea')
  })

  it('flota vacía → batea', () => {
    expect(unidadDelCamion([], 2)).toBe('batea')
  })
})
