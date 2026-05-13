'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'
import type {
  FlotaGpsSyncIndividualResp,
  FlotaGpsSyncLog,
  FlotaGpsSyncResumen,
} from '@/types/domain.types'
import { FLOTA_KEY } from './useFlotaVehiculos'

export const FLOTA_GPS_LOG_KEY = ['flota', 'gps-log'] as const

// Códigos de error de negocio que devuelve el backend en `error` del body.
// `apiClient.parseError` los pone como `message` del HttpError, así que los
// matcheamos por string. Si en algún momento cambia el contrato y devuelve
// {code, message} por separado, conviene exponer `body` desde HttpError.
const ERR_MENSAJES: Record<string, string> = {
  VEHICULO_SIN_DEVICE_ID:    'Este vehículo no tiene un ID MobilQuest cargado. Asignalo desde el modo edición antes de sincronizar.',
  VEHICULO_SIN_LECTURA_GPS:  'MobilQuest no reportó lecturas para este vehículo en este ciclo. Probá de nuevo en unos minutos.',
  VEHICULO_NO_EXISTE:        'El vehículo ya no existe.',
}

export function mensajeAmigableErrorSync(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message
    // El backend devuelve el code en `error`, parseError lo usa como message.
    for (const code of Object.keys(ERR_MENSAJES)) {
      if (m.includes(code)) return ERR_MENSAJES[code]
    }
    return m
  }
  return 'Error al sincronizar GPS'
}

// ── Sync individual (un vehículo) ─────────────────────────────────────────
export function useFlotaSyncIndividual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vehiculoId: number) =>
      apiPost<FlotaGpsSyncIndividualResp>(`/api/flota/gps/sync/${vehiculoId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FLOTA_KEY })
      qc.invalidateQueries({ queryKey: FLOTA_GPS_LOG_KEY })
    },
  })
}

// ── Sync de toda la flota ─────────────────────────────────────────────────
export function useFlotaSyncTodos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<FlotaGpsSyncResumen>('/api/flota/gps/sync-todos', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FLOTA_KEY })
      qc.invalidateQueries({ queryKey: FLOTA_GPS_LOG_KEY })
    },
  })
}

// ── Bitácora del GPS para un vehículo ─────────────────────────────────────
// Sólo se ejecuta si `vehiculoId` está presente. Default limit=20.
export function useFlotaGpsLog(vehiculoId?: number | null, limit: number = 20) {
  return useQuery({
    queryKey: [...FLOTA_GPS_LOG_KEY, vehiculoId ?? 'none', limit],
    queryFn:  () => apiGet<FlotaGpsSyncLog[]>(
      `/api/flota/gps/log?vehiculo_id=${vehiculoId}&limit=${limit}`,
    ),
    enabled:  !!vehiculoId,
    staleTime: 30_000,
  })
}
