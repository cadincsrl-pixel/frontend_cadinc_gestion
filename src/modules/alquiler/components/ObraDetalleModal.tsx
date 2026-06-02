'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import {
  useUpdateObraAlquiler,
  useDeleteObraAlquiler,
  usePerfilesLista,
} from '../hooks/useAlquiler'
import { ObraMaquinasSection } from './ObraMaquinasSection'
import {
  OBRA_ESTADO_OPTIONS,
  type ObraAlquiler,
  type ObraAlquilerEstado,
} from '../types'

const schema = z.object({
  nombre:       z.string().trim().min(1, 'El nombre es requerido'),
  cliente:      z.string().trim().optional(),
  ubicacion:    z.string().trim().optional(),
  descripcion:  z.string().trim().optional(),
  estado:       z.enum(['activa', 'cerrada']),
  fecha_inicio: z.string().optional(),
  obs:          z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  obra: ObraAlquiler | null
  onClose: () => void
  puedeEditar: boolean
  puedeEliminar: boolean
}

// Modal de detalle de obra. Arranca read-only (patrón ChoferesTab): botón
// "Editar" habilita los inputs. La sección de máquinas asignadas tiene su
// propio gateo por permiso y vive abajo.
export function ObraDetalleModal({ obra, onClose, puedeEditar, puedeEliminar }: Props) {
  const toast = useToast()
  const { mutate: update, isPending: updating } = useUpdateObraAlquiler()
  const { mutate: remove, isPending: removing } = useDeleteObraAlquiler()
  const { data: perfiles = [] } = usePerfilesLista()

  const [editando, setEditando] = useState(false)
  const [jefeUserId, setJefeUserId] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Reset al abrir/cambiar de obra. Se keya por id (primitivo) para evitar
  // cascadas de render — mismo patrón que VehiculoDetalleModal de flota.
  useEffect(() => {
    if (!obra) return
    reset({
      nombre:       obra.nombre,
      cliente:      obra.cliente ?? '',
      ubicacion:    obra.ubicacion ?? '',
      descripcion:  obra.descripcion ?? '',
      estado:       obra.estado,
      fecha_inicio: obra.fecha_inicio ?? '',
      obs:          obra.obs ?? '',
    })
    setJefeUserId(obra.jefe_obra_user_id ?? '')
    setEditando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra?.id])

  const opcionesJefe = useMemo(
    () => [
      { value: '', label: '— sin jefe de obra —' },
      ...perfiles.map(p => ({ value: p.id, label: p.nombre })),
    ],
    [perfiles],
  )

  const nombreJefe = useMemo(() => {
    if (!obra?.jefe_obra_user_id) return null
    return perfiles.find(p => p.id === obra.jefe_obra_user_id)?.nombre ?? null
  }, [obra, perfiles])

  if (!obra) return null

  function onSubmit(data: FormData) {
    if (!obra) return
    update(
      {
        id: obra.id,
        dto: {
          nombre:            data.nombre.trim(),
          cliente:           data.cliente?.trim() || null,
          ubicacion:         data.ubicacion?.trim() || null,
          descripcion:       data.descripcion?.trim() || null,
          jefe_obra_user_id: jefeUserId || null,
          estado:            data.estado as ObraAlquilerEstado,
          fecha_inicio:      data.fecha_inicio || null,
          obs:               data.obs?.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast('✓ Obra actualizada', 'ok')
          setEditando(false)
        },
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al actualizar', 'err'),
      },
    )
  }

  function handleEliminar() {
    if (!obra) return
    if (!confirm(`¿Eliminar la obra "${obra.nombre}"? Esta acción no se puede deshacer.`)) return
    remove(obra.id, {
      onSuccess: () => {
        toast('✓ Obra eliminada', 'ok')
        onClose()
      },
      onError: (err: unknown) => toast((err as { message?: string })?.message || 'No se pudo eliminar', 'err'),
    })
  }

  return (
    <Modal
      open={!!obra}
      onClose={onClose}
      title={`🏗 ${obra.nombre.toUpperCase()}`}
      width="max-w-2xl"
      footer={
        editando ? (
          <>
            <Button variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={handleSubmit(onSubmit)}>✓ Guardar</Button>
          </>
        ) : (
          <>
            {puedeEliminar && (
              <Button variant="danger" loading={removing} onClick={handleEliminar}>🗑 Eliminar</Button>
            )}
            <Button variant="primary" disabled={!puedeEditar} onClick={() => setEditando(true)}>✎ Editar</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Datos de la obra */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nombre" disabled={!editando} error={errors.nombre?.message} {...register('nombre')} />
          <Input label="Cliente" placeholder="Texto libre" disabled={!editando} {...register('cliente')} />
          <Input label="Ubicación" disabled={!editando} {...register('ubicacion')} />
          <Input label="Fecha de inicio" type="date" disabled={!editando} {...register('fecha_inicio')} />
          <Select label="Estado" options={OBRA_ESTADO_OPTIONS} disabled={!editando} {...register('estado')} />
          {editando ? (
            <Combobox
              label="Jefe de obra"
              placeholder="Buscar usuario..."
              options={opcionesJefe}
              value={jefeUserId}
              onChange={setJefeUserId}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Jefe de obra</label>
              <div className="px-3 py-2 text-sm text-carbon">{nombreJefe ?? '—'}</div>
            </div>
          )}
        </div>
        <Input label="Descripción" disabled={!editando} {...register('descripcion')} />
        <Input label="Observaciones" disabled={!editando} {...register('obs')} />

        {/* Separador */}
        <div className="border-t border-gris pt-3">
          <ObraMaquinasSection obraId={obra.id} puedeEditar={puedeEditar} />
        </div>
      </div>
    </Modal>
  )
}
