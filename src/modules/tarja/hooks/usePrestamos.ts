import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'
import type { Prestamo } from '@/types/domain.types'

const KEY = ['prestamos']

export interface FiltroPrestamos {
  /** Solo estos legajos ([] → no consulta, devuelve []). */
  legs?: string[]
  semKey?: string
  desde?: string
  hasta?: string
}

/**
 * Lectura de préstamos por el backend (GET /api/prestamos), paginada y con un
 * solo orden (más nuevo primero). Hasta 2026-09-07 se leía la tabla con la
 * anon key desde cuatro lugares distintos, sin paginar.
 */
export async function fetchPrestamos(f: FiltroPrestamos = {}): Promise<Prestamo[]> {
  if (f.legs && f.legs.length === 0) return []
  const q = new URLSearchParams()
  if (f.legs)   q.set('legs', f.legs.join(','))
  if (f.semKey) q.set('sem_key', f.semKey)
  if (f.desde)  q.set('desde', f.desde)
  if (f.hasta)  q.set('hasta', f.hasta)
  const qs = q.toString()
  return apiGet<Prestamo[]>(`/api/prestamos${qs ? `?${qs}` : ''}`)
}

/** Todos los movimientos, solo leg + tipo + monto, para calcular saldos. */
export function usePrestamosLigero() {
  return useQuery({
    queryKey: [...KEY, 'ligero'],
    queryFn: async () =>
      (await fetchPrestamos()).map(p => ({ leg: p.leg, tipo: p.tipo, monto: p.monto })) as Pick<Prestamo, 'leg' | 'tipo' | 'monto'>[],
  })
}

/** Detalle completo de movimientos solo para las legs de la página actual */
export function usePrestamosForLegs(legs: string[]) {
  return useQuery({
    queryKey: [...KEY, 'legs', legs],
    queryFn: () => fetchPrestamos({ legs }),
    enabled: legs.length > 0,
  })
}

/** Todos los movimientos completos (recibos, histórico). */
export function usePrestamos() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => fetchPrestamos(),
  })
}

export function useCreatePrestamo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: {
      leg:      string
      sem_key:  string
      tipo:     'otorgado' | 'descontado' | 'incobrable'
      monto:    number
      concepto?: string | null
    }) => apiPost<Prestamo>('/api/prestamos', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeletePrestamo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/prestamos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
