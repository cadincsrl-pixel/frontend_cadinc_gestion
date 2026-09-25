// Productos de venta (tanda 6, 20260929b): el respaldo es la semilla de la
// base (mismos ids), las etiquetas salen iguales que antes y el período
// facturado llega al PDF.
import { describe, it, expect } from 'vitest'
import {
  PRODUCTOS, etiquetaProducto, hintProducto, mesDeFecha,
} from '@/modules/facturacion/utils/facturacion.utils'
import { mensajeCodigoFacturacion } from '@/modules/facturacion/utils/facturacion.errores'
import type { VentasFacturaFJ } from '@/types/domain.types'

describe('catálogo de respaldo', () => {
  it('es la semilla de ventas_productos: mismos ids, concepto y obra que antes', () => {
    expect(PRODUCTOS.map(p => [p.id, p.nombre, p.concepto_arca, p.pide_obra, p.pide_periodo])).toEqual([
      [1, 'AVANCE DE OBRA', 3, true, false],
      [2, 'TRANSPORTE', 2, false, false],
    ])
  })
})

describe('etiquetaProducto', () => {
  it('los de la semilla salen como antes; lo demás tal cual', () => {
    expect(etiquetaProducto('AVANCE DE OBRA')).toBe('Avance de obra')
    expect(etiquetaProducto('TRANSPORTE')).toBe('Transporte')
    expect(etiquetaProducto('Alquiler de equipos')).toBe('Alquiler de equipos')
    expect(etiquetaProducto('')).toBe('—')
    expect(etiquetaProducto(null)).toBe('—')
  })
})

describe('hintProducto', () => {
  it('descripción + concepto + qué pide', () => {
    expect(hintProducto({ descripcion: 'Fletes.', concepto_arca: 2, pide_obra: false, pide_periodo: true }))
      .toBe('Fletes. Concepto ARCA 2 (servicios). Obra opcional. Pide el período facturado.')
  })
})

describe('mesDeFecha', () => {
  it('primer y último día del mes (bisiesto incluido)', () => {
    expect(mesDeFecha('2026-09-25')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(mesDeFecha('2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(mesDeFecha('2026-12-31')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
})

describe('errores nuevos', () => {
  it('tienen mensaje en castellano', () => {
    expect(mensajeCodigoFacturacion('PRODUCTO_INACTIVO', { producto: 'TRANSPORTE' })).toContain('«TRANSPORTE» está dado de baja')
    expect(mensajeCodigoFacturacion('PERIODO_REQUERIDO')).toContain('período facturado')
    expect(mensajeCodigoFacturacion('ULTIMO_PRODUCTO_ACTIVO')).toContain('único producto activo')
    expect(mensajeCodigoFacturacion('PRODUCTO_DUPLICADO')).toContain('Ya hay un producto')
  })
})

describe('PDF con período facturado', async () => {
  const { armarFacturaDoc } = await import('@/modules/facturacion/utils/facturaPdf')
  const factura = {
    id: 9, ambiente: 'homo', pto_vta: 3, cbte_tipo: 1, numero: 5, numero_intentado: 5, estado: 'autorizada',
    concepto: 2, fecha_cbte: '2026-09-25', fch_vto_pago: '2026-09-25', cliente_id: 2,
    rec_razon_social: 'CLIENTE', rec_doc_tipo: 80, rec_doc_nro: '30502793175', rec_condicion_iva_id: 1,
    rec_domicilio: '', obra_cod: null, producto: 'Alquiler de equipos', producto_id: 3, centro_costo: null,
    fch_serv_desde: '2026-09-01', fch_serv_hasta: '2026-09-30',
    provincia_origen: 'Tucuman', provincia_destino: 'Tucuman', condicion_pago: 'Cc Clientes', remitos: '',
    observaciones: '', moneda: 'PES', cotizacion: 1, imp_neto: 100, imp_iva: 21, imp_trib: 0,
    imp_op_ex: 0, imp_tot_conc: 0, imp_total: 121, cae: '86380923473688', cae_vto: '2026-10-04',
    resultado: 'A', letra: 'A', tipo_nombre: 'Factura A', cod_cbte: '001', es_nc: false, numero_fmt: '00003-00000005',
    es_homologacion: true, nc_autorizadas: 0, saldo_nc: 121, asociada_id: null,
  }
  const fj = {
    factura,
    renglones: [{ id: 1, orden: 1, descripcion: 'Alquiler', cantidad: 1, unidad: 'Unidades', precio_unit: 100, alicuota_id: 5, tasa: 0.21, importe_neto: 100 }],
    alicuotas: [{ alicuota_id: 5, tasa: 0.21, base_imp: 100, importe: 21 }],
    asociados: [],
  }

  it('factura A: «Período: 01/09/2026 al 30/09/2026»', () => {
    const json = JSON.stringify(armarFacturaDoc(fj as unknown as VentasFacturaFJ, { logo: null }).content)
    expect(json).toContain('Período:')
    expect(json).toContain('01/09/2026 al 30/09/2026')
  })

  it('sin período no imprime la línea', () => {
    const sin = { ...fj, factura: { ...factura, fch_serv_desde: null, fch_serv_hasta: null } }
    const json = JSON.stringify(armarFacturaDoc(sin as unknown as VentasFacturaFJ, { logo: null }).content)
    expect(json).not.toContain('Período:')
  })
})
