'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useCanterasAridos, useCreateCanteraArido, useUpdateCanteraArido, useDeleteCanteraArido,
  useUnidades, useCreateUnidad, useUpdateUnidad, useDeleteUnidad,
} from '../hooks/useAridos'
import type { CanteraArido, UnidadFlota } from '../types'

// Canteras y unidades PROPIAS del negocio de áridos — es otro brazo de
// la empresa, independiente de la flota y las canteras de logística.

interface CanteraForm { nombre: string; direccion: string; localidad: string; obs: string }
interface UnidadForm  { nombre: string; patente: string; chofer: string; obs: string }

const CANTERA_DEFAULTS: CanteraForm = { nombre: '', direccion: '', localidad: '', obs: '' }
const UNIDAD_DEFAULTS: UnidadForm   = { nombre: '', patente: '', chofer: '', obs: '' }

export function FlotaAridosTab() {
  return (
    <>
      <CanterasSection />
      <UnidadesSection />
    </>
  )
}

// ── Canteras ───────────────────────────────────────────────────────────
function CanterasSection() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: canteras = [], isLoading } = useCanterasAridos()
  const { mutate: crear, isPending: creando } = useCreateCanteraArido()
  const { mutate: actualizar, isPending: actualizando } = useUpdateCanteraArido()
  const { mutate: borrar } = useDeleteCanteraArido()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CanteraForm>({ defaultValues: CANTERA_DEFAULTS })

  function abrirNueva() {
    setEditId(null)
    reset(CANTERA_DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(c: CanteraArido) {
    setEditId(c.id)
    reset({ nombre: c.nombre, direccion: c.direccion ?? '', localidad: c.localidad ?? '', obs: c.obs ?? '' })
    setModalOpen(true)
  }

  function onSubmit(data: CanteraForm) {
    const dto = {
      nombre:    data.nombre.trim(),
      direccion: data.direccion.trim() || null,
      localidad: data.localidad.trim() || null,
      obs:       data.obs.trim() || null,
    }
    if (editId == null) {
      crear(dto, {
        onSuccess: () => { toast('✓ Cantera agregada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      actualizar({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Cantera actualizada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function toggleActivo(c: CanteraArido) {
    actualizar({ id: c.id, dto: { activo: !c.activo } }, {
      onSuccess: () => toast(c.activo ? '✓ Cantera desactivada' : '✓ Cantera reactivada', 'ok'),
    })
  }

  function handleEliminar(c: CanteraArido) {
    if (!confirm(`¿Eliminar la cantera "${c.nombre}"? Si tiene movimientos no se va a poder.`)) return
    borrar(c.id, {
      onSuccess: () => toast('✓ Cantera eliminada', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
        <div>
          <h2 className="font-bold text-azul text-base">⛰ Canteras de áridos</h2>
          <p className="text-xs text-gris-dark mt-0.5">Las canteras de este negocio — independientes de las de logística. La dirección se geolocaliza sola al guardar.</p>
        </div>
        {puedeCrear && <Button variant="primary" size="sm" onClick={abrirNueva}>＋ Nueva cantera</Button>}
      </div>

      {isLoading ? (
        <p className="text-center py-6 text-sm text-gris-dark">Cargando...</p>
      ) : canteras.length === 0 ? (
        <p className="text-center py-6 text-sm text-gris-dark italic">Sin canteras cargadas. Los costos de compra (tab Materiales) se cargan sobre estas canteras.</p>
      ) : (
        <div className="divide-y divide-gris">
          {canteras.map(c => (
            <div key={c.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${!c.activo ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <span className="font-bold text-sm text-carbon">{c.nombre}</span>
                <span className="text-xs text-gris-dark ml-2">
                  {[c.direccion, c.localidad].filter(Boolean).join(' · ') || 'Sin dirección'}
                  {c.lat != null && <span className="ml-1 text-verde" title={`Geolocalizada (${c.lat}, ${c.lng})`}>📍</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActivo(c)}
                  disabled={!puedeEditar}
                  className={`text-xs font-bold px-2 py-0.5 rounded ${c.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} ${puedeEditar ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                >
                  {c.activo ? 'ACTIVA' : 'INACTIVA'}
                </button>
                {puedeEditar && <button onClick={() => abrirEditar(c)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>}
                {puedeEliminar && <button onClick={() => handleEliminar(c)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '⛰ NUEVA CANTERA' : '⛰ EDITAR CANTERA'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || actualizando} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nombre" placeholder="Ej: Cantera El Cadillal" error={errors.nombre?.message} {...register('nombre', { required: 'Requerido' })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Dirección" placeholder="Ruta 9 km 1300" {...register('direccion')} />
            <Input label="Localidad" placeholder="El Cadillal, Tucumán" {...register('localidad')} />
          </div>
          <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
          <p className="text-[11px] text-gris-dark">Con dirección cargada se geolocaliza automáticamente (📍) para rutas y tiempos.</p>
        </div>
      </Modal>
    </div>
  )
}

// ── Unidades (camión + chofer, con GPS) ───────────────────────────────
function UnidadesSection() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')
  const { data: unidades = [], isLoading } = useUnidades()
  const { mutate: crear, isPending: creando } = useCreateUnidad()
  const { mutate: actualizar, isPending: actualizando } = useUpdateUnidad()
  const { mutate: borrar } = useDeleteUnidad()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UnidadForm>({ defaultValues: UNIDAD_DEFAULTS })

  function abrirNueva() {
    setEditId(null)
    reset(UNIDAD_DEFAULTS)
    setModalOpen(true)
  }

  function abrirEditar(u: UnidadFlota) {
    setEditId(u.id)
    reset({ nombre: u.nombre, patente: u.patente, chofer: u.chofer ?? '', obs: u.obs ?? '' })
    setModalOpen(true)
  }

  function onSubmit(data: UnidadForm) {
    const dto = {
      nombre:  data.nombre.trim(),
      patente: data.patente.trim(),
      chofer:  data.chofer.trim() || null,
      obs:     data.obs.trim() || null,
    }
    if (editId == null) {
      crear(dto, {
        onSuccess: () => { toast('✓ Unidad agregada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      actualizar({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Unidad actualizada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function toggleActivo(u: UnidadFlota) {
    actualizar({ id: u.id, dto: { activo: !u.activo } }, {
      onSuccess: () => toast(u.activo ? '✓ Unidad desactivada' : '✓ Unidad reactivada', 'ok'),
    })
  }

  function handleEliminar(u: UnidadFlota) {
    if (!confirm(`¿Eliminar la unidad "${u.nombre}" (${u.patente})? Si tiene movimientos no se va a poder.`)) return
    borrar(u.id, {
      onSuccess: () => toast('✓ Unidad eliminada', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
        <div>
          <h2 className="font-bold text-azul text-base">🚚 Unidades</h2>
          <p className="text-xs text-gris-dark mt-0.5">Camión + chofer del negocio de áridos. El GPS se vincula solo por patente (Mobile Quest) la primera vez que consultás &quot;¿dónde está?&quot; desde una venta.</p>
        </div>
        {puedeCrear && <Button variant="primary" size="sm" onClick={abrirNueva}>＋ Nueva unidad</Button>}
      </div>

      {isLoading ? (
        <p className="text-center py-6 text-sm text-gris-dark">Cargando...</p>
      ) : unidades.length === 0 ? (
        <p className="text-center py-6 text-sm text-gris-dark italic">Sin unidades cargadas.</p>
      ) : (
        <div className="divide-y divide-gris">
          {unidades.map(u => (
            <div key={u.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${!u.activo ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <span className="font-bold text-sm text-carbon">{u.nombre}</span>
                <span className="text-xs font-mono text-gris-dark ml-2">{u.patente}</span>
                {u.chofer && <span className="text-xs text-gris-dark ml-2">· {u.chofer}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${u.id_vehiculo_gps ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'}`}
                  title={u.id_vehiculo_gps
                    ? `GPS vinculado${u.gps_ultima_lectura_en ? ` · última lectura ${new Date(u.gps_ultima_lectura_en).toLocaleString('es-AR')}` : ''}`
                    : 'Todavía sin vincular al GPS — se vincula solo en la primera consulta'}
                >
                  🛰 {u.id_vehiculo_gps ? 'GPS' : 'Sin GPS'}
                </span>
                <button
                  onClick={() => toggleActivo(u)}
                  disabled={!puedeEditar}
                  className={`text-xs font-bold px-2 py-0.5 rounded ${u.activo ? 'bg-verde-light text-verde' : 'bg-gris text-gris-dark'} ${puedeEditar ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                >
                  {u.activo ? 'ACTIVA' : 'INACTIVA'}
                </button>
                {puedeEditar && <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>}
                {puedeEliminar && <button onClick={() => handleEliminar(u)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '🚚 NUEVA UNIDAD' : '🚚 EDITAR UNIDAD'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || actualizando} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" placeholder="Ej: Unidad 1 — Volcador" error={errors.nombre?.message} {...register('nombre', { required: 'Requerido' })} />
            <Input label="Patente" placeholder="AA123BB" error={errors.patente?.message} {...register('patente', { required: 'Requerida' })} />
          </div>
          <Input label="Chofer" placeholder="Nombre del chofer habitual" {...register('chofer')} />
          <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
          <p className="text-[11px] text-gris-dark">
            La patente tiene que coincidir con la del equipo GPS (Mobile Quest) para que funcione el seguimiento y el tiempo de llegada.
          </p>
        </div>
      </Modal>
    </div>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
