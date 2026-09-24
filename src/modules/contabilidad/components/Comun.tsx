'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import type { CtbAsientoEstado } from '@/types/contabilidad.types'
import { ESTADO_ASIENTO } from '../utils/contabilidad.utils'

/** Piezas chicas que comparten las pantallas de Contabilidad. */

export function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris' | 'verde'; children: ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
    verde:    'bg-verde-light border-verde/30 text-verde',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}

export function Cifra({ label, valor, sub, tono = 'normal' }: {
  label: string; valor: string; sub?: string; tono?: 'normal' | 'rojo' | 'verde' | 'naranja'
}) {
  const color = { normal: 'text-azul', rojo: 'text-rojo', verde: 'text-verde', naranja: 'text-naranja-dark' }[tono]
  return (
    <div className="flex-1 min-w-[130px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-base sm:text-lg tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">{children}</div>
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">{texto}</div>
}

export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
      <span>{mensaje}</span>
      <Button size="sm" variant="secondary" onClick={onReintentar}>Reintentar</Button>
    </div>
  )
}

export function EstadoAsiento({ estado }: { estado: CtbAsientoEstado }) {
  const e = ESTADO_ASIENTO[estado]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${e.clase}`}>{e.label}</span>
}

export const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark disabled:cursor-not-allowed'

export function Campo({ label, hint, error, className, children }: {
  label: string; hint?: string; error?: string; className?: string; children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
        {label}{hint && <span className="font-normal normal-case tracking-normal"> · {hint}</span>}
      </label>
      {children}
      {error && <span className="text-xs text-rojo font-semibold">{error}</span>}
    </div>
  )
}

/** Desde / hasta, en una fila. */
export function RangoFechas({ desde, hasta, onChange }: {
  desde: string; hasta: string; onChange: (r: { desde: string; hasta: string }) => void
}) {
  return (
    <>
      <Campo label="Desde">
        <input type="date" value={desde} onChange={e => onChange({ desde: e.target.value, hasta })} className={inputCls} />
      </Campo>
      <Campo label="Hasta">
        <input type="date" value={hasta} min={desde || undefined} onChange={e => onChange({ desde, hasta: e.target.value })} className={inputCls} />
      </Campo>
    </>
  )
}

/** Tarjeta blanca con el estilo del resto del ERP. */
export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-card shadow-card ${className ?? ''}`}>{children}</div>
}

export function Th({ children, derecha, className }: { children?: ReactNode; derecha?: boolean; className?: string }) {
  return (
    <th className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${derecha ? 'text-right' : 'text-left'} ${className ?? ''}`}>
      {children}
    </th>
  )
}
