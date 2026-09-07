'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type {
  MaterialArido,
  ClienteArido,
  PrecioCliente,
  PrecioGlobal,
  MovimientoArido,
  StockMaterial,
  CobroArido,
  CuentaCorrienteArido,
  MunicipioArido,
  CostoCantera,
  CanteraArido,
  UnidadFlota,
  UnidadEta,
  PagoCantera,
  CuentaCorrienteCantera,
  CategoriaGastoArido,
  GastoArido,
  CargaCombustible,
  CargaCombustibleVista,
  ResultadoMesArido,
  GastoMesPorCategoria,
  FilaImportacion,
  ResultadoImportacion,
  ChoferArido,
  JornalChofer,
  DiaChofer,
  PagoMesChofer,
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
  cantera_id?:  number
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
  qc.invalidateQueries({ queryKey: ['aridos', 'cuenta-corriente-canteras'] })
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

// ─────────────────── Lista de precios global ───────────────────
export const PRECIOS_GLOBAL_KEY = ['aridos', 'precios-global'] as const

export function usePreciosGlobal() {
  return useQuery({
    queryKey: PRECIOS_GLOBAL_KEY,
    queryFn:  () => apiGet<PrecioGlobal[]>('/api/aridos/precios-global'),
  })
}

export function useCreatePrecioGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { material_id: number; precio: number; vigente_desde: string; obs?: string | null }) =>
      apiPost<PrecioGlobal>('/api/aridos/precios-global', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRECIOS_GLOBAL_KEY }),
  })
}

export function useDeletePrecioGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/precios-global/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: PRECIOS_GLOBAL_KEY }),
  })
}

// ─────────────────────────── Movimientos ───────────────────────────
export function useMovimientos(filtro: MovimientosFiltro = {}, enabled = true) {
  const params = new URLSearchParams()
  if (filtro.tipo)        params.set('tipo', filtro.tipo)
  if (filtro.cliente_id)  params.set('cliente_id', String(filtro.cliente_id))
  if (filtro.cantera_id)  params.set('cantera_id', String(filtro.cantera_id))
  if (filtro.material_id) params.set('material_id', String(filtro.material_id))
  if (filtro.fecha_desde) params.set('fecha_desde', filtro.fecha_desde)
  if (filtro.fecha_hasta) params.set('fecha_hasta', filtro.fecha_hasta)
  const qs = params.toString()
  return useQuery({
    queryKey: movimientosKey(filtro),
    queryFn:  () => apiGet<MovimientoArido[]>(`/api/aridos/movimientos${qs ? `?${qs}` : ''}`),
    enabled,
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

// Emitir (o re-obtener) el remito RV-NNNN de una venta — idempotente.
export function useEmitirRemitoVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movimientoId: number) =>
      apiPost<MovimientoArido>(`/api/aridos/movimientos/${movimientoId}/remito`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aridos', 'movimientos'] }),
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

// Catálogo de vehículos del GPS (Mobile Quest) para vincular unidades
// por ID en vez de matchear por patente.
export interface GpsVehiculo {
  id_vehiculo: string
  patente: string
  alias: string | null
}

export function useGpsCatalogo(enabled = true) {
  return useQuery({
    queryKey: ['aridos', 'gps-catalogo'],
    queryFn:  () => apiGet<GpsVehiculo[]>('/api/aridos/gps-catalogo'),
    staleTime: 5 * 60 * 1000,
    enabled,
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
    mutationFn: (dto: { cantera_id: number; concepto: string; zona?: string | null; material_id?: number | null; costo: number; unidad?: 'm3' | 'viaje' | 'hora'; vigente_desde: string; obs?: string | null }) =>
      apiPost<CostoCantera>('/api/aridos/costos-cantera', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: COSTOS_KEY }),
  })
}

// ── Pagos a canteras y cta cte del proveedor ──
export const CTACTE_CANTERAS_KEY = ['aridos', 'cuenta-corriente-canteras'] as const
export const pagosCanteraKey = (canteraId?: number) => ['aridos', 'pagos-cantera', canteraId ?? 'all'] as const

export function usePagosCantera(canteraId?: number) {
  return useQuery({
    queryKey: pagosCanteraKey(canteraId),
    queryFn:  () => apiGet<PagoCantera[]>(`/api/aridos/pagos-cantera${canteraId ? `?cantera_id=${canteraId}` : ''}`),
  })
}

export function useCreatePagoCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { cantera_id: number; fecha: string; monto: number; medio: string; obs?: string | null }) =>
      apiPost<PagoCantera>('/api/aridos/pagos-cantera', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aridos', 'pagos-cantera'] })
      qc.invalidateQueries({ queryKey: CTACTE_CANTERAS_KEY })
    },
  })
}

