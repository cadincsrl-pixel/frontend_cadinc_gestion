// Golden numbers de la matemática de liquidaciones de choferes.
// CONGELA el comportamiento de src/modules/logistica/utils/liquidacion-math.ts
// tal como está hoy (2026-07-21). Todos los valores esperados están calculados
// A MANO (la cuenta va en el comentario al lado) — nunca llamando a la función.
// Si un test de acá falla, una fórmula de plata cambió: NO ajustes el número
// sin entender qué liquidaciones pasadas/futuras cambia.

import { describe, it, expect } from 'vitest'
import {
  calcularTotalesLiquidacion,
  diasEntreFechas,
  diasUnicos,
  kmTramo,
  kmRelevo,
  diasConRelevos,
  rangoConRelevos,
  tramoEnRango,
} from '@/modules/logistica/utils/liquidacion-math'
import type { Tramo, Ruta, RelevoPendiente } from '@/types/domain.types'

// ── Factories (objetos completos, sin `any`) ─────────────────────────────────

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

function mkRuta(over: Pick<Ruta, 'cantera_id' | 'deposito_id' | 'km_ida_vuelta'> & Partial<Ruta>): Ruta {
  return { id: 1, obs: null, ...over }
}

function mkRelevo(over: Partial<RelevoPendiente> = {}, tramoOver: Partial<NonNullable<RelevoPendiente['tramo']>> = {}): RelevoPendiente {
  return {
    id: 1,
    tramo_id: 100,
    chofer_id: 20,
    orden: 2,
    km_cargado: 0,
    km_vacio: 0,
    jornales: 0,
    tramo: {
      id: 100,
      tipo: 'cargado',
      estado: 'completado',
      camion_id: 3,
      cantera_id: 5,
      deposito_id: 2,
      fecha_carga: null,
      fecha_descarga: null,
      fecha_vacio: null,
      ...tramoOver,
    },
    ...over,
  }
}

// ── calcularTotalesLiquidacion — el corazón de la plata ──────────────────────

