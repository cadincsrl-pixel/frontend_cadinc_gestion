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
  const [loading, setLoading] = useState(false)

  const formCantera    = useForm<any>()
  const formDeposito   = useForm<any>()
  const formRuta       = useForm<any>()
  const formEditCant   = useForm<any>()
  const formEditDep    = useForm<any>()

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

  function openEditCantera(c: Cantera) {
    formEditCant.reset({ nombre: c.nombre, localidad: c.localidad ?? '', maps_url: c.maps_url ?? '', obs: c.obs ?? '' })
    setEditCantera(c)
  }

  function openEditDeposito(d: Deposito) {
    formEditDep.reset({ nombre: d.nombre, localidad: d.localidad ?? '', maps_url: d.maps_url ?? '', obs: d.obs ?? '' })
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
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2">
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
              <button onClick={() => openEditCantera(c)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark">✏️</button>
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
            <div key={d.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gris last:border-0">
              <div className="flex items-center gap-2">
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
              <button onClick={() => openEditDeposito(d)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors text-gris-dark">✏️</button>
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
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gris last:border-0">
              <div className="text-sm">
                <span className="font-bold text-carbon">
                  {r.canteras?.nombre ?? `Cantera #${r.cantera_id}`}
                </span>
                <span className="text-gris-dark mx-2">→</span>
                <span className="font-bold text-carbon">
                  {r.depositos?.nombre ?? `Depósito #${r.deposito_id}`}
                </span>
                <span className="font-mono text-xs text-verde ml-3 font-bold">
                  {r.km_ida_vuelta.toLocaleString('es-AR')} km
                </span>
              </div>
              <button
                onClick={() => handleDeleteRuta(r.id)}
                className="text-gris-mid hover:text-rojo transition-colors text-sm px-2 py-1"
              >
                ✕
              </button>
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
          <Input label="Link Google Maps" placeholder="https://maps.google.com/..." {...formCantera.register('maps_url')} />
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
          <MapsUrlInput register={formEditCant.register} watch={formEditCant.watch} />
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
          <Input label="Link Google Maps" placeholder="https://maps.google.com/..." {...formDeposito.register('maps_url')} />
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
          <MapsUrlInput register={formEditDep.register} watch={formEditDep.watch} />
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
    </div>
  )
}

function MapsUrlInput({ register, watch }: { register: any; watch: any }) {
  const url = watch('maps_url') ?? ''
  return (
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