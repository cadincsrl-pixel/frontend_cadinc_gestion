'use client'

import { useState } from 'react'
import { useChoferes, useCreateChofer, useUpdateChofer, useDeleteChofer, useCamiones, useBateas } from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import { ChoferDocumentosSection } from './ChoferDocumentosSection'
import type { Chofer } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',   label: 'Activo'        },
  { value: 'descanso', label: 'De descanso'   },
  { value: 'inactivo', label: 'Inactivo'      },
]

export function ChoferesTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()
  const { data: bateas   = [] } = useBateas()
  const { mutate: create, isPending: creating } = useCreateChofer()
  const { mutate: update, isPending: updating } = useUpdateChofer()
  const { mutate: remove } = useDeleteChofer()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Chofer | null>(null)
  // El modal arranca en modo detalle (read-only). El usuario apreta "Editar"
  // para habilitar el form. Cancelar vuelve a detalle y descarta cambios.
  const [modoEdicion, setModoEdicion] = useState(false)
  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  function defaultsFromChofer(chofer: Chofer) {
    return {
      nombre:            chofer.nombre,
      cuil:              chofer.cuil ?? '',
      tel:               chofer.tel ?? '',
      licencia:          chofer.licencia ?? '',
      estado:            chofer.estado,
      camion_id:         chofer.camion_id ?? '',
      batea_id:          chofer.batea_id ?? '',
      obs:               chofer.obs ?? '',
    }
  }

  function normalizar(data: any) {
    // Los inputs type="number" del form devuelven string. Convierto a
    // number antes de mandar al backend (el schema rechaza "" o strings).
    return {
      ...data,
      camion_id: data.camion_id ? Number(data.camion_id) : null,
      batea_id:  data.batea_id  ? Number(data.batea_id)  : null,
    }
  }

  // Format helper para la sección read-only de pago vigente.
  function fmtMonto(n: number | null | undefined): string {
    if (n == null || n === 0) return '—'
    return '$' + Math.round(n).toLocaleString('es-AR')
  }

  function handleCreate(data: any) {
    create(normalizar(data), {
      onSuccess: () => { toast('✓ Chofer agregado', 'ok'); setModalNuevo(false); formNuevo.reset() },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: normalizar(data) }, {
      onSuccess: () => {
        toast('✓ Chofer actualizado', 'ok')
        // Volver a modo detalle dentro del mismo modal — el usuario sigue
        // viendo los datos actualizados sin tener que reabrirlo.
        setModoEdicion(false)
      },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleDelete(chofer: Chofer) {
    if (!confirm(`¿Eliminar a ${chofer.nombre}?`)) return
    remove(chofer.id, {
      onSuccess: () => toast('✓ Chofer eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEdit(chofer: Chofer) {
    formEdit.reset(defaultsFromChofer(chofer))
    setModoEdicion(false)   // Siempre arranca como detalle.
    setEditando(chofer)
  }

  function cerrarModal() {
    setEditando(null)
    setModoEdicion(false)
  }

  function cancelarEdicion() {
    if (editando) formEdit.reset(defaultsFromChofer(editando))   // Descartar cambios.
    setModoEdicion(false)
  }

  const camionOptions = [
    { value: '', label: 'Sin asignar' },
    ...camiones.filter(c => c.estado === 'activo').map(c => ({
      value: c.id,
      label: `${c.patente}${c.modelo ? ` — ${c.modelo}` : ''}`,
    })),
  ]

  const bateaOptions = [
    { value: '', label: 'Sin asignar' },
    ...bateas.filter(b => b.estado === 'activo').map(b => ({
      value: b.id,
      label: `${b.patente}${b.tipo ? ` — ${b.tipo}` : ''}`,
    })),
  ]

  const ChoferForm = ({ form, disabled }: { form: any; disabled?: boolean }) => (
    <div className="flex flex-col gap-4">
      <Input label="Nombre completo" placeholder="Apellido, Nombre" disabled={disabled} {...form.register('nombre')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="CUIL" placeholder="20-12345678-3" disabled={disabled} {...form.register('cuil')} />
        <Input label="Teléfono" placeholder="299-XXX-XXXX" disabled={disabled} {...form.register('tel')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Licencia" placeholder="Nº licencia" disabled={disabled} {...form.register('licencia')} />
        <Select label="Estado" options={ESTADO_OPTIONS} disabled={disabled} {...form.register('estado')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Camión asignado" options={camionOptions} disabled={disabled} {...form.register('camion_id')} />
        <Select label="Batea asignada"  options={bateaOptions}  disabled={disabled} {...form.register('batea_id')} />
      </div>
      <Input label="Observaciones" placeholder="Notas..." disabled={disabled} {...form.register('obs')} />
    </div>
  )

  // Bloque read-only de pago vigente. El admin lo edita desde Liquidaciones.
  function PagoVigente({ chofer }: { chofer: Chofer }) {
    return (
      <div className="bg-gris/40 rounded-lg p-3 border border-gris-mid">
        <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-2">
          Pago vigente
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-gris-dark">Básico/día</div>
            <div className="font-mono font-bold text-azul">{fmtMonto(chofer.basico_dia)}</div>
          </div>
          <div>
            <div className="text-[11px] text-gris-dark">🚛 $/km cargado</div>
            <div className="font-mono font-bold text-azul">{fmtMonto(chofer.precio_km_cargado)}</div>
          </div>
          <div>
            <div className="text-[11px] text-gris-dark">🔲 $/km vacío</div>
            <div className="font-mono font-bold text-azul">{fmtMonto(chofer.precio_km_vacio)}</div>
          </div>
        </div>
        <p className="text-[11px] text-gris-dark italic mt-2">
          Se edita desde Liquidaciones al armar una liquidación.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end">
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo chofer</Button>
        )}
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Nombre', 'CUIL', 'Teléfono', 'Licencia', 'Camión', 'Batea', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {choferes.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gris-dark text-sm">No hay choferes registrados.</td></tr>
            ) : choferes.map(c => {
              const camionAsig = camiones.find(cam => cam.id === c.camion_id)
              const bateaAsig  = bateas.find(b => b.id === c.batea_id)
              return (
              <tr
                key={c.id}
                className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                onClick={() => openEdit(c)}
              >
                <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.cuil || '—'}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{c.tel || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{c.licencia || '—'}</td>
                <td className="px-4 py-3">
                  {camionAsig
                    ? <span className="font-mono text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">{camionAsig.patente}</span>
                    : <span className="text-gris-mid text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {bateaAsig
                    ? <span className="font-mono text-xs font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">{bateaAsig.patente}</span>
                    : <span className="text-gris-mid text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={c.estado === 'descanso' ? 'Descanso' : undefined}
                  />
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                  {puedeEliminar && <button onClick={() => handleDelete(c)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
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
        {choferes.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            No hay choferes registrados.
          </div>
        ) : choferes.map(c => {
          const camionAsig = camiones.find(cam => cam.id === c.camion_id)
          const bateaAsig  = bateas.find(b => b.id === c.batea_id)
          return (
            <button
              key={c.id}
              onClick={() => openEdit(c)}
              className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-carbon truncate">{c.nombre}</div>
                  <div className="text-xs text-gris-dark mt-0.5">
                    {c.cuil || 'sin CUIL'}{c.tel ? ` · ${c.tel}` : ''}
                  </div>
                </div>
                <Badge
                  variant={c.estado === 'activo' ? 'activo' : c.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                  label={c.estado === 'descanso' ? 'Descanso' : undefined}
                />
              </div>
              {(camionAsig || bateaAsig) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {camionAsig && (
                    <span className="font-mono text-[11px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                      🚚 {camionAsig.patente}
                    </span>
                  )}
                  {bateaAsig && (
                    <span className="font-mono text-[11px] font-bold bg-naranja-light text-naranja-dark px-2 py-0.5 rounded">
                      🛻 {bateaAsig.patente}
                    </span>
                  )}
                </div>
              )}
              {puedeEliminar && (
                <div className="flex justify-end mt-2 pt-2 border-t border-gris">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                    className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                  >
                    ✕ Eliminar
                  </button>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="👷 NUEVO CHOFER"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <ChoferForm form={formNuevo} />
      </Modal>

      <Modal
        open={!!editando}
        onClose={cerrarModal}
        title={modoEdicion ? '✏️ EDITAR CHOFER' : '👷 DETALLE CHOFER'}
        width="max-w-3xl"
        footer={
          modoEdicion ? (
            <>
              <Button variant="secondary" onClick={cancelarEdicion}>Cancelar</Button>
              <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={cerrarModal}>Cerrar</Button>
              {puedeEditar && (
                <Button variant="primary" onClick={() => setModoEdicion(true)}>✏️ Editar</Button>
              )}
            </>
          )
        }
      >
        <div className="flex flex-col gap-5">
          <ChoferForm form={formEdit} disabled={!modoEdicion} />

          {editando && <PagoVigente chofer={editando} />}

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <ChoferDocumentosSection choferId={editando.id} />
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