import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { SolicitudCompra, ItemEvento } from '@/types/domain.types'

const KEYS = {
  list: (obra?: string) => ['solicitudes', obra ?? 'all'] as const,
}

export function useSolicitudes(obra_cod?: string) {
  return useQuery({
    queryKey: KEYS.list(obra_cod),
    queryFn: () =>
      apiGet<SolicitudCompra[]>(
        `/api/solicitudes${obra_cod ? `?obra_cod=${obra_cod}` : ''}`
      ),
  })
}

// Historial de transiciones de un ítem (timeline). La queryKey arranca con
// 'solicitudes', así que las mutaciones de items (que invalidan ['solicitudes'])
// ya refrescan estos eventos sin tocar nada acá.
export function useItemEventos(itemId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['solicitudes', 'items', itemId, 'eventos'] as const,
    queryFn: () => apiGet<ItemEvento[]>(`/api/solicitudes/items/${itemId}/eventos`),
    enabled: !!itemId && enabled,
    staleTime: 30_000,
  })
}

export function useCreateSolicitud() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) =>
      apiPost<SolicitudCompra>('/api/solicitudes', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useUpdateSolicitud() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<SolicitudCompra>(`/api/solicitudes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useDeleteSolicitud() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/solicitudes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

// ── Acciones sobre ítems ──

export function useComprarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: number; dto: any }) =>
      apiPost(`/api/solicitudes/items/${itemId}/comprar`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useDespacharItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: number; dto: any }) =>
      apiPost(`/api/solicitudes/items/${itemId}/despachar`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useEnviarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, fecha_envio }: { itemId: number; fecha_envio?: string }) =>
      apiPost(`/api/solicitudes/items/${itemId}/enviar`, { fecha_envio }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useRechazarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) =>
      apiPost(`/api/solicitudes/items/${itemId}/rechazar`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useRevertirItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) =>
      apiPost(`/api/solicitudes/items/${itemId}/revertir`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

// Deshace solo el envío: el item vuelve a comprado/de_deposito (no a
// pendiente). Mantiene la compra. Borra/limpia el remito asociado.
export function useRevertirEnvio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) =>
      apiPost(`/api/solicitudes/items/${itemId}/revertir-envio`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}

export function useEditarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: number; dto: any }) =>
      apiPatch(`/api/solicitudes/items/${itemId}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  })
}
