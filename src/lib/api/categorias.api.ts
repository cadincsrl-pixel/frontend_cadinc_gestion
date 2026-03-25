import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Categoria, CreateCategoriaDto, UpdateCategoriaDto } from '@/types/domain.types'

export const categoriasApi = {
  getAll: () =>
    apiGet<Categoria[]>('/api/categorias'),

  create: (dto: CreateCategoriaDto) =>
    apiPost<Categoria>('/api/categorias', dto),

  update: (id: number, dto: UpdateCategoriaDto) =>
    apiPatch<Categoria>(`/api/categorias/${id}`, dto),

  delete: (id: number) =>
    apiDelete<{ success: boolean }>(`/api/categorias/${id}`),
}