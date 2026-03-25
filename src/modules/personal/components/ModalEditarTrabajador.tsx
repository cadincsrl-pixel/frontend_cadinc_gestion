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
import type { Personal } from '@/types/domain.types'

const schema = z.object({
  nom: z.string().min(1, 'El nombre es requerido'),
  dni: z.string().optional(),
  cat_id: z.coerce.number().min(1, 'Seleccioná una categoría'),
  tel: z.string().optional(),
  dir: z.string().optional(),
  obs: z.string().optional(),
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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (trabajador) {
      reset({
        nom: trabajador.nom,
        dni: trabajador.dni ?? '',
        cat_id: trabajador.cat_id,
        tel: trabajador.tel ?? '',
        dir: trabajador.dir ?? '',
        obs: trabajador.obs ?? '',
      })
    }
  }, [trabajador, reset])

  function onSubmit(data: FormData) {
    if (!trabajador) return
    updatePersonal(
      { leg: trabajador.leg, dto: data },
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
      </div>
    </Modal>
  )
}