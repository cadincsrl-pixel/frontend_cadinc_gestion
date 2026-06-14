'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useMateriales, useCreateMaterial, useUpdateMaterial, useDeleteMaterial,
  useMunicipios, useCreateMunicipio, useUpdateMunicipio, useDeleteMunicipio,
} from '../hooks/useAridos'
import type { MaterialArido, MunicipioArido } from '../types'

const schema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido'),
  unidad: z.enum(['m3', 'viaje']),
})
type FormData = z.infer<typeof schema>

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

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
          <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[480px]">
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
              {materiales.map(m => {
                return (
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
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <MunicipiosSection />

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

// ── Municipios y recargos por zona ─────────────────────────────────────
function MunicipiosSection() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: municipios = [] } = useMunicipios()
  const { mutate: crear, isPending: creando } = useCreateMunicipio()
  const { mutate: actualizar } = useUpdateMunicipio()
  const { mutate: borrar } = useDeleteMunicipio()

  const form = useForm<{ nombre: string; recargo_pct: string }>({
    defaultValues: { nombre: '', recargo_pct: '0' },
  })
  const [editando, setEditando] = useState<MunicipioArido | null>(null)
  const formEdit = useForm<{ nombre: string; recargo_pct: string }>()

  function onSubmit(data: { nombre: string; recargo_pct: string }) {
    if (!data.nombre.trim()) { toast('Poné el nombre del municipio', 'err'); return }
    crear({ nombre: data.nombre.trim(), recargo_pct: Number(data.recargo_pct) || 0 }, {
      onSuccess: () => {
        toast('✓ Municipio agregado', 'ok')
        form.reset({ nombre: '', recargo_pct: '0' })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
    })
  }

  function onSubmitEdit(data: { nombre: string; recargo_pct: string }) {
    if (!editando) return
    actualizar({ id: editando.id, dto: { nombre: data.nombre.trim(), recargo_pct: Number(data.recargo_pct) || 0 } }, {
      onSuccess: () => { toast('✓ Municipio actualizado', 'ok'); setEditando(null) },
      onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="px-5 py-4 border-b border-gris">
        <h2 className="font-bold text-azul text-base">🗺 Municipios y recargos por zona</h2>
        <p className="text-xs text-gris-dark mt-0.5">
          Zonas más alejadas pagan un recargo % sobre el precio de lista. Se aplica solo al elegir el municipio en la venta; el precio final siempre se puede pisar con &quot;precio especial&quot;.
        </p>
      </div>

      {puedeCrear && (
        <div className="px-5 py-3 border-b border-gris flex items-end gap-2 flex-wrap">
          <Input label="Municipio" placeholder="Ej: Tafí Viejo" {...form.register('nombre')} />
          <Input label="Recargo %" type="number" step="0.5" placeholder="0" className="w-28" {...form.register('recargo_pct')} />
          <Button variant="primary" size="sm" loading={creando} onClick={form.handleSubmit(onSubmit)}>＋ Agregar</Button>
        </div>
      )}

      {municipios.length === 0 ? (
        <p className="text-center py-6 text-sm text-gris-dark italic">Sin municipios cargados. Las ventas sin municipio usan el precio de lista sin recargo.</p>
      ) : (
        <div className="divide-y divide-gris">
          {municipios.map(m => (
            <div key={m.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <span className="font-bold text-sm text-carbon">{m.nombre}</span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${Number(m.recargo_pct) > 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-gris text-gris-dark'}`}>
                  +{m.recargo_pct}%
                </span>
                {puedeEditar && (
                  <button onClick={() => { formEdit.reset({ nombre: m.nombre, recargo_pct: String(m.recargo_pct) }); setEditando(m) }}
                    className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                )}
                {puedeEliminar && (
                  <button
                    onClick={() => { if (confirm(`¿Eliminar ${m.nombre}?`)) borrar(m.id, { onSuccess: () => toast('✓ Eliminado', 'ok'), onError: (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err') }) }}
                    className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                  >✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="🗺 EDITAR MUNICIPIO"
        width="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" onClick={formEdit.handleSubmit(onSubmitEdit)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Municipio" {...formEdit.register('nombre')} />
          <Input label="Recargo %" type="number" step="0.5" {...formEdit.register('recargo_pct')} />
        </div>
      </Modal>
    </div>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
