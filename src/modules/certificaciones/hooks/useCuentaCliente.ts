// Hooks de la cuenta corriente que NO son el listado: pendientes de tasar,
// carga masiva de precios y cobros (pagos del cliente). El listado y el
// resumen viven en useCuentaCorriente.ts (20260904ap); el hook viejo de la
// lista y el de gastos de CADINC se fueron en la fase 3 (20260904aq).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client'
import type { CuentaClienteCobro, MedioCobro, CertificadoCliente, CertificadoDetalle, CertificadoEmitido } from '@/types/domain.types'

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
    mutationFn: async (items: { itemId: number; precio_unit?: number; pagado_por?: 'cadinc' | 'cliente'; actualizar_catalogo?: boolean }[]) => {
      const res = await Promise.allSettled(
        items.map(it => {
          const body: Record<string, unknown> = {}
          if (it.precio_unit !== undefined) body.precio_unit = it.precio_unit
          if (it.pagado_por !== undefined) body.pagado_por = it.pagado_por
          // Llevar el precio también a la ficha del catálogo (10/09). El
          // backend lo valida ficha por ficha y es best-effort: si una no
          // puede, el precio del renglón se guarda igual.
          if (it.actualizar_catalogo) body.actualizar_catalogo = true
          return apiPatch<{ catalogo?: { ok: boolean } }>(`/api/solicitudes/items/${it.itemId}`, body)
        }),
      )
      const alCatalogo = res.filter(r => r.status === 'fulfilled' && (r.value as { catalogo?: { ok: boolean } })?.catalogo?.ok).length
      return { total: items.length, fallidos: res.filter(r => r.status === 'rejected').length, alCatalogo }
    },
    // Refetch de la cuenta corriente (listado y resumen) y del conteo de pendientes.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
      // El catálogo pudo cambiar: que la pestaña y los sugeridos lo reflejen.
      qc.invalidateQueries({ queryKey: ['stock', 'materiales'] })
      qc.invalidateQueries({ queryKey: ['catalogo'] })
    },
  })
}

// ── Precios propuestos (20260912o) ────────────────────────────────────────
//
// Quien compra sabe el precio pero no puede fijarlo (flag `cargar_precios`):
// lo propone y queda esperando el OK. Hasta que se aprueba, la cuenta del
// cliente no se mueve.

export interface PrecioPropuesto {
  id:                   number
  item_id:              number
  obra_cod:             string
  obra_nom:             string
  descripcion:          string
  cantidad:             number
  unidad:               string
  precio_unit:          number
  precio_total:         number
  precio_propuesto:     number
  precio_propuesto_por: string | null
  precio_propuesto_en:  string
  precio_propuesto_obs: string | null
  proveedor_nom:        string | null
  fecha_resolucion:     string | null
}

/** La bandeja del que aprueba. 403 para quien no tiene el flag: no se pide. */
export function usePreciosPropuestos(enabled = true) {
  return useQuery({
    queryKey: ['precios-propuestos'],
    queryFn:  () => apiGet<PrecioPropuesto[]>('/api/solicitudes/items/precios-propuestos'),
    enabled,
    staleTime: 30_000,
  })
}

/** Propone un precio (no lo aplica). Lo usa quien resuelve compras. */
export function useProponerPrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, precio_unit, obs }: { itemId: number; precio_unit: number; obs?: string }) =>
      apiPost(`/api/solicitudes/items/${itemId}/proponer-precio`, { precio_unit, ...(obs ? { obs } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios-propuestos'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
    },
  })
}

/** Aprueba o rechaza una propuesta. Solo con el flag `cargar_precios`. */
export function useResolverPrecioPropuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, aprobar, motivo }: { itemId: number; aprobar: boolean; motivo?: string }) =>
      aprobar
        ? apiPost(`/api/solicitudes/items/${itemId}/aprobar-precio`, {})
        : apiPost(`/api/solicitudes/items/${itemId}/rechazar-precio`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios-propuestos'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-pendientes'] })
    },
  })
}

/** Conteo de materiales sin precio (a tasar) por obra, en las obras del usuario. */
export interface PendientePrecio { obra_cod: string; sin_precio: number; obra_archivada: boolean; obra_nom: string; esperando: number }

export function usePendientesDePrecio(enabled = true) {
  return useQuery({
    queryKey: ['cuenta-cliente-pendientes'],
    queryFn: () => apiGet<PendientePrecio[]>('/api/cuenta-cliente/pendientes-precio'),
    staleTime: 60_000,
    enabled,
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
  /** Contra un certificado: se imputan todos sus renglones sin cobrar (item_ids se ignora). */
  certificado_id?:     number | null
  monto_mano_de_obra?: number
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
export function useCobrosCliente(obra_cod?: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: COBROS_KEY(obra_cod),
    queryFn: () =>
      apiGet<CuentaClienteCobro[]>(
        `/api/cuenta-cliente/cobros${obra_cod ? `?obra_cod=${encodeURIComponent(obra_cod)}` : ''}`,
      ),
    retry: false,
  })
}

// La imputación toca filas de MCC (cobro_id/monto_cobrado): las mutaciones de
// cobros invalidan TAMBIÉN la cuenta corriente, no solo los cobros.
export function useCrearCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CrearCobroInput) => apiPost<CuentaClienteCobro>('/api/cuenta-cliente/cobros', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
    },
  })
}

export function useEditarCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...dto }: EditarCobroInput) =>
      apiPatch<CuentaClienteCobro>(`/api/cuenta-cliente/cobros/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
    },
  })
}

export function useEliminarCobroCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/api/cuenta-cliente/cobros/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-cobros'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
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

// ── Certificados al cliente (20260911h/i/j) ─────────────────────────────
const CERTIFICADOS_KEY = (obra?: string) => ['cuenta-cliente-certificados', obra ?? 'all'] as const

export function useCertificados(obra_cod?: string, enabled = true) {
  return useQuery({
    queryKey: CERTIFICADOS_KEY(obra_cod),
    queryFn:  () => apiGet<CertificadoCliente[]>(`/api/cuenta-cliente/certificados?obra_cod=${encodeURIComponent(obra_cod ?? '')}`),
    enabled:  enabled && !!obra_cod,
    staleTime: 60_000,
  })
}

/** El certificado con renglones y cobros; el backend lo devuelve con `renglones` como lista. */
export async function fetchCertificado(id: number): Promise<CertificadoDetalle> {
  const raw = await apiGet<Omit<CertificadoDetalle, 'renglones_lista' | 'renglones'> & { renglones: CertificadoDetalle['renglones_lista'] }>(
    `/api/cuenta-cliente/certificados/${id}`,
  )
  const { renglones, ...resto } = raw
  return { ...resto, renglones: renglones.length, renglones_lista: renglones }
}

export interface EmitirCertificadoInput { obra_cod: string; fecha_corte: string; mano_de_obra: number; obs?: string | null; item_ids?: number[] }

export function useEmitirCertificado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: EmitirCertificadoInput) => apiPost<CertificadoEmitido>('/api/cuenta-cliente/certificados', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-certificados'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
    },
  })
}

export function useAnularCertificado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<{ id: number; renglones_liberados: number }>(`/api/cuenta-cliente/certificados/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuenta-cliente-certificados'] })
      qc.invalidateQueries({ queryKey: ['cuenta-corriente'] })
    },
  })
}
