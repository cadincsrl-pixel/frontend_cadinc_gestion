'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useObrasFacturacion, type FacturasFiltro } from '../hooks/useFacturacion'
import { useClientesVenta } from '../hooks/useClientesFacturacion'
import { ESTADOS, PRODUCTOS, TIPOS_CBTE, fmtCuit } from '../utils/facturacion.utils'
import type { VentasCbteTipo, VentasEstado, VentasProducto } from '@/types/domain.types'

/**
 * La barra de filtros de la bandeja. Todo va al server: acá solo se arma el
 * objeto. Estado y búsqueda a la vista; lo demás detrás de «Más filtros».
 */

interface Props {
  filtro: FacturasFiltro
  patch:  (p: Partial<FacturasFiltro>) => void
}

const selCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja'
const lblCls = 'block text-xs font-semibold text-gris-dark mb-1'

export function FiltrosFacturas({ filtro, patch }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(filtro.q ?? '')

  const clientes = useClientesVenta('', true)
  const obras = useObrasFacturacion()

  const opcionesCliente = useMemo(
    () => (clientes.data ?? []).map(c => ({
      value: String(c.id),
      label: c.razon_social,
      sub:   [fmtCuit(c.doc_nro), c.activo ? null : 'dado de baja'].filter(Boolean).join(' · ') || undefined,
      search: [c.razon_social, c.doc_nro],
    })),
    [clientes.data],
  )
  // La obra es el centro de costo (23/09).
  const opcionesObra = useMemo(
    () => (obras.data ?? []).map(o => ({
      value: o.cod,
      label: `${o.cod} — ${o.nom}`,
      sub: o.cliente_nom ?? undefined,
      search: [o.nom, o.cod, o.cliente_nom ?? ''],
    })),
    [obras.data],
  )

  const hayExtra = !!(filtro.cbte_tipo || filtro.cliente_id || filtro.obra_cod || filtro.producto || filtro.desde || filtro.hasta)

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-3">
      {/* Estado */}
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={() => patch({ estado: undefined })}
          className={`text-xs px-2.5 py-1.5 rounded border font-semibold transition ${!filtro.estado
            ? 'border-naranja bg-naranja-light text-naranja-dark' : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}>
          Todos
        </button>
        {ESTADOS.map(e => (
          <button key={e.key} type="button" title={e.hint}
            onClick={() => patch({ estado: filtro.estado === e.key ? undefined : (e.key as VentasEstado) })}
            className={`text-xs px-2.5 py-1.5 rounded border font-semibold transition ${filtro.estado === e.key
              ? 'border-naranja bg-naranja-light text-naranja-dark' : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}>
            {e.label}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="flex gap-2 flex-wrap items-center">
        <form className="flex-1 min-w-[200px] flex gap-1"
          onSubmit={ev => { ev.preventDefault(); patch({ q: texto.trim() || undefined }) }}>
          <input value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por número, cliente, CUIT, obra, CAE, observaciones…"
            className="flex-1 min-w-0 px-2.5 py-1.5 border-[1.5px] border-gris-mid rounded text-xs outline-none bg-white focus:border-naranja" />
          <Button type="submit" variant="secondary" size="sm">Buscar</Button>
          {filtro.q && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setTexto(''); patch({ q: undefined }) }}>✕</Button>
          )}
        </form>
        <Button variant="ghost" size="sm" onClick={() => setAbierto(a => !a)}>
          {abierto ? '▴ Menos filtros' : '▾ Más filtros'}{hayExtra && !abierto ? ' •' : ''}
        </Button>
      </div>

      {abierto && (
        <div className="border-t border-gris pt-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Combobox label="Cliente" placeholder="Todos" options={opcionesCliente}
              value={filtro.cliente_id ? String(filtro.cliente_id) : ''}
              onChange={v => patch({ cliente_id: v ? Number(v) : undefined })} />
            <Combobox label="Obra" placeholder="Todas" options={opcionesObra}
              value={filtro.obra_cod ?? ''}
              onChange={v => patch({ obra_cod: v || undefined })} />
            <div>
              <label className={lblCls}>Tipo</label>
              <select className={selCls} value={filtro.cbte_tipo ?? ''}
                onChange={e => patch({ cbte_tipo: e.target.value ? (Number(e.target.value) as VentasCbteTipo) : undefined })}>
                <option value="">Todos</option>
                {TIPOS_CBTE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lblCls}>Producto</label>
              <select className={selCls} value={filtro.producto ?? ''}
                onChange={e => patch({ producto: (e.target.value || undefined) as VentasProducto | undefined })}>
                <option value="">Todos</option>
                {PRODUCTOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lblCls}>Fecha desde</label>
              <input type="date" className={selCls} value={filtro.desde ?? ''}
                onChange={e => patch({ desde: e.target.value || undefined })} />
            </div>
            <div>
              <label className={lblCls}>Fecha hasta</label>
              <input type="date" className={selCls} value={filtro.hasta ?? ''}
                onChange={e => patch({ hasta: e.target.value || undefined })} />
            </div>
          </div>
          {hayExtra && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => patch({
                cbte_tipo: undefined, cliente_id: undefined, obra_cod: undefined, producto: undefined,
                desde: undefined, hasta: undefined,
              })}>
                ✕ Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
