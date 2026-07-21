// Golden tests de la semana CADINC (viernes → jueves).
//
// REGLA DE NEGOCIO: la semana CADINC arranca el VIERNES y termina el JUEVES.
// sem_key = ISO del viernes. NUNCA lunes-domingo. Si un test de acá falla,
// alguien tocó la matemática de semanas y eso rompe tarja, cierres, recibos
// y liquidaciones a la vez. Mirar el comentario al lado del valor esperado:
// cada esperado está calculado A MANO contra el calendario real.
//
// Calendario real usado (verificado a mano):
//   - 2026-01-01 fue JUEVES (2024-01-01 lunes; 2024 bisiesto → 2025-01-01 miércoles;
//     2025 común → 2026-01-01 jueves).
//   - Enero+Feb+Mar+Abr+May+Jun 2026 = 31+28+31+30+31+30 = 181 días;
//     181 mod 7 = 6 → 2026-07-01 fue MIÉRCOLES (jueves + 6).
//   - Por lo tanto los VIERNES de julio 2026 fueron: 3, 10, 17, 24 y 31.
//     (Cross-check: el 4 de julio 2026 —250 años de EEUU— cayó sábado. ✓)
//   - Navidad 2025 (2025-12-25) cayó JUEVES → 2025-12-26 fue VIERNES.
//
// Todos los Date se construyen con new Date(año, mes-1, día) (componentes
// LOCALES) para no comerse el shift UTC. toISO también lee componentes
// locales, así que estos tests son independientes del timezone de la máquina.

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  DIAS,
  MESES,
  toISO,
  getViernes,
  getSemDays,
  getSemLabel,
  getViernesCobro,
  esFinde,
  esJueves,
  esHoy,
  getSemKey,
} from '@/lib/utils/dates'

afterEach(() => {
  vi.useRealTimers()
})

describe('constantes de la semana CADINC', () => {
  it('DIAS arranca en Vie y termina en Jue (el orden ES la regla de negocio)', () => {
    // Si alguien "corrige" esto a Lun-Dom, toda la UI de tarja se desalinea
    // con getSemDays. Congelado adrede.
    expect(DIAS).toEqual(['Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue'])
  })

  it('MESES tiene los 12 meses en español (los labels salen de acá)', () => {
    expect(MESES).toHaveLength(12)
    expect(MESES[0]).toBe('Enero')
    expect(MESES[6]).toBe('Julio')
    expect(MESES[11]).toBe('Diciembre')
  })
})

