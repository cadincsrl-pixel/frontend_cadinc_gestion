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

  it('las cantidades salen en las tres copias (sin precios desde 2026-08-06)', () => {
    const html = htmlRemito(mkRemito(25))
    // El material 25 aparece una vez por copia; el total en $ ya no se imprime.
    expect(html.split('Material de prueba 25').length - 1).toBe(3)
    expect(html).not.toContain('$250.000')
  })
})

// ── Estado del pedido original en el remito (2026-08-05) ────────────────────
import { armarEstadoPedido } from '@/modules/certificaciones/components/RemitoEnvioPrint'
import type { SolicitudCompra } from '@/types/domain.types'

function mkSolicitud(items: Partial<SolicitudCompra['items'][number]>[]): Pick<SolicitudCompra, 'id' | 'fecha' | 'items'> {
  return {
    id: 45,
    fecha: '2026-07-28',
    items: items.map((it, i) => ({
      id: i + 1,
      descripcion: `Mat ${i + 1}`,
      cantidad: 50,
      unidad: 'un',
      estado: 'comprado',
      ...it,
    })) as SolicitudCompra['items'],
  }
}

function mkRemitoCon(items: { item_id: number; cantidad: number }[]): RemitoEnvio {
  return {
    ...mkRemito(0),
    items: items.map((it, i) => ({
      id: i + 1, remito_id: 1, item_id: it.item_id, descripcion: `Mat ${it.item_id}`,
      cantidad: it.cantidad, unidad: 'un', origen: 'deposito', proveedor: null, precio_unit: null,
    })),
  } as RemitoEnvio
}

describe('armarEstadoPedido — pedido / enviado / falta', () => {
  it('al crear (cache viejo) suma este remito al acumulado', () => {
    const sol = mkSolicitud([{ cantidad: 50, cantidad_enviada: 20 }, { cantidad: 10, cantidad_enviada: 0 }])
    const est = armarEstadoPedido(sol, mkRemitoCon([{ item_id: 1, cantidad: 15 }]), { sumarEsteRemito: true })
    expect(est.items[0]).toMatchObject({ pedida: 50, enviada: 35, falta: 15 })
    expect(est.items[1]).toMatchObject({ pedida: 10, enviada: 0, falta: 10 })
    expect(est.etiqueta).toBe('Pedido #45 · 28/07/2026')
  })

  it('al reimprimir (cache al día) NO vuelve a sumar este remito', () => {
    const sol = mkSolicitud([{ cantidad: 50, cantidad_enviada: 35 }])
    const est = armarEstadoPedido(sol, mkRemitoCon([{ item_id: 1, cantidad: 15 }]), { sumarEsteRemito: false })
    expect(est.items[0]).toMatchObject({ enviada: 35, falta: 15 })
  })

  it('ítem legacy marcado enviado sin acumulado cuenta como completo', () => {
    const sol = mkSolicitud([{ cantidad: 30, cantidad_enviada: 0, estado: 'enviado' }])
    const est = armarEstadoPedido(sol, mkRemitoCon([]), { sumarEsteRemito: false })
    expect(est.items[0]).toMatchObject({ enviada: 30, falta: 0 })
  })

  it('si se compró menos que lo pedido, la meta es la cantidad comprada', () => {
    const sol = mkSolicitud([{ cantidad: 50, cantidad_comprada: 40, cantidad_enviada: 40 }])
    const est = armarEstadoPedido(sol, mkRemitoCon([]), { sumarEsteRemito: false })
    expect(est.items[0]).toMatchObject({ pedida: 40, enviada: 40, falta: 0 })
  })

  it('rechazados salen marcados y sin falta', () => {
    const sol = mkSolicitud([{ estado: 'rechazado' }])
    const est = armarEstadoPedido(sol, mkRemitoCon([]), { sumarEsteRemito: false })
    expect(est.items[0]!.rechazado).toBe(true)
    expect(est.items[0]!.falta).toBe(0)
  })
})

describe('htmlRemito con estado del pedido', () => {
  it('imprime la sección con pedido/enviado/falta y ✓ en los completos', () => {
    const sol = mkSolicitud([
      { cantidad: 50, cantidad_enviada: 35 },
      { cantidad: 15, cantidad_enviada: 15, estado: 'enviado' },
    ])
    const est = armarEstadoPedido(sol, mkRemitoCon([]), { sumarEsteRemito: false })
    const html = htmlRemito(mkRemito(2), 'Obra Test', est)
    expect(html).toContain('ESTADO DEL PEDIDO ORIGINAL — Pedido #45')
    expect(html).toContain('✓')
    expect(html).toContain('>15</span>')  // falta 15 resaltado
  })

  it('los renglones del estado cuentan para pasar al formato largo', () => {
    // 10 items del remito + 8 del estado (+2) = 20 > 15 → largo
    const sol = mkSolicitud(Array.from({ length: 8 }, () => ({})))
    const est = armarEstadoPedido(sol, mkRemitoCon([]), { sumarEsteRemito: false })
    const html = htmlRemito(mkRemito(10), 'Obra', est)
    expect(html).not.toContain('min-height:calc(33.33vh')
    // Sin estado, 10 items solos siguen compactos.
    expect(htmlRemito(mkRemito(10))).toContain('min-height:calc(33.33vh')
  })
})

