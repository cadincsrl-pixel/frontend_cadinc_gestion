'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFlotaTiposServicio,
  useCreateFlotaTipo,
  useUpdateFlotaTipo,
  useDeleteFlotaTipo,
} from '../hooks/useFlotaServicios'
import type { FlotaTipoServicio } from '@/types/domain.types'

interface FormData {
  nombre:          string
  intervalo_km:    string
  intervalo_meses: string
  activo:          boolean
}

export function ParametrosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('flota')
  const { data: tipos = [], isLoading } = useFlotaTiposServicio()
  const { mutate: create, isPending: creating } = useCreateFlotaTipo()
  const { mutate: update, isPending: updating } = useUpdateFlotaTipo()
  const { mutate: remove } = useDeleteFlotaTipo()

  const [editando, setEditando] = useState<FlotaTipoServicio | null>(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const form = useForm<FormData>()

  function abrirNuevo() {
    form.reset({ nombre: '', intervalo_km: '', intervalo_meses: '', activo: true })
    setEditando(null)
    setModalNuevo(true)
  }

  function abrirEdit(t: FlotaTipoServicio) {
    form.reset({
      nombre:          t.nombre,
      intervalo_km:    t.intervalo_km != null ? String(t.intervalo_km) : '',
      intervalo_meses: t.intervalo_meses != null ? String(t.intervalo_meses) : '',
      activo:          t.activo,
    })
    setEditando(t)
    setModalNuevo(true)
  }

  function handleSubmit(data: FormData) {
    const dto = {
      nombre:          data.nombre.trim(),
      intervalo_km:    data.intervalo_km    ? Number(data.intervalo_km)    : null,
      intervalo_meses: data.intervalo_meses ? Number(data.intervalo_meses) : null,
      activo:          data.activo,
    }
    if (editando) {
      update({ id: editando.id, dto }, {
        onSuccess: () => { toast('✓ Tipo actualizado', 'ok'); setModalNuevo(false) },
        onError:   () => toast('Error al actualizar', 'err'),
      })
    } else {
      create(dto, {
        onSuccess: () => { toast('✓ Tipo agregado', 'ok'); setModalNuevo(false) },
        onError:   (err: any) => {
          const msg = err?.message ?? 'Error al agregar'
          toast(msg.includes('unique') ? 'Ya existe un tipo con ese nombre' : msg, 'err')
        },
      })
    }
  }

  function handleDelete(t: FlotaTipoServicio) {
    if (!confirm(`¿Eliminar "${t.nombre}"? Si está usado en algún service quedará desreferenciado.`)) return
    remove(t.id, {
      onSuccess: () => toast('✓ Tipo eliminado', 'ok'),
      onError:   (err: any) => toast(err?.message ?? 'Error al eliminar', 'err'),
    })
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="px-4 py-3 border-b border-gris flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-azul text-base">Tipos de servicio</h2>
            <p className="text-[11px] text-gris-dark mt-0.5">
              Catálogo con intervalos default por km o por tiempo. Se usa al
              registrar un service para sugerir el próximo.
            </p>
          </div>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={abrirNuevo}>＋ Nuevo tipo</Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                {['Nombre', 'Intervalo km', 'Intervalo meses', 'Activo', ''].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gris-dark text-sm italic">Cargando...</td></tr>
              ) : tipos.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gris-dark text-sm italic">Sin tipos registrados.</td></tr>
              ) : tipos.map(t => (
                <tr key={t.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-sm text-carbon">{t.nombre}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.intervalo_km != null ? `${t.intervalo_km.toLocaleString('es-AR')} km` : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.intervalo_meses != null ? `${t.intervalo_meses} meses` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${t.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}>
                      {t.activo ? '✓ Activo' : '✕ Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 flex gap-1 justify-end">
                    {puedeEditar && (
                      <button
                        onClick={() => abrirEdit(t)}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                        title="Editar"
                      >
                        ✏️
                      </button>
                    )}
                    {puedeEliminar && (
                      <button
                        onClick={() => handleDelete(t)}
                        className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title={editando ? '✏️ EDITAR TIPO' : '🔧 NUEVO TIPO DE SERVICIO'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating || updating} onClick={form.handleSubmit(handleSubmit)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Nombre"
            placeholder="Cambio de aceite"
            {...form.register('nombre', { required: true })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Intervalo (km)"
              type="number"
              placeholder="10000"
              hint="Dejar vacío si no aplica"
              {...form.register('intervalo_km')}
            />
            <Input
              label="Intervalo (meses)"
              type="number"
              placeholder="6"
              hint="Dejar vacío si no aplica"
              {...form.register('intervalo_meses')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...form.register('activo')}
              className="accent-naranja"
            />
            Tipo activo (visible al registrar un service)
          </label>
        </div>
      </Modal>
    </>
  )
}
