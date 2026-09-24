import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  codigoFinnegans, convertirFilaFinnegans, esFormatoFinnegans, leerCsvPlan, resumenFinnegans, rubroFinnegans,
} from '@/modules/contabilidad/utils/planImport'

// Importar el plan en el formato de Finnegans (20260928). La conversión que
// vale es la del backend (cadincsrl plan-import.ts); ésta es su espejo para
// el aviso previo. Referencia: supabase/seeds/cont_plan_finnegans_2026.csv,
// la conversión que se hizo a mano el 24/09.

const SEED = readFileSync(join(process.cwd(), 'supabase/seeds/cont_plan_finnegans_2026.csv'), 'utf8')
const seedFilas = SEED.split(/\r?\n/).filter(l => l && !l.startsWith('#')).slice(1).map(l => l.split(';'))

/** De vuelta al formato de Finnegans: 1.1.1.01.01 → 1110101. */
function siete(codigo: string): string {
  const s = codigo.split('.')
  return [1, 1, 1, 2, 2].map((n, i) => (s[i] ?? '0').padStart(n, '0')).join('')
}
const CAP: Record<string, string> = { '1': 'ACTIVO', '2': 'PASIVO', '3': 'PATRIMONIO NETO', '4': 'RESULTADOS' }
const SALDO: Record<string, string> = { ingreso: 'ACREEDOR', egreso: 'DEUDOR', resultado: '', activo: 'DEUDOR', pasivo: 'ACREEDOR', pn: 'ACREEDOR' }

function finnegansDelSeed(): string {
  const lineas = ['codigo;descripcion;nivel;cuenta_madre;imputable;capitulo;saldo_normal;habilitada']
  for (const [cod, nom, rubro, imp] of seedFilas) {
    const segs = cod!.split('.')
    const madre = segs.length > 1 ? siete(segs.slice(0, -1).join('.')) : ''
    lineas.push([siete(cod!), nom, segs.length, madre, imp, CAP[cod![0]!], SALDO[rubro!], 'SI'].join(';'))
  }
  return lineas.join('\n')
}

describe('formato Finnegans', () => {
  it('detecta por los encabezados', () => {
    expect(esFormatoFinnegans(['codigo', 'descripcion', 'nivel', 'cuenta_madre', 'imputable', 'capitulo', 'saldo_normal', 'habilitada'])).toBe(true)
    expect(esFormatoFinnegans(['Código', 'Cuenta Madre', 'Capítulo'])).toBe(true)
    expect(esFormatoFinnegans(['codigo', 'nombre', 'rubro'])).toBe(false)
    expect(leerCsvPlan(finnegansDelSeed()).formato).toBe('finnegans')
    expect(leerCsvPlan('codigo;nombre\n1;ACTIVO').formato).toBe('estandar')
  })

  it.each([
    ['1110101', 5, '1.1.1.01.01'], ['1110100', 4, '1.1.1.01'], ['2130310', 5, '2.1.3.03.10'], ['4000000', 1, '4'], ['1100000', null, '1.1'],
  ])('codigoFinnegans(%s, %s) → %s', (v, nivel, esperado) => {
    expect(codigoFinnegans(v, nivel)).toBe(esperado)
  })

  it.each([['111010', null], ['1110100', 5], ['1010000', 3], ['x', null]])('codigoFinnegans(%s, %s) → inválido', (v, nivel) => {
    expect(codigoFinnegans(v, nivel)).toBeNull()
  })

  it('rubro por capítulo y saldo normal', () => {
    expect(rubroFinnegans('PATRIMONIO NETO', 'ACREEDOR')).toBe('pn')
    expect(rubroFinnegans('RESULTADOS', 'ACREEDOR')).toBe('ingreso')
    expect(rubroFinnegans('RESULTADOS', 'DEUDOR')).toBe('egreso')
    expect(rubroFinnegans('RESULTADOS', '')).toBe('resultado')
  })

  it('el plan entero (335 cuentas) da el mismo código y rubro que la conversión a mano', () => {
    const r = leerCsvPlan(finnegansDelSeed())
    expect(r.error).toBeNull()
    expect(r.filas).toHaveLength(seedFilas.length)
    expect(seedFilas.length).toBe(335)
    const conv = r.filas.map(convertirFilaFinnegans)
    expect(conv.filter(c => c.error)).toEqual([])
    expect(conv.map(c => [c.codigo, c.rubro])).toEqual(seedFilas.map(([cod, , rubro]) => [cod, rubro]))
    expect(resumenFinnegans(r.filas)).toEqual({ total: 335, deshabilitadas: 0, conError: 0, ejemplo: { original: '1110101', convertido: '1.1.1.01.01' } })
  })

  it('madre que no coincide y deshabilitadas', () => {
    expect(convertirFilaFinnegans({ codigo: '1110101', nivel: '5', cuenta_madre: '1110200', capitulo: 'ACTIVO', habilitada: 'SI' }).error).toBe('MADRE_NO_COINCIDE')
    expect(convertirFilaFinnegans({ codigo: '1100000', nivel: '2', cuenta_madre: '', capitulo: 'ACTIVO', habilitada: 'SI' }).error).toBe('MADRE_NO_COINCIDE')
    expect(convertirFilaFinnegans({ codigo: '1110102', nivel: '5', cuenta_madre: '1110100', capitulo: 'ACTIVO', habilitada: 'NO' }))
      .toMatchObject({ codigo: '1.1.1.01.02', habilitada: false, error: null })
  })
})
