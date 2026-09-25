// Compras › Configuración (tanda 6; base 20260929f, `pagos_config`). Por
// ahora: la jurisdicción que propone un tributo nuevo de la factura. El ítem 8
// suma avisos de pago y plazos de cheque. Contra un backend sin el endpoint
// (404) o que no responde, `respaldo` = true y el default es «Tucumán» por
// nombre, como antes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, HttpError } from '@/lib/api/client'
import type { PagosConfig } from '@/types/config.types'

export const CONFIG_PAGOS_KEY = ['pagos', 'config'] as const

const VACIA: PagosConfig = { tributos: { jurisdiccion_default_id: null } }

export function useConfigPagos() {
  const q = useQuery({
    queryKey: CONFIG_PAGOS_KEY,
    queryFn: async (): Promise<{ config: PagosConfig; respaldo: boolean }> => {
      try {
        return { config: await apiGet<PagosConfig>('/api/pagos/config'), respaldo: false }
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return { config: VACIA, respaldo: true }
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  return { ...q, config: q.data?.config ?? VACIA, respaldo: q.data?.respaldo ?? q.isError }
}

/** PATCH /config (tab configuracion + flag configurar). */
export function useGuardarConfigPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { tributo_jurisdiccion_default_id?: number | null }) => apiPatch<PagosConfig>('/api/pagos/config', body),
    onSuccess: (data) => {
      qc.setQueryData(CONFIG_PAGOS_KEY, { config: data, respaldo: false })
      void qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}
