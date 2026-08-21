'use client'

/**
 * Hooks de "Costos de oficina" — personal administrativo con sueldo mensual
 * versionado y asignación porcentual a obras / logística / general.
 *
 * TODO va por el backend Hono (`/api/oficina/*`): los sueldos son dato
 * sensible y el gate real (permiso `tarja.costos_oficina`) vive ahí.
 * NUNCA leer estas tablas con Supabase directo desde el cliente.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiPut } from '@/lib/api/client'
import { toISO } from '@/lib/utils/dates'
import type {
  OficinaPersona,
  OficinaAsignacionSnapshot,
  OficinaResumenMes,
  OficinaDestino,
} from '@/types/domain.types'

// Prefijo común: invalidar ['oficina'] barre personas + resumen (todos los
// meses cacheados) + asignaciones de cualquier persona.
export const OFICINA_KEY          = ['oficina'] as const
export const OFICINA_PERSONAS_KEY = ['oficina', 'personas'] as const
export const oficinaResumenKey       = (mes: string)       => ['oficina', 'resumen', mes] as const
export const oficinaAsignacionesKey  = (personaId: number) => ['oficina', 'asignaciones', personaId] as const

// ── Queries ───────────────────────────────────────────────────────────

export function useOficinaPersonas(enabled = true) {
  return useQuery({
    queryKey: OFICINA_PERSONAS_KEY,
    queryFn:  () => apiGet<OficinaPersona[]>('/api/oficina/personas'),
    enabled,
  })
}

export function useOficinaResumen(mes: string, enabled = true) {
  return useQuery({
    queryKey: oficinaResumenKey(mes),
    queryFn:  () => apiGet<OficinaResumenMes>(`/api/oficina/resumen?mes=${encodeURIComponent(mes)}`),
    enabled:  enabled && !!mes,
  })
}

export function useOficinaAsignaciones(personaId: number | null) {
  return useQuery({
    queryKey: oficinaAsignacionesKey(personaId ?? -1),
    queryFn:  () => apiGet<OficinaAsignacionSnapshot[]>(`/api/oficina/personas/${personaId}/asignaciones`),
    enabled:  personaId != null,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────
// Todas invalidan el prefijo ['oficina'] completo: un alta/edición de sueldo
// o asignación cambia tanto la lista de personas como el resumen de
// cualquier mes ya cacheado.

export interface CreateOficinaPersonaDto {
  nombre:        string
  costo_mensual: number
  desde?:        string
}

export function useCreateOficinaPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateOficinaPersonaDto) =>
      apiPost<OficinaPersona>('/api/oficina/personas', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFICINA_KEY }),
  })
}

export interface UpdateOficinaPersonaDto {
  nombre?: string
  activo?: boolean
}

export function useUpdateOficinaPersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateOficinaPersonaDto }) =>
      apiPatch<OficinaPersona>(`/api/oficina/personas/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFICINA_KEY }),
  })
}

export interface CreateOficinaSueldoDto {
  costo_mensual: number
  desde:         string
}

export function useCreateOficinaSueldo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personaId, dto }: { personaId: number; dto: CreateOficinaSueldoDto }) =>
      apiPost<OficinaPersona>(`/api/oficina/personas/${personaId}/sueldos`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFICINA_KEY }),
  })
}

export interface AplicarAumentoDto {
  desde: string
  items: Array<{ persona_id: number; porcentaje: number }>
}

export interface AplicarAumentoResult {
  desde: string
  items: Array<{ persona_id: number; nombre: string; anterior: number; porcentaje: number; nuevo: number }>
}

// Aumento masivo: el backend calcula cada sueldo nuevo sobre la versión
// vigente ANTERIOR a `desde` (re-aplicar con el mismo desde corrige la
// versión, no compone % sobre %).
export function useAplicarAumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: AplicarAumentoDto) =>
      apiPost<AplicarAumentoResult>('/api/oficina/sueldos/aumento', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFICINA_KEY }),
  })
}

export interface GuardarAsignacionesDto {
  desde: string
  items: Array<{ destino: OficinaDestino; obra_cod?: string; porcentaje: number }>
}

export function useGuardarOficinaAsignaciones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ personaId, dto }: { personaId: number; dto: GuardarAsignacionesDto }) =>
      apiPut<OficinaAsignacionSnapshot>(`/api/oficina/personas/${personaId}/asignaciones`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OFICINA_KEY }),
  })
}

// ── Helpers puros ─────────────────────────────────────────────────────

// Sueldo vigente a una fecha: la versión más reciente con desde <= fechaRef.
// Si todas las versiones son futuras devuelve null — MISMO criterio estricto
// que el resumen del backend, así la card nunca muestra un sueldo que el mes
// visible todavía no computa.
export function sueldoVigente(
  sueldos: OficinaPersona['sueldos'],
  fechaRef?: string,
): OficinaPersona['sueldos'][number] | null {
  if (!sueldos.length) return null
  // toISO usa componentes locales (TZ-safe después de las 21:00 en AR).
  const ref = fechaRef ?? toISO(new Date())
  const hist = [...sueldos].sort((a, b) => a.desde.localeCompare(b.desde))
  let vigente: (typeof hist)[number] | null = null
  for (const s of hist) {
    if (s.desde <= ref) vigente = s
    else break
  }
  return vigente
}

// ── Errores del backend → mensaje legible ─────────────────────────────
// El PUT de asignaciones responde 400 con `{ error: <código> }`; el api
// client ya extrae el código a `err.message`. Traducimos acá para que el
// toast no muestre "SUMA_NO_100" crudo.
const ERRORES_ASIGNACIONES: Record<string, string> = {
  SUMA_NO_100:        'Los porcentajes deben sumar exactamente 100%.',
  OBRA_COD_REQUERIDO: 'Las filas con destino "Obra" necesitan una obra elegida.',
  OBRA_NO_EXISTE:     'Alguna de las obras elegidas no existe.',
  DESTINO_DUPLICADO:  'Hay destinos repetidos: no puede haber dos filas con la misma obra ni dos "Logística"/"General".',
  SIN_SUELDO_BASE:    'Alguna persona no tiene un sueldo anterior a la fecha elegida sobre el cual calcular el aumento.',
  PERSONA_DUPLICADA:  'Hay una persona repetida en el aumento.',
}

export function mensajeErrorOficina(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  if (m && ERRORES_ASIGNACIONES[m]) return ERRORES_ASIGNACIONES[m]
  return m || fallback
}
