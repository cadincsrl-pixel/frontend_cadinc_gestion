import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { SolicitudCompra } from '@/types/domain.types'

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
