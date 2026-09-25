'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  ADJUNTO_COBRO_TIPOS, descartarAdjuntoCobroPendiente, descartarAdjuntoPendiente, subirAdjuntoCobro, subirAdjuntoRetencion,
  useAmbienteCobranzas, usePendientesCliente, useRegistrarCobro, type AdjuntoRetencion,
} from '../../hooks/useCobranzas'
import { useCuentasFce } from '../../hooks/useClientesFacturacion'
import { fmtM, hoyAR } from '../../utils/facturacion.utils'
import {
  FORMAS_COBRO, aCent, aplicarAutomatico, claveSaldo, esFormaCheque, imputacionesDe, validarAplicacion,
} from '../../utils/cobranzas.utils'
import { errorDeCampoFacturacion, leerCuerpoError, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type {
  VentasCobroAdjuntoInput, VentasCobroAdjuntoTipo, VentasCobroDetalle, VentasCobroForma, VentasCobroInput, VentasRetencionTipo,
} from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { useConfigVentasValores, useRetencionTipos } from '../../hooks/useConfigVentas'
import { JurisdiccionSelect } from '@/components/JurisdiccionSelect'
import type { RetencionTipoVenta } from '@/types/config.types'
import { ClienteCombobox, GrillaAplicacion, Seccion, TotalesAplicacion, type FilaPendiente } from './Comun'

/**
 * Alta de Cobros a Clientes (modelo Bejerman).
 *
 * Cabecera (fecha y cliente) y tres secciones colapsables:
 *   · Medios de cobro: transferencia a una cuenta de CADINC, cheque/e-cheq
 *     con sus datos, efectivo u otro.
 *   · Retenciones: IIBB, TEM, SUSS, Ganancias, IVA u otra, con jurisdicción,
 *     certificado, fecha, importe y el PDF del certificado.
 *   · Documentación del cliente: comprobante de pago, orden de pago del
 *     cliente u otro. Se suben apenas se eligen y se registran con el cobro.
 *   · Aplicación de comprobantes: las facturas con saldo del cliente, más
 *     vieja primero, con el importe «Aplicado» editable y «Aplicar automático».
 * Total cobro = medios + retenciones; A cuenta = total − aplicado.
 *
 * Todo se valida en vivo acá (aplicado ≤ saldo, Σ ≤ total) y la base lo
 * vuelve a validar con los comprobantes bloqueados (IMPUTACION_SUPERA_SALDO si
 * alguien la cobró en el medio).
 */

const FORMAS = ['transferencia', 'cheque', 'echeq', 'efectivo', 'otro'] as const

const importeValido = (v: string) => v !== '' && Number.isFinite(Number(v)) && Number(v) > 0

const medioSchema = z.object({
  forma:              z.enum(FORMAS),
  importe:            z.string().refine(importeValido, 'Poné el importe'),
  cuenta_bancaria_id: z.string(),
  cheque_numero:      z.string(),
  cheque_banco:       z.string(),
  cheque_librador:    z.string(),
  cheque_fecha_cobro: z.string(),
  obs:                z.string(),
}).superRefine((m, ctx) => {
  if (m.forma === 'transferencia' && !m.cuenta_bancaria_id) {
    ctx.addIssue({ code: 'custom', path: ['cuenta_bancaria_id'], message: 'Elegí la cuenta donde entró' })
  }
  if (esFormaCheque(m.forma)) {
    if (!m.cheque_numero.trim()) ctx.addIssue({ code: 'custom', path: ['cheque_numero'], message: 'Número' })
    if (!m.cheque_banco.trim()) ctx.addIssue({ code: 'custom', path: ['cheque_banco'], message: 'Banco' })
    if (!m.cheque_librador.trim()) ctx.addIssue({ code: 'custom', path: ['cheque_librador'], message: 'Librador' })
    if (!m.cheque_fecha_cobro) ctx.addIssue({ code: 'custom', path: ['cheque_fecha_cobro'], message: 'Fecha de cobro' })
  }
})

const retencionSchema = z.object({
  // Clave del catálogo de tipos (Ventas › Configuración, 20260929g).
  tipo:               z.string().min(1, 'Elegí el tipo'),
  jurisdiccion:       z.string(),
  /** Del catálogo de jurisdicciones (20260929f); null = texto libre o sin jurisdicción. */
  jurisdiccion_id:    z.number().nullable(),
  certificado_numero: z.string(),
  fecha:              z.string().min(1, 'Fecha'),
  importe:            z.string().refine(importeValido, 'Poné el importe'),
  obs:                z.string(),
})

function hoy() { return hoyAR() }

const schema = z.object({
  fecha:       z.string().min(1, 'Poné la fecha'),
  cliente_id:  z.string().min(1, 'Elegí el cliente'),
  obs:         z.string(),
  medios:      z.array(medioSchema),
  retenciones: z.array(retencionSchema),
}).superRefine((d, ctx) => {
  if (d.fecha > hoy()) ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'No puede ser posterior a hoy' })
  d.retenciones.forEach((r, i) => {
    if (r.fecha > hoy()) ctx.addIssue({ code: 'custom', path: ['retenciones', i, 'fecha'], message: 'No puede ser futura' })
  })
  if (d.medios.length === 0 && d.retenciones.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['medios'], message: 'Cargá al menos un medio de cobro o una retención' })
  }
})

