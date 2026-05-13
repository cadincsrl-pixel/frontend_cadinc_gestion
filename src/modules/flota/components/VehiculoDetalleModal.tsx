'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useUpdateFlotaVehiculo, useDeleteFlotaVehiculo } from '../hooks/useFlotaVehiculos'
import { FlotaDocumentosSection } from './FlotaDocumentosSection'
import type { FlotaVehiculo, FlotaVehiculoTipo, FlotaVehiculoEstado } from '@/types/domain.types'

interface Props {
  vehiculo: FlotaVehiculo | null
  onClose: () => void
}

const TIPO_OPTIONS: { value: FlotaVehiculoTipo; label: string }[] = [
  { value: 'auto',       label: 'Auto' },
  { value: 'camioneta',  label: 'Camioneta' },
  { value: 'utilitario', label: 'Utilitario' },
  { value: 'pickup',     label: 'Pickup' },
  { value: 'moto',       label: 'Moto' },
  { value: 'otro',       label: 'Otro' },
]
const ESTADO_OPTIONS: { value: FlotaVehiculoEstado; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'taller', label: 'En taller' },
  { value: 'baja',   label: 'Baja' },
]

interface FormData {
  patente:              string
  tipo:                 FlotaVehiculoTipo
  marca:                string
  modelo:               string
  anio:                 string
  color:                string
  vin:                  string
  titular:              string
  km_actuales:          string
  estado:               FlotaVehiculoEstado
  mobilquest_device_id: string
  obs:                  string
}

function defaultsFrom(v: FlotaVehiculo): FormData {
  return {
    patente:              v.patente ?? '',
    tipo:                 v.tipo,
    marca:                v.marca ?? '',
    modelo:               v.modelo ?? '',
    anio:                 v.anio != null ? String(v.anio) : '',
    color:                v.color ?? '',
    vin:                  v.vin ?? '',
    titular:              v.titular ?? '',
    km_actuales:          String(v.km_actuales ?? 0),
    estado:               v.estado,
    mobilquest_device_id: v.mobilquest_device_id ?? '',
    obs:                  v.obs ?? '',
  }
}