describe('toISO — formato YYYY-MM-DD con componentes locales', () => {
  it('formatea con padding de ceros en mes y día', () => {
    // 5 de enero de 2026 → "2026-01-05" (mes 01, día 05: dos dígitos siempre)
    expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('un date de las 23:59 local sigue siendo el mismo día (no usa UTC)', () => {
    // Este es EL bug histórico: .toISOString() en Argentina (UTC-3) después de
    // las 21:00 devolvía el día siguiente. La implementación actual lee
    // getFullYear/getMonth/getDate locales → 21 de julio 23:59 = "2026-07-21".
    expect(toISO(new Date(2026, 6, 21, 23, 59))).toBe('2026-07-21')
  })

  it('un date de las 00:00 local también es el mismo día', () => {
    expect(toISO(new Date(2026, 6, 21, 0, 0))).toBe('2026-07-21')
  })
})

describe('getViernes — cada día de la semana cae al viernes correcto', () => {
  // Semana CADINC bajo test: viernes 2026-07-17 → jueves 2026-07-23.
  // Fórmula del código: dw=getDay(); diff = dw>=5 ? dw-5 : dw+2; resta diff días.

  it('un VIERNES devuelve ese mismo día (2026-07-17 → 2026-07-17)', () => {
    // dw=5 → diff = 5-5 = 0 → mismo día
    expect(toISO(getViernes(new Date(2026, 6, 17)))).toBe('2026-07-17')
  })

  it('un SÁBADO devuelve el viernes anterior (2026-07-18 → 2026-07-17)', () => {
    // dw=6 → diff = 6-5 = 1 → 18 - 1 = 17
    expect(toISO(getViernes(new Date(2026, 6, 18)))).toBe('2026-07-17')
  })

  it('un DOMINGO devuelve el viernes de 2 días atrás (2026-07-19 → 2026-07-17)', () => {
    // dw=0 → diff = 0+2 = 2 → 19 - 2 = 17
    expect(toISO(getViernes(new Date(2026, 6, 19)))).toBe('2026-07-17')
  })

  it('un LUNES devuelve el viernes de 3 días atrás (2026-07-20 → 2026-07-17)', () => {
    // dw=1 → diff = 1+2 = 3 → 20 - 3 = 17
    expect(toISO(getViernes(new Date(2026, 6, 20)))).toBe('2026-07-17')
  })

  it('un MARTES devuelve el viernes de 4 días atrás (2026-07-21 → 2026-07-17)', () => {
    // dw=2 → diff = 2+2 = 4 → 21 - 4 = 17
    expect(toISO(getViernes(new Date(2026, 6, 21)))).toBe('2026-07-17')
  })

  it('un MIÉRCOLES devuelve el viernes de 5 días atrás (2026-07-22 → 2026-07-17)', () => {
    // dw=3 → diff = 3+2 = 5 → 22 - 5 = 17
    expect(toISO(getViernes(new Date(2026, 6, 22)))).toBe('2026-07-17')
  })

  it('un JUEVES devuelve el viernes de 6 días atrás (2026-07-16 → 2026-07-10)', () => {
    // dw=4 → diff = 4+2 = 6 → 16 - 6 = 10. El jueves es el ÚLTIMO día de la
    // semana CADINC: pertenece a la semana que arrancó 6 días antes.
    expect(toISO(getViernes(new Date(2026, 6, 16)))).toBe('2026-07-10')
  })

  it('el viernes siguiente ya es OTRA semana (2026-07-24 → 2026-07-24)', () => {
    expect(toISO(getViernes(new Date(2026, 6, 24)))).toBe('2026-07-24')
  })

  it('cruza el mes hacia atrás: sábado 2026-08-01 → viernes 2026-07-31', () => {
    // 2026-08-01 fue sábado (jul 31 viernes). dw=6 → diff=1 → 31 de julio.
    expect(toISO(getViernes(new Date(2026, 7, 1)))).toBe('2026-07-31')
  })

  it('cruza el mes desde un lunes: 2026-08-03 → viernes 2026-07-31', () => {
    // 2026-08-03 fue lunes. dw=1 → diff=3 → ago 3 - 3 días = jul 31.
    expect(toISO(getViernes(new Date(2026, 7, 3)))).toBe('2026-07-31')
  })

  it('cruza el AÑO hacia atrás: jueves 2026-01-01 → viernes 2025-12-26', () => {
    // 2026-01-01 fue jueves. dw=4 → diff=6 → ene 1 - 6 días = dic 26 de 2025.
    // La sem_key de la primera semana laboral de 2026 es "2025-12-26".
    expect(toISO(getViernes(new Date(2026, 0, 1)))).toBe('2025-12-26')
  })

  it('ancla el resultado a las 12:00:00.000 (mediodía local, TZ-safe)', () => {
    const v = getViernes(new Date(2026, 6, 21, 23, 59, 58, 999))
    expect(v.getHours()).toBe(12)
    expect(v.getMinutes()).toBe(0)
    expect(v.getSeconds()).toBe(0)
    expect(v.getMilliseconds()).toBe(0)
  })

  it('a las 23:59 de un sábado sigue cayendo al viernes correcto', () => {
    // setHours(12) corre ANTES de calcular el día de semana → la hora del
    // input no puede empujar el resultado a otro día.
    expect(toISO(getViernes(new Date(2026, 6, 18, 23, 59)))).toBe('2026-07-17')
  })

  it('NO muta el Date de entrada', () => {
    const input = new Date(2026, 6, 22, 9, 15) // miércoles 9:15
    const antes = input.getTime()
    getViernes(input)
    expect(input.getTime()).toBe(antes)
  })
})

describe('getSemDays — los 7 días de la semana CADINC', () => {
  it('devuelve exactamente 7 días consecutivos arrancando en el viernes', () => {
    const days = getSemDays(new Date(2026, 6, 17)) // viernes 17-jul-2026
    // Vie 17, Sáb 18, Dom 19, Lun 20, Mar 21, Mié 22, Jue 23 — a mano.
    expect(days.map(toISO)).toEqual([
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
    ])
  })

  it('el último día es JUEVES y el primero VIERNES (getDay 4 y 5)', () => {
    const days = getSemDays(new Date(2026, 6, 17))
    expect(days[0]!.getDay()).toBe(5) // viernes
    expect(days[6]!.getDay()).toBe(4) // jueves
  })

  it('cruza el mes: viernes 2026-07-31 → semana 31-jul a 6-ago', () => {
    const days = getSemDays(new Date(2026, 6, 31))
    // 31 jul + 1..6 días = 1,2,3,4,5,6 de agosto — a mano.
    expect(days.map(toISO)).toEqual([
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
    ])
  })

  it('cruza el año: viernes 2025-12-26 → semana 26-dic a 1-ene', () => {
    const days = getSemDays(new Date(2025, 11, 26))
    expect(days.map(toISO)).toEqual([
      '2025-12-26',
      '2025-12-27',
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ])
  })

  it('NO muta el viernes de entrada', () => {
    const vie = new Date(2026, 6, 17)
    const antes = vie.getTime()
    getSemDays(vie)
    expect(vie.getTime()).toBe(antes)
  })

  // OJO: getSemDays NO valida que el input sea viernes. Si le pasás un lunes,
  // devuelve 7 días arrancando el lunes (una "semana" que no existe en CADINC).
  // Los callers son responsables de pasar siempre un viernes (getViernes antes).
  // Congelamos el comportamiento actual para que un cambio sea visible.
  it('OJO: con un lunes de input devuelve 7 días desde el lunes (no normaliza)', () => {
    const days = getSemDays(new Date(2026, 6, 20)) // lunes 20-jul-2026
    expect(toISO(days[0]!)).toBe('2026-07-20')
    expect(toISO(days[6]!)).toBe('2026-07-26')
    expect(days).toHaveLength(7)
  })
})

describe('getSemLabel — etiqueta humana de la semana', () => {
  it('semana dentro del mismo mes: "17 Jul → 23 Jul 2026"', () => {
    // inicio = vie 17-jul, fin = jue 23-jul. MESES[6]="Julio".slice(0,3)="Jul".
    expect(getSemLabel(new Date(2026, 6, 17))).toBe('17 Jul → 23 Jul 2026')
  })

  it('semana que cruza mes: "31 Jul → 6 Ago 2026"', () => {
    // fin = 31-jul + 6 días = 6-ago. "Agosto".slice(0,3)="Ago". Sin padding de día.
    expect(getSemLabel(new Date(2026, 6, 31))).toBe('31 Jul → 6 Ago 2026')
  })

  // OJO: en semanas que cruzan año, el label solo muestra el año del JUEVES
  // final — el año del viernes inicial (2025) no aparece en ningún lado.
  // "26 Dic → 1 Ene 2026" es ambiguo leído en frío, pero es lo que ve el user
  // hoy. Congelado tal cual.
  it('OJO: semana que cruza año solo muestra el año final: "26 Dic → 1 Ene 2026"', () => {
    expect(getSemLabel(new Date(2025, 11, 26))).toBe('26 Dic → 1 Ene 2026')
  })
})

describe('getViernesCobro — la semana se cobra el viernes siguiente', () => {
  it('viernes 2026-07-17 se cobra el 2026-07-24', () => {
    // +7 días exactos: 17 + 7 = 24, mismo mes.
    expect(toISO(getViernesCobro(new Date(2026, 6, 17)))).toBe('2026-07-24')
  })

  it('cruza el mes: viernes 2026-07-31 se cobra el 2026-08-07', () => {
    // 31-jul + 7 = 7-ago (julio tiene 31 días).
    expect(toISO(getViernesCobro(new Date(2026, 6, 31)))).toBe('2026-08-07')
  })

  it('cruza el año: viernes 2025-12-26 se cobra el 2026-01-02', () => {
    // 26-dic + 7 = 2-ene (diciembre tiene 31 días → 26+7=33 → 33-31=2).
    expect(toISO(getViernesCobro(new Date(2025, 11, 26)))).toBe('2026-01-02')
  })

  it('NO muta el viernes de entrada', () => {
    const vie = new Date(2026, 6, 17)
    const antes = vie.getTime()
    getViernesCobro(vie)
    expect(vie.getTime()).toBe(antes)
  })
})

describe('esFinde / esJueves — clasificación de días', () => {
  it('sábado y domingo son finde; viernes, lunes y jueves NO', () => {
    expect(esFinde(new Date(2026, 6, 18))).toBe(true) // sábado 18-jul
    expect(esFinde(new Date(2026, 6, 19))).toBe(true) // domingo 19-jul
    expect(esFinde(new Date(2026, 6, 17))).toBe(false) // viernes 17-jul
    expect(esFinde(new Date(2026, 6, 20))).toBe(false) // lunes 20-jul
    expect(esFinde(new Date(2026, 6, 23))).toBe(false) // jueves 23-jul
  })

  it('esJueves detecta el jueves (día de cierre) y solo el jueves', () => {
    expect(esJueves(new Date(2026, 6, 23))).toBe(true) // jueves 23-jul
    expect(esJueves(new Date(2026, 6, 17))).toBe(false) // viernes
    expect(esJueves(new Date(2026, 6, 22))).toBe(false) // miércoles
  })
})

describe('esHoy — con reloj congelado (fake timers)', () => {
  it('el mismo día local es hoy, aunque cambie la hora', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 21, 15, 30)) // martes 21-jul 15:30
    expect(esHoy(new Date(2026, 6, 21, 8, 0))).toBe(true)
    expect(esHoy(new Date(2026, 6, 20))).toBe(false) // ayer
    expect(esHoy(new Date(2026, 6, 22))).toBe(false) // mañana
  })

  it('a las 22:30 local "hoy" sigue siendo hoy (regresión del bug UTC)', () => {
    // Con la implementación vieja (toISOString) en Argentina UTC-3, a las
    // 22:30 new Date() ya era "mañana". La actual usa componentes locales.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 21, 22, 30))
    expect(esHoy(new Date())).toBe(true)
    expect(toISO(new Date())).toBe('2026-07-21')
  })
})

