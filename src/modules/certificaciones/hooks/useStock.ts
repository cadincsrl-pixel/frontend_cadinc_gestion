import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { StockRubro, StockMaterial, StockMovimiento } from '@/types/domain.types'

// ── Rubros ──
export function useStockRubros() {
  return useQuery({
    queryKey: ['stock', 'rubros'],
    queryFn: () => apiGet<StockRubro[]>('/api/stock/rubros'),
  })
}

export function useCreateRubro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockRubro>('/api/stock/rubros', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'rubros'] }),
  })
}

// ── Materiales ──
export function useStockMateriales(rubro_id?: number) {
  return useQuery({
    queryKey: ['stock', 'materiales', rubro_id ?? 'all'],
    queryFn: () =>
      apiGet<StockMaterial[]>(
        `/api/stock/materiales${rubro_id ? `?rubro_id=${rubro_id}` : ''}`
      ),
  })
}

export function useCreateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockMaterial>('/api/stock/materiales', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

export function useUpdateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<StockMaterial>(`/api/stock/materiales/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

export function useDeleteStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/stock/materiales/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

// ── Movimientos ──
export function useStockMovimientos(material_id?: number) {
  return useQuery({
    queryKey: ['stock', 'movimientos', material_id ?? 'all'],
    queryFn: () =>
      apiGet<StockMovimiento[]>(
        `/api/stock/movimientos${material_id ? `?material_id=${material_id}` : ''}`
      ),
  })
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockMovimiento>('/api/stock/movimientos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', 'movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}
