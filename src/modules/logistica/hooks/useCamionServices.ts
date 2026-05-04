import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { LOG_KEYS } from './useLogistica'
import type { CamionService, CamionServiceEstado } from '@/types/domain.types'

// ── Query keys ──
export const CAMION_SERVICES_KEY = ['camion-services'] as const
export const CAMION_SERVICES_ESTADO_KEY = ['camion-services', 'estado'] as const
export const CAMION_SERVICES_NOTIF_KEY = ['logistica', 'notificaciones', 'camion-services'] as const

// ── GETs ──

// Estado actual de TODOS los camiones (vista v_camion_service_estado).
// Se usa para mostrar badges en la lista de camiones y para la campana
// de notificaciones.
export function useCamionServiceEstadoTodos() {
  return useQuery({
    queryKey: CAMION_SERVICES_ESTADO_KEY,
    queryFn:  () => apiGet<CamionServiceEstado[]>('/api/logistica/camion-services/estado'),
    staleTime: 60_000,
  })
}

// Histórico de services de un camión, orden fecha desc.
export function useCamionServices(camionId: number | null) {
  return useQuery({
    queryKey: [...CAMION_SERVICES_KEY, 'historial', camionId],
    queryFn:  () => apiGet<CamionService[]>(
      `/api/logistica/camion-services?camion_id=${camionId}`,
    ),
    enabled:  !!camionId,
    staleTime: 60_000,
  })
}

// ── Upload comprobante (signed URL pattern) ──
//
// 1) POST /upload-comprobante con metadata → backend devuelve {path, signedUrl}.
// 2) PUT del archivo al signedUrl con el content-type correcto.
// 3) Devolvemos el path para guardarlo en el service vía createCamionService.
export async function uploadComprobanteService(
  camionId: number,
  file: File,
): Promise<string> {
  const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
  if (!(TIPOS_OK as readonly string[]).includes(file.type)) {
    throw new Error('Tipo de archivo no soportado (jpg, png, webp o pdf)')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('El archivo supera 10 MB')
  }
  const { path, signedUrl } = await apiPost<{
    path: string; signedUrl: string; token: string; expiresIn: number
  }>(
    '/api/logistica/camion-services/upload-comprobante',
    {
      camion_id:    camionId,
      filename:     file.name,
      content_type: file.type,
      size_bytes:   file.size,
    },
  )
  const res = await fetch(signedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type },
    body:    file,
  })
  if (!res.ok) throw new Error(`Falló la subida (${res.status})`)
  return path
}

// Pide signed URL (15 min) para descargar el comprobante de un service.
export async function fetchServiceComprobanteUrl(serviceId: number): Promise<string> {
  const { signedUrl } = await apiGet<{ signedUrl: string; expiresIn: number }>(
    `/api/logistica/camion-services/${serviceId}/comprobante-url`,
  )
  return signedUrl
}

// ── Mutations ──

interface CreateServiceDto {
  camion_id:        number
  fecha?:           string
  km_service:       number
  km_proximo:       number
  obs?:             string | null
  comprobante_path?: string | null
}

// Helper común: crear service también puede haber actualizado km_actuales del
// camión (lógica del backend), y agrega/cambia el estado del camión en la
// vista v_camion_service_estado, así que invalidamos todo lo que depende.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CAMION_SERVICES_KEY })
  qc.invalidateQueries({ queryKey: LOG_KEYS.camiones })
  qc.invalidateQueries({ queryKey: CAMION_SERVICES_NOTIF_KEY })
}

export function useCreateCamionService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateServiceDto) =>
      apiPost<CamionService>('/api/logistica/camion-services', dto),
    onSuccess: () => invalidateAll(qc),
  })
}

interface UpdateServiceDto {
  fecha?:           string
  km_service?:      number
  km_proximo?:      number
  obs?:             string | null
  comprobante_path?: string | null
}

export function useUpdateCamionService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateServiceDto }) =>
      apiPatch<CamionService>(`/api/logistica/camion-services/${id}`, dto),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteCamionService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiDelete<{ success: boolean }>(`/api/logistica/camion-services/${id}`),
    onSuccess: () => invalidateAll(qc),
  })
}