describe('getSemKey — la clave canónica de la semana', () => {
  it('sem_key del viernes 17-jul-2026 es "2026-07-17"', () => {
    expect(getSemKey(new Date(2026, 6, 17))).toBe('2026-07-17')
  })

  it('composición canónica: getSemKey(getViernes(cualquier día)) da la key de la semana', () => {
    // Miércoles 22-jul → viernes 17-jul → "2026-07-17". Este es el camino
    // que usa toda la app para derivar sem_key desde una fecha suelta.
    expect(getSemKey(getViernes(new Date(2026, 6, 22)))).toBe('2026-07-17')
  })

  it('la primera semana de 2026 tiene sem_key de 2025: "2025-12-26"', () => {
    expect(getSemKey(getViernes(new Date(2026, 0, 1)))).toBe('2025-12-26')
  })

  // OJO: getSemKey es un alias de toISO — NO valida que el input sea viernes.
  // getSemKey(lunes) devuelve el ISO del lunes, que NO es una sem_key válida
  // en la DB. La garantía de "sem_key = viernes" vive en los callers, que
  // siempre deben pasar por getViernes primero. Congelado tal cual.
  it('OJO: con un lunes devuelve el ISO del lunes (no normaliza a viernes)', () => {
    expect(getSemKey(new Date(2026, 6, 20))).toBe('2026-07-20')
  })
})
