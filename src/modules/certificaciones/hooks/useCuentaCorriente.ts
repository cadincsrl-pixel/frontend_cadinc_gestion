// Cuenta corriente de obras (20260904ap): una sola vista para lo que se le
// cobra al cliente y lo que gastó CADINC. Todo se filtra y pagina en el
// server (v_cuenta_corriente + RPC cuenta_corriente_resumen); acá solo se
// arma la query string y se cachea por filtro.

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import type {
  CuentaEstado, CuentaTipo, CuentaGrupo, CuentaRenglon, CuentaRenglonesPage, CuentaResumen,
} from '@/types/domain.types'

export interface CuentaFiltro {
  obra_cod?:     string
  estados?:      CuentaEstado[]
  tipo?:         CuentaTipo
  sin_precio?:   boolean
  proveedor_id?: number
  origen?:       'proveedor' | 'deposito'
  desde?:        string
  hasta?:        string
  q?:            string
  archivadas?:   boolean
}

export const CUENTA_CORRIENTE_KEY = ['cuenta-corriente'] as const

function armarQuery(f: CuentaFiltro, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f.obra_cod)        p.set('obra_cod', f.obra_cod)
  if (f.estados?.length) p.set('estado', f.estados.join(','))
  if (f.tipo)            p.set('tipo', f.tipo)
  if (f.sin_precio)      p.set('sin_precio', '1')
  if (f.proveedor_id)    p.set('proveedor_id', String(f.proveedor_id))
  if (f.origen)          p.set('origen', f.origen)
  if (f.desde)           p.set('desde', f.desde)
  if (f.hasta)           p.set('hasta', f.hasta)
  if (f.q?.trim())       p.set('q', f.q.trim())
  if (f.archivadas)      p.set('archivadas', '1')
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

/** Renglones paginados con todos los filtros aplicados en el server. */
export function useCuentaRenglones(f: CuentaFiltro, page: number, pageSize: number, enabled = true) {
  const qs = armarQuery(f, { limit: pageSize, offset: (page - 1) * pageSize })
  return useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'renglones', qs],
    queryFn:  () => apiGet<CuentaRenglonesPage>(`/api/cuenta-cliente/renglones?${qs}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/**
 * Totales por grupo × estado × tipo. Se pide SIN estado ni tipo: esas dos
 * dimensiones se recortan en el cliente sobre el resultado, así los chips
 * muestran cuánto hay en cada una con los demás filtros puestos.
 */
export function useCuentaResumen(f: CuentaFiltro, grupo: CuentaGrupo, enabled = true) {
  const qs = armarQuery({ ...f, estados: undefined, tipo: undefined }, { grupo })
  return useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'resumen', qs],
    queryFn:  () => apiGet<CuentaResumen>(`/api/cuenta-cliente/resumen?${qs}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Todos los renglones del filtro (para Excel, PDF y los modales), de a 1000. */
export async function fetchCuentaRenglonesTodos(f: CuentaFiltro): Promise<CuentaRenglon[]> {
  const PAGE = 1000
  const all: CuentaRenglon[] = []
  for (let offset = 0; ; offset += PAGE) {
    const qs = armarQuery(f, { limit: PAGE, offset })
    const page = await apiGet<CuentaRenglonesPage>(`/api/cuenta-cliente/renglones?${qs}`)
    all.push(...page.items)
    if (page.items.length < PAGE) break
  }
  return all
}
