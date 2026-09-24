'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { useCatalogoObrasPagos, type PagosFacturasFiltro, type PagosVencimiento } from '../hooks/usePagos'
import { ESTADOS_FACTURA, FORMAS_PREVISTAS, TIPOS_COMPROBANTE, fmtM } from '../utils/pagos.utils'
import type { PagosEstadoFactura, PagosResumenGrupo } from '@/types/domain.types'

/**
 * La barra de filtros de la bandeja. Todo va al server: acá solo se arma el
 * objeto.
 *
 * Los chips de estado muestran CUÁNTO hay en cada uno con el resto de los
 * filtros puestos — el resumen se pide sin `estados` justamente para eso. Sin
 * ese número, elegir un estado es a ciegas.
 */

interface Props {
  filtro: PagosFacturasFiltro
  patch:  (p: Partial<PagosFacturasFiltro>) => void
  grupos: PagosResumenGrupo[]
}

const VENCIMIENTOS: { key: PagosVencimiento; label: string; hint: string }[] = [
  { key: 'vencidas', label: 'Vencidas',    hint: 'Pasó el vencimiento y todavía deben plata' },
  { key: '7',        label: 'Vence en 7',  hint: 'Vencen dentro de los próximos 7 días' },
  { key: '30',       label: 'Vence en 30', hint: 'Vencen dentro de los próximos 30 días' },
  { key: 'todas',    label: 'Todas',       hint: 'Sin filtrar por vencimiento (incluye las que no tienen)' },
]

