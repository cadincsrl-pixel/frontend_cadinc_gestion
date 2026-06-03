'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useObrasAlquiler,
  useCreateObraAlquiler,
  usePerfilesLista,
  useClientes,
} from '../hooks/useAlquiler'
import { ObraDetalleModal } from './ObraDetalleModal'
import {
  OBRA_ESTADO_OPTIONS,
  type ObraAlquiler,
  type ObraAlquilerEstado,
} from '../types'

const schema = z.object({
  nombre:       z.string().trim().min(1, 'El nombre es requerido'),
  ubicacion:    z.string().trim().optional(),
  descripcion:  z.string().trim().optional(),
  estado:       z.enum(['activa', 'cerrada']),
  fecha_inicio: z.string().optional(),
  obs:          z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  nombre: '', ubicacion: '', descripcion: '',
  estado: 'activa', fecha_inicio: '', obs: '',
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  return iso.split('-').reverse().join('/')
}

export function ObrasTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('alquiler')
  const { data: obras = [], isLoading, isError, refetch } = useObrasAlquiler()
  const { data: perfiles = [] } = usePerfilesLista()
  const { data: clientes = [] } = useClientes()
  const { mutate: create, isPending: creating } = useCreateObraAlquiler()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [jefeUserId, setJefeUserId] = useState('')
  const [clienteId, setClienteId] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  const nombreJefe = useMemo(() => {
    const m = new Map<string, string>()
    perfiles.forEach(p => m.set(p.id, p.nombre))
    return m
  }, [perfiles])

  // Mapa cliente_id → nombre para resolver la ficha en la tabla/cards.
  const nombreCliente = useMemo(() => {
    const m = new Map<number, string>()
    clientes.forEach(c => m.set(c.id, c.nombre))
    return m
  }, [clientes])

  // Resuelve el cliente a mostrar para una obra: ficha (cliente_id) primero,
  // texto libre legacy como fallback.
  function clienteDeObra(o: ObraAlquiler): string | null {
    if (o.cliente_id != null) return nombreCliente.get(o.cliente_id) ?? null
    return o.cliente || null
  }

  const opcionesJefe = useMemo(
    () => [
      { value: '', label: '— sin jefe de obra —' },
      ...perfiles.map(p => ({ value: p.id, label: p.nombre })),
    ],
    [perfiles],
  )

  const opcionesCliente = useMemo(
    () => [
      { value: '', label: '— sin cliente —' },
      ...clientes.map(c => ({ value: String(c.id), label: c.nombre })),
    ],
    [clientes],
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return obras
    return obras.filter(o =>
      o.nombre.toLowerCase().includes(q) ||
      (clienteDeObra(o) ?? '').toLowerCase().includes(q) ||
      (o.ubicacion ?? '').toLowerCase().includes(q),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, busqueda, nombreCliente])

  const detalle = useMemo(() => obras.find(o => o.id === detalleId) ?? null, [obras, detalleId])

  function abrirNuevo() {
    reset(DEFAULTS)
    setJefeUserId('')
    setClienteId('')
    setModalNuevo(true)
  }

  function onSubmit(data: FormData) {
    const dto: Partial<ObraAlquiler> = {
      nombre:            data.nombre.trim(),
      cliente_id:        clienteId ? Number(clienteId) : null,
      ubicacion:         data.ubicacion?.trim() || null,
      descripcion:       data.descripcion?.trim() || null,
      jefe_obra_user_id: jefeUserId || null,
      estado:            data.estado as ObraAlquilerEstado,
      fecha_inicio:      data.fecha_inicio || null,
      obs:               data.obs?.trim() || null,
    }
    create(dto, {
      onSuccess: (creada) => {
        toast('✓ Obra creada', 'ok')
        setModalNuevo(false)
        // Abrir directo el detalle para asignar máquinas.
        if (creada?.id) setDetalleId(creada.id)
      },
      onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al crear la obra', 'err'),
    })
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por nombre, cliente o ubicación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-80"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>✕ Limpiar</Button>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={abrirNuevo}>
          ＋ Nueva obra
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
            Cargando obras...
          </span>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm">
          No se pudieron cargar las obras.
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
          </div>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay obras de alquiler cargadas todavía.'}
        </div>
      ) : (
        <>
          {/* Tabla — desktop/tablet */}
          <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[760px]">
                <thead>
                  <tr>
                    {['Obra', 'Cliente', 'Ubicación', 'Jefe de obra', 'Inicio', 'Estado'].map(h => (
                      <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(o => (
                    <tr
                      key={o.id}
                      className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                      onClick={() => setDetalleId(o.id)}
                    >
                      <td className="px-4 py-3 font-bold text-sm text-carbon">{o.nombre}</td>
                      <td className="px-4 py-3 text-sm text-carbon">{clienteDeObra(o) || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gris-dark">{o.ubicacion || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gris-dark">
                        {o.jefe_obra_user_id ? (nombreJefe.get(o.jefe_obra_user_id) ?? '—') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gris-dark font-mono">{fmtFecha(o.fecha_inicio)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={o.estado === 'activa' ? 'activo' : 'inactivo'}
                          label={o.estado === 'activa' ? 'Activa' : 'Cerrada'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden flex flex-col gap-2">
            {filtradas.map(o => (
              <button
                key={o.id}
                onClick={() => setDetalleId(o.id)}
                className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{o.nombre}</div>
                    <div className="text-xs text-gris-dark mt-0.5">
                      {clienteDeObra(o) || 'Sin cliente'}
                      {o.ubicacion && <span> · {o.ubicacion}</span>}
                    </div>
                  </div>
                  <Badge
                    variant={o.estado === 'activa' ? 'activo' : 'inactivo'}
                    label={o.estado === 'activa' ? 'Activa' : 'Cerrada'}
                  />
                </div>
                <div className="text-[11px] text-gris-dark mt-2 flex flex-wrap gap-x-3">
                  {o.jefe_obra_user_id && <span>👷 {nombreJefe.get(o.jefe_obra_user_id) ?? '—'}</span>}
                  {o.fecha_inicio && <span className="font-mono">📅 {fmtFecha(o.fecha_inicio)}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Modal nueva obra */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🏗 NUEVA OBRA DE ALQUILER"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} disabled={!puedeCrear} onClick={handleSubmit(onSubmit)}>
              ✓ Crear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" placeholder="Ej: San Pablo" error={errors.nombre?.message} {...register('nombre')} />
            <Combobox
              label="Cliente"
              placeholder="Buscar cliente..."
              options={opcionesCliente}
              value={clienteId}
              onChange={setClienteId}
            />
            <Input label="Ubicación" placeholder="Dirección o zona" {...register('ubicacion')} />
            <Input label="Fecha de inicio" type="date" {...register('fecha_inicio')} />
            <Select label="Estado" options={OBRA_ESTADO_OPTIONS} {...register('estado')} />
            <Combobox
              label="Jefe de obra"
              placeholder="Buscar usuario..."
              options={opcionesJefe}
              value={jefeUserId}
              onChange={setJefeUserId}
            />
          </div>
          <Input label="Descripción" placeholder="Detalle de la obra" {...register('descripcion')} />
          <Input label="Observaciones" {...register('obs')} />
          <p className="text-[11px] text-gris-dark italic">
            Los clientes se cargan en el tab «Clientes». Después de crear la obra
            vas a poder asignarle máquinas y un maquinista a cada una.
          </p>
        </div>
      </Modal>

      {/* Modal detalle */}
      <ObraDetalleModal
        obra={detalle}
        onClose={() => setDetalleId(null)}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
      />
    </>
  )
}
