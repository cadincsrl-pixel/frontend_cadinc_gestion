'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbBienDetalle, CtbBienInput, CtbCuenta } from '@/types/contabilidad.types'
import { useBien, useConfigCtb, useCuentas, useGuardarBien, useMapeos, useObrasCtb, useRevertirBajaBien } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, hoyAR, numeroAsiento } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { cuotaMensual, filtroCuentaOrigen, sugerirCuentaAmort, sugerirCuentaGasto } from '../utils/bienes'
import { Aviso, Campo, ErrorCarga, Th, inputCls } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'
import { ModalBajaBien } from './ModalBajaBien'

/**
 * Alta, detalle y edición de un bien de uso (tanda 5, 20260928p).
 *
 * Uno existente arranca en DETALLE (solo lectura) con sus amortizaciones;
 * «Editar» habilita los campos. Al elegir la cuenta de origen (1.2.2.XX.01)
 * se sugieren la de amortización acumulada (la hermana .03) y la de gasto
 * (mapeo `bienes.gasto` del rubro o el general). «No se amortiza» (terrenos)
 * apaga la vida útil y esas dos cuentas.
 *
 * La amortización acumulada inicial es la que trae el inventario a la fecha
 * de corte (30/06/2026): solo la llevan los bienes dados de alta hasta ese día.
 */

const n = (v: string) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

function crearSchema(corte: string) {
  return z.object({
    descripcion:        z.string().trim().min(3, 'Al menos 3 caracteres').max(200, 'Hasta 200 caracteres'),
    identificador:      z.string().max(80, 'Hasta 80 caracteres'),
    cuenta_origen_id:   z.string().min(1, 'Elegí la cuenta de origen'),
    no_amortiza:        z.boolean(),
    cuenta_amort_id:    z.string(),
    cuenta_gasto_id:    z.string(),
    fecha_alta:         z.string().min(1, 'Poné la fecha de alta'),
    valor_origen:       z.string(),
    vida_util_anios:    z.string(),
    valor_residual:     z.string(),
    amort_acum_inicial: z.string(),
    criterio_alta:      z.enum(['', 'completo', 'proporcional']),
    obra_cod:           z.string(),
    pagos_factura_id:   z.string().refine(v => v.trim() === '' || /^\d{1,12}$/.test(v.trim()), 'Un número'),
    obs:                z.string().max(1000, 'Hasta 1000 caracteres'),
  }).superRefine((d, ctx) => {
    const vo = n(d.valor_origen)
    const res = n(d.valor_residual)
    const ini = n(d.amort_acum_inicial)
    if (!(vo > 0)) ctx.addIssue({ code: 'custom', path: ['valor_origen'], message: 'Poné un valor mayor a cero' })
    if (d.fecha_alta > hoyAR()) ctx.addIssue({ code: 'custom', path: ['fecha_alta'], message: 'No puede ser posterior a hoy' })
    if (res < 0) ctx.addIssue({ code: 'custom', path: ['valor_residual'], message: 'No puede ser negativo' })
    else if (vo > 0 && res >= vo) ctx.addIssue({ code: 'custom', path: ['valor_residual'], message: 'Tiene que ser menor al valor de origen' })
    if (ini < 0) ctx.addIssue({ code: 'custom', path: ['amort_acum_inicial'], message: 'No puede ser negativa' })
    else if (vo > 0 && ini > vo - res + 0.001) ctx.addIssue({ code: 'custom', path: ['amort_acum_inicial'], message: 'No puede superar valor de origen − residual' })
    if (ini > 0 && corte && d.fecha_alta > corte) {
      ctx.addIssue({ code: 'custom', path: ['amort_acum_inicial'], message: `Solo la llevan los bienes dados de alta hasta el ${fmtFecha(corte)}` })
    }
    if (!d.no_amortiza) {
      if (!(n(d.vida_util_anios) > 0)) ctx.addIssue({ code: 'custom', path: ['vida_util_anios'], message: 'Poné la vida útil en años' })
      if (!d.cuenta_amort_id) ctx.addIssue({ code: 'custom', path: ['cuenta_amort_id'], message: 'Elegí la cuenta de amortización acumulada' })
      if (!d.cuenta_gasto_id) ctx.addIssue({ code: 'custom', path: ['cuenta_gasto_id'], message: 'Elegí la cuenta de gasto' })
    }
  })
}
type FormData = z.infer<ReturnType<typeof crearSchema>>

