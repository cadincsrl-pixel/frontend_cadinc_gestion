// Módulo Contabilidad — fase 1 (20260926): plan de cuentas, asientos
// manuales, libro diario, mayor, sumas y saldos, períodos y tesorería.
//
// Todo se filtra, pagina y suma en el SERVER (RPCs que devuelven un jsonb):
// acá solo se arma la query string y se cachea por filtro.
// Contrato: /api/contabilidad (backend `modules/contabilidad`).
//
// Una sola puerta de invalidación (`invalidarContabilidad`): confirmar un
// asiento mueve el listado, el diario, el mayor, sumas y saldos y los conteos
// de los períodos; cerrar un período numera asientos. Se invalida el prefijo
// entero del módulo.

import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client'
import type {
  CtbAnularRes, CtbAsiento, CtbAsientoEstado, CtbAsientoFila, CtbAsientoInput, CtbAsientoTipo, CtbAuxiliar,
  CtbCerrarPeriodoRes, CtbCuenta, CtbCuentaInput, CtbEjercicio, CtbImportarPlanRes, CtbMayorRes,
  CtbObra, CtbPage, CtbPeriodo, CtbReabrirPeriodoRes, CtbSumasSaldosRes, TesoreriaCuenta, TesoreriaInput,
  CtbConfig, CtbContabilizarInput, CtbContabilizarRes, CtbFuente, CtbMapeoInput, CtbMapeosCatalogo, CtbPendienteEstado,
  CtbPendientesRes, CtbPropuesta, CtbDiarioModo, CtbDiarioCualquiera, CtbDiarioItem, CtbDiarioResumidoRes, CtbBalanceRes, CtbResultadosRes,
} from '@/types/contabilidad.types'

const BASE = '/api/contabilidad'

export const CTB_KEY = ['contabilidad'] as const

export const CTB_KEYS = {
  todo:        CTB_KEY,
  ejercicios:  ['contabilidad', 'ejercicios'] as const,
  periodos:    ['contabilidad', 'periodos'] as const,
  cuentas:     ['contabilidad', 'cuentas'] as const,
  asientos:    ['contabilidad', 'asientos'] as const,
  asiento:     (id: number) => ['contabilidad', 'asientos', 'detalle', id] as const,
  diario:      ['contabilidad', 'diario'] as const,
  mayor:       ['contabilidad', 'mayor'] as const,
  sumas:       ['contabilidad', 'sumas'] as const,
  tesoreria:   ['contabilidad', 'tesoreria'] as const,
  obras:       ['contabilidad', 'obras'] as const,
  auxiliares:  ['contabilidad', 'auxiliares'] as const,
  // Fase 3 (20260927): motor de asientos automáticos y mapeos.
  automaticos: ['contabilidad', 'automaticos'] as const,
  propuesta:   (tabla: CtbFuente, id: number) => ['contabilidad', 'propuesta', tabla, id] as const,
  mapeos:      ['contabilidad', 'mapeos'] as const,
  config:      ['contabilidad', 'config'] as const,
  // Tanda 4: balance y estado de resultados (dentro del prefijo: se invalidan con el resto).
  estados:     ['contabilidad', 'estados'] as const,
}

/** Una sola puerta: el prefijo entero. Las cuentas de origen de Pagos también (salen de tesorería). */
export function invalidarContabilidad(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['pagos', 'catalogos', 'cuentas-origen'] })
  return qc.invalidateQueries({ queryKey: CTB_KEYS.todo })
}

const STALE = 60_000

// ── Lecturas ──────────────────────────────────────────────────────────

export function useEjercicios() {
  return useQuery({
    queryKey: CTB_KEYS.ejercicios,
    queryFn:  () => apiGet<CtbEjercicio[]>(`${BASE}/ejercicios`),
    staleTime: STALE,
  })
}

/** Sin `ejercicioId` el backend elige el de hoy (o el último). */
export function usePeriodos(ejercicioId?: number | null) {
  const qs = ejercicioId ? `?ejercicio_id=${ejercicioId}` : ''
  return useQuery({
    queryKey: [...CTB_KEYS.periodos, ejercicioId ?? 'actual'],
    queryFn:  () => apiGet<CtbPeriodo[]>(`${BASE}/periodos${qs}`),
    staleTime: STALE,
  })
}

