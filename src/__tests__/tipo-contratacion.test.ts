// El tipo de contratacion de una obra no es un campo: son DOS banderas
// (materiales_a_cargo_de y por_administracion). Estos tests fijan la traduccion
// en los dos sentidos, porque si se desincroniza la pantalla muestra un tipo y
// la cuenta factura otro.
//
// El 14/09 una obra de presupuesto cerrado paso sola a "por administracion"
// porque el tipo se prendia de costado, desde otra pantalla. La ida y vuelta de
// abajo es lo que garantiza que eso no se pueda expresar mal desde el formulario.

import { describe, it, expect } from 'vitest'
import { banderasDelTipo, tipoDeLaObra, TIPOS_CONTRATACION, type TipoContratacion } from '@/modules/tarja/utils/tipoContratacion'

const TIPOS: TipoContratacion[] = ['presupuesto', 'administracion', 'llave_en_mano']

describe('tipo de contratacion de una obra', () => {
  it('los tres tipos van y vuelven sin perderse', () => {
    for (const t of TIPOS) {
      expect(tipoDeLaObra(banderasDelTipo(t))).toBe(t)
    }
  })

  it('presupuesto cerrado: el cliente paga los materiales y no hay %', () => {
    expect(banderasDelTipo('presupuesto')).toEqual({ materiales_a_cargo_de: 'cliente', por_administracion: false })
  })

  it('por administracion: el cliente paga los materiales Y lleva %', () => {
    expect(banderasDelTipo('administracion')).toEqual({ materiales_a_cargo_de: 'cliente', por_administracion: true })
  })

  it('llave en mano: los materiales son de CADINC y no hay %', () => {
    expect(banderasDelTipo('llave_en_mano')).toEqual({ materiales_a_cargo_de: 'cadinc', por_administracion: false })
  })

  it('la marca de administracion gana sobre quien paga los materiales', () => {
    // Combinacion que no se puede elegir desde el formulario pero existe en la
    // base. Se lee como administracion, igual que la cadena de if de la cuenta
    // corriente, para que las dos pantallas no digan cosas distintas.
    expect(tipoDeLaObra({ materiales_a_cargo_de: 'cadinc', por_administracion: true })).toBe('administracion')
  })

  it('una obra vieja sin datos se lee como presupuesto cerrado', () => {
    expect(tipoDeLaObra({})).toBe('presupuesto')
    expect(tipoDeLaObra({ materiales_a_cargo_de: null, por_administracion: null })).toBe('presupuesto')
  })

  it('el selector ofrece exactamente los tres tipos, y el primero es el mas comun', () => {
    expect(TIPOS_CONTRATACION.map(t => t.value)).toEqual(['presupuesto', 'administracion', 'llave_en_mano'])
  })
})
