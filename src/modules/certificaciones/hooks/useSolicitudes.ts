import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { SolicitudCompra, ItemEvento } from '@/types/domain.types'

const KEYS = {
  list: (obra?: string) => ['solicitudes', obra ?? 'all'] as const,
}

// Resolver un ítem (comprar/despachar/revertir/deshacer-envío) no solo cambia
// la solicitud: el despacho descuenta stock, y comprar/despachar/retirar
// escriben en materiales_a_cuenta_cliente (la cuenta del cliente). Sin estas
// invalidaciones, StockTab y CuentaClienteTab quedaban stale hasta un refetch
// manual. Se invalidan siempre (barato) porque desde el hook no sabemos el
// camino de resolución exacto del ítem.
function invalidarResolucionItem(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['solicitudes'] })
  qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
  qc.invalidateQueries({ queryKey: ['stock', 'movimientos'] })
  qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
  qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
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
    onSuccess: () => invalidarResolucionItem(qc),
  })
}

export function useDespacharItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: number; dto: any }) =>
      apiPost(`/api/solicitudes/items/${itemId}/despachar`, dto),
    onSuccess: () => invalidarResolucionItem(qc),
  })
}

export function useEnviarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, fecha_envio }: { itemId: number; fecha_envio?: string }) =>
      apiPost(`/api/solicitudes/items/${itemId}/enviar`, { fecha_envio }),
    // Enviar a una obra depósito ingresa stock (compra recibida) → refrescar stock también.
    onSuccess: () => invalidarResolucionItem(qc),
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
    // Revertir repone stock (si era despacho) y borra la fila MCC del ítem.
    onSuccess: () => invalidarResolucionItem(qc),
  })
}

// Deshace solo el envío: el item vuelve a comprado/de_deposito (no a
// pendiente). Mantiene la compra. Borra/limpia el remito asociado.
export function useRevertirEnvio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) =>
      apiPost(`/api/solicitudes/items/${itemId}/revertir-envio`, {}),
    // Deshacer un envío a depósito revierte el ingreso de stock → refrescar stock.
    onSuccess: () => invalidarResolucionItem(qc),
  })
}

export function useEditarItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: number; dto: any }) =>
      apiPatch(`/api/solicitudes/items/${itemId}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes'] })
      // Editar precio/proveedor de un ítem recalcula su fila en la cuenta del
      // cliente (MCC) → refrescar esas vistas también.
      qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
    },
  })
}
