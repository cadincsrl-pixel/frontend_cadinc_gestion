'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useClientes,
  useCreateCliente,
  useUpdateCliente,
  useDeleteCliente,
} from '../hooks/useAlquiler'
import type { Cliente } from '../types'

// ── Form tipado (sin useForm<any>) ──
const schema = z.object({
  nombre:   z.string().trim().min(1, 'El nombre es requerido'),
  cuit:     z.string().trim().optional(),
  contacto: z.string().trim().optional(),
  tel:      z.string().trim().optional(),
  email:    z.string().trim().optional(),
  obs:      z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  nombre: '', cuit: '', contacto: '', tel: '', email: '', obs: '',
}

export function ClientesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('alquiler')
  const { data: clientes = [], isLoading, isError, refetch } = useClientes()
  const { mutate: create, isPending: creating } = useCreateCliente()
  const { mutate: update, isPending: updating } = useUpdateCliente()
  const { mutate: remove, isPending: removing } = useDeleteCliente()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.cuit ?? '').toLowerCase().includes(q) ||
      (c.contacto ?? '').toLowerCase().includes(q),
    )
  }, [clientes, busqueda])

  function abrirNuevo() {
    setEditId(null)
    reset(DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(c: Cliente) {
    setEditId(c.id)
    reset({
      nombre:   c.nombre,
      cuit:     c.cuit ?? '',
      contacto: c.contacto ?? '',
      tel:      c.tel ?? '',
      email:    c.email ?? '',
      obs:      c.obs ?? '',
    })
    setModalOpen(true)
  }

  function onSubmit(data: FormData) {
    const dto: Partial<Cliente> = {
      nombre:   data.nombre.trim(),
      cuit:     data.cuit?.trim() || null,
      contacto: data.contacto?.trim() || null,
      tel:      data.tel?.trim() || null,
      email:    data.email?.trim() || null,
      obs:      data.obs?.trim() || null,
    }
    if (editId == null) {
      create(dto, {
        onSuccess: () => {
          toast('✓ Cliente agregado', 'ok')
          setModalOpen(false)
        },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al crear el cliente'), 'err'),
      })
    } else {
      update({ id: editId, dto }, {
        onSuccess: () => {
          toast('✓ Cliente actualizado', 'ok')
          setModalOpen(false)
        },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function handleEliminar(c: Cliente) {
    if (!confirm(`¿Eliminar el cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return
    remove(c.id, {
      onSuccess: () => toast('✓ Cliente eliminado', 'ok'),
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar (¿tiene obras asociadas?)'), 'err'),
    })
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por nombre, CUIT o contacto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-80"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>✕ Limpiar</Button>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={abrirNuevo}>
          ＋ Nuevo cliente
        </Button>
      </div>

      {/* Contenido: loading / error / vacío / data */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
            Cargando clientes...
          </span>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm">
          No se pudieron cargar los clientes.
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay clientes cargados todavía.'}
        </div>
      ) : (
        <>
          {/* Tabla — desktop/tablet */}
          <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr>
                    {['Nombre', 'CUIT', 'Contacto / Tel', ''].map((h, i) => (
                      <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(c => (
                    <tr
                      key={c.id}
                      className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                      onClick={() => abrirEditar(c)}
                    >
                      <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
                      <td className="px-4 py-3 text-xs text-gris-dark font-mono">{c.cuit || '—'}</td>
                      <td className="px-4 py-3 text-sm text-carbon">
                        {c.contacto || c.tel ? (
                          <span>
                            {c.contacto || '—'}
                            {c.tel && <span className="text-xs text-gris-dark"> · {c.tel}</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(c)}>✎ Editar</Button>
                        <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(c)}>🗑</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden flex flex-col gap-2">
            {filtrados.map(c => (
              <div key={c.id} className="bg-white rounded-card shadow-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{c.nombre}</div>
                    <div className="text-xs text-gris-dark mt-0.5">
                      {c.cuit && <span className="font-mono">{c.cuit}</span>}
                      {c.cuit && (c.contacto || c.tel) && <span> · </span>}
                      {c.contacto}
                      {c.contacto && c.tel && <span> · </span>}
                      {c.tel}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-2">
                  <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(c)}>✎ Editar</Button>
                  <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(c)}>🗑</Button>
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
        title={editId == null ? '🧑‍💼 NUEVO CLIENTE' : '🧑‍💼 EDITAR CLIENTE'}
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
          <Input label="Nombre" placeholder="Ej: Constructora XYZ S.A." error={errors.nombre?.message} {...register('nombre')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="CUIT" placeholder="Opcional" {...register('cuit')} />
            <Input label="Contacto" placeholder="Persona de contacto" {...register('contacto')} />
            <Input label="Teléfono" placeholder="Opcional" {...register('tel')} />
            <Input label="Email" type="email" placeholder="Opcional" {...register('email')} />
          </div>
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
