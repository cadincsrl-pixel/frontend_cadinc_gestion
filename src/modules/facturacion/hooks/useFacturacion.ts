// Módulo Facturación — facturas de venta contra ARCA (fase 1: FA y NC A).
//
// Todo se filtra, pagina y suma en el SERVER (v_ventas_facturas y
// /facturas/resumen): acá solo se arma la query string y se cachea por filtro.
// Contrato: /api/facturacion (backend `modules/facturacion`).
//
// Una sola puerta de invalidación (`invalidarFacturacion`): cualquier mutación
// puede mover la bandeja, la ficha, el resumen, la bandeja de Finnegans y las
// obras de un cliente, así que se invalida el prefijo entero del módulo.

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPatch } from '@/lib/api/client'
import type {
  VentasCbteTipo, VentasArcaEstado, VentasCondicionIva, VentasEmitirRes, VentasEstado, VentasFactura, VentasFacturaDetalle,
  VentasFacturaFJ, VentasFacturaInput, VentasFacturasPage, VentasObra, VentasProducto, VentasResumenFila,
} from '@/types/domain.types'

const BASE = '/api/facturacion'

export const FACTURACION_KEY = ['facturacion'] as const

export const FACTURACION_KEYS = {
  todo:           FACTURACION_KEY,
  facturas:       ['facturacion', 'facturas'] as const,
  factura:        (id: number) => ['facturacion', 'facturas', 'detalle', id] as const,
  resumen:        ['facturacion', 'facturas', 'resumen'] as const,
  arcaEstado:     ['facturacion', 'arca', 'estado'] as const,
  condicionesIva: ['facturacion', 'catalogos', 'condiciones-iva'] as const,
  obras:          ['facturacion', 'catalogos', 'obras'] as const,
  clientes:       ['facturacion', 'clientes'] as const,
  cliente:        (id: number) => ['facturacion', 'clientes', 'detalle', id] as const,
  clienteFce:     (id: number) => ['facturacion', 'clientes', 'fce', id] as const,
  cuentas:        ['facturacion', 'cuentas'] as const,
}

export function invalidarFacturacion(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: FACTURACION_KEYS.todo })
}

// ── Filtros ───────────────────────────────────────────────────────────

export interface FacturasFiltro {
  estado?:       VentasEstado
  cbte_tipo?:    VentasCbteTipo
  cliente_id?:   number
  /** La obra es el centro de costo (23/09). */
  obra_cod?:     string
  producto?:     VentasProducto
  desde?:        string
  hasta?:        string
  finnegans?:    'pendiente' | 'registrada'
  q?:            string
}

function qsFacturas(f: FacturasFiltro, page: number, pageSize: number): string {
  const p = new URLSearchParams()
  if (f.estado)          p.set('estado', f.estado)
  if (f.cbte_tipo)       p.set('cbte_tipo', String(f.cbte_tipo))
  if (f.cliente_id)      p.set('cliente_id', String(f.cliente_id))
  if (f.obra_cod)        p.set('obra_cod', f.obra_cod)
  if (f.producto)        p.set('producto', f.producto)
  if (f.desde)           p.set('desde', f.desde)
  if (f.hasta)           p.set('hasta', f.hasta)
  if (f.finnegans)       p.set('finnegans', f.finnegans)
  if (f.q?.trim())       p.set('q', f.q.trim())
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  return p.toString()
}

// ── Lecturas ──────────────────────────────────────────────────────────

