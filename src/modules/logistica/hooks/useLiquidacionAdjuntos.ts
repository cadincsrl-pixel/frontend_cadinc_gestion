import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import type { LiquidacionAdjunto, LiquidacionAdjuntoTipo } from '@/types/domain.types'

export const LIQ_ADJ_KEY = ['liquidaciones', 'adjuntos'] as const

export function useLiquidacionAdjuntos(liqId: number | null) {
  return useQuery({
    queryKey: [...LIQ_ADJ_KEY, liqId],
    queryFn:  () => apiGet<LiquidacionAdjunto[]>(`/api/logistica/liquidaciones/${liqId}/adjuntos`),
    enabled:  !!liqId,
    staleTime: 30_000,
  })
}

interface UploadInput {
  liqId: number
  file:  File
  tipo:  LiquidacionAdjuntoTipo
  obs?:  string
}

interface UploadUrlResponse {
  path:       string
  token:      string
  signed_url: string
  tipo:       LiquidacionAdjuntoTipo
}

export function useUploadLiquidacionAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ liqId, file, tipo, obs }: UploadInput) => {
      const up = await apiPost<UploadUrlResponse>(
        `/api/logistica/liquidaciones/${liqId}/adjuntos/upload-url`,
        { tipo, nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size },
      )
      const putRes = await fetch(up.signed_url, {
        method: 'PUT', body: file, headers: { 'content-type': file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir archivo (${putRes.status})`)
      const adj = await apiPost<LiquidacionAdjunto>(
        `/api/logistica/liquidaciones/${liqId}/adjuntos`,
        {
          tipo, storage_path: up.path,
          nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size,
          obs: obs ?? undefined,
        },
      )
      return adj
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...LIQ_ADJ_KEY, vars.liqId] })
    },
  })
}

export async function fetchLiquidacionAdjSignedUrl(liqId: number, id: number): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/logistica/liquidaciones/${liqId}/adjuntos/${id}/signed-url`,
  )
  return data.url
}

export function useDeleteLiquidacionAdjunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ liqId, id }: { liqId: number; id: number }) =>
      apiDelete<{ success: boolean; id: number }>(
        `/api/logistica/liquidaciones/${liqId}/adjuntos/${id}`,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...LIQ_ADJ_KEY, vars.liqId] })
    },
  })
}
