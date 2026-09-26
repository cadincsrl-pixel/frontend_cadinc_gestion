'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { useNcDisponibles } from '../../hooks/usePagos'
import { useDatosPagoProveedor } from '../../hooks/useProveedoresPagos'
import { comprobanteTxt, fmtFecha, fmtM, topePagable } from '../../utils/pagos.utils'
import { mensajeErrorPagos } from '../../utils/pagos.errores'
import { n, r2, type FilaFactura } from '../../utils/pagoForm'
import { inputCls } from './Campo'
import type { PagosProveedor } from '@/types/domain.types'

/**
 * Las piezas de una OP que no son cheques, compartidas por «Registrar pago» y
 * cada bloque de «Pagar en lote» (20260929t): las facturas con «Se paga» /
 * «Quedaría», el «A cuenta», la cuenta destino del padrón y el aviso de NC
 * sin aplicar.
 */

/** Una fila por factura: «Se paga» editable (parcial vale), con tope `saldo_pagable`. */
export function FilasFacturasPago({ filas, onMonto }: {
  filas:   FilaFactura[]
  onMonto: (facturaId: number, monto: string) => void
}) {
  return (
    <div className="border border-gris-mid rounded overflow-hidden">
      {filas.map(f => {
        const tope = topePagable(f.factura)
        const excede = n(f.monto) - tope > 0.005
        const quedaria = r2(f.factura.saldo - n(f.monto))
        const reservado = Number(f.factura.nc_pendiente ?? 0)
        return (
          <div key={f.factura.id} className="border-b border-gris last:border-0 p-2.5">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-sm">{comprobanteTxt(f.factura.tipo_comprobante, f.factura.numero)}</div>
                <div className="text-[11px] text-gris-dark">
                  {f.factura.descripcion || '—'} · vence {fmtFecha(f.factura.vence_el)}
                </div>
                <div className="text-[11px] text-gris-dark">
                  Saldo <b className="font-mono">{fmtM(f.factura.saldo)}</b> de {fmtM(f.factura.total)}
                </div>
                {reservado > 0 && (
                  <div className="text-[11px] text-[#5A2D82]"
                    title="Una nota de crédito sin aprobar declara acreditar esa parte: no se puede pagar con plata mientras esté pendiente.">
                    NC pendiente de aprobar {fmtM(reservado)} · se puede pagar hasta <b className="font-mono">{fmtM(tope)}</b>
                  </div>
                )}
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">Se paga</label>
                <InputMonto value={f.monto}
                  onChange={v => onMonto(f.factura.id, v)}
                  className={`font-mono text-right py-2 rounded ${excede ? '!border-amarillo' : ''}`} />
              </div>
              <div className="w-28 text-right">
                <div className="text-[10px] font-semibold text-gris-dark mb-0.5">Quedaría</div>
                <div className={`font-mono text-sm tabular-nums ${excede ? 'text-[#7A5000] font-bold' : quedaria === 0 ? 'text-verde font-bold' : ''}`}
                  title={excede ? 'Lo que pasa del saldo va a «A cuenta»: queda a favor con el proveedor' : undefined}>
                  {excede ? `+${fmtM(r2(n(f.monto) - tope))} a cuenta` : fmtM(quedaria)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * «Importe del pago» (2026-09-26): lo que se paga es un DATO, no la suma de
 * las filas. Pedido del dueño: «el importe de arriba tiene que seguir a
 * cualquier forma de pago». Se tipea lo que sale (la transferencia, el
 * efectivo) y se reparte entre las facturas, la que vence primero primero;
 * lo que sobra va a «A cuenta». Con cheques no se tipea: es lo que suman.
 *
 * Mientras se escribe se guarda el texto; al salir del campo (o con Enter)
 * se reparte. Repartir en cada tecla movería las filas debajo del cursor.
 */
export function CampoImportePago({ total, conCheques, onRepartir }: {
  total:      number
  conCheques: boolean
  onRepartir: (total: number) => void
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const confirmar = () => {
    if (editando === null) return
    const v = r2(n(editando))
    setEditando(null)
    if (Math.abs(v - total) >= 0.005) onRepartir(v)
  }
  return (
    <div className="flex gap-2 items-end flex-wrap">
      <div className="w-44">
        <label className="block text-xs font-semibold text-gris-dark mb-1">Importe del pago</label>
        <InputMonto value={editando ?? String(total)} disabled={conCheques}
          onChange={setEditando} onBlur={confirmar}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
          className="font-mono text-right py-2 rounded font-bold" />
      </div>
      <div className="text-[11px] text-gris-dark flex-1 min-w-[200px] pb-2">
        {conCheques
          ? 'Lo que suman los cheques. Se reparte solo entre las facturas; si sobra, va a «A cuenta».'
          : 'Lo que sale de plata. Se reparte entre las facturas (la que vence primero, primero); si sobra, va a «A cuenta». Podés pagar menos: la factura queda con saldo.'}
      </div>
    </div>
  )
}

/**
 * Qué deja el pago, dicho en voz alta. Pagar de más es un AVISO, nunca un
 * freno (2026-09-26): la plata queda a favor con el proveedor.
 */
export function AvisoResultadoPago({ aFavor, quedaDebiendo }: { aFavor: number; quedaDebiendo: number }) {
  if (aFavor <= 0.005 && quedaDebiendo <= 0.005) return null
  return (
    <div className="flex flex-col gap-1">
      {aFavor > 0.005 && (
        <div className="bg-amarillo-light border border-amarillo/60 rounded px-2.5 py-1.5 text-xs text-[#7A5000]">
          ⚠ Pagás <b className="font-mono">{fmtM(aFavor)}</b> más de lo que se debe en estas facturas: va a
          «A cuenta» y queda como <b>saldo a favor</b> con el proveedor. Si no era la idea, revisá el importe.
        </div>
      )}
      {quedaDebiendo > 0.005 && (
        <div className="text-[11px] text-gris-dark px-0.5">
          Pago parcial: de estas facturas se sigue debiendo <b className="font-mono">{fmtM(quedaDebiendo)}</b>.
        </div>
      )}
    </div>
  )
}

/** Plata que se le adelanta al proveedor sin factura. */
export function CampoACuenta({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-end flex-wrap">
      <div className="w-40">
        <label className="block text-xs font-semibold text-gris-dark mb-1">A cuenta · opcional</label>
        <InputMonto value={value} onChange={onChange}
          placeholder="0" className="font-mono text-right py-2 rounded" />
      </div>
      <div className="text-[11px] text-gris-dark flex-1 min-w-[200px] pb-2">
        Plata que se le adelanta al proveedor sin factura. Queda como saldo a favor para aplicar después.
      </div>
    </div>
  )
}

/** Crédito de NC aprobadas sin aplicar: no se usa solo, pero hay que verlo antes de mandar plata (20260925). */
export function AvisoNcSinAplicar({ proveedorId }: { proveedorId: number | null }) {
  const ncDisp = useNcDisponibles(proveedorId)
  const nc = useMemo(() => {
    const items = ncDisp.data?.items ?? []
    return { cant: items.length, total: r2(items.reduce((s, f) => s + Number(f.nc_disponible ?? 0), 0)) }
  }, [ncDisp.data])
  if (nc.total <= 0) return null
  return (
    <div className="bg-[#EEE8FF] border border-[#C9B8E8] rounded p-2 text-xs text-[#5A2D82]">
      El proveedor tiene <b className="font-mono">{fmtM(nc.total)}</b> en{' '}
      {nc.cant === 1 ? 'una nota de crédito' : `${nc.cant} notas de crédito`} sin aplicar.
      {' '}No se descuenta solo: si corresponde, aplicala desde la ficha de la NC (Facturas) antes de pagar.
    </div>
  )
}

/** La cuenta del padrón, enmascarada según `ver_pii`. */
export function cuentaDelPadron(p: Pick<PagosProveedor, 'cbu' | 'alias_cbu' | 'cbu_ultimos4'> | null | undefined, verPii: boolean): string | null {
  if (!p) return null
  const v = verPii ? (p.cbu ?? p.alias_cbu) : (p.cbu_ultimos4 ? `***${p.cbu_ultimos4}` : p.alias_cbu)
  return v || null
}

/**
 * La CUENTA DESTINO no se tipea: sale del padrón. Si el proveedor no tiene CBU
 * ni alias, se carga desde acá y recién ahí se puede transferir.
 */
export function CuentaDestinoProveedor({ proveedorId, proveedor, verPii, sinDatosPago }: {
  proveedorId:  number | null
  proveedor:    PagosProveedor | null | undefined
  verPii:       boolean
  sinDatosPago: boolean
}) {
  const toast = useToast()
  const datosPago = useDatosPagoProveedor()
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [nuevoCbu, setNuevoCbu] = useState('')
  const [nuevoAlias, setNuevoAlias] = useState('')

  async function cargarDatosPago() {
    if (!proveedorId) return
    setCargandoDatos(true)
    try {
      await datosPago.mutateAsync({ id: proveedorId, cbu: nuevoCbu.trim() || null, alias_cbu: nuevoAlias.trim() || null })
      toast('✓ Datos de pago cargados', 'ok')
      setNuevoCbu(''); setNuevoAlias('')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setCargandoDatos(false)
    }
  }

  return (
    <div className={`border rounded p-2 text-xs ${sinDatosPago ? 'bg-rojo-light border-rojo/30' : 'bg-gris border-gris-mid'}`}>
      {sinDatosPago ? (
        <div className="flex flex-col gap-2">
          <div className="text-rojo font-semibold">
            {proveedor?.razon_social ?? 'El proveedor'} no tiene CBU ni alias cargado: no se le puede transferir.
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="w-56">
              <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">CBU</label>
              <input inputMode="numeric" value={nuevoCbu} onChange={e => setNuevoCbu(e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <div className="w-44">
              <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">o Alias</label>
              <input value={nuevoAlias} onChange={e => setNuevoAlias(e.target.value)} className={inputCls} />
            </div>
            <Button size="sm" onClick={cargarDatosPago} loading={cargandoDatos}
              disabled={!nuevoCbu.trim() && !nuevoAlias.trim()}>
              Cargar datos de pago
            </Button>
          </div>
        </div>
      ) : (
        <>
          Se transfiere a la cuenta del padrón:{' '}
          <b className="font-mono">{cuentaDelPadron(proveedor, verPii)}</b>
          {proveedor?.banco && <> · {proveedor.banco}</>}
          <span className="block text-gris-dark mt-0.5">La orden guarda esta cuenta como foto: no se tipea a mano.</span>
        </>
      )}
    </div>
  )
}
