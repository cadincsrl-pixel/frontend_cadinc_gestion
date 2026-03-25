'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useCreateObra } from '@/modules/tarja/hooks/useObras'
import { useToast } from '@/components/ui/Toast'

const schema = z.object({
  cod:  z.string().min(1, 'El código es requerido'),
  nom:  z.string().min(1, 'El nombre es requerido'),
  cc:   z.string().optional(),
  dir:  z.string().optional(),
  resp: z.string().optional(),
  obs:  z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
}

export function ModalNuevaObra({ open, onClose }: Props) {
  const toast = useToast()
  const { mutate: createObra, isPending } = useCreateObra()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  function onSubmit(data: FormData) {
    createObra(data, {
      onSuccess: () => {
        toast('✓ Obra creada correctamente', 'ok')
        reset()
        onClose()
      },
      onError: (err) => {
        toast(err.message ?? 'Error al crear la obra', 'err')
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏗 NUEVA OBRA"
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
            ✓ Agregar obra
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Código"
            placeholder="CC-001"
            error={errors.cod?.message}
            {...register('cod')}
          />
          <Input
            label="Responsable"
            placeholder="Capataz"
            error={errors.resp?.message}
            {...register('resp')}
          />
        </div>
        <Input
          label="Nombre de la obra"
          placeholder="Nombre de la obra"
          error={errors.nom?.message}
          {...register('nom')}
        />
        <Input
          label="Centro de Costo"
          placeholder="Ej: García Hnos. · Proyecto Residencial"
          {...register('cc')}
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