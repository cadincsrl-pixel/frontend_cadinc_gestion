// Porcentajes de las obras por administración (2026-09-08): el cliente paga
// costo + % por pata. Versionados por fecha en obras_admin_tarifas; acá solo
// se leen y se agregan versiones — el cálculo de la cuenta vive en
// AdministracionSection, que multiplica cada semana/fecha por el % vigente.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'
import type { AdminTarifa } from '@/types/domain.types'
import { OBRAS_KEY } from '@/modules/tarja/hooks/useObras'

export const ADMIN_TARIFAS_KEY = ['admin-tarifas'] as const

export function useAdminTarifas(obraCod: string) {
  return useQuery({
    queryKey: [...ADMIN_TARIFAS_KEY, obraCod],
    queryFn:  () => apiGet<AdminTarifa[]>(`/api/obras/${encodeURIComponent(obraCod)}/admin-tarifas`),
    enabled:  !!obraCod,
    staleTime: 60_000,
  })
}

export interface GuardarAdminTarifa {
  obraCod: string
  desde: string
  pct_operarios: number
  pct_contratistas: number
  pct_materiales: number
}

export function useGuardarAdminTarifa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ obraCod, ...dto }: GuardarAdminTarifa) =>
      apiPost<AdminTarifa>(`/api/obras/${encodeURIComponent(obraCod)}/admin-tarifas`, dto),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...ADMIN_TARIFAS_KEY, vars.obraCod] })
      // Cargar porcentajes marca la obra por administración: refrescar obras.
      qc.invalidateQueries({ queryKey: OBRAS_KEY })
    },
  })
}

/** El % vigente para una fecha: la versión de mayor `desde` que no la pasa. */
export function pctVigente(tarifas: AdminTarifa[], fechaISO: string): AdminTarifa | null {
  let mejor: AdminTarifa | null = null
  for (const t of tarifas) {
    if (t.desde <= fechaISO && (!mejor || t.desde > mejor.desde)) mejor = t
  }
  return mejor
}
