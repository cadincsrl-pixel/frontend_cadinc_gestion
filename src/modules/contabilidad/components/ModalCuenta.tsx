'use client'

import { useState } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { CtbCuenta, CtbCuentaInput } from '@/types/contabilidad.types'
import { useGuardarCuenta } from '../hooks/useContabilidad'
import { AUXILIARES, RUBROS, rubroLabel, rubrosHija } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'

/**
 * Alta o edición de una cuenta contable.
 *
 * El código arma el árbol: «1.1.01» es hija de «1.1». La madre la deriva la
 * base; acá solo se muestra. El rubro se elige en el nivel 1 y las
 * subcuentas lo heredan, salvo debajo de un título «Resultado» (plan de
 * Finnegans, 20260927): ahí cada hija dice si es ingreso, egreso o otro
 * título de resultado. `resultado` es solo para títulos (no imputables). Una cuenta con movimientos no cambia código, rubro,
 * imputable ni auxiliar (se ven, bloqueados): solo el nombre y la obs.
 */

const CODIGO_RE = /^[1-9](\.[0-9]{1,3}){0,5}$/

const schema = z.object({
  codigo:    z.string().trim().regex(CODIGO_RE, 'Números separados por punto: 1, 1.1, 1.1.01, 1.1.01.001'),
  nombre:    z.string().trim().min(2, 'Al menos 2 caracteres').max(120, 'Hasta 120 caracteres'),
  rubro:     z.enum(['', 'activo', 'pasivo', 'pn', 'ingreso', 'egreso', 'resultado']),
  imputable: z.boolean(),
  auxiliar:  z.enum(['none', 'cliente', 'proveedor', 'tesoreria']),
  obs:       z.string().max(500, 'Hasta 500 caracteres'),
}).superRefine((d, ctx) => {
  if (!d.codigo.includes('.') && !d.rubro) ctx.addIssue({ code: 'custom', path: ['rubro'], message: 'Una cuenta de primer nivel lleva el rubro' })
  if (!d.imputable && d.auxiliar !== 'none') ctx.addIssue({ code: 'custom', path: ['auxiliar'], message: 'Solo una cuenta imputable lleva auxiliar' })
  if (d.imputable && d.rubro === 'resultado') ctx.addIssue({ code: 'custom', path: ['rubro'], message: '«Resultado» es solo para títulos: una imputable es ingreso o egreso' })
})
type FormData = z.infer<typeof schema>

const CAMPOS = /^(codigo|nombre|rubro|imputable|auxiliar|obs)$/

