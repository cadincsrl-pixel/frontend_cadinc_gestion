'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useMateriales, useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../hooks/useAridos'
import type { MaterialArido } from '../types'

const schema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido'),
  unidad: z.enum(['m3', 'viaje']),
})
type FormData = z.infer<typeof schema>

export function MaterialesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: materiales = [], isLoading } = useMateriales()
  const { mutate: create, isPending: creating } = useCreateMaterial()
  const { mutate: update, isPending: updating } = useUpdateMaterial()
  const { mutate: remove } = useDeleteMaterial()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: '', unidad: 'm3' },
  })

  function abrirNuevo() {
    setEditId(null)
    reset({ nombre: '', unidad: 'm3' })
    setModalOpen(true)
  }

  function abrirEditar(m: MaterialArido) {
    setEditId(m.id)
    reset({ nombre: m.nombre, unidad: m.unidad })
    setModalOpen(true)
  }

  function onSubmit(data: FormData) {
    if (editId == null) {
      create(data, {
        onSuccess: () => { toast('✓ Material agregado', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      update({ id: editId, dto: data }, {
        onSuccess: () => { toast('✓ Material actualizado', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function toggleActivo(m: MaterialArido) {
    update({ id: m.id, dto: { activo: !m.activo } }, {
      onSuccess: () => toast(m.activo ? '✓ Material desactivado' : '✓ Material reactivado', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
    })
  }

  function handleEliminar(m: MaterialArido) {
    if (!confirm(`¿Eliminar "${m.nombre}"? Si tiene movimientos no se va a poder; en ese caso desactivalo.`)) return
    remove(m.id, {
      onSuccess: () => toast('✓ Material eliminado', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={abrirNuevo}>
          ＋ Nuevo material
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando...</div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Material', 'Se vende por', 'Estado', ''].map((h, i) => (
                  <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materiales.map(m => (
                <tr key={m.id} className={`border-b border-gris last:border-0 hover:bg-gris/40 transition-colors ${!m.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-bold text-sm text-carbon">{m.nombre}</td>
                  <td className="px-4 py-3 text-sm text-gris-dark">{m.unidad === 'm3' ? 'm³ (metro cúbico)' : 'viaje'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActivo(m)}
                      disabled={!puedeEditar}
                      className={`text-xs font-bold px-2 py-0.5 rounded ${m.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} ${puedeEditar ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                      title={m.activo ? 'Click para desactivar' : 'Click para reactivar'}
                    >
                      {m.activo ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(m)}>✎</Button>
                    <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => handleEliminar(m)}>🗑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '🪨 NUEVO MATERIAL' : '🪨 EDITAR MATERIAL'}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating || updating} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nombre" placeholder="Ej: Arena fina" error={errors.nombre?.message} {...register('nombre')} />
          <Select
            label="Se vende por"
            options={[
              { value: 'm3', label: 'm³ (metro cúbico)' },
              { value: 'viaje', label: 'Viaje (ej: retiro de escombro)' },
            ]}
            {...register('unidad')}
          />
        </div>
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