// ── Historial de envíos fecha por fecha (2026-08-06) ────────────────────────
import { armarEnvios } from '@/modules/certificaciones/components/RemitoEnvioPrint'

describe('armarEnvios — historial de envíos del pedido', () => {
  const este = { ...mkRemitoCon([{ item_id: 1, cantidad: 15 }]), numero: 'RE-0042', fecha: '2026-08-05' } as RemitoEnvio
  const previo = { ...mkRemitoCon([{ item_id: 1, cantidad: 20 }]), id: 9, numero: 'RE-0040', fecha: '2026-07-28' } as RemitoEnvio

  it('lista solo los envíos ANTERIORES, en orden cronológico', () => {
    // El remito actual se excluye: su contenido ya es la tabla principal del
    // papel (pedido de Franco 2026-08-06, era ruido repetirlo abajo).
    const envios = armarEnvios(este, [previo])
    expect(envios.map(e => e.numero)).toEqual(['RE-0040'])
    expect(envios[0]!.detalle).toContain('Mat 1: 20 un')
  })

  it('excluye el remito actual aunque venga en el listado (reimpresión)', () => {
    const envios = armarEnvios(este, [previo, este])
    expect(envios.map(e => e.numero)).toEqual(['RE-0040'])
  })

  it('sin envíos previos no hay historial (la sección no se imprime)', () => {
    expect(armarEnvios(este, [])).toHaveLength(0)
  })
})

describe('htmlRemito con historial de envíos', () => {
  it('imprime la sección ENVÍOS ANTERIORES con fecha y detalle', () => {
    const sol = mkSolicitud([{ cantidad: 50, cantidad_enviada: 35 }])
    const este = { ...mkRemitoCon([{ item_id: 1, cantidad: 15 }]), numero: 'RE-0042', fecha: '2026-08-05' } as RemitoEnvio
    const previo = { ...mkRemitoCon([{ item_id: 1, cantidad: 20 }]), id: 9, numero: 'RE-0040', fecha: '2026-07-28' } as RemitoEnvio
    const estado = { ...armarEstadoPedido(sol, este, { sumarEsteRemito: false }), envios: armarEnvios(este, [previo]) }
    const html = htmlRemito(este, 'Obra', estado)
    expect(html).toContain('ENVÍOS ANTERIORES')
    expect(html).toContain('RE-0040 · 28/07/2026')
    expect(html).not.toContain('(este remito)')
  })
})

// ── Sin precios + columna ÚLT. ENVÍO (2026-08-06) ───────────────────────────
describe('htmlRemito sin precios y con último envío', () => {
  it('el remito impreso NO muestra precios aunque los ítems los tengan', () => {
    const html = htmlRemito(mkRemito(3))  // fixture con precio_unit 1000
    expect(html).not.toContain('$')
    expect(html).not.toContain('TOTAL')
  })

  it('la tabla de estado muestra la fecha del último envío por renglón', () => {
    const sol = mkSolicitud([
      { cantidad: 50, cantidad_enviada: 35 },   // enviado por remitos
      { cantidad: 10, cantidad_enviada: 0 },    // nunca enviado
    ])
    const este = { ...mkRemitoCon([{ item_id: 1, cantidad: 15 }]), numero: 'RE-0042', fecha: '2026-08-05' } as RemitoEnvio
    const previo = { ...mkRemitoCon([{ item_id: 1, cantidad: 20 }]), id: 9, numero: 'RE-0040', fecha: '2026-07-28' } as RemitoEnvio
    const est = armarEstadoPedido(sol, este, { sumarEsteRemito: false }, [previo])
    expect(est.items[0]!.ultimoEnvio).toBe('2026-08-05')  // el más nuevo gana
    expect(est.items[1]!.ultimoEnvio).toBeNull()
    const html = htmlRemito(este, 'Obra', est)
    expect(html).toContain('ÚLT. ENVÍO')
    expect(html).toContain('05/08/2026')
  })
})

// ── Vista previa en borrador (2026-08-07) ───────────────────────────────────
describe('htmlRemito en modo borrador', () => {
  it('imprime UNA sola copia marcada BORRADOR con banner de sin validez', () => {
    const html = htmlRemito(mkRemito(5), 'Obra', undefined, { borrador: true })
    expect(html).toContain('BORRADOR — SIN VALIDEZ')
    expect(html).not.toContain('ORIGINAL')
    expect(html).not.toContain('DUPLICADO')
    expect(html).not.toContain('TRIPLICADO')
    // Una sola copia: sin triplicado compacto de tercios de hoja.
    expect(html).not.toContain('min-height:calc(33.33vh')
  })

  it('el modo normal no cambia: tres copias sin banner', () => {
    const html = htmlRemito(mkRemito(5))
    expect(html).not.toContain('BORRADOR')
    expect(html).toContain('ORIGINAL')
    expect(html).toContain('TRIPLICADO')
  })
})
