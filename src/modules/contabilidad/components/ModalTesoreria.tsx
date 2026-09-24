'use client'

import { useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { TesoreriaCuenta, TesoreriaInput } from '@/types/contabilidad.types'
import { useGuardarTesoreria } from '../hooks/useContabilidad'
import { TESORERIA_TIPOS } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'

/**
 * Alta o edición de una cuenta de tesorería (banco, caja o cartera de
 * valores). Es de dónde sale la plata de una OP en Compras y el auxiliar
 * «tesorería» de los asientos. La cuenta contable vinculada tiene que ser
 * imputable y del Activo.
 */

const schema = z.object({
  tipo:      z.enum(['banco', 'caja', 'valores']),
  nombre:    z.string().trim().min(2, 'Al menos 2 caracteres').max(80, 'Hasta 80 caracteres'),
  banco:     z.string().max(80, 'Hasta 80 caracteres'),
  cbu:       z.string().refine(v => v.replace(/\D/g, '') === '' || v.replace(/\D/g, '').length === 22, 'El CBU tiene 22 dígitos'),
  alias:     z.string().refine(v => v.trim() === '' || /^[A-Za-z0-9.-]{6,20}$/.test(v.trim()), 'De 6 a 20 caracteres: letras, números, punto o guion'),
  moneda:    z.enum(['ARS', 'USD']),
  cuenta_id: z.string(),
  obs:       z.string().max(500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>

const CAMPOS = /^(tipo|nombre|banco|cbu|alias|moneda|cuenta_id|obs)$/

export function ModalTesoreria({ cuenta, onClose }: { cuenta: TesoreriaCuenta | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarTesoreria()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const { register, control, handleSubmit, setError, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: cuenta
      ? {
          tipo: cuenta.tipo, nombre: cuenta.nombre, banco: cuenta.banco ?? '', cbu: cuenta.cbu ?? '', alias: cuenta.alias ?? '',
          moneda: cuenta.moneda, cuenta_id: cuenta.cuenta_id ? String(cuenta.cuenta_id) : '', obs: cuenta.obs ?? '',
        }
      : { tipo: 'banco', nombre: '', banco: '', cbu: '', alias: '', moneda: 'ARS', cuenta_id: '', obs: '' },
  })
  const tipo = useWatch({ control, name: 'tipo' })
  const cuentaId = useWatch({ control, name: 'cuenta_id' })
  const esBanco = tipo === 'banco'

  async function enviar(d: FormData) {
    setErrorServer(null)
    const cbu = d.cbu.replace(/\D/g, '')
    const body: TesoreriaInput = {
      tipo:      d.tipo,
      nombre:    d.nombre.trim(),
      banco:     esBanco ? d.banco.trim() : '',
      cbu:       esBanco && cbu ? cbu : null,
      alias:     esBanco && d.alias.trim() ? d.alias.trim() : null,
      moneda:    d.moneda,
      cuenta_id: d.cuenta_id ? Number(d.cuenta_id) : null,
      obs:       d.obs.trim(),
    }
    try {
      await guardar.mutateAsync({ id: cuenta?.id ?? null, ...body })
      toast(cuenta ? '✓ Cuenta de tesorería guardada' : '✓ Cuenta de tesorería creada', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce && CAMPOS.test(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-lg"
      title={cuenta ? `Cuenta de tesorería · ${cuenta.nombre}` : 'Nueva cuenta de tesorería'}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>{cuenta ? 'Guardar' : 'Crear'}</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        {cuenta?.ventas_cuenta_id && (
          <Aviso tono="gris">
            Vinculada a la cuenta bancaria #{cuenta.ventas_cuenta_id} de Ventas (la de la FCE). Los cambios de acá no la tocan:
            el CBU de la factura de crédito sigue saliendo de Ventas.
          </Aviso>
        )}
        <div className="grid grid-cols-[140px_1fr_100px] gap-2">
          <Campo label="Tipo" error={errors.tipo?.message}>
            <select {...register('tipo', {
              onChange: e => { if (e.target.value !== 'banco') { setValue('cbu', ''); setValue('alias', '') } },
            })} className={inputCls}>
              {TESORERIA_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Nombre" error={errors.nombre?.message}>
            <input {...register('nombre')} maxLength={80} placeholder={esBanco ? 'Ej.: Galicia cuenta corriente' : 'Ej.: Caja en pesos'} className={inputCls} />
          </Campo>
          <Campo label="Moneda" error={errors.moneda?.message}>
            <select {...register('moneda')} className={inputCls}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </Campo>
        </div>

        {esBanco && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Campo label="Banco" error={errors.banco?.message}>
              <input {...register('banco')} maxLength={80} placeholder="Galicia" className={inputCls} />
            </Campo>
            <Campo label="CBU" hint="opcional" error={errors.cbu?.message}>
              <input {...register('cbu')} inputMode="numeric" maxLength={26} className={`${inputCls} font-mono`} />
            </Campo>
            <Campo label="Alias" hint="opcional" error={errors.alias?.message}>
              <input {...register('alias')} maxLength={20} className={`${inputCls} font-mono`} />
            </Campo>
          </div>
        )}

        <Campo label="Cuenta contable" hint="imputable del Activo" error={errors.cuenta_id?.message}>
          <SelectorCuenta value={cuentaId} rubros={['activo']} placeholder="Sin vincular"
            onChange={id => setValue('cuenta_id', id, { shouldDirty: true })} />
        </Campo>

        <Campo label="Observación" hint="opcional" error={errors.obs?.message}>
          <textarea {...register('obs')} rows={2} maxLength={500} className={inputCls} />
        </Campo>

        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
