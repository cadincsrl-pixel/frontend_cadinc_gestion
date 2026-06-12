'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type {
  MaterialArido,
  ClienteArido,
  PrecioCliente,
  MovimientoArido,
  StockMaterial,
  CobroArido,
  CuentaCorrienteArido,
  MunicipioArido,
  CostoCantera,
  CanteraArido,
  UnidadFlota,
  UnidadEta,
} from '../types'

// ── Query keys ──
export const MATERIALES_KEY = ['aridos', 'materiales'] as const
export const CLIENTES_KEY   = ['aridos', 'clientes'] as const
export const PRECIOS_KEY    = ['aridos', 'precios'] as const
export const STOCK_KEY      = ['aridos', 'stock'] as const
export const CTACTE_KEY     = ['aridos', 'cuenta-corriente'] as const

export interface MovimientosFiltro {
  tipo?:        'venta' | 'acopio' | 'ajuste'
  cliente_id?:  number
  material_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}
export const movimientosKey = (f: MovimientosFiltro) => ['aridos', 'movimientos', f] as const
export const cobrosKey = (clienteId?: number) => ['aridos', 'cobros', clienteId ?? 'all'] as const

function invalidarDerivados(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['aridos', 'movimientos'] })
  qc.invalidateQueries({ queryKey: STOCK_KEY })
  qc.invalidateQueries({ queryKey: CTACTE_KEY })
}

// ─────────────────────────── Materiales ───────────────────────────
export function useMateriales() {
  return useQuery({
    queryKey: MATERIALES_KEY,
    queryFn:  () => apiGet<MaterialArido[]>('/api/aridos/materiales'),
  })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<MaterialArido>) => apiPost<MaterialArido>('/api/aridos/materiales', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MATERIALES_KEY }),
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<MaterialArido> }) =>
      apiPatch<MaterialArido>(`/api/aridos/materiales/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MATERIALES_KEY })
      qc.invalidateQueries({ queryKey: STOCK_KEY })
    },
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/materiales/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: MATERIALES_KEY })
      qc.invalidateQueries({ queryKey: STOCK_KEY })
    },
  })
}

// ─────────────────────────── Clientes ───────────────────────────
export function useClientesAridos() {
  return useQuery({
    queryKey: CLIENTES_KEY,
    queryFn:  () => apiGet<ClienteArido[]>('/api/aridos/clientes'),
  })
}

export function useCreateClienteArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<ClienteArido>) => apiPost<ClienteArido>('/api/aridos/clientes', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: CLIENTES_KEY }),
  })
}

export function useUpdateClienteArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<ClienteArido> }) =>
      apiPatch<ClienteArido>(`/api/aridos/clientes/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENTES_KEY })
      qc.invalidateQueries({ queryKey: CTACTE_KEY })
    },
  })
}

export function useDeleteClienteArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/clientes/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: CLIENTES_KEY })
      qc.invalidateQueries({ queryKey: CTACTE_KEY })
    },
  })
}

// ─────────────────────── Precios por cliente ───────────────────────
export function usePreciosCliente() {
  return useQuery({
    queryKey: PRECIOS_KEY,
    queryFn:  () => apiGet<PrecioCliente[]>('/api/aridos/precios'),
  })
}

export function useCreatePrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { cliente_id: number; material_id: number; precio: number; vigente_desde: string; obs?: string }) =>
      apiPost<PrecioCliente>('/api/aridos/precios', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRECIOS_KEY }),
  })
}

export function useUpdatePrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { precio?: number; vigente_desde?: string; obs?: string } }) =>
      apiPatch<PrecioCliente>(`/api/aridos/precios/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRECIOS_KEY }),
  })
}

export function useDeletePrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/precios/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PRECIOS_KEY }),
  })
}

// ─────────────────────────── Movimientos ───────────────────────────
export function useMovimientos(filtro: MovimientosFiltro = {}) {
  const params = new URLSearchParams()
  if (filtro.tipo)        params.set('tipo', filtro.tipo)
  if (filtro.cliente_id)  params.set('cliente_id', String(filtro.cliente_id))
  if (filtro.material_id) params.set('material_id', String(filtro.material_id))
  if (filtro.fecha_desde) params.set('fecha_desde', filtro.fecha_desde)
  if (filtro.fecha_hasta) params.set('fecha_hasta', filtro.fecha_hasta)
  const qs = params.toString()
  return useQuery({
    queryKey: movimientosKey(filtro),
    queryFn:  () => apiGet<MovimientoArido[]>(`/api/aridos/movimientos${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => apiPost<MovimientoArido>('/api/aridos/movimientos', dto),
    onSuccess:  () => invalidarDerivados(qc),
  })
}

export function useUpdateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Record<string, unknown> }) =>
      apiPatch<MovimientoArido>(`/api/aridos/movimientos/${id}`, dto),
    onSuccess: () => invalidarDerivados(qc),
  })
}

