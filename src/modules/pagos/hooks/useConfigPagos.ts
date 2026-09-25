// Compras › Configuración (tanda 6; base 20260929f + 20260929i, `pagos_config`):
// la jurisdicción que propone un tributo nuevo, los avisos de pago por mail y
// los plazos de cheque. Contra un backend sin el endpoint (404) o que no
// responde, `respaldo` = true y todo cae a lo de antes: «Tucumán» por nombre y
// los plazos de `PLAZOS_CHEQUE`. Un backend con el endpoint pero sin el ítem 8
// no manda `aviso` ni `cheques`: `plazosCheque` cae igual a la constante.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, HttpError } from '@/lib/api/client'
import type { PagosConfig, PagosConfigPatch } from '@/types/config.types'
import { PLAZOS_CHEQUE } from '../utils/pagos.utils'
import { PAGOS_KEYS } from './usePagos'

export const CONFIG_PAGOS_KEY = ['pagos', 'config'] as const

const VACIA: PagosConfig = { tributos: { jurisdiccion_default_id: null } }
/** Referencia estable: el fallback no cambia de identidad entre renders. */
const PLAZOS_DEFAULT: number[] = [...PLAZOS_CHEQUE]

/** Los plazos que ofrece el alta de cheques: los configurados o los de siempre. */
export function plazosDeConfig(config: PagosConfig | undefined): number[] {
  const p = config?.cheques?.plazos
  return Array.isArray(p) && p.length > 0 ? p : PLAZOS_DEFAULT
}

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
  const config = q.data?.config ?? VACIA
  return { ...q, config, plazosCheque: plazosDeConfig(config), respaldo: q.data?.respaldo ?? q.isError }
}

/** PATCH /config (tab configuracion + flag configurar). */
export function useGuardarConfigPagos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PagosConfigPatch) => apiPatch<PagosConfig>('/api/pagos/config', body),
    onSuccess: (data, body) => {
      qc.setQueryData(CONFIG_PAGOS_KEY, { config: data, respaldo: false })
      // La tolerancia de saldo la aplican las vistas: cambia la deuda por
      // proveedor, las vencidas de la bandeja y la campana.
      if (body.tolerancia_saldo !== undefined) {
        for (const k of [PAGOS_KEYS.saldos, PAGOS_KEYS.facturas, PAGOS_KEYS.notifVenc]) void qc.invalidateQueries({ queryKey: k })
      }
      void qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

/** POST /config/probar-mail: un mail de prueba con el remitente y el pie configurados. */
export function useProbarMailPagos() {
  return useMutation({
    mutationFn: (para: string) =>
      apiPost<{ ok: true; para: string; remitente: string; message_id: string }>('/api/pagos/config/probar-mail', { para }),
  })
}
