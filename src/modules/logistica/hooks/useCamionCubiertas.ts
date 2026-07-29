import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { CamionCubiertas } from '@/types/domain.types'

export const CAMION_CUBIERTAS_KEY = ['camion-cubiertas'] as const

const historialKey = (camionId: number | null) =>
  [...CAMION_CUBIERTAS_KEY, 'historial', camionId] as const

/** Histórico de cambios de cubiertas de un camión, del más reciente al más viejo. */
export function useCamionCubiertas(camionId: number | null) {
  return useQuery({
    queryKey: historialKey(camionId),
    queryFn:  () => apiGet<CamionCubiertas[]>(
      `/api/logistica/camion-cubiertas?camion_id=${camionId}`,
    ),
    enabled:  !!camionId,
    staleTime: 60_000,
  })
}

export function useCreateCamionCubiertas(camionId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { camion_id: number; fecha?: string; km_camion: number; cantidad: number; obs?: string | null }) =>
      apiPost<CamionCubiertas>('/api/logistica/camion-cubiertas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: historialKey(camionId) }),
  })
}

export function useUpdateCamionCubiertas(camionId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { fecha?: string; km_camion?: number; cantidad?: number; obs?: string | null } }) =>
      apiPatch<CamionCubiertas>(`/api/logistica/camion-cubiertas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: historialKey(camionId) }),
  })
}

export function useDeleteCamionCubiertas(camionId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/camion-cubiertas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: historialKey(camionId) }),
  })
}
