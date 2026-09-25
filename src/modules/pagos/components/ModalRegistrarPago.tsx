'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useRegistrarOrden, subirComprobantePendiente, borrarComprobantePendiente,
} from '../hooks/usePagos'
import { useProveedorPagos } from '../hooks/useProveedoresPagos'
import { SelectCuentaOrigen, cuentaOrigenId } from './SelectCuentaOrigen'
import {
  FORMAS_CON_CUENTA_DESTINO, FORMAS_CON_FECHA_COBRO,
  FORMAS_PAGO_OP, comprobanteObligatorio, fmtM, hoyAR, motivoComprobante, salidaLabel,
} from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import {
  FORMA_POR_DEFECTO, filasIniciales, filasQueSePasan, formaSegunLoPrevisto, lineasDeOrden, repartirTotalEnFilas,
  totalDeFilas, type FilaFactura,
} from '../utils/pagoForm'
import { EditorCheques, useEditorCheques } from './pago/EditorCheques'
import { AvisoNcSinAplicar, CampoACuenta, CuentaDestinoProveedor, FilasFacturasPago } from './pago/FacturasDelPago'
import { Campo, inputCls } from './pago/Campo'
import type { PagosAdjuntoPendiente, PagosFormaPagoOP } from '@/types/domain.types'

/**
 * Registrar el pago: una orden de pago que cubre N facturas del mismo
 * proveedor.
 *
 * Tres reglas que la pantalla tiene que dejar obvias:
 *
 *  - Acá sale SOLO PLATA. La nota de crédito del proveedor es un comprobante
 *    aparte (20260925): se carga en Facturas y se aplica desde su ficha. El
 *    tope de cada factura es `saldo_pagable` (saldo menos lo que reserva una
 *    NC todavía sin aprobar). Si el proveedor tiene crédito de NC sin usar,
 *    se avisa arriba: no se aplica solo.
 *  - La CUENTA DESTINO no se tipea: sale del padrón. Si el proveedor no tiene
 *    CBU ni alias, se carga desde acá y recién ahí se puede transferir.
 *  - Es TODO O NADA. Si el POST rebota, los archivos ya subidos se conservan
 *    para reintentar sin volver a subirlos.
 */

interface Props {
  facturaIds: number[]
  onClose:    () => void
  /**
   * Al registrar: la OP nueva y si salió con comprobante de pago. Con
   * comprobante, quien llama ofrece avisar al proveedor en el momento.
   */
  onRegistrado?: (ordenId: number, conComprobante: boolean) => void
}

// Vive en utils/pagoForm (la usa también «Pagar en lote»); se re-exporta
// porque el test y otros lugares la importan desde acá.
export { formaSegunLoPrevisto }

