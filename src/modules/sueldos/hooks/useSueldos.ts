// Módulo Sueldos (20261004): convenios, legajos, liquidaciones, recibos y
// exportaciones. Contrato: /api/sueldos (backend `modules/sueldos`).
//
// Keys bajo el prefijo ['sueldos']. Las mutaciones invalidan lo que mueven:
// guardar un recibo mueve la liquidación (totales) y su lista; tocar la
// configuración (escalas, conceptos, parámetros) cambia los cálculos, así que
// invalida también los `valores` y los cálculos cacheados.

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client'
import type {
  AsientoPropuesta, Candidatos, Categoria, CategoriaCreate, CategoriaUpdate, ConceptoCreate, ConceptoListado,
  ConceptoUpdate, ConceptoValor, ConceptoValorCreate, ConceptoValorUpdate, Concepto, Convenio, ConvenioCreate,
  ConvenioUpdate, EntradasRecibo, Escala, EscalaCreate, EscalaListada, EscalaUpdate, ExportBanco, ExportLsd, ExportLsdConceptos, Generar,
  Legajo, LegajoCreate, LegajoFicha, LegajosFiltro, LegajoUpdate, LiquidacionConLineas, LiquidacionCreate,
  LiquidacionDetalle, LiquidacionesFiltro, LiquidacionListada, Pagina, Parametro, ParametroCreate, ParametroListado,
  ParametroUpdate, Paritaria, ParitariaResultado, Recibo, ResultadoAnular, ResultadoCalculo, ResultadoCierre,
  ResultadoGenerar, ResultadoReabrir, ResumenContador, SugerenciaSac, SugerenciasRecibo, SugerenciaVacaciones,
  ValoresAFecha,
} from '@/types/sueldos.types'

const BASE = '/api/sueldos'
const STALE = 60_000

export const SUELDOS_KEY = ['sueldos'] as const

export const SUE_KEYS = {
  todo:          SUELDOS_KEY,
  convenios:     ['sueldos', 'convenios'] as const,
  categorias:    ['sueldos', 'categorias'] as const,
  escalas:       ['sueldos', 'escalas'] as const,
  conceptos:     ['sueldos', 'conceptos'] as const,
  parametros:    ['sueldos', 'parametros'] as const,
  valores:       ['sueldos', 'valores'] as const,
  legajos:       ['sueldos', 'legajos'] as const,
  legajo:        (id: number) => ['sueldos', 'legajos', 'ficha', id] as const,
  candidatos:    ['sueldos', 'legajos', 'candidatos'] as const,
  sugLegajo:     ['sueldos', 'legajos', 'sugerencias'] as const,
  liquidaciones: ['sueldos', 'liquidaciones'] as const,
  liquidacion:   (id: number) => ['sueldos', 'liquidaciones', 'detalle', id] as const,
  liqLineas:     (id: number) => ['sueldos', 'liquidaciones', 'lineas', id] as const,
  asiento:       (id: number) => ['sueldos', 'liquidaciones', 'asiento', id] as const,
  recibo:        (liq: number, leg: number) => ['sueldos', 'liquidaciones', 'recibo', liq, leg] as const,
  sugerencias:   (liq: number, leg: number) => ['sueldos', 'liquidaciones', 'sugerencias', liq, leg] as const,
  calculo:       ['sueldos', 'calculo'] as const,
  resumen:       (id: number) => ['sueldos', 'exportar', 'resumen', id] as const,
}

function qs(p: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined || v === '') continue
    u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

/** Configuración: cambia lo que calcula el motor → también valores y cálculos. */
function invalidarConfig(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: SUE_KEYS.convenios })
  qc.invalidateQueries({ queryKey: SUE_KEYS.categorias })
  qc.invalidateQueries({ queryKey: SUE_KEYS.escalas })
  qc.invalidateQueries({ queryKey: SUE_KEYS.conceptos })
  qc.invalidateQueries({ queryKey: SUE_KEYS.parametros })
  qc.invalidateQueries({ queryKey: SUE_KEYS.valores })
  qc.invalidateQueries({ queryKey: SUE_KEYS.calculo })
  return qc.invalidateQueries({ queryKey: SUE_KEYS.legajos })
}