export function useCuentas(opts: { incluirInactivas?: boolean; soloImputables?: boolean } = {}) {
  const p = new URLSearchParams()
  if (opts.incluirInactivas) p.set('incluir_inactivas', '1')
  if (opts.soloImputables)   p.set('solo_imputables', '1')
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.cuentas, qs],
    queryFn:  () => apiGet<CtbCuenta[]>(`${BASE}/cuentas${qs ? `?${qs}` : ''}`),
    staleTime: STALE,
  })
}

export interface AsientosFiltro {
  desde?:     string
  hasta?:     string
  estado?:    'todos' | CtbAsientoEstado
  tipo?:      CtbAsientoTipo | ''
  q?:         string
  cuenta_id?: number | null
}

export function useAsientos(f: AsientosFiltro, page = 1, pageSize = 50) {
  const p = new URLSearchParams()
  if (f.desde)             p.set('desde', f.desde)
  if (f.hasta)             p.set('hasta', f.hasta)
  if (f.estado)            p.set('estado', f.estado)
  if (f.tipo)              p.set('tipo', f.tipo)
  if (f.q?.trim())         p.set('q', f.q.trim())
  if (f.cuenta_id)         p.set('cuenta_id', String(f.cuenta_id))
  p.set('limit', String(pageSize))
  p.set('offset', String((page - 1) * pageSize))
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.asientos, 'lista', qs],
    queryFn:  () => apiGet<CtbPage<CtbAsientoFila>>(`${BASE}/asientos?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useAsiento(id: number | null) {
  return useQuery({
    queryKey: CTB_KEYS.asiento(id ?? 0),
    queryFn:  () => apiGet<CtbAsiento>(`${BASE}/asientos/${id}`),
    enabled:  !!id,
    staleTime: STALE,
  })
}

/**
 * Libro diario. `modo` = detallado (un asiento por comprobante) o resumido por
 * día / mes (los automáticos se agrupan por circuito; los manuales siguen uno
 * por uno). Un backend viejo ignora `modo` y devuelve el detallado.
 */
export function useDiario(desde: string, hasta: string, modo: CtbDiarioModo = 'detallado', page = 1, pageSize = 50) {
  const p = new URLSearchParams({ desde, hasta, modo, limit: String(pageSize), offset: String((page - 1) * pageSize) })
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.diario, qs],
    queryFn:  () => apiGet<CtbDiarioCualquiera>(`${BASE}/diario?${qs}`),
    enabled:  !!desde && !!hasta,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

/** Ítems del diario normalizados: el detallado viene sin `clase`. */
export function itemsDiario(r: CtbDiarioCualquiera): CtbDiarioItem[] {
  if (esDiarioResumido(r)) return r.items
  return r.items.map((a, i) => ({ ...a, clase: 'asiento' as const, orden: (r.offset ?? 0) + i + 1 }))
}

export function esDiarioResumido(r: CtbDiarioCualquiera): r is CtbDiarioResumidoRes {
  return 'total_items' in r
}

export interface DiarioCompleto {
  items:          CtbDiarioItem[]
  total_asientos: number
  total_debe:     number
  total_haber:    number
}

/** Todo el diario del rango (para el Excel): pide de a 200 hasta el final. */
export async function fetchDiarioCompleto(desde: string, hasta: string, modo: CtbDiarioModo): Promise<DiarioCompleto> {
  const out: CtbDiarioItem[] = []
  let tot = { total_asientos: 0, total_debe: 0, total_haber: 0 }
  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const p = new URLSearchParams({ desde, hasta, modo, limit: '200', offset: String(out.length) })
    const r = await apiGet<CtbDiarioCualquiera>(`${BASE}/diario?${p.toString()}`)
    const its = itemsDiario(r)
    // El detallado numera `orden` desde el offset de la página: se corrige acá.
    const resumido = esDiarioResumido(r)
    out.push(...its.map((it, i) => (resumido ? it : { ...it, orden: out.length + i + 1 })))
    tot = { total_asientos: r.total_asientos, total_debe: r.total_debe, total_haber: r.total_haber }
    if (!r.hasMore || its.length === 0) return { items: out, ...tot }
  }
  throw new Error('El rango es demasiado grande para exportarlo de una vez: achicalo.')
}

// ── Estados contables (tanda 4) ──

export function useBalance(b: { fecha: string; nivel: number; incluirCero: boolean }) {
  const p = new URLSearchParams({ fecha: b.fecha, nivel: String(b.nivel) })
  if (b.incluirCero) p.set('incluir_cero', '1')
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.estados, 'balance', qs],
    queryFn:  () => apiGet<CtbBalanceRes>(`${BASE}/estados/balance?${qs}`),
    enabled:  !!b.fecha,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useEstadoResultados(r: { desde: string; hasta: string; nivel: number; comparativo: boolean; incluirCero: boolean }) {
  const p = new URLSearchParams({ desde: r.desde, hasta: r.hasta, nivel: String(r.nivel) })
  if (r.comparativo) p.set('comparativo', '1')
  if (r.incluirCero) p.set('incluir_cero', '1')
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.estados, 'resultados', qs],
    queryFn:  () => apiGet<CtbResultadosRes>(`${BASE}/estados/resultados?${qs}`),
    enabled:  !!r.desde && !!r.hasta,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export interface MayorParams {
  cuenta_id: number | null
  desde:     string
  hasta:     string
  obra_cod?: string | null
  aux_id?:   number | null
  page?:     number
  pageSize?: number
}

export function useMayor(m: MayorParams) {
  const pageSize = m.pageSize ?? 500
  const page = m.page ?? 1
  const p = new URLSearchParams()
  if (m.cuenta_id) p.set('cuenta_id', String(m.cuenta_id))
  p.set('desde', m.desde)
  p.set('hasta', m.hasta)
  if (m.obra_cod) p.set('obra_cod', m.obra_cod)
  if (m.aux_id)   p.set('aux_id', String(m.aux_id))
  p.set('limit', String(pageSize))
  p.set('offset', String((page - 1) * pageSize))
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.mayor, qs],
    queryFn:  () => apiGet<CtbMayorRes>(`${BASE}/mayor?${qs}`),
    enabled:  !!m.cuenta_id && !!m.desde && !!m.hasta,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export interface SumasParams {
  desde:                  string
  hasta:                  string
  nivel?:                 number | null
  incluirSinMovimiento?:  boolean
}

export function useSumasSaldos(s: SumasParams) {
  const p = new URLSearchParams({ desde: s.desde, hasta: s.hasta })
  if (s.nivel) p.set('nivel', String(s.nivel))
  if (s.incluirSinMovimiento) p.set('incluir_sin_movimiento', '1')
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.sumas, qs],
    queryFn:  () => apiGet<CtbSumasSaldosRes>(`${BASE}/sumas-saldos?${qs}`),
    enabled:  !!s.desde && !!s.hasta,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useTesoreria(incluirInactivas = false) {
  const qs = incluirInactivas ? '?incluir_inactivas=1' : ''
  return useQuery({
    queryKey: [...CTB_KEYS.tesoreria, incluirInactivas],
    queryFn:  () => apiGet<TesoreriaCuenta[]>(`${BASE}/tesoreria${qs}`),
    staleTime: STALE,
  })
}

export function useObrasCtb() {
  return useQuery({
    queryKey: CTB_KEYS.obras,
    queryFn:  () => apiGet<CtbObra[]>(`${BASE}/obras`),
    staleTime: 300_000,
  })
}

/**
 * Clientes, proveedores o cuentas de tesorería para el auxiliar de una línea.
 * Sin `ids` el backend trae hasta 30 que coinciden con `q`; con `ids` trae
 * esos (para mostrar el nombre de lo ya elegido).
 */
export function useAuxiliares(tipo: 'cliente' | 'proveedor' | 'tesoreria' | null, q: string, ids?: number[]) {
  const p = new URLSearchParams()
  if (tipo) p.set('tipo', tipo)
  if (q.trim()) p.set('q', q.trim())
  if (ids?.length) p.set('ids', ids.join(','))
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.auxiliares, qs],
    queryFn:  () => apiGet<CtbAuxiliar[]>(`${BASE}/auxiliares?${qs}`),
    enabled:  !!tipo,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

// ── Asientos ──────────────────────────────────────────────────────────

export function useGuardarAsiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: CtbAsientoInput & { id?: number | null }) =>
      id
        ? apiPatch<CtbAsiento>(`${BASE}/asientos/${id}`, body)
        : apiPost<CtbAsiento>(`${BASE}/asientos`, body),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useBorrarAsiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true; id: number }>(`${BASE}/asientos/${id}`),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useAnularAsiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo, fecha }: { id: number; motivo: string; fecha?: string }) =>
      apiPost<CtbAnularRes>(`${BASE}/asientos/${id}/anular`, { motivo, ...(fecha ? { fecha } : {}) }),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

// ── Períodos ──────────────────────────────────────────────────────────

/**
 * Cerrar un período. Desde la fase 3, si quedan orígenes sin contabilizar (o
 * desactualizados) en el mes, el backend responde 409
 * `HAY_PENDIENTES_AUTOMATICOS {cantidad, por_estado}` y `forzar` cierra igual.
 */
export function useCerrarPeriodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, forzar }: { id: number; forzar?: boolean }) =>
      apiPost<CtbCerrarPeriodoRes>(`${BASE}/periodos/${id}/cerrar`, forzar ? { forzar: true } : {}),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

/** Abre el ejercicio que sigue al último, con sus 12 períodos (20260928e). */
export function useAbrirEjercicioSiguiente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ ejercicio: CtbEjercicio; periodos: number }>(`${BASE}/ejercicios/siguiente`, {}),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useReabrirPeriodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<CtbReabrirPeriodoRes>(`${BASE}/periodos/${id}/reabrir`, { motivo }),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

// ── Plan de cuentas ───────────────────────────────────────────────────

export function useGuardarCuenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CtbCuentaInput> & { id?: number | null }) =>
      id
        ? apiPatch<CtbCuenta>(`${BASE}/cuentas/${id}`, body)
        : apiPost<CtbCuenta>(`${BASE}/cuentas`, body),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useBajaCuenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<CtbCuenta>(`${BASE}/cuentas/${id}/baja`, { motivo }),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useAltaCuenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<CtbCuenta>(`${BASE}/cuentas/${id}/alta`, {}),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useBorrarCuenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true; id: number }>(`${BASE}/cuentas/${id}`),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export type CeldaPlan = string | number | boolean | null

export function useImportarPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { filas?: Record<string, CeldaPlan>[]; csv?: string; confirmar: boolean }) =>
      apiPost<CtbImportarPlanRes>(`${BASE}/cuentas/importar`, body),
    onSuccess: (r) => { if (r.confirmado) void invalidarContabilidad(qc) },
  })
}

// ── Tesorería ─────────────────────────────────────────────────────────

export function useGuardarTesoreria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<TesoreriaInput> & { id?: number | null }) =>
      id
        ? apiPatch<TesoreriaCuenta>(`${BASE}/tesoreria/${id}`, body)
        : apiPost<TesoreriaCuenta>(`${BASE}/tesoreria`, body),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useBajaTesoreria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<TesoreriaCuenta>(`${BASE}/tesoreria/${id}/baja`, {}),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useAltaTesoreria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<TesoreriaCuenta>(`${BASE}/tesoreria/${id}/alta`, {}),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

// ── Asientos automáticos (fase 3, 20260927d–f) ────────────────────────
// Los pendientes se calculan en el server (`cont_pendientes`): un solo jsonb
// con la página y el resumen por estado, fuente y motivo.

export interface PendientesFiltro {
  desde?:  string
  hasta?:  string
  /** Circuitos tildados (tanda 4). undefined = todas las fuentes. */
  fuentes?: CtbFuente[]
  estado?: CtbPendienteEstado | ''
  motivo?: string
}

export function usePendientes(f: PendientesFiltro, page = 1, pageSize = 50, enabled = true) {
  const p = new URLSearchParams()
  if (f.desde)  p.set('desde', f.desde)
  if (f.hasta)  p.set('hasta', f.hasta)
  if (f.fuentes && f.fuentes.length > 0) p.set('fuentes', f.fuentes.join(','))
  if (f.estado) p.set('estado', f.estado)
  if (f.motivo) p.set('motivo', f.motivo)
  p.set('limit', String(pageSize))
  p.set('offset', String((page - 1) * pageSize))
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.automaticos, 'pendientes', qs],
    queryFn:  () => apiGet<CtbPendientesRes>(`${BASE}/automaticos/pendientes?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  })
}