export function ModalRegistrarPago({ facturaIds, onClose, onRegistrado }: Props) {
  const toast = useToast()
  const { verPii } = usePermisos('pagos')
  const registrar = useRegistrarOrden()

  // Se traen por id: el modal puede abrirse desde la ficha (una) o desde la
  // selección de la bandeja (varias).
  const { data: pagina, isLoading } = useFacturas(
    { estados: ['aprobada', 'pagada_parcial'], archivadas: true, clase: 'factura' }, 1, 200, facturaIds.length > 0,
  )
  const elegidas = useMemo(
    () => (pagina?.items ?? []).filter(f => facturaIds.includes(f.id)),
    [pagina, facturaIds],
  )

  const [filas, setFilas] = useState<FilaFactura[]>([])
  const [aCuenta, setACuenta] = useState('')
  const [forma, setForma] = useState<PagosFormaPagoOP>(FORMA_POR_DEFECTO)
  // Una vez que la persona elige, el default no vuelve a pisarla.
  const [formaElegida, setFormaElegida] = useState(false)
  const [fecha, setFecha] = useState(hoyAR())
  const [referencia, setReferencia] = useState('')
  // «Sale de la cuenta» (20260926g): opcional, '' = sin indicar.
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [obs, setObs] = useState('')
  const [comprobante, setComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)

  // Precargar con el saldo de cada factura: es lo que se paga el 90 % de las veces.
  useEffect(() => {
    if (elegidas.length === 0 || filas.length > 0) return
    setFilas(filasIniciales(elegidas))
  }, [elegidas, filas.length])

  // Y con la forma que la factura ya tenía prevista. Las facturas llegan
  // async, así que esto no puede ser el useState inicial.
  useEffect(() => {
    if (elegidas.length === 0 || formaElegida) return
    setForma(formaSegunLoPrevisto(elegidas))
  }, [elegidas, formaElegida])

  const proveedorId = elegidas[0]?.proveedor_id ?? null
  const { data: proveedor } = useProveedorPagos(proveedorId)

  // Para avisar que la forma no la eligió la persona: la trajo la factura.
  const vieneDeLoPrevisto = !formaElegida && elegidas.length > 0 && forma === formaSegunLoPrevisto(elegidas)

  const totalPlata = totalDeFilas(filas, aCuenta)

  // El backend copia la cuenta del padrón; si falta, rebota. Mejor avisarlo
  // acá que después del POST.
  const necesitaCuenta = FORMAS_CON_CUENTA_DESTINO.includes(forma)
  const sinDatosPago   = necesitaCuenta && !proveedor?.cbu && !proveedor?.alias_cbu
  const pideCheques     = FORMAS_CON_FECHA_COBRO.includes(forma)

  const ed = useEditorCheques({
    fecha, totalPlata, forma, pideCheques,
    planFactura: elegidas.find(f => f.plan_cheques)?.plan_cheques ?? null,
  })
  const { cheques, difCheques, incompletos: chequesIncompletos, leyendo: leyendoFotos } = ed
  // Transferencia: siempre. E-cheq: sólo si a algún echeq le falta su archivo (20260929u).
  const pideComprobante = comprobanteObligatorio(forma, pideCheques ? cheques : [])

  // Cada fila: la plata no puede pasarse de lo pagable (saldo − NC reservada).
  const filasConError = filasQueSePasan(filas)

  const listo =
    filas.length > 0 &&
    totalPlata > 0 &&
    filasConError.length === 0 &&
    !sinDatosPago &&
    (!pideComprobante || !!comprobante) &&
    (!pideCheques || (cheques.length > 0 && chequesIncompletos.length === 0 && Math.abs(difCheques) < 0.005 && !leyendoFotos))

  /**
   * Al revés: los CHEQUES mandan y el total los sigue (2026-09-21).
   *
   * Reclamo del dueño: «cuando cargo varios pagos distintos en la OP tengo que
   * poner a mano arriba el "se paga", eso no sé qué sentido tiene». Tiene
   * razón, y era la dirección al revés: cuando se paga con cheques, los
   * cheques SON el pago —están escritos, ya se entregaron, cada uno con su
   * importe—. El total de arriba es una consecuencia, no un dato a tipear.
   * El reparto (lo más viejo primero, lo que sobra a cuenta) vive en
   * `repartirTotalEnFilas`.
   */
  function usarTotalDeLosCheques(totalCheques: number) {
    const r = repartirTotalEnFilas(totalCheques, filas)
    setFilas(r.filas)
    setACuenta(r.aCuenta)
  }

  async function subir(file: File) {
    setSubiendo('comprobante')
    try {
      const adj = await subirComprobantePendiente(file, 'comprobante_pago')
      setComprobante(adj)
      toast('Archivo listo', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setSubiendo(null)
    }
  }

  /** Cerrar sin guardar: limpiar lo que quedó colgado en el bucket. */
  async function cerrar() {
    if (comprobante) borrarComprobantePendiente(comprobante.storage_path).catch(() => {})
    for (const path of ed.fotosSubidas()) borrarComprobantePendiente(path).catch(() => {})
    onClose()
  }

  async function guardar() {
    const adjuntos: PagosAdjuntoPendiente[] = comprobante ? [comprobante] : []

    try {
      const r = await registrar.mutateAsync({
        proveedor_id: proveedorId!,
        fecha,
        // `fecha_cobro` de la orden la deriva el backend del cheque más próximo.
        cheques: pideCheques ? ed.paraEnviar() : undefined,
        forma_pago: forma,
        referencia: referencia.trim() || undefined,
        obs: obs.trim() || undefined,
        lineas: lineasDeOrden(filas, aCuenta),
        adjuntos,
        cuenta_origen_id: cuentaOrigenId(cuentaOrigen),
      })
      const pagadas = r.facturas.filter(f => f.estado === 'pagada').length
      toast(`✓ ${r.orden.numero_fmt} registrada${pagadas > 0 ? ` · ${pagadas} factura${pagadas === 1 ? '' : 's'} saldada${pagadas === 1 ? '' : 's'}` : ''}`, 'ok')
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      // Si al final no se pagó con cheque, las fotos no viajaron: se limpian.
      if (!pideCheques) for (const path of ed.fotosSubidas()) borrarComprobantePendiente(path).catch(() => {})
      onRegistrado?.(Number(r.orden.id), !!comprobante)
      onClose()   // sin limpiar: los archivos ya quedaron en la OP
    } catch (e) {
      // NO se borran los adjuntos: el reintento los reusa.
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  if (isLoading || filas.length === 0) {
    return <Modal open onClose={onClose} title="Registrar pago" width="max-w-3xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando facturas…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={cerrar} width="max-w-3xl"
      title={`Registrar pago · ${elegidas[0]?.proveedor_nom ?? ''}`}
      footer={
        <div className="flex gap-2 justify-end items-center flex-wrap">
          <div className="text-xs text-gris-dark mr-auto">
            {totalPlata > 0 && <>{salidaLabel(forma, 'presente')}: <b className="font-mono tabular-nums text-carbon">{fmtM(totalPlata)}</b></>}
          </div>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={registrar.isPending} disabled={!listo}
            title={
              sinDatosPago ? 'El proveedor no tiene CBU ni alias: cargalos primero'
              : filasConError.length > 0 ? 'Hay montos que superan el saldo de su factura'
              : totalPlata <= 0 ? 'No hay nada para pagar'
              : pideComprobante && !comprobante ? motivoComprobante(forma)
              : pideCheques && cheques.length === 0 ? 'Cargá al menos un cheque'
              : pideCheques && chequesIncompletos.length > 0 ? 'Cada cheque necesita número, fecha de cobro e importe (y el librador si es de un tercero)'
              : pideCheques && Math.abs(difCheques) >= 0.005 ? 'Los cheques no suman lo que sale de plata'
              : pideCheques && leyendoFotos ? 'Esperá a que termine de leer la foto del cheque'
              : undefined
            }>
            Registrar pago
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">

        {/*
          El pago parcial ya se podía hacer —«Se paga» es editable y la factura
          queda en «Pago parcial»— pero nadie lo sabía: el dueño preguntó cómo
          se hacía. Una línea alcanza, y va arriba de los montos, que es donde
          se mira. (2026-09-21)
        */}
        <div className="text-[11px] text-gris-dark bg-gris/40 border border-gris-mid rounded px-2.5 py-1.5">
          Podés pagar <b>una parte</b>: cambiá «Se paga» y la factura queda en <b>Pago parcial</b> con el
          saldo que muestra «Quedaría». El resto se paga después, y <b>puede ser con otra forma</b> — cada
          orden de pago lleva una sola forma, así que dos formas son dos órdenes.
        </div>

        <AvisoNcSinAplicar proveedorId={proveedorId} />

        {/* Facturas */}
        <FilasFacturasPago filas={filas}
          onMonto={(id, v) => setFilas(fs => fs.map(x => x.factura.id === id ? { ...x, monto: v } : x))} />

        {/* A cuenta */}
        <CampoACuenta value={aCuenta} onChange={setACuenta} />

        {/* Datos del pago */}
        <div className="border-t border-gris pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo label="Forma" hint={vieneDeLoPrevisto ? 'Lo previsto en la factura' : undefined}>
            <select value={forma}
              onChange={e => { setFormaElegida(true); setForma(e.target.value as PagosFormaPagoOP) }}
              className={inputCls}>
              {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>
          <Campo label="Fecha del pago">
            <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} className={inputCls} />
          </Campo>

          <Campo label="Referencia" hint="Nº de operación">
            <input value={referencia} onChange={e => setReferencia(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Sale de la cuenta" hint="opcional">
            <SelectCuentaOrigen value={cuentaOrigen} onChange={setCuentaOrigen} forma={forma} className={inputCls} />
          </Campo>
        </div>

        {pideCheques && (
          <EditorCheques ed={ed} forma={forma} fecha={fecha} totalPlata={totalPlata}
            cantFacturas={filas.length} onUsarTotalDeLosCheques={usarTotalDeLosCheques} />
        )}

        {/* Cuenta destino */}
        {necesitaCuenta && (
          <CuentaDestinoProveedor proveedorId={proveedorId} proveedor={proveedor} verPii={!!verPii} sinDatosPago={sinDatosPago} />
        )}

        {/* Comprobante */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className={`text-xs px-3 py-1.5 rounded border cursor-pointer font-semibold
            ${pideComprobante && !comprobante ? 'border-rojo text-rojo bg-rojo-light' : 'border-gris-mid bg-white hover:bg-gris'}`}>
            {subiendo === 'comprobante' ? 'Subiendo…' : comprobante ? '✓ Comprobante listo' : `📎 Comprobante${pideComprobante ? ' (obligatorio)' : ' (opcional)'}`}
            <input type="file" className="hidden" accept="image/*,application/pdf"
              onChange={e => { const file = e.target.files?.[0]; if (file) subir(file); e.target.value = '' }} />
          </label>
          {comprobante && <span className="text-xs text-gris-dark truncate max-w-[240px]">{comprobante.nombre_archivo}</span>}
          {pideComprobante && !comprobante && (
            <span className="text-[11px] text-rojo">{motivoComprobante(forma)}.</span>
          )}
          {forma === 'echeq' && !pideComprobante && !comprobante && (
            <span className="text-[11px] text-gris-dark">Cada e-cheq tiene su archivo: ése es el comprobante.</span>
          )}
        </div>

        <Campo label="Observaciones" hint="Opcional">
          <input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  )
}
