'use client'

import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import type { PagosFactura } from '@/types/domain.types'
import { comprobanteTxt, fmtFecha, fmtM, topePagable } from '../utils/pagos.utils'

/**
 * «Acredita a…»: a qué facturas del proveedor baja deuda una nota de crédito
 * y cuánto a cada una (20260925). Lo usan el alta/edición de la NC y «Aplicar
 * crédito» de una NC ya aprobada.
 *
 * El tope de cada factura es su `saldo_pagable`. Al EDITAR una NC pendiente,
 * la vista ya le descontó a la factura lo que reserva esta misma NC, así que
 * esa reserva se devuelve como `topeExtra` (el backend valida «excluyendo la
 * propia NC»). Lo que no se aplica queda como crédito a favor del proveedor.
 */

/** Monto por factura, como se tipea (formato máquina de `InputMonto`). */
export type MontosAcredita = Record<string, string>

const r2 = (v: number) => Math.round(v * 100) / 100
export const nMonto = (s: string | undefined) => {
  const v = Number(aRaw(String(s ?? ''), 2))
  return Number.isFinite(v) ? v : 0
}

export function topeDe(f: PagosFactura, topeExtra?: Record<number, number>): number {
  return r2(topePagable(f) + (topeExtra?.[f.id] ?? 0))
}

export interface ValidacionAcredita {
  suma:      number
  /** Por id de factura: el motivo, si el monto no entra. */
  errores:   Record<number, string>
  excedeTotal: boolean
  /** Lo que queda sin aplicar (crédito a favor). */
  resto:     number
}

export function validarAcredita(
  montos: MontosAcredita, facturas: PagosFactura[], totalMax: number, topeExtra?: Record<number, number>,
): ValidacionAcredita {
  const errores: Record<number, string> = {}
  let suma = 0
  for (const f of facturas) {
    const m = nMonto(montos[String(f.id)])
    if (m <= 0) continue
    suma = r2(suma + m)
    const tope = topeDe(f, topeExtra)
    if (m - tope > 0.005) errores[f.id] = `Le quedan ${fmtM(tope)}`
  }
  return { suma, errores, excedeTotal: suma - totalMax > 0.005, resto: r2(Math.max(0, totalMax - suma)) }
}

/** Lo que viaja al backend: solo las filas con monto. */
export function aplicaADe(montos: MontosAcredita): { factura_id: number; monto: number }[] {
  return Object.entries(montos)
    .map(([id, v]) => ({ factura_id: Number(id), monto: nMonto(v) }))
    .filter(x => x.monto > 0)
}

interface Props {
  facturas:   PagosFactura[]
  cargando?:  boolean
  montos:     MontosAcredita
  onChange:   (m: MontosAcredita) => void
  /** Cuánto puede acreditar como máximo: el total de la NC, o su crédito disponible. */
  totalMax:   number
  topeExtra?: Record<number, number>
  disabled?:  boolean
  /** Texto del resto: «queda como crédito a favor». */
  etiquetaResto?: string
}

export function AcreditaA({ facturas, cargando, montos, onChange, totalMax, topeExtra, disabled, etiquetaResto }: Props) {
  const v = validarAcredita(montos, facturas, totalMax, topeExtra)
  const set = (id: number, valor: string) => onChange({ ...montos, [String(id)]: valor })

  /** Completa la fila con lo que entra: el tope de la factura o lo que falta repartir. */
  function completar(f: PagosFactura) {
    const actual = nMonto(montos[String(f.id)])
    if (actual > 0) { set(f.id, ''); return }
    const libre = r2(totalMax - v.suma)
    const m = r2(Math.min(topeDe(f, topeExtra), Math.max(0, libre)))
    set(f.id, m > 0 ? String(m) : '')
  }

  if (cargando) return <div className="text-xs text-gris-dark italic py-2">Buscando las facturas abiertas del proveedor…</div>
  if (facturas.length === 0) {
    return (
      <div className="text-xs text-gris-dark italic py-2">
        El proveedor no tiene facturas abiertas: la nota de crédito queda como crédito a favor.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="border border-gris-mid rounded overflow-hidden">
        {facturas.map(f => {
          const tope = topeDe(f, topeExtra)
          const err = v.errores[f.id]
          const tiene = nMonto(montos[String(f.id)]) > 0
          return (
            <div key={f.id} className={`flex items-center gap-2 flex-wrap border-b border-gris last:border-0 px-2.5 py-1.5 ${tiene ? 'bg-[#EEE8FF]/40' : ''}`}>
              <div className="flex-1 min-w-[180px]">
                <div className="text-xs font-semibold font-mono">{comprobanteTxt(f.tipo_comprobante, f.numero)}</div>
                <div className="text-[11px] text-gris-dark">
                  {fmtFecha(f.fecha)}{f.descripcion ? ` · ${f.descripcion}` : ''}
                </div>
                <div className="text-[11px] text-gris-dark">
                  Se puede acreditar hasta <b className="font-mono">{fmtM(tope)}</b> de {fmtM(f.total)}
                  {f.estado === 'pendiente' || f.estado === 'observada' ? ' · factura sin aprobar' : ''}
                </div>
              </div>
              <button type="button" disabled={disabled || (tope <= 0 && !tiene)}
                onClick={() => completar(f)}
                className="text-[11px] px-2 py-1 rounded border border-gris-mid bg-white hover:bg-gris disabled:opacity-50"
                title={tiene ? 'Sacar esta factura' : 'Acreditar lo que entra en esta factura'}>
                {tiene ? 'Quitar' : 'Completar'}
              </button>
              <div className="w-32">
                <InputMonto value={montos[String(f.id)] ?? ''} onChange={val => set(f.id, val)} disabled={disabled}
                  placeholder="0" className={`font-mono text-right py-1.5 rounded ${err ? '!border-rojo' : ''}`} />
                {err && <div className="text-[10px] text-rojo text-right">{err}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 flex-wrap text-xs">
        <span>Acredita <b className="font-mono tabular-nums">{fmtM(v.suma)}</b> de {fmtM(totalMax)}</span>
        {v.excedeTotal
          ? <span className="text-rojo font-semibold">Se pasa por {fmtM(r2(v.suma - totalMax))}</span>
          : v.resto > 0 && (
            <span className="text-[#5A2D82]">
              {fmtM(v.resto)} {etiquetaResto ?? 'queda como crédito a favor del proveedor'}
            </span>
          )}
      </div>
    </div>
  )
}
