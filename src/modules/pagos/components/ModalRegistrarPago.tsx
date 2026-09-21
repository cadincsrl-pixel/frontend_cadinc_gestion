'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useRegistrarOrden, subirComprobantePendiente, borrarComprobantePendiente,
} from '../hooks/usePagos'
import { useDatosPagoProveedor, useProveedorPagos } from '../hooks/useProveedoresPagos'
import {
  FORMAS_CON_COMPROBANTE_OBLIGATORIO, FORMAS_CON_CUENTA_DESTINO, FORMAS_CON_FECHA_COBRO,
  FORMAS_PAGO_OP, comprobanteTxt, fmtFecha, fmtM, hoyAR,
} from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosAdjuntoPendiente, PagosFactura, PagosFormaPagoOP, PagosLineaOrdenInput } from '@/types/domain.types'

/**
 * Registrar el pago: una orden de pago que cubre N facturas del mismo
 * proveedor.
 *
 * Tres reglas que la pantalla tiene que dejar obvias:
 *
 *  - La NOTA DE CRÉDITO baja el saldo de la factura pero NO es plata que sale.
 *    Por eso «Total a pagar» y «Acreditado por NC» son dos números distintos y
 *    el comprobante se exige solo si sale plata.
 *  - La CUENTA DESTINO no se tipea: sale del padrón. Si el proveedor no tiene
 *    CBU ni alias, se carga desde acá y recién ahí se puede transferir.
 *  - Es TODO O NADA. Si el POST rebota, los archivos ya subidos se conservan
 *    para reintentar sin volver a subirlos.
 */

interface Props {
  facturaIds: number[]
  onClose:    () => void
}

interface FilaFactura {
  factura: PagosFactura
  /** Lo que se paga con plata. */
  monto: string
  /** Nota de crédito que se aplica a esta misma factura. */
  nc: { monto: string; numero: string; fecha: string; pdf: PagosAdjuntoPendiente | null } | null
}

