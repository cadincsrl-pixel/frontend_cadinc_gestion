import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete }   from '@/lib/api/client'
import type { Remito }                             from '@/types/domain.types'

const KEY = ['remitos']

export function useRemitos() {
  return useQuery({
    queryKey: KEY,
    queryFn:  () => apiGet<Remito[]>('/api/remitos'),
  })
}

export function useCreateRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<Remito>('/api/remitos', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPatch<Remito>(`/api/remitos/${id}/emitir`, {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/remitos/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