const CAMPOS: ReadonlySet<string> = new Set([
  'descripcion', 'identificador', 'cuenta_origen_id', 'cuenta_amort_id', 'cuenta_gasto_id', 'fecha_alta', 'valor_origen',
  'vida_util_anios', 'valor_residual', 'amort_acum_inicial', 'criterio_alta', 'obra_cod', 'pagos_factura_id', 'obs',
])

function defaults(b: CtbBienDetalle | null): FormData {
  if (!b) {
    return {
      descripcion: '', identificador: '', cuenta_origen_id: '', no_amortiza: false, cuenta_amort_id: '', cuenta_gasto_id: '',
      fecha_alta: '', valor_origen: '', vida_util_anios: '', valor_residual: '', amort_acum_inicial: '', criterio_alta: '',
      obra_cod: '', pagos_factura_id: '', obs: '',
    }
  }
  return {
    descripcion: b.descripcion, identificador: b.identificador ?? '', cuenta_origen_id: String(b.cuenta_origen_id),
    no_amortiza: b.vida_util_anios == null,
    cuenta_amort_id: b.cuenta_amort_id ? String(b.cuenta_amort_id) : '', cuenta_gasto_id: b.cuenta_gasto_id ? String(b.cuenta_gasto_id) : '',
    fecha_alta: b.fecha_alta, valor_origen: String(b.valor_origen), vida_util_anios: b.vida_util_anios != null ? String(b.vida_util_anios) : '',
    valor_residual: b.valor_residual ? String(b.valor_residual) : '', amort_acum_inicial: b.amort_acum_inicial ? String(b.amort_acum_inicial) : '',
    criterio_alta: b.criterio_alta ?? '', obra_cod: b.obra_cod ?? '', pagos_factura_id: b.pagos_factura_id ? String(b.pagos_factura_id) : '',
    obs: b.obs ?? '',
  }
}

