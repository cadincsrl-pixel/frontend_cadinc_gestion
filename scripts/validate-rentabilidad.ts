// Validador de la fórmula de rentabilidad (test de no-regresión).
// Corré con: npx tsx scripts/validate-rentabilidad.ts
//
// Los casos base salieron del Excel YTL_Simulador_Rentabilidad.xlsx, pero los
// valores esperados se ACTUALIZARON el 2026-06-20 al corregir el tratamiento de
// IVA: la patente (tributo sin IVA) y las amortizaciones de tractor/batea
// (cargadas sin IVA) ya NO se netean por 1.21. Por eso difieren del Excel
// original, que arrastraba ese error. Si esto falla, hubo drift en la fórmula
// respecto de esta baseline corregida.

import {
  calcularRentabilidad,
  type RentabilidadParametros,
  type RentabilidadViajeInput,
} from '../src/lib/utils/rentabilidad'

const params: RentabilidadParametros = {
  alicuota_iva: 0.21,
  tipo_cambio_usd_ars: 1390,
  valor_tractor_usd: 99000,
  valor_residual_tractor_usd: 40000,
  vida_util_tractor_km: 800000,
  valor_semirremolque_usd: 45000,
  vida_util_batea_anios: 20,
  costo_service: 1310000,
  frecuencia_service_km: 30000,
  costo_cubierta: 300000,
  cubiertas_por_equipo: 22,
  vida_util_neumaticos_km: 130000,
  cargas_sociales_mensual: 400000,
  seguros_mensual: 400000,
  patente_anual: 1000000,
  gomeria_mensual: 100000,
  lavadero_mensual: 100000,
  overhead_pct: 0.01,
}

interface Caso {
  nombre: string
  viaje: RentabilidadViajeInput
  esperado: { margen: number; margen_pct: number; margen_mensual: number; margen_anual_usd: number }
}

const casos: Caso[] = [
  {
    nombre: 'cristamine 35t',
    viaje: { km_ida:1200, km_vuelta:1200, toneladas:35, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:81260, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 449293.05, margen_pct: 0.1580, margen_mensual: 3594344.38, margen_anual_usd: 31030.31 },
  },
  {
    nombre: 'cereal',
    viaje: { km_ida:60, km_vuelta:60, toneladas:31, dias_calendario:1, viajes_por_mes:20,
             tarifa_neta_por_ton:18000, precio_gasoil:2200, consumo_camion:3, peajes_total:0,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'pct_jornal', pct_sobre_tarifa:0.15 },
    esperado: { margen: 287233.52, margen_pct: 0.5148, margen_mensual: 5744670.45, margen_anual_usd: 49594.28 },
  },
  {
    nombre: 'lajitas',
    viaje: { km_ida:380, km_vuelta:380, toneladas:31, dias_calendario:1, viajes_por_mes:12,
             tarifa_neta_por_ton:53000, precio_gasoil:2200, consumo_camion:3, peajes_total:0,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'pct_jornal', pct_sobre_tarifa:0.15 },
    esperado: { margen: 657644.49, margen_pct: 0.4003, margen_mensual: 7891733.92, margen_anual_usd: 68130.08 },
  },
  {
    nombre: 'diamante',
    viaje: { km_ida:1362, km_vuelta:1362, toneladas:31, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:92200, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 176059.37, margen_pct: 0.0616, margen_mensual: 1408474.98, margen_anual_usd: 12159.50 },
  },
  {
    nombre: 'cristamine 31t',
    viaje: { km_ida:1200, km_vuelta:1200, toneladas:31, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:81260, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 124253.05, margen_pct: 0.0493, margen_mensual: 994024.38, margen_anual_usd: 8581.51 },
  },
  {
    nombre: 'diamante 35t',
    viaje: { km_ida:1362, km_vuelta:1362, toneladas:35, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:92200, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 544859.37, margen_pct: 0.1688, margen_mensual: 4358874.98, margen_anual_usd: 37630.58 },
  },
  {
    nombre: 'vuelta yeso diamante',
    viaje: { km_ida:1500, km_vuelta:1500, toneladas:31, dias_calendario:3, viajes_por_mes:7,
             tarifa_neta_por_ton:139467, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 1374209.50, margen_pct: 0.3178, margen_mensual: 9619466.51, margen_anual_usd: 83045.75 },
  },
]

function aprox(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) < tol
}

let ok = 0
let fallidos = 0
for (const c of casos) {
  const r = calcularRentabilidad(c.viaje, params)
  const checks = [
    ['margen',           r.margen,           c.esperado.margen,           1],
    ['margen_pct',       r.margen_pct,       c.esperado.margen_pct,       0.0001],
    ['margen_mensual',   r.margen_mensual,   c.esperado.margen_mensual,   1],
    ['margen_anual_usd', r.margen_anual_usd, c.esperado.margen_anual_usd, 0.5],
  ] as const

  const fails = checks.filter(([_, calc, esp, tol]) => !aprox(calc as number, esp as number, tol as number))
  if (fails.length === 0) {
    console.log(`✓ ${c.nombre}: margen $${r.margen.toFixed(0)} (${(r.margen_pct*100).toFixed(2)}%) → USD/año ${r.margen_anual_usd.toFixed(0)}`)
    ok++
  } else {
    console.log(`✗ ${c.nombre}:`)
    for (const [campo, calc, esp] of fails) {
      console.log(`    ${campo}: calculado=${(calc as number).toFixed(4)}  esperado=${(esp as number).toFixed(4)}`)
    }
    fallidos++
  }
}

console.log(`\n${ok}/${casos.length} OK${fallidos > 0 ? `, ${fallidos} FALLARON` : ''}`)
process.exit(fallidos > 0 ? 1 : 0)
