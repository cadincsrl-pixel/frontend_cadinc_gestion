import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type { Tarifa } from '@/types/domain.types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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
    mutationFn: async (dto: {
      obra_cod: string
      cat_id: number
      vh: number
      desde?: string
    }) => {
      const headers = await getAuthHeader()
      const res = await fetch(`${API_URL}/api/tarifas`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(dto),
      })
      if (!res.ok) throw new Error(`PUT /api/tarifas → ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TARIFAS_KEY }),
  })
}

async function getAuthHeader(): Promise<HeadersInit> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}