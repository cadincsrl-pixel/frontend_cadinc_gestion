import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { obrasApi } from '@/lib/api/obras.api'
import type { CreateObraDto, UpdateObraDto, Obra } from '@/types/domain.types'

export const OBRAS_KEY = ['obras'] as const

// `modulo` opcional: cuando se pasa, el endpoint respeta el override
// `permisos.<modulo>.obras_scope`. Las páginas de tarja deben pasar
// 'tarja' para que casos como Cristian Sosa (encargado de depósito
// que también carga horas en la obra depósito) vean solo lo que toca.
// Sin modulo se usa el scope global y se devuelve todo lo que el user
// puede ver en alguno de sus módulos (comportamiento legacy / default
// para llamadas transversales como sidebar y certificaciones).
export function useObras(modulo?: string) {
  return useQuery({
    queryKey: modulo ? [...OBRAS_KEY, 'modulo', modulo] : OBRAS_KEY,
    queryFn:  () => obrasApi.getAll(modulo),
  })
}

export function useObrasArchivadas(modulo?: string) {
  return useQuery({
    queryKey: modulo ? [...OBRAS_KEY, 'archivadas', 'modulo', modulo] : [...OBRAS_KEY, 'archivadas'],
    queryFn: () => obrasApi.getArchivadas(modulo),
  })
}

/**
 * Obras activas + archivadas, para PANTALLAS QUE MUESTRAN HISTORIA.
 *
 * `useObras()` trae solo las activas, así que cualquier pantalla que nombre
 * una obra vieja cae al código crudo apenas se archiva. Caso que lo destapó:
 * CC-019 (Hipódromo) se archivó el 2026-09-05 con 45 herramientas sin
 * devolver, y en Herramientas › Retornos la fila decía "CC-019" en vez de
 * "Hipodromo". Lo mismo pasaba en Salidas, Movimientos y Trazabilidad.
 *
 * `nombreObra` cae al código si la obra no está en ninguna de las dos listas
 * (borrada, o el usuario no la ve por alcance), que es el comportamiento que
 * ya había. `esArchivada` sirve para marcar el caso raro de una obra cerrada
 * que todavía tiene cosas afuera.
 */
export function useObrasTodas(modulo?: string) {
  const { data: activas    = [], isLoading: cargandoActivas    } = useObras(modulo)
  const { data: archivadas = [], isLoading: cargandoArchivadas } = useObrasArchivadas(modulo)
  const isLoading = cargandoActivas || cargandoArchivadas

  return useMemo(() => {
    const nombres = new Map<string, string>()
    for (const o of activas)    nombres.set(o.cod, o.nom)
    // Las activas ganan: si un código estuviera en las dos listas, la fila
    // viva es la que vale.
    for (const o of archivadas) if (!nombres.has(o.cod)) nombres.set(o.cod, o.nom)
    const cerradas = new Set(archivadas.map(o => o.cod))

    return {
      /** Activas primero, después las archivadas. Para selectores que deben ofrecer historia. */
      obras: [...activas, ...archivadas.filter(o => !activas.some(a => a.cod === o.cod))] as Obra[],
      nombreObra:  (cod: string | null | undefined) => (cod ? (nombres.get(cod) ?? cod) : 'sin obra'),
      esArchivada: (cod: string | null | undefined) => !!cod && cerradas.has(cod),
      /** Para las pantallas que muestran un spinner mientras llegan las obras. */
      isLoading,
    }
  }, [activas, archivadas, isLoading])
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
    mutationFn: ({ cod, forzar }: { cod: string; forzar?: boolean }) => obrasApi.archivar(cod, forzar),
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
// `enabled`: los modales que lo usan están montados (cerrados) en la pantalla
// de obras; para un capataz el endpoint es 403, y disparaba 4 errores al
// entrar sin haber abierto nada.
export function useResponsablesDisponibles(enabled = true) {
  return useQuery({
    queryKey: ['obras-responsables-disponibles'],
    queryFn: () => obrasApi.responsablesDisponibles(),
    enabled,
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