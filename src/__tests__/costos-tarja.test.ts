// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN NUMBERS — matemática de plata de la tarja (src/lib/utils/costos.ts)
//
// Estos tests CONGELAN los números tal como los calcula el código hoy
// (2026-07). Si uno falla, NO es "un test viejo": significa que cambió la
// fórmula con la que se le paga a la gente o se le cobra al cliente.
// Antes de tocar el esperado, entender POR QUÉ cambió el número.
//
// Todos los esperados están calculados A MANO (la cuenta está en el
// comentario al lado de cada expect). Ninguno se generó llamando a la
// función bajo test.
//
// Contexto de negocio (CLAUDE.md §5.3, §5.11):
// - La semana CADINC va de viernes a jueves. sem_key = ISO del viernes.
// - El vh global por categoría está VERSIONADO en categoria_tarifas desde el
//   2026-07-02, porque el 2026-06-26 un aumento global (UPDATE in-place)
//   recalculó retroactivamente semanas ya pagadas. getVHGlobalEnFecha existe
//   para que eso no vuelva a pasar: acá se congela esa regresión.
// - costoLegConCatObra es la fórmula CANÓNICA (respeta overrides de
//   cat_obra). calcularTotalesSemana/costoLeg sin override NO los respeta:
//   por eso está deprecada, y acá se documenta la diferencia numérica.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  getHsExtrasLeg,
  getTarifaEnFecha,
  getVHGlobalEnFecha,
  getVHenFecha,
  totalHsLeg,
  costoLeg,
  calcularTotalesSemana,
  fmtMonto,
  fmtHs,
  getCatIdEfectivo,
  getVHConCatObra,
  costoLegConCatObra,
  type CatObraEntry,
} from '@/lib/utils/costos'
import { getSemDays } from '@/lib/utils/dates'
import type { Hora, Personal, Categoria, Tarifa, TarjaHsExtra } from '@/types/domain.types'

// ── Reloj pinneado ───────────────────────────────────────────────────────────
// costoLeg y costoLegConCatObra miran new Date() para decidir si la semana a
// calcular es "la actual" (fechaRef = hoy) o pasada (fechaRef = viernes de esa
// semana). Pinneamos "hoy" = martes 2026-07-21 para que los tests den lo mismo
// dentro de 6 meses. El viernes de la semana en curso queda en 2026-07-17.
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 21, 12, 0, 0)) // martes 21/07/2026, mediodía local
})
afterAll(() => {
  vi.useRealTimers()
})

// ── Factories (rellenan los campos que no afectan el cálculo) ────────────────
let seqId = 0
function mkPersonal(leg: string, nom: string, cat_id: number, hist: { cat_id: number; desde: string }[] = []): Personal {
  return {
    leg, nom, cat_id,
    dni: null, condicion: 'blanco', modalidad: 'hora',
    tel: null, dir: null, obs: null,
    talle_pantalon: null, talle_botines: null, talle_camisa: null,
    activo_override: null, fecha_nacimiento: null,
    personal_cat_historial: hist,
  }
}
function mkHora(obra_cod: string, leg: string, fecha: string, horas: number): Hora {
  return { id: ++seqId, obra_cod, leg, fecha, horas }
}
function mkTarifa(obra_cod: string, cat_id: number, vh: number, desde: string): Tarifa {
  return { id: ++seqId, obra_cod, cat_id, vh, desde }
}
function mkExtra(obra_cod: string, leg: string, sem_key: string, hs: number): TarjaHsExtra {
  return { id: ++seqId, obra_cod, leg, sem_key, hs }
}

// ── Universo de fixtures (números reales de CADINC, ARS 2026) ────────────────
//
// Categorías con vh global versionado. El aumento global fue el vie 2026-06-26.
// `vh` (campo suelto) es el CACHE de la última versión — nunca debe usarse
// para fechas viejas.
const CAT_OFICIAL: Categoria = {
  id: 1, nom: 'Oficial', vh: 7200,
  categoria_tarifas: [
    { id: 11, vh: 6500, desde: '2026-03-06' }, // precio pre-aumento
    { id: 12, vh: 7200, desde: '2026-06-26' }, // aumento global del 26/6
  ],
}
const CAT_MEDIO: Categoria = {
  id: 2, nom: 'Medio oficial', vh: 6300,
  categoria_tarifas: [
    { id: 21, vh: 5800, desde: '2026-03-06' },
    { id: 22, vh: 6300, desde: '2026-06-26' },
  ],
}
// Ayudante SIN historial cargado → getVHGlobalEnFecha cae al cache.
const CAT_AYUDANTE: Categoria = { id: 3, nom: 'Ayudante', vh: 5500 }

