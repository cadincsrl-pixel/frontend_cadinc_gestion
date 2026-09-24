// Cobranzas (20260924k…o): constantes, formatos y la matemática de la
// aplicación de comprobantes.
//
// Toda la plata se cuenta en CENTAVOS enteros (como la base, numeric(14,2)):
// sumar 0,1 + 0,2 en float da 0,30000000000000004 y una imputación de un
// centavo de más rebota con IMPUTACION_SUPERA_SALDO.
//
// La fuente de verdad del saldo es `ventas_saldos_al` en la base: acá no se
// recalcula ningún saldo, solo se reparte lo que el usuario cobra entre los
// saldos que mandó el server.

import type {
  VentasCbteTipoExterno, VentasCobroEstadoDeuda, VentasCobroForma, VentasCreditoEstado, VentasDestinoImputacion,
  VentasRetencionTipo, VentasSaldo,
} from '@/types/domain.types'

// ── Centavos ──────────────────────────────────────────────────────────

/** Monto (number o string en formato máquina) → centavos enteros. Vacío o inválido = 0. */
export function aCent(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Centavos → string en formato máquina ("1234.5" → "1234.50"), para InputMonto y el body. */
export function centATexto(c: number): string {
  return (c / 100).toFixed(2)
}

export const deCent = (c: number): number => c / 100

// ── Catálogos ─────────────────────────────────────────────────────────

export const FORMAS_COBRO: { key: VentasCobroForma; label: string; hint: string }[] = [
  { key: 'transferencia', label: 'Transferencia', hint: 'Lleva la cuenta de CADINC donde entró la plata.' },
  { key: 'echeq',         label: 'E-cheq',        hint: 'Número, banco, librador y fecha de cobro.' },
  { key: 'cheque',        label: 'Cheque',        hint: 'Número, banco, librador y fecha de cobro.' },
  { key: 'efectivo',      label: 'Efectivo',      hint: '' },
  { key: 'otro',          label: 'Otro',          hint: 'Explicalo en la observación.' },
]
export const FORMA_LABEL = Object.fromEntries(FORMAS_COBRO.map(f => [f.key, f.label])) as Record<VentasCobroForma, string>

/** Los cinco que confirmó el dueño (IIBB, TEM, SUSS, Ganancias, IVA) + otra. */
export const RETENCION_TIPOS: { key: VentasRetencionTipo; label: string; corto: string; jurisdiccion: string }[] = [
  { key: 'iibb',      label: 'Ingresos Brutos',                    corto: 'IIBB',      jurisdiccion: 'Tucumán' },
  { key: 'tem',       label: 'TEM (Tributo Económico Municipal)',  corto: 'TEM',       jurisdiccion: 'San Miguel de Tucumán' },
  { key: 'suss',      label: 'SUSS',                               corto: 'SUSS',      jurisdiccion: '' },
  { key: 'ganancias', label: 'Ganancias',                          corto: 'Ganancias', jurisdiccion: '' },
  { key: 'iva',       label: 'IVA',                                corto: 'IVA',       jurisdiccion: '' },
  { key: 'otra',      label: 'Otra',                               corto: 'Otra',      jurisdiccion: '' },
]
export const RETENCION_CORTO = Object.fromEntries(RETENCION_TIPOS.map(r => [r.key, r.corto])) as Record<VentasRetencionTipo, string>

export const esFormaCheque = (f: VentasCobroForma | string) => f === 'cheque' || f === 'echeq'

/** Tipos de ARCA que se pueden cargar como saldo inicial (externos). */
export const TIPOS_EXTERNO: { key: VentasCbteTipoExterno; label: string; corto: string }[] = [
  { key: 1,   label: 'Factura A',                             corto: 'FA' },
  { key: 6,   label: 'Factura B',                             corto: 'FB' },
  { key: 201, label: 'Factura de Crédito MiPyME A (FCE)',     corto: 'FCE A' },
  { key: 60,  label: 'Cuenta de Venta y Líquido Producto A',  corto: 'CVLP A' },
  { key: 61,  label: 'Cuenta de Venta y Líquido Producto B',  corto: 'CVLP B' },
  { key: 2,   label: 'Nota de Débito A',                      corto: 'NDA' },
  { key: 7,   label: 'Nota de Débito B',                      corto: 'NDB' },
  { key: 202, label: 'Nota de Débito MiPyME A',               corto: 'NDE A' },
  { key: 3,   label: 'Nota de Crédito A',                     corto: 'NCA' },
  { key: 8,   label: 'Nota de Crédito B',                     corto: 'NCB' },
  { key: 203, label: 'Nota de Crédito MiPyME A',              corto: 'NCE A' },
]
export const esTipoCredito = (t: number | null | undefined) => t === 3 || t === 8 || t === 203

export const ORIGENES_EXTERNO: { key: 'finnegans' | 'portal' | 'otro'; label: string }[] = [
  { key: 'portal',    label: 'Portal de ARCA' },
  { key: 'finnegans', label: 'Finnegans' },
  { key: 'otro',      label: 'Otro' },
]

// ── Estado de cobro ───────────────────────────────────────────────────

// Sin vencimiento de cobro (decisión del dueño, 2026-09-24): la base todavía
// devuelve 'vencida' cuando pasó `vence_el`, y acá se muestra como Pendiente.
export const ESTADO_COBRO_META: Record<VentasCobroEstadoDeuda | VentasCreditoEstado, { label: string; badge: string; hint: string }> = {
  pagada:     { label: 'Cobrada',    badge: 'bg-verde-light text-verde',            hint: 'No debe nada.' },
  parcial:    { label: 'Parcial',    badge: 'bg-azul-light text-azul',              hint: 'Tiene cobros o NC aplicados, pero todavía debe una parte.' },
  pendiente:  { label: 'Pendiente',  badge: 'bg-gris text-gris-dark',               hint: 'No se le aplicó nada todavía.' },
  vencida:    { label: 'Pendiente',  badge: 'bg-gris text-gris-dark',               hint: 'No se le aplicó nada todavía.' },
  usado:      { label: 'Usado',      badge: 'bg-gris text-gris-dark',               hint: 'El crédito ya se aplicó entero.' },
  disponible: { label: 'Disponible', badge: 'bg-naranja-light text-naranja-dark',   hint: 'Crédito libre: se puede compensar contra otra factura.' },
}

// ── Aplicación de comprobantes ────────────────────────────────────────

/** La clave de un comprobante en la grilla: f123 (ERP), e45 (externo), c7 (cobro). */
export function claveSaldo(s: Pick<VentasSaldo, 'factura_id' | 'externo_id' | 'cobro_id'>): string {
  if (s.factura_id) return `f${s.factura_id}`
  if (s.externo_id) return `e${s.externo_id}`
  return `c${s.cobro_id ?? 0}`
}

/** El destino tal como lo pide la API: `{ factura_id | externo_id, importe }`. */
export function destinoDe(s: Pick<VentasSaldo, 'factura_id' | 'externo_id'>, importeCent: number): VentasDestinoImputacion {
  const importe = deCent(importeCent)
  return s.factura_id ? { factura_id: s.factura_id, importe } : { externo_id: s.externo_id!, importe }
}

export interface PendienteGrilla {
  clave:    string
  saldo:    number | string
  fecha:    string
  numero:   number
}

/** Orden de "más viejo a más nuevo": fecha, después número. */
export function ordenarPorAntiguedad<T extends Pick<PendienteGrilla, 'fecha' | 'numero'>>(filas: T[]): T[] {
  return [...filas].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || Number(a.numero) - Number(b.numero))
}

