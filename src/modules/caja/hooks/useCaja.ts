'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Movimiento {
  id: number
  fecha: string
  centro_costo: string | null
  proveedor: string | null
  concepto: string
  detalle: string | null
  tipo: 'ingreso' | 'egreso'
  monto: number
  saldo_acum: number | null
  es_ajuste: boolean
  created_at: string
}

export interface CajaConcepto {
  id: number
  nombre: string
  tipo: 'ingreso' | 'egreso' | 'ambos'
  activo: boolean
}

export interface CajaCentroCosto {
  id: number
  nombre: string
  activo: boolean
}

export interface CreateMovimientoDto {
  fecha: string
  centro_costo?: string
  proveedor?: string
  concepto: string
  detalle?: string
  tipo: 'ingreso' | 'egreso'
  monto: number
  es_ajuste?: boolean
}

export interface UpdateMovimientoDto {
  fecha?: string
  centro_costo?: string
  proveedor?: string
  concepto?: string
  detalle?: string
  tipo?: 'ingreso' | 'egreso'
  monto?: number
}

// ── Keys ──────────────────────────────────────────────────────────────────

export const CAJA_KEYS = {
  movimientos: ['caja', 'movimientos'] as const,
  conceptos:   ['caja', 'conceptos']   as const,
  centros:     ['caja', 'centros']     as const,
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useMovimientos() {
  return useQuery({
    queryKey: CAJA_KEYS.movimientos,
    queryFn: () => apiGet<Movimiento[]>('/api/caja/movimientos'),
  })
}

export function useConceptos() {
  return useQuery({
    queryKey: CAJA_KEYS.conceptos,
    queryFn: () => apiGet<CajaConcepto[]>('/api/caja/conceptos'),
  })
}

export function useCentrosCosto() {
  return useQuery({
    queryKey: CAJA_KEYS.centros,
    queryFn: () => apiGet<CajaCentroCosto[]>('/api/caja/centros-costo'),
  })
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateMovimientoDto) =>
      apiPost<Movimiento>('/api/caja/movimientos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.movimientos }),
  })
}

export function useUpdateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateMovimientoDto }) =>
      apiPatch<Movimiento>(`/api/caja/movimientos/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.movimientos }),
  })
}

export function useDeleteMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/caja/movimientos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.movimientos }),
  })
}

export function useCreateConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string; tipo: string }) =>
      apiPost<CajaConcepto>('/api/caja/conceptos', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.conceptos }),
  })
}

export function useToggleConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<CajaConcepto>(`/api/caja/conceptos/${id}`, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.conceptos }),
  })
}

export function useCreateCentro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { nombre: string }) =>
      apiPost<CajaCentroCosto>('/api/caja/centros-costo', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.centros }),
  })
}

export function useToggleCentro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPatch<CajaCentroCosto>(`/api/caja/centros-costo/${id}`, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAJA_KEYS.centros }),
  })
}
