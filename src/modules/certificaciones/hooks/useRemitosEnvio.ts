import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'
import type { RemitoEnvio } from '@/types/domain.types'

export function useRemitosEnvio(obra_cod?: string) {
  return useQuery({
    queryKey: ['remitos-envio', obra_cod ?? 'all'],
    queryFn: () => apiGet<RemitoEnvio[]>(`/api/remitos-envio${obra_cod ? `?obra_cod=${obra_cod}` : ''}`),
  })
}

export function useCreateRemitoEnvio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<RemitoEnvio>('/api/remitos-envio', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remitos-envio'] })
      qc.invalidateQueries({ queryKey: ['solicitudes'] })
    },
  })
}
