'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { FlotaDocumento, FlotaDocTipo } from '@/types/domain.types'

export const FLOTA_DOCS_KEY = ['flota-docs'] as const

function basePath(vehiculoId: number): string {
  return `/api/flota/vehiculos/${vehiculoId}`
}

export function useFlotaDocumentos(vehiculoId: number | null) {
  return useQuery({
    queryKey: [...FLOTA_DOCS_KEY, vehiculoId],
    queryFn:  () => apiGet<FlotaDocumento[]>(`${basePath(vehiculoId!)}/documentos`),
    enabled:  !!vehiculoId,
    staleTime: 30_000,
  })
}

interface UploadInput {
  vehiculoId:    number
  file:          File
  tipo:          FlotaDocTipo
  numero_serie?: string | null
  vence_el?:     string | null
  obs?:          string | null
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       FlotaDocTipo
}

export function useUploadFlotaDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ vehiculoId, file, tipo, numero_serie, vence_el, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `${basePath(vehiculoId)}/documentos/upload-url`,
        {
          tipo,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )
      const putRes = await fetch(up.signed_url, {
        method:  'PUT',
        body:    file,
        headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      const doc = await apiPost<FlotaDocumento>(
        `${basePath(vehiculoId)}/documentos`,
        {
          tipo,
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
          numero_serie:   numero_serie ?? undefined,
          vence_el:       vence_el ?? undefined,
          obs:            obs ?? undefined,
        },
      )
      return doc
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...FLOTA_DOCS_KEY, vars.vehiculoId] })
    },
  })
}

export function useUpdateFlotaDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { vehiculoId, docId, numero_serie, vence_el, obs }:
      { vehiculoId: number; docId: number; numero_serie?: string | null; vence_el?: string | null; obs?: string | null }
    ) =>
      apiPatch<FlotaDocumento>(
        `${basePath(vehiculoId)}/documentos/${docId}`,
        { numero_serie, vence_el, obs },
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...FLOTA_DOCS_KEY, vars.vehiculoId] })
    },
  })
}

export async function fetchFlotaDocSignedUrl(vehiculoId: number, docId: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `${basePath(vehiculoId)}/documentos/${docId}/signed-url`,
  )
  return data.url
}

export function useDeleteFlotaDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { vehiculoId, docId }: { vehiculoId: number; docId: number }
    ) =>
      apiDelete<{ success: boolean; id: number }>(
        `${basePath(vehiculoId)}/documentos/${docId}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...FLOTA_DOCS_KEY, vars.vehiculoId] })
    },
  })
}

// Helper de vencimiento — mismo cálculo que el de logística.
export type EstadoVencimiento = 'sin_vto' | 'vigente' | 'por_vencer' | 'vencido'

export function calcularEstadoVencimiento(vence_el: string | null): {
  estado:        EstadoVencimiento
  diasRestantes: number | null
} {
  if (!vence_el) return { estado: 'sin_vto', diasRestantes: null }
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaVto = new Date(vence_el + 'T00:00:00')
  const diff = Math.round((fechaVto.getTime() - hoy.getTime()) / 86_400_000)
  if (diff < 0)   return { estado: 'vencido',    diasRestantes: diff }
  if (diff <= 30) return { estado: 'por_vencer', diasRestantes: diff }
  return            { estado: 'vigente',    diasRestantes: diff }
}
