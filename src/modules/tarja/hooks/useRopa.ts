import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { RopaCategoria, RopaEntrega } from '@/types/domain.types'

// Lectura va por Supabase directo (RLS permisiva, data no-PII).
// Mutaciones pasan por el backend Hono (requirePermiso('tarja',*) + audit).
function sb() { return createClient() }

const KEY_CAT      = ['ropa_categorias']
const KEY_ENTREGAS = ['ropa_entregas']

// ── Categorías ──

export function useRopaCategorias() {
  return useQuery({
    queryKey: KEY_CAT,
    queryFn: async () => {
      const { data, error } = await sb()
        .from('ropa_categorias')
        .select('*')
        .eq('activo', true)
        .order('id')
      if (error) throw new Error(error.message)
      return (data ?? []) as RopaCategoria[]
    },
  })
}

export function useCreateRopaCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { nombre: string; icono?: string; meses_vencimiento?: number }) =>
      apiPost<RopaCategoria>('/api/ropa/categorias', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CAT }),
  })
}

export function useUpdateRopaCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, meses_vencimiento }: { id: number; meses_vencimiento: number }) =>
      apiPatch<RopaCategoria>(`/api/ropa/categorias/${id}`, { meses_vencimiento }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CAT }),
  })
}

export function useDeleteRopaCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/ropa/categorias/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CAT }),
  })
}

// ── Entregas ──

/**
 * Última entrega por (leg, categoría) para un set de legajos.
 * Va por RPC agregada (migración 20260726) y no por .in('leg', ...) crudo:
 * ropa_entregas crece sin techo y el cap de 1000 rows de PostgREST truncaría
 * en silencio (CLAUDE.md §5.7). La RPC devuelve a lo sumo una fila por par.
 */
export function useRopaUltimasEntregas(legs: string[]) {
  return useQuery({
    queryKey: [...KEY_ENTREGAS, 'ultimas', legs],
    queryFn: async () => {
      if (!legs.length) return [] as RopaEntrega[]
      const { data, error } = await sb().rpc('ropa_ultimas_entregas', { p_legs: legs })
      if (error) throw new Error(error.message)
      return (data ?? []) as RopaEntrega[]
    },
    enabled: legs.length > 0,
  })
}

/** Historial completo de un trabajador específico (para el modal) */
export function useRopaEntregasPorLeg(leg: string) {
  return useQuery({
    queryKey: [...KEY_ENTREGAS, 'leg', leg],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('ropa_entregas')
        .select('*')
        .eq('leg', leg)
        .order('fecha_entrega', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as RopaEntrega[]
    },
    enabled: !!leg,
  })
}

export function useCreateRopaEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: {
      leg:           string
      categoria_id:  number
      fecha_entrega: string
      obs?:          string | null
    }) => apiPost<RopaEntrega>('/api/ropa/entregas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_ENTREGAS }),
  })
}

export function useDeleteRopaEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/ropa/entregas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_ENTREGAS }),
  })
}
