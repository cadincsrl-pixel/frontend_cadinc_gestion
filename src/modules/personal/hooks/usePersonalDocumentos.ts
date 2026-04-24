import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import type { PersonalDocumento, PersonalDocTipo } from '@/types/domain.types'

export const PERSONAL_DOCS_KEY = ['personal-docs'] as const

// ── Queries ──────────────────────────────────────────────────────

export function usePersonalDocumentos(leg: string) {
  return useQuery({
    queryKey: [...PERSONAL_DOCS_KEY, leg],
    queryFn:  () => apiGet<PersonalDocumento[]>(`/api/personal/${encodeURIComponent(leg)}/documentos`),
    enabled:  !!leg,
    staleTime: 30_000,
  })
}

// ── Upload flow ──────────────────────────────────────────────────
//
// 1. POST /upload-url → recibe signed upload URL + path.
// 2. PUT a la signed URL con el File directo al bucket.
// 3. POST /documentos con el path + metadata → crea row.
//
// El hook `useUploadDocumento` encapsula los 3 pasos en una sola mutación.

interface UploadInput {
  leg:  string
  file: File
  tipo: PersonalDocTipo
  obs?: string
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       PersonalDocTipo
}

export function useUploadDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leg, file, tipo, obs }: UploadInput) => {
      // 1) Obtener signed upload URL
      const up = await apiPost<UploadUrlResponse>(
        `/api/personal/${encodeURIComponent(leg)}/documentos/upload-url`,
        {
          tipo,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
        },
      )

      // 2) Upload directo al bucket
      const putRes = await fetch(up.signed_url, {
        method:  'PUT',
        body:    file,
        headers: { 'content-type': file.type },
      })
      if (!putRes.ok) {
        throw new Error(`Error al subir archivo al storage (${putRes.status})`)
      }

      // 3) Registrar en DB
      const doc = await apiPost<PersonalDocumento>(
        `/api/personal/${encodeURIComponent(leg)}/documentos`,
        {
          tipo,
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
          obs:            obs ?? undefined,
        },
      )
      return doc
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...PERSONAL_DOCS_KEY, vars.leg] })
    },
  })
}

// ── View / download (signed URL 15 min) ─────────────────────────

export async function fetchDocSignedUrl(leg: string, id: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/personal/${encodeURIComponent(leg)}/documentos/${id}/signed-url`,
  )
  return data.url
}

// ── Delete ───────────────────────────────────────────────────────

export function useDeleteDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leg, id }: { leg: string; id: number }) =>
      apiDelete<{ success: boolean; id: number }>(
        `/api/personal/${encodeURIComponent(leg)}/documentos/${id}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...PERSONAL_DOCS_KEY, vars.leg] })
    },
  })
}
