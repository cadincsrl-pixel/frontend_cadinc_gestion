'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useUpdateObra, useArchivarObra, useDeleteObra } from '@/modules/tarja/hooks/useObras'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'
import type { Obra } from '@/types/domain.types'

const schema = z.object({
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
  obra: Obra | null
}

export function ModalEditarObra({ open, onClose, obra }: Props) {
  const toast = useToast()
  const router = useRouter()
  const { mutate: updateObra, isPending: updating } = useUpdateObra()
  const { mutate: archivarObra, isPending: archivando } = useArchivarObra()
  const { mutate: deleteObra, isPending: eliminando } = useDeleteObra()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (obra) {
      reset({
        nom:  obra.nom,
        cc:   obra.cc ?? '',
        dir:  obra.dir ?? '',
        resp: obra.resp ?? '',
        obs:  obra.obs ?? '',
      })
    }
  }, [obra, reset])

  function onSubmit(data: FormData) {
    if (!obra) return
    updateObra(
      { cod: obra.cod, dto: data },
      {
        onSuccess: () => {
          toast('✓ Obra actualizada', 'ok')
          onClose()
        },
        onError: (err) => toast(err.message ?? 'Error al actualizar', 'err'),
      }
    )
  }

  function handleArchivar() {
    if (!obra) return
    if (!confirm(`¿Archivar "${obra.nom}"? Los datos se conservan pero la obra pasará al historial.`)) return
    archivarObra(obra.cod, {
      onSuccess: () => {
        toast('✓ Obra archivada', 'ok')
        onClose()
        router.push('/tarja')
      },
      onError: (err) => toast(err.message ?? 'Error al archivar', 'err'),
    })
  }

  function handleEliminar() {
    if (!obra) return
    if (!confirm(`¿Eliminar "${obra.nom}"? Esta acción borrará la obra y todas sus horas. No se puede deshacer.`)) return
    deleteObra(obra.cod, {
      onSuccess: () => {
        toast('✓ Obra eliminada', 'ok')
        onClose()
        router.push('/tarja')
      },
      onError: (err) => toast(err.message ?? 'Error al eliminar', 'err'),
    })
  }

  const isPending = updating || archivando || eliminando

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✏️ EDITAR OBRA"
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={updating}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Guardar cambios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Código — solo lectura */}
        <div className="bg-gris rounded-lg px-3 py-2 text-sm flex items-center gap-2">
          <span className="text-gris-dark font-semibold">Código:</span>
          <span className="font-mono font-bold text-azul">{obra?.cod}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nombre de la obra"
            placeholder="Nombre"
            error={errors.nom?.message}
            className="col-span-2"
            {...register('nom')}
          />
          <Input
            label="Responsable"
            placeholder="Capataz"
            {...register('resp')}
          />
          <Input
            label="Centro de Costo"
            placeholder="Ej: García Hnos."
            {...register('cc')}
          />
        </div>
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

        {/* Zona de peligro */}
        <div className="border-t border-gris-mid pt-4 mt-1">
          <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
            ⚠️ Zona de peligro
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleArchivar}
              disabled={isPending}
              className="px-3 py-2.5 rounded-lg border-[1.5px] border-amarillo bg-amarillo-light text-[#7A5000] text-xs font-bold hover:bg-amarillo hover:text-white transition-colors disabled:opacity-60"
            >
              📦 Archivar obra
            </button>
            <button
              onClick={handleEliminar}
              disabled={isPending}
              className="px-3 py-2.5 rounded-lg border-[1.5px] border-rojo bg-rojo-light text-rojo text-xs font-bold hover:bg-rojo hover:text-white transition-colors disabled:opacity-60"
            >
              🗑 Eliminar obra
            </button>
          </div>
          <p className="text-[11px] text-gris-dark mt-2 leading-relaxed">
            <b>Archivar:</b> pasa al historial, todos los datos se conservan.<br />
            <b>Eliminar:</b> borra la obra y todas sus horas definitivamente.
          </p>
        </div>

      </div>
    </Modal>
  )
}