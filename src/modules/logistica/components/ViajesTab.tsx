'use client'

import { useState } from 'react'
import {
  useViajes, useChoferes, useCamiones, useCanteras,
  useDepositos, useRutas, useCreateViaje,
  useRegistrarCarga, useRegistrarDescarga, useDeleteViaje,
  useUpdateViaje, useUpdateCarga, useUpdateDescarga,
} from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Input }  from '@/components/ui/Input'
import { Badge }  from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import type { Viaje } from '@/types/domain.types'

export function ViajesTab() {
  const toast = useToast()
  const { data: viajes    = [] } = useViajes()
  const { data: choferes  = [] } = useChoferes()
  const { data: camiones  = [] } = useCamiones()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()

  const { mutate: createViaje,       isPending: creating     } = useCreateViaje()
  const { mutate: registrarCarga,    isPending: cargando     } = useRegistrarCarga()
  const { mutate: registrarDescarga, isPending: descargando  } = useRegistrarDescarga()
  const { mutate: deleteViaje } = useDeleteViaje()
  const { mutate: updateViaje,       isPending: updatingViaje   } = useUpdateViaje()
  const { mutate: updateCarga,       isPending: updatingCarga   } = useUpdateCarga()
  const { mutate: updateDescarga,    isPending: updatingDescarga } = useUpdateDescarga()

  const [modalNuevo,      setModalNuevo]      = useState(false)
  const [modalCarga,      setModalCarga]      = useState<Viaje | null>(null)
  const [modalDescarga,   setModalDescarga]   = useState<Viaje | null>(null)
  const [modalEditViaje,  setModalEditViaje]  = useState<Viaje | null>(null)
  const [modalEditCarga,  setModalEditCarga]  = useState<{ viaje: Viaje; carga: Viaje['cargas'][0] } | null>(null)
  const [modalEditDescarga, setModalEditDescarga] = useState<{ viaje: Viaje; descarga: Viaje['descargas'][0] } | null>(null)
  const [filtChofer,   setFiltChofer]   = useState('')
  const [filtEstado,   setFiltEstado]   = useState('')

  // Forms
  const formViaje       = useForm<any>()
  const formCarga       = useForm<any>()
  const formDescarga    = useForm<any>()
  const formEditViaje   = useForm<any>()
  const formEditCarga   = useForm<any>()
  const formEditDescarga = useForm<any>()

  const filtered = viajes.filter(v => {
    if (filtChofer && String(v.chofer_id) !== filtChofer) return false
    if (filtEstado && v.estado !== filtEstado) return false
    return true
  })

  function getKm(viaje: Viaje) {
    const carga    = viaje.cargas[0]
    const descarga = viaje.descargas[0]
    if (!carga || !descarga) return null
    const ruta = rutas.find(
      r => r.cantera_id === carga.cantera_id && r.deposito_id === descarga.deposito_id
    )
    return ruta?.km_ida_vuelta ?? null
  }

  function handleCreateViaje(data: any) {
    createViaje(
      { chofer_id: Number(data.chofer_id), camion_id: Number(data.camion_id), obs: data.obs },
      {
        onSuccess: () => { toast('✓ Tramo creado', 'ok'); setModalNuevo(false); formViaje.reset() },
        onError:   () => toast('Error al crear tramo', 'err'),
      }
    )
  }

  function handleCarga(data: any) {
    if (!modalCarga) return
    registrarCarga(
      {
        viaje_id:   modalCarga.id,
        fecha:      data.fecha,
        cantera_id: Number(data.cantera_id),
        toneladas:  data.toneladas ? Number(data.toneladas) : undefined,
        remito_num: data.remito_num,
        obs:        data.obs,
      },
      {
        onSuccess: () => { toast('✓ Carga registrada', 'ok'); setModalCarga(null); formCarga.reset() },
        onError:   () => toast('Error al registrar carga', 'err'),
      }
    )
  }

  function handleDescarga(data: any) {
    if (!modalDescarga) return
    registrarDescarga(
      {
        viaje_id:    modalDescarga.id,
        fecha:       data.fecha,
        deposito_id: Number(data.deposito_id),
        toneladas:   data.toneladas ? Number(data.toneladas) : undefined,
        remito_num:  data.remito_num,
        obs:         data.obs,
      },
      {
        onSuccess: () => { toast('✓ Descarga registrada — tramo completado', 'ok'); setModalDescarga(null); formDescarga.reset() },
        onError:   () => toast('Error al registrar descarga', 'err'),
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar este tramo y sus datos?')) return
    deleteViaje(id, {
      onSuccess: () => toast('✓ Tramo eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEditViaje(viaje: Viaje) {
    formEditViaje.reset({ chofer_id: String(viaje.chofer_id), camion_id: String(viaje.camion_id), obs: viaje.obs ?? '' })
    setModalEditViaje(viaje)
  }

  function handleEditViaje(data: any) {
    if (!modalEditViaje) return
    updateViaje(
      { id: modalEditViaje.id, dto: { chofer_id: Number(data.chofer_id), camion_id: Number(data.camion_id), obs: data.obs } },
      {
        onSuccess: () => { toast('✓ Tramo actualizado', 'ok'); setModalEditViaje(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function openEditCarga(viaje: Viaje) {
    const carga = viaje.cargas[0]
    if (!carga) return
    formEditCarga.reset({ fecha: carga.fecha, cantera_id: String(carga.cantera_id), toneladas: carga.toneladas ?? '', remito_num: carga.remito_num ?? '', obs: carga.obs ?? '' })
    setModalEditCarga({ viaje, carga })
  }

  function handleEditCarga(data: any) {
    if (!modalEditCarga) return
    updateCarga(
      { id: modalEditCarga.carga.id, dto: { fecha: data.fecha, cantera_id: Number(data.cantera_id), toneladas: data.toneladas ? Number(data.toneladas) : undefined, remito_num: data.remito_num, obs: data.obs } },
      {
        onSuccess: () => { toast('✓ Carga actualizada', 'ok'); setModalEditCarga(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function openEditDescarga(viaje: Viaje) {
    const descarga = viaje.descargas[0]
    if (!descarga) return
    formEditDescarga.reset({ fecha: descarga.fecha, deposito_id: String(descarga.deposito_id), toneladas: descarga.toneladas ?? '', remito_num: descarga.remito_num ?? '', obs: descarga.obs ?? '' })
    setModalEditDescarga({ viaje, descarga })
  }

  function handleEditDescarga(data: any) {
    if (!modalEditDescarga) return
    updateDescarga(
      { id: modalEditDescarga.descarga.id, dto: { fecha: data.fecha, deposito_id: Number(data.deposito_id), toneladas: data.toneladas ? Number(data.toneladas) : undefined, remito_num: data.remito_num, obs: data.obs } },
      {
        onSuccess: () => { toast('✓ Descarga actualizada', 'ok'); setModalEditDescarga(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  return (
    <>
      {/* Filtros + botón */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          options={[{ value: '', label: 'Todos los choferes' }, ...choferes.map(c => ({ value: c.id, label: c.nombre }))]}
          value={filtChofer}
          onChange={e => setFiltChofer(e.target.value)}
          className="w-48"
        />
        <Select
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'en_curso', label: '⏳ En curso' },
            { value: 'completado', label: '✓ Completado' },
          ]}
          value={filtEstado}
          onChange={e => setFiltEstado(e.target.value)}
          className="w-44"
        />
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo tramo
        </Button>
      </div>

      {/* Lista de viajes */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay tramos registrados.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(viaje => {
            const chofer  = choferes.find(c => c.id === viaje.chofer_id)
            const camion  = camiones.find(c => c.id === viaje.camion_id)
            const carga   = viaje.cargas[0]
            const descarga = viaje.descargas[0]
            const km      = getKm(viaje)
            const cantera  = carga   ? canteras.find(c => c.id === carga.cantera_id)     : null
            const deposito = descarga ? depositos.find(d => d.id === descarga.deposito_id) : null

            return (
              <div
                key={viaje.id}
                className={`
                  bg-white rounded-card shadow-card p-4 border-l-4
                  ${viaje.estado === 'completado' ? 'border-verde' : 'border-amarillo'}
                `}
              >
                {/* Head */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant={viaje.estado === 'completado' ? 'cerrado' : 'pendiente'}
                        label={viaje.estado === 'completado' ? '✓ Completado' : '⏳ En curso'}
                      />
                      <span className="font-mono text-xs text-gris-dark">#{viaje.id}</span>
                    </div>
                    <div className="font-bold text-azul">
                      {chofer?.nombre ?? '—'} &nbsp;·&nbsp; {camion?.patente ?? '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(viaje.id)}
                    className="text-gris-mid hover:text-rojo transition-colors text-sm p-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Carga / Descarga */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  <InfoLine
                    icon="⛏"
                    label="Carga"
                    value={carga
                      ? `${fmtFecha(carga.fecha)} · ${cantera?.nombre ?? '—'} · ${carga.toneladas ?? '—'} tn · Rem. ${carga.remito_num || '—'}`
                      : 'Sin registrar'
                    }
                    empty={!carga}
                  />
                  <InfoLine
                    icon="🏭"
                    label="Descarga"
                    value={descarga
                      ? `${fmtFecha(descarga.fecha)} · ${deposito?.nombre ?? '—'} · ${descarga.toneladas ?? '—'} tn · Rem. ${descarga.remito_num || '—'}`
                      : 'Sin registrar'
                    }
                    empty={!descarga}
                  />
                  {km && (
                    <InfoLine icon="📍" label="Km totales" value={`${km.toLocaleString('es-AR')} km`} />
                  )}
                  {viaje.obs && (
                    <InfoLine icon="📝" label="Obs" value={viaje.obs} />
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-2 flex-wrap">
                  {!carga && (
                    <Button variant="primary" size="sm" onClick={() => { formCarga.setValue('fecha', new Date().toISOString().slice(0, 10)); setModalCarga(viaje) }}>
                      ⛏ Registrar carga
                    </Button>
                  )}
                  {carga && !descarga && (
                    <Button variant="secondary" size="sm" onClick={() => { formDescarga.setValue('fecha', new Date().toISOString().slice(0, 10)); setModalDescarga(viaje) }}>
                      🏭 Registrar descarga
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => openEditViaje(viaje)}>
                    ✏️ Editar tramo
                  </Button>
                  {carga && (
                    <Button variant="secondary" size="sm" onClick={() => openEditCarga(viaje)}>
                      ✏️ Editar carga
                    </Button>
                  )}
                  {descarga && (
                    <Button variant="secondary" size="sm" onClick={() => openEditDescarga(viaje)}>
                      ✏️ Editar descarga
                    </Button>
                  )}
                  {carga?.remito_url && (
                    <a href={carga.remito_url} target="_blank" className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors">
                      📄 Remito carga
                    </a>
                  )}
                  {descarga?.remito_url && (
                    <a href={descarga.remito_url} target="_blank" className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors">
                      📄 Remito descarga
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nuevo viaje */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🚛 NUEVO TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formViaje.handleSubmit(handleCreateViaje)}>✓ Crear tramo</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Combobox
            label="Chofer"
            placeholder="Buscar chofer..."
            options={choferes.filter(c => c.estado === 'activo').map(c => ({ value: String(c.id), label: c.nombre }))}
            value={String(formViaje.watch('chofer_id') ?? '')}
            onChange={v => {
              formViaje.setValue('chofer_id', v ? Number(v) : undefined)
              // Precargar camión asignado al chofer
              const chofer = choferes.find(c => c.id === Number(v))
              if (chofer?.camion_id) {
                formViaje.setValue('camion_id', chofer.camion_id)
              }
            }}
          />
          <Combobox
            label="Camión"
            placeholder="Buscar camión..."
            options={camiones.filter(c => c.estado === 'activo').map(c => ({ value: String(c.id), label: c.patente, sub: c.modelo ?? undefined }))}
            value={String(formViaje.watch('camion_id') ?? '')}
            onChange={v => formViaje.setValue('camion_id', v ? Number(v) : undefined)}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formViaje.register('obs')} />
        </div>
      </Modal>

      {/* Modal carga */}
      <Modal
        open={!!modalCarga}
        onClose={() => setModalCarga(null)}
        title="⛏ REGISTRAR CARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalCarga(null)}>Cancelar</Button>
            <Button variant="primary" loading={cargando} onClick={formCarga.handleSubmit(handleCarga)}>✓ Guardar carga</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formCarga.register('fecha')} />
            <Combobox
              label="Cantera"
              placeholder="Buscar cantera..."
              options={canteras.map(c => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))}
              value={String(formCarga.watch('cantera_id') ?? '')}
              onChange={v => formCarga.setValue('cantera_id', v ? Number(v) : undefined)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formCarga.register('toneladas')} />
            <Input label="Nº Remito" placeholder="R-00456" {...formCarga.register('remito_num')} />
          </div>
          <Input label="Observaciones" placeholder="Opcional" {...formCarga.register('obs')} />
        </div>
      </Modal>

      {/* Modal descarga */}
      <Modal
        open={!!modalDescarga}
        onClose={() => setModalDescarga(null)}
        title="🏭 REGISTRAR DESCARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalDescarga(null)}>Cancelar</Button>
            <Button variant="primary" loading={descargando} onClick={formDescarga.handleSubmit(handleDescarga)}>✓ Guardar descarga</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formDescarga.register('fecha')} />
            <Combobox
              label="Depósito"
              placeholder="Buscar depósito..."
              options={depositos.map(d => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
              value={String(formDescarga.watch('deposito_id') ?? '')}
              onChange={v => formDescarga.setValue('deposito_id', v ? Number(v) : undefined)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formDescarga.register('toneladas')} />
            <Input label="Nº Remito" placeholder="R-00456" {...formDescarga.register('remito_num')} />
          </div>
          <Input label="Observaciones" placeholder="Opcional" {...formDescarga.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar tramo */}
      <Modal
        open={!!modalEditViaje}
        onClose={() => setModalEditViaje(null)}
        title="✏️ EDITAR TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEditViaje(null)}>Cancelar</Button>
            <Button variant="primary" loading={updatingViaje} onClick={formEditViaje.handleSubmit(handleEditViaje)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Combobox
            label="Chofer"
            placeholder="Buscar chofer..."
            options={choferes.map(c => ({ value: String(c.id), label: c.nombre }))}
            value={String(formEditViaje.watch('chofer_id') ?? '')}
            onChange={v => formEditViaje.setValue('chofer_id', v)}
          />
          <Combobox
            label="Camión"
            placeholder="Buscar camión..."
            options={camiones.map(c => ({ value: String(c.id), label: c.patente, sub: c.modelo ?? undefined }))}
            value={String(formEditViaje.watch('camion_id') ?? '')}
            onChange={v => formEditViaje.setValue('camion_id', v)}
          />
          <Input label="Observaciones" placeholder="Opcional" {...formEditViaje.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar carga */}
      <Modal
        open={!!modalEditCarga}
        onClose={() => setModalEditCarga(null)}
        title="✏️ EDITAR CARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEditCarga(null)}>Cancelar</Button>
            <Button variant="primary" loading={updatingCarga} onClick={formEditCarga.handleSubmit(handleEditCarga)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formEditCarga.register('fecha')} />
            <Combobox
              label="Cantera"
              placeholder="Buscar cantera..."
              options={canteras.map(c => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))}
              value={String(formEditCarga.watch('cantera_id') ?? '')}
              onChange={v => formEditCarga.setValue('cantera_id', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formEditCarga.register('toneladas')} />
            <Input label="Nº Remito" placeholder="R-00456" {...formEditCarga.register('remito_num')} />
          </div>
          <Input label="Observaciones" placeholder="Opcional" {...formEditCarga.register('obs')} />
        </div>
      </Modal>

      {/* Modal editar descarga */}
      <Modal
        open={!!modalEditDescarga}
        onClose={() => setModalEditDescarga(null)}
        title="✏️ EDITAR DESCARGA"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEditDescarga(null)}>Cancelar</Button>
            <Button variant="primary" loading={updatingDescarga} onClick={formEditDescarga.handleSubmit(handleEditDescarga)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formEditDescarga.register('fecha')} />
            <Combobox
              label="Depósito"
              placeholder="Buscar depósito..."
              options={depositos.map(d => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
              value={String(formEditDescarga.watch('deposito_id') ?? '')}
              onChange={v => formEditDescarga.setValue('deposito_id', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...formEditDescarga.register('toneladas')} />
            <Input label="Nº Remito" placeholder="R-00456" {...formEditDescarga.register('remito_num')} />
          </div>
          <Input label="Observaciones" placeholder="Opcional" {...formEditDescarga.register('obs')} />
        </div>
      </Modal>
    </>
  )
}

function InfoLine({ icon, label, value, empty }: { icon: string; label: string; value: string; empty?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${empty ? 'text-gris-mid' : 'text-carbon'}`}>
      <span className="flex-shrink-0">{icon}</span>
      <span><b>{label}:</b> {value}</span>
    </div>
  )
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}