import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { RopaCategoria, RopaEntrega } from '@/types/domain.types'

function sb() { return createClient() }

const KEY_CAT     = ['ropa_categorias']
const KEY_ENTREGAS = ['ropa_entregas']

// ── Categorías ──

export function useRopaCategorias() {
  return useQuery({
    queryKey: KEY_CAT,
    queryFn: async () => {
      const { data, error } = await sb()
        .from('ropa_categorias')
        .select('*')
        .eq('activo', true)
        .order('id')
      if (error) throw new Error(error.message)
      return (data ?? []) as RopaCategoria[]
    },
  })
}

export function useCreateRopaCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: { nombre: string; icono?: string }) => {
      const { data, error } = await sb()
        .from('ropa_categorias')
        .insert(dto)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as RopaCategoria
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CAT }),
  })
}

export function useDeleteRopaCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await sb()
        .from('ropa_categorias')
        .update({ activo: false })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CAT }),
  })
}

// ── Entregas ──

export function useRopaEntregas() {
  return useQuery({
    queryKey: KEY_ENTREGAS,
    queryFn: async () => {
      const { data, error } = await sb()
        .from('ropa_entregas')
        .select('*')
        .order('fecha_entrega', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as RopaEntrega[]
    },
  })
}

export function useCreateRopaEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: {
      leg:           string
      categoria_id:  number
      fecha_entrega: string
      obs?:          string | null
    }) => {
      const { data, error } = await sb()
        .from('ropa_entregas')
        .insert(dto)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as RopaEntrega
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_ENTREGAS }),
  })
}

export function useDeleteRopaEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await sb().from('ropa_entregas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_ENTREGAS }),
  })
}
