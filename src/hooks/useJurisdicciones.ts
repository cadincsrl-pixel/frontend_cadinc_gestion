// Jurisdicciones (20260929f): catálogo compartido de Compras (tributos) y
// Ventas (retenciones), en /api/catalogos. Contra un backend que todavía no
// tiene el endpoint (404), `respaldo` = true y la lista queda vacía: el
// selector cae al campo de texto de siempre.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, HttpError } from '@/lib/api/client'
import type { Jurisdiccion, JurisdiccionInput, JurisdiccionSinNormalizar } from '@/types/config.types'

const BASE = '/api/catalogos/jurisdicciones'

export const JURISDICCIONES_KEYS = {
  todo:          ['catalogos', 'jurisdicciones'] as const,
  lista:         (incluirInactivas: boolean) => ['catalogos', 'jurisdicciones', 'lista', incluirInactivas] as const,
  sinNormalizar: ['catalogos', 'jurisdicciones', 'sin-normalizar'] as const,
}

export interface JurisdiccionesRes {
  jurisdicciones: Jurisdiccion[]
  /** true = el backend no tiene el catálogo (404): se usa texto libre, como antes. */
  respaldo:       boolean
}

/**
 * Las jurisdicciones (por defecto solo las activas). `staleTime` de 5 min:
 * cambian poco y se invalidan al guardar.
 */
export function useJurisdicciones(incluirInactivas = false) {
  const q = useQuery({
    queryKey: JURISDICCIONES_KEYS.lista(incluirInactivas),
    queryFn: async (): Promise<JurisdiccionesRes> => {
      try {
        const qs = incluirInactivas ? '?incluir_inactivas=1' : ''
        return { jurisdicciones: await apiGet<Jurisdiccion[]>(`${BASE}${qs}`), respaldo: false }
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return { jurisdicciones: [], respaldo: true }
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  // Si falla por otra cosa (403, red), el formulario igual tiene que dejar cargar: texto libre.
  return { ...q, jurisdicciones: q.data?.jurisdicciones ?? [], respaldo: q.data?.respaldo ?? q.isError }
}

/** Textos viejos (tributos y retenciones) que no resolvieron a ninguna jurisdicción. */
export function useJurisdiccionesSinNormalizar(enabled = true) {
  const q = useQuery({
    queryKey: JURISDICCIONES_KEYS.sinNormalizar,
    queryFn: async (): Promise<JurisdiccionSinNormalizar[]> => {
      try {
        return await apiGet<JurisdiccionSinNormalizar[]>(`${BASE}/sin-normalizar`)
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return []
        throw e
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  return { ...q, textos: q.data ?? [] }
}

function useInvalidarJurisdicciones() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: JURISDICCIONES_KEYS.todo })
    // Un alias nuevo puede resolver textos viejos: cambian los mapeos por
    // jurisdicción, los tipos de retención (su jurisdicción por defecto) y las fichas.
    void qc.invalidateQueries({ queryKey: ['contabilidad', 'mapeos'] })
    void qc.invalidateQueries({ queryKey: ['facturacion', 'config'] })
    void qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

/** POST: alta. 409 JURISDICCION_DUPLICADA si el nombre o un alias ya existe. */
export function useCrearJurisdiccion() {
  const invalidar = useInvalidarJurisdicciones()
  return useMutation({
    mutationFn: (body: JurisdiccionInput) => apiPost<Jurisdiccion>(BASE, body),
    onSuccess: invalidar,
  })
}

/** PATCH /:id: parcial, incluye `activo` para dar de baja o reactivar. */
export function useEditarJurisdiccion() {
  const invalidar = useInvalidarJurisdicciones()
  return useMutation({
    mutationFn: ({ id, ...body }: JurisdiccionInput & { id: number }) => apiPatch<Jurisdiccion>(`${BASE}/${id}`, body),
    onSuccess: invalidar,
  })
}
