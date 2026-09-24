'use client'

import { ESTADO_FACTURA_META, FORMAS_PREVISTAS, comprobanteTxt, esNC, estadoHint, estadoLabel, fmtFecha, fmtM } from '../utils/pagos.utils'
import type { PagosFactura } from '@/types/domain.types'
import { sinDesglose } from '../utils/desglose'

/**
 * La lista de facturas: tabla en pantalla grande, tarjetas en el celular.
 *
 * Lo que cada fila tiene que contestar de un vistazo: a quién, cuánto falta
 * pagar, para cuándo, CÓMO se paga, en qué estado está y si hay algo raro
 * (sin PDF, el CBU cambió después de aprobarse, se cargó ya pagada y nadie la
 * revisó).
 *
 * Una NOTA DE CRÉDITO (20260925) va en la misma lista con su chip «NC», el
 * total en negativo y, en vez de saldo, el crédito que le queda sin aplicar:
 * nunca es deuda.
 */

interface Props {
  items:            PagosFactura[]
  seleccion:        Set<number>
  onToggle:         (id: number) => void
  onToggleTodas:    () => void
  onAbrir:          (id: number) => void
  puedeSeleccionar: boolean
}

/** El código del proveedor, chiquito al lado de la razón social. */
function CodigoProveedor({ f }: { f: PagosFactura }) {
  if (!f.proveedor_codigo) return null
  return <span className="ml-1 font-mono text-[10px] font-normal text-gris-dark" title="Código del proveedor">{f.proveedor_codigo}</span>
}

/** El concepto de compra (20260925). Las viejas sin concepto no muestran nada. */
function ChipConcepto({ f }: { f: PagosFactura }) {
  if (!f.concepto) return null
  return (
    <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-azul/10 text-azul font-semibold"
          title="Concepto de la compra">{f.concepto}</span>
  )
}

/** Los avisos de la fila. Van juntos para que la tabla y la tarjeta no se separen. */
function Alertas({ f }: { f: PagosFactura }) {
  return (
    <>
      {f.sin_revisar && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000] font-bold"
              title="Se cargó ya pagada y ningún aprobador la revisó todavía">sin revisar</span>
      )}
      {f.cuenta_cambio_tras_aprobar && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-rojo-light text-rojo font-bold"
              title="El CBU o alias del proveedor cambió DESPUÉS de que se aprobó esta factura">⚠ cambió el CBU</span>
      )}
      {f.paga_cliente && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark"
              title="La paga el cliente directo al proveedor: no es deuda de CADINC">la paga el cliente</span>
      )}
      {sinDesglose(f) && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark"
              title={f.desglose_a_revisar ? 'El desglose de impuestos está marcado a revisar' : 'Falta el IVA discriminado: lo necesita el Libro IVA de compras'}>
          {f.desglose_a_revisar ? 'desglose a revisar' : 'sin desglose'}
        </span>
      )}
      {!f.tiene_factura_adj && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark"
              title="Todavía no se adjuntó el PDF de la factura">sin PDF</span>
      )}
      {/* El control del comprobante, también acá (20260921k): «si está todo ok
          y comprobado me debería aparecer en el menú principal también, con una
          tilde». Verlo sólo al abrir la factura obligaba a entrar una por una,
          que es justo lo que el control automático viene a evitar. */}
      {f.control_estado === 'coincide' && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold"
              title="El comprobante adjunto coincide con lo cargado (número, total y fecha)">✓ comprobante OK</span>
      )}
      {f.control_estado === 'difiere' && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-rojo-light text-rojo font-bold"
              title={f.control_nota || 'El comprobante no coincide con lo cargado'}>⚠ no coincide con el papel</span>
      )}
      {(f.control_estado === 'ilegible' || f.control_estado === 'error') && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000]"
              title={f.control_nota || 'No se pudo leer el comprobante: hay que revisarlo a mano'}>? sin controlar</span>
      )}
      {esNC(f) && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold"
              title={f.nc_txt ? `Nota de crédito ${f.nc_txt}` : 'Nota de crédito: queda como crédito a favor del proveedor'}>
          NC{f.nc_txt ? ` ${f.nc_txt}` : ''}
        </span>
      )}
      {!esNC(f) && Number(f.nc_pendiente ?? 0) > 0 && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]"
              title={`Una NC sin aprobar reserva ${fmtM(f.nc_pendiente)}: esa parte no se puede pagar con plata${f.nc_txt ? ` (${f.nc_txt})` : ''}`}>
          NC pendiente de aprobar {fmtM(f.nc_pendiente)}
        </span>
      )}
      {!esNC(f) && f.acreditado > 0 && (
        <span className="inline-block whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]"
              title={`Notas de crédito aplicadas por ${fmtM(f.acreditado)}${f.nc_txt ? ` · ${f.nc_txt}` : ''}`}>NC {fmtM(f.acreditado)}</span>
      )}
    </>
  )
}

