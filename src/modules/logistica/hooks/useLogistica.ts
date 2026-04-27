import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api/client'
import type {
  Chofer, Camion, Batea, Cantera, Deposito, Ruta,
  Tramo, Viaje, Liquidacion, Adelanto, TarifaCantera,
  EmpresaTransportista, TarifaEmpresaCantera, Cobro,
} from '@/types/domain.types'

// ── Keys ──
export const LOG_KEYS = {
  choferes:        ['logistica', 'choferes']        as const,
  camiones:        ['logistica', 'camiones']        as const,
  bateas:          ['logistica', 'bateas']          as const,
  canteras:        ['logistica', 'canteras']        as const,
  depositos:       ['logistica', 'depositos']       as const,
  rutas:           ['logistica', 'rutas']           as const,
  tramos:          ['logistica', 'tramos']          as const,
  viajes:          ['logistica', 'viajes']          as const,
  liquidaciones:   ['logistica', 'liquidaciones']   as const,
  adelantos:       ['logistica', 'adelantos']       as const,
  tarifasCantera:  ['logistica', 'tarifas_cantera'] as const,
  empresas:        ['logistica', 'empresas']        as const,
  tarifasEmpresa:  ['logistica', 'tarifas_empresa'] as const,
  cobros:          ['logistica', 'cobros']          as const,
  gastos:          ['logistica', 'gastos']          as const,
  gastosCategorias:['logistica', 'gastos_categorias'] as const,
}

// ── Choferes ──
export function useChoferes() {
  return useQuery({
    queryKey: LOG_KEYS.choferes,
    queryFn:  () => apiGet<Chofer[]>('/api/logistica/choferes'),
  })
}

export function useCreateChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Chofer, 'id'>) =>
      apiPost<Chofer>('/api/logistica/choferes', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.choferes }),
  })
}

export function useUpdateChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Chofer> }) =>
      apiPatch<Chofer>(`/api/logistica/choferes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.choferes }),
  })
}

export function useDeleteChofer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/choferes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.choferes }),
  })
}

// ── Camiones ──
export function useCamiones() {
  return useQuery({
    queryKey: LOG_KEYS.camiones,
    queryFn:  () => apiGet<Camion[]>('/api/logistica/camiones'),
  })
}

export function useCreateCamion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Camion, 'id'>) =>
      apiPost<Camion>('/api/logistica/camiones', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.camiones }),
  })
}

export function useUpdateCamion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Camion> }) =>
      apiPatch<Camion>(`/api/logistica/camiones/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.camiones }),
  })
}

export function useDeleteCamion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/camiones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.camiones }),
  })
}

// ── Bateas ──
export function useBateas() {
  return useQuery({
    queryKey: LOG_KEYS.bateas,
    queryFn:  () => apiGet<Batea[]>('/api/logistica/bateas'),
  })
}

export function useCreateBatea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Batea, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>) =>
      apiPost<Batea>('/api/logistica/bateas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.bateas }),
  })
}

export function useUpdateBatea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Batea> }) =>
      apiPatch<Batea>(`/api/logistica/bateas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.bateas }),
  })
}

export function useDeleteBatea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/bateas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.bateas }),
  })
}

// ── Lugares ──
export function useCanteras() {
  return useQuery({
    queryKey: LOG_KEYS.canteras,
    queryFn:  () => apiGet<Cantera[]>('/api/logistica/lugares/canteras'),
  })
}

export function useDepositos() {
  return useQuery({
    queryKey: LOG_KEYS.depositos,
    queryFn:  () => apiGet<Deposito[]>('/api/logistica/lugares/depositos'),
  })
}

export function useRutas() {
  return useQuery({
    queryKey: LOG_KEYS.rutas,
    queryFn:  () => apiGet<Ruta[]>('/api/logistica/lugares/rutas'),
  })
}

// ── Tramos ──
export function useTramos() {
  return useQuery({
    queryKey: LOG_KEYS.tramos,
    queryFn:  () => apiGet<Tramo[]>('/api/logistica/tramos'),
  })
}

export function useCreateTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<Tramo, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>) =>
      apiPost<Tramo>('/api/logistica/tramos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

export function useUpdateTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Tramo> }) =>
      apiPatch<Tramo>(`/api/logistica/tramos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

export function useRegistrarDescargaTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { fecha_descarga: string; toneladas_descarga?: number; remito_descarga?: string; remito_descarga_img_url?: string | null } }) =>
      apiPost(`/api/logistica/tramos/${id}/descarga`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

// Revierte el registro de descarga de un tramo (fecha, toneladas, remito,
// imagen) y lo deja en estado 'en_curso'. El backend rechaza si el tramo
// está liquidado (409 TRAMO_LIQUIDADO) o cobrado (409 TRAMO_COBRADO).
export function useRevertirDescargaTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<Tramo>(`/api/logistica/tramos/${id}/revertir-descarga`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

export function useDeleteTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/tramos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

export function useMoverTramo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dir }: { id: number; dir: 'up' | 'down' }) =>
      apiPost<{ moved: boolean }>(`/api/logistica/tramos/${id}/mover`, { dir }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tramos }),
  })
}

