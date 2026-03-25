import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { Contratista, Certificacion } from '@/types/domain.types'

export const CONTRAT_KEY = ['contratistas'] as const

export function useContratistas() {
  return useQuery({
    queryKey: CONTRAT_KEY,
    queryFn:  () => apiGet<Contratista[]>('/api/contratistas'),
  })
}

export function useContratistasObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'asig', obraCod],
    queryFn:  () => apiGet<Array<{ contrat_id: number; contratistas: Contratista }>>(`/api/contratistas/asig/${obraCod}`),
    enabled:  !!obraCod,
  })
}

export function useCertificacionesObra(obraCod: string) {
  return useQuery({
    queryKey: [...CONTRAT_KEY, 'cert', obraCod],
    queryFn:  () => apiGet<Certificacion[]>(`/api/contratistas/cert/${obraCod}`),
    enabled:  !!obraCod,
  })
}

export function useCreateContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Contratista, 'id'>) =>
      apiPost<Contratista>('/api/contratistas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useUpdateContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Contratista> }) =>
      apiPatch<Contratista>(`/api/contratistas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useAsignarContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { obra_cod: string; contrat_id: number }) =>
      apiPost('/api/contratistas/asig', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDesasignarContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, contratId }: { obraCod: string; contratId: number }) =>
      apiDelete(`/api/contratistas/asig/${obraCod}/${contratId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useUpsertCertificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: {
      obra_cod: string
      contrat_id: number
      sem_key: string
      monto: number
      desc?: string
      estado?: 'pendiente' | 'cerrado'
    }) => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = session
        ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
        : {}
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const res = await fetch(`${API_URL}/api/contratistas/cert`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(dto),
      })
      if (!res.ok) throw new Error(`PUT /api/contratistas/cert → ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}

export function useDeleteContratista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/contratistas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRAT_KEY }),
  })
}
