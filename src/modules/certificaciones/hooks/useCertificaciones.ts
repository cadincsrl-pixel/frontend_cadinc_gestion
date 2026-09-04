import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { CertAdicional } from '@/types/domain.types'

const CERT_KEYS = {
  adicionales: (obra?: string) => ['certificaciones', 'adicionales', obra ?? 'all'] as const,
}

// ── Adicionales ─────────────────────────────────────────────
export function useAdicionales(obra_cod?: string) {
  return useQuery({
    queryKey: CERT_KEYS.adicionales(obra_cod),
    queryFn:  () => apiGet<CertAdicional[]>(`/api/certificaciones/adicionales${obra_cod ? `?obra_cod=${obra_cod}` : ''}`),
  })
}

export function useCreateAdicional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<CertAdicional>('/api/certificaciones/adicionales', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificaciones', 'adicionales'] }),
  })
}

export function useUpdateAdicional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<CertAdicional>(`/api/certificaciones/adicionales/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificaciones', 'adicionales'] }),
  })
}

export function useDeleteAdicional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/certificaciones/adicionales/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificaciones', 'adicionales'] }),
  })
}
