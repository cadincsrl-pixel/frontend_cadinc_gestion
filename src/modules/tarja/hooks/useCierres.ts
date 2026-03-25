import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import type { Cierre } from '@/types/domain.types'

export const CIERRES_KEY = ['cierres'] as const

export function useCierresObra(obraCod: string) {
  return useQuery({
    queryKey: [...CIERRES_KEY, obraCod],
    queryFn: () => apiGet<Cierre[]>(`/api/cierres/${obraCod}`),
    enabled: !!obraCod,
  })
}

export function useCreateCierre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { obra_cod: string; sem_key: string }) =>
      apiPost<Cierre>('/api/cierres', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CIERRES_KEY }),
  })
}

export function useUpdateCierre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      obraCod,
      semKey,
      estado,
    }: {
      obraCod: string
      semKey: string
      estado: 'pendiente' | 'cerrado'
    }) => apiPatch<Cierre>(`/api/cierres/${obraCod}/${semKey}`, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CIERRES_KEY }),
  })
}