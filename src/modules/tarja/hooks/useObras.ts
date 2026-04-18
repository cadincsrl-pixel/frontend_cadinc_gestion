import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { obrasApi } from '@/lib/api/obras.api'
import type { CreateObraDto, UpdateObraDto } from '@/types/domain.types'

export const OBRAS_KEY = ['obras'] as const

export function useObras() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: OBRAS_KEY,
    queryFn: obrasApi.getAll,
  })

  // Auto-archivar obras sin horas en 3 semanas al montar
  useEffect(() => {
    obrasApi.autoArchivar().then(({ archivadas }) => {
      if (archivadas.length > 0) {
        qc.invalidateQueries({ queryKey: OBRAS_KEY })
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return query
}

export function useObrasArchivadas() {
  return useQuery({
    queryKey: [...OBRAS_KEY, 'archivadas'],
    queryFn: obrasApi.getArchivadas,
  })
}

export function useObra(cod: string) {
  return useQuery({
    queryKey: [...OBRAS_KEY, cod],
    queryFn: () => obrasApi.getByCod(cod),
    enabled: !!cod,
  })
}

export function useCreateObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateObraDto) => obrasApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useUpdateObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cod, dto }: { cod: string; dto: UpdateObraDto }) =>
      obrasApi.update(cod, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useArchivarObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cod: string) => obrasApi.archivar(cod),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useDeleteObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cod: string) => obrasApi.delete(cod),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}