/**
 * Cómo se va a pagar esta factura. Va en la LISTA y no sólo en la ficha
 * (2026-09-21): «lo más importante para pagar es la forma de pago y no la veo
 * muy a la vista». Quien mira la bandeja para pagar necesita saber, sin abrir
 * una por una, cuáles van por transferencia, cuáles con cheque y cuáles
 * quedaron en cuenta corriente: son circuitos distintos.
 *
 * Es la forma PREVISTA, la que se cargó con la factura. La real queda en la
 * orden de pago.
 */
function FormaPago({ f }: { f: PagosFactura }) {
  // Una NC no se paga: no tiene forma prevista.
  if (esNC(f)) return <span className="text-gris-mid text-[11px]">no se paga</span>
  const label = FORMAS_PREVISTAS.find(x => x.key === f.forma_pago_prevista)?.label ?? f.forma_pago_prevista
  // Cheque y e-cheq se destacan: son los que además arrastran fechas de cobro.
  const conCheque = f.forma_pago_prevista === 'cheque' || f.forma_pago_prevista === 'echeq'
  return (
    <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded ${
      conCheque ? 'bg-[#EEE8FF] text-[#5A2D82]' : 'bg-gris text-gris-dark'}`}>
      {label}
    </span>
  )
}

/** Saldo de la fila. En la NC no hay deuda: se muestra el crédito sin aplicar. */
function Saldo({ f }: { f: PagosFactura }) {
  if (esNC(f)) {
    const disp = Number(f.nc_disponible ?? 0)
    return disp > 0
      ? <span className="text-[#5A2D82]" title="Crédito a favor del proveedor todavía sin aplicar">crédito {fmtM(disp)}</span>
      : <span className="text-gris-mid">—</span>
  }
  return f.saldo > 0 ? <>{fmtM(f.saldo)}</> : <span className="text-gris-mid">—</span>
}

function Vencimiento({ f }: { f: PagosFactura }) {
  if (!f.vence_el) return <span className="text-gris-mid">—</span>
  const dias = f.dias_vencida
  return (
    <span className={f.vencida ? 'text-rojo font-bold' : ''}>
      {fmtFecha(f.vence_el)}
      {dias !== null && dias !== undefined && (
        <span className="block text-[10px] font-sans font-normal">
          {dias > 0 ? `${dias} día${dias === 1 ? '' : 's'} vencida` : dias === 0 ? 'vence hoy' : `en ${-dias} día${-dias === 1 ? '' : 's'}`}
        </span>
      )}
    </span>
  )
}

export function FacturasTabla({ items, seleccion, onToggle, onToggleTodas, onAbrir, puedeSeleccionar }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark italic">
        No hay comprobantes con estos filtros.
      </div>
    )
  }
  const todasTildadas = items.every(f => seleccion.has(f.id))

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">

      {/* ── Tabla (md o más) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[1000px]">
          <thead>
            <tr>
              {puedeSeleccionar && (
                <th className="bg-gris px-3 py-2 w-9">
                  <input type="checkbox" className="accent-naranja w-4 h-4" checked={todasTildadas}
                         onChange={onToggleTodas} title="Seleccionar toda la página" />
                </th>
              )}
              {['Proveedor / comprobante', 'Cliente / obra', 'Emitida', 'Vence', 'Total', 'Saldo', 'Cómo se paga', 'Estado', ''].map((h, i) => (
                <th key={h + i}
                    className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 2 && i <= 5 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(f => {
              const meta = ESTADO_FACTURA_META[f.estado]
              return (
                <tr key={f.id} className="border-t border-gris hover:bg-azul-light/30">
                  {puedeSeleccionar && (
                    <td className="px-3 py-2">
                      <input type="checkbox" className="accent-naranja w-4 h-4"
                             checked={seleccion.has(f.id)} onChange={() => onToggle(f.id)} />
                    </td>
                  )}
                  <td className="px-3 py-2 text-sm cursor-pointer" onClick={() => onAbrir(f.id)}>
                    <div className="font-semibold">{f.proveedor_nom}<CodigoProveedor f={f} /></div>
                    <div className="text-[11px] text-gris-dark font-mono">
                      {comprobanteTxt(f.tipo_comprobante, f.numero, f.clase)}
                      {f.ultima_op && <span className="font-sans"> · {f.ultima_op}</span>}
                    </div>
                    {f.descripcion && <div className="text-[11px] text-gris-dark truncate max-w-[280px]">{f.descripcion}</div>}
                    <div className="flex gap-1 flex-wrap mt-0.5"><ChipConcepto f={f} /><Alertas f={f} /></div>
                  </td>
                  <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => onAbrir(f.id)}
                      title={f.centros ?? undefined}>
                    {f.centro_costo ?? <span className="text-gris-mid">sin imputar</span>}
                    {f.centros_cc && f.centros_cc.length > 1 && (
                      <span className="block text-[10px] text-gris-dark">+{f.centros_cc.length - 1} más</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap cursor-pointer" onClick={() => onAbrir(f.id)}>{fmtFecha(f.fecha)}</td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap cursor-pointer" onClick={() => onAbrir(f.id)}><Vencimiento f={f} /></td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums cursor-pointer" onClick={() => onAbrir(f.id)}>
                    {esNC(f) ? <span className="text-[#5A2D82]">−{fmtM(f.total)}</span> : fmtM(f.total)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold cursor-pointer" onClick={() => onAbrir(f.id)}>
                    <Saldo f={f} />
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => onAbrir(f.id)}>
                    <FormaPago f={f} />
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => onAbrir(f.id)}>
                    <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded ${meta.badge}`} title={estadoHint(f.estado, f.clase)}>
                      {estadoLabel(f.estado, f.clase)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => onAbrir(f.id)}
                            className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold whitespace-nowrap">
                      Abrir
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (celular) ── */}
      <div className="md:hidden divide-y divide-gris">
        {items.map(f => {
          const meta = ESTADO_FACTURA_META[f.estado]
          return (
            <div key={f.id} className="p-3">
              <div className="flex items-start gap-2">
                {puedeSeleccionar && (
                  <input type="checkbox" className="accent-naranja w-4 h-4 mt-1"
                         checked={seleccion.has(f.id)} onChange={() => onToggle(f.id)} />
                )}
                <div className="flex-1 min-w-0" onClick={() => onAbrir(f.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{f.proveedor_nom}<CodigoProveedor f={f} /></div>
                      <div className="text-[11px] text-gris-dark font-mono">{comprobanteTxt(f.tipo_comprobante, f.numero, f.clase)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-block whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded ${meta.badge}`}>{estadoLabel(f.estado, f.clase)}</span>
                      <FormaPago f={f} />
                    </div>
                  </div>
                  {f.descripcion && <div className="text-[11px] text-gris-dark mt-0.5">{f.descripcion}</div>}
                  <div className="flex items-baseline justify-between gap-2 mt-1.5">
                    <div className="text-[11px] text-gris-dark">
                      {f.centro_costo ?? 'sin imputar'} · emitida {fmtFecha(f.fecha)}
                    </div>
                    {esNC(f) ? (
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold tabular-nums text-[#5A2D82]">−{fmtM(f.total)}</div>
                        <div className="text-[10px] text-gris-dark">
                          {Number(f.nc_disponible ?? 0) > 0 ? `crédito ${fmtM(f.nc_disponible)}` : 'nota de crédito'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold tabular-nums">{f.saldo > 0 ? fmtM(f.saldo) : fmtM(f.total)}</div>
                        <div className="text-[10px] text-gris-dark">{f.saldo > 0 ? `de ${fmtM(f.total)}` : 'sin saldo'}</div>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] mt-0.5"><Vencimiento f={f} /></div>
                  <div className="flex gap-1 flex-wrap mt-1"><ChipConcepto f={f} /><Alertas f={f} /></div>
                </div>
              </div>
              <button type="button" onClick={() => onAbrir(f.id)}
                      className="w-full mt-2 text-xs font-bold px-3 py-1.5 rounded bg-gris text-azul hover:bg-azul-light min-h-[36px]">
                Abrir factura
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
