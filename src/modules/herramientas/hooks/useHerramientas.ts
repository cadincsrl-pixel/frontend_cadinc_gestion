import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete }   from '@/lib/api/client'
import type {
  Herramienta, HerrConfig, HerrStats,
  HerrMovimiento,
} from '@/types/domain.types'

const KEY = ['herramientas']

export function useHerrConfig() {
  return useQuery({
    queryKey: ['herr-config'],
    queryFn:  () => apiGet<HerrConfig>('/api/herramientas/config'),
    staleTime: 0,
    gcTime:    0,
  })
}

export function useHerrStats() {
  return useQuery({
    queryKey: ['herr-stats'],
    queryFn:  () => apiGet<HerrStats>('/api/herramientas/stats'),
    enabled:  true,
  })
}

export function useHerramientas() {
  return useQuery({
    queryKey: KEY,
    queryFn:  () => apiGet<Herramienta[]>('/api/herramientas'),
    enabled:  true,
  })
}

export function useHerramienta(id: number) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn:  () => apiGet<Herramienta>(`/api/herramientas/${id}`),
    enabled:  !!id,
  })
}

export function useHerrMovimientos(herramientaId: number) {
  return useQuery({
    queryKey: ['herr-movimientos', herramientaId],
    queryFn:  () => apiGet<HerrMovimiento[]>(`/api/herramientas/${herramientaId}/movimientos`),
    enabled:  !!herramientaId,
  })
}

export function useHerrMovimientosAll() {
  return useQuery({
    queryKey: ['herr-movimientos', 'all'],
    queryFn:  () => apiGet<HerrMovimiento[]>('/api/herramientas/movimientos/all'),
  })
}

export function useCreateHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost('/api/herramientas', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
    },
  })
}

export function useUpdateHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch(`/api/herramientas/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useDeleteHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/herramientas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
    },
  })
}

export function useRegistrarMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost('/api/herramientas/movimientos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
      qc.invalidateQueries({ queryKey: ['herr-movimientos'] })
    },
  })
}