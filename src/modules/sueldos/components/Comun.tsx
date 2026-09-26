'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import type { AvisoCalculo, EstadoLiquidacion, EstadoRecibo } from '@/types/sueldos.types'
import { ESTADO_LIQ, ESTADO_RECIBO, avisoGrave, mensajeAviso } from '../utils/sueldos.utils'

/** Piezas chicas que comparten las pantallas de Sueldos. */

export function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris' | 'verde' | 'azul'; children: ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
    verde:    'bg-verde-light border-verde/30 text-verde',
    azul:     'bg-azul-light border-azul/20 text-azul',
  }[tono]
  return <div className={`border rounded-lg p-2 text-xs ${clases}`}>{children}</div>
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

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-card shadow-card ${className ?? ''}`}>{children}</div>
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

export function Th({ children, derecha, className }: { children?: ReactNode; derecha?: boolean; className?: string }) {
  return (
    <th className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${derecha ? 'text-right' : 'text-left'} ${className ?? ''}`}>
      {children}
    </th>
  )
}

export function Td({ children, derecha, className, colSpan }: { children?: ReactNode; derecha?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 border-t border-gris ${derecha ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''} ${className ?? ''}`}>
      {children}
    </td>
  )
}

export function EstadoLiq({ estado }: { estado: EstadoLiquidacion }) {
  const e = ESTADO_LIQ[estado]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${e.clase}`}>{e.label}</span>
}

export function EstadoRec({ estado }: { estado: EstadoRecibo }) {
  const e = ESTADO_RECIBO[estado]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap ${e.clase}`}>{e.label}</span>
}

/** Marca «a confirmar» (valor de convenio sin confirmar). */
export function MarcaAConfirmar({ titulo }: { titulo?: string }) {
  return (
    <span title={titulo ?? 'Valor a confirmar: se usa igual, pero hay que verificarlo contra la fuente oficial'}
      className="inline-block text-[9px] px-1 py-0.5 rounded bg-amarillo-light text-[#7A5000] font-bold uppercase tracking-wide whitespace-nowrap">
      ⚠ a confirmar
    </span>
  )
}

export function ListaAvisos({ avisos }: { avisos: AvisoCalculo[] }) {
  if (avisos.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {avisos.map((a, i) => (
        <Aviso key={`${a.codigo}-${i}`} tono={avisoGrave(a.codigo) ? 'rojo' : 'amarillo'}>{mensajeAviso(a)}</Aviso>
      ))}
    </div>
  )
}

/** Casilla con etiqueta, para formularios chicos. */
export function Check({ label, checked, onChange, disabled, title }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string
}) {
  return (
    <label title={title} className={`flex items-center gap-2 text-sm select-none ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="accent-naranja w-4 h-4" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
