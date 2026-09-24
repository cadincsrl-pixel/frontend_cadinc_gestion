'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useAmbienteCobranzas, useCompensar, useImputarCobro, usePendientesCliente } from '../../hooks/useCobranzas'
import { fmtFecha, fmtM, hoyAR } from '../../utils/facturacion.utils'
import { aCent, aplicarAutomatico, centATexto, claveSaldo, imputacionesDe, validarAplicacion } from '../../utils/cobranzas.utils'
import { leerCuerpoError, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasSaldo } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { ClienteCombobox, GrillaAplicacion, TotalesAplicacion, type FilaPendiente } from './Comun'

/**
 * «Compensación de comprobantes» (Bejerman): un crédito del cliente arriba y
 * sus débitos con saldo abajo, con la columna Aplicado.
 *
 * El crédito puede ser:
 *   · una NC del sistema con saldo libre (lo que su factura no absorbió) →
 *     POST /compensaciones { nc: { factura_id } };
 *   · una NC externa (saldo inicial) → POST /compensaciones { nc: { externo_id } };
 *   · lo que quedó a cuenta de un cobro → POST /cobros/:id/imputar.
 * La NC del sistema ya baja SOLA a su propia factura: acá se aplica contra
 * OTRA (si no, NC_A_SU_FACTURA).
 */

export type CreditoInicial =
  | { factura_id: number }
  | { externo_id: number }
  | { cobro_id: number }

interface Props {
  clienteId?:      number
  creditoInicial?: CreditoInicial
  onClose:         () => void
  onHecho?:        () => void
}

function claveCredito(c: CreditoInicial): string {
  if ('factura_id' in c) return `f${c.factura_id}`
  if ('externo_id' in c) return `e${c.externo_id}`
  return `c${c.cobro_id}`
}

const TIPO_CREDITO = (s: VentasSaldo) =>
  s.origen === 'cobro' ? 'Cobro a cuenta' : s.origen === 'externo' ? 'NC (saldo inicial)' : 'Nota de crédito'

