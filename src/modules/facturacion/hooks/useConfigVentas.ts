// Ventas › Configuración (tanda 6). Por ahora: el catálogo de productos de
// venta (20260929b). Contra un backend que todavía no tiene el endpoint (404)
// o que no responde, los lectores caen a `PRODUCTOS` (la semilla, mismos ids),
// así el formulario de la factura se ve igual que antes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, HttpError } from '@/lib/api/client'
import type {
  ProductoVenta, ProductoVentaInput, PuntoVentaVenta, PuntoVentaVentaInput, VerificacionPuntoVenta,
} from '@/types/config.types'
import { PRODUCTOS } from '../utils/facturacion.utils'
import { FACTURACION_KEYS, invalidarFacturacion } from './useFacturacion'

const BASE = '/api/facturacion'

export const CONFIG_VENTAS_KEYS = {
  todo:      ['facturacion', 'config'] as const,
  productos: (incluirInactivos: boolean) => ['facturacion', 'config', 'productos', incluirInactivos] as const,
  puntosVenta: ['facturacion', 'config', 'puntos-venta'] as const,
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

// ── Puntos de venta (20260929d) ─────────────────────────────────────────────

export interface PuntosVentaRes {
  puntos:   PuntoVentaVenta[]
  /** true = el backend todavía no tiene el endpoint (404): se usa el del servidor, sin tabla. */
  respaldo: boolean
}

/** Los PV del ambiente del servidor (activos y dados de baja). */
export function usePuntosVenta() {
  const q = useQuery({
    queryKey: CONFIG_VENTAS_KEYS.puntosVenta,
    queryFn: async (): Promise<PuntosVentaRes> => {
      try {
        return { puntos: await apiGet<PuntoVentaVenta[]>(`${BASE}/puntos-venta`), respaldo: false }
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return { puntos: [], respaldo: true }
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  return { ...q, puntos: q.data?.puntos ?? [], respaldo: q.data?.respaldo ?? false }
}

function useInvalidarPuntosVenta() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: CONFIG_VENTAS_KEYS.puntosVenta })
    // El formulario de la factura y el indicador leen los PV activos de acá.
    void qc.invalidateQueries({ queryKey: FACTURACION_KEYS.arcaAmbiente })
    void qc.invalidateQueries({ queryKey: FACTURACION_KEYS.arcaEstado })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

/**
 * POST /puntos-venta: verifica contra ARCA. 422 si ARCA dice que no sirve;
 * 409 PV_NO_VERIFICADO si no se pudo preguntar (se reintenta con `forzar`).
 */
export function useCrearPuntoVenta() {
  const invalidar = useInvalidarPuntosVenta()
  return useMutation({
    mutationFn: (body: PuntoVentaVentaInput) => apiPost<PuntoVentaVenta>(`${BASE}/puntos-venta`, body),
    onSuccess: invalidar,
  })
}

/** PATCH /puntos-venta/:id: nombre, activo, por defecto, productos. El número no se edita. */
export function useEditarPuntoVenta() {
  const invalidar = useInvalidarPuntosVenta()
  return useMutation({
    mutationFn: ({ id, ...body }: PuntoVentaVentaInput & { id: number }) =>
      apiPatch<PuntoVentaVenta>(`${BASE}/puntos-venta/${id}`, body),
    onSuccess: invalidar,
  })
}

/** POST /puntos-venta/:id/verificar: vuelve a preguntarle a ARCA. */
export function useVerificarPuntoVenta() {
  const invalidar = useInvalidarPuntosVenta()
  return useMutation({
    mutationFn: (id: number) =>
      apiPost<{ punto_venta: PuntoVentaVenta; verificacion: VerificacionPuntoVenta }>(`${BASE}/puntos-venta/${id}/verificar`, {}),
    onSuccess: invalidar,
  })
}
