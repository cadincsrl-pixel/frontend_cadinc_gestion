'use client'

import { useState } from 'react'
import {
  useCanteras, useDepositos, useRutas,
} from '../hooks/useLogistica'
import { apiPost, apiPatch, apiDelete } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { LOG_KEYS } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { useGeocode } from '../hooks/useEnRuta'
import type { Cantera, Deposito } from '@/types/domain.types'

export function LugaresTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()

  const [modalCantera,  setModalCantera]  = useState(false)
  const [modalDeposito, setModalDeposito] = useState(false)
  const [modalRuta,     setModalRuta]     = useState(false)
  const [editCantera,   setEditCantera]   = useState<Cantera | null>(null)
  const [editDeposito,  setEditDeposito]  = useState<Deposito | null>(null)
  const [editRuta,      setEditRuta]      = useState<{ id: number; cantera: string; deposito: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const formCantera    = useForm<any>()
  const formDeposito   = useForm<any>()
  const formRuta       = useForm<any>()
  const formEditCant   = useForm<any>()
  const formEditDep    = useForm<any>()
  const formEditRuta   = useForm<any>()

  async function handleCreateCantera(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/canteras', data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.canteras })
      toast('✓ Cantera agregada', 'ok')
      setModalCantera(false)
      formCantera.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  async function handleUpdateCantera(data: any) {
    if (!editCantera) return
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/canteras/${editCantera.id}`, data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.canteras })
      toast('✓ Cantera actualizada', 'ok')
      setEditCantera(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  async function handleCreateDeposito(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/depositos', data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.depositos })
      toast('✓ Depósito agregado', 'ok')
      setModalDeposito(false)
      formDeposito.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  async function handleUpdateDeposito(data: any) {
    if (!editDeposito) return
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/depositos/${editDeposito.id}`, data)
      qc.invalidateQueries({ queryKey: LOG_KEYS.depositos })
      toast('✓ Depósito actualizado', 'ok')
      setEditDeposito(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  async function handleCreateRuta(data: any) {
    setLoading(true)
    try {
      await apiPost('/api/logistica/lugares/rutas', {
        cantera_id:    Number(data.cantera_id),
        deposito_id:   Number(data.deposito_id),
        km_ida_vuelta: Number(data.km_ida_vuelta),
        obs: data.obs,
      })
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta agregada', 'ok')
      setModalRuta(false)
      formRuta.reset()
    } catch { toast('Error al agregar', 'err') }
    setLoading(false)
  }

  async function handleDeleteRuta(id: number) {
    if (!confirm('¿Eliminar esta ruta?')) return
    try {
      await apiDelete(`/api/logistica/lugares/rutas/${id}`)
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta eliminada', 'ok')
    } catch { toast('Error al eliminar', 'err') }
  }

  async function handleUpdateRuta(data: any) {
    if (!editRuta) return
    setLoading(true)
    try {
      await apiPatch(`/api/logistica/lugares/rutas/${editRuta.id}`, {
        km_ida_vuelta: Number(data.km_ida_vuelta),
        obs: data.obs ?? '',
      })
      qc.invalidateQueries({ queryKey: LOG_KEYS.rutas })
      toast('✓ Ruta actualizada', 'ok')
      setEditRuta(null)
    } catch { toast('Error al actualizar', 'err') }
    setLoading(false)
  }

  function openEditRuta(r: any) {
    formEditRuta.reset({
      km_ida_vuelta: r.km_ida_vuelta ?? '',
      obs:           r.obs ?? '',
    })
    setEditRuta({
      id:       r.id,
      cantera:  r.canteras?.nombre ?? `Cantera #${r.cantera_id}`,
      deposito: r.depositos?.nombre ?? `Depósito #${r.deposito_id}`,
    })
  }

  function openEditCantera(c: Cantera) {
    formEditCant.reset({ nombre: c.nombre, localidad: c.localidad ?? '', maps_url: c.maps_url ?? '', obs: c.obs ?? '', lat: c.lat ?? null, lng: c.lng ?? null })
    setEditCantera(c)
  }

  function openEditDeposito(d: Deposito) {
    formEditDep.reset({ nombre: d.nombre, localidad: d.localidad ?? '', maps_url: d.maps_url ?? '', obs: d.obs ?? '' , lat: d.lat ?? null, lng: d.lng ?? null })
    setEditDeposito(d)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Canteras */}
      <Section title="⛏ Canteras" onAdd={() => setModalCantera(true)} addLabel="＋ Cantera">
        <SimpleList
          items={canteras as Cantera[]}
          emptyMsg="No hay canteras registradas."
          renderItem={c => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="font-bold text-sm text-carbon">{c.nombre}</span>
                {c.localidad && <span className="text-xs text-gris-dark">({c.localidad})</span>}
                {c.maps_url && (
                  <a href={c.maps_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-0.5"
                    title="Ver en Google Maps"
                  >
                    📍 Maps
                  </a>
                )}
              </div>
              <button onClick={() => openEditCantera(c)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
            </div>
          )}
        />
      </Section>

      {/* Depósitos */}
      <Section title="🏭 Depósitos" onAdd={() => setModalDeposito(true)} addLabel="＋ Depósito">
        <SimpleList
          items={depositos as Deposito[]}
          emptyMsg="No hay depósitos registrados."
          renderItem={d => (
            <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="font-bold text-sm text-carbon">{d.nombre}</span>
                {d.localidad && <span className="text-xs text-gris-dark">({d.localidad})</span>}
                {d.maps_url && (
                  <a href={d.maps_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-0.5"
                    title="Ver en Google Maps"
                  >
                    📍 Maps
                  </a>
                )}
              </div>
              <button onClick={() => openEditDeposito(d)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark shrink-0">✏️</button>
            </div>
          )}
        />
      </Section>

      {/* Rutas */}
      <Section title="🗺️ Rutas" onAdd={() => setModalRuta(true)} addLabel="＋ Ruta">
        <SimpleList
          items={rutas}
          emptyMsg="No hay rutas registradas."
          renderItem={r => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gris last:border-0">
              <div className="text-sm flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-carbon">
                    {r.canteras?.nombre ?? `Cantera #${r.cantera_id}`}
                  </span>
                  <span className="text-gris-dark">→</span>
                  <span className="font-bold text-carbon">
                    {r.depositos?.nombre ?? `Depósito #${r.deposito_id}`}
                  </span>
                  <span className="font-mono text-xs text-verde font-bold">
                    {r.km_ida_vuelta.toLocaleString('es-AR')} km
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditRuta(r)}
                  title="Editar km / observaciones"
                  className="text-gris-dark hover:text-azul transition-colors text-sm px-2 py-1"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteRuta(r.id)}
                  title="Eliminar ruta"
                  className="text-gris-mid hover:text-rojo transition-colors text-sm px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        />
      </Section>

      {/* Modal nueva cantera */}
      <Modal open={modalCantera} onClose={() => setModalCantera(false)} title="⛏ NUEVA CANTERA"
        footer={<><Button variant="secondary" onClick={() => setModalCantera(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formCantera.handleSubmit(handleCreateCantera)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" placeholder="Cantera del Norte" {...formCantera.register('nombre')} />
          <Input label="Localidad" placeholder="Opcional" {...formCantera.register('localidad')} />
          <MapsUrlInput register={formCantera.register} watch={formCantera.watch} setValue={formCantera.setValue} />
          <Input label="Observaciones" placeholder="Opcional" {...formCantera.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar cantera */}
      <Modal open={!!editCantera} onClose={() => setEditCantera(null)} title="✏️ EDITAR CANTERA"
        footer={<><Button variant="secondary" onClick={() => setEditCantera(null)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formEditCant.handleSubmit(handleUpdateCantera)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" {...formEditCant.register('nombre')} />
          <Input label="Localidad" {...formEditCant.register('localidad')} />
          <MapsUrlInput register={formEditCant.register} watch={formEditCant.watch} setValue={formEditCant.setValue} />
          <Input label="Observaciones" {...formEditCant.register('obs')} />
        </div>
      </Modal>

      {/* Modal nuevo depósito */}
      <Modal open={modalDeposito} onClose={() => setModalDeposito(false)} title="🏭 NUEVO DEPÓSITO"
        footer={<><Button variant="secondary" onClick={() => setModalDeposito(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formDeposito.handleSubmit(handleCreateDeposito)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" placeholder="Depósito Central" {...formDeposito.register('nombre')} />
          <Input label="Localidad" placeholder="Opcional" {...formDeposito.register('localidad')} />
          <MapsUrlInput register={formDeposito.register} watch={formDeposito.watch} setValue={formDeposito.setValue} />
          <Input label="Observaciones" placeholder="Opcional" {...formDeposito.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar depósito */}
      <Modal open={!!editDeposito} onClose={() => setEditDeposito(null)} title="✏️ EDITAR DEPÓSITO"
        footer={<><Button variant="secondary" onClick={() => setEditDeposito(null)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formEditDep.handleSubmit(handleUpdateDeposito)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" {...formEditDep.register('nombre')} />
          <Input label="Localidad" {...formEditDep.register('localidad')} />
          <MapsUrlInput register={formEditDep.register} watch={formEditDep.watch} setValue={formEditDep.setValue} />
          <Input label="Observaciones" {...formEditDep.register('obs')} />
        </div>
      </Modal>

      {/* Modal ruta */}
      <Modal open={modalRuta} onClose={() => setModalRuta(false)} title="🗺️ NUEVA RUTA"
        footer={<><Button variant="secondary" onClick={() => setModalRuta(false)}>Cancelar</Button><Button variant="primary" loading={loading} onClick={formRuta.handleSubmit(handleCreateRuta)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Cantera (origen)"
            placeholder="Elegí"
            options={(canteras as Cantera[]).map(c => ({ value: c.id, label: c.nombre }))}
            {...formRuta.register('cantera_id')}
          />
          <Select
            label="Depósito (destino)"
            placeholder="Elegí"
            options={(depositos as Deposito[]).map(d => ({ value: d.id, label: d.nombre }))}
            {...formRuta.register('deposito_id')}
          />
          <Input
            label="Km ida y vuelta (total)"
            type="number"
            placeholder="Ej: 1840"
            hint="Buscá la ruta en Google Maps y sumá ida + vuelta"
            {...formRuta.register('km_ida_vuelta')}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formRuta.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar ruta — sólo km e observaciones; el par cantera/depósito
          es la identidad y no se cambia. */}
      <Modal
        open={!!editRuta}
        onClose={() => setEditRuta(null)}
        title="✏️ EDITAR RUTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRuta(null)}>Cancelar</Button>
            <Button variant="primary" loading={loading} onClick={formEditRuta.handleSubmit(handleUpdateRuta)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editRuta && (
            <div className="bg-gris/30 rounded-card p-3 text-sm">
              <span className="font-bold">{editRuta.cantera}</span>
              <span className="text-gris-dark mx-2">→</span>
              <span className="font-bold">{editRuta.deposito}</span>
              <p className="text-[11px] text-gris-dark mt-1">
                Para cambiar el origen o destino, eliminá esta ruta y creá una nueva.
              </p>
            </div>
          )}
          <Input
            label="Km ida y vuelta (total)"
            type="number"
            placeholder="Ej: 1840"
            hint="Buscá la ruta en Google Maps y sumá ida + vuelta"
            {...formEditRuta.register('km_ida_vuelta')}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formEditRuta.register('obs')} />
        </div>
      </Modal>
    </div>
  )
}

function MapsUrlInput({ register, watch, setValue }: { register: any; watch: any; setValue?: any }) {
  const url = watch('maps_url') ?? ''
  const lat = watch('lat')
  const lng = watch('lng')
  const nombre    = watch('nombre') ?? ''
  const localidad = watch('localidad') ?? ''
  const { mutate: geocodeMutate, isPending: geocoding } = useGeocode()
  const toast = useToast()

  function handleBuscar() {
    if (!setValue) return
    const direccion = [nombre, localidad].filter(Boolean).join(', ').trim()
    if (!direccion) { toast('Cargá al menos el nombre o la localidad', 'err'); return }
    geocodeMutate(direccion, {
      onSuccess: (r) => {
        setValue('lat', r.lat, { shouldDirty: true })
        setValue('lng', r.lng, { shouldDirty: true })
        toast(`✓ Coordenadas: ${r.formatted_address}`, 'ok')
      },
      onError: (err: any) => {
        const msg = err?.body?.error === 'GOOGLE_API_KEY_MISSING'
          ? 'Falta configurar GOOGLE_MAPS_API_KEY en el backend'
          : 'No se encontró la dirección. Cargá lat/lng manualmente.'
        toast(msg, 'err')
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Link Google Maps" placeholder="https://maps.google.com/..." {...register('maps_url')} />
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-azul-light text-azul text-xs font-bold hover:bg-azul hover:text-white transition-colors"
            >
              📍 Abrir
            </a>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          En Google Maps: botón Compartir → Copiar link
        </p>
      </div>

      {/* Coordenadas (necesarias para calcular distancia GPS→destino) */}
      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Input
              label="Latitud"
              type="number"
              step="0.0000001"
              placeholder="-34.6037"
              {...register('lat', { valueAsNumber: true })}
            />
            <Input
              label="Longitud"
              type="number"
              step="0.0000001"
              placeholder="-58.3816"
              {...register('lng', { valueAsNumber: true })}
            />
          </div>
          {setValue && (
            <button
              type="button"
              onClick={handleBuscar}
              disabled={geocoding}
              className="mb-0.5 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-verde-light text-verde text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-50"
            >
              {geocoding ? '⏳' : '🔍'} Buscar
            </button>
          )}
        </div>
        <p className="text-xs text-gris-dark mt-1">
          {(lat != null && lng != null && lat !== '' && lng !== '')
            ? '✓ Coordenadas cargadas — se usarán para calcular distancia y ETA al destino'
            : 'Click en "Buscar" para autocompletar desde el nombre + localidad, o pegalas manualmente'}
        </p>
      </div>
    </div>
  )
}

function Section({ title, onAdd, addLabel, children }: {
  title: string; onAdd: () => void; addLabel: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg tracking-wider text-azul">{title}</h3>
        <Button variant="secondary" size="sm" onClick={onAdd}>{addLabel}</Button>
      </div>
      <div className="bg-white rounded-card shadow-card overflow-hidden">{children}</div>
    </div>
  )
}

function SimpleList<T>({ items, emptyMsg, renderItem }: {
  items: T[]; emptyMsg: string; renderItem: (item: T) => React.ReactNode
}) {
  if (!items.length) {
    return <p className="text-center py-6 text-gris-dark text-sm">{emptyMsg}</p>
  }
  return <div>{items.map(renderItem)}</div>
}