import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { obrasApi } from '@/lib/api/obras.api'
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