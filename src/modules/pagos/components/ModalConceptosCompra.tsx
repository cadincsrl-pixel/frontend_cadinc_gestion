'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useConceptosPagos, useCrearConcepto, useEditarConcepto } from '../hooks/useConceptosPagos'
import { codigoErrorPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosConcepto } from '@/types/domain.types'

/**
 * «Conceptos de compra» (20260925): la lista que se elige al cargar una
 * factura (combustible, materiales de obra…). La ajusta el contador.
 *
 * Alta, renombrar, orden y activo. No hay borrado: un concepto dado de baja
 * deja de ofrecerse al cargar, pero las facturas que ya lo tienen lo conservan.
 * Editar pide `pagos.actualizacion`; sin eso se ve la lista con los controles
 * deshabilitados (no escondidos, §6).
 */

// El orden se tipea como texto y se convierte al armar el body.
const ordenSchema = z.string().trim().refine(
  v => v === '' || (/^\d+$/.test(v) && Number(v) <= 32767),
  'Un número entero (0 a 32767)',
)
const conceptoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 letras').max(60, 'Máximo 60 caracteres'),
  orden:  ordenSchema,
})
type ConceptoForm = z.infer<typeof conceptoSchema>

const aOrden = (v: string): number | null => (v.trim() === '' ? null : Number(v))

const inputCls = 'w-full px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris disabled:text-gris-dark'

