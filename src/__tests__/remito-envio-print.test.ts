// El remito de envío imprimible tiene dos modos, y este archivo congela el que
// arregló el bug del 2026-07-30: con más de ~20 artículos, el triplicado-en-una-
// hoja (min-height fijo + page-break-inside:avoid) RECORTABA la tabla en
// silencio y el remito salía incompleto.
//
// La regla: hasta 15 renglones → 3 copias en una hoja (formato de siempre);
// más → una copia por hoja, la tabla fluye entre páginas.

import { describe, it, expect } from 'vitest'
import { htmlRemito } from '@/modules/certificaciones/components/RemitoEnvioPrint'
import type { RemitoEnvio } from '@/types/domain.types'

function mkRemito(cantidadItems: number): RemitoEnvio {
  return {
    id: 1,
    numero: 'RE-0042',
    fecha: '2026-07-30',
    obra_cod: 'OB-101',
    origen: 'deposito',
    obs: null,
    created_at: '2026-07-30T12:00:00Z',
    created_by: null,
    items: Array.from({ length: cantidadItems }, (_, i) => ({
      id: i + 1,
      remito_id: 1,
      solicitud_item_id: null,
      descripcion: `Material de prueba ${i + 1}`,
      cantidad: 10,
      unidad: 'un',
      origen: 'deposito',
      proveedor: null,
      precio_unit: 1000,
    })),
  } as unknown as RemitoEnvio
}

describe('htmlRemito', () => {
  it('con pocos renglones usa el triplicado compacto en una hoja', () => {
    const html = htmlRemito(mkRemito(5))
    // El compacto se reconoce por el tercio de hoja y la prohibición de partir.
    expect(html).toContain('min-height:calc(33.33vh - 14px)')
    expect(html).toContain('page-break-inside:avoid')
    // Las tres copias están.
    expect(html).toContain('ORIGINAL')
    expect(html).toContain('DUPLICADO')
    expect(html).toContain('TRIPLICADO')
  })

  it('EL BUG: con 25 artículos, los 25 aparecen en las TRES copias', () => {
    const html = htmlRemito(mkRemito(25))
    // Antes salían solo ~20: el resto quedaba recortado por el avoid.
    const apariciones = html.split('Material de prueba 25').length - 1
    expect(apariciones).toBe(3)
    // Y el renglón 21, el primero que se perdía:
    expect(html.split('Material de prueba 21').length - 1).toBe(3)
  })

  it('con más de 15 renglones cambia a una copia por hoja y la tabla puede partirse', () => {
    const html = htmlRemito(mkRemito(25))
    // Sin min-height de tercio de hoja...
    expect(html).not.toContain('min-height:calc(33.33vh - 14px)')
    // ...y cada copia (salvo la última) empieza hoja nueva.
    expect(html.split('page-break-after:always').length - 1).toBe(2)
    // Lo ÚNICO con page-break-inside:avoid son las firmas (3 copias), nunca la
    // copia entera — eso era exactamente lo que recortaba la tabla.
    expect(html.split('page-break-inside:avoid').length - 1).toBe(3)
  })

  it('en 15 renglones justos sigue compacto; en 16 pasa a largo', () => {
    expect(htmlRemito(mkRemito(15))).toContain('min-height:calc(33.33vh - 14px)')
    expect(htmlRemito(mkRemito(16))).not.toContain('min-height:calc(33.33vh - 14px)')
  })

  it('el body sólo es flex en compacto (display:flex rompe los saltos de página en Chrome)', () => {
    expect(htmlRemito(mkRemito(5))).toContain('body style="display:flex')
    expect(htmlRemito(mkRemito(25))).toContain('body style=""')
  })

  it('el total sale en las tres copias', () => {
    const html = htmlRemito(mkRemito(25))
    // 25 items × 10 un × $1.000 = $250.000
    expect(html.split('$250.000').length - 1).toBe(3)
  })
})
