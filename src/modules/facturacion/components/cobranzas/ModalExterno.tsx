'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useBorrarExterno, useCrearExterno, useEditarExterno, useGuardarLiquidoExterno } from '../../hooks/useCobranzas'
import { fmtM, hoyAR } from '../../utils/facturacion.utils'
import { ORIGENES_EXTERNO, TIPOS_EXTERNO, aCent, esTipoCredito } from '../../utils/cobranzas.utils'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasCbteTipoExterno, VentasExterno, VentasExternoInput } from '@/types/domain.types'
import { Aviso } from '../FichaFactura'
import { ClienteCombobox } from './Comun'

/**
 * Alta / edición manual de un comprobante externo (saldo inicial): una
 * factura emitida en Finnegans o en el portal de ARCA que sigue abierta.
 * El «saldo inicial» es lo que se debía a la fecha de corte; en una NC, el
 * crédito sin usar.
 */

const enteroPos = (max: number) => (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 0 && Number(v) <= max

const schema = z.object({
  cliente_id:    z.string().min(1, 'Elegí el cliente'),
  cbte_tipo:     z.string().min(1),
  pto_vta:       z.string().refine(enteroPos(99999), 'Punto de venta'),
  numero:        z.string().refine(v => enteroPos(99999999)(v) && Number(v) >= 1, 'Número'),
  fecha:         z.string().min(1, 'Fecha'),
  total:         z.string().refine(v => v !== '' && Number(v) > 0, 'Poné el total'),
  saldo_inicial: z.string().refine(v => v !== '' && Number(v) >= 0, 'Poné el saldo'),
  origen:        z.enum(['finnegans', 'portal', 'otro']),
  obs:           z.string(),
}).superRefine((d, ctx) => {
  if (d.fecha > hoyAR()) ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'No puede ser futura' })
  if (aCent(d.saldo_inicial) > aCent(d.total)) ctx.addIssue({ code: 'custom', path: ['saldo_inicial'], message: 'No puede superar el total' })
})
type FormData = z.infer<typeof schema>
const CAMPOS = ['cliente_id', 'cbte_tipo', 'pto_vta', 'numero', 'fecha', 'total', 'saldo_inicial', 'origen', 'obs']

