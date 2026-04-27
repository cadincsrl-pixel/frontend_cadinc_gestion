'use client'

import { useState } from 'react'
import { useChoferes, useCreateChofer, useUpdateChofer, useDeleteChofer, useCamiones } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { ChoferDocumentosSection } from './ChoferDocumentosSection'
import type { Chofer } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',   label: 'Activo'        },
  { value: 'descanso', label: 'De descanso'   },
  { value: 'inactivo', label: 'Inactivo'      },
]

export function ChoferesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()
  const { mutate: create, isPending: creating } = useCreateChofer()
  const { mutate: update, isPending: updating } = useUpdateChofer()
  const { mutate: remove } = useDeleteChofer()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Chofer | null>(null)
  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  function handleCreate(data: any) {
    create({ ...data, camion_id: data.camion_id ? Number(data.camion_id) : null }, {
      onSuccess: () => { toast('✓ Chofer agregado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: { ...data, camion_id: data.camion_id ? Number(data.camion_id) : null } }, {
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
      nombre:     chofer.nombre,
      cuil:       chofer.cuil ?? '',
      tel:        chofer.tel ?? '',
      licencia:   chofer.licencia ?? '',
      estado:     chofer.estado,
      camion_id:  chofer.camion_id ?? '',
      basico_dia: chofer.basico_dia ?? 0,
      precio_km:  chofer.precio_km ?? 0,
      obs:        chofer.obs ?? '',
    })
    setEditando(chofer)
  }

  const camionOptions = [
    { value: '', label: 'Sin asignar' },
    ...camiones.filter(c => c.estado === 'activo').map(c => ({
      value: c.id,
      label: `${c.patente}${c.modelo ? ` — ${c.modelo}` : ''}`,
    })),
  ]

  const ChoferForm = ({ form, disabled }: { form: any; disabled?: boolean }) => (
    <div className="flex flex-col gap-4">
      <Input label="Nombre completo" placeholder="Apellido, Nombre" disabled={disabled} {...form.register('nombre')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="CUIL" placeholder="20-12345678-3" disabled={disabled} {...form.register('cuil')} />
        <Input label="Teléfono" placeholder="299-XXX-XXXX" disabled={disabled} {...form.register('tel')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Licencia" placeholder="Nº licencia" disabled={disabled} {...form.register('licencia')} />
        <Select label="Estado" options={ESTADO_OPTIONS} disabled={disabled} {...form.register('estado')} />
      </div>
      <Select label="Camión asignado" options={camionOptions} disabled={disabled} {...form.register('camion_id')} />
      <Input label="Observaciones" placeholder="Notas..." disabled={disabled} {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex justify-end">
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo chofer</Button>
        )}
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Nombre', 'CUIL', 'Teléfono', 'Licencia', 'Camión', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {choferes.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm">No hay choferes registrados.</td></tr>
            ) : choferes.map(c => {
              const camionAsig = camiones.find(cam => cam.id === c.camion_id)
              return (
              <tr
                key={c.id}
                className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.cuil || '—'}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{c.tel || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.licencia || '—'}</td>
                <td className="px-4 py-3">
                  {camionAsig
                    ? <span className="font-mono text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">{camionAsig.patente}</span>
                    : <span className="text-gris-mid text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={c.estado === 'descanso' ? 'Descanso' : undefined}
                  />
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                  {puedeEliminar && <button onClick={() => handleDelete(c)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
                </td>
              </tr>
              )
            })}
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

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={puedeEditar ? '✏️ EDITAR CHOFER' : '👷 DETALLE CHOFER'}
        width="max-w-3xl"
        footer={
          puedeEditar ? (
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditando(null)}>Cerrar</Button>
          )
        }
      >
        <div className="flex flex-col gap-5">
          <ChoferForm form={formEdit} disabled={!puedeEditar} />

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <ChoferDocumentosSection choferId={editando.id} />
            </div>
          )}

          <AuditInfo
            createdBy={editando?.created_by}
            updatedBy={editando?.updated_by}
            createdAt={editando?.created_at}
            updatedAt={editando?.updated_at}
          />
        </div>
      </Modal>
    </>
  )
}