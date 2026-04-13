'use client'

import { useState } from 'react'
import {
  useTramos, useChoferes, useCamiones, useCanteras,
  useDepositos, useRutas, useCreateTramo, useUpdateTramo, useDeleteTramo,
} from '../hooks/useLogistica'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Input }    from '@/components/ui/Input'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import type { Tramo } from '@/types/domain.types'

export function ViajesTab() {
  const toast = useToast()
  const { data: tramos    = [] } = useTramos()
  const { data: choferes  = [] } = useChoferes()
  const { data: camiones  = [] } = useCamiones()
  const { data: canteras  = [] } = useCanteras()
  const { data: depositos = [] } = useDepositos()
  const { data: rutas     = [] } = useRutas()

  const { mutate: createTramo, isPending: creating  } = useCreateTramo()
  const { mutate: updateTramo, isPending: updating  } = useUpdateTramo()
  const { mutate: deleteTramo } = useDeleteTramo()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Tramo | null>(null)
  const [filtChofer,  setFiltChofer]  = useState('')
  const [filtTipo,    setFiltTipo]    = useState('')

  const formNuevo = useForm<any>({ defaultValues: { tipo: 'carga', fecha: new Date().toISOString().slice(0, 10) } })
  const formEdit  = useForm<any>()

  const filtered = tramos.filter(t => {
    if (filtChofer && String(t.chofer_id) !== filtChofer) return false
    if (filtTipo   && t.tipo !== filtTipo) return false
    return true
  })

  function getKm(tramo: Tramo) {
    if (!tramo.cantera_id || !tramo.deposito_id) return null
    const ruta = rutas.find(r => r.cantera_id === tramo.cantera_id && r.deposito_id === tramo.deposito_id)
    return ruta?.km_ida_vuelta ?? null
  }

  function handleCreate(data: any) {
    createTramo(
      {
        chofer_id:   Number(data.chofer_id),
        camion_id:   Number(data.camion_id),
        fecha:       data.fecha,
        tipo:        data.tipo,
        cantera_id:  data.cantera_id  ? Number(data.cantera_id)  : null,
        deposito_id: data.deposito_id ? Number(data.deposito_id) : null,
        toneladas:   data.toneladas   ? Number(data.toneladas)   : null,
        remito_num:  data.remito_num  ?? '',
        obs:         data.obs         ?? '',
      },
      {
        onSuccess: () => { toast('✓ Tramo registrado', 'ok'); setModalNuevo(false); formNuevo.reset({ tipo: 'carga', fecha: new Date().toISOString().slice(0, 10) }) },
        onError:   () => toast('Error al registrar tramo', 'err'),
      }
    )
  }

  function openEdit(tramo: Tramo) {
    formEdit.reset({
      chofer_id:   String(tramo.chofer_id),
      camion_id:   String(tramo.camion_id),
      fecha:       tramo.fecha,
      tipo:        tramo.tipo,
      cantera_id:  tramo.cantera_id  ? String(tramo.cantera_id)  : '',
      deposito_id: tramo.deposito_id ? String(tramo.deposito_id) : '',
      toneladas:   tramo.toneladas   ?? '',
      remito_num:  tramo.remito_num  ?? '',
      obs:         tramo.obs         ?? '',
    })
    setEditando(tramo)
  }

  function handleEdit(data: any) {
    if (!editando) return
    updateTramo(
      {
        id: editando.id,
        dto: {
          chofer_id:   Number(data.chofer_id),
          camion_id:   Number(data.camion_id),
          fecha:       data.fecha,
          tipo:        data.tipo,
          cantera_id:  data.cantera_id  ? Number(data.cantera_id)  : null,
          deposito_id: data.deposito_id ? Number(data.deposito_id) : null,
          toneladas:   data.toneladas   ? Number(data.toneladas)   : null,
          remito_num:  data.remito_num  ?? '',
          obs:         data.obs         ?? '',
        },
      },
      {
        onSuccess: () => { toast('✓ Tramo actualizado', 'ok'); setEditando(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete(tramo: Tramo) {
    if (!confirm(`¿Eliminar este tramo (#${tramo.id})?`)) return
    deleteTramo(tramo.id, {
      onSuccess: () => toast('✓ Tramo eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
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
            { value: '', label: 'Carga y descarga' },
            { value: 'carga',    label: '⛏ Carga'    },
            { value: 'descarga', label: '🏭 Descarga' },
          ]}
          value={filtTipo}
          onChange={e => setFiltTipo(e.target.value)}
          className="w-40"
        />
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModalNuevo(true)}>
          ＋ Nuevo tramo
        </Button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay tramos registrados.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(tramo => {
            const chofer  = choferes.find(c => c.id === tramo.chofer_id)
            const camion  = camiones.find(c => c.id === tramo.camion_id)
            const cantera  = tramo.cantera_id  ? canteras.find(c => c.id === tramo.cantera_id)   : null
            const deposito = tramo.deposito_id ? depositos.find(d => d.id === tramo.deposito_id) : null
            const km = getKm(tramo)

            return (
              <div
                key={tramo.id}
                className={`bg-white rounded-card shadow-card p-4 border-l-4 ${tramo.tipo === 'carga' ? 'border-naranja' : 'border-azul-mid'}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant={tramo.tipo === 'carga' ? 'pendiente' : 'cerrado'}
                        label={tramo.tipo === 'carga' ? '⛏ Carga' : '🏭 Descarga'}
                      />
                      <span className="font-mono text-xs text-gris-dark">#{tramo.id} · {fmtFecha(tramo.fecha)}</span>
                    </div>
                    <div className="font-bold text-azul">
                      {chofer?.nombre ?? '—'} &nbsp;·&nbsp; {camion?.patente ?? '—'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(tramo)} className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                    <button onClick={() => handleDelete(tramo)} className="text-xs p-1 rounded hover:bg-rojo-light text-gris-mid hover:text-rojo transition-colors">✕</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {cantera && (
                    <InfoLine icon="⛏" label="Cantera" value={cantera.nombre + (cantera.localidad ? ` · ${cantera.localidad}` : '')} />
                  )}
                  {deposito && (
                    <InfoLine icon="🏭" label="Depósito" value={deposito.nombre + (deposito.localidad ? ` · ${deposito.localidad}` : '')} />
                  )}
                  {tramo.toneladas != null && (
                    <InfoLine icon="⚖️" label="Toneladas" value={`${tramo.toneladas} tn`} />
                  )}
                  {tramo.remito_num && (
                    <InfoLine icon="📄" label="Remito" value={tramo.remito_num} />
                  )}
                  {km && (
                    <InfoLine icon="📍" label="Km" value={`${km.toLocaleString('es-AR')} km`} />
                  )}
                  {tramo.obs && (
                    <InfoLine icon="📝" label="Obs" value={tramo.obs} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nuevo tramo */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🚛 NUEVO TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Registrar</Button>
          </>
        }
      >
        <TramoForm form={formNuevo} choferes={choferes} camiones={camiones} canteras={canteras} depositos={depositos} />
      </Modal>

      {/* Modal editar tramo */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR TRAMO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleEdit)}>✓ Guardar</Button>
          </>
        }
      >
        <TramoForm form={formEdit} choferes={choferes} camiones={camiones} canteras={canteras} depositos={depositos} />
      </Modal>
    </>
  )
}

function TramoForm({ form, choferes, camiones, canteras, depositos }: any) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Tipo"
          options={[
            { value: 'carga',    label: '⛏ Carga'    },
            { value: 'descarga', label: '🏭 Descarga' },
          ]}
          {...form.register('tipo')}
        />
        <Input label="Fecha" type="date" {...form.register('fecha')} />
      </div>
      <Combobox
        label="Chofer"
        placeholder="Buscar chofer..."
        options={choferes.filter((c: any) => c.estado === 'activo').map((c: any) => ({ value: String(c.id), label: c.nombre }))}
        value={String(form.watch('chofer_id') ?? '')}
        onChange={(v: string) => {
          form.setValue('chofer_id', v)
          const chofer = choferes.find((c: any) => c.id === Number(v))
          if (chofer?.camion_id) form.setValue('camion_id', String(chofer.camion_id))
        }}
      />
      <Combobox
        label="Camión"
        placeholder="Buscar camión..."
        options={camiones.filter((c: any) => c.estado === 'activo').map((c: any) => ({ value: String(c.id), label: c.patente, sub: c.modelo ?? undefined }))}
        value={String(form.watch('camion_id') ?? '')}
        onChange={(v: string) => form.setValue('camion_id', v)}
      />
      <Combobox
        label="Cantera"
        placeholder="Buscar cantera..."
        options={canteras.map((c: any) => ({ value: String(c.id), label: c.nombre, sub: c.localidad ?? undefined }))}
        value={String(form.watch('cantera_id') ?? '')}
        onChange={(v: string) => form.setValue('cantera_id', v)}
      />
      <Combobox
        label="Depósito"
        placeholder="Buscar depósito..."
        options={depositos.map((d: any) => ({ value: String(d.id), label: d.nombre, sub: d.localidad ?? undefined }))}
        value={String(form.watch('deposito_id') ?? '')}
        onChange={(v: string) => form.setValue('deposito_id', v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Toneladas" type="number" step="0.01" placeholder="0.00" {...form.register('toneladas')} />
        <Input label="Nº Remito" placeholder="R-00456" {...form.register('remito_num')} />
      </div>
      <Input label="Observaciones" placeholder="Opcional" {...form.register('obs')} />
    </div>
  )
}

function InfoLine({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-carbon">
      <span className="flex-shrink-0">{icon}</span>
      <span><b>{label}:</b> {value}</span>
    </div>
  )
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