/** Una liquidación: su detalle, su lista y lo que cuelga de ella. */
function invalidarLiquidaciones(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: SUE_KEYS.legajos })   // la ficha muestra los últimos recibos
  qc.invalidateQueries({ queryKey: ['sueldos', 'exportar'] })
  return qc.invalidateQueries({ queryKey: SUE_KEYS.liquidaciones })
}

// ── Configuración (lecturas) ──────────────────────────────────────────

export function useConvenios() {
  return useQuery({
    queryKey: SUE_KEYS.convenios,
    queryFn:  () => apiGet<Convenio[]>(`${BASE}/convenios`),
    staleTime: STALE,
  })
}

export function useCategorias(convenioId?: number | null) {
  return useQuery({
    queryKey: [...SUE_KEYS.categorias, convenioId ?? 'todas'],
    queryFn:  () => apiGet<Categoria[]>(`${BASE}/categorias${qs({ convenio_id: convenioId })}`),
    staleTime: STALE,
  })
}

export function useEscalas(f: { convenio_id?: number | null; categoria_id?: number | null; zona?: string }, enabled = true) {
  return useQuery({
    queryKey: [...SUE_KEYS.escalas, f.convenio_id ?? null, f.categoria_id ?? null, f.zona ?? ''],
    queryFn:  () => apiGet<EscalaListada[]>(`${BASE}/escalas${qs({ convenio_id: f.convenio_id, categoria_id: f.categoria_id, zona: f.zona })}`),
    staleTime: STALE,
    enabled,
  })
}

export function useConceptos(f: { convenio_id?: number | null; incluir_inactivos?: boolean; fecha?: string }, enabled = true) {
  return useQuery({
    queryKey: [...SUE_KEYS.conceptos, f.convenio_id ?? null, !!f.incluir_inactivos, f.fecha ?? ''],
    queryFn:  () => apiGet<ConceptoListado[]>(`${BASE}/conceptos${qs({
      convenio_id: f.convenio_id, incluir_inactivos: f.incluir_inactivos ? 1 : null, fecha: f.fecha,
    })}`),
    staleTime: STALE,
    enabled,
  })
}

export function useParametros(f: { clave?: string; fecha?: string } = {}) {
  return useQuery({
    queryKey: [...SUE_KEYS.parametros, f.clave ?? '', f.fecha ?? ''],
    queryFn:  () => apiGet<ParametroListado[]>(`${BASE}/parametros${qs({ clave: f.clave, fecha: f.fecha })}`),
    staleTime: STALE,
  })
}

export function useValores(f: { convenio_id: number | null | undefined; fecha?: string; zona?: string }) {
  return useQuery({
    queryKey: [...SUE_KEYS.valores, f.convenio_id ?? null, f.fecha ?? '', f.zona ?? ''],
    queryFn:  () => apiGet<ValoresAFecha>(`${BASE}/valores${qs({ convenio_id: f.convenio_id, fecha: f.fecha, zona: f.zona })}`),
    staleTime: STALE,
    enabled:  !!f.convenio_id,
  })
}

// ── Configuración (escrituras) ────────────────────────────────────────

