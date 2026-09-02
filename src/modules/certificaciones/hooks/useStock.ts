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

/** Espejo de `CreateRubroSchema` del backend. */
export interface CreateStockRubroDto {
  nombre: string
  icono?: string
  orden?: number
}

export function useCreateRubro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateStockRubroDto) => apiPost<StockRubro>('/api/stock/rubros', dto),
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

/**
 * Campos del material que acepta el backend (`CreateMaterialSchema` /
 * `UpdateMaterialSchema` de `stock.schema.ts`).
 *
 * `alias` = cómo se pide el material EN OBRA ("t1", "alargue", "plástico
 * negro"). El backend lo normaliza (minúsculas, sin tildes) antes de guardar,
 * y **reemplaza** la lista entera: para agregar uno hay que mandar los que ya
 * tenía más el nuevo, nunca solo el nuevo.
 */
export interface StockMaterialFields {
  rubro_id:      number
  nombre:        string
  unidad?:       string
  stock_minimo?: number
  precio_ref?:   number
  proveedor_id?: number | null
  obs?:          string
  alias?:        string[]
  /**
   * El color es una elección real para este material. Cuando es true, el form
   * del pedido muestra el campo "Color". Ver migración `20260902s`.
   */
  usa_color?:    boolean
  /**
   * 'material' | 'herramienta'. Espejo de `solicitud_compra_item.clase`: al
   * elegir este material en un pedido, la línea nace pre-tildada. Ver 20260902u.
   */
  clase?:        'material' | 'herramienta'
}

/**
 * `forzar: true` saltea el chequeo anti-duplicados del backend. Es el "no, es
 * otro material" del usuario después de ver el modal "¿No será este?".
 */
export type CreateStockMaterialDto = StockMaterialFields & { forzar?: boolean }

export type UpdateStockMaterialDto = Partial<StockMaterialFields>

/** Material del catálogo que el backend ofrece como "¿no será este?". */
export interface MaterialCandidato {
  id:     number
  nombre: string
  unidad: string | null
  /** Similitud de trigramas contra el nombre tipeado (0..1). */
  sim:    number
  /** true si el nombre tipeado ya es EXACTAMENTE uno de sus sinónimos. */
  por_alias: boolean
}

export type MaterialConflictoCode = 'MATERIAL_PARECIDO' | 'MATERIAL_DUPLICADO'

export interface MaterialConflicto {
  /**
   * `MATERIAL_PARECIDO` → se puede reintentar el mismo body con `forzar: true`.
   * `MATERIAL_DUPLICADO` → nombre idéntico, no hay reintento posible.
   */
  code:       MaterialConflictoCode
  mensaje:    string
  candidatos: MaterialCandidato[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

/**
 * Reconoce los 409 del candado anti-duplicados en el error de `apiPost`/
 * `apiPatch` (un `HttpError` con `.status` y `.body`). Devuelve `null` para
 * cualquier otro error, así el caller cae al toast genérico.
 *
 * No hace `instanceof HttpError` porque la clase no se exporta desde
 * `lib/api/client.ts`; alcanza con el shape.
 */
export function parseMaterialConflicto(e: unknown): MaterialConflicto | null {
  const err = asRecord(e)
  if (!err || err.status !== 409) return null
  const body = asRecord(err.body)
  if (!body) return null
  const code = body.code
  if (code !== 'MATERIAL_PARECIDO' && code !== 'MATERIAL_DUPLICADO') return null

  const crudos = Array.isArray(body.candidatos) ? body.candidatos : []
  const candidatos = crudos.flatMap<MaterialCandidato>(c => {
    const r = asRecord(c)
    if (!r || typeof r.id !== 'number' || typeof r.nombre !== 'string') return []
    return [{
      id:        r.id,
      nombre:    r.nombre,
      unidad:    typeof r.unidad === 'string' ? r.unidad : null,
      sim:       typeof r.sim === 'number' ? r.sim : 0,
      por_alias: r.por_alias === true,
    }]
  })

  const mensaje = typeof body.error === 'string'
    ? body.error
    : e instanceof Error ? e.message : 'Ya hay un material parecido en el catálogo.'

  return { code, mensaje, candidatos }
}

export function useCreateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateStockMaterialDto) => apiPost<StockMaterial>('/api/stock/materiales', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock', 'materiales'] }),
  })
}

export function useUpdateStockMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateStockMaterialDto }) =>
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
