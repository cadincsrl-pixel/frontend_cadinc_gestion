import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete }   from '@/lib/api/client'
import type {
  Herramienta, HerrConfig, HerrStats,
  HerrMovimiento, HerrMarca,
} from '@/types/domain.types'

const KEY = ['herramientas']

export function useHerrConfig() {
  return useQuery({
    queryKey: ['herr-config'],
    queryFn:  () => apiGet<HerrConfig>('/api/herramientas/config'),
    staleTime: 0,
    gcTime:    0,
  })
}

const MARCAS_KEY = ['herr-marcas']

export function useHerrMarcas() {
  return useQuery({
    queryKey: MARCAS_KEY,
    queryFn:  () => apiGet<HerrMarca[]>('/api/herramientas/marcas'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateMarca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { nom: string }) => apiPost('/api/herramientas/marcas', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MARCAS_KEY }),
  })
}

export function useCreateModelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ marcaId, nom }: { marcaId: number; nom: string }) =>
      apiPost(`/api/herramientas/marcas/${marcaId}/modelos`, { nom }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MARCAS_KEY }),
  })
}

export function useHerrStats() {
  return useQuery({
    queryKey: ['herr-stats'],
    queryFn:  () => apiGet<HerrStats>('/api/herramientas/stats'),
    enabled:  true,
  })
}

export function useHerramientas() {
  return useQuery({
    queryKey: KEY,
    queryFn:  () => apiGet<Herramienta[]>('/api/herramientas'),
    enabled:  true,
  })
}

export function useHerramienta(id: number) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn:  () => apiGet<Herramienta>(`/api/herramientas/${id}`),
    enabled:  !!id,
  })
}

export function useHerrMovimientos(herramientaId: number) {
  return useQuery({
    queryKey: ['herr-movimientos', herramientaId],
    queryFn:  () => apiGet<HerrMovimiento[]>(`/api/herramientas/${herramientaId}/movimientos`),
    enabled:  !!herramientaId,
  })
}

// Response shape del endpoint /movimientos/all (con paginación opcional).
interface MovListResponse {
  items: HerrMovimiento[]
  total: number
}

/**
 * Trae TODOS los movimientos (sin paginar — cap servidor 500). Usado por
 * componentes que necesitan el dataset completo en memoria, como
 * `HerramientasAlertasSection` que calcula "sin movimiento >90d" por herramienta.
 *
 * Para listados paginables (historial con filtros), usar `useHerrMovimientosPaginated`.
 */
export function useHerrMovimientosAll() {
  return useQuery({
    queryKey: ['herr-movimientos', 'all'],
    queryFn:  async () => {
      const res = await apiGet<MovListResponse>('/api/herramientas/movimientos/all')
      return res.items
    },
  })
}

export interface HerrMovFilters {
  herramienta_id?: number | null
  tipo_key?:       string | null
  obra_cod?:       string | null
  desde?:          string | null
  hasta?:          string | null
}

const PAGE_SIZE = 50

/**
 * Versión paginada con filtros server-side. Cada fetch trae `PAGE_SIZE` rows.
 * `useInfiniteQuery` provee `fetchNextPage` para el botón "Cargar más".
 *
 * Notar: la búsqueda libre (`q` por texto) NO está en los filtros — el backend
 * no la soporta porque Supabase no permite filtrar across joined columns sin RPC.
 * Esa búsqueda se mantiene client-side en el componente sobre la data ya cargada.
 */
export function useHerrMovimientosPaginated(filters: HerrMovFilters) {
  return useInfiniteQuery({
    queryKey:    ['herr-movimientos', 'paginated', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      params.set('limit',  String(PAGE_SIZE))
      params.set('offset', String(pageParam))
      if (filters.herramienta_id) params.set('herramienta_id', String(filters.herramienta_id))
      if (filters.tipo_key)       params.set('tipo_key', filters.tipo_key)
      if (filters.obra_cod)       params.set('obra_cod', filters.obra_cod)
      if (filters.desde)          params.set('desde', filters.desde)
      if (filters.hasta)          params.set('hasta', filters.hasta)
      return apiGet<MovListResponse>(`/api/herramientas/movimientos/all?${params}`)
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
  })
}

export function useCreateHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost('/api/herramientas', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
    },
  })
}

export function useUpdateHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch(`/api/herramientas/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useDeleteHerramienta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/herramientas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
    },
  })
}

export function useRegistrarMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost('/api/herramientas/movimientos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
      qc.invalidateQueries({ queryKey: ['herr-movimientos'] })
    },
  })
}

interface MovimientoLoteDto {
  herramienta_ids:      number[]
  tipo_key:             string
  obra_destino_cod?:    string | null
  responsable?:         string
  responsable_user_id?: string | null
  responsable_leg?:     string | null
  obs?:                 string
  fecha?:               string
}

export function useRegistrarMovimientoLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: MovimientoLoteDto) =>
      apiPost<{ count: number; movimiento_ids: number[] }>('/api/herramientas/movimientos/lote', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['herr-stats'] })
      qc.invalidateQueries({ queryKey: ['herr-movimientos'] })
    },
  })
}