type FormData = z.infer<typeof schema>
type MedioForm = FormData['medios'][number]
type RetencionForm = FormData['retenciones'][number]

const MEDIO_VACIO: MedioForm = {
  forma: 'transferencia', importe: '', cuenta_bancaria_id: '', cheque_numero: '', cheque_banco: '',
  cheque_librador: '', cheque_fecha_cobro: '', obs: '',
}
/** Retención nueva con el tipo por defecto (Configuración) y su jurisdicción por defecto. */
const retencionVacia = (t: RetencionTipoVenta | undefined): RetencionForm => ({
  tipo: t?.clave ?? 'iibb', ...jurisdiccionDelTipo(t), certificado_numero: '', fecha: hoyAR(), importe: '', obs: '',
})

/** La jurisdicción que propone un tipo: la suya por defecto si la pide; si no, ninguna. */
function jurisdiccionDelTipo(t: RetencionTipoVenta | undefined): Pick<RetencionForm, 'jurisdiccion' | 'jurisdiccion_id'> {
  if (!t?.pide_jurisdiccion) return { jurisdiccion: '', jurisdiccion_id: null }
  return { jurisdiccion: t.jurisdiccion_default_nombre ?? '', jurisdiccion_id: t.jurisdiccion_default_id }
}

/** El certificado de una retención: se sube apenas se elige (queda pendiente hasta guardar el cobro). */
type EstadoAdjunto =
  | { estado: 'subiendo'; nombre: string }
  | { estado: 'ok'; adj: AdjuntoRetencion }
  | { estado: 'error'; nombre: string; error: string }

/** Un papel del cliente (comprobante, orden de pago…): se sube apenas se elige; el tipo se puede cambiar hasta guardar. */
interface DocCliente {
  key:     string
  tipo:    VentasCobroAdjuntoTipo
  nombre:  string
  estado:  'subiendo' | 'ok' | 'error'
  adj?:    VentasCobroAdjuntoInput
  error?:  string
}

const CAMPOS_FORM = /^(fecha|cliente_id|obs|medios\.\d+\.(forma|importe|cuenta_bancaria_id|cheque_numero|cheque_banco|cheque_librador|cheque_fecha_cobro|obs)|retenciones\.\d+\.(tipo|jurisdiccion|jurisdiccion_id|certificado_numero|fecha|importe|obs))$/

interface Props {
  /** Precarga el cliente (desde Deudores / estado de cuenta). */
  clienteInicial?: number
  onClose:         () => void
  onGuardado:      (d: VentasCobroDetalle) => void
}