export function useGuardarConvenio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number | null } & Partial<ConvenioCreate>) =>
      id ? apiPatch<Convenio>(`${BASE}/convenios/${id}`, b as ConvenioUpdate) : apiPost<Convenio>(`${BASE}/convenios`, b),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useGuardarCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number | null } & Partial<CategoriaCreate>) =>
      id ? apiPatch<Categoria>(`${BASE}/categorias/${id}`, b as CategoriaUpdate) : apiPost<Categoria>(`${BASE}/categorias`, b),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useGuardarEscala() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: ({ id: number } & EscalaUpdate) | ({ id: null } & EscalaCreate)) => {
      if (b.id !== null) {
        const { id, ...resto } = b
        return apiPatch<Escala>(`${BASE}/escalas/${id}`, resto)
      }
      const { id: _id, ...resto } = b
      void _id
      return apiPost<Escala>(`${BASE}/escalas`, resto)
    },
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useBorrarEscala() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true; id: number }>(`${BASE}/escalas/${id}`),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useParitaria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Paritaria) => apiPost<ParitariaResultado>(`${BASE}/escalas/paritaria`, b),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useGuardarConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number | null } & Partial<ConceptoCreate>) =>
      id ? apiPatch<Concepto>(`${BASE}/conceptos/${id}`, b as ConceptoUpdate) : apiPost<Concepto>(`${BASE}/conceptos`, b),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useGuardarConceptoValor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: ({ id: number } & ConceptoValorUpdate) | ({ id: null } & ConceptoValorCreate)) => {
      if (b.id !== null) {
        const { id, ...resto } = b
        return apiPatch<ConceptoValor>(`${BASE}/conceptos/valores/${id}`, resto)
      }
      const { id: _id, ...resto } = b
      void _id
      return apiPost<ConceptoValor>(`${BASE}/conceptos/${resto.concepto_id}/valores`, resto)
    },
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useBorrarConceptoValor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true; id: number }>(`${BASE}/conceptos/valores/${id}`),
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useGuardarParametro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: ({ id: number } & ParametroUpdate) | ({ id: null } & ParametroCreate)) => {
      if (b.id !== null) {
        const { id, ...resto } = b
        return apiPatch<Parametro>(`${BASE}/parametros/${id}`, resto)
      }
      const { id: _id, ...resto } = b
      void _id
      return apiPost<Parametro>(`${BASE}/parametros`, resto)
    },
    onSuccess: () => invalidarConfig(qc),
  })
}

export function useBorrarParametro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ ok: true; id: number }>(`${BASE}/parametros/${id}`),
    onSuccess: () => invalidarConfig(qc),
  })
}

// ── Legajos ───────────────────────────────────────────────────────────

export function useLegajos(f: LegajosFiltro, enabled = true) {
  const q = qs({ convenio_id: f.convenio_id, activo: f.activo ?? 'true', incompleto: f.incompleto, q: f.q?.trim() })
  return useQuery({
    queryKey: [...SUE_KEYS.legajos, 'lista', q],
    queryFn:  () => apiGet<Legajo[]>(`${BASE}/legajos${q}`),
    staleTime: STALE,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useLegajo(id: number | null) {
  return useQuery({
    queryKey: SUE_KEYS.legajo(id ?? 0),
    queryFn:  () => apiGet<LegajoFicha>(`${BASE}/legajos/${id}`),
    staleTime: STALE,
    enabled:  !!id,
  })
}

export function useCandidatos(enabled = true) {
  return useQuery({
    queryKey: SUE_KEYS.candidatos,
    queryFn:  () => apiGet<Candidatos>(`${BASE}/legajos/candidatos`),
    staleTime: STALE,
    enabled,
  })
}

export function useCrearLegajo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: LegajoCreate) => apiPost<Legajo>(`${BASE}/legajos`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUE_KEYS.legajos }),
  })
}

export function useActualizarLegajo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number } & LegajoUpdate) => apiPatch<Legajo>(`${BASE}/legajos/${id}`, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUE_KEYS.calculo })
      return qc.invalidateQueries({ queryKey: SUE_KEYS.legajos })
    },
  })
}

export function useSacLegajo(id: number | null, p: { anio?: number; semestre?: 1 | 2 }, enabled: boolean) {
  return useQuery({
    queryKey: [...SUE_KEYS.sugLegajo, 'sac', id, p.anio ?? null, p.semestre ?? null],
    queryFn:  () => apiGet<SugerenciaSac>(`${BASE}/legajos/${id}/sac${qs({ anio: p.anio, semestre: p.semestre })}`),
    staleTime: STALE,
    enabled:  enabled && !!id,
  })
}

