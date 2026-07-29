// Tarifas de chofer vigentes a una fecha.
//
// `choferes.basico_dia`, `.precio_km_cargado` y `.precio_km_vacio` son sólo
// CACHE de la última versión — sirven para labels y para prellenar formularios.
// En cualquier cálculo con fecha (trabajo de meses pasados, reportes, estimación
// del trabajo sin liquidar) hay que usar estas funciones.
//
// Por qué: antes las tarifas se pisaban in-place, y el "parcial" de
// Gastos > Reportes valúa el trabajo hecho-pero-sin-liquidar con la tarifa
// actual. El día de un aumento se re-valuaba retroactivamente todo lo pendiente
// —con un 20% se movían $1.168.584 solos—. Es el mismo bug que tarja el
// 2026-06-26, donde un aumento global recalculó los costos de semanas ya pagadas
// y los valores históricos hubo que recuperarlos por extrapolación de un Excel.
// Mismo modelo que `getVHGlobalEnFecha` en costos.ts. Migración 20260729g.
//
// Las liquidaciones CERRADAS no dependen de esto: snapshotean sus subtotales.

import type { Chofer } from '@/types/domain.types'

export interface ChoferBasicoHist {
  id?:       number
  valor_dia: number
  desde:     string   // ISO yyyy-mm-dd
}

export interface ChoferKmHist {
  id?:      number
  valor_km: number
  desde:    string
  tipo:     'cargado' | 'vacio'
}

// El chofer que llega del endpoint trae el historial embebido.
export type ChoferConHist = Chofer & {
  choferes_basico_hist?: ChoferBasicoHist[] | null
  choferes_km_hist?:     ChoferKmHist[] | null
}

/**
 * Última versión con `desde <= fechaRef`. Si la fecha consultada es anterior a
 * todo el historial cae a la versión más vieja, y si no hay historial cae al
 * valor cacheado: nunca devuelve 0 por falta de datos, porque un 0 silencioso
 * haría desaparecer un costo en vez de mostrar un problema.
 */
function versionEnFecha<T extends { desde: string }>(
  versiones: T[],
  fechaRef: string,
): T | null {
  if (!versiones.length) return null
  const orden = [...versiones].sort((a, b) => a.desde.localeCompare(b.desde))
  let elegida: T | null = null
  for (const v of orden) {
    if (v.desde <= fechaRef) elegida = v
    else break
  }
  return elegida ?? orden[0]!
}

/** Básico/día del chofer vigente a `fechaRef`. */
export function basicoDiaEnFecha(chofer: ChoferConHist | undefined, fechaRef: string): number {
  if (!chofer) return 0
  const v = versionEnFecha(chofer.choferes_basico_hist ?? [], fechaRef)
  return Number(v?.valor_dia ?? chofer.basico_dia ?? 0)
}

/** $/km del chofer vigente a `fechaRef`, por tipo de tramo. */
export function precioKmEnFecha(
  chofer: ChoferConHist | undefined,
  fechaRef: string,
  tipo: 'cargado' | 'vacio',
): number {
  if (!chofer) return 0
  const delTipo = (chofer.choferes_km_hist ?? []).filter(h => h.tipo === tipo)
  const v = versionEnFecha(delTipo, fechaRef)
  if (v) return Number(v.valor_km)
  return Number((tipo === 'cargado' ? chofer.precio_km_cargado : chofer.precio_km_vacio) ?? 0)
}

/**
 * ¿Las tarifas de este chofer cambiaron alguna vez? Sirve para mostrar el
 * historial sólo cuando aporta algo.
 */
export function tieneHistorialDeTarifas(chofer: ChoferConHist | undefined): boolean {
  if (!chofer) return false
  const basicos = new Set((chofer.choferes_basico_hist ?? []).map(h => Number(h.valor_dia)))
  const kmCarg  = new Set((chofer.choferes_km_hist ?? []).filter(h => h.tipo === 'cargado').map(h => Number(h.valor_km)))
  const kmVacio = new Set((chofer.choferes_km_hist ?? []).filter(h => h.tipo === 'vacio').map(h => Number(h.valor_km)))
  return basicos.size > 1 || kmCarg.size > 1 || kmVacio.size > 1
}
