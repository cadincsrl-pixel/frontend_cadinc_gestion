'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { FlotaVehiculo } from '@/types/domain.types'

export const FLOTA_KEY = ['flota', 'vehiculos'] as const

export function useFlotaVehiculos() {
  return useQuery({
    queryKey: FLOTA_KEY,
    queryFn:  () => apiGet<FlotaVehiculo[]>('/api/flota/vehiculos'),
  })
}

export function useCreateFlotaVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<FlotaVehiculo>) => apiPost<FlotaVehiculo>('/api/flota/vehiculos', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: FLOTA_KEY }),
  })
}

export function useUpdateFlotaVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<FlotaVehiculo> }) =>
      apiPatch<FlotaVehiculo>(`/api/flota/vehiculos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: FLOTA_KEY }),
  })
}

export function useDeleteFlotaVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/flota/vehiculos/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: FLOTA_KEY }),
  })
}