export function useVacacionesLegajo(id: number | null, p: { anio?: number }, enabled: boolean) {
  return useQuery({
    queryKey: [...SUE_KEYS.sugLegajo, 'vacaciones', id, p.anio ?? null],
    queryFn:  () => apiGet<SugerenciaVacaciones>(`${BASE}/legajos/${id}/vacaciones${qs({ anio: p.anio })}`),
    staleTime: STALE,
    enabled:  enabled && !!id,
  })
}

// ── Liquidaciones ─────────────────────────────────────────────────────

export function useLiquidaciones(f: LiquidacionesFiltro, page = 1, pageSize = 25) {
  const q = qs({
    convenio_id: f.convenio_id, estado: f.estado, tipo: f.tipo, desde: f.desde, hasta: f.hasta,
    limit: pageSize, offset: (page - 1) * pageSize,
  })
  return useQuery({
    queryKey: [...SUE_KEYS.liquidaciones, 'lista', q],
    queryFn:  () => apiGet<Pagina<LiquidacionListada>>(`${BASE}/liquidaciones${q}`),
    staleTime: STALE,
    placeholderData: keepPreviousData,
  })
}

export function useLiquidacion(id: number | null) {
  return useQuery({
    queryKey: SUE_KEYS.liquidacion(id ?? 0),
    queryFn:  () => apiGet<LiquidacionDetalle>(`${BASE}/liquidaciones/${id}`),
    staleTime: STALE,
    enabled:  !!id,
  })
}

/** Con los recibos completos (para los PDF en lote). */
export function useLiquidacionConLineas(id: number | null, enabled = true) {
  return useQuery({
    queryKey: SUE_KEYS.liqLineas(id ?? 0),
    queryFn:  () => apiGet<LiquidacionConLineas>(`${BASE}/liquidaciones/${id}?lineas=1`),
    staleTime: STALE,
    enabled:  enabled && !!id,
  })
}

export function traerRecibo(liqId: number, legajoId: number): Promise<Recibo> {
  return apiGet<Recibo>(`${BASE}/liquidaciones/${liqId}/recibos/${legajoId}`)
}

export async function traerLiquidacionConLineas(id: number): Promise<LiquidacionConLineas> {
  return apiGet<LiquidacionConLineas>(`${BASE}/liquidaciones/${id}?lineas=1`)
}

export function useAsientoPropuesta(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: SUE_KEYS.asiento(id ?? 0),
    queryFn:  () => apiGet<AsientoPropuesta>(`${BASE}/liquidaciones/${id}/asiento`),
    staleTime: STALE,
    enabled:  enabled && !!id,
  })
}

export function useCrearLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: LiquidacionCreate) => apiPost<LiquidacionDetalle>(`${BASE}/liquidaciones`, b),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

export function useActualizarLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number; fecha_pago?: string | null; obs?: string }) =>
      apiPatch<LiquidacionDetalle>(`${BASE}/liquidaciones/${id}`, b),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

export function useCerrarLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<ResultadoCierre>(`${BASE}/liquidaciones/${id}/cerrar`, {}),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

