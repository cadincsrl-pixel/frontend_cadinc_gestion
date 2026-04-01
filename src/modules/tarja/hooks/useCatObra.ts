import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from '@/lib/api/client'

export const CAT_OBRA_KEY = ['cat-obra'] as const

interface CatObraRecord {
  id: number
  obra_cod: string
  leg: string
  cat_id: number
  desde: string
}

// Trae las categorías por obra+semana
export function useCatObraSemana(obraCod: string, semKey: string) {
  return useQuery({
    queryKey: [...CAT_OBRA_KEY, obraCod, semKey],
    queryFn: () => apiGet<CatObraRecord[]>(`/api/cat-obra/${encodeURIComponent(obraCod)}?sem_key=${semKey}`),
    enabled: !!obraCod && !!semKey,
  })
}

// Cambiar la categoría de un trabajador en una obra+semana
export function useSetCatObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { obra_cod: string; leg: string; cat_id: number; desde: string }) =>
      apiPut('/api/cat-obra', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAT_OBRA_KEY })
    },
  })
}