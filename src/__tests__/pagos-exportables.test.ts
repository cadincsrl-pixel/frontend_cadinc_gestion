import { describe, it, expect } from 'vitest'
import { describirFiltroFacturas } from '@/modules/pagos/utils/pagos.utils'
import { nombreEnZip, prefijoDe } from '@/modules/pagos/utils/pagosPaquete'
import type { PagosPaqueteArchivo, PagosPaqueteFactura } from '@/types/domain.types'

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
const f = (o: Partial<PagosPaqueteFactura> = {}): PagosPaqueteFactura => ({
  id: 9, tipo_comprobante: 'A', numero: '00011-00000194', fecha: '2026-09-18',
  proveedor_nom: 'NORTE DISTRIBUCIONES SRL', proveedor_cuit: '30714014346',
  total: 24994.52, estado: 'pagada', archivos: [], ...o,
} as PagosPaqueteFactura)

const a = (o: Partial<PagosPaqueteArchivo> = {}): PagosPaqueteArchivo => ({
  entidad: 'facturas', entidad_id: 9, adjunto_id: 1, tipo: 'factura', origen: 'factura',
  op_numero: null, nombre_archivo: 'foto.jpg', mime_type: 'image/jpeg', size_bytes: 100,
  url: 'https://x', ...o,
} as PagosPaqueteArchivo)

describe('nombreEnZip', () => {
  it('carpeta por mes de emisión, que es como el contador arma el período', () => {
    expect(nombreEnZip(f(), a(), new Set())).toMatch(/^2026-09\//)
  })

  it('el comprobante del pago queda pegado a su factura al ordenar por nombre', () => {
    const usados = new Set<string>()
    const factura = nombreEnZip(f(), a(), usados)
    const pago = nombreEnZip(f(), a({ entidad: 'ordenes', origen: 'pago', tipo: 'comprobante_pago', op_numero: 8, nombre_archivo: 'echeq.pdf', mime_type: 'application/pdf' }), usados)
    expect(pago).toContain('__OP-0008_comprobante_pago')
    // Lo que importa: comparten prefijo, así que quedan uno al lado del otro.
    expect(pago.startsWith(factura.replace(/\.jpg$/, ''))).toBe(true)
  })

  it('sin tildes ni caracteres raros: no todos los unzip los respetan', () => {
    const n = nombreEnZip(f({ proveedor_nom: 'Ñandú & Cía. S.R.L.' }), a(), new Set())
    expect(n).toMatch(/^[A-Za-z0-9/._-]+$/)
    expect(n).toContain('Nandu')
  })

  it('dos archivos que caerían en el mismo nombre se numeran, no se pisan', () => {
    const usados = new Set<string>()
    const uno = nombreEnZip(f(), a({ tipo: 'remito' }), usados)
    const dos = nombreEnZip(f(), a({ tipo: 'remito', adjunto_id: 2 }), usados)
    expect(uno).not.toBe(dos)
    expect(dos).toContain('_2.')
  })

  it('la extensión sale del nombre, y si no lo dice del mime', () => {
    expect(nombreEnZip(f(), a({ nombre_archivo: 'escaneo.PDF' }), new Set())).toMatch(/\.pdf$/)
    expect(nombreEnZip(f(), a({ nombre_archivo: 'sin-extension', mime_type: 'image/png' }), new Set())).toMatch(/\.png$/)
  })

  it('una factura sin número no rompe el nombre', () => {
    expect(prefijoDe(f({ numero: null }))).toContain('s-n')
  })

  it('sin fecha cae a una carpeta propia en vez de a "undefined"', () => {
    expect(nombreEnZip(f({ fecha: '' }), a(), new Set())).toMatch(/^sin-fecha\//)
  })
})
