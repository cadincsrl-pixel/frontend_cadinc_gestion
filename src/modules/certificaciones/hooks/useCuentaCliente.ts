// Hook para el tab "Cuenta del cliente". Lee materiales_a_cuenta_cliente
// (MCC) con joins ya resueltos del backend.
//
// Cuando `obra_cod` está presente: filtra a esa obra (y el backend valida
// scope). Cuando no, devuelve MCC de todas las obras permitidas al user.
// Para usuarios con scope global (admin), el backend exige `obra_cod` —
// si se llama sin él, la query falla con 400.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/lib/api/client'
import type { MaterialACuentaCliente } from '@/types/domain.types'

/** Fila de MCC con joins que devuelve el backend. */
export interface CuentaClienteRow extends MaterialACuentaCliente {
  proveedores?:     { nombre: string } | null
  facturas_compra?: { numero: string | null; adjunto_url: string | null; fecha: string | null } | null
}

const KEYS = {
  list: (obra?: string) => ['cuenta-cliente', obra ?? 'all'] as const,
}

export function useCuentaCliente(obra_cod?: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.list(obra_cod),
    queryFn: () =>
      apiGet<CuentaClienteRow[]>(
        `/api/cuenta-cliente${obra_cod ? `?obra_cod=${encodeURIComponent(obra_cod)}` : ''}`,
      ),
    enabled,
  })
}

/**
 * Carga/corrige el precio de varios ítems de MCC de una sola vez. Reusa el
 * endpoint `PATCH /api/solicitudes/items/:itemId` (editarItem), que actualiza
 * el ítem de la solicitud Y recalcula su fila en materiales_a_cuenta_cliente
 * (precio_total = cantidad × precio_unit). Requiere el flag `resolver_items`
 * en el backend. Devuelve cuántos fallaron para reportarlo en la UI.
 */
export function useGuardarPreciosMCC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { itemId: number; precio_unit: number }[]) => {
      const res = await Promise.allSettled(
        items.map(it =>
          apiPatch(`/api/solicitudes/items/${it.itemId}`, { precio_unit: it.precio_unit }),
        ),
      )
      return { total: items.length, fallidos: res.filter(r => r.status === 'rejected').length }
    },
    // Refetch de todas las variantes de la lista (la key es ['cuenta-cliente', obra]).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuenta-cliente'] }),
  })
}
