'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import type {
  Maquina,
  ObraAlquiler,
  ObraAlquilerDetalle,
  ObraMaquina,
  Parte,
  RemitoAlquiler,
} from '../types'

// ── Query keys (constantes, como el resto del proyecto) ──
export const MAQUINAS_KEY = ['alquiler', 'maquinas'] as const
export const OBRAS_KEY    = ['alquiler', 'obras'] as const
export const obraDetalleKey = (id: number) => ['alquiler', 'obras', id] as const
export const obraMaquinasKey = (obraId: number) => ['alquiler', 'obra-maquinas', obraId] as const

export interface PartesFiltro {
  obra_id?:    number
  maquina_id?: number
  desde?:      string
  hasta?:      string
}
export const partesKey = (f: PartesFiltro) => ['alquiler', 'partes', f] as const

// ── Perfiles (para selects de jefe de obra / maquinista) ──
export interface PerfilNombre {
  id:     string
  nombre: string
}
export function usePerfilesLista() {
  return useQuery({
    queryKey: ['perfiles-nombres'],
    queryFn:  () => apiGet<PerfilNombre[]>('/api/me/perfiles'),
    staleTime: 5 * 60 * 1000,
  })
}

// ─────────────────────────── Máquinas ───────────────────────────
export function useMaquinas() {
  return useQuery({
    queryKey: MAQUINAS_KEY,
    queryFn:  () => apiGet<Maquina[]>('/api/alquiler/maquinas'),
  })
}

export function useCreateMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Maquina>) => apiPost<Maquina>('/api/alquiler/maquinas', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: MAQUINAS_KEY }),
  })
}

export function useUpdateMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Maquina> }) =>
      apiPatch<Maquina>(`/api/alquiler/maquinas/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      // Las obras embeben máquinas en su detalle → invalidar también.
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

export function useDeleteMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/maquinas/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: MAQUINAS_KEY })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// ─────────────────────────── Obras ───────────────────────────
export function useObrasAlquiler() {
  return useQuery({
    queryKey: OBRAS_KEY,
    queryFn:  () => apiGet<ObraAlquiler[]>('/api/alquiler/obras'),
  })
}

export function useObraAlquiler(id: number | null) {
  return useQuery({
    queryKey: obraDetalleKey(id ?? 0),
    queryFn:  () => apiGet<ObraAlquilerDetalle>(`/api/alquiler/obras/${id}`),
    enabled:  id != null,
  })
}

export function useCreateObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<ObraAlquiler>) => apiPost<ObraAlquiler>('/api/alquiler/obras', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useUpdateObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<ObraAlquiler> }) =>
      apiPatch<ObraAlquiler>(`/api/alquiler/obras/${id}`, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.id) })
    },
  })
}

export function useDeleteObraAlquiler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/obras/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

// ───────────────── Asignación máquina ↔ obra ─────────────────
export function useObraMaquinas(obraId: number | null) {
  return useQuery({
    queryKey: obraMaquinasKey(obraId ?? 0),
    queryFn:  () => apiGet<ObraMaquina[]>(`/api/alquiler/obras/${obraId}/maquinas`),
    enabled:  obraId != null,
  })
}

export function useAsignarMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraId, dto }: { obraId: number; dto: { maquina_id: number; maquinista_user_id?: string | null } }) =>
      apiPost<ObraMaquina>(`/api/alquiler/obras/${obraId}/maquinas`, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

export function useUpdateMaquinista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, maquinista_user_id }: { id: number; obraId: number; maquinista_user_id: string | null }) =>
      apiPatch<ObraMaquina>(`/api/alquiler/obra-maquinas/${id}`, { maquinista_user_id }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
    },
  })
}

export function useDesasignarMaquina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; obraId: number }) =>
      apiDelete(`/api/alquiler/obra-maquinas/${id}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: obraMaquinasKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: obraDetalleKey(vars.obraId) })
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

// ─────────────────────────── Partes ───────────────────────────
function partesQueryString(f: PartesFiltro): string {
  const sp = new URLSearchParams()
  if (f.obra_id    != null) sp.set('obra_id', String(f.obra_id))
  if (f.maquina_id != null) sp.set('maquina_id', String(f.maquina_id))
  if (f.desde)              sp.set('desde', f.desde)
  if (f.hasta)              sp.set('hasta', f.hasta)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function usePartes(f: PartesFiltro, enabled = true) {
  return useQuery({
    queryKey: partesKey(f),
    queryFn:  () => apiGet<Parte[]>(`/api/alquiler/partes${partesQueryString(f)}`),
    enabled,
  })
}

export function useCreateParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: Partial<Parte>) => apiPost<Parte>('/api/alquiler/partes', dto),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

export function useUpdateParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<Parte> }) =>
      apiPatch<Parte>(`/api/alquiler/partes/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

export function useDeleteParte() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/partes/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'partes'] }),
  })
}

// ─────────────────────────── Remitos ───────────────────────────
export interface RemitosFiltro {
  obra_id?:    number
  maquina_id?: number
  desde?:      string
  hasta?:      string
}
export const remitosKey = (f: RemitosFiltro) => ['alquiler', 'remitos', f] as const

function remitosQueryString(f: RemitosFiltro): string {
  const sp = new URLSearchParams()
  if (f.obra_id    != null) sp.set('obra_id', String(f.obra_id))
  if (f.maquina_id != null) sp.set('maquina_id', String(f.maquina_id))
  if (f.desde)              sp.set('desde', f.desde)
  if (f.hasta)              sp.set('hasta', f.hasta)
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function useRemitos(f: RemitosFiltro, enabled = true) {
  return useQuery({
    queryKey: remitosKey(f),
    queryFn:  () => apiGet<RemitoAlquiler[]>(`/api/alquiler/remitos${remitosQueryString(f)}`),
    enabled,
  })
}

// Emite o REFRESCA el remito de un parte (idempotente: conserva RA-NNNN).
export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (parteId: number) =>
      apiPost<RemitoAlquiler>(`/api/alquiler/partes/${parteId}/remito`, {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'remitos'] }),
  })
}

export function useDeleteRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/alquiler/remitos/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['alquiler', 'remitos'] }),
  })
}
