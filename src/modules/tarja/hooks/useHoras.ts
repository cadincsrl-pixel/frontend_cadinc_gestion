import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { horasApi } from '@/lib/api/horas.api'
import type { UpsertHoraDto, UpsertHorasLoteDto } from '@/types/domain.types'

export const HORAS_KEY = ['horas'] as const

export function useHorasSemana(obraCod: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: [...HORAS_KEY, obraCod, desde, hasta],
    queryFn: () => horasApi.getBySemana(obraCod, desde, hasta),
    enabled: !!obraCod && !!desde && !!hasta,
  })
}

export function useUpsertHora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: UpsertHoraDto) => horasApi.upsert(dto),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...HORAS_KEY, vars.obra_cod] })
    },
  })
}

export function useUpsertHorasLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: UpsertHorasLoteDto) => horasApi.upsertLote(dto),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...HORAS_KEY, vars.obra_cod] })
    },
  })
}

export function useLimpiarSemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, desde, hasta }: { obraCod: string; desde: string; hasta: string }) =>
      horasApi.limpiarSemana(obraCod, desde, hasta),
    onSuccess: () => qc.invalidateQueries({ queryKey: HORAS_KEY }),
  })
}