import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import { LOG_KEYS } from './useLogistica'
import type { GpsSyncLog, GpsSyncEstado } from '@/types/domain.types'

// ── Query keys ──
export const GPS_KEYS = {
  log:         ['logistica', 'gps', 'log']         as const,
  sinAsignar:  ['logistica', 'gps', 'sin-asignar'] as const,
}

// ── Tipos auxiliares (matchean lo que devuelve el backend) ──
export interface SyncResultItem {
  camion_id:       number | null
  patente_gps:     string | null
  id_vehiculo_gps: string
  estado:          GpsSyncEstado
  km_anterior:     number | null
  km_nuevo:        number | null
  error_mensaje:   string | null
}

export interface SyncResumen {
  total:        number
  ok:           number
  sin_cambio:   number
  no_match:     number
  error:        number
  duracion_ms:  number
  items:        SyncResultItem[]
}

export interface VehiculoSinAsignar {
  id_vehiculo_gps: string
  patente_gps:     string | null
  lectura_gps_en:  string | null
  created_at:      string
}

// ── Mutations ──

// Sincroniza TODOS los camiones contra Mobile Quest. Invalida la lista de
// camiones para refrescar km_actuales + estado de service.
export function useSyncGpsTodos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<SyncResumen>('/api/logistica/gps/sync-todos', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.camiones })
      qc.invalidateQueries({ queryKey: ['camion-services'] })
      qc.invalidateQueries({ queryKey: GPS_KEYS.log })
      qc.invalidateQueries({ queryKey: GPS_KEYS.sinAsignar })
    },
  })
}

// Sincroniza UN camión solo (igual hace el batch internamente, pero
// devuelve solo el resultado de ese camión).
export function useSyncGpsCamion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (camionId: number) =>
      apiPost<SyncResultItem>(`/api/logistica/gps/sync/${camionId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.camiones })
      qc.invalidateQueries({ queryKey: ['camion-services'] })
      qc.invalidateQueries({ queryKey: GPS_KEYS.log })
    },
  })
}

// Asigna manualmente (o desasigna con null) un id_vehiculo_gps a un camión.
export function useSetIdVehiculoGps() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ camionId, idVehiculoGps }: { camionId: number; idVehiculoGps: string | null }) =>
      apiPatch<{ id: number; patente: string; id_vehiculo_gps: string | null }>(
        `/api/logistica/gps/camion/${camionId}/id-vehiculo`,
        { id_vehiculo_gps: idVehiculoGps },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOG_KEYS.camiones })
      qc.invalidateQueries({ queryKey: GPS_KEYS.sinAsignar })
    },
  })
}

// ── Queries ──

interface LogQueryOpts {
  camionId?: number
  estado?:   GpsSyncEstado
  limit?:    number
}

export function useGpsSyncLog(opts: LogQueryOpts = {}) {
  const params = new URLSearchParams()
  if (opts.camionId != null) params.set('camion_id', String(opts.camionId))
  if (opts.estado)           params.set('estado', opts.estado)
  if (opts.limit != null)    params.set('limit', String(opts.limit))
  const qs = params.toString()
  return useQuery({
    queryKey: [...GPS_KEYS.log, opts.camionId, opts.estado, opts.limit],
    queryFn:  () => apiGet<GpsSyncLog[]>(`/api/logistica/gps/log${qs ? '?' + qs : ''}`),
    staleTime: 30_000,
  })
}

export function useGpsSinAsignar() {
  return useQuery({
    queryKey: GPS_KEYS.sinAsignar,
    queryFn:  () => apiGet<VehiculoSinAsignar[]>('/api/logistica/gps/sin-asignar'),
    staleTime: 60_000,
  })
}
