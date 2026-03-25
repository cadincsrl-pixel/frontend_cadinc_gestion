import { apiDelete, apiGet } from './client'
import type { Hora, UpsertHoraDto, UpsertHorasLoteDto } from '@/types/domain.types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function getAuthHeader(): Promise<HeadersInit> {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export const horasApi = {
  getBySemana: (obraCod: string, desde: string, hasta: string) =>
    apiGet<Hora[]>(`/api/horas/${obraCod}?desde=${desde}&hasta=${hasta}`),

  getByObra: (obraCod: string) =>
    apiGet<Hora[]>(`/api/horas/${obraCod}`),

  upsert: async (dto: UpsertHoraDto) => {
    const headers = await getAuthHeader()
    const res = await fetch(`${API_URL}/api/horas`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(dto),
    })
    if (!res.ok) throw new Error(`PUT /api/horas → ${res.status}`)
    return res.json()
  },

  upsertLote: async (dto: UpsertHorasLoteDto) => {
    const headers = await getAuthHeader()
    const res = await fetch(`${API_URL}/api/horas/lote`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(dto),
    })
    if (!res.ok) throw new Error(`PUT /api/horas/lote → ${res.status}`)
    return res.json()
  },

  limpiarSemana: (obraCod: string, desde: string, hasta: string) =>
    apiDelete(`/api/horas/${obraCod}/semana?desde=${desde}&hasta=${hasta}`),
}