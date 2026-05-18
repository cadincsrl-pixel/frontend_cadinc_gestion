'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { FlotaGasto, FlotaGastoCategoria } from '@/types/domain.types'

export const FLOTA_GASTOS_KEY      = ['flota', 'gastos'] as const
export const FLOTA_GASTOS_CATS_KEY = ['flota', 'gastos-categorias'] as const

// ── Catálogo de categorías ──
export function useFlotaGastosCategorias() {
  return useQuery({
    queryKey: FLOTA_GASTOS_CATS_KEY,
    queryFn:  () => apiGet<FlotaGastoCategoria[]>('/api/flota/gastos-categorias'),
    staleTime: 5 * 60_000,
  })
}

// ── Listado ──
export interface FlotaGastosFiltros {
  vehiculo_id?:  number
  desde?:        string
  hasta?:        string
  categoria_id?: number
}

export function useFlotaGastos(filtros: FlotaGastosFiltros = {}) {
  return useQuery({
    queryKey: [...FLOTA_GASTOS_KEY, filtros],
    queryFn:  () => {
      const qs = new URLSearchParams()
      if (filtros.vehiculo_id)  qs.set('vehiculo_id',  String(filtros.vehiculo_id))
      if (filtros.desde)        qs.set('desde',        filtros.desde)
      if (filtros.hasta)        qs.set('hasta',        filtros.hasta)
      if (filtros.categoria_id) qs.set('categoria_id', String(filtros.categoria_id))
      const url = qs.toString() ? `/api/flota/gastos?${qs}` : '/api/flota/gastos'
      return apiGet<FlotaGasto[]>(url)
    },
  })
}

// ── Crear ──
interface UploadUrlResp {
  path:       string
  token:      string
  signed_url: string
}

interface CreateGastoInput {
  vehiculo_id:   number
  categoria_id?: number | null
  fecha:         string
  monto:         number
  proveedor?:    string | null
  descripcion?:  string | null
  comprobante?:  File | null
}

/**
 * SHA-256 hex de un File. Lo usamos para dedup de comprobantes en el backend
 * (constraint UNIQUE sobre comprobante_hash). Funciona en cualquier browser
 * moderno vía Web Crypto.
 */
async function sha256Hex(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useCreateFlotaGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateGastoInput) => {
      let comprobante_path: string | null = null
      let comprobante_hash: string | null = null
      if (input.comprobante) {
        if (input.comprobante.size > 5 * 1024 * 1024) {
          throw new Error('Comprobante demasiado grande (máx 5 MB)')
        }
        comprobante_hash = await sha256Hex(input.comprobante)
        const up = await apiPost<UploadUrlResp>(
          `/api/flota/gastos/upload-url?vehiculo_id=${input.vehiculo_id}`,
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
      return apiPost<FlotaGasto>('/api/flota/gastos', {
        ...rest,
        comprobante_path,
        comprobante_hash,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FLOTA_GASTOS_KEY }),
  })
}

export function useUpdateFlotaGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<FlotaGasto> }) =>
      apiPatch<FlotaGasto>(`/api/flota/gastos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: FLOTA_GASTOS_KEY }),
  })
}

export function useDeleteFlotaGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/flota/gastos/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: FLOTA_GASTOS_KEY }),
  })
}

export async function fetchFlotaGastoComprobanteUrl(id: number): Promise<string> {
  const data = await apiGet<{ url: string }>(`/api/flota/gastos/${id}/comprobante-url`)
  return data.url
}
