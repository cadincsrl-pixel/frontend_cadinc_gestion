import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { obrasApi } from '@/lib/api/obras.api'
import { useSessionStore } from '@/store/session.store'
import type { CreateObraDto, UpdateObraDto } from '@/types/domain.types'

export const OBRAS_KEY = ['obras'] as const

export function useObras() {
  const qc = useQueryClient()
  const profile = useSessionStore(s => s.profile)
  const query = useQuery({
    queryKey: OBRAS_KEY,
    queryFn: obrasApi.getAll,
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
      ((profile.permisos as any)?.tarja?.actualizacion === true &&
       (profile.permisos as any)?.tarja?.solo_carga_horas !== true)
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

export function useObrasArchivadas() {
  return useQuery({
    queryKey: [...OBRAS_KEY, 'archivadas'],
    queryFn: obrasApi.getArchivadas,
  })
}

export function useObra(cod: string) {
  return useQuery({
    queryKey: [...OBRAS_KEY, cod],
    queryFn: () => obrasApi.getByCod(cod),
    enabled: !!cod,
  })
}

export function useCreateObra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateObraDto) => obrasApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OBRAS_KEY }),
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