// ── Viajes (legacy) ──
export function useViajes() {
  return useQuery({
    queryKey: LOG_KEYS.viajes,
    queryFn:  () => apiGet<Viaje[]>('/api/logistica/viajes'),
  })
}

export function useCreateViaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { chofer_id: number; camion_id: number; obs?: string }) =>
      apiPost<Viaje>('/api/logistica/viajes', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useRegistrarCarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: {
      viaje_id: number
      fecha: string
      cantera_id: number
      toneladas?: number
      remito_num?: string
      obs?: string
    }) => apiPost('/api/logistica/viajes/carga', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useRegistrarDescarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: {
      viaje_id: number
      fecha: string
      deposito_id: number
      toneladas?: number
      remito_num?: string
      obs?: string
    }) => apiPost('/api/logistica/viajes/descarga', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useUpdateViaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { chofer_id?: number; camion_id?: number; obs?: string } }) =>
      apiPatch(`/api/logistica/viajes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useUpdateCarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { fecha?: string; cantera_id?: number; toneladas?: number; remito_num?: string; obs?: string } }) =>
      apiPatch(`/api/logistica/viajes/carga/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useUpdateDescarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { fecha?: string; deposito_id?: number; toneladas?: number; remito_num?: string; obs?: string } }) =>
      apiPatch(`/api/logistica/viajes/descarga/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

export function useDeleteViaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/viajes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.viajes }),
  })
}

// ── Liquidaciones ──
export function useLiquidaciones() {
  return useQuery({
    queryKey: LOG_KEYS.liquidaciones,
    queryFn:  () => apiGet<Liquidacion[]>('/api/logistica/liquidaciones'),
  })
}

export function useAdelantos() {
  return useQuery({
    queryKey: LOG_KEYS.adelantos,
    queryFn:  () => apiGet<Adelanto[]>('/api/logistica/liquidaciones/adelantos'),
  })
}

export function useCreateLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<Liquidacion>('/api/logistica/liquidaciones', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.liquidaciones })
      qc.invalidateQueries({ queryKey: LOG_KEYS.adelantos })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

export function useUpdateLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<Liquidacion>(`/api/logistica/liquidaciones/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.liquidaciones }),
  })
}

export function useCerrarLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiPatch<Liquidacion>(`/api/logistica/liquidaciones/${id}/cerrar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.liquidaciones })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

export function useReabrirLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiPatch<Liquidacion>(`/api/logistica/liquidaciones/${id}/reabrir`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.liquidaciones })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

export function useDeleteLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/liquidaciones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.liquidaciones })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

export function useCreateAdelanto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { chofer_id: number; fecha: string; monto: number; descripcion?: string }) =>
      apiPost<Adelanto>('/api/logistica/liquidaciones/adelantos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.adelantos }),
  })
}

export function useUpdateAdelanto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: { fecha?: string; monto?: number; descripcion?: string } }) =>
      apiPatch<Adelanto>(`/api/logistica/liquidaciones/adelantos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.adelantos }),
  })
}

export function useDeleteAdelanto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/liquidaciones/adelantos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.adelantos }),
  })
}

// ── Tarifas cantera ──
export function useTarifasCantera() {
  return useQuery({
    queryKey: LOG_KEYS.tarifasCantera,
    queryFn:  () => apiGet<TarifaCantera[]>('/api/logistica/tarifas/canteras'),
  })
}

