import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { Remito } from '@/types/domain.types'

const KEY = ['remitos']

interface CreateRemitoDto {
  numero:   string
  fecha:    string
  origen:   string
  destino:  string
  obs?:     string | null
  items:    { descripcion: string; cantidad: number; unidad: string; obs?: string | null }[]
}

export function useRemitos() {
  return useQuery({
    queryKey: KEY,
    queryFn:  () => apiGet<Remito[]>('/api/herramientas/remitos'),
  })
}

export function useCreateRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateRemitoDto) =>
      apiPost<Remito>('/api/herramientas/remitos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiPatch<Remito>(`/api/herramientas/remitos/${id}/emitir`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ success: boolean }>(`/api/herramientas/remitos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
