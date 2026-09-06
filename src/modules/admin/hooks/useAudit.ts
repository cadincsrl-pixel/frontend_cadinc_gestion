import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type { AuditLogEntry } from '@/types/domain.types'

export interface AuditFiltros {
  user_id?: string
  modulo?: string
  accion?: string
  q?: string
  desde?: string
  hasta?: string
  /** Módulos a dejar afuera (ej. 'horas' para sacar la carga de tarja). */
  excluir?: string[]
  limit?: number
  offset?: number
}

export interface AuditPagina {
  items: AuditLogEntry[]
  /** Total con los mismos filtros (para "1–200 de 12.345"). */
  total: number
}

/** Tope de PostgREST por respuesta: el backend recorta a esto. */
export const AUDIT_LIMITE_MAX = 1000

function queryString(f: AuditFiltros): string {
  const p = new URLSearchParams()
  if (f.user_id) p.set('user_id', f.user_id)
  if (f.modulo) p.set('modulo', f.modulo)
  if (f.accion) p.set('accion', f.accion)
  if (f.q) p.set('q', f.q)
  if (f.desde) p.set('desde', f.desde)
  if (f.hasta) p.set('hasta', f.hasta)
  if (f.excluir?.length) p.set('excluir', f.excluir.join(','))
  if (f.limit) p.set('limit', String(f.limit))
  if (f.offset) p.set('offset', String(f.offset))
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export function useAuditLog(filters: AuditFiltros = {}) {
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiGet<AuditPagina>(`/api/admin/audit${queryString(filters)}`),
    // Al cambiar de página se sigue viendo la anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  })
}

/**
 * Trae TODO lo que matchea los filtros (para exportar), de a páginas de 1000
 * hasta `max` filas. Devuelve también el total real por si quedó recortado.
 */
export async function fetchAuditTodo(filters: AuditFiltros, max = 10_000): Promise<{ items: AuditLogEntry[]; total: number }> {
  const items: AuditLogEntry[] = []
  let total = 0
  for (let offset = 0; offset < max; offset += AUDIT_LIMITE_MAX) {
    const pagina = await apiGet<AuditPagina>(`/api/admin/audit${queryString({ ...filters, limit: AUDIT_LIMITE_MAX, offset })}`)
    items.push(...pagina.items)
    total = pagina.total
    if (pagina.items.length < AUDIT_LIMITE_MAX || items.length >= total) break
  }
  return { items, total }
}
