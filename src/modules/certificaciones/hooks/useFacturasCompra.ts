import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import type { FacturaCompra } from '@/types/domain.types'

export function useFacturasCompra(proveedor_id?: number) {
  return useQuery({
    queryKey: ['facturas-compra', proveedor_id ?? 'all'],
    queryFn: () =>
      apiGet<FacturaCompra[]>(
        `/api/facturas-compra${proveedor_id ? `?proveedor_id=${proveedor_id}` : ''}`
      ),
  })
}

export function useCreateFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<FacturaCompra>('/api/facturas-compra', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturas-compra'] }),
  })
}

export function useUpdateFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<FacturaCompra>(`/api/facturas-compra/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturas-compra'] }),
  })
}
