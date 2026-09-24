// Padrón de clientes de Facturación (`ventas_clientes`).
//
// Es PROPIO del módulo: no es el de Áridos ni el de Pagos, y no se sincroniza
// con ninguno. Lo único que cruza es `obras.cliente_id`, que se setea con
// PUT /clientes/:id/obras para precargar el cliente al facturar una obra.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client'
import type {
  VentasActualizarDesdeArca, VentasCliente, VentasClienteInput, VentasCuentaBancaria, VentasCuentaInput, VentasInfoFce, VentasPadronResultado,
} from '@/types/domain.types'
import { FACTURACION_KEYS, invalidarFacturacion } from './useFacturacion'
import type { contactosParaGuardar } from '@/components/contactos/ContactosEditor'

const BASE = '/api/facturacion/clientes'

export function useClientesVenta(q = '', incluirInactivos = false, enabled = true) {
  const p = new URLSearchParams()
  if (q.trim()) p.set('q', q.trim())
  p.set('incluir_inactivos', incluirInactivos ? '1' : '0')
  const qs = p.toString()
  return useQuery({
    queryKey: [...FACTURACION_KEYS.clientes, 'lista', qs],
    queryFn:  () => apiGet<VentasCliente[]>(`${BASE}?${qs}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  })
}

export function useCrearClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasClienteInput) => apiPost<VentasCliente>(BASE, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useEditarClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<VentasClienteInput> & { id: number }) =>
      apiPatch<VentasCliente>(`${BASE}/${id}`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useBajaClienteVenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPost<VentasCliente>(`${BASE}/${id}/${activo ? 'alta' : 'baja'}`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Reemplaza la lista: las obras que no vienen quedan sin cliente. */
export function useAsignarObrasCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, obra_cods }: { id: number; obra_cods: string[] }) =>
      apiPut<VentasCliente>(`${BASE}/${id}/obras`, { obra_cods }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

/** Reemplaza la lista de contactos (20260925f): actualiza, agrega y borra en una transacción. */
export function useGuardarContactosCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, contactos }: { id: number; contactos: ReturnType<typeof contactosParaGuardar> }) =>
      apiPut<VentasCliente>(`${BASE}/${id}/contactos`, { contactos }),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

// ── Padrón de ARCA (fase 7) ─────────────────────────────────────────

/** Los datos de un CUIT según ARCA, para precargar el alta. NO guarda nada. */
export function useConsultarPadron() {
  return useMutation({
    mutationFn: (cuit: string) => apiGet<VentasPadronResultado>(`${BASE}/padron/${cuit.replace(/\D/g, '')}`),
  })
}

/**
 * Pisa domicilio y provincia del cliente con los de ARCA; razón social y
 * condición IVA solo si están vacías o con `todo`.
 */
export function useActualizarDesdeArca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, todo }: { id: number; todo?: boolean }) =>
      apiPost<VentasActualizarDesdeArca>(`${BASE}/${id}/actualizar-desde-arca${todo ? '?todo=1' : ''}`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

// ── FCE MiPyME (fase 6) ───────────────────────────────────────────────

/**
 * ¿El cliente está obligado a recibir FCE y desde qué monto? (WSFECRED, con
 * cache de 30 días en el server). Nunca falla por ARCA: si WSFECRED no
 * responde vuelve con `error` y `obligado: null`, y la UI deja elegir.
 */
export function useFceCliente(clienteId: number | null, enabled = true) {
  return useQuery({
    queryKey: FACTURACION_KEYS.clienteFce(clienteId ?? 0),
    queryFn:  () => apiGet<VentasInfoFce>(`${BASE}/${clienteId}/fce`),
    staleTime: 10 * 60_000,
    enabled:  enabled && !!clienteId,
    retry:    false,
  })
}

/** Vuelve a preguntarle a WSFECRED (sin cache). */
export function useRefrescarFceCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiGet<VentasInfoFce>(`${BASE}/${id}/fce?refrescar=1`),
    onSuccess:  (info) => {
      qc.setQueryData(FACTURACION_KEYS.clienteFce(info.cliente_id), info)
      void qc.invalidateQueries({ queryKey: FACTURACION_KEYS.clientes })
    },
  })
}

const CUENTAS = '/api/facturacion/cuentas'

/** Cuentas bancarias de CADINC para la FCE. */
export function useCuentasFce(incluirInactivas = false, enabled = true) {
  return useQuery({
    queryKey: [...FACTURACION_KEYS.cuentas, incluirInactivas ? 'todas' : 'activas'],
    queryFn:  () => apiGet<VentasCuentaBancaria[]>(`${CUENTAS}?incluir_inactivas=${incluirInactivas ? '1' : '0'}`),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useCrearCuentaFce() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: VentasCuentaInput) => apiPost<VentasCuentaBancaria>(CUENTAS, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useEditarCuentaFce() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<VentasCuentaInput> & { id: number }) =>
      apiPatch<VentasCuentaBancaria>(`${CUENTAS}/${id}`, body),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}

export function useBajaCuentaFce() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      apiPost<VentasCuentaBancaria>(`${CUENTAS}/${id}/${activo ? 'alta' : 'baja'}`, {}),
    onSuccess:  () => invalidarFacturacion(qc),
  })
}