export function ModalCuenta({ cuenta, codigoInicial, cuentas, onClose }: {
  /** null = nueva. */
  cuenta:         CtbCuenta | null
  /** Para «+ Subcuenta»: el código de la madre con el punto. */
  codigoInicial?: string
  cuentas:        CtbCuenta[]
  onClose:        () => void
}) {
  const toast = useToast()
  const guardar = useGuardarCuenta()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const { register, control, handleSubmit, setError, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: cuenta
      ? { codigo: cuenta.codigo, nombre: cuenta.nombre, rubro: cuenta.rubro, imputable: cuenta.imputable, auxiliar: cuenta.auxiliar, obs: cuenta.obs ?? '' }
      : { codigo: codigoInicial ?? '', nombre: '', rubro: '', imputable: true, auxiliar: 'none', obs: '' },
  })

  const codigo = useWatch({ control, name: 'codigo' })
  const imputable = useWatch({ control, name: 'imputable' })
  const codigoLimpio = (codigo ?? '').trim()
  const nivel = codigoLimpio ? codigoLimpio.split('.').length : 1
  const padreCodigo = nivel > 1 ? codigoLimpio.split('.').slice(0, -1).join('.') : null
  const padre = padreCodigo ? cuentas.find(c => c.codigo === padreCodigo) : undefined
  // Debajo de «Resultado» la hija elige (ingreso, egreso o resultado): no hereda.
  const opcionesHija = rubrosHija(padre?.rubro)
  const eligeRubro = nivel === 1 || !!opcionesHija
  const opcionesRubro = (opcionesHija ? RUBROS.filter(r => opcionesHija.includes(r.key)) : RUBROS)
    .filter(r => r.key !== 'resultado' || !imputable)

  const conMov = !!cuenta?.tiene_movimientos
  const conHijas = (cuenta?.cant_hijas ?? 0) > 0
  const lockCodigo = conMov ? 'La cuenta tiene movimientos: el código no cambia' : conHijas ? 'La cuenta tiene subcuentas: el código no cambia' : null
  const lockMov = conMov ? 'La cuenta tiene movimientos: esto no cambia' : null
  const lockImputable = lockMov ?? (conHijas ? 'Tiene subcuentas: no puede ser imputable' : null)

  async function enviar(d: FormData) {
    setErrorServer(null)
    if (opcionesHija && (!d.rubro || !opcionesHija.includes(d.rubro))) {
      setError('rubro', { message: 'Debajo de «Resultado» elegí si es ingreso, egreso o resultado' })
      return
    }
    const body: Partial<CtbCuentaInput> = { nombre: d.nombre.trim(), obs: d.obs.trim() }
    if (!conMov) {
      if (!lockCodigo) body.codigo = d.codigo.trim()
      if (eligeRubro && d.rubro) body.rubro = d.rubro
      if (!lockImputable) body.imputable = d.imputable
      body.auxiliar = d.imputable ? d.auxiliar : 'none'
    }
    if (!cuenta) {
      body.codigo = d.codigo.trim()
      body.imputable = d.imputable
    }
    try {
      const c = await guardar.mutateAsync({ id: cuenta?.id ?? null, ...body })
      toast(cuenta ? `✓ Cuenta ${c.codigo} guardada` : `✓ Cuenta ${c.codigo} creada`, 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce && CAMPOS.test(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-lg"
      title={cuenta ? `Cuenta ${cuenta.codigo}` : 'Nueva cuenta'}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>{cuenta ? 'Guardar' : 'Crear cuenta'}</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        {conMov && <Aviso tono="gris">La cuenta ya tiene movimientos: solo se puede cambiar el nombre y la observación.</Aviso>}

        <div className="grid grid-cols-[150px_1fr] gap-2">
          <Campo label="Código" error={errors.codigo?.message}>
            <input {...register('codigo')} disabled={!!cuenta && !!lockCodigo} title={cuenta ? lockCodigo ?? undefined : undefined}
              placeholder="1.1.01.001" className={`${inputCls} font-mono`} />
          </Campo>
          <Campo label="Nombre" error={errors.nombre?.message}>
            <input {...register('nombre')} maxLength={120} placeholder="Ej.: Banco Galicia cuenta corriente" className={inputCls} />
          </Campo>
        </div>

        {eligeRubro ? (
          <Campo label="Rubro" hint={opcionesHija && padre ? `subcuenta de ${padre.codigo} (Resultado)` : undefined} error={errors.rubro?.message}>
            <select {...register('rubro')} disabled={!!lockMov} title={lockMov ?? undefined} className={inputCls}>
              <option value="">— Elegí —</option>
              {opcionesRubro.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            {imputable && !opcionesHija && <span className="text-[11px] text-gris-dark">«Resultado» se ofrece solo para títulos (no imputables).</span>}
          </Campo>
        ) : (
          <div className="text-xs text-gris-dark">
            {padre
              ? <>Subcuenta de <b className="font-mono">{padre.codigo}</b> {padre.nombre} · hereda el rubro <b>{rubroLabel(padre.rubro)}</b>
                  {padre.imputable && <span className="block text-rojo font-semibold">La madre es imputable: no puede tener subcuentas.</span>}</>
              : codigoLimpio && CODIGO_RE.test(codigoLimpio)
                ? <span className="text-rojo font-semibold">No existe la cuenta madre {padreCodigo}: cargala primero.</span>
                : 'El rubro lo hereda de la cuenta madre.'}
          </div>
        )}

        <label className={`flex items-center gap-2 text-sm select-none ${lockImputable && cuenta ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          title={cuenta ? lockImputable ?? undefined : undefined}>
          <input type="checkbox" className="accent-naranja" {...register('imputable', {
            onChange: e => { if (!e.target.checked) setValue('auxiliar', 'none') },
          })} disabled={!!cuenta && !!lockImputable} />
          <b>Imputable</b>
          <span className="text-xs text-gris-dark">(recibe movimientos; si no, es un título que suma sus subcuentas)</span>
        </label>

        <Campo label="Auxiliar" hint="qué se identifica en cada línea" error={errors.auxiliar?.message}>
          <select {...register('auxiliar')} disabled={!imputable || !!lockMov}
            title={lockMov ?? (!imputable ? 'Solo una cuenta imputable lleva auxiliar' : undefined)} className={inputCls}>
            {AUXILIARES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </Campo>

        <Campo label="Observación" hint="opcional" error={errors.obs?.message}>
          <textarea {...register('obs')} rows={2} maxLength={500} className={inputCls} />
        </Campo>

        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
