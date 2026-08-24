import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/lib/api/client'
import type { StockClienteRow, StockClienteMovimiento } from '@/types/domain.types'

export const STOCK_CLIENTE_KEY = ['stock-cliente'] as const

interface ListFiltros {
  obra_cod?:         string
  incluir_agotados?: boolean
}

// Saldo por material del ledger de stock de cliente. Con `obra_cod` responde
// "¿qué le queda pendiente en depósito a esta obra?".
export function useStockCliente(filtros: ListFiltros = {}) {
  const qs = new URLSearchParams()
  if (filtros.obra_cod)         qs.set('obra_cod', filtros.obra_cod)
  if (filtros.incluir_agotados) qs.set('incluir_agotados', 'true')
  const path = `/api/stock-cliente${qs.toString() ? `?${qs}` : ''}`
  return useQuery({
    queryKey: [...STOCK_CLIENTE_KEY, filtros],
    queryFn: () => apiGet<StockClienteRow[]>(path),
  })
}

export function useMovimientosStockCliente(itemId: number | null) {
  return useQuery({
    queryKey: [...STOCK_CLIENTE_KEY, 'movs', itemId],
    queryFn: () => apiGet<StockClienteMovimiento[]>(`/api/stock-cliente/items/${itemId}/movimientos`),
    enabled: !!itemId,
  })
}

interface EntradaDto {
  obra_cod:    string
  descripcion: string
  unidad:      string
  cantidad:    number
  fecha?:      string
  obs?:        string
}

export function useEntradaStockCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: EntradaDto) => apiPost('/api/stock-cliente/entrada', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: STOCK_CLIENTE_KEY }),
  })
}

interface EntradaLoteDto {
  obra_cod: string
  fecha?:   string
  obs?:     string
  items: {
    descripcion: string
    unidad:      string
    cantidad:    number
  }[]
}

interface EntradaLoteResult {
  obra_cod: string
  fecha:    string | null
  items: { item_id: number; descripcion: string; cantidad: number }[]
}

// Entrega del cliente en lote: varios materiales de una misma factura/remito.
// La cabecera (obra, fecha, obs) aplica a todos los movimientos. Invalida en
// onSettled (no onSuccess): el loop del backend es no-atómico, así que un
// error parcial (ENTRADA_LOTE_PARCIAL) también dejó entradas registradas.
export function useEntradaLoteStockCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: EntradaLoteDto) => apiPost<EntradaLoteResult>('/api/stock-cliente/entrada-lote', dto),
    onSettled: () => qc.invalidateQueries({ queryKey: STOCK_CLIENTE_KEY }),
  })
}

interface SalidaDto {
  item_id:  number
  cantidad: number
  motivo:   'consumo_obra' | 'ajuste' | 'devolucion'
  fecha?:   string
  obs?:     string
}

export function useSalidaStockCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: SalidaDto) => apiPost('/api/stock-cliente/salida', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: STOCK_CLIENTE_KEY }),
  })
}
