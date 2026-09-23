// Padrón de clientes de Facturación (`ventas_clientes`).
//
// Es PROPIO del módulo: no es el de Áridos ni el de Pagos, y no se sincroniza
// con ninguno. Lo único que cruza es `obras.cliente_id`, que se setea con
// PUT /clientes/:id/obras para precargar el cliente al facturar una obra.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client'
import type { VentasCliente, VentasClienteInput } from '@/types/domain.types'
import { FACTURACION_KEYS, invalidarFacturacion } from './useFacturacion'

const BASE = '/api/facturacion/clientes'

export function useClientesVenta(q = '', incluirInactivos = false, enabled = true) {
  const p = new URLSearchParams()
  if (q.trim()) p.set('q', q.trim())
  p.set('incluir_inactivos', incluirInactivos ? '1' : '0')
  const qs = p.toString()
  return useQuery({
    queryKey: [...FACTURACION_KEYS.clientes, 'lista', qs],
    queryFn:  () => apiGet<VentasCliente[]>(`${BASE}?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

export function useCrearClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasClienteInput) => apiPost<VentasCliente>(BASE, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useEditarClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<VentasClienteInput> & { id: number }) =>
      apiPatch<VentasCliente>(`${BASE}/${id}`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useBajaClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPost<VentasCliente>(`${BASE}/${id}/${activo ? 'alta' : 'baja'}`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Reemplaza la lista: las obras que no vienen quedan sin cliente. */
export function useAsignarObrasCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, obra_cods }: { id: number; obra_cods: string[] }) =>
      apiPut<VentasCliente>(`${BASE}/${id}/obras`, { obra_cods }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}