export function useDeletePagoCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/aridos/pagos-cantera/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['aridos', 'pagos-cantera'] })
      qc.invalidateQueries({ queryKey: CTACTE_CANTERAS_KEY })
    },
  })
}

export function useCuentaCorrienteCanteras() {
  return useQuery({
    queryKey: CTACTE_CANTERAS_KEY,
    queryFn:  () => apiGet<CuentaCorrienteCantera[]>('/api/aridos/cuenta-corriente-canteras'),
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
    mutationFn: (dto: { cliente_id: number; fecha: string; monto: number; medio: string; obs?: string; venta_ids?: number[] }) =>
      apiPost<CobroArido>('/api/aridos/cobros', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aridos', 'cobros'] })
      qc.invalidateQueries({ queryKey: CTACTE_KEY })
      qc.invalidateQueries({ queryKey: ['aridos', 'movimientos'] })
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
      // El FK es ON DELETE SET NULL: las ventas imputadas vuelven a adeudadas
      qc.invalidateQueries({ queryKey: ['aridos', 'movimientos'] })
    },
  })
}

export function useCuentaCorrienteAridos() {
  return useQuery({
    queryKey: CTACTE_KEY,
    queryFn:  () => apiGet<CuentaCorrienteArido[]>('/api/aridos/cuenta-corriente'),
  })
}

// ─────────────────────────── Gastos del área ───────────────────────────
export const GASTOS_CATEGORIAS_KEY = ['aridos', 'gastos-categorias'] as const
export const RESULTADO_KEY         = ['aridos', 'resultado'] as const

export interface GastosFiltro {
  mes?:          string
  desde?:        string
  hasta?:        string
  unidad_id?:    number
  categoria_id?: number
  sin_unidad?:   boolean
}
export const gastosKey = (f: GastosFiltro) => ['aridos', 'gastos', f] as const

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function useCategoriasGasto() {
  return useQuery({
    queryKey: GASTOS_CATEGORIAS_KEY,
    queryFn:  () => apiGet<CategoriaGastoArido[]>('/api/aridos/gastos/categorias'),
    staleTime: 10 * 60_000,   // el catálogo casi no cambia
  })
}

export function useGastos(f: GastosFiltro) {
  return useQuery({
    queryKey: gastosKey(f),
    queryFn:  () => apiGet<{ data: GastoArido[]; total: number; limit: number; offset: number }>(
      `/api/aridos/gastos${qs({ ...f, limit: 500 })}`),
  })
}

/**
 * Todo lo que toca plata del mes invalida el resultado: es una vista que suma
 * ventas, gastos y jornales, así que un gasto nuevo la deja vieja.
 */
function invalidarResultado(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['aridos', 'gastos'] })
  qc.invalidateQueries({ queryKey: RESULTADO_KEY })
}

export function useCreateGastoArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: FilaImportacion & { comprobante_path?: string | null }) =>
      apiPost<{ gasto: GastoArido; carga: CargaCombustible | null }>('/api/aridos/gastos', dto),
    onSuccess: () => invalidarResultado(qc),
  })
}

export function useUpdateGastoArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...dto }: Partial<FilaImportacion> & { id: number; comprobante_path?: string | null }) =>
      apiPatch<GastoArido>(`/api/aridos/gastos/${id}`, dto),
    onSuccess: () => invalidarResultado(qc),
  })
}

