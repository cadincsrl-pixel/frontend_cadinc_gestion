// Ventas › Configuración (tanda 6). Por ahora: el catálogo de productos de
// venta (20260929b). Contra un backend que todavía no tiene el endpoint (404)
// o que no responde, los lectores caen a `PRODUCTOS` (la semilla, mismos ids),
// así el formulario de la factura se ve igual que antes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, HttpError } from '@/lib/api/client'
import type { ProductoVenta, ProductoVentaInput } from '@/types/config.types'
import { PRODUCTOS } from '../utils/facturacion.utils'
import { invalidarFacturacion } from './useFacturacion'

const BASE = '/api/facturacion'

export const CONFIG_VENTAS_KEYS = {
  todo:      ['facturacion', 'config'] as const,
  productos: (incluirInactivos: boolean) => ['facturacion', 'config', 'productos', incluirInactivos] as const,
}

export interface ProductosVentaRes {
  productos: ProductoVenta[]
  /** true = el backend no tiene el catálogo (404) y se muestra la semilla. */
  respaldo:  boolean
}

/**
 * Productos de venta. Sin `incluirInactivos`, solo los activos (lo que ofrece
 * el formulario). `staleTime` de 5 min: cambia poco y se invalida al guardar.
 */
export function useProductosVenta(incluirInactivos = false) {
  const q = useQuery({
    queryKey: CONFIG_VENTAS_KEYS.productos(incluirInactivos),
    queryFn: async (): Promise<ProductosVentaRes> => {
      try {
        const qs = incluirInactivos ? '?incluir_inactivos=1' : ''
        return { productos: await apiGet<ProductoVenta[]>(`${BASE}/productos${qs}`), respaldo: false }
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return { productos: PRODUCTOS, respaldo: true }
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  // Si falla por otra cosa, el formulario igual necesita algo que ofrecer.
  const productos = q.data?.productos ?? (q.isError ? PRODUCTOS : [])
  return { ...q, productos, respaldo: q.data?.respaldo ?? q.isError }
}

function useInvalidarProductos() {
  const qc = useQueryClient()
  return () => {
    // El prefijo del módulo cubre catálogo, bandeja y filtros; los mapeos de
    // Contabilidad listan los productos (etiqueta y «sin mapeo»).
    void invalidarFacturacion(qc)
    void qc.invalidateQueries({ queryKey: ['contabilidad', 'mapeos'] })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

/** POST /productos (tab configuracion + flag configurar). */
export function useCrearProductoVenta() {
  const invalidar = useInvalidarProductos()
  return useMutation({
    mutationFn: (body: ProductoVentaInput) => apiPost<ProductoVenta>(`${BASE}/productos`, body),
    onSuccess: invalidar,
  })
}

/** PATCH /productos/:id: parcial, incluye `activo` para dar de baja o reactivar. */
export function useEditarProductoVenta() {
  const invalidar = useInvalidarProductos()
  return useMutation({
    mutationFn: ({ id, ...body }: ProductoVentaInput & { id: number }) =>
      apiPatch<ProductoVenta>(`${BASE}/productos/${id}`, body),
    onSuccess: invalidar,
  })
}
