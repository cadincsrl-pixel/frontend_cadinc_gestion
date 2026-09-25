// Datos de la empresa (tanda 6, 20260929a): con la semilla de la base, los
// PDF (factura, OP, excel contable) tienen que salir IGUAL que antes. Estos
// son los textos que imprimían con los defaults del env.
import { describe, it, expect } from 'vitest'
import { EMPRESA, hidratarEmpresa, empresaImpresa, derivarDomicilios, fechaDdMmYyyy } from '@/lib/config/empresa'
import type { EmpresaApi } from '@/types/config.types'

// Salida real de `empresa_config_json()` con la semilla (más cuit_sistema del backend).
const SEMILLA: EmpresaApi = {
  cuit: '33717191949', iibb: '33-71719194-9', email: '', cuit_fmt: '33-71719194-9', telefono: '3815 02-5772',
  domicilio: 'Maipú 396, Dpto. 3 — San Miguel de Tucumán, Tucumán', localidad: 'San Miguel de Tucumán',
  provincia: 'Tucumán', updated_at: '2026-09-25T10:11:24.582134+00:00', updated_by: null,
  razon_social: 'CADINC S.R.L.', calle_factura: 'Maipú 396 3', codigo_postal: '4000',
  condicion_iva: 'Responsable Inscripto', domicilio_calle: 'Maipú 396, Dpto. 3', nombre_fantasia: 'CADINC SRL',
  inicio_actividades: '2021-07-01', domicilio_factura_1: 'Maipú 396 3 – San Miguel de Tucumán',
  domicilio_factura_2: '(4000) Tucumán Argentina',
  cuit_sistema: { arca_cuit: '33717191949', coincide: true },
}

const HOY = {
  nombre: 'CADINC SRL',
  razonSocialFactura: 'CADINC S.R.L.',
  cuit: '33-71719194-9',
  domicilio: 'Maipú 396, Dpto. 3 — San Miguel de Tucumán, Tucumán',
  domicilioFactura1: 'Maipú 396 3 – San Miguel de Tucumán',
  domicilioFactura2: '(4000) Tucumán Argentina',
  tel: '3815 02-5772',
  condicionIva: 'Responsable Inscripto',
  iibb: '33-71719194-9',
  inicioActividades: '01/07/2021',
}

describe('Datos de la empresa', () => {
  it('los defaults son los textos de hoy', () => {
    expect(EMPRESA).toMatchObject(HOY)
  })

  it('con la semilla de la base, lo impreso no cambia', () => {
    expect(empresaImpresa(SEMILLA)).toEqual(HOY)
    const logos = { logoUrl: EMPRESA.logoUrl, logoPapelUrl: EMPRESA.logoPapelUrl }
    hidratarEmpresa(SEMILLA)
    expect(EMPRESA).toMatchObject(HOY)
    expect(EMPRESA).toMatchObject(logos)
  })

  it('la derivación del front (vista previa) da lo mismo que la base', () => {
    expect(derivarDomicilios(SEMILLA)).toEqual({
      domicilio: SEMILLA.domicilio,
      domicilioFactura1: SEMILLA.domicilio_factura_1,
      domicilioFactura2: SEMILLA.domicilio_factura_2,
    })
    // Sin «calle en la factura» se usa la calle.
    expect(derivarDomicilios({ ...SEMILLA, calle_factura: '' }).domicilioFactura1)
      .toBe('Maipú 396, Dpto. 3 – San Miguel de Tucumán')
    // Sin código postal no queda «() ».
    expect(derivarDomicilios({ ...SEMILLA, codigo_postal: '' }).domicilioFactura2).toBe('Tucumán Argentina')
  })

  it('hidratar pisa con lo nuevo y deja los logos', () => {
    hidratarEmpresa({ ...SEMILLA, razon_social: 'OTRA S.A.', inicio_actividades: null })
    expect(EMPRESA.razonSocialFactura).toBe('OTRA S.A.')
    expect(EMPRESA.inicioActividades).toBe('')
    hidratarEmpresa(SEMILLA)
    expect(EMPRESA.razonSocialFactura).toBe('CADINC S.R.L.')
  })

  it('fechaDdMmYyyy', () => {
    expect(fechaDdMmYyyy('2021-07-01')).toBe('01/07/2021')
    expect(fechaDdMmYyyy(null)).toBe('')
  })
})
