import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api/client'
import type { Personal, Hora } from '@/types/domain.types'
import { getSemDays, toISO, hoyArgentinaISO } from '@/lib/utils/dates'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'

// Fallos ESPERADOS de la copia de semana — no ameritan toast de error.
const COPIA_ERRORES_BENIGNOS = [
  'No hay trabajadores en la semana anterior',
  'Todos los trabajadores de la semana anterior ya están en esta semana',
  'Hoy no cae dentro de esta semana',
]

export const PERSONAL_SEMANA_KEY = ['personal-semana'] as const

// ── Trabajadores presentes en una obra ESTA semana (tienen registros en horas) ──
// Si la semana actual está vacía (típico el primer día de la semana, antes de
// que alguien cargue horas), heredamos los legs de la semana anterior como
// placeholders visuales. Esto destraba a capataces que no tienen el botón
// "+ Trabajador" ni el toolbar de "Copiar semana anterior". No muta DB:
// las celdas siguen vacías hasta que el capataz cargue la primera hora.
export function usePersonalSemana(obraCod: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: [...PERSONAL_SEMANA_KEY, obraCod, desde, hasta],
    queryFn: async () => {
      const horas = await apiGet<Hora[]>(
        `/api/horas/${encodeURIComponent(obraCod)}?desde=${desde}&hasta=${hasta}`
      )
      let legs = [...new Set(horas.map(h => h.leg))]

      if (!legs.length && desde && hasta) {
        const semAnt = (iso: string) => {
          const d = new Date(iso + 'T12:00:00')
          d.setDate(d.getDate() - 7)
          return toISO(d)
        }
        const horasAnt = await apiGet<Hora[]>(
          `/api/horas/${encodeURIComponent(obraCod)}?desde=${semAnt(desde)}&hasta=${semAnt(hasta)}`
        )
        legs = [...new Set(horasAnt.map(h => h.leg))]
      }

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
      return apiPut('/api/horas/lote', { obra_cod: obraCod, horas, solo_nuevas: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERSONAL_SEMANA_KEY })
      qc.invalidateQueries({ queryKey: ['horas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
  })
}

// ── Agregar varios trabajadores a esta semana en una sola llamada ──
// Construye N × 7 placeholders (legs × días vie→jue) y los upsertea en un
// solo PUT a /api/horas/lote. Más eficiente que llamar useAgregarASemana en
// loop.
export function useAgregarVariosASemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ obraCod, legs, semActual }: { obraCod: string; legs: string[]; semActual: Date }) => {
      if (legs.length === 0) return
      const days = getSemDays(semActual)
      const horas = legs.flatMap(leg =>
        days.map(d => ({ fecha: toISO(d), leg, horas: 0 }))
      )
      return apiPut('/api/horas/lote', { obra_cod: obraCod, horas, solo_nuevas: true })
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
  // Capataces: el backend rechaza el lote ENTERO si alguna fila no es de HOY
  // (regla "capataz solo carga hoy"). Por eso su copia inserta placeholders
  // solo con fecha de hoy — alcanza para que los trabajadores aparezcan.
  // Incidente CC NORTE 2026-08-29: el capataz abrió primero la semana nueva,
  // la copia de 7 días le falló en silencio, y la semana quedó con solo los
  // 4 trabajadores que tocó ese día ("se borraron todos los trabajadores").
  const { esCapataz } = usePermisos('tarja')
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

      // Capataz → solo la fila de hoy; resto de roles → los 7 días.
      // "Hoy" en hora ARGENTINA (igual que la validación del backend), no el
      // reloj del dispositivo: un celular en otro huso elegiría una fecha que
      // el backend rechaza y la copia volvería a fallar.
      const hoyISO = hoyArgentinaISO()
      const diasAInsertar = esCapataz
        ? daysActual.filter(d => toISO(d) === hoyISO)
        : daysActual
      if (!diasAInsertar.length) {
        // Capataz mirando una semana que no incluye hoy: no hay nada que
        // pueda escribir (la regla del backend lo rechazaría igual).
        throw new Error('Hoy no cae dentro de esta semana')
      }

      // Insertar 0hs para cada uno. solo_nuevas: los placeholders jamás
      // pisan una fila existente (cierra la carrera con la carga de celdas).
      const horas = legsNuevos.flatMap(leg =>
        diasAInsertar.map(d => ({ fecha: toISO(d), leg, horas: 0 }))
      )
      return apiPut('/api/horas/lote', { obra_cod: obraCod, horas, solo_nuevas: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERSONAL_SEMANA_KEY })
      qc.invalidateQueries({ queryKey: ['horas'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
    },
  })
}

// ── Auto-copiar trabajadores cuando se entra a una semana vacía ──
//
// Cuando el user navega a una semana donde no hay NINGÚN registro de horas,
// disparamos automáticamente la copia (real, persistida) desde la semana
// anterior. Es el caso típico del lunes después del cierre: la planilla
// "arranca" con los mismos trabajadores y el user solo ajusta horas.
//
// ⚠️ El signal de "vacía" debe venir de los registros REALES en DB
// (`useHorasSemana`), NO de `usePersonalSemana`: ese hook backfillea
// placeholders visuales de la semana anterior, así que `personal.length`
// casi nunca es 0 y taparía este disparo. Por eso recibimos `vaciaEnDB`.
//
// Reglas:
//   - Solo si `enabled=true` (caller decide: debe tener puedeCrear,
//     obra no archivada, y no estar en modo solo lectura — persistir
//     requiere permiso de escritura).
//   - Solo si la semana actual está VACÍA en DB (sin ningún registro).
//   - Una sola vez por (obra, semana). Track local con useRef para
//     evitar disparos duplicados si la semana anterior también está
//     vacía o si todos los workers ya están.
//   - Errores ESPERADOS en silencio (semana anterior vacía, todos ya
//     copiados, capataz fuera de su día). Cualquier OTRO fallo se avisa
//     con toast: un rechazo silencioso del backend dejaba la semana sin
//     poblar y parecía que "se borraron los trabajadores" (CC NORTE,
//     2026-08-29).
export function useAutoTraerSemanaAnterior({
  obraCod, semActual, vaciaEnDB, isLoading, enabled,
}: {
  obraCod:   string
  semActual: Date
  vaciaEnDB: boolean
  isLoading: boolean
  enabled:   boolean
}) {
  const intentadas = useRef(new Set<string>())
  const { mutate, isPending } = useCopiarSemanaAnterior()
  const toast = useToast()

  useEffect(() => {
    if (!enabled) return
    if (isLoading || isPending) return
    if (!vaciaEnDB) return
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
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          // Casos esperados en silencio (semana origen vacía, ya copiados,
          // capataz fuera de su día). El resto se AVISA: si la copia falla
          // callada, la semana queda sin poblar y parece un borrado.
          if (COPIA_ERRORES_BENIGNOS.some(b => msg.includes(b))) return
          toast(`⚠ No se pudieron traer los trabajadores de la semana anterior: ${msg}`, 'err')
        },
      },
    )
  }, [enabled, isLoading, isPending, vaciaEnDB, obraCod, semActual, mutate, toast])
}