describe('calcularTotalesLiquidacion', () => {
  it('CASO REAL (verificado e2e 2026-07-16): chofer sin viajes, adelantos $1.000.000, estadía $100.000 → neto −$900.000', () => {
    // días 0 × $85.000        = $0
    // km  0 (cargados y vacíos) = $0
    // neto = 0 + 0 − 1.000.000 + 0 + 100.000 = −900.000
    const r = calcularTotalesLiquidacion({
      dias: 0,
      basico_dia: 85_000,
      km_cargados: 0,
      precio_km_cargado: 150,
      km_vacios: 0,
      precio_km_vacio: 130,
      descuentos: 1_000_000,   // adelantos que ya se le pagaron
      reintegros: 0,
      total_estadias: 100_000, // 2 días de estadía × $50.000
    })
    expect(r.subtotal_bas).toBe(0)
    expect(r.subtotal_km_cargado).toBe(0)
    expect(r.subtotal_km_vacio).toBe(0)
    expect(r.subtotal_km).toBe(0)
    expect(r.km_totales).toBe(0)
    // Con 0 km el "promedio" cae al fallback: precio_km_cargado tal cual.
    expect(r.precio_km).toBe(150)
    expect(r.neto).toBe(-900_000)
  })

  it('quincena completa: 15 días + 2.700 km cargados + 1.160 vacíos − adelanto + reintegro + estadía → neto $1.510.800', () => {
    // básico:      15 × 85.000        = 1.275.000
    // km cargados: 2.700 × 150        =   405.000
    // km vacíos:   1.160 × 130        =   150.800
    // subtotal km: 405.000 + 150.800  =   555.800
    // km totales:  2.700 + 1.160      =     3.860
    // neto: 1.275.000 + 555.800 − 500.000 + 80.000 + 100.000 = 1.510.800
    const r = calcularTotalesLiquidacion({
      dias: 15,
      basico_dia: 85_000,
      km_cargados: 2_700,
      precio_km_cargado: 150,
      km_vacios: 1_160,
      precio_km_vacio: 130,
      descuentos: 500_000,
      reintegros: 80_000,     // gasoil que pagó el chofer de su bolsillo
      total_estadias: 100_000,
    })
    expect(r.subtotal_bas).toBe(1_275_000)
    expect(r.subtotal_km_cargado).toBe(405_000)
    expect(r.subtotal_km_vacio).toBe(150_800)
    expect(r.subtotal_km).toBe(555_800)
    expect(r.km_totales).toBe(3_860)
    // precio_km ponderado: 555.800 / 3.860 = 143,98963730569948 $/km
    // (3.860 × 143 = 551.980; resto 3.820; 3.820/3.860 = 0,9896373…)
    expect(r.precio_km).toBeCloseTo(143.98963730569948, 8)
    expect(r.neto).toBe(1_510_800)
  })

  it('precio_km es el promedio PONDERADO por km, no el promedio simple de tarifas', () => {
    // 300 × 150 + 100 × 130 = 45.000 + 13.000 = 58.000
    // 58.000 / 400 km = 145 $/km  (el promedio simple sería (150+130)/2 = 140)
    const r = calcularTotalesLiquidacion({
      dias: 2,
      basico_dia: 85_000,
      km_cargados: 300,
      precio_km_cargado: 150,
      km_vacios: 100,
      precio_km_vacio: 130,
      descuentos: 0,
      reintegros: 0,
      total_estadias: 0,
    })
    expect(r.precio_km).toBe(145)
    // neto = 2 × 85.000 + 58.000 = 228.000
    expect(r.neto).toBe(228_000)
  })

  it('con 0 km totales, precio_km cae al fallback precio_km_cargado (back-compat con la columna precio_km)', () => {
    const r = calcularTotalesLiquidacion({
      dias: 5,
      basico_dia: 90_000,
      km_cargados: 0,
      precio_km_cargado: 165,
      km_vacios: 0,
      precio_km_vacio: 140,
      descuentos: 0,
      reintegros: 0,
      total_estadias: 0,
    })
    expect(r.precio_km).toBe(165) // NO 0, ni el de vacío: el fallback es el de cargado
    expect(r.neto).toBe(450_000)  // 5 × 90.000
  })

  it('todo en cero → neto 0 (liquidación vacía no inventa plata)', () => {
    const r = calcularTotalesLiquidacion({
      dias: 0, basico_dia: 0,
      km_cargados: 0, precio_km_cargado: 0,
      km_vacios: 0, precio_km_vacio: 0,
      descuentos: 0, reintegros: 0, total_estadias: 0,
    })
    expect(r.neto).toBe(0)
    expect(r.precio_km).toBe(0)
  })
})

// ── diasEntreFechas ──────────────────────────────────────────────────────────

describe('diasEntreFechas', () => {
  it('semana CADINC viernes→jueves: 2026-07-03 a 2026-07-09 = 7 días', () => {
    // 3,4,5,6,7,8,9 de julio → 7 días calendario inclusive
    expect(diasEntreFechas('2026-07-03', '2026-07-09')).toBe(7)
  })

  it('mismo día = 1 día (inclusive, no 0)', () => {
    expect(diasEntreFechas('2026-07-06', '2026-07-06')).toBe(1)
  })

  it('cruce de mes: 2026-06-26 a 2026-07-09 = 14 días', () => {
    // junio: 26,27,28,29,30 = 5 días; julio: 1..9 = 9 días → 14
    expect(diasEntreFechas('2026-06-26', '2026-07-09')).toBe(14)
  })

  it('string vacío en cualquiera de las dos puntas → 0', () => {
    expect(diasEntreFechas('', '2026-07-09')).toBe(0)
    expect(diasEntreFechas('2026-07-03', '')).toBe(0)
    expect(diasEntreFechas('', '')).toBe(0)
  })

  it('OJO: rango invertido devuelve días NEGATIVOS, no 0', () => {
    // OJO: la función no valida desde <= hasta. 2026-07-09 → 2026-07-03 da
    // (−6 días) + 1 = −5. Si algún caller le pasa las fechas al revés, el
    // básico de la liquidación se vuelve negativo en silencio.
    expect(diasEntreFechas('2026-07-09', '2026-07-03')).toBe(-5)
  })
})

