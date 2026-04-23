import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hsExtrasApi } from '@/lib/api/hs-extras.api'
import type { TarjaHsExtra, UpsertHsExtraDto, UpsertHsExtrasLoteDto } from '@/types/domain.types'
import { useToast } from '@/components/ui/Toast'

export const HS_EXTRAS_KEY = ['hs-extras'] as const

export function useHsExtras(obraCod: string, desde?: string, hasta?: string) {
  return useQuery({
    queryKey: [...HS_EXTRAS_KEY, obraCod, desde ?? '', hasta ?? ''],
    queryFn: () => hsExtrasApi.getByObra(obraCod, desde, hasta),
    enabled: !!obraCod,
    staleTime: 60_000,
  })
}

export function useHsExtrasAll() {
  return useQuery({
    queryKey: [...HS_EXTRAS_KEY, 'all'],
    queryFn: () => hsExtrasApi.getAll(),
    staleTime: 60_000,
  })
}

/**
 * Mutation con optimistic update del cache de hs-extras.
 * Actualiza todas las queries cacheadas de esta obra (cualquier rango desde/hasta)
 * para que el input refleje el valor inmediato sin esperar el roundtrip.
 */
export function useUpsertHsExtra() {
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (dto: UpsertHsExtraDto) => hsExtrasApi.upsert(dto),

    onMutate: async (dto) => {
      // Cancelar queries en vuelo de esa obra
      await qc.cancelQueries({ queryKey: [...HS_EXTRAS_KEY, dto.obra_cod] })

      // Snapshot para rollback
      const snapshots = qc.getQueriesData<TarjaHsExtra[]>({ queryKey: [...HS_EXTRAS_KEY, dto.obra_cod] })

      // Aplicar optimistic a cada query cacheada
      snapshots.forEach(([key, old]) => {
        if (!old) return
        const idx = old.findIndex(x => x.leg === dto.leg && x.sem_key === dto.sem_key)
        if (dto.hs === 0) {
          // Backend borra cuando hs === 0
          const next = idx >= 0 ? old.filter((_, i) => i !== idx) : old
          qc.setQueryData(key, next)
        } else if (idx >= 0) {
          const next = old.slice()
          next[idx] = { ...next[idx]!, hs: dto.hs }
          qc.setQueryData(key, next)
        } else {
          const optimistic: TarjaHsExtra = {
            id: -Date.now(),
            obra_cod: dto.obra_cod,
            leg: dto.leg,
            sem_key: dto.sem_key,
            hs: dto.hs,
          }
          qc.setQueryData(key, [...old, optimistic])
        }
      })

      return { snapshots }
    },

    onError: (err: unknown, _dto, ctx) => {
      // Rollback
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          qc.setQueryData(key, data)
        }
      }
      const anyErr = err as { status?: number; message?: string }
      if (anyErr?.status === 409) {
        toast('Semana cerrada — no se pueden modificar horas extras', 'err')
      } else {
        toast(anyErr?.message ?? 'Error al guardar horas extras', 'err')
      }
    },

    onSettled: (_data, _err, dto) => {
      qc.invalidateQueries({ queryKey: [...HS_EXTRAS_KEY, dto.obra_cod] })
      qc.invalidateQueries({ queryKey: [...HS_EXTRAS_KEY, 'all'] })
    },
  })
}

export function useUpsertHsExtrasLote() {
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (dto: UpsertHsExtrasLoteDto) => hsExtrasApi.upsertLote(dto),
    onError: (err: unknown) => {
      const anyErr = err as { status?: number; message?: string }
      if (anyErr?.status === 409) {
        toast('Alguna semana está cerrada — no se guardó el lote', 'err')
      } else {
        toast(anyErr?.message ?? 'Error al guardar lote de horas extras', 'err')
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...HS_EXTRAS_KEY, vars.obra_cod] })
      qc.invalidateQueries({ queryKey: [...HS_EXTRAS_KEY, 'all'] })
    },
  })
}

export function useDeleteHsExtra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => hsExtrasApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HS_EXTRAS_KEY })
    },
  })
}
