import { describe, it, expect } from 'vitest'
import { prendasQueLeFaltan, talleDeFicha } from '@/lib/utils/ropa'
import { armarConstanciaDoc, trabajadorConstancia } from '@/modules/tarja/utils/constanciaRopaPdf'

describe('talle precargado desde la ficha', () => {
  const p = { talle_pantalon: '44', talle_botines: ' 41 ', talle_camisa: null }
  it('según talle_de de la categoría', () => {
    expect(talleDeFicha(p, 'pantalon')).toBe('44')
    expect(talleDeFicha(p, 'botines')).toBe('41')
    expect(talleDeFicha(p, 'camisa')).toBe('')
    expect(talleDeFicha(p, null)).toBe('')
    expect(talleDeFicha(null, 'pantalon')).toBe('')
  })
})

describe('qué le falta a cada uno (entrega por obra)', () => {
  const cats = [{ id: 1, meses_vencimiento: 6 }, { id: 2, meses_vencimiento: 6 }, { id: 3, meses_vencimiento: 0 }]
  const ult: Record<string, string> = { '1': '2026-08-01', '2': '2026-01-10', '3': '2025-01-01' }
  it('lo que nunca recibió y lo vencido; lo que no vence no', () => {
    expect(prendasQueLeFaltan('101', cats, (_l, c) => ult[String(c)], '2026-09-23')).toEqual([2])
    expect(prendasQueLeFaltan('101', cats, () => undefined, '2026-09-23')).toEqual([1, 2, 3])
  })
})

describe('constancia Res. SRT 299/11', () => {
  const t = trabajadorConstancia(
    { leg: '101', nom: 'Juan Pérez', dni: '36890735' }, 'Oficial',
    [{ categoria_id: 2, fecha_entrega: '2026-09-23', cantidad: 2, talle: '41' }, { categoria_id: 1, fecha_entrega: '2026-03-01' }],
    id => (id === 1 ? 'Pantalón' : 'Botines'),
  )

  it('arma los renglones con cantidad y talle; lo viejo queda en 1 y sin talle', () => {
    expect(t.entregas).toEqual([
      { producto: 'Botines',  talle: '41', cantidad: 2, fecha: '2026-09-23' },
      { producto: 'Pantalón', talle: '',   cantidad: 1, fecha: '2026-03-01' },
    ])
  })

  it('una hoja por trabajador: corte de página entre hojas, no al final', () => {
    const doc = armarConstanciaDoc([t, { ...t, leg: '102' }], 'Pantalón, Botines', null)
    const json = JSON.stringify(doc.content)
    expect((json.match(/"pageBreak":"after"/g) ?? []).length).toBe(1)
    expect(json).toContain('36.890.735')
    expect(json).toContain('Talle 41')
    expect(json).toContain('Res') // título con la resolución
  })
})
