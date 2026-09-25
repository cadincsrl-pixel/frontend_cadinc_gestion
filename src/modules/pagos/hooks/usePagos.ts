// Módulo Pagos — facturas de proveedor y órdenes de pago.
//
// Todo se filtra, pagina y suma en el SERVER (v_pagos_facturas, v_pagos_ordenes
// y las RPC `pagos_resumen` / `pagos_ordenes_resumen`): acá solo se arma la
// query string y se cachea por filtro. Nada de sumar sobre una página — el cap
// de 1000 filas de PostgREST daría un total falso.
//
// Los proveedores viven en `useProveedoresPagos.ts`, contra el padrón PROPIO
// del módulo (`pagos_proveedores`): no es el de Compras y no se cruzan.

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type {
  AnularFacturaRes, AnularOrdenRes, AplicarNcRes, AprobarLoteRes, CrearFacturaInput, CrearFacturaRes, CrearOrdenInput,
  EditarFacturaInput, EditarFacturaRes, EditarOrdenInput, PagosAdjunto, PagosAdjuntoPendiente,
  PagosCatalogoObra, PagosCuentaOrigen, PagosEntidadAdjunto, PagosEstadoFactura, PagosEstadoOrden, PagosFactura, PagosFacturaDetalle,
  PagosFacturasGrupo, PagosFacturasPage, PagosFacturasResumen, PagosFormaPagoOPGuardada,
  PagosFormaPrevista, PagosOrdenDetalle, PagosOrdenesEje, PagosOrdenesGrupo, PagosOrdenesPage, PagosOrdenExport, PagosPaquete,
  PagosOrdenesResumen, PagosTipoAdjFactura, PagosTipoAdjOrden, PagosTipoComprobante, PagosUploadUrlRes,
  PagosAviso, PagosAvisoResultado, PagosMailEstado, PagosLecturaRes, PagosAplicaNcInput, PagosClaseComprobante,
  PagosDesgloseInput, PagosDesgloseLeidoRes, PagosCompletarDesgloseRes,
  RegistrarOrdenRes, PagosChequeLecturaRes,
  PagosDeshacerImportacionRes, PagosImportacion, PagosImportarRecibidosInput, PagosImportarRecibidosRes, PagosImputarFacturaInput,
  PagosImputarLoteInput, PagosOrigenCarga, PagosPeriodoIvaSugerido, PagosMarcarPagadasInput, PagosMarcarPagadasRes,
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
  cuentasOrigen:   ['pagos', 'catalogos', 'cuentas-origen'] as const,
  conceptos:       ['pagos', 'conceptos'] as const,
  /** Período IVA sugerido para una fecha (20260927a). */
  periodoIva:      (fecha: string) => ['pagos', 'periodo-iva', fecha] as const,
  /** Cuántas importadas faltan imputar (chip de la bandeja). */
  sinImputar:      ['pagos', 'facturas', 'sin-imputar-count'] as const,
  importaciones:   ['pagos', 'importaciones'] as const,
  notifAprobar:    ['pagos', 'notificaciones', 'para-aprobar'] as const,
  notifSinRevisar: ['pagos', 'notificaciones', 'sin-revisar'] as const,
  notifVenc:       ['pagos', 'notificaciones', 'vencimientos'] as const,
  notifObs:        ['pagos', 'notificaciones', 'observadas'] as const,
}

/**
 * Invalida TODO el módulo más las cuatro secciones de la campana. Una sola puerta.
 *
 * También los pendientes del motor de asientos de Contabilidad (20260927):
 * imputar o corregir una factura cambia su propuesta, y quien vuelve desde
 * «Ir al origen» tiene que ver la fila al día. Es solo lectura del otro
 * módulo: la clave va literal para no importar sus hooks.
 */
