'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useRegistrarOrden, subirComprobantePendiente, borrarComprobantePendiente,
} from '../hooks/usePagos'
import { useDatosPagoProveedor, useProveedorPagos } from '../hooks/useProveedoresPagos'
import {
  FORMAS_CON_COMPROBANTE_OBLIGATORIO, FORMAS_CON_CUENTA_DESTINO, FORMAS_CON_FECHA_COBRO,
  FORMAS_PAGO_OP, PLAZOS_CHEQUE, comprobanteTxt, fechasEscalonadas, fmtFecha, fmtM, hoyAR,
  partirEnPartes, plazoLabel, sumarDiasISO,
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

/** Un cheque del formulario. `monto` es texto porque se tipea. */
interface ChequeFila {
  numero:      string
  banco:       string
  fecha_cobro: string
  monto:       string
  es_propio:   boolean
  librador:    string
}

const chequeVacio = (fecha_cobro: string, monto: string): ChequeFila =>
  ({ numero: '', banco: '', fecha_cobro, monto, es_propio: true, librador: '' })

/**
 * Con qué forma arranca el modal (2026-09-21).
 *
 * Pedido del dueño: «cuando cargo un pago no está por defecto el formulario
 * según la solicitud de pago, está medio confuso». Tenía razón — arrancaba
 * fijo en «Transferencia» aunque la factura dijera otra cosa, así que la
 * forma prevista que se eligió al cargarla no servía para nada al pagar y
 * había que volver a elegirla de memoria.
 *
 * Se usa la prevista SÓLO si todas las facturas de la OP coinciden. Una OP
 * puede cubrir varias facturas, y si preveían formas distintas adivinar sería
 * peor que no adivinar: queda el default y lo elige la persona.
 *
 * `cta_cte` no está en FORMAS_PAGO_OP a propósito (quedar en cuenta corriente
 * no es un pago), así que cae al default. Es justamente la factura que llega
 * al momento de pagarse y todavía no sabe con qué se va a pagar.
 */
const FORMA_POR_DEFECTO: PagosFormaPagoOP = 'transferencia'

export function formaSegunLoPrevisto(facturas: PagosFactura[]): PagosFormaPagoOP {
  if (facturas.length === 0) return FORMA_POR_DEFECTO
  const previstas = new Set(facturas.map(f => f.forma_pago_prevista))
  if (previstas.size !== 1) return FORMA_POR_DEFECTO
  const unica = [...previstas][0]
  return FORMAS_PAGO_OP.some(f => f.key === unica) ? (unica as PagosFormaPagoOP) : FORMA_POR_DEFECTO
}

/**
 * Lo tipeado → número. Usa el MISMO parser que `InputMonto` (2026-09-21), así
 * el punto del teclado numérico y la coma dan lo mismo en todo el sistema.
 * Antes acá el punto era separador de MILES: tipear "24994.52" daba
 * $2.499.452, cien veces de más y sin aviso.
 */
const n = (s: string) => {
  const v = Number(aRaw(String(s), 2))
  return Number.isFinite(v) ? v : 0
}
const r2 = (v: number) => Math.round(v * 100) / 100
/** Entero de un input de texto; 0 si está vacío o es basura. */
const nEntero = (s: string) => {
  const v = parseInt(String(s), 10)
  return Number.isFinite(v) ? v : 0
}

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
  const [forma, setForma] = useState<PagosFormaPagoOP>(FORMA_POR_DEFECTO)
  // Una vez que la persona elige, el default no vuelve a pisarla.
  const [formaElegida, setFormaElegida] = useState(false)
  const [fecha, setFecha] = useState(hoyAR())
  const [cheques, setCheques] = useState<ChequeFila[]>([])
  // Cómo se reparte el pago en cheques (2026-09-21). Son tres preguntas que el
  // dueño hace en voz alta al entregar: en cuántos, a qué plazo el primero, y
  // cada cuánto los demás. Antes estaba fijo en 30/60/90.
  const [cantCheques, setCantCheques] = useState('3')
  const [primerPlazo, setPrimerPlazo] = useState(30)
  const [cadaDias, setCadaDias]       = useState('30')
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

  const totalPlata = r2(filas.reduce((s, f) => s + n(f.monto), 0) + n(aCuenta))
  const totalNc    = r2(filas.reduce((s, f) => s + (f.nc ? n(f.nc.monto) : 0), 0))
  const soloNc     = totalPlata === 0 && totalNc > 0

  // El backend copia la cuenta del padrón; si falta, rebota. Mejor avisarlo
  // acá que después del POST.
  const necesitaCuenta = FORMAS_CON_CUENTA_DESTINO.includes(forma) && !soloNc
  const sinDatosPago   = necesitaCuenta && !proveedor?.cbu && !proveedor?.alias_cbu
  const pideComprobante = !soloNc && FORMAS_CON_COMPROBANTE_OBLIGATORIO.includes(forma)
  const pideCheques     = !soloNc && FORMAS_CON_FECHA_COBRO.includes(forma)

  // El backend exige igualdad exacta: se compara en centavos para no arrastrar
  // el error del punto flotante.
  const totalCheques  = r2(cheques.reduce((s, c) => s + n(c.monto), 0))
  const difCheques    = r2(totalPlata - totalCheques)
  const chequesIncompletos = cheques.filter(c =>
    !c.numero.trim() || !c.fecha_cobro || n(c.monto) <= 0 ||
    c.fecha_cobro < fecha || (!c.es_propio && !c.librador.trim()))

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
    (!pideCheques || (cheques.length > 0 && chequesIncompletos.length === 0 && Math.abs(difCheques) < 0.005))

  // ── Cheques ──
  function setCheque(i: number, cambio: Partial<ChequeFila>) {
    setCheques(cs => cs.map((c, j) => j === i ? { ...c, ...cambio } : c))
  }

  /**
   * Parte lo que sale de plata en `k` cheques iguales y les pone las fechas de
   * cobro según el plazo elegido: «tres a 30, 60 y 90», «dos al día y a 30»,
   * «uno a 7». La última parte absorbe los centavos para que la suma cierre
   * exacto — el backend compara por igualdad estricta.
   *
   * Conserva número, banco y librador de las filas que ya estaban: cambiar el
   * plazo después de tipear los números no obliga a tipearlos de nuevo.
   */
  function generarCheques() {
    const k = Math.trunc(nEntero(cantCheques))
    if (totalPlata <= 0 || k <= 0) return
    const partes = partirEnPartes(totalPlata, k)
    const fechas = fechasEscalonadas(fecha, k, primerPlazo, nEntero(cadaDias))
    setCheques(cs => partes.map((m, i) => ({
      ...(cs[i] ?? chequeVacio('', '')),
      fecha_cobro: fechas[i] ?? fecha,
      monto: String(m),
    })))
  }

  /** El plazo que quedó, en días desde la fecha del pago. Se lee al lado de
   *  cada fecha para reconocer «el de 60» sin contar en el calendario. */
  function plazoDe(fechaCobro: string): string | undefined {
    if (!fechaCobro || fechaCobro < fecha) return undefined
    const dias = Math.round(
      (new Date(`${fechaCobro}T12:00:00`).getTime() - new Date(`${fecha}T12:00:00`).getTime()) / 86_400_000)
    return plazoLabel(dias)
  }

  /** Uno más, siguiendo el paso elegido desde el último cargado. */
  function agregarCheque() {
    setCheques(cs => {
      const paso = Math.max(0, nEntero(cadaDias))
      const ultima = cs.length > 0 ? cs[cs.length - 1]!.fecha_cobro || fecha : null
      const siguiente = ultima ? sumarDiasISO(ultima, paso) : sumarDiasISO(fecha, primerPlazo)
      return [...cs, chequeVacio(siguiente, String(Math.max(0, difCheques)))]
    })
  }

  /** Lo que falta o sobra va al último: evita el rebote por centavos. */
  function ajustarUltimoCheque() {
    setCheques(cs => cs.map((c, i) => i === cs.length - 1 ? { ...c, monto: String(r2(n(c.monto) + difCheques)) } : c))
  }

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
        // `fecha_cobro` de la orden la deriva el backend del cheque más próximo.
        cheques: pideCheques
          ? cheques.map(c => ({
              numero: c.numero.trim(), banco: c.banco.trim(), fecha_cobro: c.fecha_cobro,
              monto: n(c.monto), es_propio: c.es_propio,
              librador: c.es_propio ? '' : c.librador.trim(), obs: '',
            }))
          : undefined,
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
              : pideCheques && cheques.length === 0 ? 'Cargá al menos un cheque'
              : pideCheques && chequesIncompletos.length > 0 ? 'Cada cheque necesita número, fecha de cobro e importe (y el librador si es de un tercero)'
              : pideCheques && Math.abs(difCheques) >= 0.005 ? 'Los cheques no suman lo que sale de plata'
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
                    <InputMonto value={f.monto}
                      onChange={v => setFilas(fs => fs.map(x => x.factura.id === f.factura.id ? { ...x, monto: v } : x))}
                      className={`font-mono text-right py-2 rounded ${excede ? '!border-rojo' : ''}`} />
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
                      <InputMonto value={f.nc.monto}
                        onChange={v => setFilas(fs => fs.map(x => x.factura.id === f.factura.id && x.nc ? { ...x, nc: { ...x.nc, monto: v } } : x))}
                        className="font-mono text-right py-2 rounded" />
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
            <InputMonto value={aCuenta} onChange={setACuenta}
              placeholder="0" className="font-mono text-right py-2 rounded" />
          </div>
          <div className="text-[11px] text-gris-dark flex-1 min-w-[200px] pb-2">
            Plata que se le adelanta al proveedor sin factura. Queda como saldo a favor para aplicar después.
          </div>
        </div>

        {/* Datos del pago */}
        <div className="border-t border-gris pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo label="Forma" hint={vieneDeLoPrevisto ? 'Lo previsto en la factura' : undefined}>
            <select value={forma}
              onChange={e => { setFormaElegida(true); setForma(e.target.value as PagosFormaPagoOP) }}
              disabled={soloNc} className={inputCls}>
              {FORMAS_PAGO_OP.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>
          <Campo label="Fecha del pago">
            <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} className={inputCls} />
          </Campo>

          <Campo label="Referencia" hint="Nº de operación">
            <input value={referencia} onChange={e => setReferencia(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        {pideCheques && (
          <div className="border border-gris-mid rounded">
            <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 bg-gris/40 border-b border-gris-mid">
              <span className="text-xs font-bold uppercase tracking-wide text-gris-dark">
                {forma === 'echeq' ? 'E-cheqs' : 'Cheques'}
              </span>
              {/* En cuántos se parte y a qué plazo. Un click en vez de tipear
                  fila por fila, y sin el 30/60/90 fijo de antes. */}
              <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
                <span className="text-[11px] text-gris-dark">Partir en</span>
                <input inputMode="numeric" value={cantCheques} aria-label="Cantidad de cheques"
                  onChange={e => setCantCheques(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-11 px-1.5 py-0.5 text-[11px] text-right font-mono tabular-nums border border-gris-mid rounded bg-white" />
                <span className="text-[11px] text-gris-dark">· primero</span>
                <select value={primerPlazo} onChange={e => setPrimerPlazo(Number(e.target.value))}
                  aria-label="Plazo del primer cheque"
                  className="px-1.5 py-0.5 text-[11px] border border-gris-mid rounded bg-white">
                  {PLAZOS_CHEQUE.map(d => <option key={d} value={d}>{plazoLabel(d)}</option>)}
                </select>
                <span className="text-[11px] text-gris-dark">· después cada</span>
                <input inputMode="numeric" value={cadaDias} aria-label="Días entre cheques"
                  onChange={e => setCadaDias(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="w-11 px-1.5 py-0.5 text-[11px] text-right font-mono tabular-nums border border-gris-mid rounded bg-white" />
                <span className="text-[11px] text-gris-dark">días</span>
                <Button variant="secondary" size="sm" onClick={generarCheques}
                  disabled={totalPlata <= 0 || nEntero(cantCheques) <= 0}
                  title={totalPlata <= 0 ? 'Primero poné cuánto se paga' : 'Rehace las filas con estos plazos y el importe repartido'}>
                  Generar
                </Button>
              </div>
            </div>

            {cheques.length === 0 && (
              <div className="px-2.5 py-3 text-xs text-gris-dark">
                Sin cheques cargados. Poné en cuántos se parte y tocá «Generar», o agregá uno a mano.
                {totalPlata > 0 && nEntero(cantCheques) > 0 && (
                  <div className="mt-1 text-[11px]">
                    Quedarían {nEntero(cantCheques)} de <b className="font-mono tabular-nums">
                      {fmtM(totalPlata / nEntero(cantCheques))}</b>, el primero el{' '}
                    <b>{fmtFecha(sumarDiasISO(fecha, primerPlazo))}</b>
                    {nEntero(cantCheques) > 1 && <> y el último el{' '}
                      <b>{fmtFecha(sumarDiasISO(fecha, primerPlazo + nEntero(cadaDias) * (nEntero(cantCheques) - 1)))}</b></>}.
                  </div>
                )}
              </div>
            )}

            {cheques.map((c, i) => (
              <div key={i} className="border-b border-gris last:border-0 p-2.5 flex flex-wrap gap-2 items-end">
                <Campo label="Número" ancho="w-28">
                  <input value={c.numero} onChange={e => setCheque(i, { numero: e.target.value })}
                    className={inputCls} placeholder="00012345" />
                </Campo>
                <Campo label="Banco" ancho="w-32">
                  <input value={c.banco} onChange={e => setCheque(i, { banco: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Se cobra el" hint={plazoDe(c.fecha_cobro)} ancho="w-36">
                  <input type="date" value={c.fecha_cobro} min={fecha}
                    onChange={e => setCheque(i, { fecha_cobro: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Importe" ancho="w-32">
                  <InputMonto value={c.monto} onChange={v => setCheque(i, { monto: v })}
                    className="text-right font-mono tabular-nums py-2 rounded" />
                </Campo>
                <label className="flex items-center gap-1 text-xs pb-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={!c.es_propio}
                    onChange={e => setCheque(i, { es_propio: !e.target.checked, librador: e.target.checked ? c.librador : '' })} />
                  De tercero
                </label>
                {!c.es_propio && (
                  <Campo label="Librador" hint="De quién era" ancho="w-44">
                    <input value={c.librador} onChange={e => setCheque(i, { librador: e.target.value })}
                      className={inputCls} placeholder="Quién lo libró" />
                  </Campo>
                )}
                <button type="button" onClick={() => setCheques(cs => cs.filter((_, j) => j !== i))}
                  className="ml-auto text-xs text-rojo hover:underline pb-1.5">Quitar</button>
              </div>
            ))}

            <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 border-t border-gris-mid">
              <Button variant="ghost" size="sm" onClick={agregarCheque}>+ Agregar cheque</Button>
              <div className="ml-auto text-xs">
                <span className="text-gris-dark">Suman </span>
                <b className="font-mono tabular-nums">{fmtM(totalCheques)}</b>
                <span className="text-gris-dark"> de {fmtM(totalPlata)}</span>
                {Math.abs(difCheques) >= 0.005 && (
                  <span className="ml-2 text-rojo">
                    {difCheques > 0 ? `Faltan ${fmtM(difCheques)}` : `Sobran ${fmtM(-difCheques)}`}
                    <button type="button" onClick={ajustarUltimoCheque} className="ml-1 underline">ajustar</button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

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

function Campo({ label, hint, ancho, children }: { label: string; hint?: string; ancho?: string; children: React.ReactNode }) {
  return (
    <div className={ancho}>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
      </label>
      {children}
    </div>
  )
}
