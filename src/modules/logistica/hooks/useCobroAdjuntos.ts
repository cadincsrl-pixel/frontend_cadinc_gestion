import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import type { CobroAdjunto, CobroAdjuntoTipo } from '@/types/domain.types'

export const COBRO_ADJ_KEY = ['cobros', 'adjuntos'] as const

export function useCobroAdjuntos(cobroId: number | null) {
  return useQuery({
    queryKey: [...COBRO_ADJ_KEY, cobroId],
    queryFn:  () => apiGet<CobroAdjunto[]>(`/api/logistica/cobros/${cobroId}/adjuntos`),
    enabled:  !!cobroId,
    staleTime: 30_000,
  })
}

interface UploadInput {
  cobroId: number
  file:    File
  tipo:    CobroAdjuntoTipo
  obs?:    string
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       CobroAdjuntoTipo
}

export function useUploadCobroAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cobroId, file, tipo, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `/api/logistica/cobros/${cobroId}/adjuntos/upload-url`,
        { tipo, nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size },
      )
      const putRes = await fetch(up.signed_url, {
        method: 'PUT', body: file, headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      const adj = await apiPost<CobroAdjunto>(
        `/api/logistica/cobros/${cobroId}/adjuntos`,
        {
          tipo, storage_path: up.path,
          nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size,
          obs: obs ?? undefined,
        },
      )
      return adj
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...COBRO_ADJ_KEY, vars.cobroId] })
    },
  })
}

export async function fetchCobroAdjSignedUrl(cobroId: number, id: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/logistica/cobros/${cobroId}/adjuntos/${id}/signed-url`,
  )
  return data.url
}

export function useDeleteCobroAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cobroId, id }: { cobroId: number; id: number }) =>
      apiDelete<{ success: boolean; id: number }>(
        `/api/logistica/cobros/${cobroId}/adjuntos/${id}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...COBRO_ADJ_KEY, vars.cobroId] })
    },
  })
}
