import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/lib/api/client'
import type {
  RentabilidadParametros,
  RentabilidadViajeInput,
  ModalidadPago,
} from '@/lib/utils/rentabilidad'

const PARAMS_KEY = ['rentabilidad', 'parametros'] as const
const VIAJES_KEY = ['rentabilidad', 'viajes'] as const

// Lo que devuelve la DB para parámetros (incluye id, vigencia, audit).
export interface ParametrosRow extends RentabilidadParametros {
  id: number
  vigente_desde: string
  vigente_hasta: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ViajeRow extends RentabilidadViajeInput {
  id: number
  nombre: string
  obs: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// ── Parámetros ─────────────────────────────────────────────
export function useRentabilidadParametros() {
  return useQuery({
    queryKey: PARAMS_KEY,
    queryFn: () => apiGet<ParametrosRow | null>('/api/logistica/rentabilidad/parametros'),
  })
}

export function useUpdateParametros() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: RentabilidadParametros) =>
      apiPut<ParametrosRow>('/api/logistica/rentabilidad/parametros', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARAMS_KEY }),
  })
}

// ── Viajes ──────────────────────────────────────────────────
export function useRentabilidadViajes() {
  return useQuery({
    queryKey: VIAJES_KEY,
    queryFn: () => apiGet<ViajeRow[]>('/api/logistica/rentabilidad/viajes'),
  })
}

export interface ViajeUpsertDto {
  nombre:               string
  km_ida:               number
  km_vuelta:            number
  toneladas:            number
  dias_calendario:      number
  viajes_por_mes:       number
  tarifa_neta_por_ton:  number
  precio_gasoil:        number
  consumo_camion:       number
  peajes_total:         number
  chofer_por_km:        number
  chofer_por_dia:       number
  modalidad_pago:       ModalidadPago
  pct_sobre_tarifa:     number
  obs?:                 string | null
}

export function useCreateViajeRentabilidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: ViajeUpsertDto) =>
      apiPost<ViajeRow>('/api/logistica/rentabilidad/viajes', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIAJES_KEY }),
  })
}

export function useUpdateViajeRentabilidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<ViajeUpsertDto> }) =>
      apiPatch<ViajeRow>(`/api/logistica/rentabilidad/viajes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIAJES_KEY }),
  })
}

export function useDeleteViajeRentabilidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/logistica/rentabilidad/viajes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VIAJES_KEY }),
  })
}
