'use client'

import { useState } from 'react'
import { useCamiones, useCreateCamion, useUpdateCamion } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { VehiculoDocumentosSection } from './VehiculoDocumentosSection'
import type { Camion } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',        label: 'Activo'           },
  { value: 'mantenimiento', label: 'En mantenimiento' },
  { value: 'inactivo',      label: 'Inactivo'         },
]

export function CamionesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('logistica')
  const { data: camiones = [] } = useCamiones()
  const { mutate: create, isPending: creating } = useCreateCamion()
  const { mutate: update, isPending: updating } = useUpdateCamion()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<Camion | null>(null)
  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  function handleCreate(data: any) {
    create({ ...data, anio: data.anio ? Number(data.anio) : undefined }, {
      onSuccess: () => { toast('✓ Camión agregado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: { ...data, anio: data.anio ? Number(data.anio) : undefined } }, {
      onSuccess: () => { toast('✓ Camión actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function openEdit(c: Camion) {
    formEdit.reset({ patente: c.patente, modelo: c.modelo ?? '', anio: c.anio ?? '', estado: c.estado, obs: c.obs ?? '' })
    setEditando(c)
  }

  const CamionForm = ({ form, disabled }: { form: any; disabled?: boolean }) => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Patente" placeholder="AA 123 BB" disabled={disabled} {...form.register('patente')} />
        <Input label="Modelo"  placeholder="Volvo FH 460" disabled={disabled} {...form.register('modelo')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Año" type="number" placeholder="2020" disabled={disabled} {...form.register('anio')} />
        <Select label="Estado" options={ESTADO_OPTIONS} disabled={disabled} {...form.register('estado')} />
      </div>
      <Input label="Observaciones" placeholder="Notas..." disabled={disabled} {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex justify-end">
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo camión</Button>
        )}
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Patente', 'Modelo', 'Año', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {camiones.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gris-dark text-sm">No hay camiones registrados.</td></tr>
            ) : camiones.map(c => (
              <tr
                key={c.id}
                className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <td className="px-4 py-3 font-mono font-bold text-sm">{c.patente}</td>
                <td className="px-4 py-3 text-sm text-carbon">{c.modelo || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.anio || '—'}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={c.estado === 'mantenimiento' ? 'Mantenimiento' : undefined}
                  />
                </td>
                <td className="px-4 py-3 text-right text-xs text-gris-mid">
                  {puedeEditar ? '✏️' : '👁'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🚚 NUEVO CAMIÓN"
        footer={<><Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button><Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button></>}
      >
        <CamionForm form={formNuevo} />
      </Modal>

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={puedeEditar ? '✏️ EDITAR CAMIÓN' : '🚚 DETALLE CAMIÓN'}
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
          <CamionForm form={formEdit} disabled={!puedeEditar} />

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <VehiculoDocumentosSection entidad="camion" id={editando.id} />
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