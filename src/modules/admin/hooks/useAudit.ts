import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type { AuditLogEntry } from '@/types/domain.types'

export function useAuditLog(filters?: { user_id?: string; modulo?: string; desde?: string; hasta?: string }) {
  const params = new URLSearchParams()
  if (filters?.user_id) params.set('user_id', filters.user_id)
  if (filters?.modulo) params.set('modulo', filters.modulo)
  if (filters?.desde) params.set('desde', filters.desde)
  if (filters?.hasta) params.set('hasta', filters.hasta)
  const qs = params.toString()

  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiGet<AuditLogEntry[]>(`/api/admin/audit${qs ? `?${qs}` : ''}`),
  })
}
