// Ventas › Cobranzas, deudores y saldos iniciales (20260924k…o).
//
// Contrato: /api/facturacion (backend `modules/facturacion`). Todas las claves
// cuelgan de ['facturacion', …] a propósito: un cobro mueve el saldo de las
// facturas (bandeja), los deudores, el estado de cuenta, los pendientes del
// cliente y el aviso de la campana, así que cada mutación invalida el prefijo
// entero con `invalidarFacturacion` (una sola puerta, como el resto del módulo).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type {
  VentasCobroDetalle, VentasCobroInput, VentasCobrosPage, VentasCompensacionInput, VentasDestinoImputacion,
  VentasDeudor, VentasEstadoCuenta, VentasEstadoCuentaMov, VentasExterno, VentasExternoAccion, VentasExternoInput,
  VentasExternosPage, VentasFactura, VentasImportarFilaInput, VentasImportarRes, VentasSaldo, VentasCliente,
  VentasUploadUrlRes, VentasAmbiente, VentasPendientesCliente,
} from '@/types/domain.types'
import { aPagina } from '../utils/cobranzas.utils'
import { invalidarFacturacion, useArcaAmbiente } from './useFacturacion'

const BASE = '/api/facturacion'

/**
 * Ambiente de ARCA con el que trabaja el backend (`/arca/ambiente`). Las
 * lecturas y el alta de cobros van contra ESE ambiente: en producción es
 * 'prod'; en un entorno de pruebas (homologación) se ven los comprobantes de
 * prueba, que no son deuda real. Sin dato, 'prod'.
 */
export function useAmbienteCobranzas(): VentasAmbiente {
  return useArcaAmbiente().data?.ambiente ?? 'prod'
}

export const COBRANZAS_KEYS = {
  cobros:       ['facturacion', 'cobros'] as const,
  cobro:        (id: number) => ['facturacion', 'cobros', 'detalle', id] as const,
  pendientes:   (clienteId: number) => ['facturacion', 'pendientes', clienteId] as const,
  deudores:     ['facturacion', 'deudores'] as const,
  estadoCuenta: (clienteId: number) => ['facturacion', 'estado-cuenta', clienteId] as const,
  externos:     ['facturacion', 'externos'] as const,
}

// ── Cobros ────────────────────────────────────────────────────────────

export interface CobrosFiltro {
  cliente_id?: number
  desde?:      string
  hasta?:      string
  estado?:     'vigente' | 'anulado'
  q?:          string
  ambiente?:   VentasAmbiente
}

function qsCobros(f: CobrosFiltro, page: number, pageSize: number): string {
  const p = new URLSearchParams()
  if (f.cliente_id) p.set('cliente_id', String(f.cliente_id))
  if (f.desde)      p.set('desde', f.desde)
  if (f.hasta)      p.set('hasta', f.hasta)
  if (f.estado)     p.set('estado', f.estado)
  if (f.q?.trim())  p.set('q', f.q.trim())
  if (f.ambiente)   p.set('ambiente', f.ambiente)
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  return p.toString()
}