/** El asiento que generaría el origen, contra el que tiene hoy. No escribe nada. */
export function usePropuesta(tabla: CtbFuente | null, id: number | null) {
  return useQuery({
    queryKey: CTB_KEYS.propuesta(tabla ?? 'pagos_facturas', id ?? 0),
    queryFn:  () => apiGet<CtbPropuesta>(`${BASE}/automaticos/propuesta?origen_tabla=${tabla}&origen_id=${id}`),
    enabled:  !!tabla && !!id,
    staleTime: STALE,
  })
}

export interface ProgresoContabilizar {
  vueltas: number
  acumulado: CtbContabilizarRes
}

const RES_VACIO: CtbContabilizarRes = {
  procesados: 0, creados: 0, regenerados: 0, anulados: 0, revertidos: 0, sin_cambios: 0,
  pendientes: 0, desactualizados: 0, errores: 0, hay_mas: false, cursor: null, detalle_errores: [],
}

function sumarRes(a: CtbContabilizarRes, b: CtbContabilizarRes): CtbContabilizarRes {
  return {
    procesados:      a.procesados + b.procesados,
    creados:         a.creados + b.creados,
    regenerados:     a.regenerados + b.regenerados,
    anulados:        a.anulados + b.anulados,
    revertidos:      a.revertidos + b.revertidos,
    sin_cambios:     a.sin_cambios + b.sin_cambios,
    pendientes:      a.pendientes + b.pendientes,
    desactualizados: a.desactualizados + b.desactualizados,
    errores:         a.errores + b.errores,
    hay_mas:         b.hay_mas,
    cursor:          b.cursor,
    detalle_errores: [...a.detalle_errores, ...b.detalle_errores].slice(0, 50),
  }
}