export function useUpsertTarifaCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { cantera_id: number; valor_ton: number; obs?: string }) =>
      apiPost<TarifaCantera>('/api/logistica/tarifas/canteras', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tarifasCantera }),
  })
}

export function useDeleteTarifaCantera() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/tarifas/canteras/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tarifasCantera }),
  })
}

// ── Empresas transportistas ──
export function useEmpresas() {
  return useQuery({
    queryKey: LOG_KEYS.empresas,
    queryFn:  () => apiGet<EmpresaTransportista[]>('/api/logistica/empresas'),
  })
}

export function useCreateEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Omit<EmpresaTransportista, 'id'>) =>
      apiPost<EmpresaTransportista>('/api/logistica/empresas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.empresas }),
  })
}

export function useUpdateEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<EmpresaTransportista> }) =>
      apiPatch<EmpresaTransportista>(`/api/logistica/empresas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.empresas }),
  })
}

export function useDeleteEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/empresas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.empresas }),
  })
}

// ── Tarifas empresa × cantera ──
export function useTarifasEmpresa() {
  return useQuery({
    queryKey: LOG_KEYS.tarifasEmpresa,
    queryFn:  () => apiGet<TarifaEmpresaCantera[]>('/api/logistica/empresas/tarifas'),
  })
}

export function useUpsertTarifaEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: { empresa_id: number; cantera_id: number; valor_ton: number; vigente_desde: string; obs?: string }) =>
      apiPost<TarifaEmpresaCantera>('/api/logistica/empresas/tarifas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tarifasEmpresa }),
  })
}

export function useDeleteTarifaEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/empresas/tarifas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.tarifasEmpresa }),
  })
}

// ── Cobros ──
export function useCobros() {
  return useQuery({
    queryKey: LOG_KEYS.cobros,
    queryFn:  () => apiGet<Cobro[]>('/api/logistica/cobros'),
  })
}

export function useCreateCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<Cobro>('/api/logistica/cobros', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.cobros })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

export function useMarcarCobrado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPatch<Cobro>(`/api/logistica/cobros/${id}/cobrar`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.cobros }),
  })
}

export function useDeleteCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/cobros/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.cobros })
      qc.invalidateQueries({ queryKey: LOG_KEYS.tramos })
    },
  })
}

// ── Gastos de logística ───────────────────────────────────────
export type GastoCategoria = {
  id: number; codigo: string; nombre: string; aplica_a: 'camion' | 'chofer' | 'ambos'
  activo: boolean; orden: number
}

export type TipoCombustible = 'gasoil' | 'nafta' | 'nafta_super' | 'adblue'

export type CargaCombustibleMeta = {
  litros: number
  odometro_km: number | null
  tipo_combustible: TipoCombustible
  tanque_lleno: boolean
  warnings: Array<{ code: string; detail?: unknown }>
  obs: string
}

export type Gasto = {
  id: number
  camion_id: number | null; chofer_id: number | null; tramo_id: number | null; lugar_id: number | null
  categoria_id: number
  categoria?: GastoCategoria
  fecha: string
  monto: number
  descripcion: string
  proveedor: string | null
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'cta_cte' | 'otro'
  pagado_por: 'empresa' | 'chofer'
  comprobante_url: string | null
  comprobante_nro: string
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'pagado'
  aprobado_por: string | null; aprobado_at: string | null; motivo_rechazo: string | null
  liquidacion_id: number | null; adelanto_id: number | null
  obs: string
  carga_combustible: CargaCombustibleMeta | null
  warnings?: Array<{ code: string; detail?: unknown }>  // solo en response de create
  created_by: string; created_at: string; updated_at: string
}

export type GastosFilters = {
  chofer_id?: number; camion_id?: number; tramo_id?: number; categoria_id?: number
  estado?: Gasto['estado']; pagado_por?: Gasto['pagado_por']
  desde?: string; hasta?: string; liquidado?: boolean; q?: string
  limit?: number; offset?: number
}

export type GastosListResponse = {
  items: Gasto[]; total: number; limit: number; offset: number; hasMore: boolean
}

function qsFromFilters(f: GastosFilters): string {
  const p = new URLSearchParams()
  Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)) })
  return p.toString() ? `?${p.toString()}` : ''
}

export function useGastosCategorias() {
  return useQuery({
    queryKey: LOG_KEYS.gastosCategorias,
    queryFn:  () => apiGet<GastoCategoria[]>('/api/logistica/gastos/categorias'),
    staleTime: 10 * 60 * 1000,
  })
}

export function useGastos(filters: GastosFilters = {}) {
  return useQuery({
    queryKey: [...LOG_KEYS.gastos, filters],
    queryFn:  () => apiGet<GastosListResponse>(`/api/logistica/gastos${qsFromFilters(filters)}`),
  })
}

export function useGasto(id: number | null) {
  return useQuery({
    queryKey: [...LOG_KEYS.gastos, id],
    queryFn:  () => apiGet<Gasto>(`/api/logistica/gastos/${id}`),
    enabled:  id != null,
  })
}

export function useCreateGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Gasto> & { comprobante_path?: string | null }) =>
      apiPost<Gasto>('/api/logistica/gastos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

export function useUpdateGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Gasto> & { comprobante_path?: string | null } }) =>
      apiPatch<Gasto>(`/api/logistica/gastos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

export function useDeleteGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/gastos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

export function useAprobarGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<Gasto>(`/api/logistica/gastos/${id}/aprobar`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

export function useRechazarGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo_rechazo }: { id: number; motivo_rechazo: string }) =>
      apiPost<Gasto>(`/api/logistica/gastos/${id}/rechazar`, { motivo_rechazo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

export function useMarcarGastoPagado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<Gasto>(`/api/logistica/gastos/${id}/marcar-pagado`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOG_KEYS.gastos }),
  })
}

