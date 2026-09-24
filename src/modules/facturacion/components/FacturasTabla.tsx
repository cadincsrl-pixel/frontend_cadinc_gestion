'use client'

import { Button } from '@/components/ui/Button'
import { ESTADO_META, cortoTipo, fmtDoc, fmtFecha, fmtM, numeroTxt, obraDeFactura } from '../utils/facturacion.utils'
import type { VentasFactura } from '@/types/domain.types'
import { EstadoCobroBadge } from './cobranzas/Comun'

/**
 * La lista de comprobantes: tabla en pantalla grande, tarjetas en el celular.
 *
 * Lo que cada fila contesta de un vistazo: qué comprobante, a quién, cuánto,
 * de qué (obra o transporte, y qué obra: es el centro de costo) y en qué estado. El estado
 * «sin confirmar» (error_reconciliar) va en ROJO con su botón: mientras exista,
 * el talonario está trabado y nadie más puede emitir.
 */

interface Props {
  items:          VentasFactura[]
  onAbrir:        (id: number) => void
  onVerificar:    (id: number) => void
  verificandoId:  number | null
  /** /reconciliar pide emitir_notas_credito si es NC y emitir_facturas si es factura. */
  emitirFacturas:     boolean
  emitirNotasCredito: boolean
}

export function EstadoBadge({ f }: { f: Pick<VentasFactura, 'estado'> }) {
  const meta = ESTADO_META[f.estado]
  return (
    <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded ${meta.badge}`} title={meta.hint}>
      {meta.label}
    </span>
  )
}

function Extras({ f }: { f: VentasFactura }) {
  return (
    <>
      {f.es_homologacion && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000] font-bold"
              title="Emitida en homologación: sin validez fiscal">homologación</span>
      )}
      {f.es_nc && f.asociada_numero_fmt && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold"
              title="Factura que corrige esta nota de crédito">s/ {cortoTipo(f.asociada_cbte_tipo)} {f.asociada_numero_fmt}</span>
      )}
      {!f.es_nc && Number(f.nc_autorizadas) > 0 && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold"
              title="Notas de crédito autorizadas contra esta factura">NC {fmtM(f.nc_autorizadas)}</span>
      )}
    </>
  )
}

/**
 * Saldo de cobro (v_ventas_facturas.cobro_*, 20260924m). Solo en
 * autorizadas: un borrador no se debe todavía. En una NC, el saldo es el
 * crédito libre (lo que su factura no absorbió).
 */
export function CobroCelda({ f }: { f: VentasFactura }) {
  if (f.estado !== 'autorizada' || f.cobro_saldo == null) return <span className="text-gris-mid">—</span>
  const saldo = Number(f.cobro_saldo)
  if (f.es_nc) {
    return saldo > 0
      ? <span className="text-[11px] text-naranja-dark font-semibold" title="Crédito libre: se compensa contra otra factura">{fmtM(saldo)} libre</span>
      : <span className="text-gris-mid">—</span>
  }
  return <span className="font-mono tabular-nums">{fmtM(saldo)}</span>
}

function Verificar({ f, onVerificar, verificandoId, emitirFacturas, emitirNotasCredito }: {
  f: VentasFactura; onVerificar: (id: number) => void; verificandoId: number | null
  emitirFacturas: boolean; emitirNotasCredito: boolean
}) {
  if (f.estado !== 'error_reconciliar' && f.estado !== 'emitiendo') return null
  const puedeVerificar = f.es_nc ? emitirNotasCredito : emitirFacturas
  return (
    <Button size="sm" variant="danger" onClick={() => onVerificar(f.id)}
      loading={verificandoId === f.id}
      disabled={!puedeVerificar}
      title={puedeVerificar
        ? 'Preguntarle a ARCA si autorizó este número'
        : `Hace falta el permiso de emitir ${f.es_nc ? 'notas de crédito' : 'facturas'} para verificar en ARCA`}>
      Verificar en ARCA
    </Button>
  )
}

export function FacturasTabla({ items, onAbrir, onVerificar, verificandoId, emitirFacturas, emitirNotasCredito }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">
        No hay comprobantes con estos filtros.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      {/* ── Tabla (md o más) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[1120px]">
          <thead>
            <tr>
              {['Comprobante', 'Cliente', 'Fecha', 'Producto / obra', 'Neto', 'Total', 'Saldo', 'Estado', ''].map((h, i) => (
                <th key={h + i}
                  className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i === 4 || i === 5 || i === 6 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(f => (
              <tr key={f.id} className={`border-t border-gris hover:bg-azul-light/30 ${f.estado === 'error_reconciliar' ? 'bg-rojo-light/60' : ''} ${f.estado === 'descartada' ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2 text-sm cursor-pointer" onClick={() => onAbrir(f.id)}>
                  <div className="font-mono font-semibold whitespace-nowrap">{numeroTxt(f)}</div>
                  <div className="flex gap-1 flex-wrap mt-0.5"><Extras f={f} /></div>
                </td>
                <td className="px-3 py-2 text-sm cursor-pointer" onClick={() => onAbrir(f.id)}>
                  <div className="font-semibold">{f.rec_razon_social}</div>
                  <div className="text-[11px] text-gris-dark font-mono">{fmtDoc(f.rec_doc_tipo, f.rec_doc_nro)}</div>
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap cursor-pointer" onClick={() => onAbrir(f.id)}>{fmtFecha(f.fecha_cbte)}</td>
                <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => onAbrir(f.id)}>
                  <div className="font-semibold">{f.producto === 'TRANSPORTE' ? 'Transporte' : 'Avance de obra'}</div>
                  <div className="text-gris-dark truncate max-w-[260px]" title={obraDeFactura(f) ?? undefined}>{obraDeFactura(f) ?? '—'}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums cursor-pointer" onClick={() => onAbrir(f.id)}>
                  {f.es_nc ? '−' : ''}{fmtM(f.imp_neto)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold cursor-pointer" onClick={() => onAbrir(f.id)}>
                  {f.es_nc ? '−' : ''}{fmtM(f.imp_total)}
                </td>
                <td className="px-3 py-2 text-right text-xs cursor-pointer" onClick={() => onAbrir(f.id)}><CobroCelda f={f} /></td>
                <td className="px-3 py-2 cursor-pointer" onClick={() => onAbrir(f.id)}>
                  <div className="flex flex-col gap-0.5 items-start">
                    <EstadoBadge f={f} />
                    {f.estado === 'autorizada' && !f.es_nc && <EstadoCobroBadge estado={f.cobro_estado} />}
                  </div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex gap-1 justify-end items-center">
                    <Verificar f={f} onVerificar={onVerificar} verificandoId={verificandoId} emitirFacturas={emitirFacturas} emitirNotasCredito={emitirNotasCredito} />
                    <button type="button" onClick={() => onAbrir(f.id)}
                      className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold">
                      Abrir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (celular) ── */}
      <div className="md:hidden divide-y divide-gris">
        {items.map(f => (
          <div key={f.id} className={`p-3 ${f.estado === 'error_reconciliar' ? 'bg-rojo-light/60' : ''}`}>
            <div onClick={() => onAbrir(f.id)} className="cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{numeroTxt(f)}</div>
                  <div className="font-semibold text-sm truncate">{f.rec_razon_social}</div>
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  <EstadoBadge f={f} />
                  {f.estado === 'autorizada' && !f.es_nc && <EstadoCobroBadge estado={f.cobro_estado} />}
                </div>
              </div>
              {f.estado === 'autorizada' && !f.es_nc && f.cobro_saldo != null && Number(f.cobro_saldo) > 0 && (
                <div className="text-[11px] mt-1 text-gris-dark">
                  Debe {fmtM(f.cobro_saldo)}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 mt-1.5">
                <div className="text-[11px] text-gris-dark">
                  {fmtFecha(f.fecha_cbte)} · {f.producto === 'TRANSPORTE' ? 'Transporte' : (obraDeFactura(f) ?? 'Avance de obra')}
                </div>
                <div className="font-mono text-sm font-bold tabular-nums">{f.es_nc ? '−' : ''}{fmtM(f.imp_total)}</div>
              </div>
              <div className="flex gap-1 flex-wrap mt-1"><Extras f={f} /></div>
            </div>
            <div className="flex gap-2 mt-2">
              <Verificar f={f} onVerificar={onVerificar} verificandoId={verificandoId} emitirFacturas={emitirFacturas} emitirNotasCredito={emitirNotasCredito} />
              <button type="button" onClick={() => onAbrir(f.id)}
                className="flex-1 text-xs font-bold px-3 py-1.5 rounded bg-gris text-azul hover:bg-azul-light min-h-[36px]">
                Abrir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
