import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from '@/lib/api/client'
import type { Tarifa } from '@/types/domain.types'

export const TARIFAS_KEY = ['tarifas'] as const

export function useTarifasObra(obraCod: string) {
  return useQuery({
    queryKey: [...TARIFAS_KEY, obraCod],
    queryFn:  () => apiGet<Tarifa[]>(`/api/tarifas/${encodeURIComponent(obraCod)}`),
    enabled:  !!obraCod,
  })
}

export function useUpsertTarifa() {
  const qc = useQueryClient()
  return useMutation({
    // vh null = "volver al global" desde `desde`.
    mutationFn: (dto: { obra_cod: string; cat_id: number; vh: number | null; desde?: string; confirmar_historico?: boolean }) =>
      apiPut<Tarifa>('/api/tarifas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: TARIFAS_KEY }),
  })
}