'use client'

import { useState } from 'react'
import { useForm, useWatch, Controller, type FieldPath, type FieldValues, type UseFormSetError } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import type { Categoria, Convenio, EscalaListada, ParitariaResultado } from '@/types/sueldos.types'
import { useCategorias, useGuardarCategoria, useGuardarConvenio, useGuardarEscala, useParitaria } from '../../hooks/useSueldos'
import { fmtFecha, fmtM, hoyAR, numONull } from '../../utils/sueldos.utils'
import { errorDeCampoSueldos, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, Check, inputCls } from '../Comun'

const CODIGO = /^[a-z0-9_]{2,30}$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Lleva el error de campo del backend al input correspondiente (si existe en el form). */
function marcarCampo<T extends FieldValues>(e: unknown, campos: readonly string[], setError: UseFormSetError<T>) {
  const ce = errorDeCampoSueldos(e)
  if (ce && campos.includes(ce.campo)) setError(ce.campo as FieldPath<T>, { message: ce.mensaje })
}

function Pie({ onClose, pendiente, onOk, texto }: { onClose: () => void; pendiente: boolean; onOk: () => void; texto: string }) {
  return <>
    <Button variant="ghost" size="sm" onClick={onClose} disabled={pendiente}>Cancelar</Button>
    <Button size="sm" loading={pendiente} onClick={onOk}>{texto}</Button>
  </>
}

// ── Convenio ─────────────────────────────────────────────────────────

const convenioSchema = z.object({
  codigo:        z.string().trim().regex(CODIGO, 'Minúsculas, números y guion bajo (2 a 30)'),
  nombre:        z.string().trim().min(2, 'Poné el nombre').max(120),
  cct:           z.string().trim().max(40),
  periodicidad:  z.enum(['quincenal', 'mensual']),
  unidad_basico: z.enum(['hora', 'mes']),
  obs:           z.string().max(1000),
  activo:        z.boolean(),
  f931_condicion: z.string().trim().regex(/^\d{0,3}$/, 'Hasta 3 dígitos'),
  f931_actividad: z.string().trim().regex(/^\d{0,3}$/, 'Hasta 3 dígitos'),
  f931_modalidad: z.string().trim().regex(/^\d{0,3}$/, 'Hasta 3 dígitos'),
})
type ConvenioForm = z.infer<typeof convenioSchema>

