'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { HerramientaFoto } from '@/types/domain.types'

export const HERR_FOTOS_KEY = ['herramienta-fotos'] as const

export function useHerramientaFotos(herramientaId: number | null) {
  return useQuery({
    queryKey: [...HERR_FOTOS_KEY, herramientaId],
    queryFn:  () => apiGet<HerramientaFoto[]>(`/api/herramientas/${herramientaId!}/fotos`),
    enabled:  !!herramientaId,
    staleTime: 30_000,
  })
}

interface UploadUrlResp {
  storage_path: string
  signed_url:   string
}

interface UploadInput {
  herramientaId: number
  file:          File
  descripcion?:  string | null
  orden?:        number
}

async function sha256Hex(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useUploadHerramientaFoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      if (input.file.size > 5 * 1024 * 1024) {
        throw new Error('La foto supera los 5 MB')
      }
      const file_hash = await sha256Hex(input.file)
      const up = await apiPost<UploadUrlResp>(
        `/api/herramientas/${input.herramientaId}/fotos/upload-url`,
        {
          nombre_archivo: input.file.name,
          mime_type:      input.file.type,
          size_bytes:     input.file.size,
        },
      )
      const putRes = await fetch(up.signed_url, {
        method:  'PUT',
        body:    input.file,
        headers: { 'content-type': input.file.type },
      })
      if (!putRes.ok) throw new Error(`Error al subir foto (${putRes.status})`)
      const fila = await apiPost<HerramientaFoto>(
        `/api/herramientas/${input.herramientaId}/fotos`,
        {
          storage_path: up.storage_path,
          file_hash,
          descripcion:  input.descripcion ?? null,
          orden:        input.orden ?? 0,
        },
      )
      return fila
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...HERR_FOTOS_KEY, vars.herramientaId] })
    },
  })
}

export function useDeleteHerramientaFoto(herramientaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fotoId: number) => apiDelete(`/api/herramientas/fotos/${fotoId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [...HERR_FOTOS_KEY, herramientaId] }),
  })
}

export function useReordenarHerramientaFotos(herramientaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) =>
      apiPatch(`/api/herramientas/${herramientaId}/fotos/orden`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...HERR_FOTOS_KEY, herramientaId] }),
  })
}

export async function fetchHerramientaFotoUrl(fotoId: number): Promise<string> {
  const data = await apiGet<{ url: string }>(`/api/herramientas/fotos/${fotoId}/url`)
  return data.url
}
