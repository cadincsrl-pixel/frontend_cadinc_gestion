'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useAmbienteCobranzas, useEstadoCuenta } from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtM } from '../../utils/facturacion.utils'
import { MOVIMIENTO_LABEL, descargarEstadoCuentaPdf, exportarEstadoCuentaExcel, saldoFinal, type DatosEstadoCuenta } from '../../utils/estadoCuenta'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasDeudor } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { Cifra } from './Comun'
import { FichaCobro } from './FichaCobro'
import { ModalCobro } from './ModalCobro'

/**
 * Estado de cuenta de un cliente: movimientos con debe, haber y saldo corrido
 * (`ventas_estado_cuenta`), con PDF para mandarle y Excel. El saldo final es
 * el de la base y coincide con el neto de Deudores.
 */
export function ModalEstadoCuenta({ clienteId, razonSocial, docNro, deudor, onClose }: {
  clienteId:   number
  razonSocial: string
  docNro:      string
  deudor?:     VentasDeudor | null
  onClose:     () => void
}) {
  const toast = useToast()
  const { registrarCobros } = usePermisos('facturacion')
  const ambiente = useAmbienteCobranzas()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [generando, setGenerando] = useState(false)
  const [fichaCobro, setFichaCobro] = useState<number | null>(null)
  const [nuevoCobro, setNuevoCobro] = useState(false)

  const ec = useEstadoCuenta(clienteId, desde, hasta, ambiente)
  const movs = ec.data?.movimientos ?? []
  const final = saldoFinal(movs, ec.data?.saldo_final)

  const datos = (): DatosEstadoCuenta | null => ec.data ? {
    ec: ec.data,
    razonSocial: ec.data.cliente?.razon_social ?? razonSocial,
    docNro:      ec.data.cliente?.doc_nro ?? docNro,
    deudor,
  } : null

  async function pdf() {
    const d = datos()
    if (!d) return
    setGenerando(true)
    try { await descargarEstadoCuentaPdf(d) } catch { toast('No se pudo generar el PDF', 'err') } finally { setGenerando(false) }
  }

  function excel() {
    const d = datos()
    if (d) exportarEstadoCuentaExcel(d)
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-5xl"
      title={`Estado de cuenta · ${razonSocial}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        <Button variant="secondary" size="sm" onClick={() => setNuevoCobro(true)} disabled={!registrarCobros}
          title={registrarCobros ? 'Registrar un cobro de este cliente' : 'Hace falta el permiso «Registrar cobros»'}>+ Cobro</Button>
        <Button variant="secondary" size="sm" onClick={excel} disabled={!ec.data}>⬇ Excel</Button>
        <Button size="sm" onClick={pdf} loading={generando} disabled={!ec.data} title="PDF para mandarle al cliente">🖨 PDF</Button>
      </>}
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex gap-3 flex-wrap items-end">
          <span className="text-xs text-gris-dark mr-auto">CUIT {fmtCuit(docNro)}{ambiente === 'homo' ? ' · HOMOLOGACIÓN' : ''}</span>
          <div className="w-[160px]"><Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="w-[160px]"><Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          {(desde || hasta) && <Button size="sm" variant="ghost" onClick={() => { setDesde(''); setHasta('') }}>Todo</Button>}
        </div>

        {deudor && (
          <div className="flex gap-2 flex-wrap">
            <Cifra label="Saldo" valor={fmtM(deudor.saldo)} />
            <Cifra label="A cuenta y NC" valor={fmtM(Number(deudor.a_cuenta) + Number(deudor.nc_disponible))} />
            <Cifra label="Vencido" valor={fmtM(deudor.vencido)} tono={Number(deudor.vencido) > 0 ? 'rojo' : 'normal'} />
            {Number(deudor.saldo_a_revisar) > 0 && <Cifra label="A revisar" valor={fmtM(deudor.saldo_a_revisar)} tono="naranja" sub="saldos iniciales supuestos" />}
          </div>
        )}

        {ec.isLoading ? (
          <div className="p-6 text-center text-gris-dark">Cargando movimientos…</div>
        ) : ec.error ? (
          <Aviso tono="rojo">{mensajeErrorFacturacion(ec.error)} <button className="underline" onClick={() => ec.refetch()}>Reintentar</button></Aviso>
        ) : movs.length === 0 ? (
          <div className="p-6 text-center text-gris-dark italic">No hay movimientos{desde || hasta ? ' en el período' : ''}.</div>
        ) : (
          <div className="overflow-x-auto border border-gris-mid rounded-lg">
            <table className="w-full border-collapse min-w-[820px]">
              <thead>
                <tr>
                  {['Fecha', 'Comprobante', 'Detalle', 'Vence', 'Debe', 'Haber', 'Saldo'].map((h, i) => (
                    <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movs.map(m => {
                  const ant = m.movimiento === 'saldo_anterior'
                  const clic = m.cobro_id ? () => setFichaCobro(m.cobro_id) : undefined
                  return (
                    <tr key={m.orden} onClick={clic}
                        className={`border-t border-gris ${ant ? 'bg-gris/50 font-semibold' : ''} ${clic ? 'cursor-pointer hover:bg-azul-light/30' : ''}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                      <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{ant ? '' : m.comprobante}</td>
                      <td className="px-2 py-1.5 text-xs">
                        <span className="font-semibold">{MOVIMIENTO_LABEL[m.movimiento] ?? m.movimiento}</span>
                        {!ant && m.detalle && <span className="text-gris-dark"> — {m.detalle}</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs">{fmtFecha(m.vence_el)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{Number(m.debe) ? fmtM(m.debe) : ''}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{Number(m.haber) ? fmtM(m.haber) : ''}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold">{fmtM(m.saldo)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-naranja bg-naranja-light/40">
                  <td colSpan={6} className="px-2 py-2 text-right font-bold">{final >= 0 ? 'Saldo a pagar' : 'Saldo a favor del cliente'}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums font-bold">{fmtM(Math.abs(final))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {fichaCobro !== null && <FichaCobro id={fichaCobro} onClose={() => setFichaCobro(null)} />}
      {nuevoCobro && <ModalCobro clienteInicial={clienteId} onClose={() => setNuevoCobro(false)} onGuardado={d => { setNuevoCobro(false); setFichaCobro(d.cobro.id) }} />}
    </Modal>
  )
}
