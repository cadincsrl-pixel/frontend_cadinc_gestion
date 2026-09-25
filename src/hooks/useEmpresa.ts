'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, HttpError } from '@/lib/api/client'
import { hidratarEmpresa } from '@/lib/config/empresa'
import type { EmpresaApi, EmpresaEditable } from '@/types/config.types'

export const EMPRESA_KEY = ['empresa'] as const

/**
 * Datos de la empresa (GET /api/empresa, tanda 6). Cada vez que llegan,
 * hidratan `EMPRESA`, que es lo que leen los PDF y exports.
 *
 * Contra un backend viejo (404) devuelve `null` y `EMPRESA` queda con los
 * defaults, que son idénticos a lo de hoy.
 */
export function useEmpresa() {
  const q = useQuery({
    queryKey: EMPRESA_KEY,
    queryFn: async () => {
      try {
        return await apiGet<EmpresaApi>('/api/empresa')
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (q.data) hidratarEmpresa(q.data)
  }, [q.data])

  return q
}

/** PATCH /api/empresa (admin.configurar). Invalida y re-hidrata al guardar. */
export function useGuardarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cambios: Partial<EmpresaEditable>) => apiPatch<EmpresaApi>('/api/empresa', cambios),
    onSuccess: (data) => {
      hidratarEmpresa(data)
      qc.setQueryData(EMPRESA_KEY, data)
      qc.invalidateQueries({ queryKey: EMPRESA_KEY })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}
