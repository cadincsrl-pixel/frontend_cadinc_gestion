'use client'

import { useState } from 'react'
import { useBateas, useCreateBatea, useUpdateBatea, useDeleteBatea } from '../hooks/useLogistica'
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
import type { Batea } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',         label: 'Activo'         },
  { value: 'mantenimiento',  label: 'En mantenimiento' },
  { value: 'inactivo',       label: 'Inactivo'       },
]

const TIPO_OPTIONS = [
  { value: '',          label: 'Sin especificar' },
  { value: 'volcadora', label: 'Volcadora'       },
  { value: 'plana',     label: 'Plana'           },
  { value: 'tanque',    label: 'Tanque'          },
  { value: 'gondola',   label: 'Góndola'         },
  { value: 'otro',      label: 'Otro'            },
]

interface FormValues {
  patente?:      string
  tipo?:         string
  marca?:        string
  modelo?:       string
  anio?:         string
  capacidad_m3?: string
  capacidad_tn?: string
  titular?:      string
  estado?:       string
  obs?:          string
}

export function BateasTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: bateas = [] } = useBateas()
  const { mutate: create, isPending: creating } = useCreateBatea()
  const { mutate: update, isPending: updating } = useUpdateBatea()
  const { mutate: remove } = useDeleteBatea()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<Batea | null>(null)
  const formNuevo = useForm<FormValues>({ defaultValues: { estado: 'activo' } })
  const formEdit  = useForm<FormValues>()

  function parseDto(data: FormValues): any {
    return {
      patente:      data.patente!.trim(),
      tipo:         data.tipo || null,
      marca:        data.marca || null,
      modelo:       data.modelo || null,
      anio:         data.anio ? Number(data.anio) : null,
      capacidad_m3: data.capacidad_m3 ? Number(data.capacidad_m3) : null,
      capacidad_tn: data.capacidad_tn ? Number(data.capacidad_tn) : null,
      titular:      data.titular || null,
      estado:       data.estado || 'activo',
      obs:          data.obs || null,
    }
  }

  function handleCreate(data: FormValues) {
    if (!data.patente?.trim()) { toast('La patente es obligatoria', 'err'); return }
    create(parseDto(data), {
      onSuccess: () => { toast('✓ Batea agregada', 'ok'); setModalNuevo(false); formNuevo.reset({ estado: 'activo' }) },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: FormValues) {
    if (!editando) return
    update({ id: editando.id, dto: parseDto(data) }, {
      onSuccess: () => { toast('✓ Batea actualizada', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleDelete(b: Batea) {
    if (!confirm(`¿Eliminar la batea ${b.patente}?`)) return
    remove(b.id, {
      onSuccess: () => toast('✓ Batea eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEdit(b: Batea) {
    formEdit.reset({
      patente:      b.patente,
      tipo:         b.tipo ?? '',
      marca:        b.marca ?? '',
      modelo:       b.modelo ?? '',
      anio:         b.anio != null ? String(b.anio) : '',
      capacidad_m3: b.capacidad_m3 != null ? String(b.capacidad_m3) : '',
      capacidad_tn: b.capacidad_tn != null ? String(b.capacidad_tn) : '',
      titular:      b.titular ?? '',
      estado:       b.estado,
      obs:          b.obs ?? '',
    })
    setEditando(b)
  }

  const BateaForm = ({ form }: { form: any }) => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Patente" placeholder="AA-123-BB" {...form.register('patente')} />
        <Select label="Tipo" options={TIPO_OPTIONS} {...form.register('tipo')} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Marca" placeholder="Helvética" {...form.register('marca')} />
        <Input label="Modelo" {...form.register('modelo')} />
        <Input label="Año" type="number" min={1980} max={2100} {...form.register('anio')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Capacidad (m³)" type="number" step="0.01" {...form.register('capacidad_m3')} />
        <Input label="Capacidad (tn)" type="number" step="0.01" {...form.register('capacidad_tn')} />
      </div>
      <Input label="Titular" placeholder="Propietario legal" {...form.register('titular')} />
      <Select label="Estado" options={ESTADO_OPTIONS} {...form.register('estado')} />
      <Input label="Observaciones" placeholder="Notas..." {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex justify-end">
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nueva batea</Button>
        )}
      </div>

      <div className="bg-white rounded-card shadow-card overflow-hidden mt-3">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Patente', 'Tipo', 'Marca/Modelo', 'Año', 'Capacidad', 'Titular', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bateas.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm">No hay bateas registradas.</td></tr>
            ) : bateas.map(b => (
              <tr key={b.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-mono text-sm font-bold text-carbon">{b.patente}</td>
                <td className="px-4 py-3 text-xs text-gris-dark capitalize">{b.tipo ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">
                  {b.marca || b.modelo ? `${b.marca ?? ''} ${b.modelo ?? ''}`.trim() : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{b.anio ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">
                  {b.capacidad_m3 != null && <span>{b.capacidad_m3}m³</span>}
                  {b.capacidad_m3 != null && b.capacidad_tn != null && <span className="text-gris-mid"> · </span>}
                  {b.capacidad_tn != null && <span>{b.capacidad_tn}tn</span>}
                  {b.capacidad_m3 == null && b.capacidad_tn == null && '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gris-dark">{b.titular ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={b.estado === 'activo' ? 'activo' : b.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={b.estado === 'mantenimiento' ? 'En mantenimiento' : undefined}
                  />
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  {puedeEditar && <button onClick={() => openEdit(b)} className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>}
                  {puedeEliminar && <button onClick={() => handleDelete(b)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🛻 NUEVA BATEA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <BateaForm form={formNuevo} />
      </Modal>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR BATEA"
        width="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <BateaForm form={formEdit} />

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <VehiculoDocumentosSection entidad="batea" id={editando.id} />
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
