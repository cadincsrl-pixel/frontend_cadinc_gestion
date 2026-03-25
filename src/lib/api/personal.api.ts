import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Personal, CreatePersonalDto, UpdatePersonalDto } from '@/types/domain.types'

export const personalApi = {
  getAll: () =>
    apiGet<Personal[]>('/api/personal'),

  getByLeg: (leg: string) =>
    apiGet<Personal>(`/api/personal/${leg}`),

  create: (dto: CreatePersonalDto) =>
    apiPost<Personal>('/api/personal', dto),

  update: (leg: string, dto: UpdatePersonalDto) =>
    apiPatch<Personal>(`/api/personal/${leg}`, dto),

  delete: (leg: string) =>
    apiDelete<{ success: boolean }>(`/api/personal/${leg}`),
}