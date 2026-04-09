import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Prestamo } from '@/types/domain.types'

const KEY = ['prestamos']

function sb() { return createClient() }

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
    mutationFn: async (dto: {
      leg:      string
      sem_key:  string
      tipo:     'otorgado' | 'descontado'
      monto:    number
      concepto?: string | null
    }) => {
      const { data, error } = await sb()
        .from('prestamos')
        .insert(dto)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Prestamo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeletePrestamo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await sb()
        .from('prestamos')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
