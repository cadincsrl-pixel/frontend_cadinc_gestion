'use client'

import type { CuentaRenglon } from '@/types/domain.types'
import { ESTADO_META, MOTIVO_LABEL, fmtM, fmtFecha } from './cuentaCorriente.utils'

/**
 * Lista de renglones (una página) con el estado de cada uno. En pantallas
 * chicas se muestran tarjetas.
 */

interface Props {
  items:       CuentaRenglon[]
  mostrarObra: boolean
  vacio:       string
}

function EstadoBadge({ r }: { r: CuentaRenglon }) {
  const m = ESTADO_META[r.estado]
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.badge}`} title={m.hint}>{m.label}</span>
      {r.estado === 'gasto_cadinc' && r.motivo_cadinc && (
        <span className="text-[9px] text-gris-dark uppercase tracking-wide">{MOTIVO_LABEL[r.motivo_cadinc]}</span>
      )}
      {r.estado === 'cobrado' && r.cobro_id != null && (
        <span className="text-[9px] text-gris-dark">pago N° {r.cobro_id}</span>
      )}
    </span>
  )
}

function Precio({ r }: { r: CuentaRenglon }) {
  return Number(r.precio_unit) > 0
    ? <span className="font-mono text-xs">{fmtM(Number(r.precio_unit))}</span>
    : <span className="text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded whitespace-nowrap">SIN PRECIO</span>
}

function Factura({ r }: { r: CuentaRenglon }) {
  if (!r.factura_adjunto_url) return <span className="text-gris-mid text-xs">{r.factura_numero ?? '—'}</span>
  return (
    <a href={r.factura_adjunto_url} target="_blank" rel="noopener" className="text-azul hover:underline text-xs font-bold whitespace-nowrap">
      📎 {r.factura_numero || 'Ver'}
    </a>
  )
}

const th = (align: 'left' | 'right' | 'center' = 'left') =>
  `text-${align} px-3 py-2 text-[10px] font-bold text-gris-dark uppercase tracking-wider whitespace-nowrap bg-gris`

export function RenglonesTabla({ items, mostrarObra, vacio }: Props) {
  if (items.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-gris-dark italic">{vacio}</div>
  }
  return (
    <>
      {/* Tabla — desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr>
              <th className={th()}>Fecha</th>
              <th className={th()}>Pedido</th>
              <th className={th()}>Material{mostrarObra ? ' · obra' : ''}</th>
              <th className={th('right')}>Cant.</th>
              <th className={th()}>Proveedor</th>
              <th className={th('right')}>P. unit.</th>
              <th className={th('right')}>Total</th>
              <th className={th('center')}>Estado</th>
              <th className={th('center')}>Factura</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className={`border-t border-gris ${Number(r.precio_unit) === 0 ? 'bg-naranja-light/15' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{fmtFecha(r.fecha_resolucion)}</td>
                <td className="px-3 py-2 font-mono text-xs text-gris-dark whitespace-nowrap">#{r.solicitud_id}</td>
                <td className="px-3 py-2">
                  <div className="text-sm">{r.descripcion}</div>
                  {mostrarObra && <div className="text-[10px] text-gris-dark"><span className="font-bold">{r.obra_nom}</span> <span className="font-mono">{r.obra_cod}</span></div>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                  {Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.origen === 'deposito'
                    ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-naranja-light text-naranja">Depósito</span>
                    : (r.proveedor_nom ?? <span className="text-gris-mid">—</span>)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><Precio r={r} /></td>
                <td className="px-3 py-2 text-right font-mono text-sm font-bold whitespace-nowrap">{fmtM(Number(r.precio_total ?? 0))}</td>
                <td className="px-3 py-2 text-center"><EstadoBadge r={r} /></td>
                <td className="px-3 py-2 text-center"><Factura r={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tarjetas — móvil */}
      <div className="md:hidden divide-y divide-gris">
        {items.map(r => (
          <div key={r.id} className={`p-3 ${Number(r.precio_unit) === 0 ? 'bg-naranja-light/15' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.descripcion}</div>
                <div className="text-[11px] text-gris-dark">
                  {fmtFecha(r.fecha_resolucion)} · #{r.solicitud_id} · {Number(r.cantidad).toLocaleString('es-AR')} {r.unidad}
                  {' · '}{r.origen === 'deposito' ? 'Depósito' : (r.proveedor_nom ?? 'sin proveedor')}
                </div>
                {mostrarObra && <div className="text-[11px] text-gris-dark font-bold">{r.obra_nom}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold">{fmtM(Number(r.precio_total ?? 0))}</div>
                <div className="text-[10px] text-gris-dark"><Precio r={r} /></div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <EstadoBadge r={r} />
              <Factura r={r} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