export function invalidarPagos(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: PAGOS_KEYS.todo })
  for (const k of [PAGOS_KEYS.notifAprobar, PAGOS_KEYS.notifSinRevisar, PAGOS_KEYS.notifVenc, PAGOS_KEYS.notifObs]) {
    qc.invalidateQueries({ queryKey: k })
  }
  qc.invalidateQueries({ queryKey: ['contabilidad', 'automaticos'] })
  qc.invalidateQueries({ queryKey: ['contabilidad', 'propuesta'] })
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
  /** Sin IVA discriminado o marcadas a revisar: lo que le falta al Libro IVA (20260924v). */
  sin_desglose?:    boolean
  cuenta_cambiada?: boolean
  /** Tri-estado: sin definir no filtra, `false` trae solo las que NO lo son. */
  paga_cliente?:     boolean
  pagada_al_cargar?: boolean
  es_interna?:       boolean
  anuladas?:    boolean
  archivadas?:  boolean
  orden?:       PagosOrdenFacturas
  /** Factura o nota de crédito (20260925). Sin definir trae las dos. */
  clase?:       PagosClaseComprobante
  /** Solo NC aprobadas con crédito sin aplicar (`nc_disponible > 0`). */
  con_credito?: boolean
  /** Concepto de compra (20260925). */
  concepto_id?: number
  /** Mes del Libro IVA, `YYYY-MM` (20260927a). */
  periodo_iva?:          string
  /** Informadas en otro mes que el de la fecha. */
  periodo_iva_distinto?: boolean
  /**
   * Importadas de ARCA sin concepto ni reparto (20260927b). Tri-estado: sin
   * definir no filtra, `false` las esconde (la bandeja arranca así) y `true`
   * trae solo esas.
   */
  sin_imputar?:          boolean
  /**
   * Importadas de meses ya pagados (20260928). Tri-estado como `sin_imputar`:
   * la bandeja y la campana mandan `false` (no son deuda); `true` las muestra.
   */
  pago_a_reconstruir?:   boolean
  /** «Otros tributos» de ARCA sin clasificar. */
  tributos_a_revisar?:   boolean
  origen_carga?:         PagosOrigenCarga
  /** Las de una importación puntual (link del importador). */
  importacion_id?:       number
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
  /** Emitidas sin recibo del proveedor adjunto (20260925q). */
  sin_recibo?:       boolean
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
  if (f.sin_desglose)     p.set('sin_desglose', '1')
  if (f.cuenta_cambiada)  p.set('cuenta_cambiada', '1')
  // Tri-estado: el backend distingue "no filtrar" de "false".
  if (f.paga_cliente     !== undefined) p.set('paga_cliente',     f.paga_cliente     ? '1' : '0')
  if (f.pagada_al_cargar !== undefined) p.set('pagada_al_cargar', f.pagada_al_cargar ? '1' : '0')
  if (f.es_interna       !== undefined) p.set('es_interna',       f.es_interna       ? '1' : '0')
  if (f.anuladas)         p.set('anuladas', '1')
  if (f.archivadas)       p.set('archivadas', '1')
  if (f.orden)            p.set('orden', f.orden)
  if (f.clase)            p.set('clase', f.clase)
  if (f.con_credito)      p.set('con_credito', '1')
  if (f.concepto_id)      p.set('concepto_id', String(f.concepto_id))
  if (f.periodo_iva)      p.set('periodo_iva', f.periodo_iva.slice(0, 7))
  if (f.periodo_iva_distinto) p.set('periodo_iva_distinto', '1')
  if (f.sin_imputar !== undefined) p.set('sin_imputar', f.sin_imputar ? '1' : '0')
  if (f.pago_a_reconstruir !== undefined) p.set('pago_a_reconstruir', f.pago_a_reconstruir ? '1' : '0')
  if (f.tributos_a_revisar) p.set('tributos_a_revisar', '1')
  if (f.origen_carga)     p.set('origen_carga', f.origen_carga)
  if (f.importacion_id)   p.set('importacion_id', String(f.importacion_id))
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

