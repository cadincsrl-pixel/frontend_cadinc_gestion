import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { TramoChofer, RelevoSugerencia } from '@/types/domain.types'
import { LOG_KEYS } from './useLogistica'

export function useTramoRelevo(tramoId: number | null) {
  return useQuery({
    queryKey: ['logistica', 'tramo-relevo', tramoId] as const,
    queryFn:  () => apiGet<TramoChofer[]>(`/api/logistica/tramos/${tramoId}/relevo`),
    enabled:  !!tramoId,
    staleTime: 30_000,
  })
}

export function useTramoRelevoSugerencia(tramoId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['logistica', 'tramo-relevo', tramoId, 'sugerencia'] as const,
    queryFn:  () => apiGet<RelevoSugerencia>(`/api/logistica/tramos/${tramoId}/relevo/sugerencia`),
    enabled:  !!tramoId && enabled,
    staleTime: 60_000,
  })
}

interface CrearInput {
  tramoId: number
  chofer_relevo_id: number
  km_chofer_1?: number
  km_chofer_2?: number
  jornales_chofer_1?: number
  jornales_chofer_2?: number
  obs?: string
}

export function useCrearRelevo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tramoId, ...dto }: CrearInput) =>
      apiPost<TramoChofer[]>(`/api/logistica/tramos/${tramoId}/relevo`, dto),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['logistica', 'tramo-relevo', vars.tramoId] })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

interface UpdateInput {
  tramoId: number
  km_chofer_1?: number
  km_chofer_2?: number
  jornales_chofer_1?: number
  jornales_chofer_2?: number
  obs?: string | null
}

export function useUpdateRelevo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tramoId, ...dto }: UpdateInput) =>
      apiPatch<TramoChofer[]>(`/api/logistica/tramos/${tramoId}/relevo`, dto),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['logistica', 'tramo-relevo', vars.tramoId] })
    },
  })
}

export function useDeleteRelevo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tramoId: number) =>
      apiDelete<{ success: boolean }>(`/api/logistica/tramos/${tramoId}/relevo`),
    onSuccess: (_d, tramoId) => {
      qc.invalidateQueries({ queryKey: ['logistica', 'tramo-relevo', tramoId] })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}
