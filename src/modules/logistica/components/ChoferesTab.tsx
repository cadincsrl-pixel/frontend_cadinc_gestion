'use client'

import { useState } from 'react'
import { useChoferes, useCreateChofer, useUpdateChofer, useDeleteChofer } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import type { Chofer } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',   label: 'Activo'        },
  { value: 'descanso', label: 'De descanso'   },
  { value: 'inactivo', label: 'Inactivo'      },
]

export function ChoferesTab() {
  const toast = useToast()
  const { data: choferes = [] } = useChoferes()
  const { mutate: create, isPending: creating } = useCreateChofer()
  const { mutate: update, isPending: updating } = useUpdateChofer()
  const { mutate: remove } = useDeleteChofer()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Chofer | null>(null)
  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  function handleCreate(data: any) {
    create(data, {
      onSuccess: () => { toast('✓ Chofer agregado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: data }, {
      onSuccess: () => { toast('✓ Chofer actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleDelete(chofer: Chofer) {
    if (!confirm(`¿Eliminar a ${chofer.nombre}?`)) return
    remove(chofer.id, {
      onSuccess: () => toast('✓ Chofer eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEdit(chofer: Chofer) {
    formEdit.reset({
      nombre:   chofer.nombre,
      dni:      chofer.dni ?? '',
      tel:      chofer.tel ?? '',
      licencia: chofer.licencia ?? '',
      estado:   chofer.estado,
      obs:      chofer.obs ?? '',
    })
    setEditando(chofer)
  }

  const ChoferForm = ({ form }: { form: any }) => (
    <div className="flex flex-col gap-4">
      <Input label="Nombre completo" placeholder="Apellido, Nombre" {...form.register('nombre')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="DNI" placeholder="12.345.678" {...form.register('dni')} />
        <Input label="Teléfono" placeholder="299-XXX-XXXX" {...form.register('tel')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Licencia" placeholder="Nº licencia" {...form.register('licencia')} />
        <Select label="Estado" options={ESTADO_OPTIONS} {...form.register('estado')} />
      </div>
      <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo chofer</Button>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Nombre', 'DNI', 'Teléfono', 'Licencia', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {choferes.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gris-dark text-sm">No hay choferes registrados.</td></tr>
            ) : choferes.map(c => (
              <tr key={c.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.dni || '—'}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{c.tel || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.licencia || '—'}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={c.estado === 'descanso' ? 'Descanso' : undefined}
                  />
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  <button onClick={() => openEdit(c)} className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                  <button onClick={() => handleDelete(c)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="👷 NUEVO CHOFER"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <ChoferForm form={formNuevo} />
      </Modal>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR CHOFER"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
          </>
        }
      >
        <ChoferForm form={formEdit} />
        <AuditInfo
          createdBy={editando?.created_by}
          updatedBy={editando?.updated_by}
          createdAt={editando?.created_at}
          updatedAt={editando?.updated_at}
        />
      </Modal>
    </>
  )
}