'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { normalizeText } from '@/lib/utils/text'
import {
  useCrearFacturaVenta, useEditarFacturaVenta, useFacturaVenta, useObrasFacturacion,
} from '../hooks/useFacturacion'
import { useClientesVenta, useCuentasFce, useFceCliente } from '../hooks/useClientesFacturacion'
import { calcularTotales } from '../utils/facturacion.calculos'
import {
  ALICUOTAS_UI, ALICUOTA_LABEL, CONDICIONES_IVA, CONDICION_PAGO_DEFAULT, MONTO_MINIMO_FCE, PRODUCTOS, PROVINCIAS,
  PROVINCIA_DEFAULT, TIPOS_CBTE, TRANSMISIONES_FCE, UNIDAD_DEFAULT, correspondeFce, esTipoFce, esTipoNc, fmtDoc, fmtFecha,
  fmtM, hoyAR, letraDeCliente, letraDeTipo, requiereIdentificacion, tipoPara, TOPE_CF_IDENTIFICACION,
} from '../utils/facturacion.utils'
import { codigoErrorFacturacion, errorDeCampoFacturacion, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type {
  VentasAlicuotaId, VentasCliente, VentasFacturaDetalle, VentasFacturaFJ, VentasFacturaInput,
} from '@/types/domain.types'
import { Aviso } from './FichaFactura'

/**
 * Cargar o editar el BORRADOR de una factura, o de una nota de crédito.
 *
 * La LETRA no la elige el usuario: sale del cliente (`letraDeCliente`, espejo
 * de la base y del backend). A = CUIT y RI/monotributo; B = el resto
 * (exento, consumidor final…). La NC toma la letra de la factura que corrige.
 * El tipo (1/3/6/8) lo arma el formulario y el backend lo vuelve a derivar.
 *
 * Lo que el formulario tiene que hacer bien:
 *  1. Los totales en vivo son los MISMOS que va a calcular la base
 *     (`facturacion.calculos.ts`, espejo de `ventas_guardar_borrador`): neto
 *     por renglón redondeado a centavos e IVA por alícuota agrupada.
 *  2. La OBRA es el centro de costo (decisión del 23/09; `obras.cc` en
 *     desuso): obligatoria con AVANCE DE OBRA, opcional con TRANSPORTE. El
 *     selector solo trae obras facturables (ni internas ni depósito). La base
 *     guarda en `centro_costo` la foto «COD — Nombre».
 *  3. Elegir la obra precarga su cliente (`obras.cliente_id`). Si después se
 *     elige otro cliente, se avisa (no se bloquea).
 *  4. Modo NC: se abre desde una factura autorizada, el cliente queda fijo y se
 *     ve el saldo que todavía se puede acreditar.
 *  5. FCE MiPyME (fase 6): con letra A se elige «Factura A» o «Factura de
 *     Crédito MiPyME». WSFECRED (vía /clientes/:id/fce, cache 30 días) dice si
 *     el cliente está obligado y desde qué monto: el formulario PROPONE la FCE
 *     cuando corresponde y avisa si se elige lo que el backend va a frenar
 *     (CORRESPONDE_FCE / NO_CORRESPONDE_FCE; el admin puede forzar). Si ARCA
 *     no responde, no se bloquea nada. La FCE lleva cuenta (CBU/alias),
 *     opción de transferencia, vencimiento del pago y referencia comercial;
 *     su NC, solo si anula por rechazo del comprador.
 *
 * Guardar NO emite: el borrador se revisa en la ficha y se emite desde ahí.
 */

const ALICUOTAS_VALIDAS = ['3', '4', '5', '6', '8', '9']

const renglonSchema = z.object({
  descripcion: z.string().refine(v => v.trim().length > 0, 'Escribí la descripción'),
  cantidad:    z.string().refine(v => v !== '' && Number(v) > 0, 'Mayor a 0'),
  unidad:      z.string(),
  precio_unit: z.string().refine(v => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0, 'Poné el precio neto'),
  alicuota_id: z.string().refine(v => ALICUOTAS_VALIDAS.includes(v), 'Elegí la alícuota'),
})

const schema = z.object({
  cliente_id:        z.string().min(1, 'Elegí el cliente'),
  obra_cod:          z.string(),
  producto:          z.enum(['AVANCE DE OBRA', 'TRANSPORTE']),
  fecha_cbte:        z.string().min(1, 'Poné la fecha'),
  provincia_origen:  z.string().min(1, 'Elegí la provincia'),
  provincia_destino: z.string().min(1, 'Elegí la provincia'),
  condicion_pago:    z.string().refine(v => v.trim().length > 0, 'Poné la condición de pago'),
  remitos:           z.string(),
  observaciones:     z.string(),
  obs_interna:       z.string(),
  // FCE MiPyME (fase 6)
  fce:               z.boolean(),
  fce_cuenta_id:     z.string(),
  fch_vto_pago:      z.string(),
  fce_transmision:   z.enum(['SCA', 'ADC']),
  fce_referencia:    z.string().max(50, 'Hasta 50 caracteres'),
  nc_anulacion:      z.enum(['S', 'N']),
  renglones:         z.array(renglonSchema).min(1, 'Agregá al menos un renglón'),
}).superRefine((d, ctx) => {
  if (d.producto === 'AVANCE DE OBRA' && !d.obra_cod) {
    ctx.addIssue({ code: 'custom', path: ['obra_cod'], message: 'Avance de obra lleva la obra (es el centro de costo)' })
  }
  if (d.fce && d.fch_vto_pago && d.fecha_cbte && d.fch_vto_pago < d.fecha_cbte) {
    ctx.addIssue({ code: 'custom', path: ['fch_vto_pago'], message: 'No puede ser antes de la fecha de la factura' })
  }
})

type FormData = z.infer<typeof schema>

/** Rutas del form a las que el backend puede apuntar un error (el resto va arriba del botón). */
const CAMPOS_FORM = /^(cliente_id|obra_cod|producto|fecha_cbte|provincia_origen|provincia_destino|condicion_pago|remitos|observaciones|obs_interna|fce_cuenta_id|fch_vto_pago|fce_transmision|fce_referencia|nc_anulacion|renglones\.\d+\.(descripcion|cantidad|unidad|precio_unit|alicuota_id))$/
type RenglonForm = FormData['renglones'][number]

const RENGLON_VACIO: RenglonForm = { descripcion: '', cantidad: '1', unidad: UNIDAD_DEFAULT, precio_unit: '', alicuota_id: '5' }

function defaultsNuevo(): FormData {
  return {
    cliente_id: '', obra_cod: '', producto: 'AVANCE DE OBRA', fecha_cbte: hoyAR(),
    provincia_origen: PROVINCIA_DEFAULT, provincia_destino: PROVINCIA_DEFAULT,
    condicion_pago: CONDICION_PAGO_DEFAULT, remitos: '', observaciones: '', obs_interna: '',
    fce: false, fce_cuenta_id: '', fch_vto_pago: '', fce_transmision: 'SCA', fce_referencia: '', nc_anulacion: 'N',
    renglones: [RENGLON_VACIO],
  }
}

function renglonesDe(fj: VentasFacturaFJ): RenglonForm[] {
  return fj.renglones.map(r => ({
    descripcion: r.descripcion,
    cantidad:    String(r.cantidad),
    unidad:      r.unidad || UNIDAD_DEFAULT,
    precio_unit: String(r.precio_unit),
    alicuota_id: String(r.alicuota_id),
  }))
}

function defaultsDe(fj: VentasFacturaFJ, opts: { copiarRenglones: boolean; nc: boolean }): FormData {
  const f = fj.factura
  return {
    cliente_id:        String(f.cliente_id),
    obra_cod:          f.obra_cod ?? '',
    producto:          f.producto,
    fecha_cbte:        opts.nc ? hoyAR() : f.fecha_cbte,
    provincia_origen:  f.provincia_origen || PROVINCIA_DEFAULT,
    provincia_destino: f.provincia_destino || PROVINCIA_DEFAULT,
    condicion_pago:    f.condicion_pago || CONDICION_PAGO_DEFAULT,
    remitos:           opts.nc ? '' : f.remitos,
    observaciones:     opts.nc ? '' : f.observaciones,
    obs_interna:       opts.nc ? '' : f.obs_interna,
    // En una NC, `fce` dice si la factura que corrige es FCE (→ 203).
    fce:               esTipoFce(f.cbte_tipo),
    fce_cuenta_id:     !opts.nc && f.fce_cuenta_id ? String(f.fce_cuenta_id) : '',
    fch_vto_pago:      !opts.nc && f.cbte_tipo === 201 && f.fch_vto_pago ? f.fch_vto_pago : '',
    fce_transmision:   !opts.nc && f.fce_transmision ? f.fce_transmision : 'SCA',
    fce_referencia:    !opts.nc ? f.fce_referencia ?? '' : '',
    nc_anulacion:      !opts.nc && f.nc_anulacion ? f.nc_anulacion : 'N',
    renglones:         opts.copiarRenglones ? renglonesDe(fj) : [RENGLON_VACIO],
  }
}

/** La provincia del cliente (texto libre) llevada a la forma de la lista, si coincide. */
function provinciaDeCliente(c: VentasCliente | undefined): string | null {
  const p = c?.provincia?.trim()
  if (!p) return null
  const n = normalizeText(p)
  return PROVINCIAS.find(x => normalizeText(x) === n) ?? p
}

interface Props {
  editarId?:  number
  /** Nota de crédito contra esta factura autorizada. */
  ncDe?:      VentasFacturaFJ
  onClose:    () => void
  onGuardada: (fj: VentasFacturaFJ) => void
}

export function ModalFactura({ editarId, ncDe, onClose, onGuardada }: Props) {
  const toast = useToast()
  const { esAdmin } = usePermisos('facturacion')

  const edicion   = useFacturaVenta(editarId ?? null)
  const esNc      = !!ncDe || esTipoNc(edicion.data?.factura.cbte_tipo)
  const asociadaId = ncDe?.factura.id ?? edicion.data?.factura.asociada_id ?? null
  // La factura que corrige la NC, para mostrar el saldo. Si vino por props no se pide.
  const asociadaQ = useFacturaVenta(!ncDe && esNc ? asociadaId : null)
  const asociada: VentasFacturaDetalle | VentasFacturaFJ | undefined = ncDe ?? asociadaQ.data

  const clientes   = useClientesVenta('', true)
  const cuentas    = useCuentasFce()
  const obras      = useObrasFacturacion()
  const crear      = useCrearFacturaVenta()
  const editar     = useEditarFacturaVenta()

  const [errorServer, setErrorServer] = useState<{ msg: string; code: string | null } | null>(null)

  const {
    register, control, handleSubmit, reset, setValue, getValues, setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: ncDe
      ? defaultsDe(ncDe, {
          nc: true,
          // Copia los renglones solo si la factura está entera: si ya tiene NC,
          // copiarla entera superaría el saldo.
          copiarRenglones: Number(ncDe.factura.nc_autorizadas) === 0,
        })
      : defaultsNuevo(),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'renglones' })

  // Al editar, el form se llena UNA vez cuando llega la factura (no en cada refetch).
  const cargado = useRef(false)
  useEffect(() => {
    if (!editarId || cargado.current || !edicion.data) return
    cargado.current = true
    reset(defaultsDe(edicion.data, { copiarRenglones: true, nc: false }))
  }, [editarId, edicion.data, reset])

  const renglones   = useWatch({ control, name: 'renglones' })
  const producto    = useWatch({ control, name: 'producto' })
  const clienteId   = useWatch({ control, name: 'cliente_id' })
  const obraCod     = useWatch({ control, name: 'obra_cod' })
  const origen      = useWatch({ control, name: 'provincia_origen' })
  const destino     = useWatch({ control, name: 'provincia_destino' })
  const fce         = useWatch({ control, name: 'fce' })
  const fechaCbte   = useWatch({ control, name: 'fecha_cbte' })
  const cuentaId    = useWatch({ control, name: 'fce_cuenta_id' })
  const anulacion   = useWatch({ control, name: 'nc_anulacion' })

  const totales = useMemo(() => calcularTotales(renglones ?? []), [renglones])

  const listaClientes = useMemo(() => clientes.data ?? [], [clientes.data])
  const cliente = listaClientes.find(c => String(c.id) === clienteId)
  const letraCliente = cliente ? letraDeCliente(cliente.doc_tipo, cliente.condicion_iva_id) : null
  // En una NC manda la factura que corrige; si no, el cliente.
  const letraAsociada = esNc
    ? letraDeTipo(ncDe?.factura.cbte_tipo ?? asociadaQ.data?.factura.cbte_tipo ?? edicion.data?.factura.asociada_cbte_tipo ?? 0)
    : null
  const letra = esNc ? (letraAsociada ?? letraCliente) : letraCliente
  // En la NC, FCE si la factura que corrige es FCE; en la factura, lo que eligió el usuario (solo A).
  const tipoAsociada = ncDe?.factura.cbte_tipo ?? asociadaQ.data?.factura.cbte_tipo ?? edicion.data?.factura.asociada_cbte_tipo ?? null
  const esFce = esNc ? esTipoFce(tipoAsociada) : (letra === 'A' && fce)
  const tipo = letra ? tipoPara(letra, esNc, esFce) : null

  // ¿Le corresponde FCE? (WSFECRED; solo facturas A, no NC)
  const consultaFce = !esNc && letraCliente === 'A'
  const fceInfo = useFceCliente(consultaFce && cliente ? cliente.id : null)
  const corresponde = consultaFce ? correspondeFce(fceInfo.data, totales.total) : null
  const bajoMinimo = totales.total > 0 && Math.round(totales.total * 100) < MONTO_MINIMO_FCE * 100
  /** Lo que el backend va a frenar (salvo admin con forzar). */
  const bloqueoFce: 'CORRESPONDE_FCE' | 'NO_CORRESPONDE_FCE' | null = !consultaFce || totales.total <= 0 ? null
    : !fce && corresponde === true ? 'CORRESPONDE_FCE'
    : fce && (bajoMinimo || corresponde === false) ? 'NO_CORRESPONDE_FCE'
    : null

  // Propone la FCE cuando corresponde, mientras el usuario no haya elegido a mano.
  const eligioTipo = useRef(!!editarId)
  useEffect(() => {
    if (eligioTipo.current || !consultaFce || corresponde === null) return
    if (getValues('fce') !== corresponde) setValue('fce', corresponde)
  }, [consultaFce, corresponde, getValues, setValue])

  // La cuenta: la preferida del cliente o la de por defecto, si no hay una elegida.
  const listaCuentas = useMemo(() => cuentas.data ?? [], [cuentas.data])
  useEffect(() => {
    if (!esFce || esNc || getValues('fce_cuenta_id')) return
    const pref = cliente?.cuenta_fce_id && listaCuentas.find(c => c.id === cliente.cuenta_fce_id && c.activo)
    const cta = pref || listaCuentas.find(c => c.es_default)
    if (cta) setValue('fce_cuenta_id', String(cta.id))
  }, [esFce, esNc, cliente, listaCuentas, getValues, setValue])
  const cuentaSel = listaCuentas.find(c => String(c.id) === cuentaId)
  const tipoLabel = (t: number | null | undefined) => TIPOS_CBTE.find(x => x.key === t)?.label
  const cortoDe = (t: number | null | undefined) => TIPOS_CBTE.find(x => x.key === t)?.corto ?? 'F'
  const faltaIdentificar = !!cliente && requiereIdentificacion(letra, cliente.doc_tipo, totales.total)

  const saldoNc = asociada ? Number(asociada.factura.saldo_nc ?? 0) : null
  const superaSaldo = esNc && saldoNc !== null && totales.total > saldoNc + 0.004

  // ── Opciones ──
  const opcionesCliente = useMemo(
    () => listaClientes
      .filter(c => c.activo || String(c.id) === clienteId)
      .map(c => ({
        value: String(c.id),
        label: c.razon_social,
        sub: [fmtDoc(c.doc_tipo, c.doc_nro), CONDICIONES_IVA[c.condicion_iva_id],
          letraDeCliente(c.doc_tipo, c.condicion_iva_id) ? `Factura ${letraDeCliente(c.doc_tipo, c.condicion_iva_id)}` : 'sin letra: corregir',
          c.activo ? null : 'dado de baja'].filter(Boolean).join(' · '),
        search: [c.razon_social, c.doc_nro],
      })),
    [listaClientes, clienteId],
  )
  const opcionesObra = useMemo(
    () => (obras.data ?? []).map(o => ({
      value: o.cod,
      label: `${o.cod} — ${o.nom}`,
      sub: o.cliente_nom ?? 'sin cliente cargado',
      search: [o.nom, o.cod, o.cliente_nom ?? ''],
    })),
    [obras.data],
  )
  const obraSel = obras.data?.find(o => o.cod === obraCod)
  // La obra es de otro cliente: se avisa, no se bloquea (puede facturarse a un tercero).
  const clienteDistinto = !!obraSel?.cliente_id && !!clienteId && String(obraSel.cliente_id) !== clienteId
  const provinciasCon = (actual: string) =>
    (PROVINCIAS.includes(actual) || !actual ? PROVINCIAS : [actual, ...PROVINCIAS]).map(p => ({ value: p, label: p }))

  // ── Precargas ──
  function elegirCliente(v: string) {
    // El destino sigue al cliente solo si nadie lo eligió a mano: si todavía
    // dice el default o la provincia del cliente anterior.
    const anterior = provinciaDeCliente(listaClientes.find(c => String(c.id) === getValues('cliente_id')))
    const actual = getValues('provincia_destino')
    setValue('cliente_id', v, { shouldValidate: true })
    // Otro cliente, otra cuenta preferida y otro dato de WSFECRED.
    setValue('fce_cuenta_id', '')
    if (!editarId) eligioTipo.current = false
    if (actual === PROVINCIA_DEFAULT || actual === anterior) {
      const prov = provinciaDeCliente(listaClientes.find(c => String(c.id) === v))
      if (prov) setValue('provincia_destino', prov)
    }
  }

  function elegirObra(cod: string) {
    setValue('obra_cod', cod, { shouldValidate: true })
    const o = obras.data?.find(x => x.cod === cod)
    if (o?.cliente_id && !esNc) elegirCliente(String(o.cliente_id))
  }

  function elegirProducto(p: FormData['producto']) {
    setValue('producto', p, { shouldValidate: true })
  }

  // ── Guardar ──
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData, forzar = false) {
    setErrorServer(null)
    if (!tipo) {
      setErrorServer({ msg: 'A este cliente no se le puede hacer ni factura A ni B: corregí su documento o su condición IVA en Clientes.', code: 'LETRA_INCOMPATIBLE' })
      return
    }
    const body: VentasFacturaInput = {
      factura: {
        cbte_tipo:         tipo,
        cliente_id:        Number(d.cliente_id),
        producto:          d.producto,
        obra_cod:          d.obra_cod || null,
        fecha_cbte:        d.fecha_cbte,
        provincia_origen:  d.provincia_origen,
        provincia_destino: d.provincia_destino,
        condicion_pago:    d.condicion_pago.trim(),
        remitos:           d.remitos.trim(),
        observaciones:     d.observaciones.trim(),
        obs_interna:       d.obs_interna.trim(),
        ...(esNc ? { asociada_id: asociadaId } : {}),
        ...(tipo === 201 ? {
          fce_cuenta_id:   d.fce_cuenta_id ? Number(d.fce_cuenta_id) : null,
          fch_vto_pago:    d.fch_vto_pago || d.fecha_cbte,
          fce_transmision: d.fce_transmision,
          fce_referencia:  d.fce_referencia.trim() || null,
        } : {}),
        ...(tipo === 203 ? { nc_anulacion: d.nc_anulacion } : {}),
      },
      renglones: d.renglones.map(r => ({
        descripcion: r.descripcion.trim(),
        cantidad:    Number(r.cantidad),
        unidad:      r.unidad.trim() || UNIDAD_DEFAULT,
        precio_unit: Number(r.precio_unit),
        alicuota_id: Number(r.alicuota_id) as VentasAlicuotaId,
      })),
      ...(forzar ? { forzar: true } : {}),
    }
    try {
      const fj = editarId
        ? await editar.mutateAsync({ id: editarId, ...body })
        : await crear.mutateAsync(body)
      toast(editarId ? '✓ Borrador guardado' : '✓ Borrador creado: revisalo y emitilo desde la ficha', 'ok')
      onGuardada(fj)
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && CAMPOS_FORM.test(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer({ msg: mensajeErrorFacturacion(e), code: codigoErrorFacturacion(e) })
    }
  }

  const nombreTipo = tipoLabel(tipo) ?? (esNc ? 'Nota de crédito' : 'Factura')
  const titulo = esNc
    ? `${nombreTipo}${asociada?.factura.numero_fmt ? ` · s/ ${cortoDe(asociada.factura.cbte_tipo)} ${asociada.factura.numero_fmt}` : ''}`
    : editarId ? `Editar ${nombreTipo.toLowerCase()} (borrador)` : `Nueva ${nombreTipo.toLowerCase()}`

  if (editarId && edicion.isLoading) {
    return (
      <Modal open onClose={onClose} title={titulo} width="max-w-5xl">
        <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
      </Modal>
    )
  }
  if (editarId && edicion.data && edicion.data.factura.estado !== 'borrador') {
    return (
      <Modal open onClose={onClose} title={titulo} width="max-w-lg">
        <Aviso tono="rojo">Este comprobante ya no es un borrador: no se puede editar.</Aviso>
      </Modal>
    )
  }

  const errorRenglones = errors.renglones?.message ?? errors.renglones?.root?.message

  return (
    <Modal
      open
      onClose={guardando ? () => {} : onClose}
      width="max-w-5xl"
      title={titulo}
      footer={
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          {(errorServer?.code === 'NC_SUPERA_FACTURA' || errorServer?.code === 'CORRESPONDE_FCE' || errorServer?.code === 'NO_CORRESPONDE_FCE') && esAdmin && (
            <Button variant="danger" size="sm" loading={guardando}
              onClick={handleSubmit(d => guardar(d, true))}
              title={errorServer.code === 'NC_SUPERA_FACTURA'
                ? 'Solo admin: guardar aunque supere el saldo de la factura'
                : 'Solo admin: guardar con este tipo aunque ARCA diga otra cosa'}>
              Guardar igual (forzar)
            </Button>
          )}
          <Button size="sm" loading={guardando} onClick={handleSubmit(d => guardar(d))}>
            {editarId ? 'Guardar borrador' : 'Crear borrador'}
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-4 text-sm" onSubmit={e => e.preventDefault()}>

        {esNc && asociada && (
          <Aviso tono="gris">
            Corrige la <b>{cortoDe(asociada.factura.cbte_tipo)} {asociada.factura.numero_fmt}</b> del {asociada.factura.fecha_cbte.split('-').reverse().join('/')}
            {' '}por <b>{fmtM(asociada.factura.imp_total)}</b>.
            {' '}Saldo que todavía se puede acreditar: <b className="font-mono">{fmtM(saldoNc)}</b>
            {Number(asociada.factura.nc_autorizadas) > 0 && <> (ya tiene NC por {fmtM(asociada.factura.nc_autorizadas)})</>}.
          </Aviso>
        )}

        {/* ── Cabecera ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Combobox
              label="Cliente"
              placeholder={clientes.isLoading ? 'Cargando clientes…' : 'Buscar por razón social o CUIT'}
              options={opcionesCliente}
              value={clienteId}
              onChange={elegirCliente}
              disabled={esNc}
            />
            {errors.cliente_id && <span className="text-xs text-rojo font-semibold">{errors.cliente_id.message}</span>}
            {esNc && <span className="text-[11px] text-gris-dark">En una nota de crédito el cliente es el de la factura.</span>}
            {cliente && (
              <div className="text-[11px] text-gris-dark mt-0.5">
                {fmtDoc(cliente.doc_tipo, cliente.doc_nro)} · {CONDICIONES_IVA[cliente.condicion_iva_id] ?? cliente.condicion_iva_id}
                {letraCliente && <> · le corresponde <b>factura {letraCliente}</b></>}
                {cliente.domicilio && <> · {cliente.domicilio}</>}
              </div>
            )}
          </div>
          <div>
            <Combobox
              label={producto === 'TRANSPORTE' ? 'Obra / centro de costo (opcional)' : 'Obra / centro de costo'}
              placeholder={obras.isLoading ? 'Cargando obras…' : 'Buscar obra por nombre o código'}
              options={opcionesObra}
              value={obraCod}
              onChange={elegirObra}
            />
            {errors.obra_cod && <span className="text-xs text-rojo font-semibold">{errors.obra_cod.message}</span>}
            {!errors.obra_cod && !obraCod && (
              <span className="text-[11px] text-gris-dark">Al elegirla se precarga su cliente.</span>
            )}
            {obraCod && (
              <button type="button" className="text-[11px] text-azul hover:underline" onClick={() => setValue('obra_cod', '', { shouldValidate: true })}>
                ✕ sin obra
              </button>
            )}
          </div>
        </div>

        {clienteDistinto && obraSel && cliente && (
          <Aviso tono="naranja">
            La obra <b>{obraSel.cod} — {obraSel.nom}</b> es de <b>{obraSel.cliente_nom ?? 'otro cliente'}</b> y la factura va a
            {' '}<b>{cliente.razon_social}</b>. Si está bien, seguí; si no, cambiá el cliente o la obra.
          </Aviso>
        )}
        {cliente && !letraCliente && (
          <Aviso tono="rojo">
            A <b>{cliente.razon_social}</b> no se le puede hacer ni factura A ni B: es «{CONDICIONES_IVA[cliente.condicion_iva_id] ?? cliente.condicion_iva_id}»
            y no tiene CUIT. Un Responsable Inscripto o Monotributista solo recibe factura A, que exige CUIT. Corregilo en Clientes.
          </Aviso>
        )}
        {cliente && esNc && letraCliente && letraAsociada && letraCliente !== letraAsociada && (
          <Aviso tono="rojo">
            La factura es {letraAsociada} pero hoy a <b>{cliente.razon_social}</b> le corresponde {letraCliente}: la nota de crédito tiene
            que ser de la misma letra que la factura. Revisá la condición IVA del cliente.
          </Aviso>
        )}
        {faltaIdentificar && (
          <Aviso tono="rojo">
            Desde {fmtM(TOPE_CF_IDENTIFICACION)} el consumidor final tiene que estar identificado (RG 5700):
            cargale DNI o CUIT a <b>{cliente?.razon_social}</b> en Clientes, o elegí el cliente identificado.
          </Aviso>
        )}
        {letra === 'B' && (
          <Aviso tono="gris">
            Factura B: acá se cargan precios <b>netos</b> como siempre; en el PDF cada renglón sale con IVA incluido y abajo
            el «IVA contenido» (Ley 27.743).
          </Aviso>
        )}
        {cliente && !cliente.activo && (
          <Aviso tono="naranja">El cliente está dado de baja: reactivalo en Clientes antes de emitir.</Aviso>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Producto"
            options={PRODUCTOS.map(p => ({ value: p.key, label: p.label }))}
            value={producto}
            onChange={e => elegirProducto(e.target.value as FormData['producto'])}
            title={PRODUCTOS.find(p => p.key === producto)?.hint}
          />
          <Input label="Fecha" type="date" {...register('fecha_cbte')} error={errors.fecha_cbte?.message}
            hint="ARCA acepta hasta 10 días para atrás o adelante" />
          <Input label="Condición de pago" {...register('condicion_pago')} error={errors.condicion_pago?.message} />
          <Select label="Provincia de origen" options={provinciasCon(origen)} {...register('provincia_origen')}
            error={errors.provincia_origen?.message} />
          <Select label="Provincia de destino" options={provinciasCon(destino)}
            {...register('provincia_destino')}
            error={errors.provincia_destino?.message} />
          <div className="sm:col-span-2">
            <Input label="Remitos (opcional)" {...register('remitos')} placeholder="Ej.: R 0001-00001234" />
          </div>
        </div>

        {/* ── Tipo: Factura A o FCE MiPyME ── */}
        {!esNc && letra === 'A' && (
          <div className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Tipo</span>
              {[{ v: false, l: 'Factura A' }, { v: true, l: 'Factura de Crédito MiPyME (FCE)' }].map(o => (
                <label key={String(o.v)} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={fce === o.v}
                    onChange={() => { eligioTipo.current = true; setValue('fce', o.v) }} />
                  <span className={fce === o.v ? 'font-bold' : ''}>{o.l}</span>
                </label>
              ))}
              {fceInfo.isFetching && <span className="text-[11px] text-gris-dark">Consultando a ARCA si el cliente recibe FCE…</span>}
            </div>
            <div className="text-[11px] text-gris-dark">
              {fceInfo.data?.obligado === true && <>Según ARCA, <b>{cliente?.razon_social}</b> está obligado a recibir FCE desde <b>{fmtM(fceInfo.data.monto_desde ?? MONTO_MINIMO_FCE)}</b>.</>}
              {fceInfo.data?.obligado === false && <>Según ARCA, <b>{cliente?.razon_social}</b> no está obligado a recibir FCE.</>}
              {fceInfo.data?.consultado_at && <> (consultado el {fmtFecha(fceInfo.data.consultado_at)})</>}
              {' '}La FCE es desde {fmtM(MONTO_MINIMO_FCE)}.
            </div>
            {fceInfo.data?.error && (
              <Aviso tono="naranja">
                No se pudo consultar a ARCA si el cliente está obligado a recibir FCE ({fceInfo.data.error.slice(0, 160)}). No se bloquea nada: elegí vos el tipo.
              </Aviso>
            )}
            {bloqueoFce === 'CORRESPONDE_FCE' && (
              <Aviso tono="rojo">
                A este cliente le corresponde <b>Factura de Crédito MiPyME</b> por este importe: con Factura A no se va a poder guardar
                {esAdmin ? ' (como admin podés forzarla).' : '.'}
              </Aviso>
            )}
            {bloqueoFce === 'NO_CORRESPONDE_FCE' && (
              <Aviso tono="rojo">
                {bajoMinimo
                  ? <>La FCE es desde {fmtM(MONTO_MINIMO_FCE)}: por {fmtM(totales.total)} va Factura A común</>
                  : <>Según ARCA este cliente no recibe FCE por este importe: va Factura A común</>}
                {esAdmin ? ' (como admin podés forzarla).' : '.'}
              </Aviso>
            )}

            {fce && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <Select label="Cuenta (CBU del emisor)" {...register('fce_cuenta_id')}
                    options={[
                      { value: '', label: cuentas.isLoading ? 'Cargando cuentas…' : 'Elegí la cuenta' },
                      ...listaCuentas.map(c => ({
                        value: String(c.id),
                        label: `${c.banco} · ${c.cbu}${c.alias ? ` · ${c.alias}` : ''}${c.es_default ? ' (por defecto)' : ''}${cliente?.cuenta_fce_id === c.id ? ' (la del cliente)' : ''}`,
                      })),
                    ]}
                    error={errors.fce_cuenta_id?.message} />
                  {cuentaSel && <span className="text-[11px] text-gris-dark">CBU {cuentaSel.cbu}{cuentaSel.alias ? ` · Alias ${cuentaSel.alias}` : ''}</span>}
                </div>
                <Select label="Opción de transferencia" {...register('fce_transmision')}
                  options={TRANSMISIONES_FCE.map(t => ({ value: t.id, label: t.label }))} />
                <Input label="Vencimiento del pago" type="date" {...register('fch_vto_pago')} min={fechaCbte}
                  error={errors.fch_vto_pago?.message}
                  hint="Vacío = la fecha de la factura (como en ARCA)" />
                <div className="sm:col-span-2">
                  <Input label="Referencia comercial (opcional)" {...register('fce_referencia')} maxLength={50}
                    placeholder="N° de OC / referencia del cliente" error={errors.fce_referencia?.message} />
                </div>
              </div>
            )}
          </div>
        )}

        {esNc && esFce && (
          <div className="border border-gris-mid rounded-lg p-3 flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={anulacion === 'S'} onChange={e => setValue('nc_anulacion', e.target.checked ? 'S' : 'N')} />
              <span>¿Anula la factura completa? <span className="text-gris-dark">(el comprador la rechazó)</span></span>
            </label>
            <span className="text-[11px] text-gris-dark">
              Nota de crédito de una FCE MiPyME: no lleva CBU ni vencimiento. Marcalo solo si el cliente <b>rechazó</b> la FCE en ARCA:
              si no la rechazó, ARCA no acepta la anulación (observación 10154) y la NC va como corrección común.
            </span>
          </div>
        )}

        {/* ── Renglones ── */}
        <div className="border-t border-gris pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Renglones · precios NETOS (sin IVA)</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ ...RENGLON_VACIO })}>+ Renglón</Button>
          </div>
          {errorRenglones && <span className="text-xs text-rojo font-semibold">{errorRenglones}</span>}

          {fields.map((field, i) => {
            const er = errors.renglones?.[i]
            return (
              <div key={field.id} className="border border-gris-mid rounded-lg p-2.5 flex flex-col gap-2 bg-blanco">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-bold text-gris-dark mt-2 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <textarea
                      {...register(`renglones.${i}.descripcion`)}
                      rows={2}
                      placeholder="Descripción (ej.: Certificado N° 5 — avance de obra septiembre)"
                      className={`w-full px-3 py-2 border-[1.5px] rounded-lg text-sm bg-white outline-none focus:border-naranja ${er?.descripcion ? 'border-rojo bg-rojo-light' : 'border-gris-mid'}`}
                    />
                    {er?.descripcion && <span className="text-xs text-rojo font-semibold">{er.descripcion.message}</span>}
                  </div>
                  <button type="button" onClick={() => remove(i)} disabled={fields.length === 1}
                    title={fields.length === 1 ? 'La factura necesita al menos un renglón' : 'Quitar el renglón'}
                    className="text-rojo hover:bg-rojo-light rounded w-8 h-8 shrink-0 disabled:opacity-30 disabled:hover:bg-transparent">✕</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pl-7">
                  <Controller name={`renglones.${i}.cantidad`} control={control} render={({ field: fc }) => (
                    <InputMonto label="Cantidad" decimales={4} value={fc.value} onChange={fc.onChange} onBlur={fc.onBlur}
                      error={er?.cantidad?.message} />
                  )} />
                  <Input label="Unidad" {...register(`renglones.${i}.unidad`)} />
                  <Controller name={`renglones.${i}.precio_unit`} control={control} render={({ field: fc }) => (
                    <InputMonto label="Precio neto" decimales={3} value={fc.value} onChange={fc.onChange} onBlur={fc.onBlur}
                      error={er?.precio_unit?.message} />
                  )} />
                  <Select label="IVA" {...register(`renglones.${i}.alicuota_id`)}
                    options={ALICUOTAS_UI.map(a => ({ value: String(a.id), label: a.label }))}
                    error={er?.alicuota_id?.message} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Subtotal neto</span>
                    <span className="px-3 py-2 font-mono text-sm tabular-nums text-right bg-gris rounded-lg">
                      {fmtM(totales.netos[i] ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Totales en vivo ── */}
        <div className="bg-gris rounded-lg p-3 flex flex-col gap-1 sm:ml-auto sm:w-[340px] text-sm">
          <Fila label="Neto gravado" valor={fmtM(totales.neto)} />
          {totales.alicuotas.map(a => (
            <Fila key={a.alicuota_id} label={`IVA ${ALICUOTA_LABEL[a.alicuota_id] ?? ''} s/ ${fmtM(a.base_imp)}`} valor={fmtM(a.importe)} chico />
          ))}
          <Fila label="IVA" valor={fmtM(totales.iva)} />
          <div className="border-t border-gris-mid my-1" />
          <Fila label="Total" valor={fmtM(totales.total)} fuerte />
        </div>
        {superaSaldo && (
          <Aviso tono="rojo">
            La nota de crédito ({fmtM(totales.total)}) supera el saldo de la factura ({fmtM(saldoNc)}).
            {esAdmin ? ' Como admin podés forzarla, pero revisalo.' : ' Bajá el importe.'}
          </Aviso>
        )}

        {/* ── Textos ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones (se imprimen)</label>
            <textarea {...register('observaciones')} rows={2} placeholder="Ej.: Orden de compra N° 5336694"
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nota interna (no se imprime)</label>
            <textarea {...register('obs_interna')} rows={2}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
          </div>
        </div>

        {errorServer && <Aviso tono="rojo">{errorServer.msg}</Aviso>}
      </form>
    </Modal>
  )
}

function Fila({ label, valor, fuerte, chico }: { label: string; valor: string; fuerte?: boolean; chico?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${chico ? 'text-[11px] text-gris-dark' : ''}`}>
      <span className={fuerte ? 'font-bold' : ''}>{label}</span>
      <span className={`font-mono tabular-nums ${fuerte ? 'font-bold text-azul text-base' : ''}`}>{valor}</span>
    </div>
  )
}