/**
 * «Aplicar automático» (como Bejerman): reparte `disponibleCent` entre los
 * pendientes del más viejo al más nuevo, cada uno hasta su saldo. Devuelve el
 * importe aplicado por clave en formato máquina (solo los que reciben algo).
 */
export function aplicarAutomatico(pendientes: PendienteGrilla[], disponibleCent: number): Record<string, string> {
  const out: Record<string, string> = {}
  let resto = Math.max(0, disponibleCent)
  for (const p of ordenarPorAntiguedad(pendientes)) {
    if (resto <= 0) break
    const saldo = aCent(p.saldo)
    if (saldo <= 0) continue
    const va = Math.min(saldo, resto)
    out[p.clave] = centATexto(va)
    resto -= va
  }
  return out
}

export interface EstadoAplicacion {
  /** Σ aplicado, en centavos. */
  aplicadoCent: number
  /** total − aplicado (≥ 0 si todo está bien). */
  aCuentaCent:  number
  /** Mensaje por clave: aplicado > saldo o negativo. */
  errores:      Record<string, string>
  /** Σ aplicado > total del crédito/cobro. */
  superaTotal:  boolean
}

/** Validaciones en vivo de la grilla: cada aplicado ≤ su saldo y Σ ≤ total. Espejo de `_ventas_aplicar`. */
export function validarAplicacion(
  pendientes: Pick<PendienteGrilla, 'clave' | 'saldo'>[],
  aplicado: Record<string, string>,
  totalCent: number,
): EstadoAplicacion {
  const errores: Record<string, string> = {}
  let suma = 0
  for (const p of pendientes) {
    const raw = aplicado[p.clave]
    if (raw === undefined || raw === '') continue
    const c = aCent(raw)
    if (c < 0) errores[p.clave] = 'No puede ser negativo'
    else if (c > aCent(p.saldo)) errores[p.clave] = 'Supera el saldo'
    suma += Math.max(0, c)
  }
  return { aplicadoCent: suma, aCuentaCent: totalCent - suma, errores, superaTotal: suma > totalCent }
}

/** Las imputaciones a mandar: solo las filas con importe > 0. */
export function imputacionesDe<T extends Pick<VentasSaldo, 'factura_id' | 'externo_id'> & { clave: string }>(
  pendientes: T[], aplicado: Record<string, string>,
): VentasDestinoImputacion[] {
  return pendientes
    .map(p => ({ p, c: aCent(aplicado[p.clave]) }))
    .filter(x => x.c > 0)
    .map(x => destinoDe(x.p, x.c))
}

// ── Formatos ──────────────────────────────────────────────────────────

/** RC 0001-00000012 (espejo de `_ventas_recibo_fmt`). */
export function numeroRecibo(n: number): string {
  return `RC 0001-${String(n).padStart(8, '0')}`
}

/** PV-número como lo imprime ARCA: 00002-00001143. */
export function numeroCbte(pv: number, numero: number): string {
  return `${String(pv).padStart(5, '0')}-${String(numero).padStart(8, '0')}`
}

/** Suma de días a una fecha ISO (sin huso: mediodía UTC). */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** `{ rows, total }` o un array pelado → `{ rows, total }` (el backend no fija la forma de las listas cortas). */
export function aPagina<T>(r: T[] | { rows?: T[]; total?: number } | null | undefined): { rows: T[]; total: number } {
  if (Array.isArray(r)) return { rows: r, total: r.length }
  const rows = r?.rows ?? []
  return { rows, total: r?.total ?? rows.length }
}
