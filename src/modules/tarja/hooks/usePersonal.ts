import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { personalApi } from '@/lib/api/personal.api'
import type { CreatePersonalDto, UpdatePersonalDto } from '@/types/domain.types'

export const PERSONAL_KEY = ['personal'] as const

export function usePersonal() {
  return useQuery({
    queryKey: PERSONAL_KEY,
    queryFn: personalApi.getAll,
  })
}

export function useCreatePersonal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreatePersonalDto) => personalApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_KEY }),
  })
}

export function useUpdatePersonal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leg, dto }: { leg: string; dto: UpdatePersonalDto }) =>
      personalApi.update(leg, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_KEY }),
  })
}

export function useDeletePersonal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leg: string) => personalApi.delete(leg),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_KEY }),
  })
}