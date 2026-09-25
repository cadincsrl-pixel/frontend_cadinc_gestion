/**
 * El desglose de la factura como lo pide ARCA (20260924u): IVA por alícuota,
 * no gravado, exento y percepciones/tributos. Funciones puras (vitest).
 *
 * Mismas reglas que la base (`_pagos_guardar_desglose`) y que el backend
 * (`importesEfectivos`):
 *   neto gravado = Σ bases de las alícuotas (si hay alícuotas)
 *   IVA          = Σ importes de las alícuotas
 *   percepciones = Σ tributos percepcion_*   → NO se reparten a las obras
 *   otros        = Σ los demás tributos       (internos, otros)
 *   cierre: neto + no gravado + exento + IVA + percepciones + otros = total (±0,01)
 */
import type { PagosAlicuotaId, PagosTributoTipo } from '@/types/domain.types'

export const ALICUOTAS: { id: PagosAlicuotaId; pct: number; label: string }[] = [
  { id: 5, pct: 21,   label: '21 %' },
  { id: 4, pct: 10.5, label: '10,5 %' },
  { id: 6, pct: 27,   label: '27 %' },
  { id: 8, pct: 5,    label: '5 %' },
  { id: 9, pct: 2.5,  label: '2,5 %' },
  { id: 3, pct: 0,    label: '0 %' },
]
export const pctDeAlicuota = (id: number) => ALICUOTAS.find(a => a.id === id)?.pct ?? 0

/**
 * Un renglón de percepción/tributo en el formulario. `jurisdiccion` es el
 * nombre (o el texto viejo si no resolvió); `jurisdiccion_id` el del catálogo
 * (20260929f): con id, la base pisa el texto con el nombre.
 */
export interface FilaTributo {
  tipo:            PagosTributoTipo
  jurisdiccion:    string
  jurisdiccion_id: number | null
  descripcion:     string
  importe:         string
}

/** Lo que viene del backend (ficha, lectura IA) → fila del formulario. */
export function filaDeTributo(t: {
  tipo: PagosTributoTipo; jurisdiccion?: string | null; jurisdiccion_id?: number | null
  descripcion?: string | null; importe: number | string
}): FilaTributo {
  return {
    tipo: t.tipo, jurisdiccion: t.jurisdiccion ?? '', jurisdiccion_id: t.jurisdiccion_id ?? null,
    descripcion: t.descripcion ?? '', importe: String(t.importe),
  }
}

/** Fila → cuerpo de la API. Manda el id y el nombre (un backend viejo ignora el id y usa el texto). */
export function tributoDeFila(t: FilaTributo, importe: number) {
  return {
    tipo: t.tipo, jurisdiccion: t.jurisdiccion.trim() || null, jurisdiccion_id: t.jurisdiccion_id,
    descripcion: t.descripcion.trim(), alicuota: null, base_imp: null, importe,
  }
}

export const TIPOS_TRIBUTO: { key: PagosTributoTipo; label: string; conJurisdiccion: boolean }[] = [
  { key: 'percepcion_iibb',      label: 'Percepción IIBB',       conJurisdiccion: true },
  { key: 'percepcion_iva',       label: 'Percepción IVA',        conJurisdiccion: false },
  { key: 'percepcion_ganancias', label: 'Percepción Ganancias',  conJurisdiccion: false },
  { key: 'percepcion_municipal', label: 'Percepción municipal',  conJurisdiccion: true },
  { key: 'impuestos_internos',   label: 'Impuestos internos',    conJurisdiccion: false },
  { key: 'otro',                 label: 'Otro tributo',          conJurisdiccion: false },
]
export const labelTributo = (t: string) => TIPOS_TRIBUTO.find(x => x.key === t)?.label ?? t
export const esPercepcion = (t: string) => t.startsWith('percepcion_')

/** Código ARCA → nombre del comprobante (lo que se ve en la ficha). */
export const NOMBRE_CBTE_ARCA: Record<number, string> = {
  1: 'Factura A', 2: 'Nota de débito A', 3: 'Nota de crédito A', 4: 'Recibo A',
  6: 'Factura B', 7: 'Nota de débito B', 8: 'Nota de crédito B', 9: 'Recibo B',
  11: 'Factura C', 12: 'Nota de débito C', 13: 'Nota de crédito C', 15: 'Recibo C',
  51: 'Factura M', 81: 'Tique factura A', 82: 'Tique factura B', 83: 'Tique',
  201: 'FCE A', 206: 'FCE B', 211: 'FCE C',
}

const r2 = (v: number) => Math.round(v * 100) / 100
const suma = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

export interface IvaNum { alicuota_id: number; base: number; importe: number }
export interface TributoNum { tipo: string; importe: number }

export interface ResumenDesglose {
  netoGravado:  number
  iva:          number
  percepciones: number
  otros:        number
  suma:         number
  /** total − suma: lo que falta (+) o sobra (−) para cerrar. */
  diferencia:   number
  cierra:       boolean
  /** Lo que se reparte entre obras: total − percepciones. */
  imputable:    number
}

export function resumirDesglose(p: {
  iva: IvaNum[]; tributos: TributoNum[]; neto: number; noGravado: number; exento: number; total: number
}): ResumenDesglose {
  const filasIva = p.iva.filter(f => f.base || f.importe)
  const netoGravado = filasIva.length ? suma(filasIva.map(f => f.base)) : r2(p.neto)
  const iva = suma(filasIva.map(f => f.importe))
  const percepciones = suma(p.tributos.filter(t => esPercepcion(t.tipo)).map(t => t.importe))
  const otros = suma(p.tributos.filter(t => !esPercepcion(t.tipo)).map(t => t.importe))
  const s = suma([netoGravado, p.noGravado, p.exento, iva, percepciones, otros])
  const diferencia = r2(p.total - s)
  return {
    netoGravado, iva, percepciones, otros, suma: s, diferencia,
    cierra: Math.abs(diferencia) <= 0.01 + 1e-9,
    imputable: r2(p.total - percepciones),
  }
}

/**
 * Le falta el desglose para el Libro IVA de compras (20260924v): neto o IVA
 * vacíos, o marcado a revisar. Mismo criterio que el filtro `sin_desglose`
 * del backend. Las anuladas no cuentan.
 */
export function sinDesglose(f: { estado: string; neto: number | null; iva: number | null; desglose_a_revisar?: boolean }): boolean {
  return f.estado !== 'anulada' && (f.neto == null || f.iva == null || !!f.desglose_a_revisar)
}

/** IVA que corresponde a una base (para sugerir el importe al tipear la base). */
export function ivaDe(base: number, alicuotaId: number): number {
  return r2(base * pctDeAlicuota(alicuotaId) / 100)
}

/** El importe de IVA no se parece a base × alícuota (tolerancia $1 o 0,5 %). */
export function ivaNoCuadra(base: number, importe: number, alicuotaId: number): boolean {
  const esperado = ivaDe(base, alicuotaId)
  return Math.abs(esperado - importe) > Math.max(1, esperado * 0.005)
}