export function useFacturasVenta(f: FacturasFiltro, page = 1, pageSize = 50, enabled = true) {
  const qs = qsFacturas(f, page, pageSize)
  return useQuery({
    queryKey: [...FACTURACION_KEYS.facturas, 'lista', qs],
    queryFn:  () => apiGet<VentasFacturasPage>(`${BASE}/facturas?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

/** Solo autorizadas; las NC vienen en negativo. */
export function useResumenFacturas(desde: string, hasta: string, enabled = true) {
  const qs = new URLSearchParams({ desde, hasta }).toString()
  return useQuery({
    queryKey: [...FACTURACION_KEYS.resumen, qs],
    queryFn:  () => apiGet<VentasResumenFila[]>(`${BASE}/facturas/resumen?${qs}`),
    staleTime: 60_000,
    enabled,
  })
}

export function useFacturaVenta(id: number | null) {
  return useQuery({
    queryKey: FACTURACION_KEYS.factura(id ?? 0),
    queryFn:  () => apiGet<VentasFacturaDetalle>(`${BASE}/facturas/${id}`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

export function fetchFacturaVenta(id: number): Promise<VentasFacturaDetalle> {
  return apiGet<VentasFacturaDetalle>(`${BASE}/facturas/${id}`)
}

/**
 * Nunca rompe (si ARCA no responde viene `dummy: null` + `error`). Se refresca
 * cada 5 minutos: el indicador tiene que decir la verdad sin martillar a ARCA.
 */
export function useArcaEstado(enabled = true) {
  return useQuery({
    queryKey: FACTURACION_KEYS.arcaEstado,
    queryFn:  () => apiGet<VentasArcaEstado>(`${BASE}/arca/estado`),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
    enabled,
  })
}

/** Tabla fija de ARCA: no cambia en la sesión. */
export function useCondicionesIva(enabled = true) {
  return useQuery({
    queryKey: FACTURACION_KEYS.condicionesIva,
    queryFn:  () => apiGet<VentasCondicionIva[]>(`${BASE}/condiciones-iva`),
    staleTime: Infinity,
    enabled,
  })
}

export function useObrasFacturacion(enabled = true) {
  return useQuery({
    queryKey: FACTURACION_KEYS.obras,
    queryFn:  () => apiGet<VentasObra[]>(`${BASE}/obras`),
    staleTime: 60_000,
    enabled,
  })
}

// ── Mutaciones del borrador ───────────────────────────────────────────

export function useCrearFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasFacturaInput) => apiPost<VentasFacturaFJ>(`${BASE}/facturas`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Reemplazo completo del borrador (factura + renglones). */
export function useEditarFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: VentasFacturaInput & { id: number }) =>
      apiPatch<VentasFacturaFJ>(`${BASE}/facturas/${id}`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Solo un borrador que nunca fue a ARCA (si no, 409 FACTURA_NO_BORRABLE). */
export function useBorrarFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<void>(`${BASE}/facturas/${id}`),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useDescartarFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) =>
      apiPost<VentasFacturaFJ>(`${BASE}/facturas/${id}/descartar`, { motivo }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Desde `rechazada`, para corregir y volver a emitir. */
export function useVolverABorrador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<VentasFacturaFJ>(`${BASE}/facturas/${id}/volver-a-borrador`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

// ── Emisión ───────────────────────────────────────────────────────────

/** ¿La respuesta de /emitir es el 202 «no sé si llegó»? */
export function esEmisionIncierta(r: VentasEmitirRes): r is Extract<VentasEmitirRes, { error: 'EMISION_INCIERTA' }> {
  return (r as { error?: string }).error === 'EMISION_INCIERTA'
}

/**
 * 200 → FJ autorizada. 202 → `{ error: 'EMISION_INCIERTA', factura }` (sale
 * por el camino de éxito porque 2xx). 422 ARCA_RECHAZO / 409 / 503 → tira
 * HttpError con el body entero (el 422 trae además `factura`).
 */
export function useEmitirFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, forzar }: { id: number; forzar?: boolean }) =>
      apiPost<VentasEmitirRes>(`${BASE}/facturas/${id}/emitir`, forzar ? { forzar: true } : {}),
    onSettled:  () => invalidarFacturacion(qc),
  })
}

/**
 * Pregunta a ARCA qué pasó con el número intentado. Devuelve la FJ: si quedó
 * `autorizada` ARCA la tenía; si volvió a `borrador` no llegó; si sigue
 * `error_reconciliar` todavía no se sabe. 409 CONFLICTO_NUMERACION = trabada.
 */
export function reconciliarFacturaVenta(id: number): Promise<VentasFacturaFJ> {
  return apiPost<VentasFacturaFJ>(`${BASE}/facturas/${id}/reconciliar`, {})
}

export function useReconciliarFacturaVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => reconciliarFacturaVenta(id),
    onSettled:  () => invalidarFacturacion(qc),
  })
}

// ── Finnegans ─────────────────────────────────────────────────────────

export function useRegistrarFinnegansVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, numero_finnegans }: { id: number; numero_finnegans: string }) =>
      apiPost<VentasFactura>(`${BASE}/facturas/${id}/registrar-finnegans`, { numero_finnegans }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useDeshacerRegistroVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<VentasFactura>(`${BASE}/facturas/${id}/deshacer-registro`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}