export function ModalConceptosCompra({ onClose }: { onClose: () => void }) {
  const { puedeEditar } = usePermisos('pagos')
  const conceptos = useConceptosPagos(true)
  const lista = conceptos.data ?? []
  const sinPermiso = 'Editar conceptos pide permiso de edición en Compras'

  return (
    <Modal open onClose={onClose} title="Conceptos de compra" width="max-w-2xl"
      footer={<div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button></div>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-gris-dark">
          Cada factura lleva uno. Es para clasificar la compra; el detalle de lo comprado va en la descripción.
          Dar de baja un concepto lo saca de la lista al cargar, pero las facturas que ya lo tienen lo conservan.
        </p>

        <AltaConcepto disabled={!puedeEditar} tooltip={sinPermiso} siguienteOrden={siguienteOrden(lista)} />

        {conceptos.isLoading ? (
          <div className="p-6 text-center text-xs text-gris-dark">Cargando conceptos…</div>
        ) : conceptos.isError ? (
          <div className="bg-rojo-light border border-rojo/30 rounded p-3 text-xs text-rojo">
            {mensajeErrorPagos(conceptos.error)}{' '}
            <button type="button" className="underline" onClick={() => void conceptos.refetch()}>Reintentar</button>
          </div>
        ) : lista.length === 0 ? (
          <div className="p-6 text-center text-xs text-gris-dark italic">Todavía no hay conceptos. Cargá el primero arriba.</div>
        ) : (
          <div className="border border-gris rounded divide-y divide-gris">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_80px_auto] gap-2 px-2 py-1.5 bg-gris text-[10px] font-bold text-gris-dark uppercase tracking-wide">
              <span>Nombre</span><span>Orden</span><span className="text-right">Acciones</span>
            </div>
            {lista.map(c => (
              <FilaConcepto key={`${c.id}-${c.nombre}-${c.orden ?? ''}`} c={c}
                disabled={!puedeEditar} tooltip={sinPermiso}
                unicoActivo={c.activo && lista.filter(x => x.activo).length === 1} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function siguienteOrden(lista: PagosConcepto[]): number {
  return lista.reduce((m, c) => Math.max(m, c.orden ?? 0), 0) + 1
}

function AltaConcepto({ disabled, tooltip, siguienteOrden }: { disabled: boolean; tooltip: string; siguienteOrden: number }) {
  const toast = useToast()
  const crear = useCrearConcepto()
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<ConceptoForm>({
    resolver: zodResolver(conceptoSchema),
    defaultValues: { nombre: '', orden: '' },
  })

  async function onSubmit(v: ConceptoForm) {
    try {
      await crear.mutateAsync({ nombre: v.nombre.trim(), orden: aOrden(v.orden) ?? siguienteOrden })
      toast('✓ Concepto agregado', 'ok')
      reset({ nombre: '', orden: '' })
    } catch (e) {
      const msg = mensajeErrorPagos(e)
      if (codigoErrorPagos(e) === 'CONCEPTO_DUPLICADO') setError('nombre', { message: msg })
      else toast(msg, 'err')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-start flex-wrap bg-gris/40 rounded p-2">
      <div className="flex-1 min-w-[180px]">
        <label htmlFor="concepto-nuevo" className="block text-xs font-semibold text-gris-dark mb-1">Concepto nuevo</label>
        <input id="concepto-nuevo" {...register('nombre')} disabled={disabled} placeholder="Ej.: Viáticos"
          aria-invalid={!!errors.nombre} className={`${inputCls} ${errors.nombre ? 'border-rojo' : ''}`} />
        {errors.nombre && <div className="mt-1 text-[11px] text-rojo">{errors.nombre.message}</div>}
      </div>
      <div className="w-20">
        <label htmlFor="concepto-nuevo-orden" className="block text-xs font-semibold text-gris-dark mb-1">Orden</label>
        <input id="concepto-nuevo-orden" inputMode="numeric" {...register('orden')} disabled={disabled}
          placeholder={String(siguienteOrden)} className={`${inputCls} ${errors.orden ? 'border-rojo' : ''}`} />
        {errors.orden && <div className="mt-1 text-[11px] text-rojo">{errors.orden.message}</div>}
      </div>
      <div className="pt-5">
        <Button type="submit" size="sm" loading={crear.isPending} disabled={disabled}
          title={disabled ? tooltip : 'Agregar a la lista (al final si no ponés orden)'}>
          + Agregar
        </Button>
      </div>
    </form>
  )
}

function FilaConcepto({ c, disabled, tooltip, unicoActivo }: {
  c: PagosConcepto; disabled: boolean; tooltip: string; unicoActivo: boolean
}) {
  const toast = useToast()
  const editar = useEditarConcepto()
  const { register, handleSubmit, setError, formState: { errors, isDirty } } = useForm<ConceptoForm>({
    resolver: zodResolver(conceptoSchema),
    defaultValues: { nombre: c.nombre, orden: c.orden != null ? String(c.orden) : '' },
  })

  async function onSubmit(v: ConceptoForm) {
    try {
      await editar.mutateAsync({ id: c.id, nombre: v.nombre.trim(), orden: aOrden(v.orden) })
      toast('✓ Concepto actualizado', 'ok')
    } catch (e) {
      const msg = mensajeErrorPagos(e)
      if (codigoErrorPagos(e) === 'CONCEPTO_DUPLICADO') setError('nombre', { message: msg })
      else toast(msg, 'err')
    }
  }

  async function cambiarActivo() {
    try {
      await editar.mutateAsync({ id: c.id, activo: !c.activo })
      toast(c.activo ? `«${c.nombre}» dado de baja` : `«${c.nombre}» reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  const bajaBloqueada = unicoActivo
  return (
    <form onSubmit={handleSubmit(onSubmit)}
      className={`grid grid-cols-[minmax(0,1fr)_80px] sm:grid-cols-[minmax(0,1fr)_80px_auto] gap-2 items-start px-2 py-2 ${c.activo ? '' : 'bg-gris/30'}`}>
      <div>
        <input {...register('nombre')} disabled={disabled} aria-label={`Nombre de ${c.nombre}`}
          aria-invalid={!!errors.nombre}
          className={`${inputCls} ${errors.nombre ? 'border-rojo' : ''} ${c.activo ? '' : 'text-gris-dark'}`} />
        {!c.activo && <div className="mt-0.5 text-[10px] font-bold text-gris-dark uppercase">dado de baja</div>}
        {errors.nombre && <div className="mt-1 text-[11px] text-rojo">{errors.nombre.message}</div>}
      </div>
      <div>
        <input inputMode="numeric" {...register('orden')} disabled={disabled} aria-label={`Orden de ${c.nombre}`}
          className={`${inputCls} ${errors.orden ? 'border-rojo' : ''}`} />
        {errors.orden && <div className="mt-1 text-[11px] text-rojo">{errors.orden.message}</div>}
      </div>
      <div className="col-span-2 sm:col-span-1 flex gap-1 justify-end">
        <Button type="submit" variant="secondary" size="sm" loading={editar.isPending && isDirty}
          disabled={disabled || !isDirty}
          title={disabled ? tooltip : !isDirty ? 'Sin cambios' : 'Guardar el nombre y el orden'}>
          Guardar
        </Button>
        <Button type="button" variant={c.activo ? 'ghost' : 'secondary'} size="sm" onClick={cambiarActivo}
          disabled={disabled || (c.activo && bajaBloqueada) || editar.isPending}
          title={disabled ? tooltip
            : c.activo && bajaBloqueada ? 'Es el único concepto activo: tiene que quedar al menos uno'
            : c.activo ? 'Deja de ofrecerse al cargar; las facturas que lo tienen lo conservan'
            : 'Vuelve a ofrecerse al cargar'}>
          {c.activo ? 'Dar de baja' : 'Reactivar'}
        </Button>
      </div>
    </form>
  )
}