const n = (s: string) => {
  const v = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100

export function ModalRegistrarPago({ facturaIds, onClose }: Props) {
  const toast = useToast()
  const { verPii } = usePermisos('pagos')
  const registrar = useRegistrarOrden()
  const datosPago = useDatosPagoProveedor()

  // Se traen por id: el modal puede abrirse desde la ficha (una) o desde la
  // selección de la bandeja (varias).
  const { data: pagina, isLoading } = useFacturas(
    { estados: ['aprobada', 'pagada_parcial'], archivadas: true }, 1, 200, facturaIds.length > 0,
  )
  const elegidas = useMemo(
    () => (pagina?.items ?? []).filter(f => facturaIds.includes(f.id)),
    [pagina, facturaIds],
  )

  const [filas, setFilas] = useState<FilaFactura[]>([])
  const [aCuenta, setACuenta] = useState('')
  const [forma, setForma] = useState<PagosFormaPagoOP>('transferencia')
  const [fecha, setFecha] = useState(hoyAR())
  const [fechaCobro, setFechaCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  const [obs, setObs] = useState('')
  const [comprobante, setComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [nuevoCbu, setNuevoCbu] = useState('')
  const [nuevoAlias, setNuevoAlias] = useState('')

  // Precargar con el saldo de cada factura: es lo que se paga el 90 % de las veces.
  useEffect(() => {
    if (elegidas.length === 0 || filas.length > 0) return
    setFilas(elegidas.map(f => ({ factura: f, monto: String(f.saldo), nc: null })))
  }, [elegidas, filas.length])

  const proveedorId = elegidas[0]?.proveedor_id ?? null
  const { data: proveedor } = useProveedorPagos(proveedorId)

  const totalPlata = r2(filas.reduce((s, f) => s + n(f.monto), 0) + n(aCuenta))
  const totalNc    = r2(filas.reduce((s, f) => s + (f.nc ? n(f.nc.monto) : 0), 0))
  const soloNc     = totalPlata === 0 && totalNc > 0

  // El backend copia la cuenta del padrón; si falta, rebota. Mejor avisarlo
  // acá que después del POST.
  const necesitaCuenta = FORMAS_CON_CUENTA_DESTINO.includes(forma) && !soloNc
  const sinDatosPago   = necesitaCuenta && !proveedor?.cbu && !proveedor?.alias_cbu
  const pideComprobante = !soloNc && FORMAS_CON_COMPROBANTE_OBLIGATORIO.includes(forma)
  const pideFechaCobro  = !soloNc && FORMAS_CON_FECHA_COBRO.includes(forma)

  // Cada fila: plata + NC no puede pasarse del saldo.
  const filasConError = filas.filter(f => {
    const aplicado = n(f.monto) + (f.nc ? n(f.nc.monto) : 0)
    return aplicado - f.factura.saldo > 0.005
  })
  const ncIncompletas = filas.filter(f => f.nc && (n(f.nc.monto) <= 0 || !f.nc.numero.trim() || !f.nc.fecha || !f.nc.pdf))

  const listo =
    filas.length > 0 &&
    (totalPlata > 0 || totalNc > 0) &&
    filasConError.length === 0 &&
    ncIncompletas.length === 0 &&
    !sinDatosPago &&
    (!pideComprobante || !!comprobante) &&
    (!pideFechaCobro || !!fechaCobro)

  async function subir(file: File, destino: 'comprobante' | number) {
    setSubiendo(String(destino))
    try {
      const adj = await subirComprobantePendiente(file, destino === 'comprobante' ? 'comprobante_pago' : 'nota_credito')
      if (destino === 'comprobante') setComprobante(adj)
      else setFilas(fs => fs.map(f => f.factura.id === destino && f.nc ? { ...f, nc: { ...f.nc, pdf: adj } } : f))
      toast('Archivo listo', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setSubiendo(null)
    }
  }

  /** Cerrar sin guardar: limpiar lo que quedó colgado en el bucket. */
  async function cerrar() {
    const huerfanos = [comprobante, ...filas.map(f => f.nc?.pdf ?? null)].filter(Boolean) as PagosAdjuntoPendiente[]
    for (const a of huerfanos) borrarComprobantePendiente(a.storage_path).catch(() => {})
    onClose()
  }

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

  async function guardar() {
    const lineas: PagosLineaOrdenInput[] = []
    for (const f of filas) {
      if (n(f.monto) > 0) lineas.push({ tipo: 'factura', factura_id: f.factura.id, monto: n(f.monto) })
      if (f.nc && n(f.nc.monto) > 0) {
        lineas.push({
          tipo: 'nota_credito', factura_id: f.factura.id, monto: n(f.nc.monto),
          nc_numero: f.nc.numero.trim(), nc_fecha: f.nc.fecha,
        })
      }
    }
    if (n(aCuenta) > 0) lineas.push({ tipo: 'a_cuenta', factura_id: null, monto: n(aCuenta) })

    const adjuntos = [comprobante, ...filas.map(f => f.nc?.pdf ?? null)].filter(Boolean) as PagosAdjuntoPendiente[]

    try {
      const r = await registrar.mutateAsync({
        proveedor_id: proveedorId!,
        fecha,
        fecha_cobro: pideFechaCobro ? (fechaCobro || null) : null,
        forma_pago: soloNc ? null : forma,
        referencia: referencia.trim() || undefined,
        obs: obs.trim() || undefined,
        lineas,
        adjuntos,
      })
      const pagadas = r.facturas.filter(f => f.estado === 'pagada').length
      toast(`✓ ${r.orden.numero_fmt} registrada${pagadas > 0 ? ` · ${pagadas} factura${pagadas === 1 ? '' : 's'} saldada${pagadas === 1 ? '' : 's'}` : ''}`, 'ok')
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
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
            {totalPlata > 0 && <>Sale del banco: <b className="font-mono tabular-nums text-carbon">{fmtM(totalPlata)}</b></>}
            {totalNc > 0 && <span className="ml-2">Acreditado por NC: <b className="font-mono tabular-nums text-[#5A2D82]">{fmtM(totalNc)}</b></span>}
          </div>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={registrar.isPending} disabled={!listo}
            title={
              sinDatosPago ? 'El proveedor no tiene CBU ni alias: cargalos primero'
              : filasConError.length > 0 ? 'Hay montos que superan el saldo de su factura'
              : ncIncompletas.length > 0 ? 'Cada nota de crédito necesita número, fecha, monto y su PDF'
              : pideComprobante && !comprobante ? 'Una transferencia o e-cheq necesita el comprobante'
              : pideFechaCobro && !fechaCobro ? 'Un cheque necesita la fecha en que se cobra'
              : undefined
            }>
            {soloNc ? 'Aplicar nota de crédito' : 'Registrar pago'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">

        {/* Facturas */}
        <div className="border border-gris-mid rounded overflow-hidden">
          {filas.map(f => {
            const aplicado = n(f.monto) + (f.nc ? n(f.nc.monto) : 0)
            const excede = aplicado - f.factura.saldo > 0.005
            const quedaria = r2(f.factura.saldo - aplicado)
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
                  </div>
                  <div className="w-32">
                    <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">Se paga</label>
                    <input inputMode="decimal" value={f.monto}
                      onChange={e => setFilas(fs => fs.map(x => x.factura.id === f.factura.id ? { ...x, monto: e.target.value } : x))}
                      className={`${inputCls} font-mono text-right ${excede ? 'border-rojo' : ''}`} />
                  </div>
                  <div className="w-28 text-right">
                    <div className="text-[10px] font-semibold text-gris-dark mb-0.5">Quedaría</div>
                    <div className={`font-mono text-sm tabular-nums ${excede ? 'text-rojo font-bold' : quedaria === 0 ? 'text-verde font-bold' : ''}`}>
                      {excede ? 'se pasa' : fmtM(quedaria)}
                    </div>
                  </div>
                </div>

                {/* Nota de crédito de esta factura */}
                {f.nc ? (
                  <div className="mt-2 ml-2 pl-2 border-l-2 border-[#C9B8E8] flex flex-wrap gap-2 items-end">
                    <div className="w-28">
                      <label className="block text-[10px] font-semibold text-[#5A2D82] mb-0.5">NC · monto</label>
                      <input inputMode="decimal" value={f.nc.monto}
                        onChange={e => setFilas(fs => fs.map(x => x.factura.id === f.factura.id && x.nc ? { ...x, nc: { ...x.nc, monto: e.target.value } } : x))}
                        className={`${inputCls} font-mono text-right`} />
                    </div>
                    <div className="w-32">
                      <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">Número</label>
                      <input value={f.nc.numero}
                        onChange={e => setFilas(fs => fs.map(x => x.factura.id === f.factura.id && x.nc ? { ...x, nc: { ...x.nc, numero: e.target.value } } : x))}
                        className={inputCls} />
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] font-semibold text-gris-dark mb-0.5">Fecha</label>
                      <input type="date" value={f.nc.fecha} max={hoyAR()}
                        onChange={e => setFilas(fs => fs.map(x => x.factura.id === f.factura.id && x.nc ? { ...x, nc: { ...x.nc, fecha: e.target.value } } : x))}
                        className={inputCls} />
                    </div>
                    <label className="text-xs px-2.5 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
                      {subiendo === String(f.factura.id) ? 'Subiendo…' : f.nc.pdf ? '✓ PDF listo' : '📎 PDF de la NC'}
                      <input type="file" className="hidden" accept="image/*,application/pdf"
                        onChange={e => { const file = e.target.files?.[0]; if (file) subir(file, f.factura.id); e.target.value = '' }} />
                    </label>
                    <button type="button" className="text-rojo hover:bg-rojo-light px-2 py-1.5 rounded text-xs"
                      onClick={() => setFilas(fs => fs.map(x => x.factura.id === f.factura.id ? { ...x, nc: null } : x))}>
                      Quitar NC
                    </button>
                  </div>
                ) : (
                  <button type="button"
                    className="mt-1.5 ml-2 text-xs text-[#5A2D82] hover:underline"
                    onClick={() => setFilas(fs => fs.map(x => x.factura.id === f.factura.id
                      ? { ...x, nc: { monto: '', numero: '', fecha: hoyAR(), pdf: null } } : x))}>
                    + Nota de crédito
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="text-[11px] text-gris-dark">
          Una nota de crédito cancela deuda <b>sin que salga plata</b>: baja el saldo de la factura y no entra en el total transferido.
        </div>

        {/* A cuenta */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-40">
            <label className="block text-xs font-semibold text-gris-dark mb-1">A cuenta · opcional</label>
            <input inputMode="decimal" value={aCuenta} onChange={e => setACuenta(e.target.value)}
              placeholder="0" className={`${inputCls} font-mono text-right`} />
          </div>
          <div className="text-[11px] text-gris-dark flex-1 min-w-[200px] pb-2">
            Plata que se le adelanta al proveedor sin factura. Queda como saldo a favor para aplicar después.
          </div>
        </div>

        {/* Datos del pago */}
        <div className="border-t border-gris pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo label="Forma">
            <select value={forma} onChange={e => setForma(e.target.value as PagosFormaPagoOP)} disabled={soloNc} className={inputCls}>
              {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>
          <Campo label="Fecha del pago">
            <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} className={inputCls} />
          </Campo>
          {pideFechaCobro && (
            <Campo label="Se cobra el" hint="Queda en cartera">
              <input type="date" value={fechaCobro} min={fecha} onChange={e => setFechaCobro(e.target.value)} className={inputCls} />
            </Campo>
          )}
          <Campo label="Referencia" hint="Nº de operación">
            <input value={referencia} onChange={e => setReferencia(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        {soloNc && (
          <div className="bg-[#EEE8FF] border border-[#C9B8E8] rounded p-2 text-xs text-[#5A2D82]">
            No sale plata: esta orden solo aplica notas de crédito, así que no lleva forma de pago ni comprobante.
          </div>
        )}

        {/* Cuenta destino */}
        {necesitaCuenta && (
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
                <b className="font-mono">
                  {verPii ? (proveedor?.cbu ?? proveedor?.alias_cbu) : (proveedor?.cbu_ultimos4 ? `***${proveedor.cbu_ultimos4}` : proveedor?.alias_cbu)}
                </b>
                {proveedor?.banco && <> · {proveedor.banco}</>}
                <span className="block text-gris-dark mt-0.5">La orden guarda esta cuenta como foto: no se tipea a mano.</span>
              </>
            )}
          </div>
        )}

        {/* Comprobante */}
        {!soloNc && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`text-xs px-3 py-1.5 rounded border cursor-pointer font-semibold
              ${pideComprobante && !comprobante ? 'border-rojo text-rojo bg-rojo-light' : 'border-gris-mid bg-white hover:bg-gris'}`}>
              {subiendo === 'comprobante' ? 'Subiendo…' : comprobante ? '✓ Comprobante listo' : `📎 Comprobante${pideComprobante ? ' (obligatorio)' : ' (opcional)'}`}
              <input type="file" className="hidden" accept="image/*,application/pdf"
                onChange={e => { const file = e.target.files?.[0]; if (file) subir(file, 'comprobante'); e.target.value = '' }} />
            </label>
            {comprobante && <span className="text-xs text-gris-dark truncate max-w-[240px]">{comprobante.nombre_archivo}</span>}
            {pideComprobante && !comprobante && (
              <span className="text-[11px] text-rojo">Una transferencia o e-cheq necesita el comprobante.</span>
            )}
          </div>
        )}

        <Campo label="Observaciones" hint="Opcional">
          <input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark'

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
      </label>
      {children}
    </div>
  )
}
