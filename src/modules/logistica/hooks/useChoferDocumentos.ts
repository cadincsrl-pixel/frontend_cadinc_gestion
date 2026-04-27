import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { ChoferDocumento, ChoferDocTipo } from '@/types/domain.types'

export const CHOFER_DOCS_KEY = ['chofer-docs'] as const

// ── Queries ──
export function useChoferDocumentos(choferId: number | null) {
  return useQuery({
    queryKey: [...CHOFER_DOCS_KEY, choferId],
    queryFn:  () => apiGet<ChoferDocumento[]>(`/api/logistica/choferes/${choferId}/documentos`),
    enabled:  !!choferId,
    staleTime: 30_000,
  })
}

// Trae todos los docs de todos los choferes — útil para banner global de
// vencimientos. Por ahora no se usa, lo dejo armado para la mejora futura.
export function useTodosChoferDocs() {
  return useQuery({
    queryKey: [...CHOFER_DOCS_KEY, 'all'],
    queryFn:  () => apiGet<ChoferDocumento[]>('/api/logistica/choferes/documentos/all'),
    staleTime: 60_000,
    enabled: false,   // off por ahora
  })
}

// ── Upload (3 pasos: signed-url → PUT bucket → POST registro) ──
interface UploadInput {
  choferId: number
  file:     File
  tipo:     ChoferDocTipo
  vence_el?: string | null
  obs?:      string
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       ChoferDocTipo
}

export function useUploadChoferDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ choferId, file, tipo, vence_el, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `/api/logistica/choferes/${choferId}/documentos/upload-url`,
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
      if (!putRes.ok) {
        throw new Error(`Error al subir archivo al storage (${putRes.status})`)
      }

      const doc = await apiPost<ChoferDocumento>(
        `/api/logistica/choferes/${choferId}/documentos`,
        {
          tipo,
          storage_path:   up.path,
          nombre_archivo: file.name,
          mime_type:      file.type,
          size_bytes:     file.size,
          vence_el:       vence_el ?? undefined,
          obs:            obs ?? undefined,
        },
      )
      return doc
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...CHOFER_DOCS_KEY, vars.choferId] })
    },
  })
}

// Edita vence_el / obs sin re-subir.
export function useUpdateChoferDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { choferId, id, vence_el, obs }:
      { choferId: number; id: number; vence_el?: string | null; obs?: string | null }
    ) =>
      apiPatch<ChoferDocumento>(
        `/api/logistica/choferes/${choferId}/documentos/${id}`,
        { vence_el, obs },
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...CHOFER_DOCS_KEY, vars.choferId] })
    },
  })
}

export async function fetchChoferDocSignedUrl(choferId: number, id: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/logistica/choferes/${choferId}/documentos/${id}/signed-url`,
  )
  return data.url
}

export function useDeleteChoferDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ choferId, id }: { choferId: number; id: number }) =>
      apiDelete<{ success: boolean; id: number }>(
        `/api/logistica/choferes/${choferId}/documentos/${id}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...CHOFER_DOCS_KEY, vars.choferId] })
    },
  })
}

// ── Helpers de vencimiento ──
export type EstadoVencimiento = 'sin_vto' | 'vigente' | 'por_vencer' | 'vencido'

export function calcularEstadoVencimiento(vence_el: string | null): {
  estado: EstadoVencimiento
  diasRestantes: number | null
} {
  if (!vence_el) return { estado: 'sin_vto', diasRestantes: null }
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaVto = new Date(vence_el + 'T00:00:00')
  const diff = Math.round((fechaVto.getTime() - hoy.getTime()) / 86_400_000)
  if (diff < 0)       return { estado: 'vencido', diasRestantes: diff }
  if (diff <= 30)     return { estado: 'por_vencer', diasRestantes: diff }
  return { estado: 'vigente', diasRestantes: diff }
}