export function useContabilizarLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiPost<ResultadoCierre>(`${BASE}/liquidaciones/${id}/contabilizar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contabilidad'] })
      return invalidarLiquidaciones(qc)
    },
  })
}

export function useReabrirLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<ResultadoReabrir>(`${BASE}/liquidaciones/${id}/reabrir`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contabilidad'] })
      return invalidarLiquidaciones(qc)
    },
  })
}

export function useAnularLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiPost<ResultadoAnular>(`${BASE}/liquidaciones/${id}/anular`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contabilidad'] })
      return invalidarLiquidaciones(qc)
    },
  })
}

export function useGenerarRecibos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...b }: { id: number } & Generar) => apiPost<ResultadoGenerar>(`${BASE}/liquidaciones/${id}/generar`, b),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

// ── Recibos ───────────────────────────────────────────────────────────

/** El recibo guardado. 404 RECIBO_NO_EXISTE = todavía no hay: el editor usa las sugerencias. */
export function useRecibo(liqId: number, legajoId: number | null, enabled = true) {
  return useQuery({
    queryKey: SUE_KEYS.recibo(liqId, legajoId ?? 0),
    queryFn:  () => apiGet<Recibo>(`${BASE}/liquidaciones/${liqId}/recibos/${legajoId}`),
    staleTime: 0,
    retry: false,
    enabled:  enabled && !!legajoId,
  })
}

export function useSugerenciasRecibo(liqId: number, legajoId: number | null, enabled = true) {
  return useQuery({
    queryKey: SUE_KEYS.sugerencias(liqId, legajoId ?? 0),
    queryFn:  () => apiGet<SugerenciasRecibo>(`${BASE}/liquidaciones/${liqId}/recibos/${legajoId}/sugerencias`),
    staleTime: STALE,
    enabled:  enabled && !!legajoId,
  })
}

/**
 * Vista previa del cálculo (no guarda ni se audita). La key incluye las
 * entradas serializadas: el editor le pasa las entradas ya "debounceadas".
 */
export function useCalcularRecibo(liqId: number, legajoId: number | null, entradas: EntradasRecibo | null) {
  const clave = entradas ? JSON.stringify(entradas) : ''
  return useQuery({
    queryKey: [...SUE_KEYS.calculo, liqId, legajoId ?? 0, clave],
    queryFn:  () => apiPost<ResultadoCalculo>(`${BASE}/liquidaciones/${liqId}/recibos/calcular`, { legajo_id: legajoId, entradas: entradas ?? {} }),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
    enabled:  !!legajoId && !!entradas,
  })
}

export function useGuardarRecibo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ liqId, legajoId, entradas, obs }: { liqId: number; legajoId: number; entradas: EntradasRecibo; obs?: string }) =>
      apiPut<{ recibo: Recibo; calculo: ResultadoCalculo }>(`${BASE}/liquidaciones/${liqId}/recibos/${legajoId}`, { entradas, ...(obs !== undefined ? { obs } : {}) }),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

export function useBorrarRecibo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ liqId, legajoId }: { liqId: number; legajoId: number }) =>
      apiDelete<LiquidacionDetalle>(`${BASE}/liquidaciones/${liqId}/recibos/${legajoId}`),
    onSuccess: () => invalidarLiquidaciones(qc),
  })
}

// ── Exportaciones ─────────────────────────────────────────────────────

export function useResumenContador(id: number | null, enabled = true) {
  return useQuery({
    queryKey: SUE_KEYS.resumen(id ?? 0),
    queryFn:  () => apiGet<ResumenContador>(`${BASE}/liquidaciones/${id}/exportar/resumen`),
    staleTime: STALE,
    enabled:  enabled && !!id,
  })
}

export function traerExportBanco(id: number, decimal: 'coma' | 'punto'): Promise<ExportBanco> {
  return apiGet<ExportBanco>(`${BASE}/liquidaciones/${id}/exportar/banco?decimal=${decimal}`)
}

export function traerExportLsd(id: number): Promise<ExportLsd> {
  return apiGet<ExportLsd>(`${BASE}/liquidaciones/${id}/exportar/lsd`)
}

export function traerResumen(id: number): Promise<ResumenContador> {
  return apiGet<ResumenContador>(`${BASE}/liquidaciones/${id}/exportar/resumen`)
}

/** Archivo de carga masiva de conceptos del LSD (códigos del empleador C+id → concepto ARCA). */
export function traerExportLsdConceptos(): Promise<ExportLsdConceptos> {
  return apiGet<ExportLsdConceptos>(`${BASE}/exportar/lsd-conceptos`)
}
