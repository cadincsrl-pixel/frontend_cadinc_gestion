'use client'

import { Button } from '@/components/ui/Button'
import { ESTADO_META, fmtCuit, fmtFecha, fmtM, numeroTxt } from '../utils/facturacion.utils'
import type { VentasFactura } from '@/types/domain.types'

/**
 * La lista de comprobantes: tabla en pantalla grande, tarjetas en el celular.
 *
 * Lo que cada fila contesta de un vistazo: qué comprobante, a quién, cuánto,
 * de qué (obra o transporte, y el centro de costo) y en qué estado. El estado
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
              title="Factura que corrige esta nota de crédito">s/ FA {f.asociada_numero_fmt}</span>
      )}
      {!f.es_nc && Number(f.nc_autorizadas) > 0 && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold"
              title="Notas de crédito autorizadas contra esta factura">NC {fmtM(f.nc_autorizadas)}</span>
      )}
      {f.estado === 'autorizada' && (f.numero_finnegans
        ? <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold"
                title={`Registrada en Finnegans${f.registrada_por_nombre ? ` por ${f.registrada_por_nombre}` : ''}`}>✓ Finnegans {f.numero_finnegans}</span>
        : <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark"
                title="Falta cargarla en Finnegans">sin Finnegans</span>)}
    </>
  )
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
        <table className="w-full border-collapse min-w-[960px]">
          <thead>
            <tr>
              {['Comprobante', 'Cliente', 'Fecha', 'Producto / centro de costo', 'Neto', 'Total', 'Estado', ''].map((h, i) => (
                <th key={h + i}
                  className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i === 4 || i === 5 ? 'text-right' : 'text-left'}`}>
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
                  <div className="text-[11px] text-gris-dark font-mono">{fmtCuit(f.rec_doc_nro)}</div>
                  {f.obra_nom && <div className="text-[11px] text-gris-dark truncate max-w-[240px]">{f.obra_nom}</div>}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap cursor-pointer" onClick={() => onAbrir(f.id)}>{fmtFecha(f.fecha_cbte)}</td>
                <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => onAbrir(f.id)}>
                  <div className="font-semibold">{f.producto === 'TRANSPORTE' ? 'Transporte' : 'Avance de obra'}</div>
                  <div className="text-gris-dark">{f.centro_costo ?? '—'}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums cursor-pointer" onClick={() => onAbrir(f.id)}>
                  {f.es_nc ? '−' : ''}{fmtM(f.imp_neto)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold cursor-pointer" onClick={() => onAbrir(f.id)}>
                  {f.es_nc ? '−' : ''}{fmtM(f.imp_total)}
                </td>
                <td className="px-3 py-2 cursor-pointer" onClick={() => onAbrir(f.id)}><EstadoBadge f={f} /></td>
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
                <EstadoBadge f={f} />
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-1.5">
                <div className="text-[11px] text-gris-dark">
                  {fmtFecha(f.fecha_cbte)} · {f.producto === 'TRANSPORTE' ? 'Transporte' : (f.centro_costo ?? 'Avance de obra')}
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