export function ModalExterno({ externo, onClose }: { externo?: VentasExterno; onClose: () => void }) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('facturacion')
  const crear = useCrearExterno()
  const editar = useEditarExterno()
  const borrar = useBorrarExterno()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [confirmBorrar, setConfirmBorrar] = useState(false)

  const { register, control, handleSubmit, setValue, setError, formState: { errors, dirtyFields } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: externo ? {
      cliente_id: String(externo.cliente_id), cbte_tipo: String(externo.cbte_tipo), pto_vta: String(externo.pto_vta),
      numero: String(externo.numero), fecha: externo.fecha, total: String(externo.total),
      saldo_inicial: String(externo.saldo_inicial), origen: externo.origen, obs: externo.obs ?? '',
    } : {
      cliente_id: '', cbte_tipo: '1', pto_vta: '2', numero: '', fecha: '', total: '', saldo_inicial: '',
      origen: 'finnegans', obs: '',
    },
  })
  const total = useWatch({ control, name: 'total' })
  const tipo = useWatch({ control, name: 'cbte_tipo' })

  // Mientras no lo toquen, el saldo sigue al total.
  const [saldoTocado, setSaldoTocado] = useState(!!externo)
  useEffect(() => {
    if (!saldoTocado) setValue('saldo_inicial', total)
  }, [total, saldoTocado, setValue])

  const puede = externo ? puedeEditar : puedeCrear
  const guardando = crear.isPending || editar.isPending

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: VentasExternoInput = {
      cliente_id: Number(d.cliente_id), cbte_tipo: Number(d.cbte_tipo) as VentasCbteTipoExterno,
      pto_vta: Number(d.pto_vta), numero: Number(d.numero), fecha: d.fecha,
      // Sin vencimiento de cobro en pantalla (decisión del dueño, 2026-09-24): al
      // crear lo pone el backend (una NC, la misma fecha, como antes); al editar
      // solo se corre si la fecha nueva lo pasó.
      ...(!externo && esTipoCredito(Number(d.cbte_tipo)) ? { vence_el: d.fecha } : {}),
      ...(externo?.vence_el && externo.vence_el < d.fecha ? { vence_el: d.fecha } : {}),
      total: Number(d.total), saldo_inicial: Number(d.saldo_inicial), origen: d.origen, obs: d.obs.trim(),
    }
    try {
      if (externo) await editar.mutateAsync({ id: externo.id, ...body })
      else await crear.mutateAsync(body)
      toast(externo ? '✓ Comprobante actualizado' : '✓ Saldo inicial cargado', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && CAMPOS.includes(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  const conImputaciones = (externo?.cantidad_imputaciones ?? 0) > 0

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-2xl"
      title={externo ? `Editar ${externo.comprobante}` : 'Cargar saldo inicial'}
      footer={<div className="flex gap-2 justify-end flex-wrap w-full">
        {externo && (
          <Button variant="danger" size="sm" className="mr-auto" onClick={() => setConfirmBorrar(true)}
            disabled={!puedeEliminar || conImputaciones}
            title={!puedeEliminar ? 'No tenés permiso para borrar' : conImputaciones ? 'Tiene cobros o compensaciones aplicados: anulalos primero' : 'Borrar el comprobante'}>
            Borrar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button size="sm" loading={guardando} disabled={!puede} onClick={handleSubmit(guardar)}
          title={puede ? undefined : 'No tenés permiso'}>{externo ? 'Guardar' : 'Cargar'}</Button>
      </div>}>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Controller control={control} name="cliente_id" render={({ field }) => (
          <ClienteCombobox value={field.value} error={errors.cliente_id?.message} disabled={conImputaciones}
            onChange={v => field.onChange(v)} />
        )} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Select label="Tipo" {...register('cbte_tipo')} disabled={conImputaciones}
              options={TIPOS_EXTERNO.map(t => ({ value: String(t.key), label: `${t.corto} — ${t.label}` }))} />
          </div>
          <Input label="Punto de venta" inputMode="numeric" {...register('pto_vta')} error={errors.pto_vta?.message} />
          <Input label="Número" inputMode="numeric" {...register('numero')} error={errors.numero?.message} />
          <Input label="Fecha" type="date" max={hoyAR()} {...register('fecha')} error={errors.fecha?.message} />
          <Controller control={control} name="total" render={({ field }) => (
            <InputMonto label="Total" value={field.value} onChange={field.onChange} error={errors.total?.message} />
          )} />
          <Controller control={control} name="saldo_inicial" render={({ field }) => (
            <InputMonto label={esTipoCredito(Number(tipo)) ? 'Crédito sin usar' : 'Saldo que se debe'} value={field.value}
              onChange={v => { setSaldoTocado(true); field.onChange(v) }} error={errors.saldo_inicial?.message} />
          )} />
        </div>
        <Select label="Origen" {...register('origen')} options={ORIGENES_EXTERNO.map(o => ({ value: o.key, label: o.label }))} />
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Observaciones</label>
          <textarea {...register('obs')} rows={2}
            className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-white outline-none focus:border-naranja" />
        </div>
        {externo?.saldo_a_revisar && (
          <Aviso tono="amarillo">El saldo de este comprobante está <b>a revisar</b>: se supuso igual al total porque ARCA no trae cobranzas.</Aviso>
        )}
        {conImputaciones && (
          <Aviso tono="gris">Tiene {externo!.cantidad_imputaciones} cobro(s) o compensación(es) aplicados por {fmtM(externo!.aplicado)}: no se cambian el cliente ni el tipo, y el saldo no puede bajar de eso.</Aviso>
        )}
        {dirtyFields.saldo_inicial && externo?.saldo_a_revisar && (
          <span className="text-[11px] text-gris-dark">Para confirmar el saldo (y sacarle «a revisar») usá las acciones de la lista.</span>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
        {confirmBorrar && externo && (
          <Aviso tono="rojo">
            ¿Borrar {externo.comprobante}? También sale del libro de ventas histórico.{' '}
            <button type="button" className="underline font-bold" disabled={borrar.isPending} onClick={async () => {
              try { await borrar.mutateAsync(externo.id); toast('✓ Comprobante borrado', 'ok'); onClose() }
              catch (e) { setErrorServer(mensajeErrorFacturacion(e)); setConfirmBorrar(false) }
            }}>Sí, borrar</button>{' '}
            <button type="button" className="underline" onClick={() => setConfirmBorrar(false)}>No</button>
          </Aviso>
        )}
      </form>
      {/* Fuera del form de arriba: es otra acción (PATCH …/liquido) y no se anidan forms. */}
      {externo && (externo.cbte_tipo === 60 || externo.cbte_tipo === 61) && (
        <LiquidoCvlp externo={externo} puede={puedeEditar} />
      )}
    </Modal>
  )
}

/**
 * CVLP de Casilda (20260927d): lo que liquidó después de su comisión. El
 * total del comprobante que viene de ARCA YA es ese neto, así que el asiento
 * automático va por el total; el líquido es solo una corrección opcional
 * (20260928f: `coalesce(liquido, total)`). No toca el saldo de la cuenta del
 * cliente, que sigue siendo el total del papel.
 */
const liquidoSchema = (total: number) => z.object({
  liquido: z.string().refine(v => v === '' || (Number(v) > 0 && Number(v) <= total), `Mayor a cero y hasta ${fmtM(total)}`),
})
type LiquidoForm = { liquido: string }

function LiquidoCvlp({ externo, puede }: { externo: VentasExterno; puede: boolean }) {
  const toast = useToast()
  const guardar = useGuardarLiquidoExterno()
  const { control, handleSubmit, setError, formState: { errors, isDirty } } = useForm<LiquidoForm>({
    resolver: zodResolver(liquidoSchema(Number(externo.total))),
    defaultValues: { liquido: externo.liquido != null ? String(externo.liquido) : '' },
  })

  async function enviar(d: LiquidoForm) {
    try {
      await guardar.mutateAsync({ id: externo.id, liquido: d.liquido === '' ? null : Number(d.liquido) })
      toast(d.liquido === '' ? '✓ Líquido borrado' : '✓ Líquido guardado', 'ok')
    } catch (e) {
      setError('liquido', { message: mensajeErrorFacturacion(e) })
    }
  }

  return (
    <div className="mt-3 border-t border-gris pt-3 flex flex-col gap-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Líquido (lo que pagó Casilda) · opcional</div>
      <div className="flex gap-2 items-start flex-wrap">
        <div className="w-48">
          <Controller control={control} name="liquido" render={({ field }) => (
            <InputMonto value={field.value} onChange={field.onChange} disabled={!puede} error={errors.liquido?.message} placeholder={`Igual al total (${fmtM(externo.total)})`} />
          )} />
        </div>
        <Button size="sm" variant="secondary" onClick={handleSubmit(enviar)} loading={guardar.isPending} disabled={!puede || !isDirty}
          title={!puede ? 'No tenés permiso para editar' : !isDirty ? 'No hay cambios' : 'Guardar el líquido de la CVLP'}>
          Guardar líquido
        </Button>
      </div>
      <span className="text-[11px] text-gris-dark">
        Total del comprobante {fmtM(externo.total)}: el que viene de ARCA ya es el neto de la comisión de Casilda, así que el asiento va por
        ese total (Casilda al Debe, el IVA del papel y la venta por la diferencia). Cargá un líquido solo si Casilda liquidó otro importe;
        vacío = se usa el total.
      </span>
    </div>
  )
}
