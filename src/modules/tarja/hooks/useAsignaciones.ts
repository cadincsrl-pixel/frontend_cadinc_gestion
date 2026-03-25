import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import type { Personal } from '@/types/domain.types'

export const ASIG_KEY = ['asignaciones'] as const

export function usePersonalObra(obraCod: string) {
  return useQuery({
    queryKey: [...ASIG_KEY, obraCod],
    queryFn: async () => {
      const asig = await apiGet<Array<{ leg: string }>>(`/api/asignaciones/${obraCod}`)
      if (!asig.length) return []
      const personal = await apiGet<Personal[]>('/api/personal')
      return personal.filter(p => asig.some(a => a.leg === p.leg))
    },
    enabled: !!obraCod,
  })
}

export function useAsignarPersonal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obra_cod, leg }: { obra_cod: string; leg: string }) =>
      apiPost('/api/asignaciones', { obra_cod, leg }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASIG_KEY }),
  })
}

export function useDesasignarPersonal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, leg }: { obraCod: string; leg: string }) =>
      apiDelete(`/api/asignaciones/${obraCod}/${leg}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASIG_KEY }),
  })
}