const CATEGORIAS: Categoria[] = [CAT_OFICIAL, CAT_MEDIO, CAT_AYUDANTE]

// Obra OB-124 tiene tarifa propia SOLO para Oficial (cat 1).
// Medio oficial y Ayudante caen al precio global.
const OBRA = 'OB-124'
const TARIFAS: Tarifa[] = [
  mkTarifa(OBRA, 1, 7000, '2026-04-03'),
  mkTarifa(OBRA, 1, 7800, '2026-06-26'),
]

// Personal:
// - 1042 PÉREZ arrancó Ayudante (2025-08-01) y ascendió a Oficial el 2026-02-06.
// - 2087 GÓMEZ es Ayudante sin historial.
const PEREZ = mkPersonal('1042', 'PÉREZ JUAN', 1, [
  { cat_id: 3, desde: '2025-08-01' },
  { cat_id: 1, desde: '2026-02-06' },
])
const GOMEZ = mkPersonal('2087', 'GÓMEZ LUIS', 3)
const PERSONAL: Personal[] = [PEREZ, GOMEZ]

// Semana de referencia (PASADA): viernes 2026-05-15 → jueves 2026-05-21.
const SEM_MAYO = getSemDays(new Date(2026, 4, 15, 12)) // vie 15/05/2026
const SEM_MAYO_KEY = '2026-05-15'

// Horas de esa semana en OB-124 (+ filas de ruido que el filtro debe ignorar):
// PÉREZ: vie 9, sáb 4, lun 9, mar 9, mié 9, jue 9  → 49 hs
// GÓMEZ: vie 9,        lun 9, mar 9, mié 9, jue 9  → 45 hs
const HORAS: Hora[] = [
  mkHora(OBRA, '1042', '2026-05-15', 9),
  mkHora(OBRA, '1042', '2026-05-16', 4),
  mkHora(OBRA, '1042', '2026-05-18', 9),
  mkHora(OBRA, '1042', '2026-05-19', 9),
  mkHora(OBRA, '1042', '2026-05-20', 9),
  mkHora(OBRA, '1042', '2026-05-21', 9),
  mkHora(OBRA, '2087', '2026-05-15', 9),
  mkHora(OBRA, '2087', '2026-05-18', 9),
  mkHora(OBRA, '2087', '2026-05-19', 9),
  mkHora(OBRA, '2087', '2026-05-20', 9),
  mkHora(OBRA, '2087', '2026-05-21', 9),
  // Ruido: otra obra y otro legajo, mismas fechas. No deben sumar.
  mkHora('OB-999', '1042', '2026-05-18', 8),
  mkHora(OBRA, '3001', '2026-05-18', 9),
]

// 6 hs extras de PÉREZ en esa semana.
const EXTRAS: TarjaHsExtra[] = [mkExtra(OBRA, '1042', SEM_MAYO_KEY, 6)]