export function useCobros(f: CobrosFiltro, page = 1, pageSize = 50, enabled = true) {
  const qs = qsCobros(f, page, pageSize)
  return useQuery({
    queryKey: [...COBRANZAS_KEYS.cobros, 'lista', qs],
    queryFn:  async () => aPagina(await apiGet<VentasCobrosPage>(`${BASE}/cobros?${qs}`)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

export function fetchCobro(id: number): Promise<VentasCobroDetalle> {
  return apiGet<VentasCobroDetalle>(`${BASE}/cobros/${id}`)
}

export function useCobro(id: number | null) {
  return useQuery({
    queryKey: COBRANZAS_KEYS.cobro(id ?? 0),
    queryFn:  () => apiGet<VentasCobroDetalle>(`${BASE}/cobros/${id}`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

/**
 * Comprobantes con saldo del cliente (`ventas_saldos_al`): `debitos` (facturas
 * y externos a cobrar, más viejo primero) para la grilla de aplicación, y
 * `creditos` (NC libres, NC externas, cobros con saldo a cuenta) para la
 * compensación.
 */
export function usePendientesCliente(clienteId: number | null, ambiente: VentasAmbiente = 'prod', enabled = true) {
  return useQuery({
    queryKey: [...COBRANZAS_KEYS.pendientes(clienteId ?? 0), ambiente],
    queryFn:  async (): Promise<VentasPendientesCliente> => {
      const r = await apiGet<VentasPendientesCliente | VentasSaldo[]>(`${BASE}/clientes/${clienteId}/pendientes?ambiente=${ambiente}`)
      // Por las dudas de un backend que devuelva la lista pelada.
      if (Array.isArray(r)) {
        return { debitos: r.filter(x => x.naturaleza === 'debito'), creditos: r.filter(x => x.naturaleza === 'credito') }
      }
      return { ...r, debitos: r.debitos ?? [], creditos: r.creditos ?? [] }
    },
    enabled:  enabled && !!clienteId,
    staleTime: 15_000,
  })
}

export function useRegistrarCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasCobroInput) => apiPost<VentasCobroDetalle>(`${BASE}/cobros`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Aplicar después lo que quedó a cuenta de un cobro. */
export function useImputarCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, items, fecha }: { id: number; items: VentasDestinoImputacion[]; fecha?: string }) =>
      apiPost<VentasCobroDetalle>(`${BASE}/cobros/${id}/imputar`, fecha ? { items, fecha } : { items }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useAnularCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<VentasCobroDetalle>(`${BASE}/cobros/${id}/anular`, { motivo }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useAnularImputacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) =>
      apiPost<unknown>(`${BASE}/imputaciones/${id}/anular`, motivo ? { motivo } : {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Una NC (del ERP o externa) contra débitos del mismo cliente. */
export function useCompensar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasCompensacionInput) => apiPost<{ credito: unknown; imputaciones: unknown[] }>(`${BASE}/compensaciones`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

// ── Adjuntos de retenciones (bucket privado ventas-docs) ──────────────

export interface AdjuntoRetencion {
  adjunto_path:   string
  adjunto_nombre: string
  adjunto_mime:   string
  adjunto_size:   number
}

export const MAX_ADJUNTO_RETENCION = 10 * 1024 * 1024
export const MIME_ADJUNTO_RETENCION = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

/**
 * Sube el certificado ANTES de que exista el cobro (queda en
 * `retenciones/pendientes/…`) y devuelve lo que viaja en la retención del
 * POST /cobros. El form lo guarda: si el POST rebota, se reintenta sin subir
 * de nuevo. El sha256 lo calcula el backend (con él la base no acepta el mismo
 * certificado en dos cobros vigentes: RETENCION_ADJUNTO_DUPLICADO).
 */
export async function subirAdjuntoRetencion(file: File): Promise<AdjuntoRetencion> {
  if (file.size > MAX_ADJUNTO_RETENCION) throw new Error('El archivo supera los 10 MB')
  if (file.type && !MIME_ADJUNTO_RETENCION.includes(file.type)) throw new Error('Solo PDF o imagen (JPG, PNG, WEBP, HEIC)')
  const mime = file.type || 'application/pdf'
  const up = await apiPost<VentasUploadUrlRes>(`${BASE}/cobros/retenciones/upload-url`, {
    nombre_archivo: file.name, mime_type: mime, size_bytes: file.size,
  })
  const put = await fetch(up.signed_url, { method: 'PUT', body: file, headers: { 'content-type': mime } })
  if (!put.ok) throw new Error(`No se pudo subir el certificado (${put.status})`)
  return { adjunto_path: up.storage_path, adjunto_nombre: file.name, adjunto_mime: mime, adjunto_size: file.size }
}

/** El modal se cerró sin guardar: limpiar el certificado que quedó en `pendientes/`. Nunca tira. */
export async function descartarAdjuntoPendiente(storage_path: string): Promise<void> {
  try { await apiPost<unknown>(`${BASE}/cobros/retenciones/descartar-pendiente`, { storage_path }) } catch { /* best-effort */ }
}

/** Adjuntar el certificado a una retención ya guardada (sube y registra). */
export function useAdjuntarRetencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ retencionId, file }: { retencionId: number; file: File }) => {
      const adj = await subirAdjuntoRetencion(file)
      try {
        return await apiPost<unknown>(`${BASE}/cobros/retenciones/${retencionId}/adjunto`, adj)
      } catch (e) {
        await descartarAdjuntoPendiente(adj.adjunto_path)
        throw e
      }
    },
    onSuccess: () => invalidarFacturacion(qc),
  })
}

/** URL firmada (de vida corta) para ver el certificado de una retención. */
export async function urlAdjuntoRetencion(retencionId: number): Promise<string> {
  const r = await apiGet<{ url?: string; signed_url?: string }>(`${BASE}/retenciones/${retencionId}/url`)
  const url = r.url ?? r.signed_url
  if (!url) throw new Error('El servidor no devolvió la URL del certificado')
  return url
}

// ── Deudores y estado de cuenta ───────────────────────────────────────

/** `al` vacío = hoy. Ordenados por saldo neto, el mayor primero. */
export function useDeudores(al = '', ambiente: VentasAmbiente = 'prod', enabled = true) {
  const p = new URLSearchParams({ ambiente })
  if (al) p.set('al', al)
  const qs = p.toString()
  return useQuery({
    queryKey: [...COBRANZAS_KEYS.deudores, qs],
    queryFn:  async () => aPagina(await apiGet<{ rows: VentasDeudor[] } | VentasDeudor[]>(`${BASE}/deudores?${qs}`)).rows,
    staleTime: 60_000,
    enabled,
  })
}

type EstadoCuentaRaw =
  | VentasEstadoCuentaMov[]
  | {
      movimientos?: VentasEstadoCuentaMov[]; cliente?: VentasCliente | null; desde?: string | null; hasta?: string | null
      saldo_anterior?: number | null; saldo_final?: number | null; totales?: { debe: number; haber: number } | null
    }

/** `{ cliente, desde, hasta, saldo_anterior, movimientos, totales, saldo_final }` (o la lista pelada) → forma fija. */
export function normalizarEstadoCuenta(r: EstadoCuentaRaw, desde: string, hasta: string): VentasEstadoCuenta {
  if (Array.isArray(r)) return { cliente: null, desde: desde || null, hasta: hasta || null, movimientos: r }
  return {
    cliente:        r.cliente ?? null,
    desde:          r.desde ?? (desde || null),
    hasta:          r.hasta ?? (hasta || null),
    movimientos:    r.movimientos ?? [],
    saldo_anterior: r.saldo_anterior ?? null,
    saldo_final:    r.saldo_final ?? null,
    totales:        r.totales ?? null,
  }
}

export function useEstadoCuenta(clienteId: number | null, desde = '', hasta = '', ambiente: VentasAmbiente = 'prod', enabled = true) {
  const p = new URLSearchParams({ ambiente })
  if (desde) p.set('desde', desde)
  if (hasta) p.set('hasta', hasta)
  const qs = p.toString()
  return useQuery({
    queryKey: [...COBRANZAS_KEYS.estadoCuenta(clienteId ?? 0), qs],
    queryFn:  async () => normalizarEstadoCuenta(
      await apiGet<EstadoCuentaRaw>(`${BASE}/clientes/${clienteId}/estado-cuenta?${qs}`), desde, hasta),
    enabled:  enabled && !!clienteId,
    staleTime: 30_000,
  })
}

// ── Vencimiento de cobro de una factura ───────────────────────────────

/** `vence_el: null` = volver al automático (fecha + plazo del cliente). */
export function useCambiarVencimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, vence_el }: { id: number; vence_el: string | null }) =>
      apiPatch<VentasFactura | { factura: VentasFactura }>(`${BASE}/facturas/${id}/vencimiento`, { vence_el }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

// ── Saldos iniciales (comprobantes externos) ──────────────────────────

export interface ExternosFiltro {
  cliente_id?: number
  q?:          string
  /** Solo los «a revisar». */
  a_revisar?:  boolean
  /** 'abiertos' = saldo > 0; 'cobrados' = saldo 0. */
  saldo?:      'abiertos' | 'cobrados'
  cbte_tipo?:  number
  desde?:      string
  hasta?:      string
}

function qsExternos(f: ExternosFiltro, page: number, pageSize: number): string {
  const p = new URLSearchParams()
  if (f.cliente_id) p.set('cliente_id', String(f.cliente_id))
  if (f.q?.trim())  p.set('q', f.q.trim())
  if (f.a_revisar)  p.set('a_revisar', '1')
  if (f.saldo)      p.set('con_saldo', f.saldo === 'abiertos' ? '1' : '0')
  if (f.cbte_tipo)  p.set('cbte_tipo', String(f.cbte_tipo))
  if (f.desde)      p.set('desde', f.desde)
  if (f.hasta)      p.set('hasta', f.hasta)
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  return p.toString()
}

export function useExternos(f: ExternosFiltro, page = 1, pageSize = 100, enabled = true) {
  const qs = qsExternos(f, page, pageSize)
  return useQuery({
    queryKey: [...COBRANZAS_KEYS.externos, 'lista', qs],
    queryFn:  async () => aPagina(await apiGet<VentasExternosPage | VentasExterno[]>(`${BASE}/externos?${qs}`)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

export function useCrearExterno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasExternoInput) => apiPost<VentasExterno>(`${BASE}/externos`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useEditarExterno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<VentasExternoInput> & { id: number }) =>
      apiPatch<VentasExterno>(`${BASE}/externos/${id}`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Solo si no tiene imputaciones (si no, 409 EXTERNO_CON_IMPUTACIONES). */
export function useBorrarExterno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<void>(`${BASE}/externos/${id}`),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/**
 * Acción masiva (`ventas_externos_marcar`): 'cobrada' deja el saldo en 0 con
 * fecha y motivo; 'impaga' confirma el total; 'revisar' vuelve a «a revisar».
 */
export function useMarcarExternos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { ids: number[]; accion: VentasExternoAccion; motivo?: string; fecha?: string }) =>
      apiPost<{ actualizados: number; externos: VentasExterno[] }>(`${BASE}/externos/marcar`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/**
 * Importador de ARCA. `confirmar: false` = vista previa (no escribe nada);
 * `true` = alta (todo o nada: con UNA fila con error sale 409
 * IMPORTACION_CON_ERRORES). Solo invalida cuando confirmó.
 */
export function useImportarExternos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { filas: VentasImportarFilaInput[]; confirmar: boolean; origen?: 'portal' | 'finnegans' | 'otro' }) =>
      apiPost<VentasImportarRes>(`${BASE}/externos/importar`, body),
    onSuccess:  (r) => { if (r.confirmado) void invalidarFacturacion(qc) },
  })
}
