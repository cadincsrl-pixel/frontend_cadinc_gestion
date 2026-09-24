// Conceptos de compra del módulo Pagos (`pagos_conceptos`, 20260925).
//
// UN concepto por factura (combustible, materiales de obra…); la lista la
// ajusta el contador desde «Conceptos de compra». No hay DELETE: se da de baja
// con `activo=false` y las facturas viejas lo conservan.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type { CrearConceptoInput, EditarConceptoInput, PagosConcepto } from '@/types/domain.types'
import { PAGOS_KEYS, invalidarPagos } from './usePagos'

/** Ordenados por `orden` (lo hace el backend). Por default solo los activos. */
export function useConceptosPagos(incluirInactivos = false, enabled = true) {
  return useQuery({
    queryKey: [...PAGOS_KEYS.conceptos, incluirInactivos ? 'todos' : 'activos'],
    queryFn:  () => apiGet<PagosConcepto[]>(`/api/pagos/conceptos${incluirInactivos ? '?incluir_inactivos=1' : ''}`),
    staleTime: 5 * 60_000,
    enabled,
  })
}

/** 409 `CONCEPTO_DUPLICADO` si el nombre (normalizado) ya existe. */
export function useCrearConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CrearConceptoInput) => apiPost<PagosConcepto>('/api/pagos/conceptos', body),
    onSuccess:  () => invalidarPagos(qc),
  })
}

/** Renombrar invalida también las facturas: la vista trae el nombre del concepto. */
export function useEditarConcepto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: EditarConceptoInput & { id: number }) =>
      apiPatch<PagosConcepto>(`/api/pagos/conceptos/${id}`, body),
    onSuccess:  () => invalidarPagos(qc),
  })
}
