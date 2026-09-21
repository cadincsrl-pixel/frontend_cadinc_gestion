'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto, aRaw } from '@/components/ui/InputMonto'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useCatalogoObrasPagos, useCrearFactura, useEditarFactura, useFactura, subirComprobantePendiente,
} from '../hooks/usePagos'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import {
  FORMAS_PAGADA_AL_CARGAR_COMPRAS, FORMAS_PAGO_OP, FORMAS_PREVISTAS, FORMAS_CON_FECHA_COBRO,
  TIPOS_COMPROBANTE, componerNumero, fmtM, hoyAR, partirNumero,
  vencimientoSugerido,
} from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import { AltaRapidaProveedor } from './AltaRapidaProveedor'
import type {
  PagosAdjuntoPendiente, PagosFormaPagoOP, PagosFormaPrevista, PagosImputacionInput, PagosTipoComprobante,
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
 */

interface Props {
  editarId?: number
  onClose:   () => void
}

interface FilaReparto {
  obra_cod: string
  /** Texto libre mientras se tipea; se parsea al guardar. */
  monto: string
  obs: string
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

export function ModalCargarFactura({ editarId, onClose }: Props) {
  const toast = useToast()
  const { esAdmin } = usePermisos('pagos')
  const esEdicion = !!editarId

  const { data: original, isLoading } = useFactura(editarId ?? null)
  const obras = useCatalogoObrasPagos()
  const proveedores = useProveedoresPagos({}, 1, 300)
  const crear  = useCrearFactura()
  const editar = useEditarFactura()

  const [proveedorId, setProveedorId] = useState('')
  const [tipo, setTipo] = useState<PagosTipoComprobante>('A')
  // Dos campos, como en el papel: punto de venta y número del comprobante.
  // Se guardan compuestos en `numero` (20260921).
  const [puntoVenta, setPuntoVenta] = useState('')
  const [nroComprobante, setNroComprobante] = useState('')
  const [fecha, setFecha] = useState(hoyAR())
  const [venceEl, setVenceEl] = useState('')
  const [total, setTotal] = useState('')
  const [neto, setNeto] = useState('')
  const [iva, setIva] = useState('')
  const [percepciones, setPercepciones] = useState('')
  const [otros, setOtros] = useState('')
  const [formaPrevista, setFormaPrevista] = useState<PagosFormaPrevista>('transferencia')
  const [descripcion, setDescripcion] = useState('')
  const [obs, setObs] = useState('')
  const [pagaCliente, setPagaCliente] = useState(false)
  const [reparto, setReparto] = useState<FilaReparto[]>([{ obra_cod: '', monto: '', obs: '' }])
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
  const [opFechaCobro, setOpFechaCobro] = useState('')
  const [opComprobante, setOpComprobante] = useState<PagosAdjuntoPendiente | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  // Precargar al editar.
  useEffect(() => {
    if (!original) return
    setProveedorId(String(original.proveedor_id))
    setTipo(original.tipo_comprobante)
    {
      const { pv, nro } = partirNumero(original.numero)
      setPuntoVenta(pv); setNroComprobante(nro)
    }
    setFecha(original.fecha.slice(0, 10))
    setVenceEl(original.vence_el?.slice(0, 10) ?? '')
    setTotal(String(original.total))
    setNeto(original.neto != null ? String(original.neto) : '')
    setIva(original.iva != null ? String(original.iva) : '')
    setPercepciones(original.percepciones != null ? String(original.percepciones) : '')
    setOtros(original.otros != null ? String(original.otros) : '')
    if ([original.neto, original.iva, original.percepciones, original.otros].some(v => v != null)) {
      setVerDesglose(true)
    }
    setFormaPrevista(original.forma_pago_prevista)
    setDescripcion(original.descripcion)
    setObs(original.obs)
    setPagaCliente(original.paga_cliente)
    setReparto(
      original.imputaciones.length
        ? original.imputaciones.map(im => ({ obra_cod: im.obra_cod, monto: String(im.monto), obs: im.obs ?? '' }))
        : [{ obra_cod: '', monto: '', obs: '' }],
    )
  }, [original])

  const proveedor = useMemo(
    () => (proveedores.data?.items ?? []).find(p => String(p.id) === proveedorId),
    [proveedores.data, proveedorId],
  )

  // Vencimiento sugerido según cómo cierre ESE proveedor: a x días de la
  // factura, o por cierre mensual de cuenta corriente (20260921g). SOLO en
  // comprobantes fiscales: un recibo o un ticket ya están pagados, no tienen
  // vencimiento y ponérselo los mete en «vencidas» sin sentido.
  useEffect(() => {
    if (esEdicion || venceEl || !proveedor || !fecha) return
    if (!['A', 'B', 'C'].includes(tipo)) return
    const sug = vencimientoSugerido(fecha, proveedor)
    if (sug) setVenceEl(sug)
  }, [proveedor, fecha, tipo, esEdicion, venceEl])

  const totalN = n(total)
  const percN  = n(percepciones)
  const imputable = r2(totalN - percN)
  const sumaReparto = r2(reparto.reduce((s, f) => s + n(f.monto), 0))
  const difReparto = r2(imputable - sumaReparto)
  const repartoOk = reparto.every(f => f.obra_cod) && Math.abs(difReparto) < 0.005 && imputable > 0

  // El catálogo trae TODAS las obras, también las archivadas, porque la ficha
  // de una factura vieja tiene que poder mostrar su obra. Pero imputar a una
  // archivada NO se puede: `_pagos_reemplazar_imputaciones` rebota con
  // OBRA_ARCHIVADA. Ofrecerlas era un callejón — 19 de las 57 fallaban recién
  // al guardar. Se listan sólo las activas, más la que ya esté elegida en el
  // reparto (que es el caso de editar una factura vieja).
  const codsElegidos = useMemo(() => new Set(reparto.map(f => f.obra_cod).filter(Boolean)), [reparto])
  const obrasOpts = useMemo(
    () => (obras.data ?? [])
      .filter(o => !o.archivada || codsElegidos.has(o.cod))
      .map(o => ({
        value: o.cod,
        label: o.nom,
        sub:   o.cod + (o.archivada ? ' · archivada' : ''),
        group: o.es_interna || o.es_deposito ? 'Estructura CADINC' : 'Obras',
        search: [o.nom, o.cod, o.cc ?? ''],
      })),
    [obras.data, codsElegidos],
  )
  const provOpts = useMemo(
    () => (proveedores.data?.items ?? []).filter(p => p.activo || String(p.id) === proveedorId).map(p => ({
      value: String(p.id),
      label: p.razon_social,
      sub:   [p.cuit, p.sin_datos_pago ? 'sin datos de pago' : null].filter(Boolean).join(' · ') || undefined,
      search: [p.razon_social, p.cuit ?? ''],
    })),
    [proveedores.data, proveedorId],
  )

  // Con UNA sola obra el reparto es todo el importe: no tiene sentido hacerlo
  // tipear, y tipearlo a mano es justo donde se pierden los centavos (caso del
  // 2026-09-21). Se completa solo al elegir la obra, y sólo si está vacío: si
  // alguien lo edita a propósito, no se lo pisa.
  useEffect(() => {
    if (reparto.length !== 1 || imputable <= 0) return
    const f = reparto[0]!
    if (!f.obra_cod || f.monto.trim()) return
    setReparto([{ ...f, monto: String(imputable) }])
  }, [reparto, imputable])

  /** Repartir lo imputable en partes iguales; la última fila se queda con el resto. */
  function repartirParejo() {
    const filas = reparto.filter(f => f.obra_cod)
    if (filas.length === 0 || imputable <= 0) return
    const parte = Math.floor((imputable / filas.length) * 100) / 100
    const nuevas = filas.map((f, i) => ({
      ...f,
      monto: String(i === filas.length - 1 ? r2(imputable - parte * (filas.length - 1)) : parte),
    }))
    setReparto(nuevas)
  }

  /** Lo que falta va a la última fila con obra: evita el rebote por centavos. */
  function ajustarUltima() {
    const idx = [...reparto].reverse().findIndex(f => f.obra_cod)
    if (idx === -1) return
    const real = reparto.length - 1 - idx
    setReparto(rs => rs.map((f, i) => i === real ? { ...f, monto: String(r2(n(f.monto) + difReparto)) } : f))
  }

  const formasPagada = esAdmin ? FORMAS_PAGO_OP : FORMAS_PAGO_OP.filter(f => FORMAS_PAGADA_AL_CARGAR_COMPRAS.includes(f.key))

  // Qué cambios le sacan la aprobación (espejo de CAMPOS_QUE_DESAPRUEBAN).
  const desaprueba = useMemo(() => {
    if (!original || original.estado !== 'aprobada') return false
    return (
      String(original.proveedor_id) !== proveedorId ||
      original.fecha.slice(0, 10) !== fecha ||
      Number(original.total) !== totalN ||
      Number(original.percepciones ?? 0) !== percN ||
      (original.vence_el?.slice(0, 10) ?? '') !== venceEl ||
      original.forma_pago_prevista !== formaPrevista ||
      original.paga_cliente !== pagaCliente ||
      JSON.stringify(original.imputaciones.map(i => [i.obra_cod, Number(i.monto)]).sort()) !==
      JSON.stringify(reparto.filter(f => f.obra_cod).map(f => [f.obra_cod, n(f.monto)]).sort())
    )
  }, [original, proveedorId, fecha, totalN, percN, venceEl, formaPrevista, pagaCliente, reparto])

  const tienePagos = !!original && (original.pagado > 0 || original.acreditado > 0)
  const congelado  = tienePagos   // proveedor, fecha e importes no se tocan con pagos
  const numeroCompleto = componerNumero(puntoVenta, nroComprobante)
  const listo = !!proveedorId && !!puntoVenta && !!nroComprobante &&
                totalN > 0 && descripcion.trim().length >= 3 && repartoOk &&
                (!tienePagos || motivo.trim().length >= 3)

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

    const comunes = {
      proveedor_id: Number(proveedorId),
      tipo_comprobante: tipo,
      numero: numeroCompleto || null,
      fecha,
      vence_el: venceEl || null,
      neto: neto ? n(neto) : null,
      iva: iva ? n(iva) : null,
      percepciones: percepciones ? n(percepciones) : null,
      otros: otros ? n(otros) : null,
      total: totalN,
      forma_pago_prevista: formaPrevista,
      descripcion: descripcion.trim(),
      obs: obs.trim(),
      paga_cliente: pagaCliente,
      imputaciones,
    }

    try {
      if (esEdicion && editarId) {
        const r = await editar.mutateAsync({ id: editarId, ...comunes, ...(tienePagos ? { motivo: motivo.trim() } : {}) })
        toast('✓ Factura actualizada', 'ok')
        if (r.aprobacion_retirada) toast('Le quitó la aprobación: hay que aprobarla de nuevo', 'warn')
        for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      } else {
        const r = await crear.mutateAsync({
          ...comunes,
          orden: yaPagada ? {
            fecha: opFecha,
            forma_pago: opForma,
            referencia: opRef.trim() || undefined,
            fecha_cobro: FORMAS_CON_FECHA_COBRO.includes(opForma) ? (opFechaCobro || null) : null,
            comprobante: opComprobante,
          } : null,
        })
        toast(r.orden ? `✓ Factura cargada y pagada (${r.orden.numero_fmt})` : '✓ Factura cargada', 'ok')
        for (const a of r.avisos) toast(mensajeAvisoPagos(a), 'warn')
      }
      onClose()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  if (esEdicion && isLoading) {
    return <Modal open onClose={onClose} title="Editar factura" width="max-w-3xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-3xl"
      title={esEdicion ? 'Editar factura' : 'Cargar factura de proveedor'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} loading={crear.isPending || editar.isPending} disabled={!listo}
            title={!listo ? 'Faltan datos: proveedor, número de factura, total, descripción y que el reparto cuadre' : undefined}>
            {esEdicion ? 'Guardar cambios' : yaPagada ? 'Cargar y registrar el pago' : 'Cargar factura'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">

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

        {/* Proveedor */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <Combobox
              label="Proveedor" placeholder="Buscar por razón social o CUIT…"
              options={provOpts} value={proveedorId} onChange={setProveedorId} disabled={congelado}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAltaProveedor(true)} disabled={congelado}>+ Nuevo</Button>
        </div>
        {proveedor?.sin_datos_pago && (
          <div className="text-[11px] text-naranja-dark">
            Este proveedor no tiene CBU ni alias cargado: se va a poder cargar la factura, pero no transferirle hasta completarlo.
          </div>
        )}

        {/* Comprobante */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value as PagosTipoComprobante)} disabled={congelado} className={inputCls}>
              {TIPOS_COMPROBANTE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Número" hint="Punto de venta y comprobante">
            <div className="flex items-center gap-1">
              <input inputMode="numeric" value={puntoVenta} placeholder="0001"
                onChange={e => setPuntoVenta(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className={`${inputCls} w-16 text-center font-mono`} />
              <span className="text-gris-dark">-</span>
              <input inputMode="numeric" value={nroComprobante} placeholder="00012345"
                onChange={e => setNroComprobante(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className={`${inputCls} font-mono`} />
            </div>
          </Campo>
          <Campo label="Emitida">
            <input type="date" value={fecha} max={hoyAR()} onChange={e => setFecha(e.target.value)} disabled={congelado} className={inputCls} />
          </Campo>
          <Campo label="Vence" hint="Opcional">
            <input type="date" value={venceEl} min={fecha} onChange={e => setVenceEl(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        {/* Importes. Lo único obligatorio es el total; el desglose está
            plegado a propósito (ver el comentario de `verDesglose`). */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
          <Campo label="Total (con IVA)" hint="Lo que se le paga">
            <InputMonto value={total} onChange={setTotal} disabled={congelado}
              className="font-mono font-bold py-2 rounded" />
          </Campo>
          {!verDesglose && (
            <div className="col-span-2 sm:col-span-2 pb-2">
              <button type="button" onClick={() => setVerDesglose(true)}
                className="text-[11px] text-azul hover:underline">
                + Desglosar neto, IVA y percepciones
              </button>
              <div className="text-[11px] text-gris-dark">Opcional. Con el total alcanza para cargar y aprobar.</div>
            </div>
          )}
        </div>

        {verDesglose && (
          <div className="border border-gris rounded p-2 bg-gris/20">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">Desglose · opcional</div>
              <button type="button" onClick={() => { setVerDesglose(false); setNeto(''); setIva(''); setPercepciones(''); setOtros('') }}
                className="text-[11px] text-gris-dark hover:text-rojo hover:underline">
                Quitar el desglose
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Campo label="Neto" hint="Opcional"><InputMonto value={neto} onChange={setNeto} disabled={congelado} className="py-2 rounded" /></Campo>
              <Campo label="IVA" hint="Opcional"><InputMonto value={iva} onChange={setIva} disabled={congelado} className="py-2 rounded" /></Campo>
              <Campo label="Percepciones" hint="No se reparten">
                <InputMonto value={percepciones} onChange={setPercepciones} disabled={congelado} className="py-2 rounded" />
              </Campo>
              <Campo label="Otros" hint="Con signo"><InputMonto value={otros} onChange={setOtros} disabled={congelado} className="py-2 rounded" /></Campo>
            </div>
            <div className="text-[11px] text-gris-dark mt-1.5">
              Si cargás neto e IVA, tienen que sumar el total. Las percepciones no se reparten entre obras.
            </div>
          </div>
        )}

        <Campo label="Descripción" hint="Qué se compró: lo lee quien aprueba">
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej.: hierro del 8 y mallas para el techo" className={inputCls} />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Campo label="Forma de pago prevista">
            <select value={formaPrevista} onChange={e => setFormaPrevista(e.target.value as PagosFormaPrevista)} className={inputCls}>
              {FORMAS_PREVISTAS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Campo>
          <Campo label="Observaciones" hint="Opcional">
            <input value={obs} onChange={e => setObs(e.target.value)} className={inputCls} />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input type="checkbox" className="accent-naranja" checked={pagaCliente} onChange={e => setPagaCliente(e.target.checked)} />
          <span>La paga el cliente directo al proveedor <span className="text-gris-dark">(no es deuda de CADINC: queda fuera de la bandeja)</span></span>
        </label>

        {/* Reparto por obra */}
        <div className="border-t border-gris pt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">Centro de costo — a qué obra se imputa</div>
            <div className="text-xs">
              A repartir: <b className="font-mono tabular-nums">{fmtM(imputable)}</b>
              {percN > 0 && <span className="text-gris-dark"> (total {fmtM(totalN)} − percepciones {fmtM(percN)})</span>}
            </div>
          </div>

          {reparto.map((f, i) => (
            <div key={i} className="flex gap-2 items-end mb-1.5">
              <div className="flex-1 min-w-0">
                <Combobox placeholder="Elegí la obra…" options={obrasOpts} value={f.obra_cod}
                  onChange={v => setReparto(rs => rs.map((x, j) => j === i ? { ...x, obra_cod: v } : x))} />
              </div>
              {/* El ancho va en un wrapper y no en el input: `inputCls` trae
                  `w-full`, que en la hoja de estilos de Tailwind le gana a
                  cualquier `w-28` del atributo (gana el orden del CSS, no el
                  del className). Con `w-28` en el input, éste se estiraba al
                  100% de la fila y dejaba al buscador de obra —que es
                  `flex-1 min-w-0`— en CERO px de ancho: el desplegable se
                  abría con las 57 obras adentro pero medía 2px y no se veía
                  nada. Reportado el 2026-09-21. */}
              <div className="w-28 shrink-0">
                <InputMonto value={f.monto} placeholder="Monto"
                  onChange={v => setReparto(rs => rs.map((x, j) => j === i ? { ...x, monto: v } : x))}
                  className="font-mono text-right py-2 rounded" />
              </div>
              {reparto.length > 1 && (
                <button type="button" className="text-rojo hover:bg-rojo-light px-2 py-1.5 rounded text-xs"
                  onClick={() => setReparto(rs => rs.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}

          <div className="flex gap-2 items-center flex-wrap mt-1">
            <Button variant="ghost" size="sm" onClick={() => setReparto(rs => [...rs, { obra_cod: '', monto: '', obs: '' }])}>+ Otra obra</Button>
            {reparto.filter(f => f.obra_cod).length > 1 && (
              <Button variant="ghost" size="sm" onClick={repartirParejo}>Repartir en partes iguales</Button>
            )}
            {Math.abs(difReparto) >= 0.005 && imputable > 0 && (
              <>
                <span className="text-xs text-rojo">
                  {difReparto > 0 ? `Faltan ${fmtM(difReparto)}` : `Sobran ${fmtM(-difReparto)}`}
                </span>
                <Button variant="secondary" size="sm" onClick={ajustarUltima}>Ajustar la última fila</Button>
              </>
            )}
            {repartoOk && <span className="text-xs text-verde">✓ El reparto cuadra</span>}
          </div>
        </div>

        {/* Ya está pagada */}
        {!esEdicion && (
          <div className="border-t border-gris pt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" className="accent-naranja" checked={yaPagada} onChange={e => setYaPagada(e.target.checked)} />
              <b>Ya está pagada</b>
              <span className="text-xs text-gris-dark">
                {esAdmin ? '(registra la orden de pago junto con la factura)' : '(tarjeta o efectivo: lo que se pagó en el mostrador)'}
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

      {altaProveedor && (
        <AltaRapidaProveedor
          onClose={() => setAltaProveedor(false)}
          onCreado={id => { setProveedorId(String(id)); setAltaProveedor(false) }}
        />
      )}
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