export function ModalCobro({ clienteInicial, onClose, onGuardado }: Props) {
  const toast = useToast()
  const { registrarCobros, puedeVer } = usePermisos('facturacion')
  const ambiente = useAmbienteCobranzas()
  const registrar = useRegistrarCobro()
  const cuentas = useCuentasFce()
  const tiposRet = useRetencionTipos()
  const { valores } = useConfigVentasValores()
  const tipoRetDefault = tiposRet.tipos.find(t => t.clave === valores.retencion_tipo_default) ?? tiposRet.tipos[0]

  const [abierta, setAbierta] = useState({ medios: true, retenciones: false, documentacion: false, aplicacion: true })
  // La aplicación es DEL cliente elegido: si cambia el cliente, la anterior no sirve (se descarta sola).
  const [aplic, setAplic] = useState<{ cliente: string; map: Record<string, string> }>({ cliente: '', map: {} })
  const [adjuntos, setAdjuntos] = useState<Record<string, EstadoAdjunto>>({})
  const [docs, setDocs] = useState<DocCliente[]>([])
  const [tipoDoc, setTipoDoc] = useState<VentasCobroAdjuntoTipo>('comprobante_pago')
  // Lo subido que sigue en cobros/pendientes/ (para descartar al cerrar sin guardar, aunque el estado no se haya refrescado).
  const docsSubidos = useRef<Set<string>>(new Set())
  // Claves quitadas mientras su archivo subía: al terminar, se descarta.
  const docsQuitados = useRef<Set<string>>(new Set())
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const guardado = useRef(false)

  const { register, control, handleSubmit, setValue, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: hoyAR(), cliente_id: clienteInicial ? String(clienteInicial) : '', obs: '',
      medios: [MEDIO_VACIO], retenciones: [],
    },
  })
  const medios = useFieldArray({ control, name: 'medios' })
  const retenciones = useFieldArray({ control, name: 'retenciones' })

  const clienteId = useWatch({ control, name: 'cliente_id' })
  const mediosW = useWatch({ control, name: 'medios' })
  const retencionesW = useWatch({ control, name: 'retenciones' })

  const pendientes = usePendientesCliente(clienteId ? Number(clienteId) : null, ambiente, puedeVer)
  const filas: FilaPendiente[] = useMemo(
    () => (pendientes.data?.debitos ?? []).filter(s => Number(s.saldo) > 0).map(s => ({ ...s, clave: claveSaldo(s) })),
    [pendientes.data],
  )

  const aplicado = useMemo(() => (aplic.cliente === clienteId ? aplic.map : {}), [aplic, clienteId])
  const setAplicado = (fn: Record<string, string> | ((a: Record<string, string>) => Record<string, string>)) =>
    setAplic(prev => ({ cliente: clienteId, map: typeof fn === 'function' ? fn(prev.cliente === clienteId ? prev.map : {}) : fn }))

  const mediosCent = (mediosW ?? []).reduce((s, m) => s + Math.max(0, aCent(m.importe)), 0)
  const retCent = (retencionesW ?? []).reduce((s, r) => s + Math.max(0, aCent(r.importe)), 0)
  const totalCent = mediosCent + retCent
  const val = validarAplicacion(filas, aplicado, totalCent)
  const hayErrorGrilla = Object.keys(val.errores).length > 0 || val.superaTotal
  const subiendo = Object.values(adjuntos).some(a => a.estado === 'subiendo') || docs.some(x => x.estado === 'subiendo')

  const listaCuentas = (cuentas.data ?? []).filter(c => c.activo)
  const opcionesCuenta = [
    { value: '', label: cuentas.isLoading ? 'Cargando cuentas…' : 'Elegí la cuenta de CADINC' },
    ...listaCuentas.map(c => ({ value: String(c.id), label: `${c.banco} · ${c.alias || c.cbu}${c.es_default ? ' (por defecto)' : ''}` })),
  ]

  // Transferencia: arranca en la cuenta marcada «por defecto» (o en la única que haya);
  // lo más común es que entre siempre al mismo banco. Se puede cambiar.
  const cuentaDefault = (() => {
    const d = listaCuentas.find(c => c.es_default) ?? (listaCuentas.length === 1 ? listaCuentas[0] : undefined)
    return d ? String(d.id) : null
  })()
  useEffect(() => {
    if (!cuentaDefault) return
    ;(mediosW ?? []).forEach((m, i) => {
      if (m.forma === 'transferencia' && !m.cuenta_bancaria_id) setValue(`medios.${i}.cuenta_bancaria_id`, cuentaDefault)
    })
  }, [cuentaDefault, mediosW, setValue])

  async function elegirAdjunto(key: string, file: File | undefined) {
    if (!file) return
    const previo = adjuntos[key]
    setAdjuntos(a => ({ ...a, [key]: { estado: 'subiendo', nombre: file.name } }))
    try {
      const adj = await subirAdjuntoRetencion(file)
      if (previo?.estado === 'ok') void descartarAdjuntoPendiente(previo.adj.adjunto_path)
      setAdjuntos(a => ({ ...a, [key]: { estado: 'ok', adj } }))
    } catch (e) {
      setAdjuntos(a => ({ ...a, [key]: { estado: 'error', nombre: file.name, error: e instanceof Error ? e.message : mensajeErrorFacturacion(e) } }))
    }
  }

  function quitarAdjunto(key: string) {
    const a = adjuntos[key]
    if (a?.estado === 'ok') void descartarAdjuntoPendiente(a.adj.adjunto_path)
    setAdjuntos(x => { const n = { ...x }; delete n[key]; return n })
  }

  async function elegirDocs(files: FileList | null) {
    const lista = Array.from(files ?? [])
    if (lista.length === 0) return
    const tipo = tipoDoc
    const nuevos: DocCliente[] = lista.map(f => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, tipo, nombre: f.name, estado: 'subiendo' }))
    setDocs(d => [...d, ...nuevos])
    await Promise.all(lista.map(async (file, i) => {
      const key = nuevos[i]!.key
      try {
        const adj = await subirAdjuntoCobro(file, tipo)
        if (docsQuitados.current.has(key)) {
          void descartarAdjuntoCobroPendiente(adj.storage_path)
          return
        }
        docsSubidos.current.add(adj.storage_path)
        setDocs(d => d.map(x => (x.key === key ? { ...x, estado: 'ok', adj } : x)))
      } catch (e) {
        const msg = e instanceof Error && !('body' in e) ? e.message : mensajeErrorFacturacion(e)
        setDocs(d => d.map(x => (x.key === key ? { ...x, estado: 'error', error: msg } : x)))
      }
    }))
  }

  function quitarDoc(key: string) {
    const d = docs.find(x => x.key === key)
    docsQuitados.current.add(key)
    if (d?.adj) {
      docsSubidos.current.delete(d.adj.storage_path)
      void descartarAdjuntoCobroPendiente(d.adj.storage_path)
    }
    setDocs(x => x.filter(y => y.key !== key))
  }

  function cerrar() {
    if (registrar.isPending) return
    // Lo que se subió y no llegó a un cobro queda colgado en el bucket.
    if (!guardado.current) {
      Object.values(adjuntos).forEach(a => { if (a.estado === 'ok') void descartarAdjuntoPendiente(a.adj.adjunto_path) })
      docsSubidos.current.forEach(p => { void descartarAdjuntoCobroPendiente(p) })
    }
    onClose()
  }

  function aplicarAuto() {
    setAplicado(aplicarAutomatico(filas, totalCent))
    setAbierta(a => ({ ...a, aplicacion: true }))
  }

  async function guardar(d: FormData) {
    setErrorServer(null)
    if (hayErrorGrilla) {
      setErrorServer(val.superaTotal ? 'Lo aplicado supera el total del cobro.' : 'Hay importes aplicados que superan el saldo del comprobante.')
      return
    }
    if (subiendo) { setErrorServer('Esperá a que terminen de subir los archivos.'); return }
    const body: VentasCobroInput = {
      cobro: { fecha: d.fecha, cliente_id: Number(d.cliente_id), obs: d.obs.trim(), ambiente },
      medios: d.medios.map(m => ({
        forma:   m.forma as VentasCobroForma,
        importe: Number(m.importe),
        cuenta_bancaria_id: m.forma === 'transferencia' && m.cuenta_bancaria_id ? Number(m.cuenta_bancaria_id) : null,
        ...(esFormaCheque(m.forma) ? {
          cheque_numero: m.cheque_numero.trim(), cheque_banco: m.cheque_banco.trim(),
          cheque_librador: m.cheque_librador.trim(), cheque_fecha_cobro: m.cheque_fecha_cobro,
        } : {}),
        obs: m.obs.trim(),
      })),
      retenciones: d.retenciones.map((r, i) => {
        const a = adjuntos[retenciones.fields[i]?.id ?? '']
        return {
          tipo: r.tipo as VentasRetencionTipo, jurisdiccion: r.jurisdiccion.trim(), jurisdiccion_id: r.jurisdiccion_id,
          certificado_numero: r.certificado_numero.trim(),
          fecha: r.fecha, importe: Number(r.importe), obs: r.obs.trim(),
          ...(a?.estado === 'ok' ? a.adj : {}),
        }
      }),
      imputaciones: imputacionesDe(filas, aplicado),
      adjuntos: docs.filter(x => x.estado === 'ok' && x.adj).map(x => ({ ...x.adj!, tipo: x.tipo })),
    }
    try {
      const det = await registrar.mutateAsync(body)
      guardado.current = true
      toast(`✓ Cobro ${det.cobro?.numero_fmt ?? ''} registrado${Number(det.cobro?.a_cuenta) > 0 ? ` · ${fmtM(det.cobro.a_cuenta)} a cuenta` : ''}`, 'ok')
      if (det.adjuntos_error?.length) {
        toast(`El cobro quedó registrado, pero no se guardaron ${det.adjuntos_error.length} archivo(s): ${det.adjuntos_error.map(x => x.nombre_archivo).join(', ')}. Adjuntalos desde la ficha.`, 'err')
      }
      onGuardado(det)
    } catch (e) {
      const { error, detail } = leerCuerpoError(e)
      // MEDIO_INVALIDO / RETENCION_INVALIDA traen índice 1-based y el campo.
      const ind = detail && typeof detail === 'object' ? Number((detail as Record<string, unknown>).indice) : NaN
      const campo = detail && typeof detail === 'object' ? (detail as Record<string, unknown>).campo : undefined
      if ((error === 'MEDIO_INVALIDO' || error === 'RETENCION_INVALIDA') && Number.isInteger(ind) && typeof campo === 'string') {
        const ruta = `${error === 'MEDIO_INVALIDO' ? 'medios' : 'retenciones'}.${ind - 1}.${campo}`
        if (CAMPOS_FORM.test(ruta)) setError(ruta as FieldPath<FormData>, { message: mensajeErrorFacturacion(e) })
      } else {
        const ce = errorDeCampoFacturacion(e)
        if (ce && CAMPOS_FORM.test(ce.campo.replace(/^cobro\./, ''))) {
          setError(ce.campo.replace(/^cobro\./, '') as FieldPath<FormData>, { message: ce.mensaje })
        }
      }
      setErrorServer(mensajeErrorFacturacion(e))
      // Un saldo que cambió en el medio: refrescar la grilla para que se vea el nuevo.
      if (error === 'IMPUTACION_SUPERA_SALDO') void pendientes.refetch()
    }
  }

  const puedeGuardar = registrarCobros && totalCent > 0 && !hayErrorGrilla && !subiendo

  return (
    <Modal
      open
      onClose={cerrar}
      width="max-w-5xl"
      title="Alta de cobro a cliente"
      footer={
        <div className="flex gap-2 justify-end flex-wrap items-center w-full">
          <span className="text-xs text-gris-dark mr-auto">
            {ambiente === 'homo' && <b className="text-[#7A5000]">HOMOLOGACIÓN · </b>}
            Se numera al guardar (RC 0001-…).
          </span>
          <Button variant="ghost" size="sm" onClick={cerrar} disabled={registrar.isPending}>Cancelar</Button>
          <Button size="sm" loading={registrar.isPending} onClick={handleSubmit(guardar)} disabled={!puedeGuardar}
            title={!registrarCobros ? 'Hace falta el permiso «Registrar cobros»'
              : totalCent <= 0 ? 'Cargá al menos un medio de cobro o una retención'
              : hayErrorGrilla ? 'Corregí los importes aplicados'
              : subiendo ? 'Subiendo archivos…' : 'Registrar el cobro'}>
            Registrar cobro {totalCent > 0 ? fmtM(totalCent / 100) : ''}
          </Button>
        </div>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        {!registrarCobros && (
          <Aviso tono="naranja">No tenés el permiso «Registrar cobros»: podés mirar, pero no guardar.</Aviso>
        )}

        {/* ── Cabecera ── */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input label="Fecha" type="date" max={hoyAR()} {...register('fecha')} error={errors.fecha?.message} />
          <div className="sm:col-span-3">
            <Controller control={control} name="cliente_id" render={({ field }) => (
              <ClienteCombobox value={field.value} onChange={v => field.onChange(v)} error={errors.cliente_id?.message}
                disabled={!!clienteInicial} />
            )} />
          </div>
        </div>

        {/* ── Medios de cobro ── */}
        <Seccion titulo="Medios de cobro" abierta={abierta.medios}
          onToggle={() => setAbierta(a => ({ ...a, medios: !a.medios }))}
          resumen={`${medios.fields.length} · ${fmtM(mediosCent / 100)}`}
          acciones={<Button type="button" size="sm" variant="secondary" onClick={() => medios.append(MEDIO_VACIO)}>+ Medio</Button>}>
          {errors.medios?.message && <span className="text-xs text-rojo font-semibold">{errors.medios.message}</span>}
          {medios.fields.length === 0 && <span className="text-xs text-gris-dark italic">Sin medios: el cobro es solo de retenciones.</span>}
          {medios.fields.map((f, i) => {
            const forma = mediosW?.[i]?.forma ?? 'transferencia'
            const e = errors.medios?.[i]
            return (
              <div key={f.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start border-b border-gris pb-3 last:border-0 last:pb-0">
                <Select label="Forma" {...register(`medios.${i}.forma`)} options={FORMAS_COBRO.map(x => ({ value: x.key, label: x.label }))} />
                <Controller control={control} name={`medios.${i}.importe`} render={({ field }) => (
                  <InputMonto label="Importe" value={field.value} onChange={field.onChange} error={e?.importe?.message} />
                )} />
                {forma === 'transferencia' && (
                  <div className="col-span-2 sm:col-span-3">
                    <Select label="Cuenta de CADINC" {...register(`medios.${i}.cuenta_bancaria_id`)} options={opcionesCuenta}
                      error={e?.cuenta_bancaria_id?.message} />
                  </div>
                )}
                {esFormaCheque(forma) && <>
                  <Input label="N° de cheque" {...register(`medios.${i}.cheque_numero`)} error={e?.cheque_numero?.message} />
                  <Input label="Banco" {...register(`medios.${i}.cheque_banco`)} error={e?.cheque_banco?.message} />
                  <Input label="Fecha de cobro" type="date" {...register(`medios.${i}.cheque_fecha_cobro`)} error={e?.cheque_fecha_cobro?.message} />
                  <div className="col-span-2 sm:col-span-3 sm:col-start-3">
                    <Input label="Librador" {...register(`medios.${i}.cheque_librador`)} error={e?.cheque_librador?.message}
                      placeholder="Quién firmó el cheque" />
                  </div>
                </>}
                {(forma === 'efectivo' || forma === 'otro') && (
                  <div className="col-span-2 sm:col-span-3">
                    <Input label="Observación" {...register(`medios.${i}.obs`)} placeholder={forma === 'otro' ? 'Qué es' : 'Opcional'} />
                  </div>
                )}
                <div className="flex items-end h-full justify-end sm:col-start-6 sm:row-start-1">
                  <button type="button" onClick={() => medios.remove(i)} className="text-xs text-rojo hover:underline pb-2" title="Quitar este medio">Quitar</button>
                </div>
              </div>
            )
          })}
        </Seccion>

        {/* ── Retenciones ── */}
        <Seccion titulo="Retenciones" abierta={abierta.retenciones}
          onToggle={() => setAbierta(a => ({ ...a, retenciones: !a.retenciones }))}
          resumen={retenciones.fields.length ? `${retenciones.fields.length} · ${fmtM(retCent / 100)}` : 'ninguna'}
          acciones={<Button type="button" size="sm" variant="secondary" onClick={() => retenciones.append(retencionVacia(tipoRetDefault))}>+ Retención</Button>}>
          {retenciones.fields.length === 0 && (
            <span className="text-xs text-gris-dark italic">Si el cliente retuvo IIBB, TEM, SUSS, Ganancias o IVA, cargá el certificado: suma al total del cobro.</span>
          )}
          {retenciones.fields.map((f, i) => {
            const e = errors.retenciones?.[i]
            const a = adjuntos[f.id]
            return (
              <div key={f.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start border-b border-gris pb-3 last:border-0 last:pb-0">
                <Select label="Tipo" {...register(`retenciones.${i}.tipo`, {
                  onChange: ev => {
                    const j = jurisdiccionDelTipo(tiposRet.tipos.find(x => x.clave === ev.target.value))
                    setValue(`retenciones.${i}.jurisdiccion`, j.jurisdiccion)
                    setValue(`retenciones.${i}.jurisdiccion_id`, j.jurisdiccion_id)
                  },
                })} error={e?.tipo?.message} options={tiposRet.tipos.map(x => ({ value: x.clave, label: x.corto }))} />
                <Controller control={control} name={`retenciones.${i}.jurisdiccion_id`} render={({ field }) => (
                  <JurisdiccionSelect label="Jurisdicción" placeholder="Opcional"
                    value={{ id: field.value, nombre: retencionesW?.[i]?.jurisdiccion ?? '' }}
                    onChange={v => { field.onChange(v.id); setValue(`retenciones.${i}.jurisdiccion`, v.nombre) }} />
                )} />
                <Input label="N° de certificado" {...register(`retenciones.${i}.certificado_numero`)} />
                <Input label="Fecha" type="date" max={hoyAR()} {...register(`retenciones.${i}.fecha`)} error={e?.fecha?.message} />
                <Controller control={control} name={`retenciones.${i}.importe`} render={({ field }) => (
                  <InputMonto label="Importe" value={field.value} onChange={field.onChange} error={e?.importe?.message} />
                )} />
                <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Certificado</span>
                  {a?.estado === 'ok' ? (
                    <span className="text-xs flex items-center gap-1 min-w-0">
                      <span className="truncate" title={a.adj.adjunto_nombre}>📎 {a.adj.adjunto_nombre}</span>
                      <button type="button" className="text-rojo shrink-0" onClick={() => quitarAdjunto(f.id)} title="Quitar el archivo">✕</button>
                    </span>
                  ) : a?.estado === 'subiendo' ? (
                    <span className="text-xs text-gris-dark">Subiendo…</span>
                  ) : (
                    <label className="text-xs text-azul hover:underline cursor-pointer">
                      Adjuntar PDF
                      <input type="file" accept="application/pdf,image/*" className="hidden"
                        onChange={ev => { void elegirAdjunto(f.id, ev.target.files?.[0]); ev.target.value = '' }} />
                    </label>
                  )}
                  {a?.estado === 'error' && <span className="text-[11px] text-rojo">{a.error}</span>}
                  <button type="button" onClick={() => { quitarAdjunto(f.id); retenciones.remove(i) }}
                    className="text-xs text-rojo hover:underline self-start">Quitar</button>
                </div>
              </div>
            )
          })}
        </Seccion>

        {/* ── Documentación del cliente ── */}
        <Seccion titulo="Documentación del cliente" abierta={abierta.documentacion}
          onToggle={() => setAbierta(a => ({ ...a, documentacion: !a.documentacion }))}
          resumen={docs.length ? `${docs.length} archivo${docs.length === 1 ? '' : 's'}` : 'ninguna'}
          acciones={
            <div className="flex gap-1.5 items-center">
              <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value as VentasCobroAdjuntoTipo)} aria-label="Tipo de documento"
                className="text-xs border border-gris-mid rounded px-1.5 py-1 bg-white">
                {ADJUNTO_COBRO_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <label className={`text-xs font-semibold px-2.5 py-1 rounded border ${registrarCobros ? 'border-azul text-azul cursor-pointer hover:bg-azul/5' : 'border-gris-mid text-gris-mid cursor-not-allowed'}`}
                title={registrarCobros ? 'PDF o foto, hasta 10 MB. Podés elegir varios.' : 'Hace falta el permiso «Registrar cobros»'}>
                + Adjuntar
                <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={!registrarCobros}
                  onChange={ev => { void elegirDocs(ev.target.files); ev.target.value = ''; setAbierta(a => ({ ...a, documentacion: true })) }} />
              </label>
            </div>
          }>
          {docs.length === 0 ? (
            <span className="text-xs text-gris-dark italic">
              El comprobante de la transferencia o depósito, la orden de pago del cliente (qué facturas paga y qué retiene) u otro papel.
              Los certificados de retención van en cada retención.
            </span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {docs.map(x => (
                <li key={x.key} className="flex items-center gap-2 text-xs border-b border-gris pb-1.5 last:border-0 last:pb-0 min-w-0">
                  <select value={x.tipo} aria-label="Tipo"
                    onChange={e => { const t = e.target.value as VentasCobroAdjuntoTipo; setDocs(d => d.map(y => (y.key === x.key ? { ...y, tipo: t } : y))) }}
                    className="text-xs border border-gris-mid rounded px-1 py-0.5 bg-white shrink-0">
                    {ADJUNTO_COBRO_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <span className="truncate min-w-0" title={x.nombre}>📎 {x.nombre}</span>
                  {x.estado === 'subiendo' && <span className="text-gris-dark shrink-0">Subiendo…</span>}
                  {x.estado === 'error' && <span className="text-rojo shrink-0">{x.error}</span>}
                  <button type="button" className="text-rojo hover:underline ml-auto shrink-0" onClick={() => quitarDoc(x.key)}
                    title="Quitar el archivo">Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        {/* ── Aplicación de comprobantes ── */}
        <Seccion titulo="Aplicación de comprobantes" abierta={abierta.aplicacion}
          onToggle={() => setAbierta(a => ({ ...a, aplicacion: !a.aplicacion }))}
          resumen={clienteId ? `${filas.length} con saldo · aplicado ${fmtM(val.aplicadoCent / 100)}` : 'elegí el cliente'}
          acciones={
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAplicado({})} disabled={Object.keys(aplicado).length === 0}>Limpiar</Button>
              <Button type="button" size="sm" variant="secondary" onClick={aplicarAuto} disabled={totalCent <= 0 || filas.length === 0}
                title={totalCent <= 0 ? 'Cargá primero los medios o retenciones' : 'Reparte el total del más viejo al más nuevo'}>
                Aplicar automático
              </Button>
            </div>
          }>
          {!clienteId ? (
            <span className="text-sm text-gris-dark italic">Elegí el cliente para ver sus comprobantes con saldo.</span>
          ) : pendientes.isLoading ? (
            <span className="text-sm text-gris-dark">Cargando comprobantes…</span>
          ) : pendientes.error ? (
            <Aviso tono="rojo">{mensajeErrorFacturacion(pendientes.error)}</Aviso>
          ) : (
            <GrillaAplicacion filas={filas} aplicado={aplicado} errores={val.errores}
              onCambiar={(k, raw) => setAplicado(a => ({ ...a, [k]: raw }))}
              vacio="El cliente no debe nada: el cobro queda entero a cuenta." />
          )}
          <TotalesAplicacion totalLabel="Total cobro" totalCent={totalCent} aplicadoCent={val.aplicadoCent} superaTotal={val.superaTotal} />
          {val.superaTotal && <Aviso tono="rojo">Lo aplicado supera el total del cobro ({fmtM(totalCent / 100)}).</Aviso>}
          {aCent(pendientes.data?.totales?.a_cuenta) > 0 && (
            <span className="text-[11px] text-gris-dark">
              El cliente ya tiene {fmtM(pendientes.data?.totales?.a_cuenta)} a cuenta de cobros anteriores: se aplica desde la ficha de ese cobro o con «Compensación».
            </span>
          )}
        </Seccion>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones</label>
          <textarea {...register('obs')} rows={2}
            className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
        </div>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
