import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type { HerrEntrega, HerrEntregasPage, HerrEntregasStats, HerrEntregaEstado } from '@/types/domain.types'

export const ENTREGAS_KEY = ['herr-entregas']

export type EstadoHumano = 'pendiente' | 'confirmada' | 'ignorada' | 'revisar'

export interface EntregasFiltro {
  estado?:      HerrEntregaEstado
  /** Varios estados separados por coma; pisa a `estado`. */
  estados?:     string
  sentido?:     'salida' | 'devolucion'
  origen?:      HerrEntrega['origen']
  obra_cod?:    string
  material_id?: number
  /** Solo salidas vivas con algo todavía en obra. */
  en_obra?:     boolean
  q?:           string
  desde?:       string
  hasta?:       string
  limit?:       number
  offset?:      number
}

function qs(f: EntregasFiltro): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    p.set(k, v === true ? '1' : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/**
 * Ledger del pañol: salidas a obra y retornos, paginado en el SERVER (§5.7).
 */
export function useHerrEntregas(filtro: EntregasFiltro = {}, enabled = true) {
  return useQuery({
    queryKey: [...ENTREGAS_KEY, filtro],
    queryFn:  () => apiGet<HerrEntregasPage>(`/api/herramientas/entregas${qs(filtro)}`),
    staleTime: 60_000,
    // Cada filtro es una queryKey distinta. Sin esto, cambiar de página o de tab
    // manda `data` a undefined y la lista se va detrás del spinner en cada paso.
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Todas las filas de un filtro, de a 200 (para agrupar en el cliente sin chocar con el techo de 1000). */
export async function fetchHerrEntregasTodas(filtro: EntregasFiltro): Promise<HerrEntrega[]> {
  const PAGE = 200
  const all: HerrEntrega[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiGet<HerrEntregasPage>(`/api/herramientas/entregas${qs({ ...filtro, limit: PAGE, offset })}`)
    all.push(...page.items)
    if (page.items.length < PAGE) break
  }
  return all
}

export function useHerrEntregasStats() {
  return useQuery({
    queryKey: [...ENTREGAS_KEY, 'stats'],
    queryFn:  () => apiGet<HerrEntregasStats>('/api/herramientas/entregas/stats'),
    staleTime: 60_000,
  })
}

/**
 * Cambiar el estado de UNA entrega. `anulada` la escribe únicamente el trigger.
 * `nota` va solo si se pasa: mandarla siempre pisaba la nota del trigger.
 */
export function useMarcarEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado, nota }: { id: number; estado: EstadoHumano; nota?: string | null }) =>
      apiPatch(`/api/herramientas/entregas/${id}`, nota === undefined ? { estado } : { estado, nota }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ENTREGAS_KEY }) },
  })
}

/** Mismo cambio de estado para varias entregas de una vez (selección múltiple). */
export function useMarcarEntregasBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, estado, nota }: { ids: number[]; estado: EstadoHumano; nota?: string | null }) =>
      apiPatch<{ actualizadas: number; pedidas: number }>('/api/herramientas/entregas/bulk', nota === undefined ? { ids, estado } : { ids, estado, nota }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ENTREGAS_KEY }) },
  })
}

export interface RetornoItem { salida_id: number; cantidad?: number }

/**
 * La herramienta volvió al pañol: una devolución por cada salida elegida
 * (parcial si se manda cantidad). El backend rechaza devolver más de lo que
 * sigue en obra.
 */
export function useRegistrarRetorno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { items: RetornoItem[]; fecha: string; nota?: string | null }) =>
      apiPost<{ devoluciones: HerrEntrega[] }>('/api/herramientas/entregas/retornos', dto),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ENTREGAS_KEY }) },
  })
}