export function useDeleteGastoArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/api/aridos/gastos/${id}`),
    onSuccess: () => invalidarResultado(qc),
  })
}

/**
 * El Excel del mes va entero en una request. Con `dry_run` valida sin escribir,
 * que es lo que alimenta la previsualización del modal.
 */
export function useImportarGastos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { filas: FilaImportacion[]; dry_run?: boolean }) =>
      apiPost<ResultadoImportacion>('/api/aridos/gastos/importar', body),
    onSuccess: (res) => { if (!res.dry_run) invalidarResultado(qc) },
  })
}

export function useResultadoMes(mes?: string) {
  return useQuery({
    queryKey: [...RESULTADO_KEY, mes ?? 'todos'],
    queryFn:  () => apiGet<ResultadoMesArido[]>(`/api/aridos/gastos/resultado${qs({ mes })}`),
  })
}

export function useGastosPorCategoria(mes?: string) {
  return useQuery({
    queryKey: ['aridos', 'gastos-por-categoria', mes ?? 'todos'],
    queryFn:  () => apiGet<GastoMesPorCategoria[]>(`/api/aridos/gastos/por-categoria${qs({ mes })}`),
  })
}

export function useCargasCombustible(f: { unidad_id?: number; desde?: string; hasta?: string }) {
  return useQuery({
    queryKey: ['aridos', 'cargas-combustible', f],
    queryFn:  () => apiGet<CargaCombustibleVista[]>(`/api/aridos/gastos/combustible${qs(f)}`),
  })
}

/** Paso 1 del alta con comprobante: pedir la URL firmada y subir el archivo. */
export async function subirComprobanteGasto(file: File): Promise<string> {
  const { path, signedUrl } = await apiPost<{ path: string; signedUrl: string; token: string }>(
    '/api/aridos/gastos/upload-comprobante', { content_type: file.type })
  const res = await fetch(signedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type },
    body:    file,
  })
  if (!res.ok) throw new Error(`No se pudo subir el comprobante (${res.status})`)
  return path
}

export async function verComprobanteGasto(id: number): Promise<string> {
  const { signedUrl } = await apiGet<{ signedUrl: string }>(`/api/aridos/gastos/${id}/comprobante-url`)
  return signedUrl
}

// ─────────────────────────── Choferes del área ───────────────────────────
export const CHOFERES_ARIDOS_KEY = ['aridos', 'choferes'] as const

export function useChoferesAridos() {
  return useQuery({
    queryKey: CHOFERES_ARIDOS_KEY,
    queryFn:  () => apiGet<ChoferArido[]>('/api/aridos/choferes'),
  })
}

export function useCreateChoferArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { nombre: string; dni?: string | null; tel?: string | null; obs?: string | null; jornal?: number | null; jornal_desde?: string | null }) =>
      apiPost<ChoferArido>('/api/aridos/choferes', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHOFERES_ARIDOS_KEY }),
  })
}

export function useUpdateChoferArido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: number; nombre?: string; dni?: string | null; tel?: string | null; obs?: string | null; activo?: boolean }) =>
      apiPatch<ChoferArido>(`/api/aridos/choferes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHOFERES_ARIDOS_KEY }),
  })
}

export function useJornalesChofer(choferId?: number) {
  return useQuery({
    queryKey: ['aridos', 'chofer-jornales', choferId],
    queryFn:  () => apiGet<JornalChofer[]>(`/api/aridos/choferes/${choferId}/jornales`),
    enabled:  choferId != null,
  })
}

/**
 * Cambiar el jornal INSERTA una versión nueva; no pisa la anterior. Por eso
 * también hay que invalidar los días y el pago: lo que cambia es de qué fecha
 * en adelante rige el número nuevo.
 */
export function useSetJornalChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ chofer_id, ...dto }: { chofer_id: number; jornal: number; vigente_desde: string; obs?: string | null }) =>
      apiPost<JornalChofer>(`/api/aridos/choferes/${chofer_id}/jornales`, dto),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: CHOFERES_ARIDOS_KEY })
      qc.invalidateQueries({ queryKey: ['aridos', 'chofer-jornales', v.chofer_id] })
      qc.invalidateQueries({ queryKey: ['aridos', 'chofer-pago'] })
    },
  })
}

export function useDiasChofer(f: { desde?: string; hasta?: string; chofer_id?: number }) {
  return useQuery({
    queryKey: ['aridos', 'chofer-dias', f],
    queryFn:  () => apiGet<DiaChofer[]>(`/api/aridos/chofer-dias${qs(f)}`),
  })
}

function invalidarDiasYPago(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['aridos', 'chofer-dias'] })
  qc.invalidateQueries({ queryKey: ['aridos', 'chofer-pago'] })
  qc.invalidateQueries({ queryKey: RESULTADO_KEY })   // los jornales entran al resultado
}

export function useMarcarDiaChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { chofer_id: number; fecha: string; unidad_id?: number | null; obs?: string | null }) =>
      apiPost<DiaChofer>('/api/aridos/chofer-dias', dto),
    onSuccess: () => invalidarDiasYPago(qc),
  })
}

export function useBorrarDiaChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/api/aridos/chofer-dias/${id}`),
    onSuccess: () => invalidarDiasYPago(qc),
  })
}

export function usePagoMesChoferes(mes: string) {
  return useQuery({
    queryKey: ['aridos', 'chofer-pago', mes],
    queryFn:  () => apiGet<PagoMesChofer[]>(`/api/aridos/chofer-pago/${mes}`),
    enabled:  !!mes,
  })
}