/** El query string de un filtro de facturas (lo usa la campana para contar igual que la bandeja). */
export function queryFacturas(f: PagosFacturasFiltro): string {
  return qsFacturas(f)
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
  if (f.sin_recibo)        p.set('sin_recibo', '1')
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

/**
 * NC del proveedor con crédito sin aplicar (aprobadas, `nc_disponible > 0`).
 * Alimenta el aviso de «Registrar pago»: el crédito NO se aplica solo, se
 * aplica a mano desde la ficha de la NC.
 */
export function useNcDisponibles(proveedorId: number | null | undefined, enabled = true) {
  const qs = qsFacturas({ proveedor_id: proveedorId ?? undefined, clase: 'nota_credito', con_credito: true }, { limit: 50, offset: 0 })
  return useQuery({
    queryKey: [...PAGOS_KEYS.facturas, 'nc-disponibles', proveedorId ?? 0],
    queryFn:  () => apiGet<PagosFacturasPage>(`/api/pagos/facturas?${qs}`),
    enabled:  enabled && !!proveedorId,
    staleTime: 30_000,
  })
}

/**
 * Facturas abiertas del proveedor a las que una NC puede acreditar
 * («Acredita a…»). El tope de cada una es su `saldo_pagable`.
 */
export function useFacturasAcreditables(proveedorId: number | null | undefined, enabled = true) {
  const qs = qsFacturas({
    proveedor_id: proveedorId ?? undefined, clase: 'factura',
    estados: ['pendiente', 'observada', 'aprobada', 'pagada_parcial'], paga_cliente: false, orden: 'fecha',
  }, { limit: 200, offset: 0 })
  return useQuery({
    queryKey: [...PAGOS_KEYS.facturas, 'acreditables', proveedorId ?? 0],
    queryFn:  () => apiGet<PagosFacturasPage>(`/api/pagos/facturas?${qs}`),
    enabled:  enabled && !!proveedorId,
    staleTime: 30_000,
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

/**
 * El detalle de varias facturas a la vez (mismo cache que `useFactura`). Lo
 * usa la NC para prorratear su reparto por obra según las facturas que acredita.
 */
export function useFacturasDetalle(ids: number[]) {
  return useQueries({
    queries: ids.map(id => ({
      queryKey: [...PAGOS_KEYS.factura(id), false],
      queryFn:  () => apiGet<PagosFacturaDetalle>(`/api/pagos/facturas/${id}`),
      staleTime: 30_000,
    })),
  })
}

/**
 * Cuántas facturas coinciden con un filtro, sin bajar la lista: `limit=1` y
 * se toma el `total`. Lo usa el chip «Sin imputar (N)», con EL MISMO filtro
 * que el deep-link `aviso=sin-imputar` (§5.9: el número y la pantalla no
 * pueden diferir).
 */
export function useContarFacturas(f: PagosFacturasFiltro, enabled = true) {
  const qs = qsFacturas(f, { limit: 1, offset: 0 })
  return useQuery({
    queryKey: [...PAGOS_KEYS.sinImputar, qs],
    queryFn:  async () => (await apiGet<PagosFacturasPage>(`/api/pagos/facturas?${qs}`)).total,
    staleTime: 60_000,
    enabled,
  })
}

/**
 * Período IVA sugerido para la fecha (20260927a): el mes de la fecha, o el
 * primero abierto si ese mes ya está cerrado en Contabilidad.
 */
export function usePeriodoIvaSugerido(fecha: string | null | undefined, enabled = true) {
  const valida = !!fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
  return useQuery({
    queryKey: PAGOS_KEYS.periodoIva(fecha ?? ''),
    queryFn:  () => apiGet<PagosPeriodoIvaSugerido>(`/api/pagos/facturas/periodo-iva-sugerido?fecha=${fecha}`),
    enabled:  enabled && valida,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Todas las filas del filtro, para el Excel. El backend pagina de a 1000 con orden estable. */
export function fetchFacturasExport(f: PagosFacturasFiltro): Promise<PagosFactura[]> {
  return apiGet<PagosFactura[]>(`/api/pagos/facturas/export?${qsFacturas(f)}`)
}

/** Todas las órdenes del filtro, con sus cheques, para el Excel. */
export function fetchOrdenesExport(f: PagosOrdenesFiltro): Promise<PagosOrdenExport[]> {
  return apiGet<PagosOrdenExport[]>(`/api/pagos/ordenes/export?${qsOrdenes(f)}`)
}

/**
 * El manifiesto del paquete para el contador. Cuelga de ÓRDENES, no de
 * facturas: va sobre lo PAGADO en el período, que es lo que el contador
 * concilia contra el banco.
 */
export function fetchPaqueteContador(f: PagosOrdenesFiltro): Promise<PagosPaquete> {
  return apiGet<PagosPaquete>(`/api/pagos/ordenes/paquete?${qsOrdenes(f)}`)
}

// ── Aviso de pago por mail (20260921m) ────────────────────────────────

/** ¿El servidor puede mandar mail? Si no, el botón lo dice en vez de fallar. */
export function useMailEstado(enabled = true) {
  return useQuery({
    queryKey: [...PAGOS_KEY, 'mail-estado'],
    queryFn:  () => apiGet<PagosMailEstado>('/api/pagos/mail/estado'),
    staleTime: 300_000,
    enabled,
  })
}

/** Lo que ya se mandó de esa orden, para no repetirlo a ciegas. */
export function useAvisosDeOrden(ordenId: number | null) {
  return useQuery({
    queryKey: [...PAGOS_KEY, 'avisos', ordenId],
    queryFn:  () => apiGet<PagosAviso[]>(`/api/pagos/ordenes/${ordenId}/avisos`),
    enabled:  ordenId !== null,
  })
}

/**
 * Manda el aviso. NO lanza por un fallo de correo: devuelve un resultado por
 * destinatario, y la pantalla muestra cuál salió y cuál no.
 */
export function useAvisarPago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: number; a_proveedor?: boolean; a_contador?: boolean
      email_proveedor?: string; emails_proveedor?: string[]; guardar_email?: boolean
    }) => apiPost<{ resultados: PagosAvisoResultado[] }>(`/api/pagos/ordenes/${id}/avisar`, body),
    onSuccess: () => invalidarPagos(qc),
  })
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

/**
 * Completar el desglose impositivo (20260924v): aunque esté pagada, sin
 * cambiar total ni percepciones (lo valida la base). `forzar` sólo admin.
 */
export function useCompletarDesglose() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: PagosDesgloseInput & { id: number; forzar?: boolean }) =>
      apiPost<PagosCompletarDesgloseRes>(`/api/pagos/facturas/${id}/desglose`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Lee el comprobante ya adjunto (QR del navegador + IA) y propone el desglose. No guarda nada. */
export function leerAdjuntoFactura(id: number, body: { adjunto_id?: number | null; qr_texto: string | null }): Promise<PagosDesgloseLeidoRes> {
  return apiPost<PagosDesgloseLeidoRes>(`/api/pagos/facturas/${id}/leer-adjunto`, body)
}

/**
 * Aplicar el crédito de una NC aprobada a facturas del proveedor. Solo AGREGA
 * (si ya había aplicación a esa factura, suma). Permiso: `aprobar_facturas` o
 * `registrar_pagos`.
 */
export function useAplicarNc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, aplica_a }: { id: number; aplica_a: PagosAplicaNcInput[] }) =>
      apiPost<AplicarNcRes>(`/api/pagos/facturas/${id}/aplicar-nc`, { aplica_a }),
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

// ── Importar «Mis Comprobantes Recibidos» e imputar (20260927b/c) ─────

/**
 * Vista previa (`confirmar:false`, no escribe nada) o importación (todo o
 * nada). Solo la confirmada invalida: la vista previa no cambió nada.
 */
export function useImportarRecibidos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PagosImportarRecibidosInput) =>
      apiPost<PagosImportarRecibidosRes>('/api/pagos/facturas/importar-arca', body),
    onSuccess:  (r) => { if (r.confirmado) invalidarPagos(qc) },
  })
}

