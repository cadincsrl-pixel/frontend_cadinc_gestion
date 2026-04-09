'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useUpdatePersonal, useDeletePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'
import { AuditInfo } from '@/components/ui/AuditInfo'
import type { Personal } from '@/types/domain.types'

const schema = z.object({
  nom:             z.string().min(1, 'El nombre es requerido'),
  dni:             z.string().optional(),
  cat_id:          z.coerce.number().min(1, 'Seleccioná una categoría'),
  tel:             z.string().optional(),
  dir:             z.string().optional(),
  obs:             z.string().optional(),
  talle_pantalon:  z.string().optional(),
  talle_botines:   z.string().optional(),
  talle_camisa:    z.string().optional(),
  activo_override: z.enum(['auto', 'activo', 'inactivo']).optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  trabajador: Personal | null
}

export function ModalEditarTrabajador({ open, onClose, trabajador }: Props) {
  const toast = useToast()
  const { data: categorias = [] } = useCategorias()
  const { mutate: updatePersonal, isPending: updating } = useUpdatePersonal()
  const { mutate: deletePersonal, isPending: deleting } = useDeletePersonal()

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any
  })

  useEffect(() => {
    if (trabajador) {
      reset({
        nom:             trabajador.nom,
        dni:             trabajador.dni ?? '',
        cat_id:          trabajador.cat_id,
        tel:             trabajador.tel ?? '',
        dir:             trabajador.dir ?? '',
        obs:             trabajador.obs ?? '',
        talle_pantalon:  trabajador.talle_pantalon ?? '',
        talle_botines:   trabajador.talle_botines  ?? '',
        talle_camisa:    trabajador.talle_camisa   ?? '',
        activo_override: trabajador.activo_override === true  ? 'activo'
                       : trabajador.activo_override === false ? 'inactivo'
                       : 'auto',
      })
    }
  }, [trabajador, reset])

  function onSubmit(data: FormData) {
    if (!trabajador) return
    const { activo_override: ao, ...rest } = data as any
    const dto = {
      ...rest,
      activo_override: ao === 'activo' ? true : ao === 'inactivo' ? false : null,
    }
    updatePersonal(
      { leg: trabajador.leg, dto },
      {
        onSuccess: () => {
          toast('✓ Trabajador actualizado', 'ok')
          onClose()
        },
        onError: (err) => toast(err.message ?? 'Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete() {
    if (!trabajador) return
    if (!confirm(`¿Eliminar a ${trabajador.nom}? Esta acción no se puede deshacer.`)) return
    deletePersonal(trabajador.leg, {
      onSuccess: () => {
        toast('✓ Trabajador eliminado', 'ok')
        onClose()
      },
      onError: (err) => toast(err.message ?? 'Error al eliminar', 'err'),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✏️ EDITAR TRABAJADOR"
      footer={
        <>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={updating || deleting}
            loading={deleting}
            className="mr-auto"
          >
            🗑 Eliminar
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={updating || deleting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={updating}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-gris rounded-lg px-3 py-2 text-sm">
          <span className="text-gris-dark font-semibold">Legajo: </span>
          <span className="font-mono font-bold text-azul">{trabajador?.leg}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="DNI"
            placeholder="12.345.678"
            {...register('dni')}
          />
          <Select
            label="Categoría"
            error={errors.cat_id?.message}
            options={categorias.map(c => ({ value: c.id, label: c.nom }))}
            {...register('cat_id')}
          />
        </div>
        <Input
          label="Apellido y Nombre"
          placeholder="Apellido, Nombre"
          error={errors.nom?.message}
          {...register('nom')}
        />
        <Input
          label="Teléfono"
          placeholder="351-XXX-XXXX"
          {...register('tel')}
        />
        <Input
          label="Dirección"
          placeholder="Calle y número"
          {...register('dir')}
        />
        <Input
          label="Observaciones"
          placeholder="Notas adicionales"
          {...register('obs')}
        />

        {/* Estado activo */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Estado en el sistema
          </div>
          <div className="flex gap-2">
            {(['auto', 'activo', 'inactivo'] as const).map(op => {
              const labels = { auto: '⚙ Auto', activo: '🟢 Forzar activo', inactivo: '⚫ Forzar inactivo' }
              const current = watch('activo_override') ?? 'auto'
              return (
                <button
                  key={op}
                  type="button"
                  onClick={() => setValue('activo_override', op)}
                  className={`
                    flex-1 text-xs font-bold px-2 py-2 rounded-lg border-[1.5px] transition-all
                    ${current === op
                      ? op === 'activo'   ? 'bg-verde-light border-verde text-verde'
                      : op === 'inactivo' ? 'bg-gris border-carbon text-carbon'
                      : 'bg-azul-light border-azul text-azul'
                      : 'bg-white border-gris-mid text-gris-dark hover:border-gris-dark'
                    }
                  `}
                >
                  {labels[op]}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-gris-dark mt-1">
            Auto = activo si tuvo horas las últimas 3 semanas.
          </p>
        </div>

        {/* Ropa de trabajo */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            👕 Ropa de trabajo
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Pantalón"
              placeholder="Ej: 44"
              {...register('talle_pantalon')}
            />
            <Input
              label="Botines"
              placeholder="Ej: 42"
              {...register('talle_botines')}
            />
            <Input
              label="Camisa"
              placeholder="Ej: L"
              {...register('talle_camisa')}
            />
          </div>
        </div>

        <AuditInfo
          createdBy={trabajador?.created_by}
          updatedBy={trabajador?.updated_by}
          createdAt={trabajador?.created_at}
          updatedAt={trabajador?.updated_at}
        />
      </div>
    </Modal>
  )
}