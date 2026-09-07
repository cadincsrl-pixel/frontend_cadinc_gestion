import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { semCorteActivos } from '@/lib/utils/personal'
import type { ActividadLeg } from '@/types/domain.types'

export const ACTIVIDAD_KEY = ['personal', 'actividad'] as const

/**
 * Actividad por legajo calculada en la base (RPC personal_actividad): última
 * fecha con horas reales, obras de esa semana y cuántas filas de horas hay
 * desde el viernes de corte de "activo". Reemplaza bajar TODA la tabla de
 * horas en Personal, Ropa y las alertas de legajo.
 */
export function useActividadPersonal(semCorte: string = semCorteActivos()) {
  return useQuery({
    queryKey: [...ACTIVIDAD_KEY, semCorte],
    queryFn: () => apiGet<ActividadLeg[]>(`/api/personal/actividad?desde=${semCorte}`),
  })
}

/** Legajos con alguna fila de horas desde el corte: la entrada de `esActivo`. */
export function legsActivosDe(filas: ReadonlyArray<ActividadLeg>): Set<string> {
  return new Set(filas.filter(f => Number(f.filas_desde) > 0).map(f => f.leg))
}

/** Última semana (vie→jue) con horas reales de cada legajo: fecha y obras. */
export function ultimasObrasDe(filas: ReadonlyArray<ActividadLeg>): Map<string, { fecha: string; obras: string[] }> {
  const out = new Map<string, { fecha: string; obras: string[] }>()
  for (const f of filas) {
    if (!f.ultima_fecha) continue
    out.set(f.leg, { fecha: f.ultima_fecha, obras: [...(f.obras_ultima_semana ?? [])].sort() })
  }
  return out
}