// ── diasUnicos ───────────────────────────────────────────────────────────────

describe('diasUnicos', () => {
  it('lista vacía → 0', () => {
    expect(diasUnicos([])).toBe(0)
  })

  it('un tramo cargado con carga y descarga el mismo día → 1', () => {
    const t = mkTramo({ fecha_carga: '2026-07-06', fecha_descarga: '2026-07-06' })
    expect(diasUnicos([t])).toBe(1)
  })

  it('un tramo cargado que descarga al día siguiente → 2', () => {
    // carga 06/07, descarga 07/07 → 2 días calendario
    const t = mkTramo({ fecha_carga: '2026-07-06', fecha_descarga: '2026-07-07' })
    expect(diasUnicos([t])).toBe(2)
  })

  it('tramo vacío solo con fecha_vacio → 1 (fallback a fecha_vacio en inicio y fin)', () => {
    const t = mkTramo({ tipo: 'vacio', fecha_vacio: '2026-07-08' })
    expect(diasUnicos([t])).toBe(1)
  })

  it('tramo cargado en curso (sin descarga) → 1 (el fin cae a fecha_carga)', () => {
    const t = mkTramo({ estado: 'en_curso', fecha_carga: '2026-07-06' })
    expect(diasUnicos([t])).toBe(1)
  })

  it('OJO: pese al nombre, NO cuenta fechas únicas — devuelve el SPAN calendario min→max', () => {
    // OJO: dos tramos de un día el 01/07 y el 10/07 son 2 fechas trabajadas,
    // pero la función devuelve 10 (del 1 al 10 inclusive): los días del medio
    // sin viajes también se cobran como básico. Comportamiento congelado tal
    // como está — si esto cambia, cambia el básico de toda liquidación con
    // huecos entre viajes.
    const a = mkTramo({ id: 1, fecha_carga: '2026-07-01', fecha_descarga: '2026-07-01' })
    const b = mkTramo({ id: 2, fecha_carga: '2026-07-10', fecha_descarga: '2026-07-10' })
    expect(diasUnicos([a, b])).toBe(10)
  })
})

// ── kmTramo — lookup DIRECCIONAL de rutas ────────────────────────────────────

describe('kmTramo (lookup direccional cantera→depósito)', () => {
  // cantera_id y deposito_id salen de tablas distintas con ids solapados:
  // cantera 3→depósito 5 y cantera 5→depósito 3 son pares REALES distintos.
  const rutas: Ruta[] = [
    mkRuta({ id: 1, cantera_id: 3, deposito_id: 5, km_ida_vuelta: 420 }),
    mkRuta({ id: 2, cantera_id: 5, deposito_id: 3, km_ida_vuelta: 310 }),
  ]

  it('matchea exactamente el par (cantera, depósito) del tramo', () => {
    expect(kmTramo(mkTramo({ cantera_id: 3, deposito_id: 5 }), rutas)).toBe(420)
    expect(kmTramo(mkTramo({ cantera_id: 5, deposito_id: 3 }), rutas)).toBe(310)
  })

  it('NO matchea el par invertido: cantera 5→depósito 3 no agarra la ruta de cantera 3→depósito 5', () => {
    // Solo existe la ruta cantera 3→depósito 5 (420 km). Un tramo cantera 5→
    // depósito 3 NO debe agarrarla por colisión de ids (bug histórico:
    // DELTA ARENAS→MASUR agarraba la ruta YESO→BASE NEXA).
    const soloIda = [mkRuta({ id: 1, cantera_id: 3, deposito_id: 5, km_ida_vuelta: 420 })]
    expect(kmTramo(mkTramo({ cantera_id: 5, deposito_id: 3 }), soloIda)).toBe(0)
  })

  it('tramo sin cantera o sin depósito → 0 km', () => {
    expect(kmTramo(mkTramo({ cantera_id: null, deposito_id: 5 }), rutas)).toBe(0)
    expect(kmTramo(mkTramo({ cantera_id: 3, deposito_id: null }), rutas)).toBe(0)
  })

  it('sin ruta cargada para el par → 0 km (no explota, no inventa)', () => {
    expect(kmTramo(mkTramo({ cantera_id: 3, deposito_id: 5 }), [])).toBe(0)
  })
})

