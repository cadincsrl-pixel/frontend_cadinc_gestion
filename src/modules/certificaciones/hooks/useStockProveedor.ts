import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'

export const STOCK_PROV_KEY  = ['stock-proveedor'] as const
export const REMITOS_RR_KEY  = ['remitos-retiro-proveedor'] as const

export interface StockProveedorRow {
  item_id:           number
  solicitud_id:      number
  obra_cod:          string | null
  proveedor_id:      number
  proveedor_nombre:  string | null
  descripcion:       string
  unidad:            string
  cantidad_total:    number
  cantidad_pendiente: number
  cantidad_retirada: number
  precio_unit:       number | null
  fecha_compra:      string | null
  estado:            'en_proveedor' | 'retirado'
  factura_id:        number | null
}

export interface MovimientoStockProv {
  id:                 number
  proveedor_id:       number
  solicitud_item_id:  number
  tipo:               'entrada' | 'salida' | 'ajuste'
  motivo:             'compra' | 'retiro' | 'ajuste'
  cantidad:           number
  remito_retiro_id:   number | null
  fecha:              string
  obs:                string | null
  remito?:            { numero: string | null; fecha: string } | null
}

export interface RemitoRetiroProvRow {
  id:               number
  numero:           string
  proveedor_id:     number
  obra_cod:         string
  fecha:            string
  comprobante_url:  string | null
  comprobante_hash: string | null
  obs:              string | null
  items?:           Array<{ id: number; remito_id: number; solicitud_item_id: number; cantidad: number }>
}

interface ItemRetiro { item_id: number; cantidad: number }

interface CrearRemitoDto {
  proveedor_id:      number
  obra_cod:          string
  fecha?:            string
  comprobante_path?: string | null
  obs?:              string | null
  items:             ItemRetiro[]
}

interface ListFiltros {
  proveedor_id?:     number
  obra_cod?:         string
  incluir_retirados?: boolean
}

export function useStockProveedor(filtros: ListFiltros = {}) {
  const qs = new URLSearchParams()
  if (filtros.proveedor_id)      qs.set('proveedor_id', String(filtros.proveedor_id))
  if (filtros.obra_cod)          qs.set('obra_cod', filtros.obra_cod)
  if (filtros.incluir_retirados) qs.set('incluir_retirados', 'true')
  const path = `/api/stock-proveedor${qs.toString() ? `?${qs}` : ''}`
  return useQuery({
    queryKey: [...STOCK_PROV_KEY, filtros],
    queryFn: () => apiGet<StockProveedorRow[]>(path),
  })
}

export function useMovimientosItemProveedor(itemId: number | null) {
  return useQuery({
    queryKey: [...STOCK_PROV_KEY, 'movs', itemId],
    queryFn: () => apiGet<MovimientoStockProv[]>(`/api/stock-proveedor/items/${itemId}/movimientos`),
    enabled: !!itemId,
  })
}

export function useRemitosRetiroProv(filtros: { proveedor_id?: number; obra_cod?: string } = {}) {
  const qs = new URLSearchParams()
  if (filtros.proveedor_id) qs.set('proveedor_id', String(filtros.proveedor_id))
  if (filtros.obra_cod)     qs.set('obra_cod', filtros.obra_cod)
  return useQuery({
    queryKey: [...REMITOS_RR_KEY, filtros],
    queryFn: () => apiGet<RemitoRetiroProvRow[]>(
      `/api/stock-proveedor/remitos${qs.toString() ? `?${qs}` : ''}`,
    ),
  })
}

// Sube un comprobante (foto/PDF) al bucket privado: 1) pide signed URL,
// 2) PUT del archivo, 3) devuelve el path a guardar.
export async function uploadComprobanteRetiro(file: File): Promise<string> {
  const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
  if (!(TIPOS_OK as readonly string[]).includes(file.type)) {
    throw new Error('Tipo de archivo no soportado (jpg, png, webp o pdf)')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('El archivo supera 10 MB')
  }
  const { path, signedUrl } = await apiPost<{ path: string; signedUrl: string }>(
    '/api/stock-proveedor/upload-comprobante',
    { filename: file.name, content_type: file.type, size_bytes: file.size },
  )
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!res.ok) throw new Error(`Falló la subida (${res.status})`)
  return path
}

// Pide URL firmada para descargar el comprobante (15 min).
export async function fetchRemitoComprobanteUrl(remitoId: number): Promise<string> {
  const { signedUrl } = await apiGet<{ signedUrl: string }>(
    `/api/stock-proveedor/remitos/${remitoId}/comprobante-url`,
  )
  return signedUrl
}

export function useCrearRemitoRetiro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CrearRemitoDto) => apiPost<RemitoRetiroProvRow>('/api/stock-proveedor/retirar', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STOCK_PROV_KEY })
      qc.invalidateQueries({ queryKey: REMITOS_RR_KEY })
      qc.invalidateQueries({ queryKey: ['solicitudes'] })
      // El retiro inserta/actualiza la cuenta del cliente (MCC). La key era
      // ['materiales'] (muerta: CuentaClienteTab usa ['cuenta-cliente']).
      qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
    },
  })
}
