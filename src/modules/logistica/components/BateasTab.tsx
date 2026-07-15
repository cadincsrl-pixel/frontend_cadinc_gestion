'use client'

import { useState } from 'react'
import { useBateas, useCreateBatea, useUpdateBatea, useDeleteBatea } from '../hooks/useLogistica'
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
import type { Batea } from '@/types/domain.types'

const ESTADO_OPTIONS = [
  { value: 'activo',         label: 'Activo'         },
  { value: 'mantenimiento',  label: 'En mantenimiento' },
  { value: 'inactivo',       label: 'Inactivo'       },
]

// Tipo de remolque — vocabulario real de la flota (unificado 2026-07-15).
const TIPO_LABEL: Record<string, string> = {
  batea:           'Batea',
  acoplado:        'Acoplado',
  semirremolque:   'Semirremolque',
  sider:           'Sider',
  tanque_cisterna: 'Tanque cisterna',
  otro:            'Otro',
}

const TIPO_OPTIONS = [
  { value: '',                label: 'Sin especificar' },
  ...Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label })),
]

interface FormValues {
  patente?:      string
  tipo?:         string
  marca?:        string
  modelo?:       string
  anio?:         string
  capacidad_m3?: string
  capacidad_tn?: string
  titular?:      string
  estado?:       string
  obs?:          string
}

