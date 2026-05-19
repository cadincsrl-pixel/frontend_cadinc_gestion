import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type { StockRubro, StockMaterial, StockMovimiento } from '@/types/domain.types'

// ── Rubros ──
export function useStockRubros() {
  return useQuery({
    queryKey: ['stock', 'rubros'],
    queryFn: () => apiGet<StockRubro[]>('/api/stock/rubros'),
  })
}

export function useCreateRubro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockRubro>('/api/stock/rubros', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'rubros'] }),
  })
}

// ── Materiales ──
export function useStockMateriales(rubro_id?: number) {
  return useQuery({
    queryKey: ['stock', 'materiales', rubro_id ?? 'all'],
    queryFn: () =>
      apiGet<StockMaterial[]>(
        `/api/stock/materiales${rubro_id ? `?rubro_id=${rubro_id}` : ''}`
      ),
  })
}

export function useCreateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockMaterial>('/api/stock/materiales', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

export function useUpdateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      apiPatch<StockMaterial>(`/api/stock/materiales/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

export function useDeleteStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/stock/materiales/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

// ── Movimientos ──
export function useStockMovimientos(material_id?: number) {
  return useQuery({
    queryKey: ['stock', 'movimientos', material_id ?? 'all'],
    queryFn: () =>
      apiGet<StockMovimiento[]>(
        `/api/stock/movimientos${material_id ? `?material_id=${material_id}` : ''}`
      ),
  })
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: any) => apiPost<StockMovimiento>('/api/stock/movimientos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', 'movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}

// ─── Ajustes con doble aprobación ───────────────────────────────────────

const AJUSTES_PENDIENTES_KEY = ['stock', 'ajustes-pendientes'] as const

export function useAjustesPendientes(enabled: boolean = true) {
  return useQuery({
    queryKey: AJUSTES_PENDIENTES_KEY,
    queryFn:  () => apiGet<any[]>('/api/stock/ajustes-pendientes'),
    enabled,
    staleTime: 60_000,
  })
}

export function useAprobarAjuste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movId: number) => apiPost(`/api/stock/movimientos/${movId}/aprobar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AJUSTES_PENDIENTES_KEY })
      qc.invalidateQueries({ queryKey: ['stock', 'movimientos'] })
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
    },
  })
}

export function useRechazarAjuste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ movId, motivo }: { movId: number; motivo: string }) =>
      apiPost(`/api/stock/movimientos/${movId}/rechazar`, { rechazo_motivo: motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AJUSTES_PENDIENTES_KEY })
      qc.invalidateQueries({ queryKey: ['stock', 'movimientos'] })
    },
  })
}

interface UploadUrlResp {
  storage_path: string
  signed_url:   string
}

async function sha256Hex(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Sube el comprobante al bucket y devuelve { storage_path, file_hash }. */
export async function subirComprobanteAjuste(file: File): Promise<{ storage_path: string; file_hash: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('El comprobante supera los 5 MB')
  const file_hash = await sha256Hex(file)
  const up = await apiPost<UploadUrlResp>('/api/stock/comprobante-upload-url', {
    nombre_archivo: file.name,
    mime_type:      file.type,
    size_bytes:     file.size,
  })
  const putRes = await fetch(up.signed_url, {
    method:  'PUT',
    body:    file,
    headers: { 'content-type': file.type },
  })
  if (!putRes.ok) throw new Error(`Error al subir comprobante (${putRes.status})`)
  return { storage_path: up.storage_path, file_hash }
}

export async function fetchComprobanteUrl(path: string): Promise<string> {
  const data = await apiGet<{ url: string }>(`/api/stock/comprobante-url?path=${encodeURIComponent(path)}`)
  return data.url
}
