// Puntos de venta (tanda 6, 20260929d): qué PV propone la factura y los
// mensajes de los errores nuevos.
import { describe, it, expect } from 'vitest'
import { sugerirPuntoVenta } from '@/modules/facturacion/utils/facturacion.utils'
import { mensajeCodigoFacturacion } from '@/modules/facturacion/utils/facturacion.errores'

const PV4 = { numero: 4, por_defecto: true, producto_ids: [] }
const PV5 = { numero: 5, por_defecto: false, producto_ids: [2] }

describe('sugerirPuntoVenta', () => {
  it('con uno solo (o ninguno) no propone nada: decide el backend y no hay selector', () => {
    expect(sugerirPuntoVenta([], {})).toBeNull()
    expect(sugerirPuntoVenta([PV4], { productoId: 2 })).toBeNull()
  })

  it('el del producto; si no, el por defecto', () => {
    expect(sugerirPuntoVenta([PV4, PV5], { productoId: 2 })).toBe(5)
    expect(sugerirPuntoVenta([PV4, PV5], { productoId: 1 })).toBe(4)
    expect(sugerirPuntoVenta([PV4, PV5], {})).toBe(4)
  })

  it('el borrador conserva el suyo y la NC va al de la factura, si siguen activos', () => {
    expect(sugerirPuntoVenta([PV4, PV5], { original: 5, productoId: 1 })).toBe(5)
    expect(sugerirPuntoVenta([PV4, PV5], { asociada: 5, productoId: 1 })).toBe(5)
    expect(sugerirPuntoVenta([PV4, PV5], { original: 9, productoId: 2 })).toBe(5)
  })

  it('sin por defecto entre los activos, el primero', () => {
    expect(sugerirPuntoVenta([{ ...PV4, por_defecto: false }, PV5], {})).toBe(4)
  })
})

describe('errores de puntos de venta', () => {
  it('PTO_VTA_NO_HABILITADO muestra el número con ceros', () => {
    expect(mensajeCodigoFacturacion('PTO_VTA_NO_HABILITADO', { pto_vta: 5 })).toContain('00005')
  })
  it('PV_NO_EXISTE_EN_ARCA lista los que tiene ARCA', () => {
    expect(mensajeCodigoFacturacion('PV_NO_EXISTE_EN_ARCA', { disponibles: [4, 6] })).toContain('4, 6')
  })
  it('PV_NO_VERIFICADO trae el motivo', () => {
    expect(mensajeCodigoFacturacion('PV_NO_VERIFICADO', { motivo: 'timeout' })).toContain('timeout')
  })
})
