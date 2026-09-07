// Criterio único de "activo" y validaciones del legajo (lib/utils/personal.ts).
// Antes había tres criterios distintos (Personal, Ropa, alerta de DNI) y los
// mensualizados figuraban inactivos en dos de ellos.
import { describe, it, expect } from 'vitest'
import {
  esActivo, legsConHorasDesde, semCorteActivos,
  normalizarDni, dniValido, fechaNacimientoValida, errorDeCampo,
  LEGAJO_RE, normalizarTelefono, telefonoValido, normalizarNombre, nombreValido, normalizarTalle, talleValido,
} from '../lib/utils/personal'

const conHoras = new Set(['001'])

describe('esActivo', () => {
  it('el override manual manda, sea cual sea la modalidad', () => {
    expect(esActivo({ leg: '009', modalidad: 'hora', activo_override: true },  conHoras)).toBe(true)
    expect(esActivo({ leg: '001', modalidad: 'hora', activo_override: false }, conHoras)).toBe(false)
    expect(esActivo({ leg: '085', modalidad: 'mes',  activo_override: false }, conHoras)).toBe(false)
  })
  it('un mensualizado sin override está activo aunque no cargue horas', () => {
    expect(esActivo({ leg: '085', modalidad: 'mes', activo_override: null }, conHoras)).toBe(true)
  })
  it('un jornalizado sin override depende de las horas recientes', () => {
    expect(esActivo({ leg: '001', modalidad: 'hora', activo_override: null }, conHoras)).toBe(true)
    expect(esActivo({ leg: '002', modalidad: 'hora', activo_override: null }, conHoras)).toBe(false)
  })
})

describe('semCorteActivos / legsConHorasDesde', () => {
  it('el corte es el viernes de hace 3 semanas', () => {
    // domingo 6/9/2026 → hace 21 días es domingo 16/8 → su viernes es 14/8
    expect(semCorteActivos(new Date(2026, 8, 6))).toBe('2026-08-14')
    expect(semCorteActivos(new Date(2026, 8, 6), 1)).toBe('2026-08-28')
  })
  it('cuenta la semana (viernes→jueves) de cada fila, no la fecha suelta', () => {
    const legs = legsConHorasDesde([
      { leg: '001', fecha: '2026-08-13' }, // jueves → semana del 7/8, anterior al corte
      { leg: '002', fecha: '2026-08-14' }, // viernes del corte
      { leg: '003', fecha: '2026-09-02' },
    ], '2026-08-14')
    expect([...legs].sort()).toEqual(['002', '003'])
  })
})

describe('DNI y nacimiento', () => {
  it('normalizarDni deja solo dígitos', () => {
    expect(normalizarDni('36.890.735')).toBe('36890735')
    expect(normalizarDni(' 12 345 678 ')).toBe('12345678')
    expect(normalizarDni(null)).toBe('')
  })
  it('dniValido: vacío o 7-8 dígitos, con o sin puntos; letras no', () => {
    expect(dniValido('')).toBe(true)
    expect(dniValido('1234567')).toBe(true)
    expect(dniValido('12.345.678')).toBe(true)
    expect(dniValido('123456789')).toBe(false)
    expect(dniValido('abc')).toBe(false)
  })
  it('fechaNacimientoValida corta los typos de año', () => {
    expect(fechaNacimientoValida('2022-02-07', '2026-09-06')).toBe(false)
    expect(fechaNacimientoValida('1193-08-03', '2026-09-06')).toBe(false)
    expect(fechaNacimientoValida('1993-08-03', '2026-09-06')).toBe(true)
  })
})

describe('reglas de campos (espejo del backend)', () => {
  it('legajo: 3 o 4 dígitos', () => {
    expect(LEGAJO_RE.test('112')).toBe(true)
    expect(LEGAJO_RE.test('1000')).toBe(true)
    expect(LEGAJO_RE.test('12')).toBe(false)
    expect(LEGAJO_RE.test('A12')).toBe(false)
  })
  it('teléfono: solo dígitos, 8 a 13; "381" solo no vale', () => {
    expect(normalizarTelefono('(381) 555-1234')).toBe('3815551234')
    expect(telefonoValido('')).toBe(true)
    expect(telefonoValido('3815551234')).toBe(true)
    expect(telefonoValido('381')).toBe(false)
    expect(telefonoValido('sin teléfono')).toBe(false)
  })
  it('nombre: dos palabras, solo letras', () => {
    expect(normalizarNombre('  PEREZ   JUAN ')).toBe('PEREZ JUAN')
    expect(nombreValido('PEREZ JUAN')).toBe(true)
    expect(nombreValido('MOLINA, ESTEBAN GABRIEL')).toBe(true)
    expect(nombreValido("D'Angelo Ñandú-Pérez")).toBe(true)
    expect(nombreValido('PEREZ')).toBe(false)
    expect(nombreValido('PEREZ 2')).toBe(false)
  })
  it('talle: 30–60 o letra, en mayúsculas', () => {
    expect(normalizarTalle(' xl ')).toBe('XL')
    expect(talleValido('44')).toBe(true)
    expect(talleValido('XL')).toBe(true)
    expect(talleValido('')).toBe(true)
    expect(talleValido('4')).toBe(false)
    expect(talleValido('grande')).toBe(false)
  })
})

describe('errorDeCampo', () => {
  it('mapea los 409 de duplicado y los 400 con campo al input', () => {
    expect(errorDeCampo({ status: 409, body: { error: 'DNI_DUPLICADO: el DNI 1 ya está en el legajo 009 (X)' } }))
      .toEqual({ campo: 'dni', mensaje: 'el DNI 1 ya está en el legajo 009 (X)' })
    expect(errorDeCampo({ status: 409, body: { error: 'LEGAJO_DUPLICADO: el legajo 001 ya es de X' } }))
      .toEqual({ campo: 'leg', mensaje: 'el legajo 001 ya es de X' })
    expect(errorDeCampo({ status: 400, body: { error: 'DNI inválido', campo: 'dni' } }))
      .toEqual({ campo: 'dni', mensaje: 'DNI inválido' })
    expect(errorDeCampo({ status: 400, body: { error: 'DNI_OBLIGATORIO: no se puede borrar' } }))
      .toEqual({ campo: 'dni', mensaje: 'no se puede borrar' })
  })
  it('cualquier otro error va al toast', () => {
    expect(errorDeCampo({ status: 409, body: { error: 'AFECTA_SEMANAS_CERRADAS: ...' } })).toBeNull()
    expect(errorDeCampo({ status: 500, body: { error: 'x' } })).toBeNull()
    expect(errorDeCampo(new Error('red'))).toBeNull()
  })
})
