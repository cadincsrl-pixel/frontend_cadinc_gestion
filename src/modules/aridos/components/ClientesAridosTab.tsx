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
import { toISO } from '@/lib/utils/dates'
import {
  useClientesAridos, useCreateClienteArido, useUpdateClienteArido, useDeleteClienteArido,
  useMateriales, usePreciosCliente, useCreatePrecio, useDeletePrecio,
} from '../hooks/useAridos'
import type { ClienteArido, PrecioCliente } from '../types'

// ── Form de cliente (tipado, sin useForm<any>) ──
const clienteSchema = z.object({
  nombre:    z.string().trim().min(1, 'El nombre es requerido'),
  cuit:      z.string().trim().optional(),
  tel:       z.string().trim().optional(),
  email:     z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  obs:       z.string().trim().optional(),
})
type ClienteForm = z.infer<typeof clienteSchema>

const CLIENTE_DEFAULTS: ClienteForm = {
  nombre: '', cuit: '', tel: '', email: '', direccion: '', obs: '',
}

// ── Form de precio ──
const precioSchema = z.object({
  material_id:   z.string().min(1, 'Elegí un material'),
  precio:        z.string().min(1, 'Precio requerido'),
  vigente_desde: z.string().min(1, 'Fecha requerida'),
})
type PrecioForm = z.infer<typeof precioSchema>

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function ClientesAridosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: clientes = [], isLoading, isError, refetch } = useClientesAridos()
  const { data: materiales = [] } = useMateriales()
  const { data: precios = [] } = usePreciosCliente()
  const { mutate: create, isPending: creating } = useCreateClienteArido()
  const { mutate: update, isPending: updating } = useUpdateClienteArido()
  const { mutate: remove, isPending: removing } = useDeleteClienteArido()
  const { mutate: crearPrecio, isPending: creandoPrecio } = useCreatePrecio()
  const { mutate: borrarPrecio } = useDeletePrecio()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [preciosDe, setPreciosDe] = useState<ClienteArido | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    defaultValues: CLIENTE_DEFAULTS,
  })

  const formPrecio = useForm<PrecioForm>({
    resolver: zodResolver(precioSchema),
    defaultValues: { material_id: '', precio: '', vigente_desde: toISO(new Date()) },
  })

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.cuit ?? '').toLowerCase().includes(q) ||
      (c.tel ?? '').toLowerCase().includes(q),
    )
  }, [clientes, busqueda])

  // Cantidad de materiales con precio vigente cargado, por cliente
  const preciosPorCliente = useMemo(() => {
    const m = new Map<number, Set<number>>()
    for (const p of precios) {
      if (!m.has(p.cliente_id)) m.set(p.cliente_id, new Set())
      m.get(p.cliente_id)!.add(p.material_id)
    }
    return m
  }, [precios])

  function abrirNuevo() {
    setEditId(null)
    reset(CLIENTE_DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(c: ClienteArido) {
    setEditId(c.id)
    reset({
      nombre:    c.nombre,
      cuit:      c.cuit ?? '',
      tel:       c.tel ?? '',
      email:     c.email ?? '',
      direccion: c.direccion ?? '',
      obs:       c.obs ?? '',
    })
    setModalOpen(true)
  }

  function onSubmit(data: ClienteForm) {
    const dto: Partial<ClienteArido> = {
      nombre:    data.nombre.trim(),
      cuit:      data.cuit?.trim() || null,
      tel:       data.tel?.trim() || null,
      email:     data.email?.trim() || null,
      direccion: data.direccion?.trim() || null,
      obs:       data.obs?.trim() || null,
    }
    if (editId == null) {
      create(dto, {
        onSuccess: () => { toast('✓ Cliente agregado', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear el cliente'), 'err'),
      })
    } else {
      update({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Cliente actualizado', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function handleEliminar(c: ClienteArido) {
    if (!confirm(`¿Eliminar el cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return
    remove(c.id, {
      onSuccess: () => toast('✓ Cliente eliminado', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar (¿tiene ventas o cobros?)'), 'err'),
    })
  }

  function abrirPrecios(c: ClienteArido) {
    formPrecio.reset({ material_id: '', precio: '', vigente_desde: toISO(new Date()) })
    setPreciosDe(c)
  }

  function onSubmitPrecio(data: PrecioForm) {
    if (!preciosDe) return
    crearPrecio({
      cliente_id:    preciosDe.id,
      material_id:   Number(data.material_id),
      precio:        Number(data.precio),
      vigente_desde: data.vigente_desde,
    }, {
      onSuccess: () => {
        toast('✓ Precio guardado', 'ok')
        formPrecio.reset({ material_id: '', precio: '', vigente_desde: toISO(new Date()) })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'Error al guardar el precio'), 'err'),
    })
  }

  // Precios del cliente abierto, agrupados por material (vigente primero)
  const preciosDelCliente = useMemo(() => {
    if (!preciosDe) return []
    const propios = precios.filter(p => p.cliente_id === preciosDe.id)
    return materiales
      .filter(m => m.activo)
      .map(mat => ({
        material: mat,
        historial: propios
          .filter(p => p.material_id === mat.id)
          .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
      }))
  }, [preciosDe, precios, materiales])

  const materialOptions = [
    { value: '', label: 'Seleccionar material…' },
    ...materiales.filter(m => m.activo).map(m => ({ value: m.id, label: `${m.nombre} ($/${m.unidad === 'm3' ? 'm³' : 'viaje'})` })),
  ]

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por nombre, CUIT o teléfono..."
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

      {/* Contenido */}
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
          {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay clientes cargados todavía. Las obras propias también se cargan acá como clientes.'}
        </div>
      ) : (
        <>
          {/* Tabla — desktop */}
          <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[680px]">
                <thead>
                  <tr>
                    {['Nombre', 'CUIT', 'Teléfono', 'Precios', ''].map((h, i) => (
                      <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(c => {
                    const nPrecios = preciosPorCliente.get(c.id)?.size ?? 0
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                        onClick={() => abrirEditar(c)}
                      >
                        <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
                        <td className="px-4 py-3 text-xs text-gris-dark font-mono">{c.cuit || '—'}</td>
                        <td className="px-4 py-3 text-sm text-carbon">{c.tel || '—'}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => abrirPrecios(c)}
                            className={`text-xs font-bold px-2 py-1 rounded transition-colors ${nPrecios > 0 ? 'bg-verde-light text-verde hover:opacity-80' : 'bg-amarillo-light text-[#7A5500] hover:opacity-80'}`}
                            title="Ver/cargar precios del cliente"
                          >
                            💲 {nPrecios > 0 ? `${nPrecios} material${nPrecios !== 1 ? 'es' : ''}` : 'Sin precios'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(c)}>✎ Editar</Button>
                          <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(c)}>🗑</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden flex flex-col gap-2">
            {filtrados.map(c => {
              const nPrecios = preciosPorCliente.get(c.id)?.size ?? 0
              return (
                <div key={c.id} className="bg-white rounded-card shadow-card p-3">
                  <div className="font-bold text-sm text-carbon truncate">{c.nombre}</div>
                  <div className="text-xs text-gris-dark mt-0.5">
                    {c.cuit && <span className="font-mono">{c.cuit}</span>}
                    {c.cuit && c.tel && <span> · </span>}
                    {c.tel}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <button
                      onClick={() => abrirPrecios(c)}
                      className={`text-xs font-bold px-2 py-1 rounded ${nPrecios > 0 ? 'bg-verde-light text-verde' : 'bg-amarillo-light text-[#7A5500]'}`}
                    >
                      💲 {nPrecios > 0 ? `${nPrecios} material${nPrecios !== 1 ? 'es' : ''}` : 'Sin precios'}
                    </button>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(c)}>✎</Button>
                      <Button variant="ghost" size="sm" disabled={!puedeEliminar || removing} onClick={() => handleEliminar(c)}>🗑</Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal nuevo/editar cliente */}
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
          <Input label="Nombre" placeholder="Ej: Corralón San Martín / CADINC — Obra X" error={errors.nombre?.message} {...register('nombre')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="CUIT" placeholder="Opcional" {...register('cuit')} />
            <Input label="Teléfono" placeholder="Opcional" {...register('tel')} />
            <Input label="Email" type="email" placeholder="Opcional" {...register('email')} />
            <Input label="Dirección" placeholder="Opcional" {...register('direccion')} />
          </div>
          <Input label="Observaciones" placeholder="Notas adicionales" {...register('obs')} />
        </div>
      </Modal>

      {/* Modal precios del cliente */}
      <Modal
        open={!!preciosDe}
        onClose={() => setPreciosDe(null)}
        title={`💲 PRECIOS — ${preciosDe?.nombre ?? ''}`}
        width="max-w-2xl"
        footer={<Button variant="secondary" onClick={() => setPreciosDe(null)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-4">
          {/* Alta de precio */}
          {puedeCrear && (
            <div className="bg-gris/30 rounded-card p-3">
              <p className="text-xs font-bold text-gris-dark uppercase mb-2">Nuevo precio</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div className="sm:col-span-2">
                  <Select label="Material" options={materialOptions} error={formPrecio.formState.errors.material_id?.message} {...formPrecio.register('material_id')} />
                </div>
                <Input label="Precio" type="number" step="0.01" placeholder="0.00" error={formPrecio.formState.errors.precio?.message} {...formPrecio.register('precio')} />
                <Input label="Vigente desde" type="date" {...formPrecio.register('vigente_desde')} />
              </div>
              <div className="flex justify-end mt-2">
                <Button variant="primary" size="sm" loading={creandoPrecio} onClick={formPrecio.handleSubmit(onSubmitPrecio)}>
                  ✓ Agregar
                </Button>
              </div>
              <p className="text-[11px] text-gris-dark mt-2">
                Cada venta usa el precio vigente a su fecha. Para actualizar un precio, agregá uno nuevo con la fecha desde la que rige — el historial se conserva.
              </p>
            </div>
          )}

          {/* Lista por material */}
          {preciosDelCliente.every(g => g.historial.length === 0) ? (
            <p className="text-center text-sm text-gris-dark italic py-4">
              Sin precios cargados. El escombro se cotiza al momento del retiro; el resto conviene precargarlo acá.
            </p>
          ) : (
            <div className="divide-y divide-gris">
              {preciosDelCliente.filter(g => g.historial.length > 0).map(({ material, historial }) => {
                const vigente = historial[0]!
                const pasadas = historial.slice(1)
                return (
                  <div key={material.id} className="py-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-sm text-carbon">
                        {material.nombre}
                        <span className="text-xs text-gris-dark font-normal ml-1">$/{material.unidad === 'm3' ? 'm³' : 'viaje'}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="font-mono font-bold text-verde">{fmt(Number(vigente.precio))}</span>
                          <span className="text-[11px] text-gris-dark ml-2">desde {fmtDate(vigente.vigente_desde)}</span>
                        </div>
                        {puedeEliminar && (
                          <button
                            onClick={() => { if (confirm(`¿Eliminar precio de ${material.nombre}?`)) borrarPrecio(vigente.id, { onSuccess: () => toast('✓ Eliminado', 'ok') }) }}
                            className="text-xs px-1.5 py-0.5 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                          >✕</button>
                        )}
                      </div>
                    </div>
                    {pasadas.length > 0 && (
                      <div className="pl-3 border-l-2 border-gris flex flex-col gap-0.5">
                        {pasadas.map((p: PrecioCliente) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-gris-dark">
                            <span>desde {fmtDate(p.vigente_desde)}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{fmt(Number(p.precio))}</span>
                              {puedeEliminar && (
                                <button
                                  onClick={() => { if (confirm('¿Eliminar este precio histórico?')) borrarPrecio(p.id, { onSuccess: () => toast('✓ Eliminado', 'ok') }) }}
                                  className="hover:text-rojo"
                                >✕</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
