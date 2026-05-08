import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api/client'
import type { Personal, Hora } from '@/types/domain.types'
import { getSemDays, toISO } from '@/lib/utils/dates'
import { useToast } from '@/components/ui/Toast'

export const PERSONAL_SEMANA_KEY = ['personal-semana'] as const

// ── Trabajadores presentes en una obra ESTA semana (tienen registros en horas) ──
export function usePersonalSemana(obraCod: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: [...PERSONAL_SEMANA_KEY, obraCod, desde, hasta],
    queryFn: async () => {
      const horas = await apiGet<Hora[]>(
        `/api/horas/${encodeURIComponent(obraCod)}?desde=${desde}&hasta=${hasta}`
      )
      const legs = [...new Set(horas.map(h => h.leg))]
      if (!legs.length) return []
      const personal = await apiGet<Personal[]>('/api/personal')
      return personal.filter(p => legs.includes(p.leg))
    },
    enabled: !!obraCod && !!desde && !!hasta,
  })
}

// ── Agregar trabajador a esta semana (inserta 0hs en los 7 días) ──
export function useAgregarASemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ obraCod, leg, semActual }: { obraCod: string; leg: string; semActual: Date }) => {
      const days = getSemDays(semActual)
      const horas = days.map(d => ({ fecha: toISO(d), leg, horas: 0 }))
      return apiPut('/api/horas/lote', { obra_cod: obraCod, horas })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERSONAL_SEMANA_KEY })
      qc.invalidateQueries({ queryKey: ['horas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
  })
}

// ── Quitar trabajador de esta semana (borra sus horas de la semana) ──
export function useQuitarDeSemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ obraCod, leg, desde, hasta }: {
      obraCod: string; leg: string; desde: string; hasta: string
    }) => {
      return apiDelete(`/api/horas/${encodeURIComponent(obraCod)}/semana?desde=${desde}&hasta=${hasta}&leg=${encodeURIComponent(leg)}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERSONAL_SEMANA_KEY })
      qc.invalidateQueries({ queryKey: ['horas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
  })
}

// ── Copiar semana anterior (trae los legs de la semana previa e inserta 0hs) ──
export function useCopiarSemanaAnterior() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ obraCod, semActual }: { obraCod: string; semActual: Date }) => {
      // Semana anterior = retroceder 7 días
      const semAnterior = new Date(semActual)
      semAnterior.setDate(semAnterior.getDate() - 7)
      const daysAnterior = getSemDays(semAnterior)
      const desdeAnt = toISO(daysAnterior[0]!)
      const hastaAnt = toISO(daysAnterior[6]!)

      // Traer horas de la semana anterior para saber quién estaba
      const horasAnt = await apiGet<Hora[]>(
        `/api/horas/${encodeURIComponent(obraCod)}?desde=${desdeAnt}&hasta=${hastaAnt}`
      )
      const legsAnteriores = [...new Set(horasAnt.map(h => h.leg))]
      if (!legsAnteriores.length) throw new Error('No hay trabajadores en la semana anterior')

      // Traer horas de la semana actual para no duplicar
      const daysActual = getSemDays(semActual)
      const desdeAct = toISO(daysActual[0]!)
      const hastaAct = toISO(daysActual[6]!)
      const horasAct = await apiGet<Hora[]>(
        `/api/horas/${encodeURIComponent(obraCod)}?desde=${desdeAct}&hasta=${hastaAct}`
      )
      const legsActuales = new Set(horasAct.map(h => h.leg))

      // Solo agregar los que NO están ya en la semana actual
      const legsNuevos = legsAnteriores.filter(l => !legsActuales.has(l))
      if (!legsNuevos.length) throw new Error('Todos los trabajadores de la semana anterior ya están en esta semana')

      // Insertar 0hs para cada uno
      const horas = legsNuevos.flatMap(leg =>
        daysActual.map(d => ({ fecha: toISO(d), leg, horas: 0 }))
      )
      return apiPut('/api/horas/lote', { obra_cod: obraCod, horas })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERSONAL_SEMANA_KEY })
      qc.invalidateQueries({ queryKey: ['horas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
  })
}

// ── Auto-traer trabajadores cuando se entra a una semana vacía ──
//
// Cuando el user navega a una semana donde no hay trabajadores cargados,
// disparamos automáticamente la copia desde la semana anterior. Es el
// caso típico del lunes después del cierre: la planilla "arranca" con
// los mismos trabajadores y el user solo ajusta horas.
//
// Reglas:
//   - Solo si `enabled=true` (caller decide: debe tener puedeCrear,
//     obra no archivada, y no estar en modo solo lectura).
//   - Solo si la semana actual está VACÍA (sin ningún registro).
//   - Una sola vez por (obra, semana). Track local con useRef para
//     evitar disparos duplicados si la semana anterior también está
//     vacía o si todos los workers ya están.
//   - Errores se tragan en silencio (la semana puede no tener anterior
//     con datos, o haber sido vaciada a propósito). Sí mostramos toast
//     en éxito.
export function useAutoTraerSemanaAnterior({
  obraCod, semActual, personal, isLoading, enabled,
}: {
  obraCod:   string
  semActual: Date
  personal:  Personal[]
  isLoading: boolean
  enabled:   boolean
}) {
  const intentadas = useRef(new Set<string>())
  const { mutate, isPending } = useCopiarSemanaAnterior()
  const toast = useToast()

  useEffect(() => {
    if (!enabled) return
    if (isLoading || isPending) return
    if (personal.length > 0) return
    if (!obraCod) return

    const key = `${obraCod}:${toISO(semActual)}`
    if (intentadas.current.has(key)) return
    intentadas.current.add(key)

    mutate(
      { obraCod, semActual },
      {
        onSuccess: () => {
          toast('✓ Trabajadores traídos de la semana anterior', 'ok')
        },
        onError: () => {
          // Silencio. Casos esperados:
          //  - "No hay trabajadores en la semana anterior" (semana origen vacía)
          //  - "Todos los trabajadores de la semana anterior ya están..."
          //    (race con otro user que ya disparó la copia).
        },
      },
    )
  }, [enabled, isLoading, isPending, personal.length, obraCod, semActual, mutate, toast])
}