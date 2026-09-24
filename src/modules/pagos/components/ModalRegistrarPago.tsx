'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useNcDisponibles, useRegistrarOrden, subirComprobantePendiente, borrarComprobantePendiente, leerCheque,
} from '../hooks/usePagos'
import { useDatosPagoProveedor, useProveedorPagos } from '../hooks/useProveedoresPagos'
import { SelectCuentaOrigen, cuentaOrigenId } from './SelectCuentaOrigen'
import {
  FORMAS_CON_COMPROBANTE_OBLIGATORIO, FORMAS_CON_CUENTA_DESTINO, FORMAS_CON_FECHA_COBRO,
  FORMAS_PAGO_OP, MAX_ADJUNTO_BYTES, PLAZOS_CHEQUE, comprobanteTxt, fechasEscalonadas, fmtFecha, fmtM, hoyAR,
  partirEnPartes, plazoLabel, repartirPagoEntreFacturas, salidaLabel, sumarDiasISO, topePagable,
} from '../utils/pagos.utils'
import { mensajeAvisoLectura, mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosAdjuntoPendiente, PagosFactura, PagosFormaPagoOP, PagosLineaOrdenInput } from '@/types/domain.types'

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

interface FilaFactura {
  factura: PagosFactura
  /** Lo que se paga con plata. */
  monto: string
}

/** Campos del cheque que puede completar la foto. */
type CampoCheque = 'numero' | 'banco' | 'fecha_cobro' | 'monto' | 'librador'

/** Un cheque del formulario. `monto` es texto porque se tipea. */
interface ChequeFila {
  /** Identidad estable de la fila: la lectura de la foto es async y el índice puede correrse. */
  uid:         number
  numero:      string
  banco:       string
  fecha_cobro: string
  monto:       string
  es_propio:   boolean
  librador:    string
  // ── Foto del cheque (20260925) ──
  /** Ya subida a `ordenes/pendientes/`: viaja como `foto_path` y queda adjunta a la OP. */
  foto:        PagosAdjuntoPendiente | null
  /** Miniatura local (object URL); null si es PDF. */
  fotoUrl:     string | null
  leyendo:     boolean
  /** Lo que completó la foto y la persona todavía no tocó. */
  leidos:      CampoCheque[]
  avisosFoto:  string[]
  /** El librador que se leyó, para sugerirlo aunque el cheque esté como propio. */
  libradorLeido: string
}

let uidCheque = 0
const chequeVacio = (fecha_cobro: string, monto: string): ChequeFila => ({
  uid: ++uidCheque, numero: '', banco: '', fecha_cobro, monto, es_propio: true, librador: '',
  foto: null, fotoUrl: null, leyendo: false, leidos: [], avisosFoto: [], libradorLeido: '',
})

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