// ── kmRelevo — la pata del relevo también es plata ───────────────────────────

describe('kmRelevo', () => {
  it('tramo cargado → usa km_cargado; tramo vacío → usa km_vacio', () => {
    const cargado = mkRelevo({ km_cargado: 180, km_vacio: 240 }, { tipo: 'cargado' })
    const vacio   = mkRelevo({ km_cargado: 180, km_vacio: 240 }, { tipo: 'vacio' })
    expect(kmRelevo(cargado)).toBe(180)
    expect(kmRelevo(vacio)).toBe(240)
  })

  it('relevo sin tramo embebido → 0', () => {
    expect(kmRelevo(mkRelevo({ tramo: null }))).toBe(0)
  })
})

// ── tramoEnRango ─────────────────────────────────────────────────────────────

describe('tramoEnRango', () => {
  it('tramo cargado filtra por fecha_carga; los bordes del rango son inclusivos', () => {
    const t = mkTramo({ fecha_carga: '2026-07-03', fecha_descarga: '2026-07-04' })
    expect(tramoEnRango(t, '2026-07-03', '2026-07-09')).toBe(true)  // f == desde
    expect(tramoEnRango(t, '2026-07-01', '2026-07-03')).toBe(true)  // f == hasta
    expect(tramoEnRango(t, '2026-07-04', '2026-07-09')).toBe(false) // cargó antes del rango
  })

  it('tramo vacío filtra por fecha_vacio, no por fecha_carga', () => {
    const t = mkTramo({ tipo: 'vacio', fecha_vacio: '2026-07-08' })
    expect(tramoEnRango(t, '2026-07-08', '2026-07-08')).toBe(true)
    expect(tramoEnRango(t, '2026-07-01', '2026-07-07')).toBe(false)
  })

  it('sin fecha representativa → false (nunca entra a una liquidación)', () => {
    // OJO: un tramo VACÍO con fecha_carga cargada pero sin fecha_vacio también
    // da false — la fecha representativa del vacío es SOLO fecha_vacio.
    expect(tramoEnRango(mkTramo(), '2026-07-01', '2026-07-31')).toBe(false)
    const vacioRaro = mkTramo({ tipo: 'vacio', fecha_carga: '2026-07-05' })
    expect(tramoEnRango(vacioRaro, '2026-07-01', '2026-07-31')).toBe(false)
  })

  it('sin desde/hasta el rango es abierto → true si tiene fecha', () => {
    const t = mkTramo({ fecha_carga: '2026-07-06' })
    expect(tramoEnRango(t)).toBe(true)
    expect(tramoEnRango(t, undefined, '2026-07-31')).toBe(true)
    expect(tramoEnRango(t, '2026-07-01', undefined)).toBe(true)
  })
})

// ── rangoConRelevos ──────────────────────────────────────────────────────────

describe('rangoConRelevos', () => {
  it('solo tramos propios: desde = min carga, hasta = max descarga/vacío', () => {
    const tramos = [
      mkTramo({ id: 1, fecha_carga: '2026-07-06', fecha_descarga: '2026-07-07' }),
      mkTramo({ id: 2, tipo: 'vacio', fecha_vacio: '2026-07-08' }),
    ]
    expect(rangoConRelevos(tramos, [])).toEqual({ desde: '2026-07-06', hasta: '2026-07-08' })
  })

  it('chofer que SOLO hizo relevos: el rango sale de las fechas de relevo', () => {
    const relevos = [
      mkRelevo({ id: 1 }, { fecha_carga: '2026-07-05' }),
      mkRelevo({ id: 2 }, { tipo: 'vacio', fecha_vacio: '2026-07-09' }),
    ]
    expect(rangoConRelevos([], relevos)).toEqual({ desde: '2026-07-05', hasta: '2026-07-09' })
  })

  it('sin tramos ni relevos → strings vacíos (el modal arranca sin período)', () => {
    expect(rangoConRelevos([], [])).toEqual({ desde: '', hasta: '' })
  })

  it('OJO: la fecha_descarga del tramo de un relevo NO extiende el rango', () => {
    // OJO: para tramos propios cuentan carga Y descarga, pero para relevos
    // solo cuenta la fecha representativa (carga o vacío). Un relevo que cargó
    // el 05 y descargó el 09 deja hasta = 05.
    const relevos = [mkRelevo({}, { fecha_carga: '2026-07-05', fecha_descarga: '2026-07-09' })]
    expect(rangoConRelevos([], relevos)).toEqual({ desde: '2026-07-05', hasta: '2026-07-05' })
  })
})

