import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { obrasApi } from '@/lib/api/obras.api'
import { useSessionStore } from '@/store/session.store'
import type { CreateObraDto, UpdateObraDto } from '@/types/domain.types'

export const OBRAS_KEY = ['obras'] as const

// `modulo` opcional: cuando se pasa, el endpoint respeta el override
// `permisos.<modulo>.obras_scope`. Las páginas de tarja deben pasar
// 'tarja' para que casos como Cristian Sosa (encargado de depósito
// que también carga horas en la obra depósito) vean solo lo que toca.
// Sin modulo se usa el scope global y se devuelve todo lo que el user
// puede ver en alguno de sus módulos (comportamiento legacy / default
// para llamadas transversales como sidebar y certificaciones).
export function useObras(modulo?: string) {
  const qc = useQueryClient()
  const profile = useSessionStore(s => s.profile)
  const query = useQuery({
    queryKey: modulo ? [...OBRAS_KEY, 'modulo', modulo] : OBRAS_KEY,
    queryFn:  () => obrasApi.getAll(modulo),
  })

  // Auto-archivar obras sin horas en 3 semanas. Corre como mucho una vez
  // cada 6 h por navegador para no spamear logs de auditoría.
  // Capataz (solo_carga_horas) y otros no-admin no deben dispararlo: el
  // backend devuelve 403 y al limpiar la KEY del localStorage se entra en
  // un loop de reintentos sin éxito.
  useEffect(() => {
    if (!profile) return
    const puedeAutoArchivar =
      profile.rol === 'admin' ||
      (profile.permisos as any)?.tarja?.administrar_obras === true
    if (!puedeAutoArchivar) return

    const KEY = 'obras:autoArchivar:lastRun'
    const SEIS_HORAS_MS = 6 * 60 * 60 * 1000
    const last = Number(localStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < SEIS_HORAS_MS) return
    localStorage.setItem(KEY, String(Date.now()))
    obrasApi.autoArchivar().then(({ archivadas }) => {
      if (archivadas.length > 0) {
        qc.invalidateQueries({ queryKey: OBRAS_KEY })
      }
    }).catch(() => { localStorage.removeItem(KEY) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  return query
}

export function useObrasArchivadas(modulo?: string) {
  return useQuery({
    queryKey: modulo ? [...OBRAS_KEY, 'archivadas', 'modulo', modulo] : [...OBRAS_KEY, 'archivadas'],
    queryFn: () => obrasApi.getArchivadas(modulo),
  })
}

export function useObra(cod: string, modulo?: string) {
  return useQuery({
    queryKey: modulo ? [...OBRAS_KEY, cod, 'modulo', modulo] : [...OBRAS_KEY, cod],
    queryFn: () => obrasApi.getByCod(cod, modulo),
    enabled: !!cod,
  })
}

export function useCreateObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateObraDto) => obrasApi.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
      // Invalidar el preview del próximo código: ya consumimos el actual.
      qc.invalidateQueries({ queryKey: ['obras-proximo-codigo'] })
    },
  })
}

export function useUpdateObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cod, dto }: { cod: string; dto: UpdateObraDto }) =>
      obrasApi.update(cod, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useArchivarObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cod: string) => obrasApi.archivar(cod),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useDesarchivarObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cod: string) => obrasApi.desarchivar(cod),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

export function useDeleteObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cod: string) => obrasApi.delete(cod),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
  })
}

// Lista de users disponibles como responsables de obra (capataz / jefe).
// El endpoint solo devuelve id+nombre, sin email u otros datos sensibles.
export interface ResponsablesDisponibles {
  capataces:  Array<{ id: string; nombre: string }>
  jefes_obra: Array<{ id: string; nombre: string }>
}
export function useResponsablesDisponibles() {
  return useQuery({
    queryKey: ['obras-responsables-disponibles'],
    queryFn: () => obrasApi.responsablesDisponibles(),
  })
}

// Preview del próximo código de obra. Re-fetch cada vez que se monta
// (ej. abrir el modal). NO consume la sequence; el insert real lo
// recalcula. Si entre preview y submit alguien creó una obra, el
// código final puede ser distinto (no es bug: se actualiza al guardar).
export function useProximoCodigoObra(enabled = true) {
  return useQuery({
    queryKey: ['obras-proximo-codigo'],
    queryFn: () => obrasApi.proximoCodigo(),
    enabled,
    staleTime: 0,
  })
}