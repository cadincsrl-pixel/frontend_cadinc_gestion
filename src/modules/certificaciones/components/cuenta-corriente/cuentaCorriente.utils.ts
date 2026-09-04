// Helpers de la cuenta corriente de obras (20260904ap): metadatos de los
// cuatro estados, formatos y la agregación del resumen que baja del server
// (grupo × estado × tipo) a KPIs y filas por grupo.

import type {
  CuentaEstado, CuentaTipo, CuentaGrupo, CuentaResumenGrupo, CuentaResumenPagos, MaterialesACargoDe,
} from '@/types/domain.types'

export interface EstadoMeta {
  key:   CuentaEstado
  label: string
  hint:  string
  /** Clases del badge en la tabla de renglones. */
  badge: string
  /** Acento de la tarjeta KPI. */
  kpi:   'naranja' | 'verde' | 'gris' | 'azul'
}

export const ESTADOS: EstadoMeta[] = [
  { key: 'a_cobrar',     label: 'A cobrar',     hint: 'Deuda viva del cliente: lo adelantó CADINC y todavía no se cobró', badge: 'bg-amarillo/20 text-amber-700', kpi: 'naranja' },
  { key: 'cobrado',      label: 'Cobrado',      hint: 'Imputado a un pago del cliente (congelado)',                        badge: 'bg-verde-light text-verde',     kpi: 'verde' },
  { key: 'pago_directo', label: 'Pagó directo', hint: 'El cliente le pagó al proveedor: queda como rendición, no es deuda', badge: 'bg-gris text-gris-dark',        kpi: 'gris' },
  { key: 'gasto_cadinc', label: 'Gasto CADINC', hint: 'Obra llave en mano, o EPP en cualquier obra: no se le cobra a nadie', badge: 'bg-azul-light text-azul',      kpi: 'azul' },
]

export const ESTADO_META = Object.fromEntries(ESTADOS.map(e => [e.key, e])) as Record<CuentaEstado, EstadoMeta>

export const MOTIVO_LABEL: Record<'llave_en_mano' | 'epp', string> = {
  llave_en_mano: 'llave en mano',
  epp:           'EPP',
}

export const GRUPOS: { key: CuentaGrupo; label: string }[] = [
  { key: 'obra',      label: 'Obra' },
  { key: 'mes',       label: 'Mes' },
  { key: 'proveedor', label: 'Proveedor' },
]

export const fmtM = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtMes(s: string): string {
  const [a, m] = s.split('-')
  const nombre = MESES[Number(m) - 1]
  return nombre ? `${nombre} ${a}` : s
}

// ── Agregación del resumen ────────────────────────────────────────────────

export interface Tot { renglones: number; total: number; sin_precio: number }
const tot0 = (): Tot => ({ renglones: 0, total: 0, sin_precio: 0 })

export interface Totales extends Tot {
  porEstado:     Record<CuentaEstado, Tot>
  porTipo:       Record<CuentaTipo, Tot>
  gastoMaterial: number
  gastoEpp:      number
}

/** Recorta las filas del resumen por estado y tipo (las dos dimensiones que el server no filtra). */
export function recortar(grupos: CuentaResumenGrupo[], estados?: CuentaEstado[], tipo?: CuentaTipo): CuentaResumenGrupo[] {
  return grupos.filter(g => (!estados?.length || estados.includes(g.estado)) && (!tipo || g.tipo === tipo))
}

export function totalizar(grupos: CuentaResumenGrupo[]): Totales {
  const t: Totales = {
    ...tot0(),
    porEstado: { a_cobrar: tot0(), cobrado: tot0(), pago_directo: tot0(), gasto_cadinc: tot0() },
    porTipo:   { material: tot0(), epp: tot0() },
    gastoMaterial: 0, gastoEpp: 0,
  }
  for (const g of grupos) {
    const n = Number(g.total)
    for (const acc of [t, t.porEstado[g.estado], t.porTipo[g.tipo]]) {
      acc.renglones += g.renglones
      acc.total     += n
      acc.sin_precio += g.sin_precio
    }
    if (g.estado === 'gasto_cadinc') {
      if (g.tipo === 'epp') t.gastoEpp += n; else t.gastoMaterial += n
    }
  }
  return t
}

export interface FilaGrupo {
  grupo:        string
  grupo_nom:    string
  modalidad:    MaterialesACargoDe | null
  a_cobrar:     number
  cobrado:      number
  pago_directo: number
  gasto_cadinc: number
  gasto_epp:    number
  total:        number
  renglones:    number
  sin_precio:   number
  ultimo:       string | null
  pagos:        number
  monto_pagos:  number
}

/** Una fila por grupo (obra, mes o proveedor) con los cuatro estados en columnas. */
export function filasPorGrupo(grupos: CuentaResumenGrupo[], pagos: CuentaResumenPagos[], tipoGrupo: CuentaGrupo): FilaGrupo[] {
  const map = new Map<string, FilaGrupo>()
  for (const g of grupos) {
    let f = map.get(g.grupo)
    if (!f) {
      f = { grupo: g.grupo, grupo_nom: g.grupo_nom, modalidad: g.modalidad, a_cobrar: 0, cobrado: 0, pago_directo: 0, gasto_cadinc: 0, gasto_epp: 0, total: 0, renglones: 0, sin_precio: 0, ultimo: null, pagos: 0, monto_pagos: 0 }
      map.set(g.grupo, f)
    }
    const n = Number(g.total)
    f[g.estado] += n
    if (g.estado === 'gasto_cadinc' && g.tipo === 'epp') f.gasto_epp += n
    f.total      += n
    f.renglones  += g.renglones
    f.sin_precio += g.sin_precio
    if (g.ultimo && (!f.ultimo || g.ultimo > f.ultimo)) f.ultimo = g.ultimo
  }
  if (tipoGrupo === 'obra') {
    for (const p of pagos) {
      const f = map.get(p.obra_cod)
      if (f) { f.pagos += p.pagos; f.monto_pagos += Number(p.monto) }
    }
  }
  const filas = [...map.values()]
  if (tipoGrupo === 'mes') filas.sort((a, b) => b.grupo.localeCompare(a.grupo))
  else filas.sort((a, b) => b.total - a.total)
  return filas
}
