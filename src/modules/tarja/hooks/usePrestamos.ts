import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { apiPost, apiDelete } from '@/lib/api/client'
import type { Prestamo } from '@/types/domain.types'

const KEY = ['prestamos']

// Solo lectura va por Supabase directo (data no-PII, RLS permisiva).
// Las mutaciones (create/delete) pasan por el backend Hono para que apliquen
// requirePermiso('tarja',...) y queden en audit_log.
function sb() { return createClient() }

/** Todos los movimientos (peso ligero: solo leg + tipo + monto) para calcular saldos */
export function usePrestamosLigero() {
  return useQuery({
    queryKey: [...KEY, 'ligero'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('prestamos')
        .select('leg, tipo, monto')
      if (error) throw new Error(error.message)
      return (data ?? []) as Pick<Prestamo, 'leg' | 'tipo' | 'monto'>[]
    },
  })
}

/** Detalle completo de movimientos solo para las legs de la página actual */
export function usePrestamosForLegs(legs: string[]) {
  return useQuery({
    queryKey: [...KEY, 'legs', legs],
    queryFn: async () => {
      if (!legs.length) return [] as Prestamo[]
      const { data, error } = await sb()
        .from('prestamos')
        .select('*')
        .in('leg', legs)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Prestamo[]
    },
    enabled: legs.length > 0,
  })
}

/** Mantener para compatibilidad (ModalForm usa usePersonal, no este hook) */
export function usePrestamos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await sb()
        .from('prestamos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Prestamo[]
    },
  })
}

export function useCreatePrestamo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: {
      leg:      string
      sem_key:  string
      tipo:     'otorgado' | 'descontado'
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
