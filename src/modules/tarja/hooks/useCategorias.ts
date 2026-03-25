import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { categoriasApi } from '@/lib/api/categorias.api'
import type { CreateCategoriaDto, UpdateCategoriaDto } from '@/types/domain.types'

export const CATEGORIAS_KEY = ['categorias'] as const

export function useCategorias() {
  return useQuery({
    queryKey: CATEGORIAS_KEY,
    queryFn: categoriasApi.getAll,
  })
}

export function useCreateCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateCategoriaDto) => categoriasApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIAS_KEY }),
  })
}

export function useUpdateCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateCategoriaDto }) =>
      categoriasApi.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIAS_KEY }),
  })
}

export function useDeleteCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => categoriasApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIAS_KEY }),
  })
}