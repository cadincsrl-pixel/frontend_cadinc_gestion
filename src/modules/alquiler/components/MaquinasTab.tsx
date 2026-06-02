'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useMaquinas,
  useCreateMaquina,
  useUpdateMaquina,
  useDeleteMaquina,
} from '../hooks/useAlquiler'
import {
  MAQUINA_TIPO_LABEL,
  MAQUINA_TIPO_OPTIONS,
  MAQUINA_ESTADO_OPTIONS,
  type Maquina,
  type MaquinaTipo,
  type MaquinaEstado,
} from '../types'

// ── Form tipado (sin useForm<any>) ──
const schema = z.object({
  nombre:         z.string().trim().min(1, 'El nombre es requerido'),
  tipo:           z.enum(['hidrogrua', 'retropala', 'minicargadora', 'trailer_canasta', 'otro']),
  identificacion: z.string().trim().optional(),
  estado:         z.enum(['activa', 'mantenimiento', 'inactiva']),
  obs:            z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  nombre:         '',
  tipo:           'hidrogrua',
  identificacion: '',
  estado:         'activa',
  obs:            '',
}

function estadoBadgeVariant(e: MaquinaEstado): 'activo' | 'pendiente' | 'inactivo' {
  return e === 'activa' ? 'activo' : e === 'mantenimiento' ? 'pendiente' : 'inactivo'
}
function estadoBadgeLabel(e: MaquinaEstado): string {
  return e === 'activa' ? 'Activa' : e === 'mantenimiento' ? 'Mantenimiento' : 'Inactiva'
}

export function MaquinasTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('alquiler')
  const { data: maquinas = [], isLoading, isError, refetch } = useMaquinas()
  const { mutate: create, isPending: creating } = useCreateMaquina()
  const { mutate: update, isPending: updating } = useUpdateMaquina()
  const { mutate: remove, isPending: removing } = useDeleteMaquina()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return maquinas
    return maquinas.filter(m =>
      m.nombre.toLowerCase().includes(q) ||
      (m.identificacion ?? '').toLowerCase().includes(q) ||
      MAQUINA_TIPO_LABEL[m.tipo].toLowerCase().includes(q),
    )
  }, [maquinas, busqueda])

  function abrirNuevo() {
    setEditId(null)
    reset(DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(m: Maquina) {
    setEditId(m.id)
    reset({
      nombre:         m.nombre,
      tipo:           m.tipo,
      identificacion: m.identificacion ?? '',
      estado:         m.estado,
      obs:            m.obs ?? '',
    })
    setModalOpen(true)
  }

  function onSubmit(data: FormData) {
    const dto: Partial<Maquina> = {
      nombre:         data.nombre.trim(),
      tipo:           data.tipo as MaquinaTipo,
      identificacion: data.identificacion?.trim() || null,
      estado:         data.estado as MaquinaEstado,
      obs:            data.obs?.trim() || null,
    }
    if (editId == null) {
      create(dto, {
        onSuccess: () => {
          toast('✓ Máquina agregada', 'ok')
          setModalOpen(false)
        },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al crear la máquina'), 'err'),
      })
    } else {
      update({ id: editId, dto }, {
        onSuccess: () => {
          toast('✓ Máquina actualizada', 'ok')
          setModalOpen(false)
        },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function handleEliminar(m: Maquina) {
    if (!confirm(`¿Eliminar la máquina "${m.nombre}"? Esta acción no se puede deshacer.`)) return
    remove(m.id, {
      onSuccess: () => toast('✓ Máquina eliminada', 'ok'),
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar (¿tiene partes cargados?)'), 'err'),
    })
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por nombre, tipo o identificación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-80"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>✕ Limpiar</Button>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={abrirNuevo}>
          ＋ Nueva máquina
        </Button>
      </div>

      {/* Contenido: loading / error / vacío / data */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
            Cargando máquinas...
          </span>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm">
          No se pudieron cargar las máquinas.
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
          </div>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay máquinas cargadas todavía.'}
        </div>
      ) : (
        <>
          {/* Tabla — desktop/tablet */}
          <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr>
                    {['Nombre', 'Tipo', 'Identificación', 'Estado', ''].map((h, i) => (
                      <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(m => (
                    <tr
                      key={m.id}
                      className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                      onClick={() => abrirEditar(m)}
                    >
                      <td className="px-4 py-3 font-bold text-sm text-carbon">{m.nombre}</td>
                      <td className="px-4 py-3 text-sm text-carbon">{MAQUINA_TIPO_LABEL[m.tipo]}</td>
                      <td className="px-4 py-3 text-xs text-gris-dark font-mono">{m.identificacion || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={estadoBadgeVariant(m.estado)} label={estadoBadgeLabel(m.estado)} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(m)}>✎ Editar</Button>
                        <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(m)}>🗑</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden flex flex-col gap-2">
            {filtradas.map(m => (
              <div key={m.id} className="bg-white rounded-card shadow-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{m.nombre}</div>
                    <div className="text-xs text-gris-dark mt-0.5">
                      {MAQUINA_TIPO_LABEL[m.tipo]}
                      {m.identificacion && <span className="font-mono"> · {m.identificacion}</span>}
                    </div>
                  </div>
                  <Badge variant={estadoBadgeVariant(m.estado)} label={estadoBadgeLabel(m.estado)} />
                </div>
                <div className="flex justify-end gap-1 mt-2">
                  <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(m)}>✎ Editar</Button>
                  <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(m)}>🗑</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal nuevo/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '🚜 NUEVA MÁQUINA' : '🚜 EDITAR MÁQUINA'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creating || updating}
              disabled={editId == null ? !puedeCrear : !puedeEditar}
              onClick={handleSubmit(onSubmit)}
            >
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nombre" placeholder="Ej: Hidrogrúa Palfinger" error={errors.nombre?.message} {...register('nombre')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Tipo" options={MAQUINA_TIPO_OPTIONS} error={errors.tipo?.message} {...register('tipo')} />
            <Select label="Estado" options={MAQUINA_ESTADO_OPTIONS} error={errors.estado?.message} {...register('estado')} />
          </div>
          <Input
            label="Identificación (patente / nº interno)"
            placeholder="Opcional"
            {...register('identificacion')}
          />
          <Input label="Observaciones" placeholder="Notas adicionales" {...register('obs')} />
        </div>
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
