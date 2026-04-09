import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Remito } from '@/types/domain.types'

const KEY = ['remitos']

function supabase() {
  return createClient()
}

export function useRemitos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('remitos')
        .select('*, items:remito_items(*)')
        .order('id', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Remito[]
    },
  })
}

export function useCreateRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: {
      numero:   string
      fecha:    string
      origen:   string
      destino:  string
      obs?:     string | null
      items:    { descripcion: string; cantidad: number; unidad: string; obs?: string | null }[]
    }) => {
      const sb = supabase()

      // 1. Insertar remito
      const { data: remito, error: errR } = await sb
        .from('remitos')
        .insert({ numero: dto.numero, fecha: dto.fecha, origen: dto.origen, destino: dto.destino, obs: dto.obs ?? null })
        .select()
        .single()
      if (errR) throw new Error(errR.message)

      // 2. Insertar items
      const items = dto.items.map(it => ({ ...it, remito_id: remito.id }))
      const { error: errI } = await sb.from('remito_items').insert(items)
      if (errI) throw new Error(errI.message)

      return remito as Remito
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useEmitirRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase()
        .from('remitos')
        .update({ estado: 'emitido' })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteRemito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase()
        .from('remitos')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