// Reintegros pendientes de un chofer — gastos pagados por él, aprobados,
// todavía no vinculados a liquidación. Usado por el form de liquidación.
export type GastoReintegro = {
  id: number
  fecha: string
  categoria_id: number
  monto: number
  descripcion: string
  proveedor: string | null
  comprobante_url: string | null
  comprobante_nro: string
  categoria?: { codigo: string; nombre: string }
}

export function useGastosReintegrosPendientes(choferId: number | null, hasta?: string) {
  return useQuery({
    queryKey: ['logistica','gastos','reintegros-pendientes', choferId, hasta] as const,
    queryFn:  () => {
      const q = new URLSearchParams({ chofer_id: String(choferId) })
      if (hasta) q.set('hasta', hasta)
      return apiGet<{ items: GastoReintegro[]; total: number; count: number }>(
        `/api/logistica/gastos/reintegros-pendientes?${q.toString()}`,
      )
    },
    enabled: !!choferId,
  })
}

// ── Reportes de consumo de combustible ────────────────────────
export type ConsumoCamion = {
  camion: { id: number; patente: string } | null
  filas: Array<{
    camion_id: number
    fecha: string
    odometro_km: number
    km_recorridos: number
    litros_intervalo: number
    km_por_litro: number | null
  }>
  total_km: number
  total_litros: number
  km_por_litro_promedio: number | null
}
export type ConsumoChoferMes = {
  chofer_id: number
  mes: string
  km_recorridos: number | null
  litros: number | null
  gasto_combustible: number | null
  cargas_count: number | null
  km_por_litro: number | null
  chofer?: { id: number; nombre: string }
}
export type RankingChofer = {
  chofer_id: number
  nombre: string
  total_km: number
  total_litros: number
  total_gasto: number
  cargas_count: number
  km_por_litro: number
}

export function useReporteConsumoCamion(camionId: number | null, desde: string, hasta: string) {
  return useQuery({
    queryKey: ['logistica','consumo','por-camion', camionId, desde, hasta] as const,
    queryFn:  () => apiGet<ConsumoCamion>(
      `/api/logistica/gastos/reportes/consumo-camion?camion_id=${camionId}&desde=${desde}&hasta=${hasta}`,
    ),
    enabled: !!camionId && !!desde && !!hasta,
    staleTime: 60_000,
  })
}

