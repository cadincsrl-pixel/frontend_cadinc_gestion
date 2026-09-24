import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'
import {
  agruparPorProveedor, chequesDelPlan, descripcionTransferencia, destinoTransferencia,
  filasEcheq, filasTransferencias, planPorDefecto, GALICIA, type FacturaAPagar,
} from '@/modules/pagos/utils/galicia'
import { llenarHojaXml, llenarPlantillaXlsx } from '@/modules/pagos/utils/xlsxPlantilla'

const CBU = '0070089420000001234567'
const f = (o: Partial<FacturaAPagar>): FacturaAPagar => ({
  id: 1, proveedor_id: 1, proveedor_nom: 'ABC S.A.', proveedor_cuit: '30714014346',
  proveedor_cbu: CBU, proveedor_alias: null, tipo_comprobante: 'A', numero: '0012-00402141',
  vence_el: '2026-10-21', saldo: 1000, ...o,
})

describe('agrupar: una fila por proveedor', () => {
  it('suma las facturas del mismo proveedor y toma el vencimiento más próximo', () => {
    const g = agruparPorProveedor([
      f({ id: 1, saldo: 100.1, vence_el: '2026-10-30' }),
      f({ id: 2, saldo: 200.2, vence_el: '2026-10-05' }),
      f({ id: 3, proveedor_id: 2, proveedor_nom: 'Castro', saldo: 50 }),
    ])
    expect(g).toHaveLength(2)
    const abc = g.find(x => x.proveedor_id === 1)!
    expect(abc.total).toBe(300.3)
    expect(abc.primerVence).toBe('2026-10-05')
  })
})

describe('transferencias', () => {
  it('descripción de 12 caracteres como máximo', () => {
    expect(descripcionTransferencia(agruparPorProveedor([f({})])[0]!)).toBe('FC 12-402141')
    expect(descripcionTransferencia(agruparPorProveedor([f({ numero: '08837-00004557' })])[0]!)).toBe('FC 8837-4557')
    expect(descripcionTransferencia(agruparPorProveedor([f({ numero: '99999-99999999' })])[0]!).length).toBeLessThanOrEqual(12)
    expect(descripcionTransferencia(agruparPorProveedor([f({ id: 1 }), f({ id: 2 }), f({ id: 3 })])[0]!)).toBe('3 facturas')
  })

  it('destino: CBU de 22 dígitos o alias; lo enmascarado no sirve', () => {
    const g = (cbu: string | null, alias: string | null) => agruparPorProveedor([f({ proveedor_cbu: cbu, proveedor_alias: alias })])[0]!
    expect(destinoTransferencia(g(CBU, null))).toBe(CBU)
    expect(destinoTransferencia(g(null, 'nube.tren.mesa'))).toBe('nube.tren.mesa')
    expect(destinoTransferencia(g('***4567', null))).toBeNull()
    expect(destinoTransferencia(g(null, '***mesa'))).toBeNull()
    expect(destinoTransferencia(g(null, null))).toBeNull()
  })

  it('sin cuenta o con el CBU cambiado después de aprobar, queda afuera con el motivo', () => {
    const r = filasTransferencias(agruparPorProveedor([
      f({ id: 1 }),
      f({ id: 2, proveedor_id: 2, proveedor_nom: 'Sin cuenta', proveedor_cbu: null }),
      f({ id: 3, proveedor_id: 3, proveedor_nom: 'Cambió', cuenta_cambio_tras_aprobar: true }),
    ]), 'CADINC SRL')
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({ A: CBU, B: 1000, C: 'Factura', D: 'FC 12-402141' })
    expect(r.afuera.map(a => a.razon_social)).toEqual(['Cambió', 'Sin cuenta'])
    expect(r.afuera.find(a => a.razon_social === 'Cambió')!.motivo).toContain('cambió')
  })

  it('el mail va sólo si es válido; el mensaje no pasa de 200', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => f({ id: i + 1 }))
    const r = filasTransferencias(agruparPorProveedor(muchas, new Map([[1, 'no-es-mail']])), 'CADINC SRL')
    expect(r.filas[0]!.E).toBeNull()
    expect(String(r.filas[0]!.F).length).toBeLessThanOrEqual(200)
    const ok = filasTransferencias(agruparPorProveedor([f({})], new Map([[1, 'pagos@abc.com.ar']])), 'CADINC SRL')
    expect(ok.filas[0]!.E).toBe('pagos@abc.com.ar')
  })
})