export function useImportaciones(enabled = true) {
  return useQuery({
    queryKey: PAGOS_KEYS.importaciones,
    queryFn:  () => apiGet<PagosImportacion[]>('/api/pagos/importaciones'),
    staleTime: 60_000,
    enabled,
  })
}

// ── Deshacer una importación (20260929k) ──────────────────────────────

/** Vista previa: cuántas se anulan, asientos y bloqueos. No escribe. */
export function useDeshacerImportacionVista(id: number | null) {
  return useQuery({
    queryKey: [...PAGOS_KEYS.importaciones, id ?? 0, 'deshacer'],
    queryFn:  () => apiGet<PagosDeshacerImportacionRes>(`/api/pagos/importaciones/${id}/deshacer`),
    enabled:  id != null,
    staleTime: 0,
    retry: false,
  })
}

/**
 * Deshacer: TODO O NADA (409 IMPORTACION_CON_MOVIMIENTOS con los bloqueos).
 * Anula las facturas y sus asientos en períodos abiertos: invalida Compras
 * entero (bandeja, resumen, importaciones, campana, pendientes del motor) y
 * todo Contabilidad (asientos, diario, mayor, estados).
 */
export function useDeshacerImportacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<PagosDeshacerImportacionRes>(`/api/pagos/importaciones/${id}/deshacer`, { motivo }),
    onSuccess: () => {
      invalidarPagos(qc)
      qc.invalidateQueries({ queryKey: PAGOS_KEYS.facturasResumen })
      qc.invalidateQueries({ queryKey: PAGOS_KEYS.importaciones })
      qc.invalidateQueries({ queryKey: ['contabilidad'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

/** Concepto + reparto por obra de UNA importada. Después se aprueba como cualquier otra. */
export function useImputarFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: PagosImputarFacturaInput & { id: number }) =>
      apiPost<{ factura: PagosFactura }>(`/api/pagos/facturas/${id}/imputar`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Imputar varias al 100 % a una obra con un concepto. Todo o nada (máx. 200). */
export function useImputarLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PagosImputarLoteInput) =>
      apiPost<{ imputadas: number; ids: number[] }>('/api/pagos/facturas/imputar-lote', body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/**
 * «Marcar pagadas (tarjeta / Mercado Pago)» (20260927h): una OP por factura,
 * todo o nada. Mueve facturas, órdenes, saldos por proveedor y la campana:
 * `invalidarPagos` cubre las cuatro.
 */
export function useMarcarPagadas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PagosMarcarPagadasInput) =>
      apiPost<PagosMarcarPagadasRes>('/api/pagos/facturas/marcar-pagadas', body),
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
 * Comprobante de pago ANTES de que exista la OP: el
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

/**
 * «Archivo primero» (20260924u): sube la factura antes de que exista y le
 * pide al backend que la lea. `qrTexto` es el QR de ARCA si el navegador lo
 * encontró (`leerQrDelArchivo`). No crea nada: devuelve una propuesta.
 */
export async function subirFacturaParaLeer(file: File): Promise<{ storage_path: string }> {
  const up = await apiPost<{ storage_path: string; signed_url: string }>('/api/pagos/facturas/upload-lectura', {
    nombre_archivo: file.name, mime_type: file.type, size_bytes: file.size,
  })
  const put = await fetch(up.signed_url, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
  if (!put.ok) throw new Error(`No se pudo subir el archivo (${put.status})`)
  return { storage_path: up.storage_path }
}

export function leerFactura(body: {
  storage_path: string; nombre_archivo: string; mime_type: string; qr_texto: string | null
}): Promise<PagosLecturaRes> {
  return apiPost<PagosLecturaRes>('/api/pagos/facturas/leer', body)
}

/** Se cerró el modal (o se cambió el archivo) sin cargar: el archivo leído se borra. */
export function descartarLecturaFactura(storage_path: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>('/api/pagos/facturas/lectura-pendiente', { storage_path })
}

/**
 * Foto de un cheque físico (20260925). Dos pasos, separados a propósito:
 * primero se sube como adjunto PENDIENTE de OP (`subirComprobantePendiente(file,
 * 'cheque')`, el mismo camino que el comprobante) y después se le pide al
 * backend que la lea con IA. Si la lectura falla (422 `CHEQUE_ILEGIBLE`) la
 * foto ya subida sirve igual: viaja como `foto_path` del cheque y queda
 * adjunta a la OP. No crea nada.
 */
export function leerCheque(adj: PagosAdjuntoPendiente): Promise<PagosChequeLecturaRes> {
  return apiPost<PagosChequeLecturaRes>('/api/pagos/cheques/leer', {
    storage_path: adj.storage_path, nombre_archivo: adj.nombre_archivo, mime_type: adj.mime_type,
  })
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

/**
 * Cuentas propias de CADINC (tesorería) para «Sale de la cuenta» (20260926g).
 * Solo las activas. Se cargan en Contabilidad › Plan › Cuentas de tesorería.
 */
export function useCuentasOrigen(enabled = true) {
  return useQuery({
    queryKey: PAGOS_KEYS.cuentasOrigen,
    queryFn:  () => apiGet<PagosCuentaOrigen[]>('/api/pagos/cuentas-origen'),
    staleTime: 300_000,
    enabled,
  })
}
