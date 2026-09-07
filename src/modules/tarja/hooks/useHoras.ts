import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { horasApi } from '@/lib/api/horas.api'
import { apiGet } from '@/lib/api/client'
import type { UpsertHoraDto, UpsertHorasLoteDto, ResumenObra } from '@/types/domain.types'

export const HORAS_KEY = ['horas'] as const

export function useHorasSemana(obraCod: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: [...HORAS_KEY, obraCod, desde, hasta],
    queryFn: () => horasApi.getBySemana(obraCod, desde, hasta),
    enabled: !!obraCod && !!desde && !!hasta,
  })
}

/** Todas las horas de una obra (historial completo; el backend pagina). */
export function useHorasObra(obraCod: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...HORAS_KEY, obraCod, 'all'],
    queryFn: () => horasApi.getByObra(obraCod),
    enabled: (opts.enabled ?? true) && !!obraCod,
  })
}

/**
 * Una fila por obra: horas y trabajadores de la semana `semana` (viernes) más
 * totales históricos y última carga (RPC obras_actividad). Reemplaza bajar
 * toda la tabla de horas en el resumen de obras.
 */
export function useResumenObras(semana: string) {
  return useQuery({
    queryKey: [...HORAS_KEY, 'resumen-obras', semana],
    queryFn: () => apiGet<ResumenObra[]>(`/api/horas/resumen-obras?semana=${semana}`),
    enabled: !!semana,
  })
}

export function useHorasTrabajador(leg: string | undefined) {
  return useQuery({
    queryKey: [...HORAS_KEY, 'trabajador', leg],
    queryFn: () => horasApi.getByTrabajador(leg!),
    enabled: !!leg,
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