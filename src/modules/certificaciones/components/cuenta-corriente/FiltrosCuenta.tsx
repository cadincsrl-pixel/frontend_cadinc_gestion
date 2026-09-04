'use client'

import { useEffect, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import type { CuentaFiltro } from '../../hooks/useCuentaCorriente'
import type { CuentaEstado, CuentaGrupo, CuentaTipo, Obra } from '@/types/domain.types'
import { ESTADOS, GRUPOS } from './cuentaCorriente.utils'

/**
 * Barra de filtros de la cuenta corriente. Todos los filtros se componen
 * (AND) y viven en el padre; acá solo se dibujan. La búsqueda se aplica con
 * debounce porque es parte de la queryKey.
 */

interface Props {
  filtro:       CuentaFiltro
  patch:        (p: Partial<CuentaFiltro>) => void
  grupo:        CuentaGrupo
  onGrupo:      (g: CuentaGrupo) => void
  obras:        Obra[]
  proveedores:  { id: number; nombre: string }[]
  /** Conteos con los demás filtros puestos, para los chips. */
  conteoEstado: Record<CuentaEstado, number>
  conteoTipo:   Record<CuentaTipo, number>
  conteoTodos:  number
  conteoSinPrecio: number
}

const chip = (active: boolean, tone: 'azul' | 'naranja' = 'azul') =>
  `text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap min-h-[34px] ${
    active
      ? (tone === 'naranja' ? 'bg-naranja text-white shadow-sm' : 'bg-azul text-white shadow-sm')
      : 'bg-gris text-gris-dark hover:text-carbon hover:bg-white'
  }`

const cnt = (active: boolean) =>
  `text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${active ? 'bg-white/20' : 'bg-white border border-gris-mid text-carbon'}`

export function FiltrosCuenta({ filtro, patch, grupo, onGrupo, obras, proveedores, conteoEstado, conteoTipo, conteoTodos, conteoSinPrecio }: Props) {
  const [q, setQ] = useState(filtro.q ?? '')
  useEffect(() => {
    const t = setTimeout(() => { if ((filtro.q ?? '') !== q.trim()) patch({ q: q.trim() || undefined }) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const estados = filtro.estados ?? []
  const obrasVisibles = obras.filter(o => !o.archivada || filtro.archivadas || o.cod === filtro.obra_cod)
  const obraOptions = [
    { value: '', label: '— Todas las obras —' },
    ...obrasVisibles.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}${o.archivada ? ' (archivada)' : ''}` })),
  ]

  function toggleEstado(e: CuentaEstado) {
    const next = estados.includes(e) ? estados.filter(x => x !== e) : [...estados, e]
    patch({ estados: next.length ? next : undefined })
  }

  const hayFiltros = !!(filtro.q || estados.length || filtro.tipo || filtro.sin_precio || filtro.proveedor_id || filtro.origen || filtro.desde || filtro.hasta)

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-3">

      {/* Obra + buscador + archivadas */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-[240px] flex-1 max-w-md">
          <Combobox
            placeholder="— Todas las obras —"
            options={obraOptions}
            value={filtro.obra_cod ?? ''}
            onChange={v => patch({ obra_cod: v || undefined })}
          />
        </div>
        <div className="relative min-w-[220px] flex-1 max-w-lg">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-mid text-xs pointer-events-none">🔍</span>
          <input
            type="text"
            autoComplete="off"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Material, proveedor, obra, pedido o factura…"
            className="w-full pl-8 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-mid hover:text-rojo text-xs font-bold">✕</button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer whitespace-nowrap">
          <input type="checkbox" className="accent-azul" checked={!!filtro.archivadas} onChange={e => patch({ archivadas: e.target.checked || undefined })} />
          Incluir obras archivadas
        </label>
      </div>

      {/* Estado + tipo + sin precio */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-gris rounded-xl p-1 overflow-x-auto max-w-full">
          <button type="button" onClick={() => patch({ estados: undefined })} className={chip(estados.length === 0)} title="Todos los renglones">
            Todos <span className={cnt(estados.length === 0)}>{conteoTodos}</span>
          </button>
          {ESTADOS.map(e => {
            const active = estados.includes(e.key)
            return (
              <button key={e.key} type="button" onClick={() => toggleEstado(e.key)} className={chip(active)} title={e.hint}>
                {e.label} <span className={cnt(active)}>{conteoEstado[e.key]}</span>
              </button>
            )
          })}
        </div>
        <div className="flex gap-1 bg-gris rounded-xl p-1">
          {(['material', 'epp'] as const).map(t => {
            const active = filtro.tipo === t
            return (
              <button key={t} type="button" onClick={() => patch({ tipo: active ? undefined : t })} className={chip(active)} title={t === 'epp' ? 'Elementos de protección personal' : 'Todo lo que no es EPP'}>
                {t === 'epp' ? 'EPP' : 'Material'} <span className={cnt(active)}>{conteoTipo[t]}</span>
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => patch({ sin_precio: filtro.sin_precio ? undefined : true })} className={chip(!!filtro.sin_precio, 'naranja')} title="Solo renglones sin precio (a tasar)">
          ⚠ Sin precio <span className={cnt(!!filtro.sin_precio)}>{conteoSinPrecio}</span>
        </button>
      </div>

      {/* Proveedor, origen, período, agrupar */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <select
          value={filtro.proveedor_id ?? ''}
          onChange={e => patch({ proveedor_id: e.target.value ? Number(e.target.value) : undefined })}
          className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1.5 bg-white outline-none focus:border-naranja min-h-[34px] max-w-[220px]"
        >
          <option value="">Proveedor: todos</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select
          value={filtro.origen ?? ''}
          onChange={e => patch({ origen: (e.target.value || undefined) as CuentaFiltro['origen'] })}
          className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1.5 bg-white outline-none focus:border-naranja min-h-[34px]"
        >
          <option value="">Origen: todos</option>
          <option value="proveedor">Comprado a proveedor</option>
          <option value="deposito">Despachado del depósito</option>
        </select>
        <label className="flex items-center gap-1 text-gris-dark">
          Desde
          <input type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })}
            className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1 bg-white outline-none focus:border-naranja min-h-[34px] text-carbon" />
        </label>
        <label className="flex items-center gap-1 text-gris-dark">
          Hasta
          <input type="date" value={filtro.hasta ?? ''} onChange={e => patch({ hasta: e.target.value || undefined })}
            className="border-[1.5px] border-gris-mid rounded-lg px-2 py-1 bg-white outline-none focus:border-naranja min-h-[34px] text-carbon" />
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-gris-dark">Agrupar por</span>
          <div className="flex gap-1 bg-gris rounded-xl p-1">
            {GRUPOS.map(g => (
              <button key={g.key} type="button" onClick={() => onGrupo(g.key)} className={chip(grupo === g.key)}>{g.label}</button>
            ))}
          </div>
        </div>
        {hayFiltros && (
          <button type="button" className="text-azul font-bold hover:underline"
            onClick={() => { setQ(''); patch({ q: undefined, estados: undefined, tipo: undefined, sin_precio: undefined, proveedor_id: undefined, origen: undefined, desde: undefined, hasta: undefined }) }}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
