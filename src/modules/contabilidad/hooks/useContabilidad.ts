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

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type {
  CtbAnularRes, CtbAsiento, CtbAsientoEstado, CtbAsientoFila, CtbAsientoInput, CtbAsientoTipo, CtbAuxiliar,
  CtbCerrarPeriodoRes, CtbCuenta, CtbCuentaInput, CtbDiarioRes, CtbEjercicio, CtbImportarPlanRes, CtbMayorRes,
  CtbObra, CtbPage, CtbPeriodo, CtbReabrirPeriodoRes, CtbSumasSaldosRes, TesoreriaCuenta, TesoreriaInput,
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

export function useDiario(desde: string, hasta: string, page = 1, pageSize = 50) {
  const p = new URLSearchParams({ desde, hasta, limit: String(pageSize), offset: String((page - 1) * pageSize) })
  const qs = p.toString()
  return useQuery({
    queryKey: [...CTB_KEYS.diario, qs],
    queryFn:  () => apiGet<CtbDiarioRes>(`${BASE}/diario?${qs}`),
    enabled:  !!desde && !!hasta,
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

export function useCerrarPeriodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<CtbCerrarPeriodoRes>(`${BASE}/periodos/${id}/cerrar`, {}),
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