export function BateasTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: bateas = [] } = useBateas()
  const { mutate: create, isPending: creating } = useCreateBatea()
  const { mutate: update, isPending: updating } = useUpdateBatea()
  const { mutate: remove } = useDeleteBatea()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<Batea | null>(null)
  // Filtro por tipo de remolque.
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const formNuevo = useForm<FormValues>({ defaultValues: { estado: 'activo', tipo: 'batea' } })
  const formEdit  = useForm<FormValues>()

  const bateasFiltradas = filtroTipo
    ? bateas.filter(b => (b.tipo ?? 'otro') === filtroTipo)
    : bateas

  function parseDto(data: FormValues): any {
    return {
      patente:      data.patente!.trim(),
      tipo:         data.tipo || null,
      marca:        data.marca || null,
      modelo:       data.modelo || null,
      anio:         data.anio ? Number(data.anio) : null,
      capacidad_m3: data.capacidad_m3 ? Number(data.capacidad_m3) : null,
      capacidad_tn: data.capacidad_tn ? Number(data.capacidad_tn) : null,
      titular:      data.titular || null,
      estado:       data.estado || 'activo',
      obs:          data.obs || null,
    }
  }

  function handleCreate(data: FormValues) {
    if (!data.patente?.trim()) { toast('La patente es obligatoria', 'err'); return }
    create(parseDto(data), {
      onSuccess: () => { toast('✓ Remolque agregado', 'ok'); setModalNuevo(false); formNuevo.reset({ estado: 'activo' }) },
      onError:   () => toast('Error al agregar', 'err'),
    })
  }

  function handleUpdate(data: FormValues) {
    if (!editando) return
    update({ id: editando.id, dto: parseDto(data) }, {
      onSuccess: () => { toast('✓ Remolque actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function handleDelete(b: Batea) {
    if (!confirm(`¿Eliminar el remolque ${b.patente}?`)) return
    remove(b.id, {
      onSuccess: () => toast('✓ Remolque eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  function openEdit(b: Batea) {
    formEdit.reset({
      patente:      b.patente,
      tipo:         b.tipo ?? '',
      marca:        b.marca ?? '',
      modelo:       b.modelo ?? '',
      anio:         b.anio != null ? String(b.anio) : '',
      capacidad_m3: b.capacidad_m3 != null ? String(b.capacidad_m3) : '',
      capacidad_tn: b.capacidad_tn != null ? String(b.capacidad_tn) : '',
      titular:      b.titular ?? '',
      estado:       b.estado,
      obs:          b.obs ?? '',
    })
    setEditando(b)
  }

  const BateaForm = ({ form, disabled }: { form: any; disabled?: boolean }) => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Patente" placeholder="AA-123-BB" disabled={disabled} {...form.register('patente')} />
        <Select label="Tipo" options={TIPO_OPTIONS} disabled={disabled} {...form.register('tipo')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="Marca" placeholder="Helvética" disabled={disabled} {...form.register('marca')} />
        <Input label="Modelo" disabled={disabled} {...form.register('modelo')} />
        <Input label="Año" type="number" min={1980} max={2100} disabled={disabled} {...form.register('anio')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Capacidad (m³)" type="number" step="0.01" disabled={disabled} {...form.register('capacidad_m3')} />
        <Input label="Capacidad (tn)" type="number" step="0.01" disabled={disabled} {...form.register('capacidad_tn')} />
      </div>
      <Input label="Titular" placeholder="Propietario legal" disabled={disabled} {...form.register('titular')} />
      <Select label="Estado" options={ESTADO_OPTIONS} disabled={disabled} {...form.register('estado')} />
      <Input label="Observaciones" placeholder="Notas..." disabled={disabled} {...form.register('obs')} />
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Filtro por tipo de remolque — solo los tipos presentes en la flota */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: '', label: `Todos (${bateas.length})` },
            ...Object.entries(TIPO_LABEL)
              .map(([key, label]) => ({ key, label: `${label}s (${bateas.filter(b => (b.tipo ?? 'otro') === key).length})` }))
              .filter(opt => !opt.label.endsWith('(0)')),
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFiltroTipo(opt.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
                filtroTipo === opt.key ? 'bg-azul text-white border-azul' : 'bg-white border-azul text-azul-mid hover:bg-gris/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo remolque</Button>
        )}
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden mt-3">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Patente', 'Tipo', 'Marca/Modelo', 'Año', 'Capacidad', 'Titular', 'Estado', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bateasFiltradas.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm">No hay remolques registrados.</td></tr>
            ) : bateasFiltradas.map(b => (
              <tr
                key={b.id}
                className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                onClick={() => openEdit(b)}
              >
                <td className="px-4 py-3 font-mono text-sm font-bold text-carbon">{b.patente}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">{b.tipo ? (TIPO_LABEL[b.tipo] ?? b.tipo) : '—'}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">
                  {b.marca || b.modelo ? `${b.marca ?? ''} ${b.modelo ?? ''}`.trim() : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gris-dark">{b.anio ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gris-dark">
                  {b.capacidad_m3 != null && <span>{b.capacidad_m3}m³</span>}
                  {b.capacidad_m3 != null && b.capacidad_tn != null && <span className="text-gris-mid"> · </span>}
                  {b.capacidad_tn != null && <span>{b.capacidad_tn}tn</span>}
                  {b.capacidad_m3 == null && b.capacidad_tn == null && '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gris-dark">{b.titular ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={b.estado === 'activo' ? 'activo' : b.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                    label={b.estado === 'mantenimiento' ? 'En mantenimiento' : undefined}
                  />
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                  {puedeEliminar && <button onClick={() => handleDelete(b)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2 mt-3">
        {bateasFiltradas.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            No hay remolques registrados.
          </div>
        ) : bateasFiltradas.map(b => {
          const marcaModelo = b.marca || b.modelo ? `${b.marca ?? ''} ${b.modelo ?? ''}`.trim() : ''
          const capacidad = [
            b.capacidad_m3 != null ? `${b.capacidad_m3}m³` : null,
            b.capacidad_tn != null ? `${b.capacidad_tn}tn` : null,
          ].filter(Boolean).join(' · ')
          const subtitulo = [
            b.tipo ? <span key="t">{TIPO_LABEL[b.tipo] ?? b.tipo}</span> : null,
            marcaModelo || null,
            b.anio ?? null,
          ].filter(Boolean)
          return (
            <button
              key={b.id}
              onClick={() => openEdit(b)}
              className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-sm text-carbon truncate">{b.patente}</div>
                  {subtitulo.length > 0 && (
                    <div className="text-xs text-gris-dark mt-0.5">
                      {subtitulo.map((s, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {(capacidad || b.titular) && (
                    <div className="text-xs text-gris-dark mt-0.5">
                      {capacidad}
                      {capacidad && b.titular && ' · '}
                      {b.titular}
                    </div>
                  )}
                </div>
                <Badge
                  variant={b.estado === 'activo' ? 'activo' : b.estado === 'inactivo' ? 'inactivo' : 'pendiente'}
                  label={b.estado === 'mantenimiento' ? 'En mantenimiento' : undefined}
                />
              </div>
              {puedeEliminar && (
                <div className="flex justify-end mt-2 pt-2 border-t border-gris">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(b) }}
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

      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🛻 NUEVO REMOLQUE"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <BateaForm form={formNuevo} />
      </Modal>

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={puedeEditar ? '✏️ EDITAR REMOLQUE' : '🛻 DETALLE REMOLQUE'}
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
          <BateaForm form={formEdit} disabled={!puedeEditar} />

          {editando && (
            <div className="border-t border-gris-mid pt-4">
              <VehiculoDocumentosSection entidad="batea" id={editando.id} />
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
