'use client'

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'

export interface FlotaNotifDoc {
  doc_id:          number
  entidad:         'flota'
  entidad_id:      number
  entidad_patente: string
  tipo:            string
  vence_el:        string
  nombre_archivo:  string
}

export const FLOTA_NOTIF_KEY = ['flota', 'notificaciones', 'documentos'] as const

export function useFlotaNotificacionesDocs() {
  return useQuery({
    queryKey: FLOTA_NOTIF_KEY,
    queryFn:  () => apiGet<FlotaNotifDoc[]>('/api/flota/notificaciones/documentos'),
    staleTime: 60_000,
  })
}
