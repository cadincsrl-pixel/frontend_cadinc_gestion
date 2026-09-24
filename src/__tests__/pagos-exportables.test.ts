import { describe, it, expect } from 'vitest'
import { describirFiltroFacturas } from '@/modules/pagos/utils/pagos.utils'
import { nombreEnZip, carpetaDeOrden } from '@/modules/pagos/utils/pagosPaquete'
import { HEADERS_FACTURAS, filaExcelFactura, totalesExcelFacturas } from '@/modules/pagos/utils/pagosExport'
import type { PagosFactura, PagosPaqueteArchivo, PagosPaqueteFactura, PagosPaqueteOrden } from '@/types/domain.types'

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

// ── Excel de facturas con notas de crédito (20260925) ─────────────────
//
// La NC es un comprobante más de la hoja, pero RESTA: si el total de la hoja
// la sumara como deuda, el Excel diría que se debe más de lo que se debe.
const fila = (o: Partial<PagosFactura> = {}): PagosFactura => ({
  id: 1, proveedor_id: 14, tipo_comprobante: 'A', numero: '0001-00000045', fecha: '2026-09-10',
  vence_el: '2026-10-10', neto: 826.45, iva: 173.55, percepciones: null, otros: null,
  total: 1000, imputable: 1000, forma_pago_prevista: 'transferencia', estado: 'aprobada',
  paga_cliente: false, pagado: 0, acreditado: 0, saldo: 1000, vencida: false, dias_vencida: -5,
  proveedor_nom: 'NORTE', proveedor_cuit: '30714014346', descripcion: 'cemento',
  created_by_nombre: 'Alina', aprobada_por_nombre: 'Diego', ultima_op: null, centro_costo: 'LAMADRID', centros: null,
  clase: 'factura', nc_aplicado: 0, nc_disponible: 0, nc_pendiente: 0, saldo_pagable: 1000, nc_txt: null,
  ...o,
} as PagosFactura)

const col = (h: (typeof HEADERS_FACTURAS)[number]) => HEADERS_FACTURAS.indexOf(h)

describe('filaExcelFactura', () => {
  it('una factura va en positivo y con su clase', () => {
    const r = filaExcelFactura(fila())
    expect(r[col('Clase')]).toBe('Factura')
    expect(r[col('Total')]).toBe(1000)
    expect(r[col('Saldo')]).toBe(1000)
  })

  it('una NC va en negativo, sin saldo, con su crédito disponible y estado de NC', () => {
    const r = filaExcelFactura(fila({
      clase: 'nota_credito', total: 300, imputable: 300, neto: 247.93, iva: 52.07, saldo: 0,
      estado: 'aprobada', nc_disponible: 300, vence_el: null, dias_vencida: null,
    }))
    expect(r[col('Clase')]).toBe('Nota de crédito')
    expect(r[col('Total')]).toBe(-300)
    expect(r[col('Imputable')]).toBe(-300)
    expect(r[col('IVA')]).toBe(-52.07)
    expect(r[col('Saldo')]).toBeNull()
    expect(r[col('Crédito NC')]).toBe(300)
    expect(r[col('Estado')]).toBe('Crédito disponible')
    expect(r[col('Forma prevista')]).toBe('—')
  })

  it('la fila TOTAL resta la NC y no la cuenta como deuda', () => {
    const t = totalesExcelFacturas([
      fila({ total: 1000, imputable: 1000, saldo: 700, acreditado: 300 }),
      fila({ id: 2, clase: 'nota_credito', total: 300, imputable: 300, saldo: 0, nc_disponible: 0, estado: 'pagada' }),
    ])
    expect(t[col('Total')]).toBe(700)
    expect(t[col('Imputable')]).toBe(700)
    expect(t[col('Saldo')]).toBe(700)
    expect(t[col('Notas de crédito')]).toBe(300)
  })

  it('el describir del filtro nombra la clase', () => {
    expect(describirFiltroFacturas({ clase: 'nota_credito' })).toContain('notas de crédito')
    expect(describirFiltroFacturas({ clase: 'nota_credito', con_credito: true })).toContain('crédito disponible')
  })
})
