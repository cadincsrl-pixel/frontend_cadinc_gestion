'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { FlotaServicio, FlotaServicioEstadoRow, FlotaTipoServicio } from '@/types/domain.types'

export const FLOTA_SRV_KEY    = ['flota', 'servicios'] as const
export const FLOTA_SRV_EST_KEY = ['flota', 'servicios', 'estado'] as const
export const FLOTA_TIPOS_KEY  = ['flota', 'tipos-servicio'] as const

// ── Catálogo de tipos ──────────────────────────────────────────────────────
export function useFlotaTiposServicio() {
  return useQuery({
    queryKey: FLOTA_TIPOS_KEY,
    queryFn:  () => apiGet<FlotaTipoServicio[]>('/api/flota/tipos-servicio'),
    staleTime: 5 * 60_000,
  })
}

export function useCreateFlotaTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<FlotaTipoServicio>) => apiPost<FlotaTipoServicio>('/api/flota/tipos-servicio', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: FLOTA_TIPOS_KEY }),
  })
}

export function useUpdateFlotaTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<FlotaTipoServicio> }) =>
      apiPatch<FlotaTipoServicio>(`/api/flota/tipos-servicio/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: FLOTA_TIPOS_KEY }),
  })
}

export function useDeleteFlotaTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/flota/tipos-servicio/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: FLOTA_TIPOS_KEY }),
  })
}

// ── Servicios ──────────────────────────────────────────────────────────────
export function useFlotaServicios(vehiculoId?: number) {
  return useQuery({
    queryKey: [...FLOTA_SRV_KEY, vehiculoId ?? 'all'],
    queryFn:  () => {
      const qs = vehiculoId ? `?vehiculo_id=${vehiculoId}` : ''
      return apiGet<FlotaServicio[]>(`/api/flota/servicios${qs}`)
    },
  })
}

export function useFlotaServiciosEstado() {
  return useQuery({
    queryKey: FLOTA_SRV_EST_KEY,
    queryFn:  () => apiGet<FlotaServicioEstadoRow[]>('/api/flota/servicios/estado'),
    staleTime: 60_000,
  })
}

interface UploadUrlResp {
  path: string
  token: string
  signed_url: string
}

interface CreateServicioInput {
  vehiculo_id:    number
  tipo_id?:       number | null
  tipo_libre?:    string | null
  fecha:          string
  km_service:     number
  km_proximo?:    number | null
  fecha_proximo?: string | null
  descripcion?:   string | null
  costo?:         number | null
  proveedor?:     string | null
  obs?:           string | null
  comprobante?:   File | null
}

export function useCreateFlotaServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateServicioInput) => {
      // Subir comprobante si vino archivo
      let comprobante_path: string | null = null
      if (input.comprobante) {
        if (input.comprobante.size > 5 * 1024 * 1024) {
          throw new Error('Comprobante demasiado grande (máx 5 MB)')
        }
        const up = await apiPost<UploadUrlResp>(
          `/api/flota/servicios/upload-url?vehiculo_id=${input.vehiculo_id}`,
          {
            nombre_archivo: input.comprobante.name,
            mime_type:      input.comprobante.type,
            size_bytes:     input.comprobante.size,
          },
        )
        const putRes = await fetch(up.signed_url, {
          method:  'PUT',
          body:    input.comprobante,
          headers: { 'content-type': input.comprobante.type },
        })
        if (!putRes.ok) throw new Error(`Error al subir comprobante (${putRes.status})`)
        comprobante_path = up.path
      }

      const { comprobante: _, ...rest } = input
      const created = await apiPost<FlotaServicio>('/api/flota/servicios', {
        ...rest,
        comprobante_path,
      })
      return created
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...FLOTA_SRV_KEY, vars.vehiculo_id] })
      qc.invalidateQueries({ queryKey: [...FLOTA_SRV_KEY, 'all'] })
      qc.invalidateQueries({ queryKey: FLOTA_SRV_EST_KEY })
    },
  })
}

export function useUpdateFlotaServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<FlotaServicio> }) =>
      apiPatch<FlotaServicio>(`/api/flota/servicios/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FLOTA_SRV_KEY })
      qc.invalidateQueries({ queryKey: FLOTA_SRV_EST_KEY })
    },
  })
}

export function useDeleteFlotaServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/flota/servicios/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: FLOTA_SRV_KEY })
      qc.invalidateQueries({ queryKey: FLOTA_SRV_EST_KEY })
    },
  })
}

export async function fetchFlotaServicioComprobanteUrl(id: number): Promise<string> {
  const data = await apiGet<{ url: string }>(`/api/flota/servicios/${id}/comprobante-url`)
  return data.url
}