export function useDeleteMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/movimientos/${id}`),
    onSuccess:  () => invalidarDerivados(qc),
  })
}

// ─────────────────── Canteras y unidades propias ───────────────────
export const CANTERAS_KEY = ['aridos', 'canteras'] as const
export const UNIDADES_KEY = ['aridos', 'unidades'] as const

export function useCanterasAridos() {
  return useQuery({
    queryKey: CANTERAS_KEY,
    queryFn:  () => apiGet<CanteraArido[]>('/api/aridos/canteras'),
  })
}

export function useCreateCanteraArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<CanteraArido>) => apiPost<CanteraArido>('/api/aridos/canteras', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: CANTERAS_KEY }),
  })
}

export function useUpdateCanteraArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<CanteraArido> }) =>
      apiPatch<CanteraArido>(`/api/aridos/canteras/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CANTERAS_KEY }),
  })
}

export function useDeleteCanteraArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/canteras/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: CANTERAS_KEY }),
  })
}

export function useUnidades() {
  return useQuery({
    queryKey: UNIDADES_KEY,
    queryFn:  () => apiGet<UnidadFlota[]>('/api/aridos/unidades'),
  })
}

export function useCreateUnidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<UnidadFlota>) => apiPost<UnidadFlota>('/api/aridos/unidades', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: UNIDADES_KEY }),
  })
}

export function useUpdateUnidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<UnidadFlota> }) =>
      apiPatch<UnidadFlota>(`/api/aridos/unidades/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNIDADES_KEY }),
  })
}

export function useDeleteUnidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/unidades/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: UNIDADES_KEY }),
  })
}

// Consulta on-demand (GPS + Google Maps): no se cachea como query
// porque cada llamada cuesta — se dispara con un botón.
export function useUnidadEta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unidadId, direccion }: { unidadId: number; direccion: string }) =>
      apiGet<UnidadEta>(`/api/aridos/unidades/${unidadId}/eta?direccion=${encodeURIComponent(direccion)}`),
    // La consulta persiste la última posición en la unidad
    onSuccess: () => qc.invalidateQueries({ queryKey: UNIDADES_KEY }),
  })
}

// ─────────────────────── Municipios y costos de cantera ───────────────────────
export const MUNICIPIOS_KEY = ['aridos', 'municipios'] as const
export const COSTOS_KEY     = ['aridos', 'costos-cantera'] as const

export function useMunicipios() {
  return useQuery({
    queryKey: MUNICIPIOS_KEY,
    queryFn:  () => apiGet<MunicipioArido[]>('/api/aridos/municipios'),
  })
}

export function useCreateMunicipio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { nombre: string; recargo_pct: number; obs?: string | null }) =>
      apiPost<MunicipioArido>('/api/aridos/municipios', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: MUNICIPIOS_KEY }),
  })
}

export function useUpdateMunicipio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { nombre?: string; recargo_pct?: number; obs?: string | null } }) =>
      apiPatch<MunicipioArido>(`/api/aridos/municipios/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: MUNICIPIOS_KEY }),
  })
}

export function useDeleteMunicipio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/municipios/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MUNICIPIOS_KEY }),
  })
}

export function useCostosCantera() {
  return useQuery({
    queryKey: COSTOS_KEY,
    queryFn:  () => apiGet<CostoCantera[]>('/api/aridos/costos-cantera'),
  })
}

export function useCreateCostoCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { cantera_id: number; material_id: number; costo: number; vigente_desde: string; obs?: string | null }) =>
      apiPost<CostoCantera>('/api/aridos/costos-cantera', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: COSTOS_KEY }),
  })
}

export function useDeleteCostoCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/costos-cantera/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: COSTOS_KEY }),
  })
}

// ─────────────────────────── Stock ───────────────────────────
export function useStockAridos() {
  return useQuery({
    queryKey: STOCK_KEY,
    queryFn:  () => apiGet<StockMaterial[]>('/api/aridos/stock'),
  })
}

// ─────────────────────── Cobros y cuenta corriente ───────────────────────
export function useCobrosAridos(clienteId?: number) {
  return useQuery({
    queryKey: cobrosKey(clienteId),
    queryFn:  () => apiGet<CobroArido[]>(`/api/aridos/cobros${clienteId ? `?cliente_id=${clienteId}` : ''}`),
  })
}

export function useCreateCobroArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { cliente_id: number; fecha: string; monto: number; medio: string; obs?: string }) =>
      apiPost<CobroArido>('/api/aridos/cobros', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aridos', 'cobros'] })
      qc.invalidateQueries({ queryKey: CTACTE_KEY })
    },
  })
}

export function useDeleteCobroArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/cobros/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['aridos', 'cobros'] })
      qc.invalidateQueries({ queryKey: CTACTE_KEY })
    },
  })
}

export function useCuentaCorrienteAridos() {
  return useQuery({
    queryKey: CTACTE_KEY,
    queryFn:  () => apiGet<CuentaCorrienteArido[]>('/api/aridos/cuenta-corriente'),
  })
}
