import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import type { HerrTipoCatalogo, HerrEntrega } from '@/types/domain.types'
import { ENTREGAS_KEY } from './useHerrEntregas'

export const HERR_TIPOS_KEY = ['herr-tipos']

/**
 * Tipos de herramienta del catálogo (stock_materiales con clase 'herramienta')
 * con lo que dice el pañol de cada uno. ~100 filas: el server filtra por texto
 * sobre nombre + sinónimos con la misma normalización que el buscador del pedido.
 */
export function useHerrTipos(q = '', inactivos = false) {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  if (inactivos) p.set('inactivos', '1')
  const s = p.toString()
  return useQuery({
    queryKey: [...HERR_TIPOS_KEY, q, inactivos],
    queryFn:  () => apiGet<HerrTipoCatalogo[]>(`/api/herramientas/tipos${s ? `?${s}` : ''}`),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

/** Salidas y retornos vivos de un tipo (para el detalle). */
export function useHerrTipoEntregas(id: number | null) {
  return useQuery({
    queryKey: [...HERR_TIPOS_KEY, 'entregas', id],
    queryFn:  () => apiGet<HerrEntrega[]>(`/api/herramientas/tipos/${id}/entregas`),
    enabled:  id != null,
    staleTime: 30_000,
  })
}

export interface HerrTipoInput {
  nombre: string
  alias?: string[]
  obs?:   string | null
}

// Un tipo nuevo o renombrado también tiene que aparecer en el buscador del
// pedido (['stock','materiales']) y en Salidas a obra, que muestra el nombre.
function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: HERR_TIPOS_KEY })
  qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
  qc.invalidateQueries({ queryKey: ENTREGAS_KEY })
}

export function useCrearHerrTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: HerrTipoInput) => apiPost<HerrTipoCatalogo>('/api/herramientas/tipos', dto),
    onSuccess:  () => invalidarTodo(qc),
  })
}

export interface HerrFusionResultado {
  origen_id: number; origen: string; destino_id: number; destino: string
  renglones: number; entregas: number; movimientos: number; cuenta_cliente: number
  tipo: HerrTipoCatalogo
}

/** El tipo `id` se funde en `destino_id` y queda de baja (RPC transaccional). */
export function useFusionarHerrTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, destino_id }: { id: number; destino_id: number }) =>
      apiPost<HerrFusionResultado>(`/api/herramientas/tipos/${id}/fusionar`, { destino_id }),
    onSuccess:  () => invalidarTodo(qc),
  })
}

export function useEditarHerrTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...dto }: Partial<HerrTipoInput> & { id: number; activo?: boolean }) =>
      apiPatch<HerrTipoCatalogo & { aviso?: string }>(`/api/herramientas/tipos/${id}`, dto),
    onSuccess:  () => invalidarTodo(qc),
  })
}
