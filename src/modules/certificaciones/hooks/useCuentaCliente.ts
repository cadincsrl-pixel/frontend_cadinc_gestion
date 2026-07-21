// Hook para el tab "Cuenta del cliente". Lee materiales_a_cuenta_cliente
// (MCC) con joins ya resueltos del backend.
//
// Cuando `obra_cod` está presente: filtra a esa obra (y el backend valida
// scope). Cuando no, devuelve MCC de todas las obras permitidas al user.
// Para usuarios con scope global (admin), el backend exige `obra_cod` —
// si se llama sin él, la query falla con 400.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client'
import type { MaterialACuentaCliente, CuentaClienteCobro, MedioCobro } from '@/types/domain.types'

/** Fila de MCC con joins que devuelve el backend. */
export interface CuentaClienteRow extends MaterialACuentaCliente {
  proveedores?:     { nombre: string } | null
  facturas_compra?: { numero: string | null; adjunto_url: string | null; fecha: string | null } | null
  /** Estado del item de la solicitud — un 'en_proveedor' con retiros
   *  pendientes puede crecer su total, por eso no es imputable a un pago. */
  item?:            { estado: string } | null
}

const KEYS = {
  list: (obra?: string) => ['cuenta-cliente', obra ?? 'all'] as const,
}

export function useCuentaCliente(obra_cod?: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.list(obra_cod),
    queryFn: () =>
      apiGet<CuentaClienteRow[]>(
        `/api/cuenta-cliente${obra_cod ? `?obra_cod=${encodeURIComponent(obra_cod)}` : ''}`,
      ),
    enabled,
  })
}

/**
 * Carga/corrige el precio de varios ítems de MCC de una sola vez. Reusa el
 * endpoint `PATCH /api/solicitudes/items/:itemId` (editarItem), que actualiza
 * el ítem de la solicitud Y recalcula su fila en materiales_a_cuenta_cliente
 * (precio_total = cantidad × precio_unit). Requiere el flag `resolver_items`
 * en el backend. Devuelve cuántos fallaron para reportarlo en la UI.
 */
export function useGuardarPreciosMCC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { itemId: number; precio_unit: number }[]) => {
      const res = await Promise.allSettled(
        items.map(it =>
          apiPatch(`/api/solicitudes/items/${it.itemId}`, { precio_unit: it.precio_unit }),
        ),
      )
      return { total: items.length, fallidos: res.filter(r => r.status === 'rejected').length }
    },
    // Refetch de la lista (key ['cuenta-cliente', obra]) y del conteo de pendientes.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
    },
  })
}

/** Conteo de materiales sin precio (a tasar) por obra, en las obras del usuario. */
export interface PendientePrecio { obra_cod: string; sin_precio: number }

export function usePendientesDePrecio() {
  return useQuery({
    queryKey: ['cuenta-cliente-pendientes'],
    queryFn: () => apiGet<PendientePrecio[]>('/api/cuenta-cliente/pendientes-precio'),
    staleTime: 60_000,
  })
}

// ── Cobros (pagos del cliente a cuenta de la obra) ───────────────────────

const COBROS_KEY = (obra?: string) => ['cuenta-cliente-cobros', obra ?? 'all'] as const

export interface CrearCobroInput {
  obra_cod: string
  fecha:    string
  monto:    number
  medio:    MedioCobro
  obs?:     string | null
  /** Filas de MCC que este pago cubre (vacío = pago a cuenta sin imputar). */
  item_ids?: number[]
  /** Path del comprobante ya subido con la signed URL. */
  comprobante_path?: string | null
}
export interface EditarCobroInput {
  id:     number
  fecha?: string
  monto?: number
  medio?: MedioCobro
  obs?:   string | null
}

// Sin obra_cod trae los cobros de TODAS las obras del user (scope) — para que
// los KPIs de "todas mis obras" incluyan los pagos. Para scope global (admin)
// el backend responde 400 igual que el listado de MCC; retry off para no
// spamear.
export function useCobrosCliente(obra_cod?: string) {
  return useQuery({
    queryKey: COBROS_KEY(obra_cod),
    queryFn: () =>
      apiGet<CuentaClienteCobro[]>(
        `/api/cuenta-cliente/cobros${obra_cod ? `?obra_cod=${encodeURIComponent(obra_cod)}` : ''}`,
      ),
    retry: false,
  })
}

// La imputación toca filas de MCC (cobro_id/monto_cobrado): las mutaciones de
// cobros invalidan TAMBIÉN la lista de cuenta-cliente, no solo los cobros.
export function useCrearCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CrearCobroInput) => apiPost<CuentaClienteCobro>('/api/cuenta-cliente/cobros', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
    },
  })
}

export function useEditarCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...dto }: EditarCobroInput) =>
      apiPatch<CuentaClienteCobro>(`/api/cuenta-cliente/cobros/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] }),
  })
}

export function useEliminarCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/api/cuenta-cliente/cobros/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente'] })
    },
  })
}

// ── Comprobante del cobro (bucket privado cobros-docs, signed URL 2 pasos) ──

export async function uploadComprobanteCobro(file: File): Promise<string> {
  const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
  if (!(TIPOS_OK as readonly string[]).includes(file.type)) {
    throw new Error('Tipo de archivo no soportado (jpg, png, webp o pdf)')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('El archivo supera 10 MB')
  }
  const { path, signedUrl } = await apiPost<{ path: string; signedUrl: string; token: string; expiresIn: number }>(
    '/api/cuenta-cliente/cobros/upload-comprobante',
    { content_type: file.type },
  )
  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!res.ok) throw new Error(`Falló la subida (${res.status})`)
  return path
}

export async function fetchCobroComprobanteUrl(id: number): Promise<string> {
  const { url } = await apiGet<{ url: string }>(`/api/cuenta-cliente/cobros/${id}/comprobante-url`)
  return url
}