export function ModalRegistrarPago({ facturaIds, onClose, onRegistrado }: Props) {
  const toast = useToast()
  const { verPii } = usePermisos('pagos')
  const registrar = useRegistrarOrden()
  const datosPago = useDatosPagoProveedor()

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
  const [cheques, setCheques] = useState<ChequeFila[]>([])
  // Cómo se reparte el pago en cheques (2026-09-21). Son tres preguntas que el
  // dueño hace en voz alta al entregar: en cuántos, a qué plazo el primero, y
  // cada cuánto los demás. Antes estaba fijo en 30/60/90.
  const [cantCheques, setCantCheques] = useState('3')
  const [primerPlazo, setPrimerPlazo] = useState(30)
  const [cadaDias, setCadaDias]       = useState('30')
  const [referencia, setReferencia] = useState('')
  // «Sale de la cuenta» (20260926g): opcional, '' = sin indicar.
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [obs, setObs] = useState('')
  const [comprobante, setComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [nuevoCbu, setNuevoCbu] = useState('')
  const [nuevoAlias, setNuevoAlias] = useState('')

  // Precargar con el saldo de cada factura: es lo que se paga el 90 % de las veces.
  useEffect(() => {
    if (elegidas.length === 0 || filas.length > 0) return
    setFilas(elegidas.map(f => ({ factura: f, monto: String(topePagable(f)) })))
  }, [elegidas, filas.length])

  // Y con la forma que la factura ya tenía prevista. Las facturas llegan
  // async, así que esto no puede ser el useState inicial.
  useEffect(() => {
    if (elegidas.length === 0 || formaElegida) return
    setForma(formaSegunLoPrevisto(elegidas))
  }, [elegidas, formaElegida])

  const proveedorId = elegidas[0]?.proveedor_id ?? null
  const { data: proveedor } = useProveedorPagos(proveedorId)
  // Crédito de NC aprobadas sin aplicar: no se usa solo, pero hay que verlo
  // antes de mandar plata (decisión del dueño, 20260925).
  const ncDisp = useNcDisponibles(proveedorId)
  const ncSinAplicar = useMemo(() => {
    const items = ncDisp.data?.items ?? []
    return { cant: items.length, total: r2(items.reduce((s, f) => s + Number(f.nc_disponible ?? 0), 0)) }
  }, [ncDisp.data])

  // Para avisar que la forma no la eligió la persona: la trajo la factura.
  const vieneDeLoPrevisto = !formaElegida && elegidas.length > 0 && forma === formaSegunLoPrevisto(elegidas)

  const totalPlata = r2(filas.reduce((s, f) => s + n(f.monto), 0) + n(aCuenta))

  // El backend copia la cuenta del padrón; si falta, rebota. Mejor avisarlo
  // acá que después del POST.
  const necesitaCuenta = FORMAS_CON_CUENTA_DESTINO.includes(forma)
  const sinDatosPago   = necesitaCuenta && !proveedor?.cbu && !proveedor?.alias_cbu
  const pideComprobante = FORMAS_CON_COMPROBANTE_OBLIGATORIO.includes(forma)
  const pideCheques     = FORMAS_CON_FECHA_COBRO.includes(forma)

  // El backend exige igualdad exacta: se compara en centavos para no arrastrar
  // el error del punto flotante.
  const totalCheques  = r2(cheques.reduce((s, c) => s + n(c.monto), 0))
  const difCheques    = r2(totalPlata - totalCheques)
  const chequesIncompletos = cheques.filter(c =>
    !c.numero.trim() || !c.fecha_cobro || n(c.monto) <= 0 ||
    c.fecha_cobro < fecha || (!c.es_propio && !c.librador.trim()))

  // Mientras se lee una foto no se registra: su `foto_path` todavía no está.
  const leyendoFotos = cheques.some(c => c.leyendo)

  // Cada fila: la plata no puede pasarse de lo pagable (saldo − NC reservada).
  const filasConError = filas.filter(f => n(f.monto) - topePagable(f.factura) > 0.005)

  const listo =
    filas.length > 0 &&
    totalPlata > 0 &&
    filasConError.length === 0 &&
    !sinDatosPago &&
    (!pideComprobante || !!comprobante) &&
    (!pideCheques || (cheques.length > 0 && chequesIncompletos.length === 0 && Math.abs(difCheques) < 0.005 && !leyendoFotos))

  // El plan anotado en la factura al cargarla (20260923n): con cheque o
  // e-cheq, las filas arrancan armadas con esas fechas. Una sola vez, y sólo
  // si todavía no se cargó ningún cheque: no pisa lo que se tipeó. Una fecha
  // que ya pasó arranca en la fecha del pago.
  const planFactura = elegidas.find(f => f.plan_cheques)?.plan_cheques ?? null
  const [planAplicado, setPlanAplicado] = useState(false)
  useEffect(() => {
    if (planAplicado || !planFactura || !pideCheques || cheques.length > 0 || totalPlata <= 0) return
    const k = planFactura.cantidad
    const primero = planFactura.primer_cobro > fecha ? planFactura.primer_cobro : fecha
    const fechas = fechasEscalonadas(primero, k, 0, planFactura.cada_dias)
    setCantCheques(String(k))
    setCadaDias(String(planFactura.cada_dias))
    setCheques(partirEnPartes(totalPlata, k).map((m, i) => chequeVacio(fechas[i] ?? primero, String(m))))
    setPlanAplicado(true)
  }, [planAplicado, planFactura, pideCheques, cheques.length, totalPlata, fecha])

  // ── Cheques ──
  function setCheque(i: number, cambio: Partial<ChequeFila>) {
    setCheques(cs => cs.map((c, j) => j === i ? { ...c, ...cambio } : c))
  }

  /** Lo tipea la persona: deja de decir «leído de la foto». */
  function setChequeAMano(i: number, cambio: Partial<Pick<ChequeFila, CampoCheque>>) {
    const tocados = Object.keys(cambio) as CampoCheque[]
    setCheques(cs => cs.map((c, j) => j === i
      ? { ...c, ...cambio, leidos: c.leidos.filter(k => !tocados.includes(k)) }
      : c))
  }

  function setChequeUid(uid: number, cambio: Partial<ChequeFila> | ((c: ChequeFila) => Partial<ChequeFila>)) {
    setCheques(cs => cs.map(c => c.uid === uid ? { ...c, ...(typeof cambio === 'function' ? cambio(c) : cambio) } : c))
  }

  // Las miniaturas son object URLs: se liberan al cerrar el modal.
  const urlsFotos = useRef(new Set<string>())
  useEffect(() => {
    const urls = urlsFotos.current
    return () => { for (const u of urls) URL.revokeObjectURL(u) }
  }, [])

  /**
   * «📷 Leer foto» (20260925): sube la foto como adjunto pendiente de la OP,
   * la lee con IA y completa la fila marcando lo leído. La persona revisa y
   * corrige. Si no se puede leer, la foto queda igual (se adjunta a la OP) y
   * los datos se cargan a mano. Si el importe no cierra, lo dice el aviso de
   * siempre de la suma de cheques.
   */
  async function leerFotoCheque(uid: number, file: File) {
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    const previa = cheques.find(c => c.uid === uid)
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    if (url) urlsFotos.current.add(url)
    setChequeUid(uid, { leyendo: true, avisosFoto: [] })
    let adj: PagosAdjuntoPendiente
    try {
      adj = await subirComprobantePendiente(file, 'cheque')
    } catch (e) {
      setChequeUid(uid, { leyendo: false, avisosFoto: [mensajeErrorPagos(e)] })
      return
    }
    // La foto anterior de esta fila ya no va: se borra del bucket.
    if (previa?.foto) borrarComprobantePendiente(previa.foto.storage_path).catch(() => {})
    setChequeUid(uid, { foto: adj, fotoUrl: url })
    try {
      const r = await leerCheque(adj)
      const p = r.propuesta
      setChequeUid(uid, c => {
        const cambio: Partial<ChequeFila> = {}
        const leidos: CampoCheque[] = []
        if (p.numero?.trim())      { cambio.numero = p.numero.trim(); leidos.push('numero') }
        if (p.banco?.trim())       { cambio.banco = p.banco.trim(); leidos.push('banco') }
        if (p.fecha_cobro)         { cambio.fecha_cobro = p.fecha_cobro.slice(0, 10); leidos.push('fecha_cobro') }
        if (p.importe != null && p.importe > 0) { cambio.monto = String(p.importe); leidos.push('monto') }
        const librador = [p.librador?.trim(), p.librador_cuit ? `CUIT ${p.librador_cuit}` : null].filter(Boolean).join(' · ')
        // El librador sólo se usa si el cheque es de un tercero: si está como
        // propio se guarda para ofrecerlo al tildar «De tercero».
        if (librador && !c.es_propio) { cambio.librador = librador; leidos.push('librador') }
        const avisos = (r.avisos ?? []).map(a => mensajeAvisoLectura(a)).filter(Boolean)
        if (p.es_echeq && forma === 'cheque') avisos.push('La foto parece de un e-cheq, y la forma de pago elegida es cheque.')
        if (leidos.length === 0) avisos.push('No se pudo sacar ningún dato de la foto: cargalos a mano. La foto queda adjunta igual.')
        return {
          ...cambio, leyendo: false, libradorLeido: librador,
          leidos: [...new Set([...c.leidos, ...leidos])], avisosFoto: avisos,
          foto: r.storage_path ? { ...adj, storage_path: r.storage_path } : adj,
        }
      })
    } catch (e) {
      setChequeUid(uid, { leyendo: false, avisosFoto: [`${mensajeErrorPagos(e)} La foto queda adjunta igual.`] })
    }
  }

  /** «📷 Agregar desde foto»: una fila nueva que arranca con la foto. */
  function agregarDesdeFoto(file: File) {
    const nuevo = chequeVacio('', '')
    setCheques(cs => [...cs, nuevo])
    void leerFotoCheque(nuevo.uid, file)
  }

  function quitarCheque(i: number) {
    const c = cheques[i]
    if (c?.foto) borrarComprobantePendiente(c.foto.storage_path).catch(() => {})
    setCheques(cs => cs.filter((_, j) => j !== i))
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

  /**
   * Al revés: los CHEQUES mandan y el total los sigue (2026-09-21).
   *
   * Reclamo del dueño: «cuando cargo varios pagos distintos en la OP tengo que
   * poner a mano arriba el "se paga", eso no sé qué sentido tiene». Tiene
   * razón, y era la dirección al revés: cuando se paga con cheques, los
   * cheques SON el pago —están escritos, ya se entregaron, cada uno con su
   * importe—. El total de arriba es una consecuencia, no un dato a tipear.
   *
   * `ajustarUltimoCheque` iba para el otro lado: toca el cheque para que
   * cierre contra el total. Sirve para los centavos del reparto automático,
   * pero no para esto: acá el que está bien es el cheque.
   *
   * El reparto entre facturas es LO MÁS VIEJO PRIMERO, que es cómo se imputa
   * un pago: se cancela la deuda más vieja y lo que sobra sigue para la
   * siguiente. Lo que sobre después de cubrirlas todas va a «A cuenta», que es
   * exactamente lo que es: plata entregada de más, que queda a favor.
   *
   * El tope de cada factura es su `saldo_pagable`: lo reservado por una NC
   * sin aprobar no se paga con plata.
   */
  function usarTotalDeLosCheques() {
    const { porFactura, aCuenta: sobra } = repartirPagoEntreFacturas(totalCheques, filas.map(f => ({
      id: f.factura.id,
      vence_el: f.factura.vence_el,
      tope: topePagable(f.factura),
    })))
    setFilas(fs => fs.map(x => ({ ...x, monto: String(porFactura.get(x.factura.id) ?? 0) })))
    setACuenta(sobra > 0.005 ? String(sobra) : '')
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
    for (const c of cheques) if (c.foto) borrarComprobantePendiente(c.foto.storage_path).catch(() => {})
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
    }
    if (n(aCuenta) > 0) lineas.push({ tipo: 'a_cuenta', factura_id: null, monto: n(aCuenta) })

    const adjuntos: PagosAdjuntoPendiente[] = comprobante ? [comprobante] : []

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
              foto_path: c.foto?.storage_path ?? null,
            }))
          : undefined,
        forma_pago: forma,
        referencia: referencia.trim() || undefined,
        obs: obs.trim() || undefined,
        lineas,
        adjuntos,
        cuenta_origen_id: cuentaOrigenId(cuentaOrigen),
      })
      const pagadas = r.facturas.filter(f => f.estado === 'pagada').length
      toast(`✓ ${r.orden.numero_fmt} registrada${pagadas > 0 ? ` · ${pagadas} factura${pagadas === 1 ? '' : 's'} saldada${pagadas === 1 ? '' : 's'}` : ''}`, 'ok')
      for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      // Si al final no se pagó con cheque, las fotos no viajaron: se limpian.
      if (!pideCheques) for (const c of cheques) if (c.foto) borrarComprobantePendiente(c.foto.storage_path).catch(() => {})
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
              : pideComprobante && !comprobante ? 'Una transferencia o e-cheq necesita el comprobante'
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

        {ncSinAplicar.total > 0 && (
          <div className="bg-[#EEE8FF] border border-[#C9B8E8] rounded p-2 text-xs text-[#5A2D82]">
            El proveedor tiene <b className="font-mono">{fmtM(ncSinAplicar.total)}</b> en{' '}
            {ncSinAplicar.cant === 1 ? 'una nota de crédito' : `${ncSinAplicar.cant} notas de crédito`} sin aplicar.
            {' '}No se descuenta solo: si corresponde, aplicala desde la ficha de la NC (Facturas) antes de pagar.
          </div>
        )}

        {/* Facturas */}
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

              </div>
            )
          })}
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
              <div key={c.uid} className="border-b border-gris last:border-0 p-2.5 flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-2 items-end">
                  <FotoCheque c={c} onElegir={file => void leerFotoCheque(c.uid, file)} />
                  <Campo label="Número" ancho="w-28" leido={c.leidos.includes('numero')}>
                    <input value={c.numero} onChange={e => setChequeAMano(i, { numero: e.target.value })}
                      className={inputCls} placeholder="00012345" />
                  </Campo>
                  <Campo label="Banco" ancho="w-32" leido={c.leidos.includes('banco')}>
                    <input value={c.banco} onChange={e => setChequeAMano(i, { banco: e.target.value })} className={inputCls} />
                  </Campo>
                  <Campo label="Se cobra el" hint={plazoDe(c.fecha_cobro)} ancho="w-36" leido={c.leidos.includes('fecha_cobro')}>
                    <input type="date" value={c.fecha_cobro} min={fecha}
                      onChange={e => setChequeAMano(i, { fecha_cobro: e.target.value })} className={inputCls} />
                  </Campo>
                  <Campo label="Importe" ancho="w-32" leido={c.leidos.includes('monto')}>
                    <InputMonto value={c.monto} onChange={v => setChequeAMano(i, { monto: v })}
                      className="text-right font-mono tabular-nums py-2 rounded" />
                  </Campo>
                  <label className="flex items-center gap-1 text-xs pb-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={!c.es_propio}
                      onChange={e => setCheque(i, {
                        es_propio: !e.target.checked,
                        // Al tildar «De tercero» se ofrece el librador leído de la foto.
                        librador: e.target.checked ? (c.librador || c.libradorLeido) : '',
                        leidos: e.target.checked && !c.librador && c.libradorLeido
                          ? [...c.leidos, 'librador'] : c.leidos.filter(k => k !== 'librador'),
                      })} />
                    De tercero
                  </label>
                  {!c.es_propio && (
                    <Campo label="Librador" hint="De quién era" ancho="w-44" leido={c.leidos.includes('librador')}>
                      <input value={c.librador} onChange={e => setChequeAMano(i, { librador: e.target.value })}
                        className={inputCls} placeholder="Quién lo libró" />
                    </Campo>
                  )}
                  <button type="button" onClick={() => quitarCheque(i)} disabled={c.leyendo}
                    title={c.leyendo ? 'Esperá a que termine de leer la foto' : undefined}
                    className="ml-auto text-xs text-rojo hover:underline pb-1.5 disabled:opacity-50 disabled:no-underline">Quitar</button>
                </div>
                {c.leyendo && <div className="text-[11px] text-azul animate-pulse">Leyendo la foto del cheque…</div>}
                {c.leidos.length > 0 && !c.leyendo && (
                  <div className="text-[11px] text-gris-dark">📷 Los campos marcados se leyeron de la foto: revisalos antes de registrar.</div>
                )}
                {c.es_propio && c.libradorLeido && !c.leyendo && (
                  <div className="text-[11px] text-gris-dark">La foto dice que lo libró <b>{c.libradorLeido}</b>. Si no es de CADINC, tildá «De tercero».</div>
                )}
                {c.avisosFoto.map((a, k) => (
                  <div key={k} className="text-[11px] text-[#7A5000]">⚠ {a}</div>
                ))}
              </div>
            ))}

            {/*
              Las dos direcciones, y cuál usar. Antes había sólo «ajustar», que
              toca el CHEQUE para que cierre contra el total de arriba — y el
              dueño venía tipeando el total a mano porque es la dirección al
              revés: los cheques ya están escritos. (2026-09-21)
            */}
            {Math.abs(difCheques) >= 0.005 && cheques.length > 0 && (
              <div className="px-2.5 py-2 border-t border-gris-mid bg-rojo-light/40 flex flex-col gap-1.5">
                <div className="text-xs text-carbon">
                  Los cheques suman <b className="font-mono">{fmtM(totalCheques)}</b> y arriba se está
                  pagando <b className="font-mono">{fmtM(totalPlata)}</b>. Tienen que dar igual.
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Button variant="secondary" size="sm" onClick={usarTotalDeLosCheques}>
                    Usar lo que suman los cheques
                  </Button>
                  <span className="text-[11px] text-gris-dark">
                    {filas.length > 1
                      ? 'Reparte entre las facturas empezando por la que vence primero; si sobra, va a «A cuenta».'
                      : 'Pone ese importe arriba; si pasa del saldo, la diferencia va a «A cuenta».'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Button variant="ghost" size="sm" onClick={ajustarUltimoCheque}>
                    Cambiar el último cheque
                  </Button>
                  <span className="text-[11px] text-gris-dark">
                    Al revés: le suma {fmtM(difCheques)} al último cheque para que cierre. Para los centavos del reparto.
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 border-t border-gris-mid">
              <Button variant="ghost" size="sm" onClick={agregarCheque}>+ Agregar cheque</Button>
              <label className="text-xs px-2.5 py-1.5 rounded hover:bg-gris cursor-pointer font-semibold text-gris-dark"
                title="Sacale una foto al cheque: se completa solo y queda adjunto a la orden">
                📷 Agregar desde foto
                <input type="file" className="hidden" accept="image/*,application/pdf" capture="environment"
                  onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) agregarDesdeFoto(file) }} />
              </label>
              <div className="ml-auto text-xs text-right">
                <span className="text-gris-dark">Suman </span>
                <b className="font-mono tabular-nums">{fmtM(totalCheques)}</b>
                <span className="text-gris-dark"> de {fmtM(totalPlata)}</span>
                {Math.abs(difCheques) >= 0.005 && (
                  <span className="ml-2 text-rojo font-semibold">
                    {difCheques > 0 ? `faltan ${fmtM(difCheques)}` : `sobran ${fmtM(-difCheques)}`}
                  </span>
                )}
              </div>
            </div>
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
        <div className="flex items-center gap-2 flex-wrap">
          <label className={`text-xs px-3 py-1.5 rounded border cursor-pointer font-semibold
            ${pideComprobante && !comprobante ? 'border-rojo text-rojo bg-rojo-light' : 'border-gris-mid bg-white hover:bg-gris'}`}>
            {subiendo === 'comprobante' ? 'Subiendo…' : comprobante ? '✓ Comprobante listo' : `📎 Comprobante${pideComprobante ? ' (obligatorio)' : ' (opcional)'}`}
            <input type="file" className="hidden" accept="image/*,application/pdf"
              onChange={e => { const file = e.target.files?.[0]; if (file) subir(file); e.target.value = '' }} />
          </label>
          {comprobante && <span className="text-xs text-gris-dark truncate max-w-[240px]">{comprobante.nombre_archivo}</span>}
          {pideComprobante && !comprobante && (
            <span className="text-[11px] text-rojo">Una transferencia o e-cheq necesita el comprobante.</span>
          )}
        </div>

        <Campo label="Observaciones" hint="Opcional">
          <input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark'

