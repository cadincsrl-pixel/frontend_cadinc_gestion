// Hook para el tab "Cuenta del cliente". Lee materiales_a_cuenta_cliente
// (MCC) con joins ya resueltos del backend.
//
// Cuando `obra_cod` está presente: filtra a esa obra (y el backend valida
// scope). Cuando no, devuelve MCC de todas las obras permitidas al user.
// Para usuarios con scope global (admin), el backend exige `obra_cod` —
// si se llama sin él, la query falla con 400.

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
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
