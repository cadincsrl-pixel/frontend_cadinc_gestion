// Padrón de proveedores del módulo Pagos (`pagos_proveedores`).
//
// NO es el padrón de Compras (`public.proveedores`): son dos tablas distintas
// a propósito (decisión del dueño). Acá el CUIT lleva dígito verificador, el
// CBU los dos suyos y el dedup es global (un proveedor dado de baja no se
// duplica, se reactiva). CBU y alias son PII: sin `ver_pii` el backend los
// manda como `***1234` y el front los muestra tal cual los recibe.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type {
  CrearProveedorInput, EditarProveedorInput, PagosDatosPagoInput, PagosProveedor,
  PagosProveedorDetalle, PagosProveedorSaldo, PagosProveedoresPage, ProveedorRes,
} from '@/types/domain.types'
import { PAGOS_KEYS, invalidarPagos } from './usePagos'

export interface PagosProveedoresFiltro {
  q?:              string
  /** Incluir los dados de baja (por default solo activos). */
  inactivos?:      boolean
  sin_cuit?:       boolean
  sin_datos_pago?: boolean
}

function qsProveedores(f: PagosProveedoresFiltro, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f.q?.trim())       p.set('q', f.q.trim())
  if (f.inactivos)       p.set('inactivos', '1')
  if (f.sin_cuit)        p.set('sin_cuit', '1')
  if (f.sin_datos_pago)  p.set('sin_datos_pago', '1')
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

export function useProveedoresPagos(f: PagosProveedoresFiltro, page = 1, pageSize = 100, enabled = true) {
  const qs = qsProveedores(f, { limit: pageSize, offset: (page - 1) * pageSize })
  return useQuery({
    queryKey: [...PAGOS_KEYS.proveedores, 'lista', qs],
    queryFn:  () => apiGet<PagosProveedoresPage>(`/api/pagos/proveedores?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

/** Ficha + historial de cambios de CBU/alias + facturas abiertas. */
export function useProveedorPagos(id: number | null) {
  return useQuery({
    queryKey: PAGOS_KEYS.proveedor(id ?? 0),
    queryFn:  () => apiGet<PagosProveedorDetalle>(`/api/pagos/proveedores/${id}`),
    enabled:  !!id,
    staleTime: 60_000,
  })
}

/** «Deuda por proveedor»: activos e inactivos con saldo, ordenado por vencido. */
export function useSaldosProveedores(enabled = true) {
  return useQuery({
    queryKey: PAGOS_KEYS.saldos,
    queryFn:  () => apiGet<PagosProveedorSaldo[]>('/api/pagos/proveedores/saldos'),
    staleTime: 30_000,
    enabled,
  })
}

export function fetchProveedoresExport(): Promise<PagosProveedor[]> {
  return apiGet<PagosProveedor[]>('/api/pagos/proveedores/export')
}

/**
 * Alta (tab Proveedores o «alta rápida» desde el modal de factura). Los
 * parecidos por razón social vuelven en `avisos` y NO bloquean; `forzar`
 * saltea esa búsqueda. El duro es el 409 `PROVEEDOR_DUPLICADO` por CUIT, CBU
 * o alias, que trae el id del existente para ofrecer «Usar este» o «Reactivar».
 */
export function useCrearProveedorPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ forzar, ...body }: CrearProveedorInput & { forzar?: boolean }) =>
      apiPost<ProveedorRes>(`/api/pagos/proveedores${forzar ? '?forzar=1' : ''}`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/**
 * Editar la ficha entera (compras). Cambiar `cbu`/`alias_cbu` devuelve a
 * `pendiente` las facturas aprobadas sin pagar del proveedor: los ids vuelven
 * en `avisos: [{ code: 'APROBACION_RETIRADA', factura_ids }]`.
 */
export function useEditarProveedorPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: EditarProveedorInput & { id: number }) =>
      apiPatch<ProveedorRes>(`/api/pagos/proveedores/${id}`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** La puerta del contador (`registrar_pagos` + `ver_pii`): datos de pago y nada más. */
export function useDatosPagoProveedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: PagosDatosPagoInput & { id: number }) =>
      apiPatch<ProveedorRes>(`/api/pagos/proveedores/${id}/datos-pago`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Rebota con 409 `PROVEEDOR_CON_SALDO` si todavía se le debe algo. */
export function useBajaProveedorPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<{ success: boolean; id: number; activo: boolean }>(`/api/pagos/proveedores/${id}/baja`, { motivo }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

export function useReactivarProveedorPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiPost<{ success: boolean; id: number; activo: boolean }>(`/api/pagos/proveedores/${id}/reactivar`, {}),
    onSuccess:  () => invalidarPagos(qc),
  })
}