describe('e-cheqs', () => {
  const HOY = '2026-09-23'

  it('por defecto: un e-cheq al vencimiento; si ya venció, al día', () => {
    expect(planPorDefecto(agruparPorProveedor([f({ vence_el: '2026-10-21' })])[0]!, HOY).primerCobro).toBe('2026-10-21')
    expect(planPorDefecto(agruparPorProveedor([f({ vence_el: '2026-09-01' })])[0]!, HOY).primerCobro).toBe(HOY)
  })

  it('el plan anotado en la factura manda; si su primera fecha ya pasó, arranca hoy', () => {
    const plan = { cantidad: 6, primer_cobro: '2026-10-23', cada_dias: 30 }
    expect(planPorDefecto(agruparPorProveedor([f({ plan_cheques: plan })])[0]!, HOY))
      .toEqual({ cantidad: 6, primerCobro: '2026-10-23', cadaDias: 30 })
    expect(planPorDefecto(agruparPorProveedor([f({ plan_cheques: { ...plan, primer_cobro: '2026-09-20' } })])[0]!, HOY).primerCobro)
      .toBe(HOY)
  })

  it('partido en 3 cada 30 días: la suma da exacto y la última absorbe los centavos', () => {
    const ch = chequesDelPlan(1000, { cantidad: 3, primerCobro: '2026-10-01', cadaDias: 30 })
    expect(ch.map(c => c.fecha)).toEqual(['2026-10-01', '2026-10-31', '2026-11-30'])
    expect(ch.map(c => c.monto)).toEqual([333.33, 333.33, 333.34])
  })

  it('cada fila: CUIT numérico, fecha dd/mm/aaaa, las dos descripciones y «A la orden»', () => {
    const g = agruparPorProveedor([f({ saldo: 1000 })])
    const r = filasEcheq(g, new Map([[1, { cantidad: 2, primerCobro: '2026-10-01', cadaDias: 30 }]]), HOY, 'CADINC SRL')
    expect(r.filas).toHaveLength(2)
    expect(r.filas[0]).toMatchObject({ A: 'CUIT', B: 30714014346, C: 500, D: '01/10/2026', E: 'Factura', G: 'E-cheq 1 de 2', I: 'A la orden' })
    expect(String(r.filas[0]!.F)).toContain('A 0012-00402141')
    expect(r.total).toBe(1000)
  })

  it('sin CUIT o con una fecha pasada, queda afuera', () => {
    const g = agruparPorProveedor([
      f({ id: 1, proveedor_cuit: null }),
      f({ id: 2, proveedor_id: 2, proveedor_nom: 'Pasado' }),
    ])
    const r = filasEcheq(g, new Map([[2, { cantidad: 1, primerCobro: '2026-01-01', cadaDias: 30 }]]), HOY, 'CADINC SRL')
    expect(r.filas).toHaveLength(0)
    expect(r.afuera.map(a => a.motivo)).toEqual(['no tiene CUIT válido', 'un e-cheq quedaría con fecha pasada'])
  })
})

describe('llenar la hoja sin reescribir el archivo', () => {
  const HOJA = '<worksheet><sheetData><row r="1"><c r="A1" s="7" t="s"><v>0</v></c></row>'
    + '<row r="2" spans="1:10"><c r="B2"/><c r="C2" s="12"/></row></sheetData></worksheet>'

  it('conserva el estilo de cada celda, ordena las columnas y escapa el texto', () => {
    const xml = llenarHojaXml(HOJA, [{ A: 'CUIT', C: 1500.5, F: 'A & B <x>' }])
    expect(xml).toContain('<row r="2" spans="1:10"><c r="A2" t="inlineStr"><is><t xml:space="preserve">CUIT</t></is></c><c r="B2"/><c r="C2" s="12"><v>1500.5</v></c>')
    expect(xml).toContain('A &amp; B &lt;x&gt;')
    expect(xml).toContain('<c r="A1" s="7" t="s"><v>0</v></c>')
  })

  it('una fila que no existía se agrega en su lugar', () => {
    const xml = llenarHojaXml(HOJA, [{ A: 'x' }, { A: 'y' }])
    expect(xml).toMatch(/<row r="2"[\s\S]*<row r="3"><c r="A3" t="inlineStr">[\s\S]*<\/sheetData>/)
  })

  for (const [tipo, conf] of Object.entries(GALICIA)) {
    it(`con la plantilla real de ${tipo}: el resto del archivo queda igual`, async () => {
      const buf = readFileSync(join(process.cwd(), 'public', conf.plantilla))
      const out = await llenarPlantillaXlsx(buf, conf.hoja, [{ A: 'PRUEBA', B: 1 }])
      const a = await JSZip.loadAsync(buf)
      const b = await JSZip.loadAsync(out)
      expect(Object.keys(b.files).sort()).toEqual(Object.keys(a.files).sort())
      let cambiados = 0
      for (const nombre of Object.keys(a.files)) {
        if (a.files[nombre]!.dir) continue
        const x = await a.file(nombre)!.async('string')
        const y = await b.file(nombre)!.async('string')
        if (x !== y) { cambiados++; expect(y).toContain('PRUEBA') }
      }
      expect(cambiados).toBe(1)
    })
  }
})

describe('galicia con notas de crédito pendientes (20260925)', () => {
  it('suma lo pagable, no el saldo: lo reservado por una NC sin aprobar no se transfiere', () => {
    const g = agruparPorProveedor([f({ saldo: 1000, saldo_pagable: 700 })])
    expect(g[0]!.total).toBe(700)
  })
})