export function ModalCompensacion({ clienteId: clienteProp, creditoInicial, onClose, onHecho }: Props) {
  const toast = useToast()
  const { registrarCobros, puedeVer } = usePermisos('facturacion')
  const ambiente = useAmbienteCobranzas()
  const compensar = useCompensar()
  const imputar = useImputarCobro()

  const [clienteId, setClienteId] = useState(clienteProp ? String(clienteProp) : '')
  const [creditoSel, setCreditoSel] = useState<string>(creditoInicial ? claveCredito(creditoInicial) : '')
  /** null = el saldo libre del crédito elegido (se edita para aplicar menos). */
  const [totalAplicarEdit, setTotalAplicar] = useState<string | null>(null)
  const [aplicado, setAplicado] = useState<Record<string, string>>({})
  const [fecha, setFecha] = useState(hoyAR())
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const pend = usePendientesCliente(clienteId ? Number(clienteId) : null, ambiente, puedeVer)
  const creditos = useMemo(
    () => (pend.data?.creditos ?? []).filter(s => Number(s.saldo) > 0).map(s => ({ ...s, clave: claveSaldo(s) })),
    [pend.data],
  )
  const debitos: FilaPendiente[] = useMemo(
    () => (pend.data?.debitos ?? []).filter(s => Number(s.saldo) > 0).map(s => ({ ...s, clave: claveSaldo(s) })),
    [pend.data],
  )
  const credito = creditos.find(c => c.clave === creditoSel)

  const totalAplicar = totalAplicarEdit ?? (credito ? centATexto(aCent(credito.saldo)) : '')

  /** Al elegir otro crédito, el total vuelve a su saldo libre y la aplicación arranca de cero. */
  function elegirCredito(clave: string) {
    if (clave === creditoSel) return
    setCreditoSel(clave)
    setTotalAplicar(null)
    setAplicado({})
  }

  const saldoCreditoCent = credito ? aCent(credito.saldo) : 0
  const totalCent = Math.min(aCent(totalAplicar), saldoCreditoCent)
  const val = validarAplicacion(debitos, aplicado, totalCent)
  const hayError = Object.keys(val.errores).length > 0 || val.superaTotal
  const items = imputacionesDe(debitos, aplicado)
  const guardando = compensar.isPending || imputar.isPending
  const totalSupera = aCent(totalAplicar) > saldoCreditoCent

  async function confirmar() {
    if (!credito) return
    setErrorServer(null)
    try {
      if (credito.origen === 'cobro') {
        await imputar.mutateAsync({ id: credito.cobro_id!, items, fecha })
      } else {
        await compensar.mutateAsync({
          nc: credito.factura_id ? { factura_id: credito.factura_id } : { externo_id: credito.externo_id! },
          items, fecha,
        })
      }
      toast(`✓ ${credito.comprobante}: ${fmtM(val.aplicadoCent / 100)} aplicados`, 'ok')
      onHecho?.()
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorFacturacion(e))
      if (leerCuerpoError(e).error === 'IMPUTACION_SUPERA_SALDO') void pend.refetch()
    }
  }

  const deshabilitado = !registrarCobros ? 'Hace falta el permiso «Registrar cobros»'
    : !credito ? 'Elegí el crédito a aplicar'
    : items.length === 0 ? 'Aplicá algún importe a un comprobante'
    : hayError ? 'Corregí los importes aplicados' : null

  return (
    <Modal
      open
      onClose={guardando ? () => {} : onClose}
      width="max-w-5xl"
      title="Compensación de comprobantes"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button size="sm" loading={guardando} disabled={!!deshabilitado} title={deshabilitado ?? 'Aplicar el crédito a los comprobantes'}
          onClick={confirmar}>
          Aplicar {val.aplicadoCent > 0 ? fmtM(val.aplicadoCent / 100) : ''}
        </Button>
      </>}
    >
      <div className="flex flex-col gap-3 text-sm">
        {!registrarCobros && <Aviso tono="naranja">No tenés el permiso «Registrar cobros»: podés mirar, pero no aplicar.</Aviso>}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-3">
            <ClienteCombobox value={clienteId} disabled={!!clienteProp}
              onChange={v => { setClienteId(v); setCreditoSel(''); setTotalAplicar(null); setAplicado({}) }} />
          </div>
          <Input label="Fecha" type="date" max={hoyAR()} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        {!clienteId ? (
          <div className="text-gris-dark italic">Elegí el cliente.</div>
        ) : pend.isLoading ? (
          <div className="text-gris-dark">Cargando comprobantes…</div>
        ) : pend.error ? (
          <Aviso tono="rojo">{mensajeErrorFacturacion(pend.error)}</Aviso>
        ) : (
          <>
            {/* ── Créditos ── */}
            <div className="border border-gris-mid rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gris/60 text-[11px] font-bold text-azul uppercase tracking-wider">Créditos</div>
              {creditos.length === 0 ? (
                <div className="p-3 text-gris-dark italic">
                  El cliente no tiene créditos libres (notas de crédito sin usar ni cobros a cuenta).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[640px]">
                    <thead>
                      <tr>
                        {['', 'Tipo', 'Comprobante', 'Fecha', 'Total', 'Disponible'].map((h, i) => (
                          <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase tracking-wide ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {creditos.map(c => (
                        <tr key={c.clave} onClick={() => elegirCredito(c.clave)}
                            className={`border-t border-gris cursor-pointer ${creditoSel === c.clave ? 'bg-naranja-light/60' : 'hover:bg-azul-light/30'}`}>
                          <td className="px-2 py-1.5 w-6"><input type="radio" checked={creditoSel === c.clave} onChange={() => elegirCredito(c.clave)} /></td>
                          <td className="px-2 py-1.5">{TIPO_CREDITO(c)}</td>
                          <td className="px-2 py-1.5 font-mono">{c.comprobante}</td>
                          <td className="px-2 py-1.5">{fmtFecha(c.fecha)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtM(c.total)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums font-bold">{fmtM(c.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {credito && (
                <div className="flex items-end gap-3 p-3 border-t border-gris flex-wrap">
                  <div className="w-[200px]">
                    <InputMonto label="Total a aplicar" value={totalAplicar} onChange={setTotalAplicar}
                      error={totalSupera ? `Hasta ${fmtM(credito.saldo)}` : undefined} />
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setAplicado(aplicarAutomatico(debitos, totalCent))}
                    disabled={totalCent <= 0 || debitos.length === 0}>Aplicar automático</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAplicado({})} disabled={Object.keys(aplicado).length === 0}>Limpiar</Button>
                </div>
              )}
            </div>

            {/* ── Débitos ── */}
            <div className="border border-gris-mid rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gris/60 text-[11px] font-bold text-azul uppercase tracking-wider">Débitos</div>
              <div className="p-2">
                <GrillaAplicacion filas={debitos} aplicado={aplicado} errores={val.errores} disabled={!credito}
                  onCambiar={(k, raw) => setAplicado(a => ({ ...a, [k]: raw }))}
                  vacio="El cliente no tiene comprobantes con saldo." />
              </div>
            </div>

            {credito && (
              <TotalesAplicacion totalLabel="Total a aplicar" totalCent={totalCent} aplicadoCent={val.aplicadoCent}
                restoLabel="Sin aplicar" superaTotal={val.superaTotal} />
            )}
            {credito?.origen === 'erp' && (
              <span className="text-[11px] text-gris-dark">
                La NC ya bajó sola a la factura que corrige: el disponible es lo que le sobró. Aplicalo a otra factura del cliente.
              </span>
            )}
          </>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