export function FiltrosFacturas({ filtro, patch, grupos }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(filtro.q ?? '')

  const proveedores = useProveedoresPagos({}, 1, 300)
  const obras = useCatalogoObrasPagos()

  // Un mapa estado → {facturas, saldo} para los chips.
  const porEstado = useMemo(() => {
    const m = new Map<string, { facturas: number; saldo: number }>()
    for (const g of grupos) {
      const prev = m.get(g.grupo) ?? { facturas: 0, saldo: 0 }
      m.set(g.grupo, { facturas: prev.facturas + g.facturas, saldo: prev.saldo + Number(g.saldo ?? 0) })
    }
    return m
  }, [grupos])

  const estadosSel = filtro.estados ?? []
  function toggleEstado(k: PagosEstadoFactura) {
    const s = new Set(estadosSel)
    if (s.has(k)) s.delete(k); else s.add(k)
    patch({ estados: s.size ? [...s] : undefined })
  }

  const opcionesProveedor = useMemo(
    () => (proveedores.data?.items ?? [])
      .map(p => ({
        value: String(p.id),
        label: p.razon_social,
        sub:   [p.cuit, p.activo ? null : 'dado de baja'].filter(Boolean).join(' · ') || undefined,
        search: [p.razon_social, p.cuit ?? ''],
      })),
    [proveedores.data],
  )

  // Las obras internas primero y agrupadas aparte: es la decisión de que cada
  // una sea su propio centro de costo, y así se lee al filtrar.
  const opcionesObra = useMemo(
    () => (obras.data ?? []).map(o => ({
      value: o.cod,
      label: o.nom,
      sub:   o.cod + (o.archivada ? ' · archivada' : ''),
      group: o.es_interna || o.es_deposito ? 'Estructura CADINC' : 'Obras',
      search: [o.nom, o.cod, o.cc ?? ''],
    })),
    [obras.data],
  )

  const hayFiltrosExtra = !!(
    filtro.q || filtro.obra_cod || filtro.centro_costo || filtro.tipo || filtro.forma_pago ||
    filtro.desde || filtro.hasta || filtro.sin_adjunto || filtro.sin_numero || filtro.sin_revisar || filtro.sin_desglose ||
    filtro.cuenta_cambiada || filtro.paga_cliente !== undefined || filtro.pagada_al_cargar !== undefined ||
    filtro.es_interna !== undefined || filtro.anuladas
  )

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-3">

      {/* Chips de estado con su plata */}
      <div className="flex gap-2 flex-wrap">
        {ESTADOS_FACTURA.map(e => {
          const datos = porEstado.get(e.key)
          const activo = estadosSel.includes(e.key)
          if (!datos && e.key === 'anulada' && !activo) return null   // no ensuciar si no hay anuladas
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => toggleEstado(e.key)}
              title={e.hint}
              className={`px-2.5 py-1.5 rounded-card border text-left transition min-w-[104px]
                ${activo ? 'border-naranja bg-naranja-light/40' : 'border-gris-mid bg-white hover:bg-gris/40'}`}
            >
              <div className={`text-[11px] font-bold ${e.badge} inline-block px-1.5 rounded`}>{e.label}</div>
              <div className="font-mono text-xs font-bold tabular-nums mt-0.5">{fmtM(datos?.saldo ?? 0)}</div>
              <div className="text-[10px] text-gris-dark">{datos?.facturas ?? 0} factura{(datos?.facturas ?? 0) === 1 ? '' : 's'}</div>
            </button>
          )
        })}
      </div>

      {/* Vencimiento + búsqueda */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1">
          {VENCIMIENTOS.map(v => (
            <button
              key={v.key}
              type="button"
              title={v.hint}
              onClick={() => patch({ vencimiento: filtro.vencimiento === v.key ? undefined : v.key })}
              className={`text-xs px-2.5 py-1.5 rounded border font-semibold transition
                ${filtro.vencimiento === v.key
                  ? 'border-naranja bg-naranja-light text-naranja-dark'
                  : 'border-gris-mid bg-white text-gris-dark hover:bg-gris/40'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <form
          className="flex-1 min-w-[200px] flex gap-1"
          onSubmit={ev => { ev.preventDefault(); patch({ q: texto.trim() || undefined }) }}
        >
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por proveedor, número, descripción…"
            className="flex-1 min-w-0 px-2.5 py-1.5 border-[1.5px] border-gris-mid rounded text-xs outline-none bg-white focus:border-naranja"
          />
          <Button type="submit" variant="secondary" size="sm">Buscar</Button>
          {filtro.q && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setTexto(''); patch({ q: undefined }) }}>✕</Button>
          )}
        </form>

        <Button variant="ghost" size="sm" onClick={() => setAbierto(a => !a)}>
          {abierto ? '▴ Menos filtros' : '▾ Más filtros'}{hayFiltrosExtra && !abierto ? ' •' : ''}
        </Button>
      </div>

      {/* Filtros finos */}
      {abierto && (
        <div className="border-t border-gris pt-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Combobox
              label="Proveedor"
              placeholder="Todos"
              options={opcionesProveedor}
              value={filtro.proveedor_id ? String(filtro.proveedor_id) : ''}
              onChange={v => patch({ proveedor_id: v ? Number(v) : undefined })}
            />
            <Combobox
              label="Obra (centro de costo)"
              placeholder="Todas"
              options={opcionesObra}
              value={filtro.obra_cod ?? ''}
              onChange={v => patch({ obra_cod: v || undefined })}
            />
            <div>
              <label className="block text-xs font-semibold text-gris-dark mb-1">Tipo</label>
              <select
                value={filtro.tipo ?? ''}
                onChange={e => patch({ tipo: (e.target.value || undefined) as PagosFacturasFiltro['tipo'] })}
                className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja"
              >
                <option value="">Todos</option>
                {TIPOS_COMPROBANTE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gris-dark mb-1">Forma prevista</label>
              <select
                value={filtro.forma_pago ?? ''}
                onChange={e => patch({ forma_pago: (e.target.value || undefined) as PagosFacturasFiltro['forma_pago'] })}
                className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja"
              >
                <option value="">Todas</option>
                {FORMAS_PREVISTAS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gris-dark mb-1">Emitida desde</label>
              <input type="date" value={filtro.desde ?? ''} onChange={e => patch({ desde: e.target.value || undefined })}
                className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gris-dark mb-1">Emitida hasta</label>
              <input type="date" value={filtro.hasta ?? ''} onChange={e => patch({ hasta: e.target.value || undefined })}
                className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gris-dark mb-1">Ordenar por</label>
              <select
                value={filtro.orden ?? 'vencimiento'}
                onChange={e => patch({ orden: e.target.value as PagosFacturasFiltro['orden'] })}
                className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja"
              >
                <option value="vencimiento">Vencimiento</option>
                <option value="fecha">Fecha de emisión</option>
                <option value="saldo">Saldo</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap text-xs">
            <Tilde label="Sin adjunto"           hint="Todavía no tiene el PDF de la factura"
                   on={!!filtro.sin_adjunto}     set={v => patch({ sin_adjunto: v || undefined })} />
            <Tilde label="Sin número"            hint="Se cargó sin número de comprobante"
                   on={!!filtro.sin_numero}      set={v => patch({ sin_numero: v || undefined })} />
            <Tilde label="Pagadas sin revisar"   hint="Se cargaron ya pagadas y ningún aprobador las selló"
                   on={!!filtro.sin_revisar}     set={v => patch({ sin_revisar: v || undefined })} />
            <Tilde label="Sin desglose"          hint="Sin IVA discriminado (o marcado a revisar): le falta al Libro IVA de compras"
                   on={!!filtro.sin_desglose}    set={v => patch({ sin_desglose: v || undefined })} />
            <Tilde label="Cambió el CBU"         hint="El CBU del proveedor cambió después de que se aprobó"
                   on={!!filtro.cuenta_cambiada} set={v => patch({ cuenta_cambiada: v || undefined })} />
            <Tilde label="Las paga el cliente"   hint="No son deuda de CADINC"
                   on={filtro.paga_cliente === true} set={v => patch({ paga_cliente: v ? true : undefined })} />
            <Tilde label="Solo internas"         hint="Imputadas a una obra interna o al depósito"
                   on={filtro.es_interna === true} set={v => patch({ es_interna: v ? true : undefined })} />
            <Tilde label="Incluir anuladas"      hint="Por default no se muestran"
                   on={!!filtro.anuladas}        set={v => patch({ anuladas: v || undefined })} />
            <Tilde label="Incluir obras archivadas" hint="Facturas de obras ya cerradas"
                   on={!!filtro.archivadas}      set={v => patch({ archivadas: v || undefined })} />
          </div>

          {hayFiltrosExtra && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => { setTexto(''); patch({
                q: undefined, obra_cod: undefined, centro_costo: undefined, tipo: undefined, forma_pago: undefined,
                desde: undefined, hasta: undefined, sin_adjunto: undefined, sin_numero: undefined,
                sin_revisar: undefined, sin_desglose: undefined, cuenta_cambiada: undefined, paga_cliente: undefined,
                pagada_al_cargar: undefined, es_interna: undefined, anuladas: undefined, archivadas: undefined,
              }) }}>
                ✕ Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Tilde({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none text-gris-dark" title={hint}>
      <input type="checkbox" className="accent-naranja" checked={on} onChange={e => set(e.target.checked)} />
      {label}
    </label>
  )
}
