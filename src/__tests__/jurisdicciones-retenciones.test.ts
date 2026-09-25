/**
 * Tanda 6, ítems 5 y 6 (20260929f/g): jurisdicciones compartidas y tipos de
 * retención desde el catálogo. Helpers puros del selector, del desglose de la
 * factura de compra y del cobro.
 */
import { describe, it, expect } from 'vitest'
import { HttpError } from '@/lib/api/client'
import {
  mensajeErrorJurisdiccion, nombreJurisdiccion, opcionesJurisdiccion, parsearAlias,
} from '@/lib/utils/jurisdicciones'
import { filaDeTributo, tributoDeFila } from '@/modules/pagos/utils/desglose'
import { cortoRetencion, retencionTiposRespaldo, RETENCION_TIPOS } from '@/modules/facturacion/utils/cobranzas.utils'
import { mensajeErrorFacturacion } from '@/modules/facturacion/utils/facturacion.errores'
import type { Jurisdiccion } from '@/types/config.types'

const j = (id: number, nombre: string, extra: Partial<Jurisdiccion> = {}): Jurisdiccion => ({
  id, nombre, tipo: 'provincial', provincia_id: null, provincia_nombre: null, codigo_comarb: null, codigo_arca: null,
  alias: [], activo: true, usos: { tributos: 0, retenciones: 0 }, ...extra,
})
const LISTA: Jurisdiccion[] = [
  j(25, 'San Miguel de Tucumán', { tipo: 'municipal', provincia_id: 24, provincia_nombre: 'Tucumán', alias: ['smt'] }),
  j(24, 'Tucumán', { alias: ['tucuman'] }),
  j(1, 'Ciudad Autónoma de Buenos Aires', { alias: ['caba', 'capital federal'] }),
  j(9, 'Vieja', { activo: false }),
]
const err = (body: unknown, status = 409) => new HttpError(String((body as { error?: string }).error), status, body)

describe('opcionesJurisdiccion', () => {
  it('provincias primero, municipios agrupados por provincia; alias en search, nunca la provincia en sub', () => {
    const o = opcionesJurisdiccion(LISTA)
    expect(o.map(x => x.label)).toEqual(['Ciudad Autónoma de Buenos Aires', 'Tucumán', 'San Miguel de Tucumán'])
    expect(o[2]).toMatchObject({ value: '25', group: 'Municipios · Tucumán', search: ['smt'] })
    expect(o.every(x => x.sub === undefined)).toBe(true)
  })
  it('las dadas de baja no se ofrecen, salvo la ya elegida', () => {
    expect(opcionesJurisdiccion(LISTA).some(x => x.value === '9')).toBe(false)
    expect(opcionesJurisdiccion(LISTA, 9).find(x => x.value === '9')?.label).toBe('Vieja (dada de baja)')
  })
  it('nombreJurisdiccion: el del catálogo o el texto viejo', () => {
    expect(nombreJurisdiccion(LISTA, 24)).toBe('Tucumán')
    expect(nombreJurisdiccion(LISTA, null, ' Pcia rara ')).toBe('Pcia rara')
    expect(nombreJurisdiccion(LISTA, 999, 'x')).toBe('x')
  })
  it('parsearAlias: separa por coma, limpia y saca repetidos', () => {
    expect(parsearAlias(' smt,  San  Miguel , SMT,, ')).toEqual(['smt', 'San Miguel'])
  })
})

describe('desglose: el tributo lleva jurisdiccion_id', () => {
  it('ida y vuelta: manda el id y el nombre (un backend viejo usa el texto)', () => {
    const f = filaDeTributo({ tipo: 'percepcion_iibb', jurisdiccion: 'Tucumán', jurisdiccion_id: 24, descripcion: null, importe: 452.74 })
    expect(f).toEqual({ tipo: 'percepcion_iibb', jurisdiccion: 'Tucumán', jurisdiccion_id: 24, descripcion: '', importe: '452.74' })
    expect(tributoDeFila(f, 452.74)).toEqual({
      tipo: 'percepcion_iibb', jurisdiccion: 'Tucumán', jurisdiccion_id: 24, descripcion: '', alicuota: null, base_imp: null, importe: 452.74,
    })
  })
  it('texto viejo sin id y sin jurisdicción', () => {
    expect(filaDeTributo({ tipo: 'otro', importe: 1 }).jurisdiccion_id).toBeNull()
    expect(tributoDeFila({ ...filaDeTributo({ tipo: 'otro', importe: 1 }), jurisdiccion: '  ' }, 1).jurisdiccion).toBeNull()
  })
})

describe('retenciones desde el catálogo', () => {
  it('cortoRetencion: catálogo › respaldo › clave', () => {
    expect(cortoRetencion('sellos', { sellos: 'Sellos' })).toBe('Sellos')
    expect(cortoRetencion('iibb')).toBe('IIBB')
    expect(cortoRetencion('nueva')).toBe('nueva')
  })
  it('el respaldo tiene los 6 de siempre con la forma de la API', () => {
    const r = retencionTiposRespaldo()
    expect(r.map(t => t.clave)).toEqual(RETENCION_TIPOS.map(t => t.key))
    expect(r.find(t => t.clave === 'iva')?.impuesto).toBe('iva')
    expect(r.find(t => t.clave === 'tem')).toMatchObject({ impuesto: 'municipal', pide_jurisdiccion: true, jurisdiccion_default_nombre: 'San Miguel de Tucumán' })
    expect(r.find(t => t.clave === 'suss')?.pide_jurisdiccion).toBe(false)
  })
})

describe('errores', () => {
  it('jurisdicciones', () => {
    expect(mensajeErrorJurisdiccion(err({ error: 'JURISDICCION_DUPLICADA', detail: { campo: 'alias', existente_id: 25 } })))
      .toContain('un alias')
    expect(mensajeErrorJurisdiccion(err({ error: 'JURISDICCION_POR_DEFECTO', detail: { donde: 'ventas_retencion_tipos' } })))
      .toContain('tipo de retención')
    expect(mensajeErrorJurisdiccion(err({ error: 'SIN_PERMISO' }, 403))).toContain('Configurar')
  })
  it('tipos de retención', () => {
    expect(mensajeErrorFacturacion(err({ error: 'IMPUESTO_IVA_RESERVADO' }))).toContain('IVA es una sola')
    expect(mensajeErrorFacturacion(err({ error: 'RETENCION_TIPO_SISTEMA' }))).toContain('de siempre')
    expect(mensajeErrorFacturacion(err({ error: 'RETENCION_TIPO_DUPLICADO', detail: { campo: 'corto' } }))).toContain('nombre corto')
  })
})
