import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api/client'
import type { HerrEntregasPage, HerrEntregasStats, HerrEntregaEstado } from '@/types/domain.types'

export const ENTREGAS_KEY = ['herr-entregas']

export interface EntregasFiltro {
  estado?:   HerrEntregaEstado
  obra_cod?: string
  q?:        string
  desde?:    string
  hasta?:    string
  limit?:    number
  offset?:   number
}

function qs(f: EntregasFiltro): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/**
 * Bandeja del pañol: lo que salió a obra y todavía nadie catalogó.
 *
 * Pagina en el SERVER. El techo duro de PostgREST son 1000 filas y no se
 * bypassea desde el cliente (§5.7); acá se arranca paginado en vez de
 * descubrirlo cuando la tabla crezca — hoy son 256 filas y entran ~17 por semana.
 */
export function useHerrEntregas(filtro: EntregasFiltro = {}) {
  return useQuery({
    queryKey: [...ENTREGAS_KEY, filtro],
    queryFn:  () => apiGet<HerrEntregasPage>(`/api/herramientas/entregas${qs(filtro)}`),
    staleTime: 60_000,
    // Cada filtro es una queryKey distinta. Sin esto, cambiar de página o de tab
    // manda `data` a undefined y la lista se va detrás del spinner en cada paso.
    placeholderData: keepPreviousData,
  })
}

export function useHerrEntregasStats() {
  return useQuery({
    queryKey: [...ENTREGAS_KEY, 'stats'],
    queryFn:  () => apiGet<HerrEntregasStats>('/api/herramientas/entregas/stats'),
    staleTime: 60_000,
  })
}

/**
 * Cambiar el estado de una entrega. En fase 1 solo se archiva ("no es
 * herramienta") o se desarchiva. `anulada` la escribe únicamente el trigger,
 * al bajar lo enviado: si un humano pudiera ponerla, el ledger se
 * desincronizaría de `cantidad_enviada`.
 */
export function useMarcarEntrega() {
  const qc = useQueryClient()
  return useMutation({
    // `nota` va solo si se pasa. Mandarla siempre (aunque fuera null) pisaba la
    // nota que escribe el trigger, que explica por qué la fila quedó en 'revisar'.
    mutationFn: ({ id, estado, nota }: { id: number; estado: 'pendiente' | 'confirmada' | 'ignorada' | 'revisar'; nota?: string | null }) =>
      apiPatch(`/api/herramientas/entregas/${id}`, nota === undefined ? { estado } : { estado, nota }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ENTREGAS_KEY }) },
  })
}