export function VehiculoDetalleModal({ vehiculo, onClose }: Props) {
  const toast = useToast()
  const { puedeEditar, puedeEliminar } = usePermisos('flota')
  const { mutate: update, isPending: updating } = useUpdateFlotaVehiculo()
  const { mutate: remove } = useDeleteFlotaVehiculo()

  // Tab interno: 'datos' (edición) | 'papeles' (uploads).
  const [tab, setTab] = useState<'datos' | 'papeles'>('datos')
  // Modo detalle vs edición — los inputs arrancan deshabilitados.
  const [modoEdicion, setModoEdicion] = useState(false)
  const form = useForm<FormData>()

  // Reset al abrir/cambiar vehículo.
  useEffect(() => {
    if (vehiculo) {
      form.reset(defaultsFrom(vehiculo))
      setModoEdicion(false)
      setTab('datos')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculo?.id])

  function handleSubmit(data: FormData) {
    if (!vehiculo) return
    update(
      {
        id:  vehiculo.id,
        dto: {
          patente:              data.patente.trim(),
          tipo:                 data.tipo,
          marca:                data.marca.trim() || null,
          modelo:               data.modelo.trim() || null,
          anio:                 data.anio ? Number(data.anio) : null,
          color:                data.color.trim() || null,
          vin:                  data.vin.trim() || null,
          titular:              data.titular.trim() || null,
          km_actuales:          Number(data.km_actuales) || 0,
          estado:               data.estado,
          mobilquest_device_id: data.mobilquest_device_id.trim() || null,
          obs:                  data.obs.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast('✓ Vehículo actualizado', 'ok')
          setModoEdicion(false)
        },
        onError: () => toast('Error al actualizar', 'err'),
      },
    )
  }

  function handleDelete() {
    if (!vehiculo) return
    if (!confirm(`¿Eliminar el vehículo "${vehiculo.patente}"? Esta acción no se puede deshacer.`)) return
    remove(vehiculo.id, {
      onSuccess: () => {
        toast('✓ Vehículo eliminado', 'ok')
        onClose()
      },
      onError: () => toast('Error al eliminar', 'err'),
    })
  }

  function cancelarEdicion() {
    if (vehiculo) form.reset(defaultsFrom(vehiculo))
    setModoEdicion(false)
  }

  if (!vehiculo) return null

  return (
    <Modal
      open={!!vehiculo}
      onClose={onClose}
      title={modoEdicion ? '✏️ EDITAR VEHÍCULO' : `🚙 ${vehiculo.patente}`}
      width="max-w-3xl"
      footer={
        tab === 'datos' && modoEdicion ? (
          <>
            <Button variant="secondary" onClick={cancelarEdicion}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={form.handleSubmit(handleSubmit)}>
              ✓ Guardar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            {tab === 'datos' && puedeEditar && (
              <Button variant="primary" onClick={() => setModoEdicion(true)}>
                ✏️ Editar
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Tabs internos */}
        <div className="flex gap-1 border-b border-gris">
          <button
            onClick={() => setTab('datos')}
            className={`px-3 py-1.5 text-xs font-bold transition-colors border-b-2 -mb-px ${
              tab === 'datos'
                ? 'border-naranja text-naranja-dark'
                : 'border-transparent text-gris-dark hover:text-naranja'
            }`}
          >
            🚙 Datos
          </button>
          <button
            onClick={() => setTab('papeles')}
            className={`px-3 py-1.5 text-xs font-bold transition-colors border-b-2 -mb-px ${
              tab === 'papeles'
                ? 'border-naranja text-naranja-dark'
                : 'border-transparent text-gris-dark hover:text-naranja'
            }`}
          >
            📂 Papeles
          </button>
        </div>

        {tab === 'datos' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Patente"
                placeholder="AB123CD"
                disabled={!modoEdicion}
                {...form.register('patente', { required: true })}
              />
              <Select
                label="Tipo"
                options={TIPO_OPTIONS}
                disabled={!modoEdicion}
                {...form.register('tipo')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Marca"  placeholder="Toyota"   disabled={!modoEdicion} {...form.register('marca')} />
              <Input label="Modelo" placeholder="Hilux SR" disabled={!modoEdicion} {...form.register('modelo')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Año"   type="number" placeholder="2022"  disabled={!modoEdicion} {...form.register('anio')} />
              <Input label="Color" placeholder="Blanco"              disabled={!modoEdicion} {...form.register('color')} />
              <Select label="Estado" options={ESTADO_OPTIONS}        disabled={!modoEdicion} {...form.register('estado')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Chasis (VIN)" placeholder="JT..."  disabled={!modoEdicion} {...form.register('vin')} />
              <Input label="Titular"      placeholder="CADINC SRL" disabled={!modoEdicion} {...form.register('titular')} />
            </div>
            <Input
              label="Km actuales"
              type="number"
              placeholder="0"
              disabled={!modoEdicion}
              {...form.register('km_actuales')}
            />
            <Input
              label="ID MobilQuest (device GPS)"
              placeholder="Dejar vacío si no está vinculado"
              disabled={!modoEdicion}
              hint={vehiculo.mobilquest_ultima_sync_at
                ? `Última sync: ${new Date(vehiculo.mobilquest_ultima_sync_at).toLocaleString('es-AR')}`
                : 'Sin sincronizar todavía'
              }
              {...form.register('mobilquest_device_id')}
            />
            <Input
              label="Observaciones"
              placeholder="Notas..."
              disabled={!modoEdicion}
              {...form.register('obs')}
            />

            <AuditInfo
              createdBy={vehiculo.created_by}
              updatedBy={vehiculo.updated_by}
              createdAt={vehiculo.created_at}
              updatedAt={vehiculo.updated_at}
            />

            {/* Acción peligrosa al pie del tab Datos, en modo edición */}
            {modoEdicion && puedeEliminar && (
              <div className="border-t border-gris pt-3 flex justify-end">
                <button
                  onClick={handleDelete}
                  className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:bg-rojo hover:text-white transition-colors"
                >
                  🗑 Eliminar vehículo
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'papeles' && (
          <FlotaDocumentosSection vehiculoId={vehiculo.id} />
        )}
      </div>
    </Modal>
  )
}
