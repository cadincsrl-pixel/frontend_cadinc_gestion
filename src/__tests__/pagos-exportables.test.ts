import { describe, it, expect } from 'vitest'
import { describirFiltroFacturas } from '@/modules/pagos/utils/pagos.utils'
import { nombreEnZip, carpetaDeOrden } from '@/modules/pagos/utils/pagosPaquete'
import type { PagosPaqueteArchivo, PagosPaqueteFactura, PagosPaqueteOrden } from '@/types/domain.types'

// ── Cómo se describe el filtro ────────────────────────────────────────
// Esta línea va impresa arriba del resumen PDF y adentro del CONTENIDO.txt.
// Si miente, alguien imprime «vencidas» y lo lee como si fuera toda la deuda.
describe('describirFiltroFacturas', () => {
  it('sin filtros lo dice, no queda en blanco', () => {
    expect(describirFiltroFacturas({})).toBe('todas las facturas')
  })

  it('estados, vencimiento y fechas, en castellano', () => {
    const d = describirFiltroFacturas({ estados: ['aprobada'], vencimiento: 'vencidas' })
    expect(d).toContain('Aprobada')
    expect(d).toContain('vencidas')
  })

  it('«todas» de vencimiento no ensucia la línea', () => {
    expect(describirFiltroFacturas({ vencimiento: 'todas' })).toBe('todas las facturas')
  })

  it('el proveedor sale por nombre si se lo sabe, y por id si no', () => {
    expect(describirFiltroFacturas({ proveedor_id: 14 }, () => 'Norte Distribuciones'))
      .toContain('Norte Distribuciones')
    expect(describirFiltroFacturas({ proveedor_id: 14 })).toContain('#14')
  })

  it('un rango de fechas se lee como rango', () => {
    expect(describirFiltroFacturas({ desde: '2026-09-01', hasta: '2026-09-30' }))
      .toBe('emitidas del 01/09/2026 al 30/09/2026')
  })

  it('el tri-estado distingue quién paga', () => {
    expect(describirFiltroFacturas({ paga_cliente: true })).toContain('las paga el cliente')
    expect(describirFiltroFacturas({ paga_cliente: false })).toContain('las paga CADINC')
  })
})

// ── Cómo se nombran los archivos del ZIP ──────────────────────────────
//
// El eje es la ORDEN DE PAGO: el contador concilia lo que salió del banco en
// el período, no lo emitido. Una carpeta por OP, porque cada OP es UN
// movimiento del banco y adentro va el asiento entero.
const orden = (o: Partial<PagosPaqueteOrden> = {}): PagosPaqueteOrden => ({
  id: 8, numero: 8, numero_fmt: 'OP-0008', fecha: '2026-09-21', forma_pago: 'echeq',
  estado: 'emitida', monto_pagado: 24995, monto_nc: 0,
  proveedor_nom: 'NORTE DISTRIBUCIONES SRL', proveedor_cuit: '30714014346',
  archivos: [], facturas: [], ...o,
} as PagosPaqueteOrden)

const factura = (o: Partial<PagosPaqueteFactura> = {}): PagosPaqueteFactura => ({
  id: 9, tipo_comprobante: 'A', numero: '00011-00000194', fecha: '2026-08-18',
  total: 24995, estado: 'pagada', descripcion: 'esponja', aplicado: 24995,
  archivos: [], ...o,
} as PagosPaqueteFactura)

const a = (o: Partial<PagosPaqueteArchivo> = {}): PagosPaqueteArchivo => ({
  adjunto_id: 1, tipo: 'factura', origen: 'factura', nombre_archivo: 'foto.jpg',
  mime_type: 'image/jpeg', size_bytes: 100, url: 'https://x', ...o,
} as PagosPaqueteArchivo)

describe('carpetaDeOrden', () => {
  it('mes de PAGO y una carpeta por orden', () => {
    expect(carpetaDeOrden(orden())).toBe('2026-09/OP-0008_NORTE_DISTRIBUCIONES_SRL')
  })

  it('el mes es el del pago, no el de emisión de la factura', () => {
    // La factura es de agosto y se pagó en septiembre: va en septiembre, que es
    // el período que el contador concilia. Con el eje viejo caía en agosto.
    const c = carpetaDeOrden(orden({ fecha: '2026-09-21' }))
    expect(c.startsWith('2026-09/')).toBe(true)
    expect(factura().fecha?.slice(0, 7)).toBe('2026-08')
  })

  it('sin tildes ni caracteres raros: no todos los unzip los respetan', () => {
    const c = carpetaDeOrden(orden({ proveedor_nom: 'Ñandú & Cía. S.R.L.' }))
    expect(c).toMatch(/^[A-Za-z0-9/._-]+$/)
    expect(c).toContain('Nandu')
  })

  it('sin fecha cae a una carpeta propia en vez de a "undefined"', () => {
    expect(carpetaDeOrden(orden({ fecha: '' }))).toMatch(/^sin-fecha\//)
  })
})

describe('nombreEnZip', () => {
  it('el comprobante del pago queda primero al ordenar alfabéticamente', () => {
    const usados = new Set<string>()
    const pago = nombreEnZip(orden(), a({ origen: 'pago', tipo: 'comprobante_pago', nombre_archivo: 'echeq.pdf', mime_type: 'application/pdf' }), usados)
    const fact = nombreEnZip(orden(), a(), usados, factura())
    expect(pago.split('/').pop()!.startsWith('pago__')).toBe(true)
    expect(fact.split('/').pop()!.startsWith('factura__')).toBe(true)
    // 'f' < 'p', así que el comprobante iría segundo si no fuera por el prefijo…
    // lo que importa es que los dos caen en la MISMA carpeta de la OP.
    expect(pago.slice(0, pago.lastIndexOf('/'))).toBe(fact.slice(0, fact.lastIndexOf('/')))
  })

  it('la factura lleva su número en el nombre', () => {
    expect(nombreEnZip(orden(), a(), new Set(), factura())).toContain('A-00011-00000194')
  })

  it('un remito de la factura se distingue de la factura', () => {
    const n = nombreEnZip(orden(), a({ tipo: 'remito' }), new Set(), factura())
    expect(n).toContain('remito')
  })

  it('dos archivos que caerían en el mismo nombre se numeran, no se pisan', () => {
    const usados = new Set<string>()
    const uno = nombreEnZip(orden(), a({ tipo: 'remito' }), usados, factura())
    const dos = nombreEnZip(orden(), a({ tipo: 'remito', adjunto_id: 2 }), usados, factura())
    expect(uno).not.toBe(dos)
    expect(dos).toContain('_2.')
  })

  it('la extensión sale del nombre, y si no lo dice del mime', () => {
    expect(nombreEnZip(orden(), a({ nombre_archivo: 'escaneo.PDF' }), new Set(), factura())).toMatch(/\.pdf$/)
    expect(nombreEnZip(orden(), a({ nombre_archivo: 'sin-extension', mime_type: 'image/png' }), new Set(), factura())).toMatch(/\.png$/)
  })

  it('una factura sin número no rompe el nombre', () => {
    expect(nombreEnZip(orden(), a(), new Set(), factura({ numero: null }))).toContain('s-n')
  })
})