/**
 * «Contabilizar hasta…». El backend procesa hasta ~25 s por llamada y
 * devuelve `hay_mas`: acá se vuelve a llamar hasta terminar (el cursor lo
 * lleva el server; la llamada es idempotente) y se va sumando. `progreso`
 * sirve para mostrar cuánto va. Tope de vueltas por las dudas.
 */
export function useContabilizar() {
  const qc = useQueryClient()
  const [progreso, setProgreso] = useState<ProgresoContabilizar | null>(null)
  const mut = useMutation({
    mutationFn: async (body: CtbContabilizarInput) => {
      let acum = RES_VACIO
      let cursor: unknown = null
      setProgreso({ vueltas: 0, acumulado: acum })
      for (let vuelta = 1; vuelta <= 60; vuelta++) {
        // El cursor de la vuelta anterior: sigue donde quedó en vez de
        // reprocesar desde el principio (contrato: el backend lo devuelve).
        const r = await apiPost<CtbContabilizarRes>(`${BASE}/automaticos/contabilizar`,
          cursor ? { ...body, cursor } : body)
        acum = sumarRes(acum, r)
        setProgreso({ vueltas: vuelta, acumulado: acum })
        // Sin avance no se insiste: evita un bucle si el server no progresa.
        if (!r.hay_mas || r.procesados === 0) break
        cursor = r.cursor
      }
      return acum
    },
    onSettled: () => invalidarContabilidad(qc),
  })
  return { ...mut, progreso, limpiar: () => setProgreso(null) }
}

// ── Mapeos y configuración ────────────────────────────────────────────

export function useMapeos(enabled = true) {
  return useQuery({
    queryKey: CTB_KEYS.mapeos,
    queryFn:  () => apiGet<CtbMapeosCatalogo>(`${BASE}/mapeos`),
    staleTime: STALE,
    enabled,
  })
}

/** Solo lo que cambió. `cuenta_id: null` borra el mapeo. */
export function useGuardarMapeos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mapeos: CtbMapeoInput[]) => apiPut<CtbMapeosCatalogo>(`${BASE}/mapeos`, { mapeos }),
    onSuccess: () => invalidarContabilidad(qc),
  })
}

export function useConfigCtb(enabled = true) {
  return useQuery({
    queryKey: CTB_KEYS.config,
    queryFn:  () => apiGet<CtbConfig>(`${BASE}/config`),
    staleTime: STALE,
    enabled,
  })
}

export function useGuardarConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cambios: Partial<Pick<CtbConfig, 'automaticos_desde' | 'cvlp_modo' | 'compras_fecha_contable'>>) =>
      apiPatch<CtbConfig>(`${BASE}/config`, cambios),
    onSuccess: () => invalidarContabilidad(qc),
  })
}
