// Módulo Pagos — facturas de proveedor y órdenes de pago.
//
// Todo se filtra, pagina y suma en el SERVER (v_pagos_facturas, v_pagos_ordenes
// y las RPC `pagos_resumen` / `pagos_ordenes_resumen`): acá solo se arma la
// query string y se cachea por filtro. Nada de sumar sobre una página — el cap
// de 1000 filas de PostgREST daría un total falso.
//
// Los proveedores viven en `useProveedoresPagos.ts`, contra el padrón PROPIO
// del módulo (`pagos_proveedores`): no es el de Compras y no se cruzan.

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type {
  AnularFacturaRes, AnularOrdenRes, AprobarLoteRes, CrearFacturaInput, CrearFacturaRes, CrearOrdenInput,
  EditarFacturaInput, EditarFacturaRes, EditarOrdenInput, PagosAdjunto, PagosAdjuntoPendiente,
  PagosCatalogoObra, PagosEntidadAdjunto, PagosEstadoFactura, PagosEstadoOrden, PagosFactura, PagosFacturaDetalle,
  PagosFacturasGrupo, PagosFacturasPage, PagosFacturasResumen, PagosFormaPagoOPGuardada,
  PagosFormaPrevista, PagosOrdenDetalle, PagosOrdenesEje, PagosOrdenesGrupo, PagosOrdenesPage, PagosOrdenExport, PagosPaquete,
  PagosOrdenesResumen, PagosTipoAdjFactura, PagosTipoAdjOrden, PagosTipoComprobante, PagosUploadUrlRes,
  RegistrarOrdenRes,
} from '@/types/domain.types'

// ── Claves ────────────────────────────────────────────────────────────
// Las de notificación cuelgan de ['pagos','notificaciones',…] Y ADEMÁS se
// invalidan explícitamente en `invalidarPagos`: el prefijo del módulo no
// alcanza cuando la campana las monta con su propia clave (bug de gastos,
// 2026-09-07).

export const PAGOS_KEY = ['pagos'] as const

export const PAGOS_KEYS = {
  todo:            PAGOS_KEY,
  facturas:        ['pagos', 'facturas'] as const,
  facturasResumen: ['pagos', 'facturas', 'resumen'] as const,
  factura:         (id: number) => ['pagos', 'facturas', id] as const,
  ordenes:         ['pagos', 'ordenes'] as const,
  ordenesResumen:  ['pagos', 'ordenes', 'resumen'] as const,
  orden:           (id: number) => ['pagos', 'ordenes', id] as const,
  proveedores:     ['pagos', 'proveedores'] as const,
  proveedor:       (id: number) => ['pagos', 'proveedores', id] as const,
  saldos:          ['pagos', 'proveedores', 'saldos'] as const,
  adjuntos:        (entidad: PagosEntidadAdjunto, id: number) => ['pagos', 'adjuntos', entidad, id] as const,
  catalogoObras:   ['pagos', 'catalogos', 'obras'] as const,
  notifAprobar:    ['pagos', 'notificaciones', 'para-aprobar'] as const,
  notifSinRevisar: ['pagos', 'notificaciones', 'sin-revisar'] as const,
  notifVenc:       ['pagos', 'notificaciones', 'vencimientos'] as const,
  notifObs:        ['pagos', 'notificaciones', 'observadas'] as const,
}

/** Invalida TODO el módulo más las cuatro secciones de la campana. Una sola puerta. */
export function invalidarPagos(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: PAGOS_KEYS.todo })
  for (const k of [PAGOS_KEYS.notifAprobar, PAGOS_KEYS.notifSinRevisar, PAGOS_KEYS.notifVenc, PAGOS_KEYS.notifObs]) {
    qc.invalidateQueries({ queryKey: k })
  }
}

// ── Filtros ───────────────────────────────────────────────────────────