export function ModalBienUso({ id, onClose, onCreado, onVerAsiento }: {
  /** null = nuevo. */
  id:           number | null
  onClose:      () => void
  onCreado:     (id: number) => void
  onVerAsiento: (asientoId: number) => void
}) {
  const q = useBien(id)
  const config = useConfigCtb()
  if ((id && q.isLoading) || config.isLoading) {
    return <Modal open onClose={onClose} title="Bien de uso" width="max-w-3xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }
  if (id && (q.isError || !q.data)) {
    return <Modal open onClose={onClose} title="Bien de uso" width="max-w-lg">
      <ErrorCarga mensaje={q.error ? mensajeErrorCtb(q.error) : 'No se pudo traer el bien.'} onReintentar={() => void q.refetch()} />
    </Modal>
  }
  return <Contenido bien={q.data ?? null} corte={config.data?.bu_corte_inicial ?? '2026-06-30'}
    criterioDefault={config.data?.bu_criterio_alta ?? 'proporcional'}
    onClose={onClose} onCreado={onCreado} onVerAsiento={onVerAsiento} />
}

function Contenido({ bien, corte, criterioDefault, onClose, onCreado, onVerAsiento }: {
  bien:            CtbBienDetalle | null
  corte:           string
  criterioDefault: 'completo' | 'proporcional'
  onClose:         () => void
  onCreado:        (id: number) => void
  onVerAsiento:    (asientoId: number) => void
}) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, bienesUso } = usePermisos('contabilidad')
  const guardar = useGuardarBien()
  const revertir = useRevertirBajaBien()
  const cuentasQ = useCuentas({ incluirInactivas: true })
  const mapeos = useMapeos()
  const obras = useObrasCtb()
  const [editando, setEditando] = useState(!bien)
  const [dandoBaja, setDandoBaja] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const schema = useMemo(() => crearSchema(corte), [corte])
  const cuentas = useMemo(() => cuentasQ.data ?? [], [cuentasQ.data])
  const filtroOrigen = useMemo(() => filtroCuentaOrigen(cuentas), [cuentas])

  const { register, control, handleSubmit, setValue, getValues, setError, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults(bien),
  })
  const noAmortiza = useWatch({ control, name: 'no_amortiza' })
  const origenId = useWatch({ control, name: 'cuenta_origen_id' })
  const amortId = useWatch({ control, name: 'cuenta_amort_id' })
  const gastoId = useWatch({ control, name: 'cuenta_gasto_id' })
  const fechaAlta = useWatch({ control, name: 'fecha_alta' })
  const vo = n(useWatch({ control, name: 'valor_origen' }))
  const residual = n(useWatch({ control, name: 'valor_residual' }))
  const vida = n(useWatch({ control, name: 'vida_util_anios' }))
  const obraCod = useWatch({ control, name: 'obra_cod' })

  const dadoDeBaja = !!bien?.fecha_baja
  const cerradas = !!bien?.tiene_amortizaciones_cerradas
  const sinFlag = !bienesUso ? 'No tenés permiso (hace falta «Bienes de uso»)' : null
  const bloqueoEditar = sinFlag ?? (!puedeEditar ? 'No tenés permiso de Editar en Contabilidad'
    : dadoDeBaja ? 'El bien está dado de baja: revertí la baja para editarlo' : null)
  const bloqueoGuardar = bien ? bloqueoEditar : (sinFlag ?? (!puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null))
  const bloqueoBaja = sinFlag ?? (!puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null)
  const soloLectura = !editando
  const lockCerradas = editando && cerradas
  const permiteInicial = !fechaAlta || fechaAlta <= corte

  const opcionesObra = useMemo<ComboboxOption[]>(() => [
    { value: '', label: 'Sin obra' },
    ...(obras.data ?? []).filter(o => !o.archivada || o.cod === bien?.obra_cod)
      .map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, search: [o.cod, o.nom] })),
  ], [obras.data, bien])

  function elegirOrigen(idStr: string, c: CtbCuenta | null) {
    setValue('cuenta_origen_id', idStr, { shouldDirty: true, shouldValidate: !!errors.cuenta_origen_id })
    if (getValues('no_amortiza') || !c) return
    // Sugerencias: solo se llenan si están vacías (no pisan una elección).
    if (!getValues('cuenta_amort_id')) {
      const am = sugerirCuentaAmort(cuentas, c)
      if (am) setValue('cuenta_amort_id', String(am.id), { shouldDirty: true })
    }
    if (!getValues('cuenta_gasto_id')) {
      const g = sugerirCuentaGasto(mapeos.data, c)
      if (g) setValue('cuenta_gasto_id', String(g), { shouldDirty: true })
    }
  }

  function alternarNoAmortiza(v: boolean) {
    setValue('no_amortiza', v, { shouldDirty: true })
    if (v) {
      setValue('vida_util_anios', '')
      setValue('cuenta_amort_id', '')
      setValue('cuenta_gasto_id', '')
    } else {
      const c = cuentas.find(x => String(x.id) === getValues('cuenta_origen_id')) ?? null
      if (c) elegirOrigen(String(c.id), c)
    }
  }

  async function enviar(d: FormData) {
    setErrorServer(null)
    const body: CtbBienInput = {
      descripcion:        d.descripcion.trim(),
      identificador:      d.identificador.trim(),
      cuenta_origen_id:   Number(d.cuenta_origen_id),
      cuenta_amort_id:    d.no_amortiza || !d.cuenta_amort_id ? null : Number(d.cuenta_amort_id),
      cuenta_gasto_id:    d.no_amortiza || !d.cuenta_gasto_id ? null : Number(d.cuenta_gasto_id),
      fecha_alta:         d.fecha_alta,
      valor_origen:       n(d.valor_origen),
      vida_util_anios:    d.no_amortiza ? null : n(d.vida_util_anios),
      valor_residual:     n(d.valor_residual),
      amort_acum_inicial: d.fecha_alta <= corte ? n(d.amort_acum_inicial) : 0,
      criterio_alta:      d.criterio_alta || null,
      obra_cod:           d.obra_cod || null,
      pagos_factura_id:   d.pagos_factura_id.trim() ? Number(d.pagos_factura_id) : null,
      obs:                d.obs.trim(),
    }
    try {
      const g = await guardar.mutateAsync({ id: bien?.id ?? null, ...body })
      toast(bien ? `✓ ${g.codigo} guardado` : `✓ ${g.codigo} dado de alta`, 'ok')
      if (bien) setEditando(false)
      else onCreado(g.id)
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce && CAMPOS.has(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  async function hacerRevertir() {
    if (!bien) return
    try {
      await revertir.mutateAsync(bien.id)
      toast(`✓ Baja de ${bien.codigo} revertida`, 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  const cuota = noAmortiza ? null : cuotaMensual(vo, residual, vida)
  const titulo = bien ? `${bien.codigo} · ${bien.descripcion}` : 'Nuevo bien de uso'

  return (
    <>
      <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-3xl" title={titulo}
        footer={
          <div className="flex gap-2 flex-wrap justify-end items-center w-full">
            {soloLectura && bien ? (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
                {dadoDeBaja ? (
                  <Button variant="secondary" size="sm" loading={revertir.isPending} disabled={!!bloqueoBaja} onClick={() => void hacerRevertir()}
                    title={bloqueoBaja ?? 'Revertir la baja: el bien vuelve a amortizarse'}>
                    Revertir baja
                  </Button>
                ) : (
                  <Button variant="danger" size="sm" disabled={!!bloqueoBaja} onClick={() => setDandoBaja(true)}
                    title={bloqueoBaja ?? 'Dar de baja (venta, rotura, desuso): se amortiza hasta el mes anterior'}>
                    Dar de baja
                  </Button>
                )}
                <Button size="sm" disabled={!!bloqueoEditar} onClick={() => setEditando(true)} title={bloqueoEditar ?? 'Habilitar la edición'}>Editar</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" disabled={guardar.isPending}
                  onClick={() => { if (bien) { reset(defaults(bien)); setEditando(false); setErrorServer(null) } else onClose() }}>
                  Cancelar
                </Button>
                <Button size="sm" loading={guardar.isPending} disabled={!!bloqueoGuardar} onClick={handleSubmit(enviar)}
                  title={bloqueoGuardar ?? (bien ? 'Guardar los cambios' : 'Dar de alta el bien')}>
                  {bien ? 'Guardar' : 'Dar de alta'}
                </Button>
              </>
            )}
          </div>
        }>
        <div className="flex flex-col gap-3 text-sm">
          {bien && (
            <div className="flex gap-2 flex-wrap text-xs items-center">
              {dadoDeBaja
                ? <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gris text-gris-dark">Baja {fmtFecha(bien.fecha_baja)}</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-verde-light text-verde">En uso</span>}
              <span className="text-gris-dark">{bien.rubro_codigo} {bien.rubro_nombre}</span>
              <span className="ml-auto font-mono tabular-nums">
                Acumulada hoy {fmtM(bien.amort_acum_hoy)} · Neto {fmtM(bien.valor_neto_hoy)}
              </span>
            </div>
          )}
          {dadoDeBaja && bien && <Aviso tono="gris"><b>Dado de baja:</b> {bien.motivo_baja}</Aviso>}
          {lockCerradas && (
            <Aviso tono="gris">Ya tiene amortizaciones en períodos cerrados: las cuentas y la fecha de alta no se cambian. Vida útil y residual sí (el próximo período abierto se ajusta).</Aviso>
          )}

          <fieldset disabled={soloLectura} className="flex flex-col gap-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2">
              <Campo label="Descripción" error={errors.descripcion?.message}>
                <input {...register('descripcion')} maxLength={200} placeholder="Ej.: Camión Mercedes-Benz Atego 1726" className={inputCls} />
              </Campo>
              <Campo label="Identificador" hint="patente, n° de serie, partida" error={errors.identificador?.message}>
                <input {...register('identificador')} maxLength={80} className={inputCls} />
              </Campo>
            </div>

            <Campo label="Cuenta de origen" hint="«Valores originales» del rubro (1.2.2.XX.01)" error={errors.cuenta_origen_id?.message}>
              <SelectorCuenta value={origenId} rubros={['activo']} filtrar={filtroOrigen} disabled={soloLectura || lockCerradas}
                placeholder="Rodados, maquinarias, muebles…" onChange={elegirOrigen} />
            </Campo>

            <label className={`flex items-center gap-1.5 text-sm select-none ${soloLectura || lockCerradas ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input type="checkbox" className="accent-naranja" checked={noAmortiza} disabled={soloLectura || lockCerradas}
                onChange={e => alternarNoAmortiza(e.target.checked)} />
              No se amortiza (terrenos)
            </label>

            {!noAmortiza && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Campo label="Amortización acumulada" hint="el «.03» del rubro" error={errors.cuenta_amort_id?.message}>
                  <SelectorCuenta value={amortId} rubros={['activo']} disabled={soloLectura || lockCerradas} placeholder="1.2.2.XX.03"
                    onChange={v => setValue('cuenta_amort_id', v, { shouldDirty: true })} />
                </Campo>
                <Campo label="Gasto de amortización" error={errors.cuenta_gasto_id?.message}>
                  <SelectorCuenta value={gastoId} rubros={['egreso']} disabled={soloLectura || lockCerradas} placeholder="4.2.1.XX.XX"
                    onChange={v => setValue('cuenta_gasto_id', v, { shouldDirty: true })} />
                  {editando && !gastoId && (
                    <span className="text-[11px] text-gris-dark">
                      Se sugiere del mapeo <Link href="/contabilidad?tab=mapeos&clave=bienes.gasto" className="underline">Bienes de uso: gasto de amortización</Link>.
                    </span>
                  )}
                </Campo>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Campo label="Fecha de alta" error={errors.fecha_alta?.message}>
                <input type="date" max={hoyAR()} {...register('fecha_alta')} disabled={soloLectura || lockCerradas} className={inputCls} />
              </Campo>
              <Controller name="valor_origen" control={control} render={({ field }) => (
                <InputMonto label="Valor de origen" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                  error={errors.valor_origen?.message} disabled={soloLectura} />
              )} />
              <Campo label="Vida útil (años)" error={errors.vida_util_anios?.message}>
                <input {...register('vida_util_anios')} inputMode="decimal" disabled={soloLectura || noAmortiza}
                  placeholder={noAmortiza ? '—' : 'Ej.: 5'} className={`${inputCls} tabular-nums`} />
              </Campo>
              <Controller name="valor_residual" control={control} render={({ field }) => (
                <InputMonto label="Valor residual" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                  error={errors.valor_residual?.message} disabled={soloLectura} placeholder="0" />
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Controller name="amort_acum_inicial" control={control} render={({ field }) => (
                <InputMonto label={`Acumulada al ${fmtFecha(corte)}`} value={permiteInicial ? field.value : ''} onChange={field.onChange}
                  onBlur={field.onBlur} error={errors.amort_acum_inicial?.message} disabled={soloLectura || !permiteInicial || noAmortiza}
                  hint={permiteInicial ? 'la del inventario' : 'alta posterior al corte: arranca en cero'} placeholder="0" />
              )} />
              <Campo label="Año de alta" error={errors.criterio_alta?.message}>
                <select {...register('criterio_alta')} disabled={soloLectura || noAmortiza} className={inputCls}>
                  <option value="">Según la configuración ({criterioDefault === 'completo' ? 'completo' : 'proporcional'})</option>
                  <option value="proporcional">Proporcional (desde el mes de alta)</option>
                  <option value="completo">Completo (todo el ejercicio)</option>
                </select>
              </Campo>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Cuota mensual estimada</span>
                <span className="font-mono tabular-nums font-bold text-azul py-2">{cuota !== null ? fmtM(cuota) : '—'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2">
              <Campo label="Obra" hint="opcional: centro de costo del gasto" error={errors.obra_cod?.message}>
                <Combobox options={opcionesObra} value={obraCod} disabled={soloLectura}
                  onChange={v => setValue('obra_cod', v, { shouldDirty: true })} placeholder={obras.isLoading ? 'Cargando obras…' : 'Sin obra'} />
              </Campo>
              <Campo label="Factura de compra" hint="opcional: id en Compras" error={errors.pagos_factura_id?.message}>
                <input {...register('pagos_factura_id')} inputMode="numeric" maxLength={12} className={inputCls} />
                {bien?.pagos_factura_id && (
                  <Link href={`/pagos?tab=facturas&ficha=${bien.pagos_factura_id}`} className="text-[11px] text-azul underline">Ver la factura</Link>
                )}
              </Campo>
            </div>

            <Campo label="Observación" hint="opcional" error={errors.obs?.message}>
              <textarea {...register('obs')} rows={2} maxLength={1000} className={inputCls} />
            </Campo>
          </fieldset>

          {bien && <Amortizaciones bien={bien} onVerAsiento={onVerAsiento} />}
          {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
        </div>
      </Modal>

      {dandoBaja && bien && <ModalBajaBien bien={bien} onClose={() => setDandoBaja(false)} />}
    </>
  )
}

function Amortizaciones({ bien, onVerAsiento }: { bien: CtbBienDetalle; onVerAsiento: (id: number) => void }) {
  const filas = bien.amortizaciones ?? []
  return (
    <div className="flex flex-col gap-1 border-t border-gris pt-2">
      <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
        Amortizaciones registradas ({filas.length}) · inicial {fmtM(bien.amort_acum_inicial)}
      </span>
      {filas.length === 0 ? <span className="text-xs text-gris-dark italic">Todavía no tiene amortizaciones generadas.</span> : (
        <div className="overflow-x-auto border border-gris-mid rounded-lg max-h-[30vh] overflow-y-auto">
          <table className="w-full border-collapse min-w-[520px] text-xs">
            <thead className="sticky top-0">
              <tr><Th>Hasta</Th><Th derecha>Meses</Th><Th derecha>Importe</Th><Th derecha>Acumulada</Th><Th>Asiento</Th></tr>
            </thead>
            <tbody>
              {filas.map(a => (
                <tr key={a.id} className={`border-t border-gris ${a.corrida_estado === 'anulada' ? 'opacity-50 line-through' : ''}`}>
                  <td className="px-3 py-1">{fmtFecha(a.hasta)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{Number(a.meses).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtM(a.importe)}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtM(a.acumulada_al_cierre)}</td>
                  <td className="px-3 py-1">
                    {a.asiento_id
                      ? <button type="button" className="text-azul underline" onClick={() => onVerAsiento(a.asiento_id!)}>{numeroAsiento(a.asiento_numero ?? null)}</button>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