// ── diasConRelevos ───────────────────────────────────────────────────────────

describe('diasConRelevos', () => {
  const desde = '2026-07-03'
  const hasta = '2026-07-09' // 7 días viernes→jueves

  it('día cubierto SOLO por relevo se resta del titular; el jornal del relevo se suma', () => {
    // El titular manejó 03, 04 y 06; el 05 lo cubrió otro chofer (relevo).
    // 7 días base − 1 día ajeno + 0,5 jornal propio de relevo = 6,5
    const own = new Set(['2026-07-03', '2026-07-04', '2026-07-06'])
    const relevos = [mkRelevo({ jornales: 0.5 }, { fecha_carga: '2026-07-05' })]
    expect(diasConRelevos(7, desde, hasta, own, relevos)).toBe(6.5)
  })

  it('relevo en un día donde el chofer TAMBIÉN tiene tramo propio: no se resta el día, el jornal suma igual', () => {
    // 7 − 0 + 0,5 = 7,5 (compartieron el día: cada uno cobra lo suyo)
    const own = new Set(['2026-07-05'])
    const relevos = [mkRelevo({ jornales: 0.5 }, { fecha_carga: '2026-07-05' })]
    expect(diasConRelevos(7, desde, hasta, own, relevos)).toBe(7.5)
  })

  it('dos relevos ajenos el mismo día restan UNA sola vez (Set), pero suman ambos jornales', () => {
    // 5 − 1 + (0,5 + 0,5) = 5
    const relevos = [
      mkRelevo({ id: 1, jornales: 0.5 }, { fecha_carga: '2026-07-04' }),
      mkRelevo({ id: 2, jornales: 0.5 }, { tipo: 'vacio', fecha_vacio: '2026-07-04' }),
    ]
    expect(diasConRelevos(5, desde, hasta, new Set(), relevos)).toBe(5)
  })

  it('chofer relevo puro (baseDias 0): no se resta nada, cobra la suma de sus jornales', () => {
    // 0 − 0 + (1 + 0,5) = 1,5 días de básico
    const relevos = [
      mkRelevo({ id: 1, jornales: 1 }, { fecha_carga: '2026-07-04' }),
      mkRelevo({ id: 2, jornales: 0.5 }, { fecha_carga: '2026-07-07' }),
    ]
    expect(diasConRelevos(0, desde, hasta, new Set(), relevos)).toBe(1.5)
  })

  it('OJO: el jornal de un relevo FUERA del rango se suma igual (solo el día respeta el rango)', () => {
    // OJO: el filtro desde/hasta aplica a la resta del día, pero `jornales +=`
    // corre para TODOS los relevos que llegan. Un relevo del 10/07 fuera del
    // rango 03→09 no resta día pero sí suma su jornal: 3 + 1 = 4. En la UI el
    // caller pre-filtra con relevoEnRango, así que esto solo muerde si alguien
    // le pasa relevos sin filtrar.
    const relevos = [mkRelevo({ jornales: 1 }, { fecha_carga: '2026-07-10' })]
    expect(diasConRelevos(3, '2026-07-03', '2026-07-09', new Set(), relevos)).toBe(4)
  })

  it('nunca devuelve negativo: clampa en 0', () => {
    // Sin desde/hasta ('' = rango abierto): 1 − 2 días ajenos + 0 = −1 → 0
    const relevos = [
      mkRelevo({ id: 1, jornales: 0 }, { fecha_carga: '2026-07-04' }),
      mkRelevo({ id: 2, jornales: 0 }, { fecha_carga: '2026-07-05' }),
    ]
    expect(diasConRelevos(1, '', '', new Set(), relevos)).toBe(0)
  })
})