/** Ventana de vencimiento. Las facturas sin vencimiento solo entran en «todas». */
export type PagosVencimiento = 'vencidas' | '7' | '30' | 'todas'
export type PagosOrdenFacturas = 'vencimiento' | 'fecha' | 'saldo'

export interface PagosFacturasFiltro {
  q?:            string
  proveedor_id?: number
  obra_cod?:     string
  centro_costo?: string
  estados?:      PagosEstadoFactura[]
  tipo?:         PagosTipoComprobante
  forma_pago?:   PagosFormaPrevista
  vencimiento?:  PagosVencimiento
  /** Fechas de EMISIÓN (el eje de pago es el de órdenes). */
  desde?:        string
  hasta?:        string
  sin_adjunto?:     boolean
  sin_numero?:      boolean
  sin_revisar?:     boolean
  cuenta_cambiada?: boolean
  /** Tri-estado: sin definir no filtra, `false` trae solo las que NO lo son. */
  paga_cliente?:     boolean
  pagada_al_cargar?: boolean
  es_interna?:       boolean
  anuladas?:    boolean
  archivadas?:  boolean
  orden?:       PagosOrdenFacturas
}

export interface PagosOrdenesFiltro {
  q?:            string
  proveedor_id?: number
  forma_pago?:   PagosFormaPagoOPGuardada
  estado?:       'emitida' | 'anulada'
  /** Fechas de PAGO. */
  desde?:        string
  hasta?:        string
  sin_comprobante?:  boolean
  en_cartera?:       boolean
  con_nota_credito?: boolean
}

type ExtraQuery = Record<string, string | number | undefined>

