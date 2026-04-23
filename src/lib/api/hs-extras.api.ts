import { apiDelete, apiGet, apiPut } from './client'
import type { TarjaHsExtra, UpsertHsExtraDto, UpsertHsExtrasLoteDto } from '@/types/domain.types'

export const hsExtrasApi = {
  getByObra: (obraCod: string, desde?: string, hasta?: string) => {
    const qs: string[] = []
    if (desde) qs.push(`desde=${desde}`)
    if (hasta) qs.push(`hasta=${hasta}`)
    const suffix = qs.length ? `?${qs.join('&')}` : ''
    return apiGet<TarjaHsExtra[]>(`/api/hs-extras/${encodeURIComponent(obraCod)}${suffix}`)
  },

  getAll: () => apiGet<TarjaHsExtra[]>('/api/hs-extras/all'),

  upsert: (dto: UpsertHsExtraDto) =>
    apiPut<TarjaHsExtra | { deleted: true }>('/api/hs-extras', dto),

  upsertLote: (dto: UpsertHsExtrasLoteDto) =>
    apiPut<TarjaHsExtra[]>('/api/hs-extras/lote', dto),

  delete: (id: number) => apiDelete<{ ok: true }>(`/api/hs-extras/${id}`),
}
