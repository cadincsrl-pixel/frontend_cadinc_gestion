import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api/client'
import type {
  Chofer, Camion, Cantera, Deposito, Ruta,
  Tramo, Viaje, Liquidacion, Adelanto, TarifaCantera,
  EmpresaTransportista, TarifaEmpresaCantera, Cobro,
} from '@/types/domain.types'

// ── Keys ──
export const LOG_KEYS = {
  choferes:        ['logistica', 'choferes']        as const,
  camiones:        ['logistica', 'camiones']        as const,
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