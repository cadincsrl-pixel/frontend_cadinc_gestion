'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { subirComprobantePendiente, useDevolucionProveedor } from '../hooks/usePagos'
import { MAX_ADJUNTO_BYTES, MIME_ADJUNTOS, comprobanteTxt, fmtM, formaPagoLabel, hoyAR } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosAdjuntoPendiente, PagosOrdenDetalle } from '@/types/domain.types'

const n = (s: string) => { const v = Number(aRaw(String(s), 2)); return Number.isFinite(v) ? v : 0 }
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Devolución del proveedor (2026-09-23). El proveedor hizo una nota de crédito
 * y devolvió la plata (toda o parte). En vez de anular la OP, pagar con una OP
 * «solo NC» y subir el comprobante por separado, se hace de una vez:
 * `pagos_devolucion_proveedor` anula la original y emite la nueva en la misma
 * transacción. Si es parcial, la nueva lleva la plata que quedó y el mismo
 * comprobante de pago de la original.
 */
export function ModalDevolucionProveedor({ orden, onClose, onHecho }: {
  orden: PagosOrdenDetalle; onClose: () => void; onHecho: () => void
}) {
  const toast = useToast()
  const devolver = useDevolucionProveedor()
  const lineas = orden.lineas.filter(l => l.tipo === 'factura' && l.factura_id != null)

  // Arranca en «devuelven todo»: es el caso común (se canceló la compra).
  const [montos, setMontos] = useState<Record<number, string>>(
    () => Object.fromEntries(lineas.map(l => [l.factura_id!, String(l.monto)])))
  const [ncNumero, setNcNumero] = useState('')
  const [ncFecha, setNcFecha] = useState(hoyAR())
  const [motivo, setMotivo] = useState('')
  const [pdfNc, setPdfNc] = useState<PagosAdjuntoPendiente | null>(null)
  const [compDev, setCompDev] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState<'nc' | 'dev' | null>(null)

  const devuelto = r2(lineas.reduce((s, l) => s + n(montos[l.factura_id!] ?? ''), 0))
  const pagado = r2(lineas.reduce((s, l) => s + Number(l.monto), 0))
  const queda = r2(pagado - devuelto)
  const parcial = queda > 0.005
  const deMas = lineas.some(l => n(montos[l.factura_id!] ?? '') > Number(l.monto) + 0.005)
  const conCheques = orden.forma_pago === 'cheque' || orden.forma_pago === 'echeq'
  const bloqueo = useMemo(() => {
    if (devuelto <= 0) return 'Poné cuánto devuelve el proveedor'
    if (deMas) return 'No puede devolver más de lo que se le pagó por esa factura'
    if (parcial && conCheques) return 'Con cheques sólo se puede registrar la devolución total (el cheque vuelve entero)'
    if (!ncNumero.trim()) return 'Falta el número de la nota de crédito'
    if (!ncFecha || ncFecha > hoyAR()) return 'La fecha de la NC no puede ser futura'
    if (!pdfNc) return 'Falta el PDF de la nota de crédito'
    return null
  }, [devuelto, deMas, parcial, conCheques, ncNumero, ncFecha, pdfNc])

  async function subir(file: File | undefined, cual: 'nc' | 'dev') {
    if (!file) return
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    setSubiendo(cual)
    try {
      const adj = await subirComprobantePendiente(file, cual === 'nc' ? 'nota_credito' : 'otro')
      if (cual === 'nc') setPdfNc(adj); else setCompDev(adj)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setSubiendo(null)
    }
  }

  async function confirmar() {
    try {
      const r = await devolver.mutateAsync({
        id: orden.id,
        devoluciones: lineas
          .map(l => ({ factura_id: l.factura_id!, monto: n(montos[l.factura_id!] ?? '') }))
          .filter(d => d.monto > 0),
        nc_numero: ncNumero.trim(),
        nc_fecha: ncFecha,
        motivo: motivo.trim(),
        adjuntos: [pdfNc!, ...(compDev ? [compDev] : [])],
      })
      toast(`✓ ${orden.numero_fmt} anulada · nueva ${r.orden.numero_fmt}`, 'ok')
      onHecho()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja'

  return (
    <Modal open onClose={onClose} width="max-w-xl" title={`Devolución del proveedor · ${orden.numero_fmt}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} loading={devolver.isPending} disabled={!!bloqueo || subiendo !== null}
            title={bloqueo ?? undefined}>
            Registrar devolución
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          El proveedor hizo una nota de crédito y devolvió la plata. Se <b>anula {orden.numero_fmt}</b> y se hace una
          orden nueva con la misma fecha que cancela las facturas con la NC.
        </div>

        <div className="border border-gris-mid rounded">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_130px] gap-2 px-2.5 py-1.5 bg-gris text-[10px] font-bold uppercase text-gris-dark">
            <span>Factura</span><span className="text-right">Se pagó</span><span className="text-right">Devuelven</span>
          </div>
          {lineas.map(l => (
            <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_110px_130px] gap-2 px-2.5 py-1.5 items-center border-t border-gris">
              <span className="truncate">{l.factura ? comprobanteTxt(l.factura.tipo_comprobante, l.factura.numero) : `#${l.factura_id}`}</span>
              <span className="text-right font-mono tabular-nums text-xs">{fmtM(l.monto)}</span>
              <InputMonto value={montos[l.factura_id!] ?? ''}
                onChange={v => setMontos(m => ({ ...m, [l.factura_id!]: v }))}
                className="font-mono text-right py-1.5 rounded" />
            </div>
          ))}
        </div>

        <div className={`rounded p-2 text-xs ${parcial && conCheques ? 'bg-rojo-light text-rojo' : 'bg-gris text-gris-dark'}`}>
          {devuelto <= 0 ? 'Poné cuánto devuelve el proveedor.'
            : parcial
              ? <>La orden nueva queda con <b className="font-mono">{fmtM(queda)}</b> de {formaPagoLabel(orden.forma_pago).toLowerCase()} (lo que sí se pagó, con el mismo comprobante)
                  {' '}+ NC <b className="font-mono">{fmtM(devuelto)}</b>.{conCheques && ' Con cheques sólo se puede la devolución total.'}</>
              : <>Devolución total: la orden nueva queda <b>sólo con la NC</b> por <b className="font-mono">{fmtM(devuelto)}</b>, sin plata.
                  {conCheques && ' Los cheques de la orden original quedan libres.'}</>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-gris-dark">N° de la NC
            <input value={ncNumero} onChange={e => setNcNumero(e.target.value)} placeholder="0022-00000999" className={`${inputCls} font-mono mt-1`} />
          </label>
          <label className="text-xs font-semibold text-gris-dark">Fecha de la NC
            <input type="date" value={ncFecha} max={hoyAR()} onChange={e => setNcFecha(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>

        <div className="flex gap-2 flex-wrap">
          <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
            {subiendo === 'nc' ? 'Subiendo…' : pdfNc ? `✓ NC: ${pdfNc.nombre_archivo}` : '📎 PDF de la NC (obligatorio)'}
            <input type="file" className="hidden" accept={MIME_ADJUNTOS} disabled={subiendo !== null}
              onChange={e => { void subir(e.target.files?.[0], 'nc'); e.target.value = '' }} />
          </label>
          <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
            {subiendo === 'dev' ? 'Subiendo…' : compDev ? `✓ ${compDev.nombre_archivo}` : '📎 Comprobante de la devolución (opcional)'}
            <input type="file" className="hidden" accept={MIME_ADJUNTOS} disabled={subiendo !== null}
              onChange={e => { void subir(e.target.files?.[0], 'dev'); e.target.value = '' }} />
          </label>
        </div>

        <label className="text-xs font-semibold text-gris-dark">Motivo <span className="font-normal">· opcional</span>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: se canceló la compra, la soga no llegó" className={`${inputCls} mt-1`} />
        </label>
      </div>
    </Modal>
  )
}
