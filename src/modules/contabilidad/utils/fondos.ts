// Movimientos de fondos (tanda 5, 20260928l): etiquetas y la regla de monedas.
//
// La regla de monedas es el ESPEJO de `fn_tesoreria_mov_consistente` (la base
// pisa `importe_ars` y no confía en el cliente). Acá sirve para pedir en el
// formulario solo lo que hace falta y mostrar el equivalente en pesos antes
// de guardar:
//   - ingreso / egreso en ARS: nada más; ars = importe.
//   - ingreso / egreso en USD: cotización; ars = importe × cotización.
//   - transferencia ARS → ARS: ars = importe.
//   - transferencia USD → USD: cotización; ars = importe × cotización.
//   - transferencia entre monedas distintas: importe de destino; ars = el lado
//     en pesos y la cotización se deriva (ars / usd, 6 decimales).

import type { TesConcepto, TesConceptoSentido, TesMoneda, TesMovTipo, TesMovimiento } from '@/types/contabilidad.types'
import { r2 } from './contabilidad.utils'

export const TES_MOV_TIPOS: { key: TesMovTipo; label: string; icono: string; clase: string }[] = [
  { key: 'egreso',        label: 'Egreso',        icono: '↑', clase: 'bg-rojo-light text-rojo' },
  { key: 'ingreso',       label: 'Ingreso',       icono: '↓', clase: 'bg-verde-light text-verde' },
  { key: 'transferencia', label: 'Transferencia', icono: '⇄', clase: 'bg-azul-light text-azul' },
]

export function tipoMovimiento(t: TesMovTipo) {
  return TES_MOV_TIPOS.find(x => x.key === t) ?? TES_MOV_TIPOS[0]!
}

export const SENTIDOS_CONCEPTO: { key: TesConceptoSentido; label: string }[] = [
  { key: 'egreso',  label: 'Egreso' },
  { key: 'ingreso', label: 'Ingreso' },
  { key: 'ambos',   label: 'Ingreso o egreso' },
]

export function sentidoLabel(s: TesConceptoSentido): string {
  return SENTIDOS_CONCEPTO.find(x => x.key === s)?.label ?? s
}

/** «MF-000123». */
export function numeroMovimiento(n: number | null | undefined): string {
  return n ? `MF-${String(n).padStart(6, '0')}` : 'MF-s/n'
}

/** El concepto sirve para ese tipo de movimiento (una transferencia no lleva concepto). */
export function conceptoCompatible(c: Pick<TesConcepto, 'sentido'>, tipo: TesMovTipo): boolean {
  if (tipo === 'transferencia') return false
  return c.sentido === 'ambos' || c.sentido === tipo
}

/** «Depósito de valores»: lo correcto es una transferencia desde «Valores a depositar». */
export function esDepositoDeValores(nombre: string | null | undefined): boolean {
  const n = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return n.includes('deposito de valores')
}

export interface RequisitosMoneda {
  pideCotizacion:     boolean
  pideImporteDestino: boolean
}

export function requisitosMoneda(tipo: TesMovTipo, origen: TesMoneda | null, destino: TesMoneda | null): RequisitosMoneda {
  if (!origen) return { pideCotizacion: false, pideImporteDestino: false }
  if (tipo !== 'transferencia') return { pideCotizacion: origen === 'USD', pideImporteDestino: false }
  if (!destino) return { pideCotizacion: false, pideImporteDestino: false }
  if (origen === destino) return { pideCotizacion: origen === 'USD', pideImporteDestino: false }
  return { pideCotizacion: false, pideImporteDestino: true }
}

export interface EquivalenteArs {
  /** null = faltan datos para calcularlo. */
  ars:        number | null
  /** Solo entre monedas distintas: la que se deriva (ars / usd). */
  cotizacion: number | null
}

/** El equivalente en pesos que va a calcular la base (mismo redondeo). */
export function equivalenteArs(o: {
  tipo:            TesMovTipo
  origen:          TesMoneda | null
  destino:         TesMoneda | null
  importe:         number
  importeDestino?: number | null
  cotizacion?:     number | null
}): EquivalenteArs {
  const { tipo, origen, destino, importe } = o
  if (!origen || !(importe > 0)) return { ars: null, cotizacion: null }
  const req = requisitosMoneda(tipo, origen, destino)
  if (tipo === 'transferencia' && !destino) return { ars: null, cotizacion: null }
  if (req.pideImporteDestino) {
    const dest = Number(o.importeDestino ?? 0)
    if (!(dest > 0)) return { ars: null, cotizacion: null }
    const ars = origen === 'ARS' ? importe : dest
    const usd = origen === 'ARS' ? dest : importe
    return { ars: r2(ars), cotizacion: Math.round((ars / usd) * 1e6) / 1e6 }
  }
  if (req.pideCotizacion) {
    const c = Number(o.cotizacion ?? 0)
    if (!(c > 0)) return { ars: null, cotizacion: null }
    return { ars: r2(importe * c), cotizacion: null }
  }
  return { ars: r2(importe), cotizacion: null }
}

/** Texto de la cuenta: «Galicia» o «Galicia → Nación USD». */
export function cuentasMovimiento(m: Pick<TesMovimiento, 'tesoreria_nombre' | 'destino_nombre' | 'tipo'>): string {
  return m.tipo === 'transferencia' && m.destino_nombre ? `${m.tesoreria_nombre} → ${m.destino_nombre}` : m.tesoreria_nombre
}

/** «US$ 1.234,56» o «$ 1.234,56». */
export function fmtMoneda(n: number | null | undefined, moneda: TesMoneda | null | undefined): string {
  const v = Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moneda === 'USD' ? `US$ ${v}` : `$ ${v}`
}