export function ModalConvenio({ convenio, onClose }: { convenio: Convenio | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarConvenio()
  const [error, setErrorServer] = useState<string | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<ConvenioForm>({
    resolver: zodResolver(convenioSchema),
    defaultValues: convenio
      ? { codigo: convenio.codigo, nombre: convenio.nombre, cct: convenio.cct ?? '', periodicidad: convenio.periodicidad, unidad_basico: convenio.unidad_basico, obs: convenio.obs ?? '', activo: convenio.activo,
          f931_condicion: convenio.f931_condicion ?? '', f931_actividad: convenio.f931_actividad ?? '', f931_modalidad: convenio.f931_modalidad ?? '' }
      : { codigo: '', nombre: '', cct: '', periodicidad: 'mensual', unidad_basico: 'mes', obs: '', activo: true, f931_condicion: '', f931_actividad: '', f931_modalidad: '' },
  })

  async function enviar(d: ConvenioForm) {
    setErrorServer(null)
    try {
      const { codigo, ...resto } = d
      const c = await guardar.mutateAsync(convenio ? { id: convenio.id, ...resto } : { id: null, codigo, ...resto })
      toast(`✓ Convenio ${c.nombre} guardado`, 'ok')
      onClose()
    } catch (e) {
      marcarCampo(e, Object.keys(convenioSchema.shape), setError)
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} title={convenio ? `Convenio ${convenio.nombre}` : 'Nuevo convenio'}
      footer={<Pie onClose={onClose} pendiente={guardar.isPending} onOk={handleSubmit(enviar)} texto="Guardar" />}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código" hint={convenio ? 'no se cambia' : 'p. ej. uocra'} error={errors.codigo?.message}>
            <input className={`${inputCls} font-mono`} {...register('codigo')} disabled={!!convenio} />
          </Campo>
          <Campo label="CCT" error={errors.cct?.message}>
            <input className={inputCls} {...register('cct')} placeholder="76/75" />
          </Campo>
        </div>
        <Campo label="Nombre" error={errors.nombre?.message}>
          <input className={inputCls} {...register('nombre')} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Se liquida">
            <select className={inputCls} {...register('periodicidad')}>
              <option value="quincenal">Por quincena</option>
              <option value="mensual">Por mes</option>
            </select>
          </Campo>
          <Campo label="Básico">
            <select className={inputCls} {...register('unidad_basico')}>
              <option value="hora">Por hora</option>
              <option value="mes">Mensual</option>
            </select>
          </Campo>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide mb-1">Códigos del F.931 de sus empleados</div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Condición" error={errors.f931_condicion?.message}>
              <input className={inputCls} inputMode="numeric" {...register('f931_condicion')} placeholder="p. ej. 5" />
            </Campo>
            <Campo label="Actividad" error={errors.f931_actividad?.message}>
              <input className={inputCls} inputMode="numeric" {...register('f931_actividad')} placeholder="p. ej. 003" />
            </Campo>
            <Campo label="Modalidad" error={errors.f931_modalidad?.message}>
              <input className={inputCls} inputMode="numeric" {...register('f931_modalidad')} placeholder="p. ej. 24" />
            </Campo>
          </div>
          <p className="text-xs text-gris-dark mt-1">Van al archivo del Libro de Sueldos de ARCA. Un legajo puede tener los suyos (p. ej. un jubilado).</p>
        </div>
        <Campo label="Observaciones" error={errors.obs?.message}>
          <textarea rows={2} className={inputCls} {...register('obs')} />
        </Campo>
        <Controller control={control} name="activo" render={({ field }) => <Check label="Activo" checked={field.value} onChange={field.onChange} />} />
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}

// ── Categoría ────────────────────────────────────────────────────────

const categoriaSchema = z.object({
  codigo:        z.string().trim().regex(CODIGO, 'Minúsculas, números y guion bajo (2 a 30)'),
  nombre:        z.string().trim().min(2, 'Poné el nombre').max(120),
  orden:         z.string().regex(/^\d{0,4}$/, 'Número entero'),
  unidad_basico: z.enum(['', 'hora', 'mes']),
  por_defecto:   z.boolean(),
  activo:        z.boolean(),
})
type CategoriaForm = z.infer<typeof categoriaSchema>

export function ModalCategoria({ convenio, categoria, onClose }: { convenio: Convenio; categoria: Categoria | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarCategoria()
  const [error, setErrorServer] = useState<string | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<CategoriaForm>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: categoria
      ? { codigo: categoria.codigo, nombre: categoria.nombre, orden: String(categoria.orden ?? ''), unidad_basico: categoria.unidad_basico ?? '', por_defecto: categoria.por_defecto, activo: categoria.activo }
      : { codigo: '', nombre: '', orden: '', unidad_basico: '', por_defecto: false, activo: true },
  })

  async function enviar(d: CategoriaForm) {
    setErrorServer(null)
    const comun = {
      nombre: d.nombre.trim(),
      ...(d.orden ? { orden: Number(d.orden) } : {}),
      unidad_basico: d.unidad_basico || null,
      por_defecto: d.por_defecto,
      activo: d.activo,
    }
    try {
      const c = await guardar.mutateAsync(categoria ? { id: categoria.id, ...comun } : { id: null, convenio_id: convenio.id, codigo: d.codigo, ...comun })
      toast(`✓ Categoría ${c.nombre} guardada`, 'ok')
      onClose()
    } catch (e) {
      marcarCampo(e, Object.keys(categoriaSchema.shape), setError)
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} title={categoria ? `Categoría ${categoria.nombre}` : `Nueva categoría · ${convenio.nombre}`}
      footer={<Pie onClose={onClose} pendiente={guardar.isPending} onOk={handleSubmit(enviar)} texto="Guardar" />}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código" hint={categoria ? 'no se cambia' : undefined} error={errors.codigo?.message}>
            <input className={`${inputCls} font-mono`} {...register('codigo')} disabled={!!categoria} />
          </Campo>
          <Campo label="Orden" error={errors.orden?.message}>
            <input className={inputCls} inputMode="numeric" {...register('orden')} />
          </Campo>
        </div>
        <Campo label="Nombre" error={errors.nombre?.message}>
          <input className={inputCls} {...register('nombre')} />
        </Campo>
        <Campo label="Unidad del básico" hint="vacío = la del convenio">
          <select className={inputCls} {...register('unidad_basico')}>
            <option value="">La del convenio ({convenio.unidad_basico === 'hora' ? 'por hora' : 'mensual'})</option>
            <option value="hora">Por hora</option>
            <option value="mes">Mensual</option>
          </select>
        </Campo>
        <Controller control={control} name="por_defecto" render={({ field }) => (
          <Check label="Categoría inicial (la que toma un legajo nuevo)" checked={field.value} onChange={field.onChange} />
        )} />
        <Controller control={control} name="activo" render={({ field }) => <Check label="Activa" checked={field.value} onChange={field.onChange} />} />
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}

// ── Escala ───────────────────────────────────────────────────────────

const escalaSchema = z.object({
  zona:          z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, 'Letras o números, hasta 5'),
  vigente_desde: z.string().regex(FECHA, 'Poné la fecha'),
  valor:         z.string().refine(v => (numONull(v) ?? 0) > 0, 'Tiene que ser mayor a cero'),
  fuente:        z.string().max(300),
  a_confirmar:   z.boolean(),
})
type EscalaForm = z.infer<typeof escalaSchema>

export function ModalEscala({ categoria, escala, onClose }: { categoria: Categoria; escala: EscalaListada | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarEscala()
  const [error, setErrorServer] = useState<string | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<EscalaForm>({
    resolver: zodResolver(escalaSchema),
    defaultValues: escala
      ? { zona: escala.zona, vigente_desde: escala.vigente_desde, valor: String(escala.valor), fuente: escala.fuente ?? '', a_confirmar: escala.a_confirmar }
      : { zona: 'A', vigente_desde: hoyAR(), valor: '', fuente: '', a_confirmar: false },
  })

  async function enviar(d: EscalaForm) {
    setErrorServer(null)
    const valor = numONull(d.valor) ?? 0
    try {
      if (escala) await guardar.mutateAsync({ id: escala.id, valor, fuente: d.fuente.trim(), a_confirmar: d.a_confirmar })
      else await guardar.mutateAsync({ id: null, categoria_id: categoria.id, zona: d.zona, vigente_desde: d.vigente_desde, valor, fuente: d.fuente.trim(), a_confirmar: d.a_confirmar })
      toast('✓ Escala guardada', 'ok')
      onClose()
    } catch (e) {
      marcarCampo(e, Object.keys(escalaSchema.shape), setError)
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} title={`${escala ? 'Escala' : 'Nueva escala'} · ${categoria.nombre}`}
      footer={<Pie onClose={onClose} pendiente={guardar.isPending} onOk={handleSubmit(enviar)} texto="Guardar" />}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Zona" error={errors.zona?.message}>
            <input className={inputCls} {...register('zona')} disabled={!!escala} maxLength={5} />
          </Campo>
          <Campo label="Vigente desde" error={errors.vigente_desde?.message}>
            <input type="date" className={inputCls} {...register('vigente_desde')} disabled={!!escala} />
          </Campo>
        </div>
        <Controller control={control} name="valor" render={({ field }) => (
          <InputMonto label={`Valor (${(categoria.unidad_basico ?? '') === 'hora' ? '$ por hora' : '$ por hora o por mes según la categoría'})`}
            value={field.value} onChange={field.onChange} error={errors.valor?.message} />
        )} />
        <Campo label="Fuente" hint="acta, resolución, link" error={errors.fuente?.message}>
          <input className={inputCls} {...register('fuente')} />
        </Campo>
        <Controller control={control} name="a_confirmar" render={({ field }) => (
          <Check label="A confirmar (se usa igual, con la marca amarilla)" checked={field.value} onChange={field.onChange} />
        )} />
        {escala && <p className="text-[11px] text-gris-dark">Zona y fecha no se cambian: para otra vigencia cargá una escala nueva.</p>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}

// ── Paritaria ────────────────────────────────────────────────────────

const paritariaSchema = z.object({
  desde:       z.string().regex(FECHA, 'Poné la fecha'),
  porcentaje:  z.string().refine(v => { const n = numONull(v); return n !== null && n > -50 && n <= 200 && n !== 0 }, 'Entre −50 y 200, distinto de 0'),
  zona:        z.string(),
  fuente:      z.string().max(300),
  a_confirmar: z.boolean(),
})
type ParitariaForm = z.infer<typeof paritariaSchema>

export function ModalParitaria({ convenio, zonas, onClose }: { convenio: Convenio; zonas: string[]; onClose: () => void }) {
  const toast = useToast()
  const paritaria = useParitaria()
  const { data: cats = [] } = useCategorias(convenio.id)
  const [error, setErrorServer] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ParitariaResultado | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<ParitariaForm>({
    resolver: zodResolver(paritariaSchema),
    defaultValues: { desde: hoyAR().slice(0, 8) + '01', porcentaje: '', zona: '', fuente: '', a_confirmar: false },
  })
  const pct = numONull(useWatch({ control, name: 'porcentaje' }))

  async function enviar(d: ParitariaForm) {
    setErrorServer(null)
    try {
      const r = await paritaria.mutateAsync({
        convenio_id: convenio.id, desde: d.desde, porcentaje: numONull(d.porcentaje) ?? 0,
        zona: d.zona || null, fuente: d.fuente.trim() || undefined, a_confirmar: d.a_confirmar,
      })
      toast(`✓ ${r.creadas} escala(s) nuevas desde el ${fmtFecha(r.desde)}`, 'ok')
      setResultado(r)
    } catch (e) {
      marcarCampo(e, Object.keys(paritariaSchema.shape), setError)
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  if (resultado) {
    const nombre = (id: number) => cats.find(c => c.id === id)?.nombre ?? `#${id}`
    return (
      <Modal open onClose={onClose} title="Paritaria aplicada" width="max-w-lg" footer={<Button size="sm" onClick={onClose}>Listo</Button>}>
        <div className="flex flex-col gap-2 text-sm">
          <Aviso tono="verde">Se crearon {resultado.creadas} escalas con {resultado.porcentaje} % desde el {fmtFecha(resultado.desde)}. Las anteriores quedan en el historial.</Aviso>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {resultado.escalas.map(e => (
                  <tr key={e.id} className="border-t border-gris">
                    <td className="py-1">{nombre(e.categoria_id)} · zona {e.zona}</td>
                    <td className="py-1 text-right font-mono">{fmtM(e.anterior)} → <b>{fmtM(e.valor)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={paritaria.isPending ? () => {} : onClose} title={`Nueva paritaria · ${convenio.nombre}`}
      footer={<Pie onClose={onClose} pendiente={paritaria.isPending} onOk={handleSubmit(enviar)} texto="Aplicar paritaria" />}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gris-dark">
          Para cada categoría activa toma la escala vigente ANTES de la fecha y crea una nueva desde esa fecha con el porcentaje aplicado (redondeada a centavos).
          No pisa nada: si alguna ya tiene escala en esa fecha, no se aplica.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Desde" error={errors.desde?.message}>
            <input type="date" className={inputCls} {...register('desde')} />
          </Campo>
          <Campo label="Aumento %" error={errors.porcentaje?.message}>
            <input className={inputCls} inputMode="decimal" {...register('porcentaje')} placeholder="p. ej. 2,5" />
          </Campo>
        </div>
        <Campo label="Zona">
          <select className={inputCls} {...register('zona')}>
            <option value="">Todas las zonas</option>
            {zonas.map(z => <option key={z} value={z}>Zona {z}</option>)}
          </select>
        </Campo>
        <Campo label="Fuente" hint="acta de la paritaria" error={errors.fuente?.message}>
          <input className={inputCls} {...register('fuente')} />
        </Campo>
        <Controller control={control} name="a_confirmar" render={({ field }) => (
          <Check label="Marcar las escalas nuevas «a confirmar»" checked={field.value} onChange={field.onChange} />
        )} />
        {pct !== null && pct !== 0 && <p className="text-xs text-azul">Ejemplo: {fmtM(100000)} pasa a {fmtM(Math.round(100000 * (1 + pct / 100) * 100) / 100)}.</p>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