function Campo({ label, hint, ancho, leido, children }: { label: string; hint?: string; ancho?: string; leido?: boolean; children: React.ReactNode }) {
  return (
    <div className={ancho}>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
        {leido && (
          <span title="Leído de la foto: revisalo" className="ml-1 px-1 rounded border border-azul/30 bg-azul/5 text-azul text-[10px] font-semibold">📷 leído</span>
        )}
      </label>
      {children}
    </div>
  )
}

/**
 * Botón «📷 Leer foto» de la fila, con la miniatura de la foto ya subida. En
 * el celular `capture` abre la cámara directo.
 */
function FotoCheque({ c, onElegir }: { c: ChequeFila; onElegir: (f: File) => void }) {
  return (
    <div className="flex items-end gap-1.5">
      {c.foto && (
        c.fotoUrl
          ? <a href={c.fotoUrl} target="_blank" rel="noreferrer" title={c.foto.nombre_archivo}>
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no pasa por next/image */}
              <img src={c.fotoUrl} alt="Foto del cheque" className="w-14 h-9 object-cover rounded border border-gris-mid" />
            </a>
          : <span className="w-14 h-9 flex items-center justify-center rounded border border-gris-mid text-[10px] text-gris-dark" title={c.foto.nombre_archivo}>📄 PDF</span>
      )}
      <label className={`text-xs px-2 py-2 rounded border border-gris-mid bg-white font-semibold whitespace-nowrap
        ${c.leyendo ? 'opacity-60 cursor-wait' : 'hover:bg-gris cursor-pointer'}`}
        title={c.foto ? 'Cambiar la foto y volver a leerla' : 'Sacale una foto al cheque: completa número, banco, fecha e importe'}>
        {c.leyendo ? 'Leyendo…' : c.foto ? '📷 Otra foto' : '📷 Leer foto'}
        <input type="file" className="hidden" accept="image/*,application/pdf" capture="environment" disabled={c.leyendo}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onElegir(file) }} />
      </label>
    </div>
  )
}
