// Validador de la fórmula de rentabilidad contra los valores del Excel original.
// Corré con: npx tsx scripts/validate-rentabilidad.ts
//
// Valores esperados extraídos de YTL_Simulador_Rentabilidad.xlsx, hoja
// Datos, fila 6-12 (cols U=margen, V=margen%, W=margen mensual, X=USD/año).
// Si esto falla, NO mergear: hay drift entre nuestra fórmula y el Excel.

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
    esperado: { margen: 499955.99, margen_pct: 0.17579, margen_mensual: 3999647.90, margen_anual_usd: 34529.33 },
  },
  {
    nombre: 'cereal',
    viaje: { km_ida:60, km_vuelta:60, toneladas:31, dias_calendario:1, viajes_por_mes:20,
             tarifa_neta_por_ton:18000, precio_gasoil:2200, consumo_camion:3, peajes_total:0,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'pct_jornal', pct_sobre_tarifa:0.15 },
    esperado: { margen: 292404.45, margen_pct: 0.52402, margen_mensual: 5848089.06, margen_anual_usd: 50487.10 },
  },
  {
    nombre: 'lajitas',
    viaje: { km_ida:380, km_vuelta:380, toneladas:31, dias_calendario:1, viajes_por_mes:12,
             tarifa_neta_por_ton:53000, precio_gasoil:2200, consumo_camion:3, peajes_total:0,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'pct_jornal', pct_sobre_tarifa:0.15 },
    esperado: { margen: 676325.54, margen_pct: 0.41164, margen_mensual: 8115906.50, margen_anual_usd: 70065.38 },
  },
  {
    nombre: 'diamante',
    viaje: { km_ida:1362, km_vuelta:1362, toneladas:31, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:92200, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 232544.38, margen_pct: 0.08136, margen_mensual: 1860355.04, margen_anual_usd: 16060.62 },
  },
  {
    nombre: 'cristamine 31t',
    viaje: { km_ida:1200, km_vuelta:1200, toneladas:31, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:81260, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 174915.99, margen_pct: 0.06944, margen_mensual: 1399327.90, margen_anual_usd: 12080.53 },
  },
  {
    nombre: 'diamante 35t',
    viaje: { km_ida:1362, km_vuelta:1362, toneladas:35, dias_calendario:3, viajes_por_mes:8,
             tarifa_neta_por_ton:92200, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 601344.38, margen_pct: 0.18635, margen_mensual: 4810755.04, margen_anual_usd: 41531.70 },
  },
  {
    nombre: 'vuelta yeso diamante',
    viaje: { km_ida:1500, km_vuelta:1500, toneladas:31, dias_calendario:3, viajes_por_mes:7,
             tarifa_neta_por_ton:139467, precio_gasoil:2060, consumo_camion:3, peajes_total:30000,
             chofer_por_km:130, chofer_por_dia:28000, modalidad_pago:'km_jornal', pct_sobre_tarifa:0 },
    esperado: { margen: 1436730.69, margen_pct: 0.33231, margen_mensual: 10057114.85, margen_anual_usd: 86824.01 },
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