// ─────────────────────────────────────────────────────────────────────────────
describe('getTarifaEnFecha — tarifa de obra versionada por fecha', () => {
  it('usa la versión más reciente con desde <= fecha (la futura NO aplica)', () => {
    // Vigentes para cat 1 en OB-124: 7000 desde 04/03, 7800 desde 06/26.
    // Al 2026-05-15 solo aplica la de 7000.
    expect(getTarifaEnFecha(TARIFAS, OBRA, 1, '2026-05-15')).toBe(7000)
  })

  it('el día exacto del cambio ya rige la tarifa nueva (desde es inclusivo)', () => {
    expect(getTarifaEnFecha(TARIFAS, OBRA, 1, '2026-06-26')).toBe(7800)
  })

  it('después de la última versión sigue rigiendo la última', () => {
    expect(getTarifaEnFecha(TARIFAS, OBRA, 1, '2026-07-17')).toBe(7800)
  })

  it('si TODAS las versiones son futuras, aplica la más antigua (retroactivo)', () => {
    // OJO: para una fecha anterior a toda tarifa cargada NO devuelve null:
    // devuelve la tarifa más vieja como valor retroactivo. Es deliberado
    // (semanas anteriores al alta de la tarifa se valorizan igual).
    expect(getTarifaEnFecha(TARIFAS, OBRA, 1, '2026-01-09')).toBe(7000)
  })

  it('sin tarifas para esa obra+categoría devuelve null (para caer al vh global)', () => {
    expect(getTarifaEnFecha(TARIFAS, OBRA, 3, '2026-05-15')).toBeNull()
    expect(getTarifaEnFecha([], OBRA, 1, '2026-05-15')).toBeNull()
  })

  it('empate de fecha: gana la última fila del array (sort estable)', () => {
    // OJO: dos tarifas con el mismo `desde` no deberían existir, pero si
    // existen gana la que viene DESPUÉS en el array (el sort por desde es
    // estable y el loop se queda con la última asignada). Congelado tal cual.
    const empatadas = [
      mkTarifa(OBRA, 1, 7000, '2026-04-03'),
      mkTarifa(OBRA, 1, 7100, '2026-04-03'),
    ]
    expect(getTarifaEnFecha(empatadas, OBRA, 1, '2026-05-15')).toBe(7100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getVHGlobalEnFecha — vh global versionado (regresión del 2026-06-26)', () => {
  it('REGRESIÓN CLAVE: una semana vieja usa el vh viejo aunque haya un aumento posterior', () => {
    // El 2026-06-26 un aumento global (UPDATE in-place, modelo viejo)
    // recalculó semanas YA PAGADAS. Este helper existe para eso:
    // al 2026-05-15 el Oficial vale 6500, NO 7200 (ni el cache cat.vh=7200).
    expect(getVHGlobalEnFecha(CAT_OFICIAL, '2026-05-15')).toBe(6500)
  })

  it('desde el día del aumento rige el vh nuevo', () => {
    expect(getVHGlobalEnFecha(CAT_OFICIAL, '2026-06-26')).toBe(7200) // día exacto
    expect(getVHGlobalEnFecha(CAT_OFICIAL, '2026-07-17')).toBe(7200) // después
  })

  it('fecha anterior a todo el historial: usa la versión más antigua (retroactivo)', () => {
    expect(getVHGlobalEnFecha(CAT_OFICIAL, '2026-01-09')).toBe(6500)
  })

  it('resuelve bien aunque el historial venga desordenado (ordena por desde)', () => {
    const desordenada: Categoria = {
      ...CAT_OFICIAL,
      categoria_tarifas: [
        { id: 12, vh: 7200, desde: '2026-06-26' }, // la nueva primero
        { id: 11, vh: 6500, desde: '2026-03-06' },
      ],
    }
    expect(getVHGlobalEnFecha(desordenada, '2026-05-15')).toBe(6500)
  })

  it('sin historial cargado cae al cache cat.vh (última versión)', () => {
    expect(getVHGlobalEnFecha(CAT_AYUDANTE, '2026-05-15')).toBe(5500)
    expect(getVHGlobalEnFecha({ ...CAT_AYUDANTE, categoria_tarifas: [] }, '2026-05-15')).toBe(5500)
  })

  it('categoría undefined devuelve 0 (no explota)', () => {
    expect(getVHGlobalEnFecha(undefined, '2026-05-15')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getVHenFecha — prioridad tarifa de obra > vh global', () => {
  it('si la obra tiene tarifa propia para la categoría, gana sobre el vh global', () => {
    // PÉREZ es Oficial al 2026-05-15. Tarifa OB-124 = 7000; global = 6500.
    expect(getVHenFecha(PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', '2026-05-15')).toBe(7000)
  })

  it('sin tarifa de obra para esa categoría cae al vh global', () => {
    // GÓMEZ es Ayudante (cat 3), OB-124 no tiene tarifa para cat 3 → global 5500.
    expect(getVHenFecha(PERSONAL, CATEGORIAS, TARIFAS, OBRA, '2087', '2026-05-15')).toBe(5500)
  })

  it('respeta el historial de categoría del trabajador según la fecha', () => {
    // Al 2025-12-05 PÉREZ todavía era Ayudante (ascendió el 2026-02-06)
    // → cat 3, sin tarifa de obra → global Ayudante 5500.
    expect(getVHenFecha(PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', '2025-12-05')).toBe(5500)
  })

  it('catIdOverride pisa la categoría del trabajador', () => {
    // Forzar cat 2 (Medio oficial): sin tarifa de obra → global mayo = 5800.
    expect(getVHenFecha(PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', '2026-05-15', 2)).toBe(5800)
  })

  it('legajo inexistente (y sin override) devuelve 0', () => {
    expect(getVHenFecha(PERSONAL, CATEGORIAS, TARIFAS, OBRA, '9999', '2026-05-15')).toBe(0)
  })

  it('una tarifa de obra con vh=0 GANA sobre el global (no hay fallback por valor)', () => {
    // OJO: el fallback al global es solo cuando NO HAY filas de tarifa para
    // esa obra+cat. Si alguien carga una tarifa en $0, el vh efectivo es $0
    // y el costo de la semana da $0 — no cae al global. Congelado tal cual.
    const tarifaCero = [mkTarifa('OB-CERO', 3, 0, '2026-04-03')]
    expect(getVHenFecha(PERSONAL, CATEGORIAS, tarifaCero, 'OB-CERO', '2087', '2026-05-15')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('totalHsLeg y getHsExtrasLeg — suma de horas de la semana', () => {
  const FECHAS = SEM_MAYO.map(d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  )

  it('suma las horas normales del legajo en la obra (ignora otras obras y legajos)', () => {
    // PÉREZ: 9+4+9+9+9+9 = 49 (la fila de OB-999 y la del leg 3001 no cuentan)
    expect(totalHsLeg(HORAS, OBRA, '1042', FECHAS)).toBe(49)
    // GÓMEZ: 9+9+9+9+9 = 45
    expect(totalHsLeg(HORAS, OBRA, '2087', FECHAS)).toBe(45)
  })

  it('legajo sin horas cargadas da 0', () => {
    expect(totalHsLeg(HORAS, OBRA, '5555', FECHAS)).toBe(0)
  })

  it('lista de fechas vacía da 0 (aunque haya extras)', () => {
    expect(totalHsLeg(HORAS, OBRA, '1042', [], EXTRAS)).toBe(0)
  })

  it('con hsExtras suma las extras de la semana: 49 normales + 6 extras = 55', () => {
    expect(totalHsLeg(HORAS, OBRA, '1042', FECHAS, EXTRAS)).toBe(55)
  })

  it('las extras se suman ENTERAS aunque se pida un solo día de la semana', () => {
    // OJO: el sem_key de las extras se deriva del PRIMER día pedido
    // (viernes de esa semana). Pedir solo el lunes 18 (9 hs) devuelve
    // 9 + 6 = 15: las 6 extras semanales se cuelan en una consulta de un
    // solo día. Los callers reales siempre pasan la semana completa, pero
    // el comportamiento es este.
    expect(totalHsLeg(HORAS, OBRA, '1042', ['2026-05-18'], EXTRAS)).toBe(15)
  })

  it('getHsExtrasLeg devuelve las hs del registro o 0 si no hay', () => {
    expect(getHsExtrasLeg(EXTRAS, OBRA, '1042', SEM_MAYO_KEY)).toBe(6)
    expect(getHsExtrasLeg(EXTRAS, OBRA, '2087', SEM_MAYO_KEY)).toBe(0) // otro leg
    expect(getHsExtrasLeg(EXTRAS, OBRA, '1042', '2026-05-22')).toBe(0) // otra semana
    expect(getHsExtrasLeg([], OBRA, '1042', SEM_MAYO_KEY)).toBe(0)     // lista vacía
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getCatIdEfectivo — precedencia cat_obra > historial personal', () => {
  it('el override de cat_obra vigente gana sobre la categoría del trabajador', () => {
    // GÓMEZ es Ayudante (cat 3), pero en OB-124 lo pagan como Oficial desde abril.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' }]
    expect(getCatIdEfectivo(catObra, PERSONAL, OBRA, '2087', '2026-05-15')).toBe(1)
  })

  it('sin cat_obra usa el historial personal según fecha', () => {
    // PÉREZ al 2025-12-05 → Ayudante (cat 3); al 2026-05-15 → Oficial (cat 1).
    expect(getCatIdEfectivo([], PERSONAL, OBRA, '1042', '2025-12-05')).toBe(3)
    expect(getCatIdEfectivo([], PERSONAL, OBRA, '1042', '2026-05-15')).toBe(1)
  })

  it('un override con vigencia FUTURA aplica retroactivo a fechas anteriores', () => {
    // OJO: si el trabajador tiene cat_obra en la obra pero todas las entradas
    // son posteriores a la fecha consultada, se usa la MÁS ANTIGUA igual
    // (retroactivo deliberado, ver comentario en el código). Es decir: cargar
    // hoy un override "desde el mes que viene" ya cambia semanas viejas.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-06-26' }]
    expect(getCatIdEfectivo(catObra, PERSONAL, OBRA, '2087', '2026-05-15')).toBe(1)
  })

  it('empate de desde en cat_obra: gana la última fila del array', () => {
    // OJO: con dos overrides al mismo `desde`, el comparador usa >= y se
    // queda con la última entrada recorrida. Congelado tal cual.
    const catObra: CatObraEntry[] = [
      { obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' },
      { obra_cod: OBRA, leg: '2087', cat_id: 2, desde: '2026-04-03' },
    ]
    expect(getCatIdEfectivo(catObra, PERSONAL, OBRA, '2087', '2026-05-15')).toBe(2)
  })

  it('legajo inexistente sin override devuelve null', () => {
    expect(getCatIdEfectivo([], PERSONAL, OBRA, '9999', '2026-05-15')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getVHConCatObra — vh efectivo con overrides', () => {
  it('override a Oficial toma la tarifa de obra de esa categoría', () => {
    // GÓMEZ como Oficial en OB-124 al 2026-05-15 → tarifa de obra 7000.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' }]
    expect(getVHConCatObra(catObra, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '2087', '2026-05-15')).toBe(7000)
  })

  it('doble retroactivo: override futuro + tarifa de obra futura, ambos aplican hacia atrás', () => {
    // Al 2026-01-09 no rige ni el override (desde 04/03) ni la tarifa de obra
    // (desde 04/03): los dos caen a su versión más antigua → cat 1 a $7000.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' }]
    expect(getVHConCatObra(catObra, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '2087', '2026-01-09')).toBe(7000)
  })

  it('cat efectiva sin tarifa de obra ni categoría conocida devuelve 0', () => {
    // Override a una cat que no existe en la lista de categorías → vh 0.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 99, desde: '2026-04-03' }]
    expect(getVHConCatObra(catObra, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '2087', '2026-05-15')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('costoLegConCatObra — la fórmula CANÓNICA del costo semanal', () => {
  it('semana pasada, sin override: horas × tarifa de obra vigente ESA semana', () => {
    // PÉREZ, semana 2026-05-15: 49 hs × $7000 (tarifa vigente en mayo,
    // NO los $7800 del aumento de junio) = $343.000
    expect(
      costoLegConCatObra(HORAS, [], PERSONAL, CATEGORIAS, TARIFAS, [], OBRA, '1042', SEM_MAYO)
    ).toBe(343_000)
  })

  it('las hs extras se pagan al mismo vh: (49 + 6) × 7000 = $385.000', () => {
    expect(
      costoLegConCatObra(HORAS, EXTRAS, PERSONAL, CATEGORIAS, TARIFAS, [], OBRA, '1042', SEM_MAYO)
    ).toBe(385_000)
  })

  it('con override de cat_obra: GÓMEZ (Ayudante) cobra como Oficial en esta obra', () => {
    // 45 hs × $7000 (tarifa de obra del Oficial) = $315.000
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' }]
    expect(
      costoLegConCatObra(HORAS, [], PERSONAL, CATEGORIAS, TARIFAS, catObra, OBRA, '2087', SEM_MAYO)
    ).toBe(315_000)
  })

  it('sin override, GÓMEZ cobra como Ayudante global: 45 × 5500 = $247.500', () => {
    expect(
      costoLegConCatObra(HORAS, [], PERSONAL, CATEGORIAS, TARIFAS, [], OBRA, '2087', SEM_MAYO)
    ).toBe(247_500)
  })

  it('vh efectivo 0 → costo 0 aunque haya horas cargadas', () => {
    // Override a cat inexistente (99): vh = 0 → el costo es $0 pese a las 45 hs.
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 99, desde: '2026-04-03' }]
    expect(
      costoLegConCatObra(HORAS, [], PERSONAL, CATEGORIAS, TARIFAS, catObra, OBRA, '2087', SEM_MAYO)
    ).toBe(0)
  })

  it('SEMANA EN CURSO: un aumento a mitad de semana revaloriza TODA la semana', () => {
    // REGLA DE NEGOCIO CONFIRMADA por Franco (2026-07-21): "si cambiamos
    // precio en la semana en curso se debe actualizar toda esa semana".
    // Si la semana a calcular es la actual, fechaRef = HOY (no el viernes):
    // con "hoy" = martes 2026-07-21 y un aumento que rige desde el lunes
    // 2026-07-20, las 9 hs del VIERNES 17 (anteriores al aumento) también se
    // pagan al vh nuevo. La semana en curso siempre se valoriza al precio
    // vigente hoy; recién al quedar en el pasado se ancla al viernes.
    const tarifasOb200 = [
      mkTarifa('OB-200', 1, 7800, '2026-06-26'),
      mkTarifa('OB-200', 1, 8400, '2026-07-20'), // aumento del lunes
    ]
    const horasSemActual = [
      mkHora('OB-200', '1042', '2026-07-17', 9), // viernes, pre-aumento
      mkHora('OB-200', '1042', '2026-07-20', 9), // lunes, post-aumento
    ]
    const semActual = getSemDays(new Date(2026, 6, 17, 12)) // vie 17/07/2026
    // (9 + 9) × $8400 = $151.200 (y NO 9×7800 + 9×8400 = $145.800)
    expect(
      costoLegConCatObra(horasSemActual, [], PERSONAL, CATEGORIAS, tarifasOb200, [], 'OB-200', '1042', semActual)
    ).toBe(151_200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('costoLeg / calcularTotalesSemana — la fórmula VIEJA (deprecada)', () => {
  it('sin overrides en juego, costoLeg coincide con la canónica: $343.000', () => {
    expect(
      costoLeg(HORAS, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', SEM_MAYO)
    ).toBe(343_000)
  })

  it('DEPRECACIÓN: costoLeg sin catIdOverride IGNORA los overrides de cat_obra', () => {
    // Esta es la razón por la que calcularTotalesSemana ya no se usa para
    // mostrar plata: llama a costoLeg con override undefined, así que GÓMEZ
    // se valoriza como Ayudante ($247.500) aunque cat_obra diga que en esta
    // obra cobra como Oficial ($315.000, ver test de la canónica).
    const viejo = costoLeg(HORAS, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '2087', SEM_MAYO)
    expect(viejo).toBe(247_500) // 45 × 5500 — NO aplica el override
    const catObra: CatObraEntry[] = [{ obra_cod: OBRA, leg: '2087', cat_id: 1, desde: '2026-04-03' }]
    const canonico = costoLegConCatObra(HORAS, [], PERSONAL, CATEGORIAS, TARIFAS, catObra, OBRA, '2087', SEM_MAYO)
    expect(canonico).toBe(315_000) // 45 × 7000 — SÍ lo aplica
    expect(canonico - viejo).toBe(67_500) // la diferencia que motivó deprecarla
  })

  it('costoLeg con catIdOverride explícito sí usa esa categoría', () => {
    // PÉREZ forzado a Medio oficial (cat 2), sin tarifa de obra → global mayo
    // $5800: 49 × 5800 = $284.200
    expect(
      costoLeg(HORAS, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', SEM_MAYO, 2)
    ).toBe(284_200)
  })

  it('costoLeg suma extras al mismo vh: 49×7000 + 6×7000 = $385.000', () => {
    expect(
      costoLeg(HORAS, PERSONAL, CATEGORIAS, TARIFAS, OBRA, '1042', SEM_MAYO, undefined, EXTRAS)
    ).toBe(385_000)
  })

  it('calcularTotalesSemana: totales de la semana (sin cat_obra)', () => {
    // totalHs: PÉREZ 49 + 6 extras = 55; GÓMEZ 45 → 100 hs
    // totalCosto: PÉREZ (49+6)×7000 = 385.000; GÓMEZ 45×5500 = 247.500
    //           → $632.500
    const { totalHs, totalCosto } = calcularTotalesSemana(
      HORAS, PERSONAL, CATEGORIAS, TARIFAS, OBRA, SEM_MAYO, EXTRAS
    )
    expect(totalHs).toBe(100)
    expect(totalCosto).toBe(632_500)
  })

  it('calcularTotalesSemana sin horas ni personal da 0/0', () => {
    const { totalHs, totalCosto } = calcularTotalesSemana([], [], CATEGORIAS, TARIFAS, OBRA, SEM_MAYO)
    expect(totalHs).toBe(0)
    expect(totalCosto).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fmtMonto — redondeo al MILES (es lo que ve el usuario)', () => {
  // El redondeo al miles NO vive en costoLegConCatObra (que devuelve el costo
  // crudo): vive acá, en la presentación. "Redondeo per-leg" = cada legajo se
  // formatea por separado con fmtMonto antes de mostrarse.

  it('montos exactos en miles se muestran tal cual', () => {
    expect(fmtMonto(343_000)).toBe('$343.000')
    expect(fmtMonto(0)).toBe('$0')
  })

  it('redondea al mil más cercano (mitad para arriba)', () => {
    expect(fmtMonto(342_499)).toBe('$342.000') // 342.499 → 342
    expect(fmtMonto(342_500)).toBe('$343.000') // .5 exacto sube (Math.round)
    expect(fmtMonto(342_501)).toBe('$343.000')
    expect(fmtMonto(499)).toBe('$0')           // menos de $500 desaparece
    expect(fmtMonto(500)).toBe('$1.000')
  })

  it('separador de miles es-AR (punto)', () => {
    expect(fmtMonto(1_234_567)).toBe('$1.235.000') // 1234.567 → 1235 miles
  })

  it('redondeo per-leg: la suma de los formateados puede diferir del total formateado', () => {
    // OJO: dos legajos de $342.400 muestran $342.000 cada uno ($684.000 a
    // ojo), pero el total real 684.800 formateado da $685.000. Diferencia de
    // $1.000 entre "sumar lo que se ve" y "ver la suma". Es inherente a
    // redondear per-leg y está asumido en la UI.
    expect(fmtMonto(342_400)).toBe('$342.000')
    expect(fmtMonto(342_400 + 342_400)).toBe('$685.000')
  })

  it('monto negativo chico produce "$-0"', () => {
    // OJO: Math.round(-500/1000) = Math.round(-0.5) = -0 en JS, y
    // (-0).toLocaleString('es-AR') = "-0" → sale "$-0". No hay montos
    // negativos en la tarja hoy, pero si algún día los hay, esto se ve feo.
    expect(fmtMonto(-500)).toBe('$-0')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fmtHs — formato de horas', () => {
  it('redondea a 2 decimales', () => {
    expect(fmtHs(49)).toBe('49hs')
    expect(fmtHs(44 + 1 / 3)).toBe('44.33hs')
  })

  it('cero y negativos se muestran como "0hs"', () => {
    // OJO: cualquier valor <= 0 (incluso -2) se muestra "0hs": el formato
    // esconde horas negativas si alguna corrección las produjera.
    expect(fmtHs(0)).toBe('0hs')
    expect(fmtHs(-2)).toBe('0hs')
  })
})
