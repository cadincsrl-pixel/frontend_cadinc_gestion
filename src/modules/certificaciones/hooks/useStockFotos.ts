'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { StockMaterialFoto } from '@/types/domain.types'

/**
 * Fotos de una ficha del catálogo (20260912g). Misma receta que las fotos de
 * herramientas: URL firmada de subida, PUT directo al bucket, y un POST que
 * registra la fila (el backend recalcula el sha256). El bucket es público, así
 * que las filas ya traen la `url` lista para usar en <img>.
 *
 * Las mutaciones invalidan también ['stock','materiales']: `foto_url` (la
 * principal) viaja en la lista de materiales y en el catálogo.
 */
export const STOCK_FOTOS_KEY = ['stock', 'fotos'] as const

export function useStockFotos(materialId: number | null) {
  return useQuery({
    queryKey: [...STOCK_FOTOS_KEY, materialId],
    queryFn:  () => apiGet<StockMaterialFoto[]>(`/api/stock/materiales/${materialId!}/fotos`),
    enabled:  !!materialId,
    staleTime: 30_000,
  })
}

interface UploadUrlResp { storage_path: string; signed_url: string }

async function sha256Hex(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const MAX_BYTES = 5 * 1024 * 1024
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export function useUploadStockFoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { materialId: number; file: File; descripcion?: string | null }) => {
      if (!MIME_OK.has(input.file.type)) throw new Error('Solo fotos: JPG, PNG, WEBP o HEIC')
      if (input.file.size > MAX_BYTES) throw new Error('La foto supera los 5 MB')
      const file_hash = await sha256Hex(input.file)
      const up = await apiPost<UploadUrlResp>(`/api/stock/materiales/${input.materialId}/fotos/upload-url`, {
        nombre_archivo: input.file.name,
        mime_type:      input.file.type,
        size_bytes:     input.file.size,
      })
      const putRes = await fetch(up.signed_url, { method: 'PUT', body: input.file, headers: { 'content-type': input.file.type } })
      if (!putRes.ok) throw new Error(`No se pudo subir la foto (${putRes.status})`)
      return apiPost<StockMaterialFoto>(`/api/stock/materiales/${input.materialId}/fotos`, {
        storage_path: up.storage_path,
        file_hash,
        descripcion:  input.descripcion ?? null,
      })
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...STOCK_FOTOS_KEY, vars.materialId] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}

export function useDeleteStockFoto(materialId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fotoId: number) => apiDelete(`/api/stock/fotos/${fotoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...STOCK_FOTOS_KEY, materialId] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}

/** El orden nuevo completo; la primera pasa a ser la principal. */
export function useReordenarStockFotos(materialId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => apiPatch(`/api/stock/materiales/${materialId!}/fotos/orden`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...STOCK_FOTOS_KEY, materialId] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}
