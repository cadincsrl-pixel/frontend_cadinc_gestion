// Bienes de uso (tanda 5, 20260928p): cuentas sugeridas y la cuota estimada.
//
// Plan de Finnegans: el título del rubro es <título>.XX (hoy 1.2.2.XX, se
// elige en Mapeos › Configuración, 20260929h), «Valores originales» es
// .01, «Actualizaciones» .02 y «Amortizaciones acumuladas» .03 (H6 de la
// spec). La cuenta de gasto por rubro sale del mapeo `bienes.gasto` (subclave
// = código del título; '' = general). Solo son SUGERENCIAS del alta: cada bien
// guarda sus tres cuentas.

import type { CtbConfig, CtbCuenta, CtbMapeosCatalogo } from '@/types/contabilidad.types'

/** El de la base cuando no hay config (`_cont_bu_prefijo()`). */
export const PREFIJO_BIENES_DEFAULT = '1.2.2.'

/** Prefijo de los rubros de bienes de uso: código de la cuenta título + '.'; sin config → 1.2.2. */
export function prefijoBienes(config: Pick<CtbConfig, 'bu_titulo_rubros'> | null | undefined): string {
  const cod = config?.bu_titulo_rubros?.codigo
  return cod ? `${cod}.` : PREFIJO_BIENES_DEFAULT
}

/** «1.2.2.04.01» → «1.2.2.04». Sin madre → null. */
export function tituloDeCuenta(codigo: string | null | undefined): string | null {
  if (!codigo || !codigo.includes('.')) return null
  return codigo.replace(/\.[0-9]+$/, '')
}

/** Cuentas que sirven de origen: imputables del activo; si el plan tiene <prefijo>*, solo esas. */
export function filtroCuentaOrigen(cuentas: CtbCuenta[], prefijo: string = PREFIJO_BIENES_DEFAULT): (c: CtbCuenta) => boolean {
  const hayBienes = cuentas.some(c => c.codigo.startsWith(prefijo) && c.imputable && c.rubro === 'activo')
  return c => c.rubro === 'activo' && (!hayBienes || c.codigo.startsWith(prefijo))
}

/** La hermana «.03» (amortizaciones acumuladas) del mismo título, activa e imputable. */
export function sugerirCuentaAmort(cuentas: CtbCuenta[], origen: Pick<CtbCuenta, 'codigo'> | null): CtbCuenta | null {
  const t = tituloDeCuenta(origen?.codigo)
  if (!t) return null
  return cuentas.find(c => c.codigo === `${t}.03` && c.activo && c.imputable) ?? null
}

/** La cuenta de gasto del mapeo `bienes.gasto`: la del título, o la general. */
export function sugerirCuentaGasto(catalogo: CtbMapeosCatalogo | null | undefined, origen: Pick<CtbCuenta, 'codigo'> | null): number | null {
  const clave = catalogo?.claves.find(k => k.clave === 'bienes.gasto')
  if (!clave) return null
  const t = tituloDeCuenta(origen?.codigo)
  const porTitulo = t ? clave.subclaves.find(s => s.subclave === t)?.cuenta_id : null
  return porTitulo ?? clave.subclaves.find(s => s.subclave === '')?.cuenta_id ?? null
}

/** Cuota mensual lineal: (VO − residual) / (vida × 12). null si no se amortiza o faltan datos. */
export function cuotaMensual(valorOrigen: number, residual: number, vidaAnios: number | null): number | null {
  if (!vidaAnios || !(vidaAnios > 0) || !(valorOrigen > 0)) return null
  const base = valorOrigen - (residual || 0)
  if (!(base > 0)) return null
  return Math.round((base / (vidaAnios * 12)) * 100) / 100
}
