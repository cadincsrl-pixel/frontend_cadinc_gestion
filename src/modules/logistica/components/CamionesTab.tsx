'use client'

import { useState } from 'react'
import { useCamiones, useCreateCamion, useUpdateCamion, useChoferes } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { VehiculoDocumentosSection } from './VehiculoDocumentosSection'
import { CamionServicesSection } from './CamionServicesSection'
import { GpsCamionSection, GpsBadge } from './GpsCamionSection'
import { useCamionServiceEstadoTodos } from '../hooks/useCamionServices'
import { useSyncGpsTodos } from '../hooks/useGpsSync'
import type { Camion, CamionServiceEstado, Chofer } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',        label: 'Activo'           },
  { value: 'mantenimiento', label: 'En mantenimiento' },
  { value: 'inactivo',      label: 'Inactivo'         },
]

export function CamionesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('logistica')
  const { data: camiones = [] } = useCamiones()
  const { data: choferes = [] } = useChoferes()
  const { data: serviceEstados = [] } = useCamionServiceEstadoTodos()
  const { mutate: create, isPending: creating } = useCreateCamion()
  const { mutate: update, isPending: updating } = useUpdateCamion()
  const { mutate: syncTodos, isPending: syncingTodos } = useSyncGpsTodos()

  function handleSyncTodos() {
    syncTodos(undefined, {
      onSuccess: (r) => {
        toast(`✓ Sync GPS · ${r.ok} actualizados, ${r.sin_cambio} sin cambio${r.no_match ? `, ${r.no_match} sin match` : ''}${r.error ? `, ${r.error} error` : ''}`, 'ok')
      },
      onError: () => toast('Error al sincronizar GPS', 'err'),
    })
  }

  // Map camion_id → estado para acceso O(1) en el render de la lista.
  const estadoPorCamion = new Map<number, CamionServiceEstado>(
    serviceEstados.map(e => [e.camion_id, e]),
  )

  // Map camion_id → choferes asignados (solo activos primero, luego el resto).
  // Si hay varios asignados al mismo camión mostramos el principal y la lista
  // completa en el title del td.
  const choferesPorCamion = new Map<number, Chofer[]>()
  for (const ch of choferes) {
    if (ch.camion_id == null) continue
    const arr = choferesPorCamion.get(ch.camion_id) ?? []
    arr.push(ch)
    choferesPorCamion.set(ch.camion_id, arr)
  }
  for (const arr of choferesPorCamion.values()) {
    arr.sort((a, b) => {
      if (a.estado === b.estado) return a.nombre.localeCompare(b.nombre)
      return a.estado === 'activo' ? -1 : 1
    })
  }

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<Camion | null>(null)
  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  function handleCreate(data: any) {
    create({ ...data, anio: data.anio ? Number(data.anio) : undefined }, {
      onSuccess: () => { toast('✓ Camión agregado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: { ...data, anio: data.anio ? Number(data.anio) : undefined } }, {
      onSuccess: () => { toast('✓ Camión actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function openEdit(c: Camion) {
    formEdit.reset({ patente: c.patente, modelo: c.modelo ?? '', anio: c.anio ?? '', estado: c.estado, obs: c.obs ?? '' })
    setEditando(c)
  }

  const CamionForm = ({ form, disabled }: { form: any; disabled?: boolean }) => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Patente" placeholder="AA 123 BB" disabled={disabled} {...form.register('patente')} />
        <Input label="Modelo"  placeholder="Volvo FH 460" disabled={disabled} {...form.register('modelo')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Año" type="number" placeholder="2020" disabled={disabled} {...form.register('anio')} />
        <Select label="Estado" options={ESTADO_OPTIONS} disabled={disabled} {...form.register('estado')} />
      </div>
      <Input label="Observaciones" placeholder="Notas..." disabled={disabled} {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex justify-end gap-2">
        {puedeEditar && (
          <Button variant="secondary" size="sm" loading={syncingTodos} onClick={handleSyncTodos}>
            🛰 Sincronizar GPS
          </Button>
        )}
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo camión</Button>
        )}
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Patente', 'Modelo', 'Chofer', 'Año', 'Km actuales', 'Faltan p/ service', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {camiones.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm">No hay camiones registrados.</td></tr>
            ) : camiones.map(c => {
              const est = estadoPorCamion.get(c.id)
              const km = est?.km_actuales ?? c.km_actuales ?? 0
              const chofs = choferesPorCamion.get(c.id) ?? []
              const chofPrincipal = chofs[0]
              return (
              <tr
                key={c.id}
                className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <td className="px-4 py-3 font-mono font-bold text-sm">{c.patente}</td>
                <td className="px-4 py-3 text-sm text-carbon">{c.modelo || '—'}</td>
                <td
                  className="px-4 py-3 text-sm text-carbon"
                  title={chofs.length > 1 ? `También: ${chofs.slice(1).map(x => x.nombre).join(', ')}` : undefined}
                >
                  {chofPrincipal ? (
                    <span className={chofPrincipal.estado !== 'activo' ? 'text-gris-mid italic' : ''}>
                      {chofPrincipal.nombre}
                      {chofs.length > 1 && <span className="ml-1 text-[10px] text-gris-dark">+{chofs.length - 1}</span>}
                    </span>
                  ) : (
                    <span className="text-gris-mid">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.anio || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {km > 0 ? `${km.toLocaleString('es-AR')} km` : <span className="text-gris-mid">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  <KmFaltantes estado={est} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                      label={c.estado === 'mantenimiento' ? 'Mantenimiento' : undefined}
                    />
                    <ServiceBadge estado={est} />
                    <GpsBadge camion={c} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gris-mid">
                  {puedeEditar ? '✏️' : '👁'}
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
        {camiones.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            No hay camiones registrados.
          </div>
        ) : camiones.map(c => {
          const est = estadoPorCamion.get(c.id)
          const km = est?.km_actuales ?? c.km_actuales ?? 0
          const chofs = choferesPorCamion.get(c.id) ?? []
          const chofPrincipal = chofs[0]
          return (
          <button
            key={c.id}
            onClick={() => openEdit(c)}
            className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm text-carbon truncate">{c.patente}</div>
                <div className="text-xs text-gris-dark mt-0.5">
                  {c.modelo || 'sin modelo'}{c.anio ? ` · ${c.anio}` : ''}
                </div>
                {chofPrincipal && (
                  <div className={`text-[11px] mt-0.5 truncate ${chofPrincipal.estado !== 'activo' ? 'text-gris-mid italic' : 'text-carbon'}`}>
                    👷 {chofPrincipal.nombre}
                    {chofs.length > 1 && <span className="ml-1 text-gris-dark">+{chofs.length - 1}</span>}
                  </div>
                )}
                <div className="text-[11px] text-gris-dark mt-1 font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>📏 {km > 0 ? `${km.toLocaleString('es-AR')} km` : '—'}</span>
                  <KmFaltantes estado={est} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                  label={c.estado === 'mantenimiento' ? 'Mantenimiento' : undefined}
                />
                <ServiceBadge estado={est} />
                <GpsBadge camion={c} />
              </div>
            </div>
          </button>
          )
        })}
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🚚 NUEVO CAMIÓN"
        footer={<><Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button><Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button></>}
      >
        <CamionForm form={formNuevo} />
      </Modal>

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={puedeEditar ? '✏️ EDITAR CAMIÓN' : '🚚 DETALLE CAMIÓN'}
        width="max-w-3xl"
        footer={
          puedeEditar ? (
            <>
              <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditando(null)}>Cerrar</Button>
          )
        }
      >
        <div className="flex flex-col gap-5">
          <CamionForm form={formEdit} disabled={!puedeEditar} />

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <VehiculoDocumentosSection entidad="camion" id={editando.id} />
            </div>
          )}

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <CamionServicesSection camionId={editando.id} />
            </div>
          )}

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <GpsCamionSection camion={editando} />
            </div>
          )}

          <AuditInfo
            createdBy={editando?.created_by}
            updatedBy={editando?.updated_by}
            createdAt={editando?.created_at}
            updatedAt={editando?.updated_at}
          />
        </div>
      </Modal>
    </>
  )
}

// Badge contextual del estado del service del camión.
// - 'al_dia' / 'sin_service' → no muestra nada (evitar ruido visual).
// - 'proximo' → amarillo, "Service en X km".
// - 'vencido' → rojo, "Service vencido" o "vencido hace X km".
function ServiceBadge({ estado }: { estado?: CamionServiceEstado }) {
  if (!estado) return null
  if (estado.estado === 'al_dia' || estado.estado === 'sin_service') return null

  const km = estado.km_restantes ?? 0
  if (estado.estado === 'proximo') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-amarillo-light text-[#7A5500]">
        🟡 Service en {Math.round(km).toLocaleString('es-AR')} km
      </span>
    )
  }
  // vencido
  const atraso = Math.abs(km)
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-rojo-light text-rojo">
      🔴 Service vencido {atraso > 0 ? `(${atraso.toLocaleString('es-AR')} km)` : ''}
    </span>
  )
}

// Texto contextual de "km faltantes para el próximo service" en la fila/card.
// Color según estado (verde al día, amarillo próximo, rojo vencido).
function KmFaltantes({ estado }: { estado?: CamionServiceEstado }) {
  if (!estado) return <span className="text-gris-mid">—</span>
  if (estado.estado === 'sin_service') return <span className="text-gris-mid">sin service</span>
  if (estado.km_restantes == null) return <span className="text-gris-mid">—</span>
  const km = estado.km_restantes
  if (estado.estado === 'vencido') {
    return <span className="text-rojo font-bold">vencido hace {Math.abs(km).toLocaleString('es-AR')} km</span>
  }
  if (estado.estado === 'proximo') {
    return <span className="text-[#7A5500] font-bold">faltan {km.toLocaleString('es-AR')} km</span>
  }
  // al_dia
  return <span className="text-verde">faltan {km.toLocaleString('es-AR')} km</span>
}