function qsFacturas(f: PagosFacturasFiltro, extra: ExtraQuery = {}): string {
  const p = new URLSearchParams()
  if (f.q?.trim())        p.set('q', f.q.trim())
  if (f.proveedor_id)     p.set('proveedor_id', String(f.proveedor_id))
  if (f.obra_cod)         p.set('obra_cod', f.obra_cod)
  if (f.centro_costo)     p.set('centro_costo', f.centro_costo)
  if (f.estados?.length)  p.set('estado', f.estados.join(','))
  if (f.tipo)             p.set('tipo', f.tipo)
  if (f.forma_pago)       p.set('forma_pago', f.forma_pago)
  if (f.vencimiento)      p.set('vencimiento', f.vencimiento)
  if (f.desde)            p.set('desde', f.desde)
  if (f.hasta)            p.set('hasta', f.hasta)
  if (f.sin_adjunto)      p.set('sin_adjunto', '1')
  if (f.sin_numero)       p.set('sin_numero', '1')
  if (f.sin_revisar)      p.set('sin_revisar', '1')
  if (f.cuenta_cambiada)  p.set('cuenta_cambiada', '1')
  // Tri-estado: el backend distingue "no filtrar" de "false".
  if (f.paga_cliente     !== undefined) p.set('paga_cliente',     f.paga_cliente     ? '1' : '0')
  if (f.pagada_al_cargar !== undefined) p.set('pagada_al_cargar', f.pagada_al_cargar ? '1' : '0')
  if (f.es_interna       !== undefined) p.set('es_interna',       f.es_interna       ? '1' : '0')
  if (f.anuladas)         p.set('anuladas', '1')
  if (f.archivadas)       p.set('archivadas', '1')
  if (f.orden)            p.set('orden', f.orden)
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

function qsOrdenes(f: PagosOrdenesFiltro, extra: ExtraQuery = {}): string {
  const p = new URLSearchParams()
  if (f.q?.trim())         p.set('q', f.q.trim())
  if (f.proveedor_id)      p.set('proveedor_id', String(f.proveedor_id))
  if (f.forma_pago)        p.set('forma_pago', f.forma_pago)
  if (f.estado)            p.set('estado', f.estado)
  if (f.desde)             p.set('desde', f.desde)
  if (f.hasta)             p.set('hasta', f.hasta)
  if (f.sin_comprobante)   p.set('sin_comprobante', '1')
  if (f.en_cartera)        p.set('en_cartera', '1')
  if (f.con_nota_credito)  p.set('con_nota_credito', '1')
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

// ── Facturas ──────────────────────────────────────────────────────────

/** La bandeja. `page` arranca en 1. */
export function useFacturas(f: PagosFacturasFiltro, page: number, pageSize = 50, enabled = true) {
  const qs = qsFacturas(f, { limit: pageSize, offset: (page - 1) * pageSize })
  return useQuery({
    queryKey: [...PAGOS_KEYS.facturas, 'lista', qs],
    queryFn:  () => apiGet<PagosFacturasPage>(`/api/pagos/facturas?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })
}

/**
 * Agregados por grupo (eje EMISIÓN): los KPI de deuda y el tab Resumen. Se
 * pide SIN `estados` para que los chips muestren cuánto hay en cada estado con
 * el resto de los filtros puestos.
 */
export function useFacturasResumen(f: PagosFacturasFiltro, grupo: PagosFacturasGrupo, enabled = true) {
  const qs = qsFacturas({ ...f, estados: undefined }, { grupo })
  return useQuery({
    queryKey: [...PAGOS_KEYS.facturasResumen, qs],
    queryFn:  () => apiGet<PagosFacturasResumen>(`/api/pagos/facturas/resumen?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })
}

export function useFactura(id: number | null, incluirBorrados = false) {
  return useQuery({
    queryKey: [...PAGOS_KEYS.factura(id ?? 0), incluirBorrados],
    queryFn:  () => apiGet<PagosFacturaDetalle>(
      `/api/pagos/facturas/${id}${incluirBorrados ? '?borrados=1' : ''}`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

/** Todas las filas del filtro, para el Excel. El backend pagina de a 1000 con orden estable. */
export function fetchFacturasExport(f: PagosFacturasFiltro): Promise<PagosFactura[]> {
  return apiGet<PagosFactura[]>(`/api/pagos/facturas/export?${qsFacturas(f)}`)
}

/** El manifiesto del paquete para el contador: los archivos del filtro, con URL firmada. */
export function fetchPaqueteContador(f: PagosFacturasFiltro): Promise<PagosPaquete> {
  return apiGet<PagosPaquete>(`/api/pagos/facturas/paquete?${qsFacturas(f)}`)
}

/** Todas las órdenes del filtro, con sus cheques, para el Excel. */
export function fetchOrdenesExport(f: PagosOrdenesFiltro): Promise<PagosOrdenExport[]> {
  return apiGet<PagosOrdenExport[]>(`/api/pagos/ordenes/export?${qsOrdenes(f)}`)
}

export function useCrearFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CrearFacturaInput) => apiPost<CrearFacturaRes>('/api/pagos/facturas', input),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Ojo: editar un campo de `CAMPOS_QUE_DESAPRUEBAN` devuelve la factura a `pendiente` (viene en `avisos`). */
export function useEditarFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: EditarFacturaInput & { id: number }) =>
      apiPatch<EditarFacturaRes>(`/api/pagos/facturas/${id}`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Aprobar una, o sellar una «pagada al cargar» que estaba sin revisar. */
export function useAprobarFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<PagosFactura>(`/api/pagos/facturas/${id}/aprobar`, {}),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** «Aprobar N»: no es todo o nada, aplica las que puede y devuelve `omitidas` con su motivo. */
export function useAprobarFacturas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => apiPost<AprobarLoteRes>('/api/pagos/facturas/aprobar', { ids }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Observar = «Rechazar» para el aprobador. Rebota si la factura ya tiene pagos. */
export function useObservarFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<PagosFactura>(`/api/pagos/facturas/${id}/observar`, { motivo }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Compras corrigió lo observado: vuelve a `pendiente`, nunca directo a `aprobada`. */
export function useMarcarCorregida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, comentario }: { id: number; comentario?: string }) =>
      apiPost<PagosFactura>(`/api/pagos/facturas/${id}/corregida`, { comentario: comentario ?? '' }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Si era «pagada al cargar» anula también su OP: la respuesta trae `{ factura, orden }`. */
export function useAnularFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<AnularFacturaRes>(`/api/pagos/facturas/${id}/anular`, { motivo }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

// ── Órdenes de pago ───────────────────────────────────────────────────

export function useOrdenes(f: PagosOrdenesFiltro, page: number, pageSize = 50, enabled = true) {
  const qs = qsOrdenes(f, { limit: pageSize, offset: (page - 1) * pageSize })
  return useQuery({
    queryKey: [...PAGOS_KEYS.ordenes, 'lista', qs],
    queryFn:  () => apiGet<PagosOrdenesPage>(`/api/pagos/ordenes?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })
}

/** Eje FECHA DE PAGO: «Pagado este mes» no sale de las facturas, que van por emisión. */
export function useOrdenesResumen(
  params: { grupo: PagosOrdenesGrupo; eje?: PagosOrdenesEje; desde?: string; hasta?: string
            proveedor_id?: number; forma_pago?: PagosFormaPagoOPGuardada },
  enabled = true,
) {
  const p = new URLSearchParams({ grupo: params.grupo })
  if (params.eje)          p.set('eje', params.eje)
  if (params.desde)        p.set('desde', params.desde)
  if (params.hasta)        p.set('hasta', params.hasta)
  if (params.proveedor_id) p.set('proveedor_id', String(params.proveedor_id))
  if (params.forma_pago)   p.set('forma_pago', params.forma_pago)
  const qs = p.toString()
  return useQuery({
    queryKey: [...PAGOS_KEYS.ordenesResumen, qs],
    queryFn:  () => apiGet<PagosOrdenesResumen>(`/api/pagos/ordenes/resumen?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })
}

export function useOrden(id: number | null) {
  return useQuery({
    queryKey: PAGOS_KEYS.orden(id ?? 0),
    queryFn:  () => apiGet<PagosOrdenDetalle>(`/api/pagos/ordenes/${id}`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

/**
 * Registrar el pago: TODO O NADA. Los archivos ya tienen que estar subidos con
 * `subirComprobantePendiente` — si el POST falla, el form conserva los
 * `storage_path` y reintenta sin volver a subir.
 */
export function useRegistrarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CrearOrdenInput) => apiPost<RegistrarOrdenRes>('/api/pagos/ordenes', input),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Solo `referencia` y `obs`: lo financiero de una OP no se edita, se anula y se hace otra. */
export function useEditarOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: EditarOrdenInput & { id: number }) =>
      apiPatch<{ id: number; numero: number; referencia: string; obs: string; estado: PagosEstadoOrden }>(
        `/api/pagos/ordenes/${id}`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

export function useAnularOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<AnularOrdenRes>(`/api/pagos/ordenes/${id}/anular`, { motivo }),
    onSuccess:  () => invalidarPagos(qc),
  })
}

// ── Adjuntos (bucket privado `pagos-docs`) ────────────────────────────
// Tres pasos: upload-url → PUT a la signed URL → registrar la fila. El backend
// hashea lo que QUEDÓ en el bucket, así que el `size_bytes` que mandamos es
// informativo. Cuidado con el nombre: la respuesta trae `storage_path`, no
// `path` (el mismatch de shapes entre repos ya costó un bug en 2026-05-19).

export function usePagosAdjuntos(entidad: PagosEntidadAdjunto, id: number | null, incluirBorrados = false) {
  return useQuery({
    queryKey: [...PAGOS_KEYS.adjuntos(entidad, id ?? 0), incluirBorrados],
    queryFn:  () => apiGet<PagosAdjunto[]>(
      `/api/pagos/${entidad}/${id}/adjuntos${incluirBorrados ? '?borrados=1' : ''}`),
    enabled:  !!id,
    staleTime: 30_000,
  })
}

export interface SubirAdjuntoInput {
  entidad: PagosEntidadAdjunto
  id:      number
  file:    File
  tipo:    PagosTipoAdjFactura | PagosTipoAdjOrden
  obs?:    string
}

export function useSubirAdjuntoPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entidad, id, file, tipo, obs }: SubirAdjuntoInput) => {
      const up = await apiPost<PagosUploadUrlRes>(
        `/api/pagos/${entidad}/${id}/adjuntos/upload-url`,
        { tipo, nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size },
      )
      const put = await fetch(up.signed_url, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!put.ok) throw new Error(`No se pudo subir el archivo (${put.status})`)
      return apiPost<PagosAdjunto>(`/api/pagos/${entidad}/${id}/adjuntos`, {
        tipo, storage_path: up.storage_path, nombre_archivo: file.name, mime_type: file.type, obs: obs ?? '',
      })
    },
    // El chip 📎 de la fila sale de la lista (`tiene_factura_adj` /
    // `tiene_comprobante`), no de esta query: hay que invalidar las dos.
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: PAGOS_KEYS.adjuntos(v.entidad, v.id) })
      qc.invalidateQueries({ queryKey: v.entidad === 'facturas' ? PAGOS_KEYS.facturas : PAGOS_KEYS.ordenes })
    },
  })
}

export function useBorrarAdjuntoPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entidad, id, adjId }: { entidad: PagosEntidadAdjunto; id: number; adjId: number }) =>
      apiDelete<{ success: boolean; id: number }>(`/api/pagos/${entidad}/${id}/adjuntos/${adjId}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: PAGOS_KEYS.adjuntos(v.entidad, v.id) })
      qc.invalidateQueries({ queryKey: v.entidad === 'facturas' ? PAGOS_KEYS.facturas : PAGOS_KEYS.ordenes })
    },
  })
}

/** Para `abrirAdjuntoFirmado`: la URL vive 15 minutos y fuerza descarga con el nombre original. */
export async function fetchPagosAdjuntoSignedUrl(
  entidad: PagosEntidadAdjunto, id: number, adjId: number,
): Promise<string> {
  const data = await apiGet<{ url: string; nombre_archivo: string }>(
    `/api/pagos/${entidad}/${id}/adjuntos/${adjId}/signed-url`)
  return data.url
}

/**
 * Comprobante de pago / PDF de nota de crédito ANTES de que exista la OP: el
 * archivo va a `ordenes/pendientes/` y lo que devuelve esta función viaja en
 * `adjuntos[]` del POST. El form tiene que GUARDAR el resultado: si el POST
 * rebota (saldo, permisos), se reintenta sin volver a subir.
 */
export async function subirComprobantePendiente(
  file: File, tipo: PagosTipoAdjOrden = 'comprobante_pago',
): Promise<PagosAdjuntoPendiente> {
  const up = await apiPost<PagosUploadUrlRes>('/api/pagos/ordenes/upload-comprobante', {
    tipo, nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size,
  })
  const put = await fetch(up.signed_url, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
  if (!put.ok) throw new Error(`No se pudo subir el comprobante (${put.status})`)
  return { tipo, storage_path: up.storage_path, nombre_archivo: file.name, mime_type: file.type }
}

/** El modal se cerró sin guardar: limpiar lo que quedó colgado en el bucket. */
export function borrarComprobantePendiente(storage_path: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>('/api/pagos/ordenes/comprobante-pendiente', { storage_path })
}

// ── Catálogos ─────────────────────────────────────────────────────────

/**
 * Obras como centro de costo. Vienen TODAS (también las archivadas, para
 * mostrar facturas viejas): el módulo no aplica alcance por obra y no depende
 * de `GET /api/obras`.
 */
export function useCatalogoObrasPagos(enabled = true) {
  return useQuery({
    queryKey: PAGOS_KEYS.catalogoObras,
    queryFn:  () => apiGet<PagosCatalogoObra[]>('/api/pagos/catalogos/obras'),
    staleTime: 300_000,
    enabled,
  })
}