export function useReporteConsumoChoferMes(desde: string, hasta: string, choferId?: number, enabled = true) {
  return useQuery({
    queryKey: ['logistica','consumo','chofer-mes', desde, hasta, choferId] as const,
    queryFn:  () => {
      const q = new URLSearchParams({ desde, hasta })
      if (choferId) q.set('chofer_id', String(choferId))
      return apiGet<{ items: ConsumoChoferMes[] }>(
        `/api/logistica/gastos/reportes/consumo-chofer-mes?${q.toString()}`,
      )
    },
    enabled: !!desde && !!hasta && enabled,
    staleTime: 60_000,
  })
}

export function useRankingChoferesCombustible(desde: string, hasta: string, limit = 20, enabled = true) {
  return useQuery({
    queryKey: ['logistica','consumo','ranking', desde, hasta, limit] as const,
    queryFn:  () => apiGet<{ items: RankingChofer[]; umbral_min_cargas: number }>(
      `/api/logistica/gastos/reportes/ranking-choferes?desde=${desde}&hasta=${hasta}&limit=${limit}`,
    ),
    enabled: !!desde && !!hasta && enabled,
    staleTime: 60_000,
  })
}

// ── Reportes ──────────────────────────────────────────────────
export type ResumenReporte = {
  total: number
  count: number
  promedio: number
  reintegros_pendientes: number
  pendientes_aprobacion: number
  por_estado:      Record<string, { total: number; count: number }>
  por_pagado_por:  Record<string, { total: number; count: number }>
  por_metodo_pago: Record<string, { total: number; count: number }>
}
export type ReportePorCamion    = { camion_id: number; patente: string; total: number; count: number; por_categoria: Record<string, number> }
export type ReportePorChofer    = { chofer_id: number; nombre: string; total: number; count: number; reintegros_pendientes: number; por_categoria: Record<string, number> }
export type ReportePorCategoria = { categoria_id: number; codigo: string; nombre: string; orden: number; total: number; count: number; pct: number }

function reporteQs(desde: string, hasta: string) {
  return `?desde=${desde}&hasta=${hasta}`
}

export function useGastosResumen(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ['logistica','gastos','reporte','resumen', desde, hasta] as const,
    queryFn:  () => apiGet<ResumenReporte>(`/api/logistica/gastos/reportes/resumen${reporteQs(desde, hasta)}`),
    enabled,
  })
}

export function useGastosPorCamion(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ['logistica','gastos','reporte','por-camion', desde, hasta] as const,
    queryFn:  () => apiGet<ReportePorCamion[]>(`/api/logistica/gastos/reportes/por-camion${reporteQs(desde, hasta)}`),
    enabled,
  })
}

export function useGastosPorChofer(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ['logistica','gastos','reporte','por-chofer', desde, hasta] as const,
    queryFn:  () => apiGet<ReportePorChofer[]>(`/api/logistica/gastos/reportes/por-chofer${reporteQs(desde, hasta)}`),
    enabled,
  })
}

export function useGastosPorCategoria(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: ['logistica','gastos','reporte','por-categoria', desde, hasta] as const,
    queryFn:  () => apiGet<ReportePorCategoria[]>(`/api/logistica/gastos/reportes/por-categoria${reporteQs(desde, hasta)}`),
    enabled,
  })
}

// Flujo de upload: 1) pedir signed URL al backend, 2) PUT directo al
// bucket privado. Devuelve el `path` para guardar en el gasto al crear.
export async function uploadComprobanteGasto(file: File): Promise<{ path: string }> {
  const { path, signedUrl } = await apiPost<{ path: string; signedUrl: string; token: string }>(
    '/api/logistica/gastos/upload-comprobante',
    { filename: file.name, content_type: file.type, size_bytes: file.size },
  )
  const res = await fetch(signedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
    body:    file,
  })
  if (!res.ok) throw new Error(`Upload falló: ${res.status}`)
  return { path }
}

export function useGastoComprobanteUrl(id: number | null) {
  return useQuery({
    queryKey: ['logistica', 'gastos', id, 'comprobante-url'] as const,
    queryFn:  () => apiGet<{ signedUrl: string; expiresIn: number }>(`/api/logistica/gastos/${id}/comprobante-url`),
    enabled:  id != null,
    staleTime: 10 * 60 * 1000, // 10 min — la URL firmada dura 15
  })
}