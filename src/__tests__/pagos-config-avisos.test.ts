import { describe, it, expect } from 'vitest'
import { PLAZOS_CHEQUE, esEmailValido, pieConCbu } from '@/modules/pagos/utils/pagos.utils'
import { plazosDeConfig } from '@/modules/pagos/hooks/useConfigPagos'
import { mensajeErrorPagos } from '@/modules/pagos/utils/pagos.errores'
import { HttpError } from '@/lib/api/client'

// Compras › Configuración (20260929i): el pie del aviso nunca lleva la cuenta,
// y los plazos de cheque caen a los de siempre contra un backend viejo.

describe('pieConCbu (espejo de _pagos_pie_con_cbu)', () => {
  it('CBU/CVU de 22 dígitos, seguidos o separados', () => {
    expect(pieConCbu('Transferir a 0070399520000003055000')).toBe(true)
    expect(pieConCbu('CBU 0070 3995 2000 0003 0550 00')).toBe(true)
  })
  it('palabra con forma de alias', () => {
    expect(pieConCbu('Alias: Norte.Distrib.')).toBe(true)
  })
  it('mails, dominios, teléfonos y texto común pasan', () => {
    expect(pieConCbu('Consultas: pagos@cadinc.com.ar · www.cadinc.com.ar')).toBe(false)
    expect(pieConCbu('Tel 381-4123456 de lunes-viernes. Gracias por su atención')).toBe(false)
    expect(pieConCbu('')).toBe(false)
  })
})

describe('esEmailValido', () => {
  it('forma de dirección', () => {
    expect(esEmailValido('estudio@contable.com.ar')).toBe(true)
    expect(esEmailValido('contador@')).toBe(false)
    expect(esEmailValido('a b@x.com')).toBe(false)
  })
})

describe('plazosDeConfig', () => {
  it('backend viejo (sin cheques) o lista vacía → PLAZOS_CHEQUE', () => {
    expect(plazosDeConfig({ tributos: { jurisdiccion_default_id: null } })).toEqual([...PLAZOS_CHEQUE])
    expect(plazosDeConfig({ tributos: { jurisdiccion_default_id: null }, cheques: { plazos: [] } })).toEqual([...PLAZOS_CHEQUE])
    expect(plazosDeConfig(undefined)).toEqual([...PLAZOS_CHEQUE])
  })
  it('configurados → esos', () => {
    expect(plazosDeConfig({ tributos: { jurisdiccion_default_id: null }, cheques: { plazos: [0, 30, 60] } })).toEqual([0, 30, 60])
  })
})

describe('errores de configuración', () => {
  it('traduce PIE_CON_CBU, EMAIL_INVALIDO y los motivos de CONFIG_INVALIDA', () => {
    const err = (error: string, detail?: unknown) => new HttpError(error, 400, { error, detail })
    expect(mensajeErrorPagos(err('PIE_CON_CBU'))).toMatch(/CBU/)
    expect(mensajeErrorPagos(err('EMAIL_INVALIDO'))).toMatch(/dirección/)
    expect(mensajeErrorPagos(err('CONFIG_INVALIDA', { clave: 'plazos_cheque', motivo: 'plazos_invalidos' }))).toMatch(/plazos/)
  })
})
