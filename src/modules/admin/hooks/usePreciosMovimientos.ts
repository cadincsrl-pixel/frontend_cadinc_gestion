import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'

/**
 * Un cambio de precio, de cualquiera de los dos orígenes (vista
 * `v_movimientos_precio`, migración 20260913c):
 *
 *  · `renglon`  — lo que se le cobra al CLIENTE en una obra.
 *  · `catalogo` — el precio de referencia de la ficha, que vale para todas.
 */
export interface MovimientoPrecio {
  tipo:             'renglon' | 'catalogo'
  fecha:            string
  user_id:          string | null
  obra_cod:         string | null
  obra_nom:         string | null
  item_id:          number | null
  descripcion:      string | null
  material_id:      number | null
  ficha:            string | null
  precio_anterior:  number | null
  precio_nuevo:     number | null
  total_anterior:   number | null
  total_nuevo:      number | null
  fuente:           string | null
  obs:              string | null
}

export interface PreciosFiltros {
  user_id?:  string
  tipo?:     string
  obra_cod?: string
  fuente?:   string
  q?:        string
  desde?:    string
  hasta?:    string
  limit?:    number
  offset?:   number
}

export interface PreciosPagina {
  items: MovimientoPrecio[]
  /** Total con los mismos filtros, para "1–200 de 1.291". */
  total: number
}

function queryString(f: PreciosFiltros): string {
  const p = new URLSearchParams()
  if (f.user_id)  p.set('user_id', f.user_id)
  if (f.tipo)     p.set('tipo', f.tipo)
  if (f.obra_cod) p.set('obra_cod', f.obra_cod)
  if (f.fuente)   p.set('fuente', f.fuente)
  if (f.q)        p.set('q', f.q)
  if (f.desde)    p.set('desde', f.desde)
  if (f.hasta)    p.set('hasta', f.hasta)
  if (f.limit)    p.set('limit', String(f.limit))
  if (f.offset)   p.set('offset', String(f.offset))
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export function usePreciosMovimientos(filtros: PreciosFiltros = {}) {
  return useQuery({
    queryKey: ['admin', 'precios', filtros],
    queryFn: () => apiGet<PreciosPagina>(`/api/admin/precios${queryString(filtros)}`),
    // Al cambiar de página se sigue viendo la anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  })
}
