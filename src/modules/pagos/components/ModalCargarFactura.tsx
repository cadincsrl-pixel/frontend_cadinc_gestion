'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useCrearFactura, useEditarFactura, useFactura, subirComprobantePendiente,
  useSubirAdjuntoPagos, subirFacturaParaLeer, leerFactura, descartarLecturaFactura,
  useFacturasAcreditables, useFacturasDetalle, usePeriodoIvaSugerido,
} from '../hooks/usePagos'
import { FILA_REPARTO_VACIA, RepartoPorObra, repartoCuadra, type FilaReparto } from './RepartoPorObra'
import { leerQrDelArchivo } from '../utils/qrFactura'
import {
  ALICUOTAS, TIPOS_TRIBUTO, NOMBRE_CBTE_ARCA, filaDeTributo, ivaDe, ivaNoCuadra, pctDeAlicuota, resumirDesglose,
  tributoDeFila, type FilaTributo,
} from '../utils/desglose'
import { useConfigPagos } from '../hooks/useConfigPagos'
import { JurisdiccionSelect } from '@/components/JurisdiccionSelect'
import { useJurisdicciones } from '@/hooks/useJurisdicciones'
import { nombreJurisdiccion } from '@/lib/utils/jurisdicciones'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import {
  FORMAS_PAGO_OP, FORMAS_PREVISTAS, FORMAS_CON_FECHA_COBRO,
  FORMAS_CON_CUENTA_DESTINO,
  TIPOS_COMPROBANTE, MAX_ADJUNTO_BYTES, MIME_ADJUNTOS, componerNumero, fechasEscalonadas, fmtFecha, fmtM, fmtMesLargo, hoyAR,
  partirEnPartes, partirNumero, sumarDiasISO,
  vencimientoSugerido, CBTE_NC_POR_LETRA, esCodigoNC, repartoProrrateado, avisoLetraCondicion,
} from '../utils/pagos.utils'
import { AcreditaA, aplicaADe, nMonto, validarAcredita, type MontosAcredita } from './AcreditaA'
import { codigoAviso, codigoErrorPagos, mensajeAvisoLectura, mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import { AltaRapidaProveedor } from './AltaRapidaProveedor'
import { SelectCuentaOrigen, cuentaOrigenId } from './SelectCuentaOrigen'
import type {
  PagosAdjuntoPendiente, PagosAlicuotaId, PagosAvisoLectura, PagosControlFactura, PagosFormaPagoOP, PagosFuenteCampo,
  PagosLecturaRes, PagosPlanCheques, PagosFormaPrevista, PagosImputacionInput, PagosTipoComprobante, PagosTributoTipo,
  PagosClaseComprobante,
} from '@/types/domain.types'

/**
 * Cargar (o corregir) una factura de proveedor.
 *
 * Dos cosas que el formulario tiene que hacer bien o la plata sale mal:
 *
 *  1. EL REPARTO POR OBRA cuadra EXACTO contra `total − percepciones`. El
 *     backend valida al centavo, así que acá se reparte y la ÚLTIMA fila
 *     absorbe el redondeo: si no, un 33,33 % × 3 rebota el POST y la persona
 *     no entiende por qué.
 *  2. LAS PERCEPCIONES NO SE REPARTEN. Son crédito fiscal de CADINC, no costo
 *     de la obra. Por eso lo imputable es el total menos las percepciones y se
 *     muestra explícito.
 *
 * Al EDITAR: cambiar importes, proveedor, vencimiento, forma o el reparto le
 * saca la aprobación a la factura. Se avisa antes, no después.
 *
 * ARCHIVO PRIMERO (20260924u). Al cargar, lo primero es soltar la factura: se
 * sube, el navegador busca el QR de ARCA y el backend la lee (QR + IA) y
 * devuelve una propuesta que precarga TODO —proveedor, comprobante, fechas,
 * CAE, IVA por alícuota, percepciones con su jurisdicción— y cada campo dice
 * de dónde salió (QR / leído / a mano). Los avisos (no cierra, proveedor
 * nuevo, receptor distinto, repetida) se muestran arriba. Nada se guarda sin
 * que la persona lo mire, y sin archivo se sigue cargando a mano.
 *
 * NOTA DE CRÉDITO (20260925). El mismo formulario carga la NC del proveedor
 * como comprobante (`clase = 'nota_credito'`): sin vencimiento, forma
 * prevista, plan de cheques ni «ya está pagada» (una NC no se paga), con
 * «Acredita a…» (a qué facturas abiertas baja deuda, tope `saldo_pagable`) o
 * «dejar como crédito a favor». La lectura la detecta sola por el código de
 * ARCA y precarga las facturas asociadas. El reparto por obra arranca con el
 * de las facturas que acredita, prorrateado. La clase no se edita después.
 */

interface Props {
  editarId?: number
  onClose:   () => void
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

export interface FilaIva {
  alicuota_id: PagosAlicuotaId
  base: string
  importe: string
  /** El importe todavía es el sugerido (base × %): cambia solo al tocar la base. */
  auto: boolean
}
export type { FilaTributo }
export type Fuente = PagosFuenteCampo | 'manual'
interface EstadoLectura {
  fase: 'leyendo' | 'lista' | 'error'
  storagePath?: string
  res?: PagosLecturaRes
  error?: string
}

export function ModalCargarFactura({ editarId, onClose }: Props) {
  const toast = useToast()
  const { esAdmin, registrarPagos } = usePermisos('pagos')
  // «Ya está pagada» registra un pago: sólo quien puede registrar pagos
  // (2026-09-23; antes Compras podía con tarjeta o efectivo).
  const puedeMarcarPagada = !!(esAdmin || registrarPagos)
  const esEdicion = !!editarId

  const { data: original, isLoading } = useFactura(editarId ?? null)
  const proveedores = useProveedoresPagos({}, 1, 300)
  const conceptos = useConceptosPagos()
  const crear  = useCrearFactura()
  const editar = useEditarFactura()
  const subirAdj = useSubirAdjuntoPagos()

  // La factura escaneada, elegida ANTES de guardar (2026-09-23). Se ve al lado
  // del formulario mientras se tipea y se sube recién cuando la factura existe:
  // así no quedan archivos huérfanos si se cancela la carga. Al subirla corre
  // el control del comprobante, que avisa en el momento si algo no coincide.
  const [archivo, setArchivo] = useState<File | null>(null)
  const previewUrl = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function elegirArchivo(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    setArchivo(file)
    if (!esEdicion) void leerArchivo(file)
  }

  /** Se sacó o se cambió el archivo: la lectura anterior no vale más. */
  function olvidarLectura() {
    lecturaSeq.current++
    if (lectura?.storagePath) void descartarLecturaFactura(lectura.storagePath).catch(() => undefined)
    setLectura(null)
    setFuentes({})
    setResueltos(new Set())
  }

  /**
   * Archivo primero: subir, buscar el QR acá, leer allá y precargar. Si algo
   * falla, el archivo se adjunta igual al guardar (como antes) y se carga a mano.
   */
  async function leerArchivo(file: File) {
    olvidarLectura()
    const seq = ++lecturaSeq.current
    setLectura({ fase: 'leyendo' })
    let storagePath: string | undefined
    try {
      const [subido, qr] = await Promise.all([subirFacturaParaLeer(file), leerQrDelArchivo(file)])
      storagePath = subido.storage_path
      if (seq !== lecturaSeq.current) { void descartarLecturaFactura(storagePath).catch(() => undefined); return }
      setLectura({ fase: 'leyendo', storagePath })
      const res = await leerFactura({ storage_path: storagePath, nombre_archivo: file.name, mime_type: file.type, qr_texto: qr })
      if (seq !== lecturaSeq.current) return
      aplicarPropuesta(res)
      setLectura({ fase: 'lista', storagePath, res })
    } catch (e) {
      if (seq !== lecturaSeq.current) return
      // Sin lectura el archivo va por el camino de siempre (se sube al guardar):
      // el que quedó en `lecturas/` se borra.
      if (storagePath) void descartarLecturaFactura(storagePath).catch(() => undefined)
      setLectura({ fase: 'error', error: mensajeErrorPagos(e) })
    }
  }

  function aplicarPropuesta(res: PagosLecturaRes) {
    const p = res.propuesta
    const f = res.fuente_por_campo
    const fu: Record<string, Fuente> = {}
    const poner = (campo: string, fuente: PagosFuenteCampo | undefined) => { if (fuente) fu[campo] = fuente }
    if (p.proveedor_id) { setProveedorId(String(p.proveedor_id)); poner('proveedor', f.emisor_cuit) }
    if (p.proveedor_nuevo) setAltaInicial(p.proveedor_nuevo)
    if (p.tipo_comprobante) { setTipo(p.tipo_comprobante); poner('tipo_comprobante', f.tipo_comprobante ?? f.cbte_tipo_arca) }
    setCbteArca(p.cbte_tipo_arca)
    // La clase la fija la lectura si el código es de NC (20260925).
    // Si no se pudo saber (sin código ni clase), queda lo que eligió la persona.
    const leidaNc = p.clase === 'nota_credito' || esCodigoNC(p.cbte_tipo_arca)
    if (leidaNc) setClase('nota_credito')
    else if (p.clase === 'factura' || p.cbte_tipo_arca != null) setClase('factura')
    if (leidaNc) {
      poner('clase', f.cbte_tipo_arca ?? f.tipo_comprobante)
      // La sugerencia viene en la raíz de la respuesta (y repetida en la propuesta).
      const sug = res.aplica_a_sugerida ?? p.aplica_a_sugerida ?? []
      setAcredita(Object.fromEntries(sug.filter(x => x.monto > 0).map(x => [String(x.factura_id), String(x.monto)])))
      setComoCredito(sug.length === 0)
    }
    if (p.punto_venta) { setPuntoVenta(p.punto_venta.replace(/\D/g, '').slice(-5)); poner('punto_venta', f.punto_venta) }
    if (p.numero_comprobante) { setNroComprobante(p.numero_comprobante.replace(/\D/g, '').slice(-8)); poner('numero_comprobante', f.numero_comprobante) }
    if (p.fecha) { setFecha(p.fecha); poner('fecha', f.fecha) }
    if (p.vence_el) { setVenceEl(p.vence_el); poner('vence_el', f.vence_el) }
    if (p.total != null) { setTotal(String(p.total)); poner('total', f.total) }
    if (p.cae) { setCae(p.cae); poner('cae', f.cae) }
    if (p.cae_vto) { setCaeVto(p.cae_vto); poner('cae_vto', f.cae_vto) }
    if (p.descripcion && !descripcion.trim()) { setDescripcion(p.descripcion); poner('descripcion', f.descripcion) }
    // El concepto sugerido por la IA (20260925): solo si todavía no se eligió uno.
    if (p.concepto_id_sugerido) {
      const sug = String(p.concepto_id_sugerido)
      setConceptoId(prev => prev || sug)
      setConceptoSugeridoId(sug)
    }
    const hayDesglose = p.iva.length > 0 || p.tributos.length > 0 || p.neto != null
    if (hayDesglose) {
      setVerDesglose(true)
      setFilasIva(p.iva.map(x => ({ alicuota_id: x.alicuota_id, base: String(x.base_imp), importe: String(x.importe), auto: false })))
      setTributos(p.tributos.map(filaDeTributo))
      setNeto(p.iva.length === 0 && p.neto != null ? String(p.neto) : '')
      setNoGravado(p.no_gravado ? String(p.no_gravado) : '')
      setExento(p.exento ? String(p.exento) : '')
      poner('iva', f.iva); poner('tributos', f.tributos); poner('neto', f.neto)
      poner('no_gravado', f.no_gravado); poner('exento', f.exento)
    }
    setFuentes(fu)
  }

  /** La persona cambió un campo que venía leído: pasa a «a mano». */
  function tocar(campo: string) {
    setFuentes(f => (f[campo] && f[campo] !== 'manual' ? { ...f, [campo]: 'manual' } : f))
  }

  /** Usar lo que dice el papel cuando no coincide con el QR. */
  function usarAlternativa(i: number, a: PagosAvisoLectura) {
    const v = a.alternativa
    if (v == null) return
    const txt = String(v)
    if (a.campo === 'numero_comprobante') setNroComprobante(txt.replace(/\D/g, '').slice(-8))
    else if (a.campo === 'punto_venta') setPuntoVenta(txt.replace(/\D/g, '').slice(-5))
    else if (a.campo === 'total') setTotal(txt)
    else if (a.campo === 'fecha') setFecha(txt)
    else if (a.campo === 'cae') setCae(txt)
    tocar(a.campo)
    setResueltos(r => new Set(r).add(i))
  }

  /** Cerrar sin guardar: el archivo leído no queda colgado en el bucket. */
  function cerrar() {
    if (!guardada.current && lectura?.storagePath) void descartarLecturaFactura(lectura.storagePath).catch(() => undefined)
    onClose()
  }

  const [proveedorId, setProveedorId] = useState('')
  const [clase, setClase] = useState<PagosClaseComprobante>('factura')
  const esNc = clase === 'nota_credito'
  // «Acredita a…» de la NC: monto por factura (id → texto). Vacío + tilde = crédito a favor.
  const [acredita, setAcredita] = useState<MontosAcredita>({})
  const [comoCredito, setComoCredito] = useState(false)
  // El reparto por obra lo tocó la persona: el prorrateo automático ya no lo pisa.
  const [repartoTocado, setRepartoTocado] = useState(false)
  const [tipo, setTipo] = useState<PagosTipoComprobante>('A')
  // Dos campos, como en el papel: punto de venta y número del comprobante.
  // Se guardan compuestos en `numero` (20260921).
  const [puntoVenta, setPuntoVenta] = useState('')
  const [nroComprobante, setNroComprobante] = useState('')
  const [fecha, setFecha] = useState(hoyAR())
  const [venceEl, setVenceEl] = useState('')
  const [total, setTotal] = useState('')
  // El desglose como lo pide ARCA (20260924u). `neto` se usa sólo si no hay
  // alícuotas (B, C o sin discriminar): con alícuotas es la suma de sus bases.
  const [neto, setNeto] = useState('')
  const [filasIva, setFilasIva] = useState<FilaIva[]>([])
  const [tributos, setTributos] = useState<FilaTributo[]>([])
  const [noGravado, setNoGravado] = useState('')
  const [exento, setExento] = useState('')
  const [cae, setCae] = useState('')
  const [caeVto, setCaeVto] = useState('')
  const [cbteArca, setCbteArca] = useState<number | null>(null)
  // Lectura del comprobante y de dónde salió cada campo.
  const [lectura, setLectura] = useState<EstadoLectura | null>(null)
  const [fuentes, setFuentes] = useState<Record<string, Fuente>>({})
  const [resueltos, setResueltos] = useState<Set<number>>(new Set())
  const [altaInicial, setAltaInicial] = useState<{ razon_social: string | null; cuit: string } | null>(null)
  const lecturaSeq = useRef(0)
  const guardada = useRef(false)
  const [formaPrevista, setFormaPrevista] = useState<PagosFormaPrevista>('transferencia')
  const [descripcion, setDescripcion] = useState('')
  // Concepto de compra (20260925): obligatorio. `conceptoSugeridoId` es el que
  // propuso la lectura; la marca se ve mientras siga elegido ese.
  const [conceptoId, setConceptoId] = useState('')
  const [conceptoSugeridoId, setConceptoSugeridoId] = useState<string | null>(null)
  const [errorConcepto, setErrorConcepto] = useState<string | null>(null)
  const [obs, setObs] = useState('')
  const [pagaCliente, setPagaCliente] = useState(false)
  // El plan de e-cheqs (20260923n): se anota al cargar para que el Excel del
  // Galicia y el modal de pago salgan precargados. Sólo con cheque / e-cheq.
  const [plan, setPlan] = useState<PagosPlanCheques | null>(null)
  const [reparto, setReparto] = useState<FilaReparto[]>([{ ...FILA_REPARTO_VACIA }])
  // Período IVA (20260927a): `YYYY-MM`. Mientras no se toque sigue a la fecha
  // (al cargar, con el sugerido del backend: el mes de la fecha, o el primero
  // abierto si ese está cerrado en Contabilidad). Solo viaja si se tocó; si
  // no, lo pone o lo ajusta la base (misma regla que acá).
  const [periodoIva, setPeriodoIva] = useState('')
  const [periodoTocado, setPeriodoTocado] = useState(false)
  const [errorPeriodo, setErrorPeriodo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [altaProveedor, setAltaProveedor] = useState(false)
  // El desglose arranca PLEGADO (2026-09-21): el dueño pidió que por ahora
  // se cargue el monto final nomás, que las retenciones confunden hasta que
  // agarren la mano. No se saca el campo: se esconde, y al editar una
  // factura que ya lo tiene cargado se abre solo para no ocultar un dato.
  const [verDesglose, setVerDesglose] = useState(false)

  // «Ya está pagada»
  const [yaPagada, setYaPagada] = useState(false)
  const [opForma, setOpForma] = useState<PagosFormaPagoOP>('efectivo')
  const [opFecha, setOpFecha] = useState(hoyAR())
  const [opRef, setOpRef] = useState('')
  // «Sale de la cuenta» (20260926g): opcional, '' = sin indicar.
  const [opCuentaOrigen, setOpCuentaOrigen] = useState('')
  const [opFechaCobro, setOpFechaCobro] = useState('')
  const [opComprobante, setOpComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  // Precargar al editar.
  useEffect(() => {
    if (!original) return
    setProveedorId(String(original.proveedor_id))
    setClase(original.clase ?? 'factura')
    if (original.clase === 'nota_credito') {
      const aps = (original.aplicaciones ?? []).filter(a => a.nc_id === original.id)
      setAcredita(Object.fromEntries(aps.map(a => [String(a.factura_id), String(a.monto)])))
      setComoCredito(aps.length === 0)
    }
    setRepartoTocado(original.imputaciones.length > 0)
    setTipo(original.tipo_comprobante)
    {
      const { pv, nro } = partirNumero(original.numero)
      setPuntoVenta(pv); setNroComprobante(nro)
    }
    setFecha(original.fecha.slice(0, 10))
    setPeriodoIva((original.periodo_iva ?? original.fecha).slice(0, 7))
    setVenceEl(original.vence_el?.slice(0, 10) ?? '')
    setTotal(String(original.total))
    {
      // El detalle guardado; si la factura es de antes del 24/09 y tiene los
      // números sueltos, se arma una fila con lo que haya para no perderlos.
      const det = original.iva_detalle ?? []
      const trib = original.tributos ?? []
      let filas: FilaIva[] = det.map(x => ({ alicuota_id: x.alicuota_id, base: String(x.base_imp), importe: String(x.importe), auto: false }))
      if (!filas.length && original.neto != null && original.iva != null && Number(original.iva) > 0) {
        const neto0 = Number(original.neto), iva0 = Number(original.iva)
        const alic = ALICUOTAS.find(a => a.pct > 0 && Math.abs(neto0 * a.pct / 100 - iva0) <= 1)?.id ?? 5
        filas = [{ alicuota_id: alic, base: String(neto0), importe: String(iva0), auto: false }]
      }
      setFilasIva(filas)
      setNeto(!filas.length && original.neto != null ? String(original.neto) : '')
      let tr: FilaTributo[] = trib.map(filaDeTributo)
      if (!tr.length) {
        if (Number(original.percepciones ?? 0) > 0) tr.push({ tipo: 'percepcion_iibb', jurisdiccion: '', jurisdiccion_id: null, descripcion: 'Percepciones cargadas sin discriminar: revisá el tipo', importe: String(original.percepciones) })
        if (Number(original.otros ?? 0) > 0) tr.push({ tipo: 'otro', jurisdiccion: '', jurisdiccion_id: null, descripcion: 'Otros (sin discriminar)', importe: String(original.otros) })
      }
      tr = tr.filter(t => Number(t.importe) > 0)
      setTributos(tr)
      setNoGravado(original.no_gravado != null ? String(original.no_gravado) : '')
      setExento(original.exento != null ? String(original.exento) : '')
      setCae(original.cae ?? '')
      setCaeVto(original.cae_vto?.slice(0, 10) ?? '')
      setCbteArca(original.cbte_tipo_arca ?? null)
      if (filas.length || tr.length || [original.neto, original.iva, original.no_gravado, original.exento].some(v => v != null)) {
        setVerDesglose(true)
      }
    }
    setFormaPrevista(original.forma_pago_prevista)
    setPlan(original.plan_cheques ?? null)
    setDescripcion(original.descripcion)
    setConceptoId(original.concepto_id ? String(original.concepto_id) : '')
    setObs(original.obs)
    setPagaCliente(original.paga_cliente)
    setReparto(
      original.imputaciones.length
        ? original.imputaciones.map(im => ({ obra_cod: im.obra_cod, monto: String(im.monto), obs: im.obs ?? '' }))
        : [{ ...FILA_REPARTO_VACIA }],
    )
  }, [original])

  // Período IVA sugerido: sigue a la fecha mientras nadie lo toque.
  const sugeridoIva = usePeriodoIvaSugerido(fecha, !periodoTocado && (!esEdicion || !!original))
  const mesFecha = fecha ? fecha.slice(0, 7) : ''
  const mesOriginal = original ? (original.periodo_iva ?? original.fecha).slice(0, 7) : ''
  const corridoOriginal = !!original?.periodo_iva_distinto
  useEffect(() => {
    if (periodoTocado || !mesFecha) return
    const sug = sugeridoIva.data?.periodo_iva.slice(0, 7) ?? mesFecha
    // Al editar, la regla del trigger: si no estaba corrido sigue a la fecha;
    // si estaba corrido, se queda salvo que la fecha nueva lo pase.
    if (esEdicion) {
      if (!mesOriginal) return
      // Sin tocar la fecha, se muestra lo guardado (el sugerido puede ser otro
      // si ese mes se cerró después).
      const fechaOriginal = original ? original.fecha.slice(0, 7) : ''
      setPeriodoIva(corridoOriginal ? (mesOriginal > mesFecha ? mesOriginal : mesFecha)
        : mesFecha === fechaOriginal ? mesOriginal : sug)
    } else {
      setPeriodoIva(sug)
    }
  }, [esEdicion, periodoTocado, sugeridoIva.data, mesFecha, mesOriginal, corridoOriginal])
  const periodoCorrido = !periodoTocado && !!sugeridoIva.data?.corrido && !(esEdicion && corridoOriginal)
  const periodoOk = !periodoTocado || !periodoIva || !mesFecha || periodoIva >= mesFecha

  const proveedor = useMemo(
    () => (proveedores.data?.items ?? []).find(p => String(p.id) === proveedorId),
    [proveedores.data, proveedorId],
  )

  // Vencimiento sugerido según cómo cierre ESE proveedor: a x días de la
  // factura, o por cierre mensual de cuenta corriente (20260921g). SOLO en
  // comprobantes fiscales: un recibo o un ticket ya están pagados, no tienen
  // vencimiento y ponérselo los mete en «vencidas» sin sentido.
  useEffect(() => {
    if (esEdicion || esNc || venceEl || !proveedor || !fecha) return
    if (!['A', 'B', 'C'].includes(tipo)) return
    const sug = vencimientoSugerido(fecha, proveedor)
    if (sug) setVenceEl(sug)
  }, [proveedor, fecha, tipo, esEdicion, esNc, venceEl])

  const totalN = n(total)
  const conCheques = formaPrevista === 'echeq' || formaPrevista === 'cheque'
  const ivaValidas = filasIva.filter(f => n(f.base) || n(f.importe))
  const tributosValidos = tributos.filter(t => n(t.importe) > 0)
  const resumen = resumirDesglose({
    iva: ivaValidas.map(f => ({ alicuota_id: f.alicuota_id, base: n(f.base), importe: n(f.importe) })),
    tributos: tributosValidos.map(t => ({ tipo: t.tipo, importe: n(t.importe) })),
    neto: n(neto), noGravado: n(noGravado), exento: n(exento), total: totalN,
  })
  // Las percepciones no se reparten entre obras (§5.18): lo imputable es el total menos ellas.
  const percN  = verDesglose ? resumen.percepciones : 0
  const imputable = r2(totalN - percN)
  // El desglose cierra si está vacío (sólo el total) o si suma el total.
  const desgloseVacio = !ivaValidas.length && !tributosValidos.length && !n(neto) && !n(noGravado) && !n(exento)
  const desgloseOk = !verDesglose || desgloseVacio || resumen.cierra
  // Una importada de ARCA sin imputar (20260927b) no lleva reparto al editar:
  // concepto y obras se cargan con «Imputar» desde la ficha.
  const sinImputar = !!original?.sin_imputar
  const repartoOk = sinImputar || repartoCuadra(reparto, imputable)
  const cambiarReparto = useCallback((filas: FilaReparto[], manual: boolean) => {
    if (manual) setRepartoTocado(true)
    setReparto(filas)
  }, [])

  // ── Acredita a… (solo NC) ──
  // Lo que declara aplicar solo se cambia mientras la NC está pendiente u
  // observada (NC_APLICACION_CONGELADA si no); aprobada, se usa «Aplicar crédito».
  const acreditaEditable = !esEdicion || (!!original && ['pendiente', 'observada'].includes(original.estado))
  const candidatas = useFacturasAcreditables(proveedorId ? Number(proveedorId) : null, esNc)
  // Al editar, la vista ya le restó a cada factura lo que reserva ESTA NC: se
  // le devuelve al tope (el backend valida «excluyendo la propia NC»).
  const topeExtra = useMemo(() => {
    if (!original || original.clase !== 'nota_credito') return undefined
    return Object.fromEntries((original.aplicaciones ?? []).filter(a => a.nc_id === original.id)
      .map(a => [a.factura_id, Number(a.monto)])) as Record<number, number>
  }, [original])
  const facturasAcreditables = useMemo(
    () => (candidatas.data?.items ?? []).filter(f => f.clase !== 'nota_credito' && String(f.proveedor_id) === proveedorId),
    [candidatas.data, proveedorId],
  )
  const valAcredita = validarAcredita(comoCredito ? {} : acredita, facturasAcreditables, totalN, topeExtra)
  const acreditaOk = !esNc || !acreditaEditable || comoCredito ||
    (valAcredita.suma > 0 && !valAcredita.excedeTotal && Object.keys(valAcredita.errores).length === 0)

  // Reparto por defecto de la NC: el de las facturas que acredita, prorrateado
  // por lo aplicado a cada una. Solo mientras la persona no lo tocó.
  const idsAcreditadas = useMemo(
    () => (esNc && !comoCredito ? aplicaADe(acredita).map(x => x.factura_id).sort((a, b) => a - b) : []),
    [esNc, comoCredito, acredita],
  )
  const detalles = useFacturasDetalle(idsAcreditadas)
  const detallesData = detalles.map(d => d.data)
  const sugeridoNc = esNc && idsAcreditadas.length > 0 && detallesData.every(Boolean)
    ? repartoProrrateado(detallesData.map(d => ({
        aplicado: nMonto(acredita[String(d!.id)]),
        imputable: Number(d!.imputable),
        imputaciones: d!.imputaciones.map(im => ({ obra_cod: im.obra_cod, monto: Number(im.monto) })),
      })), imputable)
    : []
  // El efecto depende de un string: el array se rearma en cada render.
  const claveSugerido = sugeridoNc.map(x => `${x.obra_cod}:${x.monto}`).join('|')
  useEffect(() => {
    if (!esNc || repartoTocado || !claveSugerido) return
    setReparto(claveSugerido.split('|').map(par => {
      const i = par.lastIndexOf(':')
      return { obra_cod: par.slice(0, i), monto: par.slice(i + 1), obs: '' }
    }))
  }, [esNc, repartoTocado, claveSugerido])

  /**
   * Cambiar de proveedor: en una NC, lo que acreditaba (y el reparto que salió
   * de esas facturas) era del proveedor anterior — mandarlo daría
   * NC_OTRO_PROVEEDOR, o peor, una NC imputada a obras de otro. Se limpia.
   */
  function cambiarProveedor(v: string) {
    if (v !== proveedorId && esNc) {
      setAcredita({})
      if (!repartoTocado) setReparto([{ ...FILA_REPARTO_VACIA }])
    }
    setProveedorId(v)
    tocar('proveedor')
  }

  /** Cambiar entre factura y NC antes de guardar. Limpia lo que no aplica a la otra clase. */
  function cambiarClase(c: PagosClaseComprobante) {
    if (c === clase || esEdicion) return
    setClase(c)
    tocar('clase')
    if (c === 'nota_credito') {
      if (!['A', 'B', 'C'].includes(tipo)) setTipo('A')
      if (!esCodigoNC(cbteArca)) setCbteArca(null)
      setVenceEl(''); setPlan(null); setPagaCliente(false); setYaPagada(false)
    } else {
      if (esCodigoNC(cbteArca)) setCbteArca(null)
      setAcredita({}); setComoCredito(false)
    }
  }

  const provOpts = useMemo(
    () => (proveedores.data?.items ?? []).filter(p => p.activo || String(p.id) === proveedorId).map(p => ({
      value: String(p.id),
      label: p.razon_social,
      sub:   [p.codigo, p.cuit].filter(Boolean).join(' · ') || undefined,
      // «PRV-0001», «prv0001» y «0001»: que encuentre como sea que lo tipeen.
      search: [p.razon_social, p.cuit ?? '', p.codigo ?? '', (p.codigo ?? '').replace('-', ''), (p.codigo ?? '').replace(/^PRV-/, '')],
    })),
    [proveedores.data, proveedorId],
  )

  // Los activos, en su orden. Al editar una vieja con un concepto dado de baja
  // se lo ofrece igual (marcado), para no mostrar el select vacío.
  const conceptoOpts = useMemo(() => {
    const activos = (conceptos.data ?? []).filter(c => c.activo)
    if (original?.concepto_id && !activos.some(c => c.id === original.concepto_id)) {
      return [...activos, { id: original.concepto_id, nombre: `${original.concepto ?? 'Concepto'} (dado de baja)`, orden: null, activo: false }]
    }
    return activos
  }, [conceptos.data, original])
  const conceptoOk = !!conceptoId || sinImputar

  const formasPagada = FORMAS_PAGO_OP

  // Qué cambios le sacan la aprobación (espejo de CAMPOS_QUE_DESAPRUEBAN).
  const desaprueba = useMemo(() => {
    if (!original || original.estado !== 'aprobada') return false
    return (
      String(original.proveedor_id) !== proveedorId ||
      original.fecha.slice(0, 10) !== fecha ||
      Number(original.total) !== totalN ||
      Number(original.percepciones ?? 0) !== percN ||
      (verDesglose && Number(original.iva ?? 0) !== resumen.iva) ||
      (original.vence_el?.slice(0, 10) ?? '') !== venceEl ||
      original.forma_pago_prevista !== formaPrevista ||
      original.paga_cliente !== pagaCliente ||
      JSON.stringify(original.imputaciones.map(i => [i.obra_cod, Number(i.monto)]).sort()) !==
      JSON.stringify(reparto.filter(f => f.obra_cod).map(f => [f.obra_cod, n(f.monto)]).sort())
    )
  }, [original, proveedorId, fecha, totalN, percN, verDesglose, resumen.iva, venceEl, formaPrevista, pagaCliente, reparto])

  // Una NC no tiene pagos: lo que la congela es estar aprobada con algo aplicado.
  const tienePagos = !!original && (original.clase === 'nota_credito'
    ? !!original.aprobada_at && Number(original.nc_aplicado ?? 0) > 0
    : (original.pagado > 0 || original.acreditado > 0))
  const congelado  = tienePagos   // proveedor, fecha e importes no se tocan con pagos
  const numeroCompleto = componerNumero(puntoVenta, nroComprobante)
  const listo = !!proveedorId && !!puntoVenta && !!nroComprobante && conceptoOk &&
                totalN > 0 && descripcion.trim().length >= 3 && repartoOk && desgloseOk && acreditaOk && periodoOk &&
                (!tienePagos || motivo.trim().length >= 3)
  const leyendo = lectura?.fase === 'leyendo'
  const lecturaId = !esEdicion && lectura?.fase === 'lista' ? lectura.res?.lectura_id ?? null : null
  // Los avisos de la lectura que siguen vigentes. «No cierra» se recalcula en
  // vivo en el desglose, así que el de la lectura no se repite.
  // Letra vs condición IVA del proveedor (20260925o): se calcula en vivo con
  // la ficha elegida, así se va solo cuando se corrige la letra. El aviso
  // igual de la lectura se descarta cuando la ficha tiene condición cargada.
  const avisoLetra = esNc ? null : avisoLetraCondicion(proveedor?.condicion_iva_id, tipo)
  const letraEnVivo = proveedor?.condicion_iva_id != null
  const avisosLectura = (lectura?.res?.avisos ?? [])
    // Un aviso seco (`{ code, … }`) también puede viajar acá: se normaliza.
    .map((a, i) => ({ a: { ...a, codigo: codigoAviso(a), severidad: a.severidad ?? 'advertencia' }, i }))
    .filter(({ a, i }) => a.codigo !== 'NO_CIERRA' && !resueltos.has(i) && !(a.codigo === 'PROVEEDOR_NUEVO' && proveedorId) &&
      !(a.codigo === 'LETRA_NO_COINCIDE_CONDICION' && letraEnVivo))

  async function subirComprobante(file: File) {
    setSubiendo(true)
    try {
      setOpComprobante(await subirComprobantePendiente(file))
      toast('Comprobante listo', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar() {
    const imputaciones: PagosImputacionInput[] = reparto
      .filter(f => f.obra_cod)
      .map(f => ({ obra_cod: f.obra_cod, monto: n(f.monto), obs: f.obs || undefined }))

    // El desglose: con detalle, la base deriva neto (si hay alícuotas), IVA,
    // percepciones y otros; acá se manda el detalle y lo que no se deriva.
    const teniaDetalle = !!original && ((original.iva_detalle?.length ?? 0) > 0 || (original.tributos?.length ?? 0) > 0)
    const desglose = verDesglose && !desgloseVacio
      ? {
          neto: ivaValidas.length ? null : (neto ? n(neto) : null),
          no_gravado: noGravado ? n(noGravado) : null,
          exento: exento ? n(exento) : null,
          iva_detalle: ivaValidas.map(f => ({ alicuota_id: f.alicuota_id, base_imp: n(f.base), importe: n(f.importe) })),
          tributos: tributosValidos.map(t => tributoDeFila(t, n(t.importe))),
        }
      : {
          neto: null, iva: null, percepciones: null, otros: null, no_gravado: null, exento: null,
          // Quitar el desglose de una que lo tenía: se vacía el detalle.
          ...(teniaDetalle ? { iva_detalle: [], tributos: [] } : {}),
        }
    // El código de ARCA tiene que ser de la clase: NC → 3/8/13 (o el leído si
    // ya es de NC); factura → 1/6/11 (o el leído si no es de NC).
    const cbte = esNc
      ? (esCodigoNC(cbteArca) ? cbteArca : (CBTE_NC_POR_LETRA as Partial<Record<PagosTipoComprobante, number>>)[tipo] ?? null)
      : ((cbteArca != null && !esCodigoNC(cbteArca)) ? cbteArca : ({ A: 1, B: 6, C: 11 } as Partial<Record<PagosTipoComprobante, number>>)[tipo] ?? null)

    const comunes = {
      proveedor_id: Number(proveedorId),
      tipo_comprobante: tipo,
      numero: numeroCompleto || null,
      fecha,
      ...desglose,
      cae: cae.trim() || null,
      cae_vto: caeVto || null,
      cbte_tipo_arca: cbte,
      total: totalN,
      descripcion: descripcion.trim(),
      obs: obs.trim(),
      // Una NC no lleva vencimiento, forma prevista, plan de cheques ni
      // «la paga el cliente» (NC_TIPO_INVALIDO): esas claves ni viajan.
      ...(esNc ? {} : {
        vence_el: venceEl || null,
        forma_pago_prevista: formaPrevista,
        paga_cliente: pagaCliente,
        plan_cheques: conCheques ? plan : null,
      }),
    }
    // Sin `aplica_a` (o con el tilde) la NC queda como crédito a favor.
    const aplicaA = esNc && !comoCredito ? aplicaADe(acredita) : []

    // Una sin imputar no manda reparto (FACTURA_SIN_IMPUTAR) y el concepto
    // solo si se eligió: los dos se cargan con «Imputar».
    const clasificacion = sinImputar
      ? (conceptoId ? { concepto_id: Number(conceptoId) } : {})
      : { concepto_id: Number(conceptoId), imputaciones }
    // Período IVA: al cargar, solo si se tocó; al editar, solo si cambió.
    const periodoIvaISO = periodoIva ? `${periodoIva}-01` : null
    const periodoCambio = periodoTocado && !!original && !!periodoIvaISO && (original.periodo_iva ?? '').slice(0, 7) !== periodoIva

    try {
      if (esEdicion && editarId) {
        const r = await editar.mutateAsync({
          id: editarId, ...comunes, ...clasificacion,
          ...(periodoCambio && periodoIvaISO ? { periodo_iva: periodoIvaISO } : {}),
          ...(tienePagos ? { motivo: motivo.trim() } : {}),
          ...(esNc && acreditaEditable ? { aplica_a: aplicaA } : {}),
        })
        toast(esNc ? '✓ Nota de crédito actualizada' : '✓ Factura actualizada', 'ok')
        if (r.aprobacion_retirada) toast('Le quitó la aprobación: hay que aprobarla de nuevo', 'warn')
        for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      } else {
        const r = await crear.mutateAsync({
          ...comunes,
          concepto_id: Number(conceptoId),
          imputaciones,
          ...(periodoTocado && periodoIvaISO ? { periodo_iva: periodoIvaISO } : {}),
          lectura_id: lecturaId,
          ...(esNc ? { clase: 'nota_credito' as const, ...(aplicaA.length ? { aplica_a: aplicaA } : {}) } : { clase: 'factura' as const }),
          orden: !esNc && yaPagada ? {
            fecha: opFecha,
            forma_pago: opForma,
            referencia: opRef.trim() || undefined,
            fecha_cobro: FORMAS_CON_FECHA_COBRO.includes(opForma) ? (opFechaCobro || null) : null,
            comprobante: opComprobante,
            cuenta_origen_id: cuentaOrigenId(opCuentaOrigen),
          } : null,
        })
        guardada.current = true
        toast(esNc ? `✓ Nota de crédito cargada${aplicaA.length ? '' : ' como crédito a favor'}`
          : r.orden ? `✓ Factura cargada y pagada (${r.orden.numero_fmt})` : '✓ Factura cargada', 'ok')
        for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
        // Con lectura, el archivo ya quedó adjunto del lado del servidor.
        if (archivo && !lecturaId) {
          // La factura ya quedó guardada: si el archivo falla, no se deshace
          // nada, se avisa y se sube después desde la ficha.
          try {
            const adj = await subirAdj.mutateAsync({ entidad: 'facturas', id: r.factura.id, file: archivo, tipo: 'factura' })
            const control = (adj as { control?: PagosControlFactura | null }).control
            if (control?.estado === 'difiere') toast(`⚠ El papel no coincide: ${control.nota}`, 'warn')
          } catch {
            toast('La factura se cargó, pero el archivo no se pudo subir: subilo desde la ficha', 'warn')
          }
        }
      }
      onClose()
    } catch (e) {
      const msg = mensajeErrorPagos(e)
      const cod = codigoErrorPagos(e)
      if (cod === 'CONCEPTO_REQUERIDO' || cod === 'CONCEPTO_INVALIDO') setErrorConcepto(msg)
      if (cod?.startsWith('PERIODO_IVA_')) setErrorPeriodo(msg)
      toast(msg, 'err')
    }
  }

  if (esEdicion && isLoading) {
    return <Modal open onClose={cerrar} title="Editar comprobante" width="max-w-3xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={cerrar} width={esEdicion ? 'max-w-3xl' : 'max-w-6xl'}
      title={esEdicion ? (esNc ? 'Editar nota de crédito' : 'Editar factura') : (esNc ? 'Cargar nota de crédito de proveedor' : 'Cargar factura de proveedor')}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={crear.isPending || editar.isPending || subirAdj.isPending} disabled={!listo || leyendo}
            title={leyendo ? 'Esperá a que termine de leer la factura'
              : !listo ? (esNc && !acreditaOk
                  ? 'Elegí a qué facturas acredita la NC (sin pasarse de lo que les queda) o tildá «dejarla como crédito a favor»'
                  : 'Faltan datos: proveedor, número, total, concepto, descripción, que el desglose cierre y que el reparto cuadre') : undefined}>
            {esEdicion ? 'Guardar cambios' : esNc ? 'Cargar nota de crédito' : yaPagada ? 'Cargar y registrar el pago' : 'Cargar factura'}
          </Button>
        </div>
      }
    >
      <div className={esEdicion ? '' : 'grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}>
      {!esEdicion && (
        <PanelComprobante archivo={archivo} previewUrl={previewUrl} lectura={lectura}
          onElegir={elegirArchivo} onQuitar={() => { olvidarLectura(); setArchivo(null) }} />
      )}
      <div className="flex flex-col gap-3 text-sm min-w-0">

        {desaprueba && (
          <div className="bg-amarillo-light border border-amarillo/40 rounded p-2 text-xs text-[#7A5000]">
            ⚠ Este cambio le va a <b>quitar la aprobación</b> a la factura: va a volver a «pendiente» y habrá que aprobarla de nuevo antes de pagarla.
          </div>
        )}
        {congelado && (
          <div className="bg-gris border border-gris-mid rounded p-2 text-xs text-gris-dark">
            La factura ya tiene pagos: el proveedor, la fecha y los importes están congelados. Para cambiarlos hay que anular la orden de pago.
          </div>
        )}

        {!esEdicion && lectura && (
          <AvisosLectura lectura={lectura} avisos={avisosLectura}
            onUsar={usarAlternativa} onAlta={() => setAltaProveedor(true)} />
        )}

        {/* Factura o nota de crédito (20260925). La lectura lo fija sola; al
            editar no se cambia (CAMPO_NO_EDITABLE). */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded border border-gris-mid overflow-hidden" role="radiogroup" aria-label="Clase de comprobante">
            {([['factura', 'Factura'], ['nota_credito', 'Nota de crédito']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={clase === k}
                onClick={() => cambiarClase(k)} disabled={esEdicion}
                title={esEdicion ? 'La clase no se cambia: si se cargó mal, anulala y cargala de nuevo' : undefined}
                className={`px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                  clase === k
                    ? (k === 'nota_credito' ? 'bg-[#5A2D82] text-white' : 'bg-azul text-white')
                    : 'bg-white text-gris-dark hover:bg-gris disabled:opacity-60'}`}>
                {l}
              </button>
            ))}
          </div>
          <MarcaFuente f={fuentes.clase} />
          {esNc && (
            <span className="text-[11px] text-[#5A2D82]">
              No se paga: al aprobarla baja la deuda de las facturas que acredita, o queda como crédito a favor.
            </span>
          )}
        </div>

        <Seccion titulo="Proveedor y comprobante" />
        {/* Proveedor */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <Combobox
              label="Proveedor" placeholder="Buscar por razón social o CUIT…"
              options={provOpts} value={proveedorId} onChange={v => cambiarProveedor(v)} disabled={congelado}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAltaProveedor(true)} disabled={congelado}>+ Nuevo</Button>
        </div>
        {fuentes.proveedor && <div className="-mt-2 text-[11px] text-gris-dark">Por el CUIT del comprobante <MarcaFuente f={fuentes.proveedor} /></div>}
        {/* El CBU sólo hace falta para TRANSFERIR. Un proveedor al que se le
            paga con cheque o en cuenta corriente no lo necesita nunca, y hasta
            el 2026-09-21 este aviso salía siempre: parecía que faltaba un dato
            obligatorio cuando no lo es. Los cheques se emiten con el CUIT. */}
        {proveedor?.sin_datos_pago && FORMAS_CON_CUENTA_DESTINO.includes(formaPrevista as PagosFormaPagoOP) && (
          <div className="text-[11px] text-naranja-dark">
            Para transferirle hace falta el CBU o el alias, y este proveedor no los tiene. La factura se carga igual.
          </div>
        )}

        {avisoLetra && (
          <div className="rounded border border-amarillo/50 bg-amarillo-light px-2 py-1.5 text-xs text-[#7A5000]">
            ⚠ {avisoLetra} La factura se carga igual.
          </div>
        )}

        {/* Comprobante: tipo y número en una fila, las fechas en otra. En una
            sola fila de cuatro el número (dos campos) quedaba apretado. */}
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
          <Campo label="Tipo" fuente={fuentes.tipo_comprobante}>
            <select value={tipo} onChange={e => { setTipo(e.target.value as PagosTipoComprobante); setCbteArca(null); tocar('tipo_comprobante') }} disabled={congelado} className={inputCls}>
              {TIPOS_COMPROBANTE.filter(t => !esNc || ['A', 'B', 'C'].includes(t.key))
                .map(t => <option key={t.key} value={t.key}>{esNc ? `NC ${t.key}` : t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Número" hint="Punto de venta y comprobante" fuente={fuentes.numero_comprobante ?? fuentes.punto_venta}>
            <div className="flex items-center gap-1">
              {/* El ancho va en el wrapper: `inputCls` trae `w-full`, que le gana
                  a un `w-16` en el mismo className (ver el reparto por obra). */}
              <div className="w-20 shrink-0">
                <input inputMode="numeric" value={puntoVenta} placeholder="0001"
                  onChange={e => { setPuntoVenta(e.target.value.replace(/\D/g, '').slice(0, 5)); tocar('punto_venta') }}
                  className={`${inputCls} text-center font-mono`} />
              </div>
              <span className="text-gris-dark">-</span>
              <input inputMode="numeric" value={nroComprobante} placeholder="00012345"
                onChange={e => { setNroComprobante(e.target.value.replace(/\D/g, '').slice(0, 8)); tocar('numero_comprobante') }}
                className={`${inputCls} font-mono`} />
            </div>
          </Campo>
        </div>
        <div className={`grid gap-2 ${esNc ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          <Campo label="Emitida" fuente={fuentes.fecha}>
            <input type="date" value={fecha} max={hoyAR()} onChange={e => { setFecha(e.target.value); tocar('fecha') }} disabled={congelado} className={inputCls} />
            {/* El campo arranca en hoy, y hasta el 23/09 las 13 facturas
                cargadas tenían la fecha del día de carga: nadie la cambiaba.
                Una vez pagada queda congelada, así que conviene verlo acá. */}
            {!esEdicion && fecha === hoyAR() && !fuentes.fecha && (
              <div className="mt-1 text-[11px] text-[#7A5000]">Es la fecha de hoy: ¿es la que dice el papel?</div>
            )}
          </Campo>
          {!esNc && (
            <Campo label="Vence" hint="Opcional" fuente={fuentes.vence_el}>
              <input type="date" value={venceEl} min={fecha} onChange={e => { setVenceEl(e.target.value); tocar('vence_el') }} className={inputCls} />
            </Campo>
          )}
          {/* Período IVA (20260927a): en qué mes se informa en el Libro IVA
              compras. Es clasificación fiscal: se puede correr a un mes
              posterior, nunca a uno anterior al de la fecha. */}
          <Campo label="Período IVA" hint="Libro IVA compras">
            <input type="month" value={periodoIva} min={mesFecha || undefined}
              onChange={e => { setPeriodoIva(e.target.value); setPeriodoTocado(true); setErrorPeriodo(null) }}
              title="Mes en que el comprobante se informa en el Libro IVA compras. Por defecto, el de la fecha."
              className={inputCls} />
            {periodoCorrido && (
              <div className="mt-1 text-[11px] text-[#7A5000]">
                El mes de la fecha ya está cerrado: se informa en {fmtMesLargo(periodoIva)}.
              </div>
            )}
            {!periodoOk && <div className="mt-1 text-[11px] text-rojo">No puede ser anterior al mes del comprobante.</div>}
            {errorPeriodo && <div className="mt-1 text-[11px] text-rojo">{errorPeriodo}</div>}
          </Campo>
        </div>
        {/* CAE: lo pide el Libro IVA. Viene del QR o del papel; a mano es opcional. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
          <Campo label="CAE" hint="Opcional" fuente={fuentes.cae}>
            <input inputMode="numeric" value={cae} placeholder="14 dígitos"
              onChange={e => { setCae(e.target.value.replace(/\D/g, '').slice(0, 14)); tocar('cae') }}
              className={`${inputCls} font-mono`} />
          </Campo>
          <Campo label="Vence el CAE" hint="Opcional" fuente={fuentes.cae_vto}>
            <input type="date" value={caeVto} onChange={e => { setCaeVto(e.target.value); tocar('cae_vto') }} className={inputCls} />
          </Campo>
          {cbteArca != null && (
            <div className="pb-2 text-[11px] text-gris-dark whitespace-nowrap" title="Código de comprobante de ARCA">
              ARCA: {NOMBRE_CBTE_ARCA[cbteArca] ?? `cód. ${cbteArca}`}
            </div>
          )}
        </div>
        {cae && cae.length !== 14 && <div className="-mt-2 text-[11px] text-rojo">El CAE tiene 14 dígitos.</div>}

        <Seccion titulo="Importes" />
        {/* Importes. Lo único obligatorio es el total; el desglose está
            plegado a propósito (ver el comentario de `verDesglose`). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
          <Campo label={esNc ? 'Total de la NC (con IVA)' : 'Total (con IVA)'} hint={esNc ? 'Lo que acredita' : 'Lo que se le paga'} fuente={fuentes.total}>
            <InputMonto value={total} onChange={v => { setTotal(v); tocar('total') }} disabled={congelado}
              className="font-mono font-bold py-2 rounded" />
          </Campo>
          {!verDesglose && (
            <div className="col-span-2 sm:col-span-2 pb-2">
              <button type="button" onClick={() => setVerDesglose(true)} disabled={congelado}
                className="text-[11px] text-azul hover:underline disabled:opacity-50">
                + Discriminar IVA, percepciones e impuestos
              </button>
              <div className="text-[11px] text-gris-dark">Opcional, pero es lo que usa el contador para el Libro IVA.</div>
            </div>
          )}
        </div>

        {verDesglose && (
          <DesgloseArca
            filasIva={filasIva} setFilasIva={v => { setFilasIva(v); tocar('iva') }}
            tributos={tributos} setTributos={v => { setTributos(v); tocar('tributos') }}
            neto={neto} setNeto={v => { setNeto(v); tocar('neto') }}
            noGravado={noGravado} setNoGravado={v => { setNoGravado(v); tocar('no_gravado') }}
            exento={exento} setExento={v => { setExento(v); tocar('exento') }}
            resumen={resumen} total={totalN} tipo={tipo} fuentes={fuentes} disabled={congelado}
            onQuitar={() => { setVerDesglose(false); setFilasIva([]); setTributos([]); setNeto(''); setNoGravado(''); setExento('') }}
          />
        )}

        {esNc && (
          <>
            <Seccion titulo="Acredita a" />
            <label className={`flex items-center gap-2 text-xs select-none ${acreditaEditable ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
              <input type="checkbox" className="accent-naranja" checked={comoCredito} disabled={!acreditaEditable}
                onChange={e => setComoCredito(e.target.checked)} />
              <span>Dejarla como <b>crédito a favor</b> del proveedor <span className="text-gris-dark">(no acredita ninguna factura ahora; se aplica después desde su ficha)</span></span>
            </label>
            {!acreditaEditable && (
              <div className="text-[11px] text-gris-dark">
                La NC ya está aprobada: lo que acredita no se cambia desde acá. El crédito que le quede se aplica con «Aplicar crédito» en su ficha.
              </div>
            )}
            {!comoCredito && (
              !proveedorId
                ? <div className="text-xs text-gris-dark italic">Elegí el proveedor para ver sus facturas abiertas.</div>
                : <AcreditaA facturas={facturasAcreditables} cargando={candidatas.isLoading}
                    montos={acredita} onChange={setAcredita} totalMax={totalN} topeExtra={topeExtra}
                    disabled={!acreditaEditable} />
            )}
            {!comoCredito && acreditaEditable && valAcredita.suma <= 0 && proveedorId && facturasAcreditables.length > 0 && (
              <div className="text-[11px] text-[#7A5000]">Elegí a qué factura(s) acredita, o tildá «crédito a favor».</div>
            )}
          </>
        )}

        <Seccion titulo={esNc ? 'Por qué es la nota de crédito' : 'Qué se compró y cómo se paga'} />
        <div>
          <label htmlFor="pagos-concepto" className="block text-xs font-semibold text-gris-dark mb-1">
            Concepto <span className="font-normal">· Obligatorio: qué tipo de compra es</span>
            {conceptoSugeridoId && conceptoId === conceptoSugeridoId && (
              <span title="Lo propuso la lectura del comprobante: revisalo"
                className="inline-block align-middle ml-1 px-1.5 py-px rounded border text-[10px] font-semibold leading-tight bg-azul/10 text-azul border-azul/30">
                sugerido por la lectura
              </span>
            )}
          </label>
          <select id="pagos-concepto" value={conceptoId}
            onChange={e => { setConceptoId(e.target.value); setErrorConcepto(null) }}
            disabled={conceptos.isLoading || conceptos.isError}
            aria-invalid={!!errorConcepto}
            className={`${inputCls} ${errorConcepto ? 'border-rojo' : ''}`}>
            <option value="">{conceptos.isLoading ? 'Cargando conceptos…' : 'Elegí el concepto…'}</option>
            {conceptoOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {conceptos.isError && (
            <div className="mt-1 text-[11px] text-rojo">
              No se pudo traer la lista de conceptos. <button type="button" className="underline" onClick={() => void conceptos.refetch()}>Reintentar</button>
            </div>
          )}
          {errorConcepto
            ? <div className="mt-1 text-[11px] text-rojo">{errorConcepto}</div>
            : !conceptoId && !conceptos.isLoading && !conceptos.isError && (
              <div className="mt-1 text-[11px] text-gris-dark">Elegí uno: combustible, materiales de obra, fletes… El detalle va en la descripción.</div>
            )}
        </div>
        <Campo label="Descripción" hint={esNc ? 'Por qué la hizo el proveedor: lo lee quien aprueba' : 'Qué se compró: lo lee quien aprueba'} fuente={fuentes.descripcion}>
          <input value={descripcion} onChange={e => { setDescripcion(e.target.value); tocar('descripcion') }}
            placeholder={esNc ? 'Ej.: devolución de 10 bolsas de cemento' : 'Ej.: hierro del 8 y mallas para el techo'} className={inputCls} />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {!esNc && <Campo label="Forma de pago prevista">
            <select value={formaPrevista} onChange={e => {
              const f = e.target.value as PagosFormaPrevista
              setFormaPrevista(f)
              // Al elegir cheque o e-cheq arranca «al día»: el total, al día
              // siguiente de la carga (el caso más común, dijo el dueño).
              if ((f === 'echeq' || f === 'cheque') && !plan) setPlan(planAlDia())
            }} className={inputCls}>
              {FORMAS_PREVISTAS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>}
          <Campo label="Observaciones" hint="Opcional">
            <input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        {!esNc && conCheques && (plan
          ? <PlanCheques plan={plan} total={totalN} onChange={setPlan}
              etiqueta={formaPrevista === 'echeq' ? 'e-cheqs' : 'cheques'} />
          : <button type="button" onClick={() => setPlan(planAlDia())}
              className="self-start text-[11px] text-[#5A2D82] hover:underline">
              + Anotar cómo se van a pagar los {formaPrevista === 'echeq' ? 'e-cheqs' : 'cheques'} (al día, 30/60/90…)
            </button>)}

        {!esNc && (
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={pagaCliente} onChange={e => setPagaCliente(e.target.checked)} />
            <span>La paga el cliente directo al proveedor <span className="text-gris-dark">(no es deuda de CADINC: queda fuera de la bandeja)</span></span>
          </label>
        )}

        {/* Reparto por obra */}
        {sinImputar ? (
          <div className="border-t border-gris pt-3 text-xs text-gris-dark">
            <b>Importada de ARCA, sin imputar:</b> el concepto y el reparto por obra se cargan con «Imputar», desde la ficha de la factura.
          </div>
        ) : (
          <RepartoPorObra
            filas={reparto}
            onChange={cambiarReparto}
            imputable={imputable}
            detalleImputable={percN > 0 && <span className="text-gris-dark"> (total {fmtM(totalN)} − percepciones {fmtM(percN)})</span>}
            extraAcciones={esNc && sugeridoNc.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => {
                setRepartoTocado(false)
                setReparto(sugeridoNc.map(x => ({ obra_cod: x.obra_cod, monto: String(x.monto), obs: '' })))
              }} title="El reparto de las facturas que acredita, prorrateado por lo que se le aplica a cada una">
                Repartir como las facturas
              </Button>
            )}
          />
        )}

        {/* Ya está pagada (una NC no se paga) */}
        {!esEdicion && !esNc && (
          <div className="border-t border-gris pt-3">
            <label className={`flex items-center gap-2 text-sm select-none ${puedeMarcarPagada ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
              title={puedeMarcarPagada ? undefined : 'Registrar un pago lo hace quien tiene permiso de registrar pagos. Cargala pendiente.'}>
              <input type="checkbox" className="accent-naranja" checked={yaPagada} disabled={!puedeMarcarPagada}
                onChange={e => setYaPagada(e.target.checked)} />
              <b>Ya está pagada</b>
              <span className="text-xs text-gris-dark">
                {puedeMarcarPagada
                  ? '(registra la orden de pago junto con la factura)'
                  : '(sólo quien registra pagos: cargala pendiente y la paga quien corresponde)'}
              </span>
            </label>

            {yaPagada && (
              <div className="mt-2 pl-6 flex flex-col gap-2">
                <div className="text-[11px] text-gris-dark">
                  Entra directamente como pagada y queda en «pagadas sin revisar» hasta que un aprobador la selle.
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Campo label="Forma">
                    <select value={opForma} onChange={e => setOpForma(e.target.value as PagosFormaPagoOP)} className={inputCls}>
                      {formasPagada.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Fecha del pago">
                    <input type="date" value={opFecha} max={hoyAR()} onChange={e => setOpFecha(e.target.value)} className={inputCls} />
                  </Campo>
                  <Campo label="Referencia" hint="Opcional">
                    <input value={opRef} onChange={e => setOpRef(e.target.value)} className={inputCls} />
                  </Campo>
                  <Campo label="Sale de la cuenta" hint="Opcional">
                    <SelectCuentaOrigen value={opCuentaOrigen} onChange={setOpCuentaOrigen} forma={opForma} className={inputCls} />
                  </Campo>
                  {FORMAS_CON_FECHA_COBRO.includes(opForma) && (
                    <Campo label="Se cobra el">
                      <input type="date" value={opFechaCobro} min={opFecha} onChange={e => setOpFechaCobro(e.target.value)} className={inputCls} />
                    </Campo>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
                    {subiendo ? 'Subiendo…' : opComprobante ? '✓ Comprobante listo' : '📎 Comprobante (opcional)'}
                    <input type="file" className="hidden" accept="image/*,application/pdf" disabled={subiendo}
                      onChange={e => { const file = e.target.files?.[0]; if (file) subirComprobante(file); e.target.value = '' }} />
                  </label>
                  {opComprobante && (
                    <span className="text-xs text-gris-dark truncate max-w-[220px]">{opComprobante.nombre_archivo}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Motivo obligatorio al editar una con pagos */}
        {tienePagos && (
          <Campo label="Motivo del cambio" hint="Obligatorio: la factura ya tiene pagos">
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: el número estaba mal tipeado" className={inputCls} />
          </Campo>
        )}
      </div>
      </div>

      {altaProveedor && (
        <AltaRapidaProveedor
          inicial={altaInicial ?? undefined}
          onClose={() => setAltaProveedor(false)}
          onCreado={id => { setProveedorId(String(id)); setAltaProveedor(false) }}
        />
      )}
    </Modal>
  )
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark'

function Campo({ label, hint, fuente, children }: { label: string; hint?: string; fuente?: Fuente; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gris-dark mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>} <MarcaFuente f={fuente} />
      </label>
      {children}
    </div>
  )
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide border-b border-gris pb-1 -mb-1 mt-1 first:mt-0">
      {titulo}
    </div>
  )
}

/**
 * La factura escaneada, a la izquierda del formulario: se tipea mirándola.
 * Sin archivo es una zona para arrastrar o elegir; con archivo, la vista
 * previa (imagen o PDF) queda fija mientras se scrollea el formulario.
 */
function PanelComprobante({ archivo, previewUrl, lectura, onElegir, onQuitar }: {
  archivo: File | null; previewUrl: string | null; lectura: EstadoLectura | null
  onElegir: (f: File | undefined) => void; onQuitar: () => void
}) {
  const [arrastrando, setArrastrando] = useState(false)
  const esPdf = archivo?.type === 'application/pdf'
  const esImagen = !!archivo?.type.startsWith('image/') && !/hei[cf]/i.test(archivo.type)

  if (!archivo) {
    return (
      <label
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => { e.preventDefault(); setArrastrando(false); onElegir(e.dataTransfer.files?.[0]) }}
        className={`flex flex-col items-center justify-center gap-2 text-center rounded-card border-2 border-dashed p-6 min-h-[220px] lg:min-h-[480px] cursor-pointer transition-colors ${
          arrastrando ? 'border-naranja bg-naranja/5' : 'border-gris-mid bg-gris/20 hover:border-naranja'}`}>
        <span className="text-3xl">📄</span>
        <span className="text-sm font-semibold text-azul">Empezá por la factura</span>
        <span className="text-xs text-gris-dark max-w-[260px]">
          Arrastrá la foto o el PDF, o hacé clic para elegirlo. El sistema la lee —QR de ARCA, IVA, percepciones— y
          te deja los datos cargados para que los revises.
        </span>
        <span className="text-[11px] text-gris-dark">Hasta 10 MB · sin archivo se carga a mano</span>
        <input type="file" className="hidden" accept={MIME_ADJUNTOS} onChange={e => { onElegir(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-2 lg:sticky lg:top-0 lg:self-start">
      <div className="flex items-center gap-2 text-xs">
        <span className="truncate font-semibold min-w-0" title={archivo.name}>📎 {archivo.name}</span>
        <label className="ml-auto shrink-0 text-azul hover:underline cursor-pointer">
          Cambiar
          <input type="file" className="hidden" accept={MIME_ADJUNTOS} onChange={e => { onElegir(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button type="button" onClick={onQuitar} className="shrink-0 text-gris-dark hover:text-rojo hover:underline">Quitar</button>
      </div>
      <div className="rounded-card border border-gris-mid bg-gris/20 overflow-hidden">
        {esImagen && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Factura" className="w-full max-h-[70vh] object-contain" />
        )}
        {esPdf && previewUrl && (
          <iframe src={previewUrl} title="Factura" className="w-full h-[70vh]" />
        )}
        {!esImagen && !esPdf && (
          <div className="p-6 text-center text-xs text-gris-dark">
            Este formato no se puede previsualizar, pero se adjunta igual al guardar.
          </div>
        )}
      </div>
      <div className="text-[11px] text-gris-dark">
        {lectura?.fase === 'leyendo' && <span className="text-azul font-semibold">Leyendo la factura… (unos segundos)</span>}
        {lectura?.fase === 'lista' && <>Leída{lectura.res?.estado === 'qr+ia' ? ' (QR de ARCA + texto)' : lectura.res?.estado === 'qr' ? ' (sólo QR de ARCA)' : lectura.res?.estado === 'ia' ? ' (sin QR: todo del texto)' : ''}. Se adjunta al guardar.</>}
        {lectura?.fase === 'error' && <span className="text-naranja-dark">No se pudo leer ({lectura.error}). Cargala a mano: el archivo se adjunta igual al guardar.</span>}
        {!lectura && 'Se adjunta al guardar, y el sistema controla número, total y fecha contra lo que cargues.'}
      </div>
    </div>
  )
}

/** «Al día»: el total en un solo cheque, al día siguiente de la carga. */
function planAlDia(): PagosPlanCheques {
  return { cantidad: 1, primer_cobro: sumarDiasISO(hoyAR(), 1), cada_dias: 30 }
}

/**
 * El plan de cheques de la factura (20260923n). Atajos para los casos de
 * siempre —al día, 30/60/90, seis cada 30— y los tres números a mano. Muestra
 * cómo quedaría cada cheque con el total de la factura; lo que se paga de
 * verdad se confirma al registrar el pago.
 */
function PlanCheques({ plan, total, onChange, etiqueta }: {
  plan: PagosPlanCheques; total: number; onChange: (p: PagosPlanCheques) => void; etiqueta: string
}) {
  const base = hoyAR()
  const atajos: { label: string; plan: PagosPlanCheques }[] = [
    { label: 'Al día', plan: planAlDia() },
    { label: '30 / 60 / 90', plan: { cantidad: 3, primer_cobro: sumarDiasISO(base, 30), cada_dias: 30 } },
    { label: '6 cada 30', plan: { cantidad: 6, primer_cobro: sumarDiasISO(base, 30), cada_dias: 30 } },
  ]
  const igual = (a: PagosPlanCheques, b: PagosPlanCheques) =>
    a.cantidad === b.cantidad && a.primer_cobro === b.primer_cobro && a.cada_dias === b.cada_dias
  const partes = total > 0 ? partirEnPartes(total, plan.cantidad) : []
  const fechas = fechasEscalonadas(plan.primer_cobro, plan.cantidad, 0, plan.cada_dias)
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(v) || min)))
  const chico = 'px-2 py-1 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja'

  return (
    <div className="border border-[#5A2D82]/30 bg-[#EEE8FF]/40 rounded p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold text-[#5A2D82] uppercase tracking-wide">Cómo se van a pagar los {etiqueta}</span>
        {atajos.map(a => (
          <button key={a.label} type="button" onClick={() => onChange(a.plan)}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${igual(a.plan, plan)
              ? 'bg-[#5A2D82] text-white border-[#5A2D82]' : 'bg-white text-[#5A2D82] border-[#5A2D82]/40 hover:bg-[#EEE8FF]'}`}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 flex-wrap text-xs">
        <label className="flex flex-col gap-0.5"><span className="text-gris-dark">Cuántos</span>
          <input inputMode="numeric" value={plan.cantidad} className={`${chico} w-14`}
            onChange={e => onChange({ ...plan, cantidad: num(e.target.value, 1, 24) })} /></label>
        <label className="flex flex-col gap-0.5"><span className="text-gris-dark">El primero</span>
          <input type="date" value={plan.primer_cobro} min={base} className={chico}
            onChange={e => onChange({ ...plan, primer_cobro: e.target.value || plan.primer_cobro })} /></label>
        {plan.cantidad > 1 && (
          <label className="flex flex-col gap-0.5"><span className="text-gris-dark">Cada (días)</span>
            <input inputMode="numeric" value={plan.cada_dias} className={`${chico} w-14`}
              onChange={e => onChange({ ...plan, cada_dias: num(e.target.value, 1, 365) })} /></label>
        )}
      </div>
      <div className="text-[11px] text-gris-dark">
        {fechas.map((f, i) => (
          <span key={i} className="inline-block mr-3">
            {fmtFecha(f)}{partes[i] != null && <>: <b className="font-mono tabular-nums">{fmtM(partes[i]!)}</b></>}
          </span>
        ))}
        <div className="mt-0.5">Se precargan en el Excel del Galicia y al registrar el pago; ahí se pueden ajustar.</div>
      </div>
    </div>
  )
}

/** De dónde salió un campo: QR de ARCA, leído del papel, o corregido a mano. */
function MarcaFuente({ f }: { f?: Fuente }) {
  if (!f) return null
  const cfg: Record<Fuente, { txt: string; cls: string; title: string }> = {
    'qr':     { txt: 'QR',     cls: 'bg-verde-light text-verde border-verde/30', title: 'Del QR de ARCA' },
    'qr+ia':  { txt: 'QR ✓',   cls: 'bg-verde-light text-verde border-verde/30', title: 'El QR de ARCA y el papel dicen lo mismo' },
    'ia':     { txt: 'leído',  cls: 'bg-azul/10 text-azul border-azul/30', title: 'Leído del comprobante: revisalo contra el papel' },
    'manual': { txt: 'a mano', cls: 'bg-gris text-gris-dark border-gris-mid', title: 'Venía leído y lo cambiaste' },
  }
  const c = cfg[f]
  return <span title={c.title} className={`inline-block align-middle ml-1 px-1.5 py-px rounded border text-[10px] font-semibold leading-tight ${c.cls}`}>{c.txt}</span>
}

/** Lo que encontró la lectura y hay que mirar, de lo más grave a lo informativo. */
function AvisosLectura({ lectura, avisos, onUsar, onAlta }: {
  lectura: EstadoLectura
  avisos: { a: PagosAvisoLectura; i: number }[]
  onUsar: (i: number, a: PagosAvisoLectura) => void
  onAlta: () => void
}) {
  if (lectura.fase === 'leyendo') {
    return (
      <div className="rounded border border-azul/30 bg-azul/5 p-2 text-xs text-azul animate-pulse">
        Leyendo la factura: buscando el QR de ARCA y los importes…
      </div>
    )
  }
  if (lectura.fase === 'error' || !avisos.length) {
    return lectura.fase === 'lista'
      ? <div className="rounded border border-verde/30 bg-verde-light p-2 text-xs text-verde">✓ Factura leída sin observaciones. Revisá los datos y cargala.</div>
      : null
  }
  const estilo = {
    error:       'border-rojo/40 bg-rojo-light text-rojo',
    advertencia: 'border-amarillo/50 bg-amarillo-light text-[#7A5000]',
    info:        'border-gris-mid bg-gris/40 text-gris-dark',
  } as const
  return (
    <div className="flex flex-col gap-1">
      {avisos.map(({ a, i }) => (
        <div key={i} className={`rounded border px-2 py-1.5 text-xs flex items-start gap-2 ${estilo[a.severidad]}`}>
          <span className="shrink-0">{a.severidad === 'error' ? '⛔' : a.severidad === 'advertencia' ? '⚠' : 'ℹ'}</span>
          <span className="flex-1 min-w-0">{mensajeAvisoLectura(a)}</span>
          {a.alternativa != null && (
            <button type="button" onClick={() => onUsar(i, a)} className="shrink-0 underline font-semibold">
              Usar el del papel
            </button>
          )}
          {a.codigo === 'PROVEEDOR_NUEVO' && (
            <button type="button" onClick={onAlta} className="shrink-0 underline font-semibold">Darlo de alta</button>
          )}
        </div>
      ))}
    </div>
  )
}

const chico = 'w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja disabled:bg-gris'

/**
 * El desglose como lo pide ARCA: IVA por alícuota, no gravado, exento y
 * percepciones/tributos con su jurisdicción, con el cierre contra el total en
 * vivo. Es lo que después arma el Libro IVA de compras.
 */
export function DesgloseArca(p: {
  filasIva: FilaIva[]; setFilasIva: (v: FilaIva[]) => void
  tributos: FilaTributo[]; setTributos: (v: FilaTributo[]) => void
  neto: string; setNeto: (v: string) => void
  noGravado: string; setNoGravado: (v: string) => void
  exento: string; setExento: (v: string) => void
  resumen: ReturnType<typeof resumirDesglose>; total: number; tipo: PagosTipoComprobante
  fuentes: Record<string, Fuente>; disabled: boolean; onQuitar: () => void
}) {
  const { filasIva, tributos, resumen } = p
  const usadas = new Set(filasIva.map(f => f.alicuota_id))
  const libre = ALICUOTAS.find(a => !usadas.has(a.id))
  const setFila = (i: number, cambio: Partial<FilaIva>) => p.setFilasIva(filasIva.map((f, j) => {
    if (j !== i) return f
    const nueva = { ...f, ...cambio }
    // Mientras el importe sea el sugerido, sigue a la base (y a la alícuota).
    if (('base' in cambio || 'alicuota_id' in cambio) && nueva.auto) {
      nueva.importe = nueva.base ? String(ivaDe(n(nueva.base), nueva.alicuota_id)) : ''
    }
    if ('importe' in cambio) nueva.auto = false
    return nueva
  }))
  const setTrib = (i: number, cambio: Partial<FilaTributo>) => p.setTributos(tributos.map((t, j) => j === i ? { ...t, ...cambio } : t))
  const sinAlicuotas = filasIva.length === 0
  // La jurisdicción que propone un tributo nuevo (Compras › Configuración,
  // 20260929f). Sin catálogo en el backend: «Tucumán» por nombre, como antes.
  const cfgPagos = useConfigPagos()
  const { jurisdicciones } = useJurisdicciones()
  const jurDefaultId = cfgPagos.config.tributos.jurisdiccion_default_id
  const jurDefault: Pick<FilaTributo, 'jurisdiccion' | 'jurisdiccion_id'> = cfgPagos.respaldo
    ? { jurisdiccion: 'Tucumán', jurisdiccion_id: null }
    : { jurisdiccion: nombreJurisdiccion(jurisdicciones, jurDefaultId), jurisdiccion_id: jurDefaultId }

  return (
    <div className="border border-gris rounded p-2 bg-gris/20 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">Desglose de impuestos</div>
        <button type="button" onClick={p.onQuitar} disabled={p.disabled} className="text-[11px] text-gris-dark hover:text-rojo hover:underline disabled:opacity-50">
          Quitar el desglose
        </button>
      </div>

      {/* IVA por alícuota */}
      <div>
        <div className="text-[11px] font-semibold text-gris-dark mb-1">
          IVA por alícuota <MarcaFuente f={p.fuentes.iva} />
          {(p.tipo === 'B' || p.tipo === 'C') && <span className="font-normal"> · una factura {p.tipo} no discrimina IVA: dejalo vacío</span>}
        </div>
        {filasIva.map((f, i) => (
          <div key={i} className="grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5 items-center mb-1">
            <select value={f.alicuota_id} disabled={p.disabled} className={chico}
              onChange={e => setFila(i, { alicuota_id: Number(e.target.value) as PagosAlicuotaId })}>
              {ALICUOTAS.filter(a => a.id === f.alicuota_id || !usadas.has(a.id)).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <InputMonto value={f.base} onChange={v => setFila(i, { base: v })} placeholder="Neto gravado" disabled={p.disabled} className="py-1.5 text-xs rounded" />
            <div>
              <InputMonto value={f.importe} onChange={v => setFila(i, { importe: v })} placeholder="IVA" disabled={p.disabled} className="py-1.5 text-xs rounded" />
              {f.base && f.importe && pctDeAlicuota(f.alicuota_id) > 0 && ivaNoCuadra(n(f.base), n(f.importe), f.alicuota_id) && (
                <div className="text-[10px] text-naranja-dark">Al {pctDeAlicuota(f.alicuota_id)} % daría {fmtM(ivaDe(n(f.base), f.alicuota_id))}</div>
              )}
            </div>
            <button type="button" disabled={p.disabled} onClick={() => p.setFilasIva(filasIva.filter((_, j) => j !== i))}
              className="text-rojo hover:bg-rojo-light px-2 py-1 rounded text-xs">✕</button>
          </div>
        ))}
        {libre && (
          <button type="button" disabled={p.disabled} className="text-[11px] text-azul hover:underline disabled:opacity-50"
            onClick={() => p.setFilasIva([...filasIva, { alicuota_id: libre.id, base: '', importe: '', auto: true }])}>
            + Alícuota de IVA
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sinAlicuotas && (
          <Campo label="Neto" hint="Sin IVA discriminado" fuente={p.fuentes.neto}>
            <InputMonto value={p.neto} onChange={p.setNeto} disabled={p.disabled} className="py-1.5 text-xs rounded" />
          </Campo>
        )}
        <Campo label="No gravado" fuente={p.fuentes.no_gravado}>
          <InputMonto value={p.noGravado} onChange={p.setNoGravado} disabled={p.disabled} className="py-1.5 text-xs rounded" />
        </Campo>
        <Campo label="Exento" fuente={p.fuentes.exento}>
          <InputMonto value={p.exento} onChange={p.setExento} disabled={p.disabled} className="py-1.5 text-xs rounded" />
        </Campo>
      </div>

      {/* Percepciones y tributos */}
      <div>
        <div className="text-[11px] font-semibold text-gris-dark mb-1">
          Percepciones e impuestos <MarcaFuente f={p.fuentes.tributos} />
          <span className="font-normal"> · las percepciones no se reparten entre obras</span>
        </div>
        {tributos.map((t, i) => {
          const conJur = TIPOS_TRIBUTO.find(x => x.key === t.tipo)?.conJurisdiccion
          return (
            <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)_110px_auto] gap-1.5 items-center mb-1">
              <select value={t.tipo} disabled={p.disabled} className={chico}
                onChange={e => setTrib(i, { tipo: e.target.value as PagosTributoTipo })}>
                {TIPOS_TRIBUTO.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {conJur ? (
                <div title={t.descripcion || undefined}>
                  <JurisdiccionSelect disabled={p.disabled} inputClassName={chico}
                    placeholder={t.tipo === 'percepcion_municipal' ? 'Municipio' : 'Provincia (ej. Tucumán)'}
                    value={{ id: t.jurisdiccion_id, nombre: t.jurisdiccion }}
                    onChange={v => setTrib(i, { jurisdiccion_id: v.id, jurisdiccion: v.nombre })} />
                </div>
              ) : (
                <input value={t.descripcion} disabled={p.disabled} className={chico} placeholder="Detalle (opcional)"
                  onChange={e => setTrib(i, { descripcion: e.target.value })} />
              )}
              <InputMonto value={t.importe} onChange={v => setTrib(i, { importe: v })} disabled={p.disabled} className="py-1.5 text-xs rounded" />
              <button type="button" disabled={p.disabled} onClick={() => p.setTributos(tributos.filter((_, j) => j !== i))}
                className="text-rojo hover:bg-rojo-light px-2 py-1 rounded text-xs">✕</button>
            </div>
          )
        })}
        <button type="button" disabled={p.disabled} className="text-[11px] text-azul hover:underline disabled:opacity-50"
          onClick={() => p.setTributos([...tributos, { tipo: 'percepcion_iibb', ...jurDefault, descripcion: '', importe: '' }])}>
          + Percepción o impuesto
        </button>
      </div>

      {/* Cierre en vivo */}
      <div className="border-t border-gris pt-1.5 text-[11px] flex flex-wrap gap-x-3 gap-y-0.5 items-center">
        <span>Neto <b className="font-mono tabular-nums">{fmtM(resumen.netoGravado)}</b></span>
        <span>IVA <b className="font-mono tabular-nums">{fmtM(resumen.iva)}</b></span>
        {resumen.percepciones > 0 && <span>Percepciones <b className="font-mono tabular-nums">{fmtM(resumen.percepciones)}</b></span>}
        {resumen.otros > 0 && <span>Otros <b className="font-mono tabular-nums">{fmtM(resumen.otros)}</b></span>}
        <span>= <b className="font-mono tabular-nums">{fmtM(resumen.suma)}</b></span>
        {p.total > 0 && (resumen.cierra
          ? <span className="text-verde font-semibold">✓ Cierra con el total</span>
          : <span className="text-rojo font-semibold">
              {resumen.diferencia > 0 ? `Faltan ${fmtM(resumen.diferencia)}` : `Sobran ${fmtM(-resumen.diferencia)}`} para llegar al total de {fmtM(p.total)}
            </span>)}
      </div>
    </div>
  )
}
