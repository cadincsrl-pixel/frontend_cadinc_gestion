import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Obra, CreateObraDto, UpdateObraDto } from '@/types/domain.types'

export const obrasApi = {
  getAll: () =>
    apiGet<Obra[]>('/api/obras'),

  getArchivadas: () =>
    apiGet<Obra[]>('/api/obras/archivadas'),

  getByCod: (cod: string) =>
    apiGet<Obra>(`/api/obras/${encodeURIComponent(cod)}`),

  create: (dto: CreateObraDto) =>
    apiPost<Obra>('/api/obras', dto),

  update: (cod: string, dto: UpdateObraDto) =>
    apiPatch<Obra>(`/api/obras/${encodeURIComponent(cod)}`, dto),

  archivar: (cod: string) =>
    apiPatch<Obra>(`/api/obras/${encodeURIComponent(cod)}/archivar`, {}),

  delete: (cod: string) =>
    apiDelete<{ success: boolean }>(`/api/obras/${encodeURIComponent(cod)}`),

  autoArchivar: () =>
    apiPost<{ archivadas: string[] }>('/api/obras/auto-archivar', {}),
}