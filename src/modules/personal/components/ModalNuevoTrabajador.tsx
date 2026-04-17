'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useCreatePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'

const schema = z.object({
  leg:            z.string().min(1, 'El legajo es requerido'),
  nom:            z.string().min(1, 'El nombre es requerido'),
  dni:            z.string().optional(),
  condicion:      z.enum(['blanco', 'asegurado']).optional(),
  cat_id:         z.coerce.number({ error: 'La categoría es requerida' }).min(1, 'Seleccioná una categoría'),
  tel:            z.string().optional(),
  dir:            z.string().optional(),
  obs:            z.string().optional(),
  talle_pantalon: z.string().optional(),
  talle_botines:  z.string().optional(),
  talle_camisa:   z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
}

export function ModalNuevoTrabajador({ open, onClose }: Props) {
  const toast = useToast()
  const { data: categorias = [] } = useCategorias()
  const { mutate: createPersonal, isPending } = useCreatePersonal()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as any
  })

  function onSubmit(data: FormData) {
    createPersonal(data, {
      onSuccess: () => {
        toast('✓ Trabajador agregado', 'ok')
        reset()
        onClose()
      },
      onError: (err) => {
        toast(err.message ?? 'Error al crear trabajador', 'err')
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 NUEVO TRABAJADOR"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Legajo"
            placeholder="001"
            error={errors.leg?.message}
            {...register('leg')}
          />
          <Input
            label="DNI"
            placeholder="12.345.678"
            error={errors.dni?.message}
            {...register('dni')}
          />
        </div>
        <Select
          label="Condición"
          placeholder="Sin especificar"
          options={[
            { value: 'blanco', label: 'Blanco' },
            { value: 'asegurado', label: 'Asegurado' },
          ]}
          {...register('condicion')}
        />
        <Input
          label="Apellido y Nombre"
          placeholder="Apellido, Nombre"
          error={errors.nom?.message}
          {...register('nom')}
        />
        <Select
          label="Categoría"
          placeholder="Elegí una categoría"
          error={errors.cat_id?.message}
          options={categorias.map(c => ({ value: c.id, label: `${c.nom} — $${c.vh}/h` }))}
          {...register('cat_id')}
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
      </div>
    </Modal>
  )
}