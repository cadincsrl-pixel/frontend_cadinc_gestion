'use client'

import { useState, useMemo } from 'react'
import {
  useHerramientas, useHerrConfig,
  useCreateHerramienta, useUpdateHerramienta, useDeleteHerramienta,
} from '../hooks/useHerramientas'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import { usePermisos } from '@/hooks/usePermisos'
import type { Herramienta } from '@/types/domain.types'

const ESTADO_COLORS: Record<string, string> = {
  disponible: 'bg-verde-light text-verde',
  uso:        'bg-naranja-light text-naranja-dark',
  reparacion: 'bg-rojo-light text-rojo',
  baja:       'bg-gris text-gris-dark',
}

function fmtFecha(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function HerrInventario() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('herramientas')
  const { data: herramientas = [], isLoading } = useHerramientas()
  const { data: config }                        = useHerrConfig()
  const { mutate: create,  isPending: creating  } = useCreateHerramienta()
  const { mutate: update,  isPending: updating  } = useUpdateHerramienta()
  const { mutate: remove                        } = useDeleteHerramienta()

  const [modalNuevo,  setModalNuevo]  = useState(false)
  const [editando,    setEditando]    = useState<Herramienta | null>(null)
  const [detalle,     setDetalle]     = useState<Herramienta | null>(null)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroEstado,setFiltroEstado]= useState('')

  const formNuevo = useForm<any>()
  const formEdit  = useForm<any>()

  const filtradas = useMemo(() => {
    return herramientas.filter(h => {
      const q = busqueda.toLowerCase()
      const matchQ = !q ||
        h.codigo.toLowerCase().includes(q) ||
        h.nom.toLowerCase().includes(q)    ||
        (h.marca ?? '').toLowerCase().includes(q) ||
        (h.serie ?? '').toLowerCase().includes(q)
      const matchTipo   = !filtroTipo   || String(h.tipo_id) === filtroTipo
      const matchEstado = !filtroEstado || h.estado_key === filtroEstado
      return matchQ && matchTipo && matchEstado
    })
  }, [herramientas, busqueda, filtroTipo, filtroEstado])

  function handleCreate(data: any) {
    create(
      { ...data, tipo_id: data.tipo_id ? Number(data.tipo_id) : null },
      {
        onSuccess: () => {
          toast('✓ Herramienta creada', 'ok')
          setModalNuevo(false)
          formNuevo.reset()
        },
        onError: (e: any) => toast(e.message ?? 'Error al crear', 'err'),
      }
    )
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update(
      {
        id:  editando.id,
        dto: { ...data, tipo_id: data.tipo_id ? Number(data.tipo_id) : null },
      },
      {
        onSuccess: () => {
          toast('✓ Herramienta actualizada', 'ok')
          setEditando(null)
        },
        onError: () => toast('Error al actualizar', 'err'),
      }
    )
  }

  function handleDelete(h: Herramienta) {
    if (!confirm(`¿Dar de baja "${h.nom}"? No se podrá revertir.`)) return
    remove(h.id, {
      onSuccess: () => toast('✓ Herramienta dada de baja', 'ok'),
      onError:   () => toast('Error al dar de baja', 'err'),
    })
  }

  function openEdit(h: Herramienta) {
    formEdit.reset({
      nom:           h.nom,
      tipo_id:       String(h.tipo_id ?? ''),
      marca:         h.marca   ?? '',
      modelo:        h.modelo  ?? '',
      serie:         h.serie   ?? '',
      fecha_ingreso: h.fecha_ingreso ?? '',
      obs:           h.obs     ?? '',
    })
    setEditando(h)
  }

  const tipoOptions = (config?.tipos ?? []).map(t => ({ value: String(t.id), label: `${t.icono ?? ''} ${t.nom}` }))

  function nextCodigo() {
    const nums = herramientas
      .map(h => h.codigo.match(/^HER-(\d+)$/))
      .filter(Boolean)
      .map(m => parseInt(m![1]))
    const max = nums.length ? Math.max(...nums) : 0
    return `HER-${String(max + 1).padStart(3, '0')}`
  }

  const HerrForm = ({ form, errors, codigoReadOnly }: { form: any; errors: any; codigoReadOnly?: boolean }) => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Código *"
          placeholder="HER-001"
          error={errors.codigo?.message}
          readOnly={codigoReadOnly}
          className={codigoReadOnly ? 'bg-gris cursor-not-allowed' : ''}
          {...form.register('codigo', { required: 'Requerido' })}
        />
        <Input
          label="Nombre *"
          placeholder="Taladro percutor"
          error={errors.nom?.message}
          {...form.register('nom', { required: 'Requerido' })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Tipo"
          options={[{ value: '', label: '— Sin tipo —' }, ...tipoOptions]}
          {...form.register('tipo_id')}
        />
        <Input
          label="Marca"
          placeholder="Bosch, Makita..."
          {...form.register('marca')}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Modelo"
          placeholder="GSB 21-2"
          {...form.register('modelo')}
        />
        <Input
          label="N° de serie"
          placeholder="Opcional"
          {...form.register('serie')}
        />
      </div>
      <Input
        label="Fecha de ingreso"
        type="date"
        {...form.register('fecha_ingreso')}
      />
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
          Observaciones
        </label>
        <textarea
          rows={3}
          placeholder="Estado inicial, notas, etc."
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors resize-none"
          {...form.register('obs')}
        />
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">INVENTARIO</h1>
          <p className="text-sm text-gris-dark mt-0.5">
            {herramientas.length} herramienta{herramientas.length !== 1 ? 's' : ''} registrada{herramientas.length !== 1 ? 's' : ''}
          </p>
        </div>
        {puedeCrear && (
          <Button variant="primary" size="sm" onClick={() => { formNuevo.setValue('codigo', nextCodigo()); setModalNuevo(true) }}>
            ＋ Nueva herramienta
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Buscar por código, nombre, marca o serie..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
        >
          <option value="">Todos los tipos</option>
          {(config?.tipos ?? []).map(t => (
            <option key={t.id} value={String(t.id)}>{t.icono} {t.nom}</option>
          ))}
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja transition-colors bg-white"
        >
          <option value="">Todos los estados</option>
          {(config?.estados ?? []).map(e => (
            <option key={e.key} value={e.key}>{e.icono} {e.nom}</option>
          ))}
        </select>
        {(busqueda || filtroTipo || filtroEstado) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroEstado('') }}
            className="text-xs font-bold text-gris-dark hover:text-carbon px-2 py-1 rounded hover:bg-gris transition-colors"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Código', 'Herramienta', 'Tipo', 'Marca / Modelo', 'Obra actual', 'Estado', 'Responsable', ''].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gris-dark text-sm">
                    {busqueda || filtroTipo || filtroEstado
                      ? 'No se encontraron resultados para los filtros aplicados'
                      : 'No hay herramientas registradas. Agregá la primera.'
                    }
                  </td>
                </tr>
              ) : (
                filtradas.map(h => (
                  <tr
                    key={h.id}
                    className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                    onClick={() => setDetalle(h)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                        {h.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-sm text-carbon">{h.nom}</td>
                    <td className="px-4 py-3">
                      {h.tipo ? (
                        <span className="text-xs font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                          {h.tipo.icono} {h.tipo.nom}
                        </span>
                      ) : (
                        <span className="text-gris-mid text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {[h.marca, h.modelo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {h.obra ? (
                        <span className="font-mono text-xs bg-naranja-light text-naranja-dark px-2 py-0.5 rounded font-bold">
                          {h.obra.cod}
                        </span>
                      ) : (
                        <span className="text-xs text-gris-dark">Depósito</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${ESTADO_COLORS[h.estado_key] ?? 'bg-gris text-gris-dark'}`}>
                        {h.estado?.icono} {h.estado?.nom ?? h.estado_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gris-dark">
                      {h.responsable || '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {puedeEditar && (
                          <button
                            onClick={() => openEdit(h)}
                            className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                          >
                            ✏️
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            onClick={() => handleDelete(h)}
                            className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nuevo */}
      <Modal
        open={modalNuevo}
        onClose={() => { setModalNuevo(false); formNuevo.reset() }}
        title="🔧 NUEVA HERRAMIENTA"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalNuevo(false); formNuevo.reset() }}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <HerrForm form={formNuevo} errors={formNuevo.formState.errors} codigoReadOnly />
      </Modal>

      {/* Modal editar */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="✏️ EDITAR HERRAMIENTA"
        footer={
          <>
            <Button variant="danger" onClick={() => editando && handleDelete(editando)} className="mr-auto">
              🗑 Dar de baja
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <HerrForm form={formEdit} errors={formEdit.formState.errors} />
        <AuditInfo
          createdBy={editando?.created_by}
          updatedBy={editando?.updated_by}
          createdAt={editando?.created_at}
          updatedAt={editando?.updated_at}
        />
      </Modal>

      {/* Modal detalle */}
      {detalle && (
        <Modal
          open={!!detalle}
          onClose={() => setDetalle(null)}
          title={`🔧 ${detalle.codigo} — ${detalle.nom}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
              <Button variant="primary" onClick={() => { setDetalle(null); openEdit(detalle) }}>
                ✏️ Editar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Código"       value={detalle.codigo} />
              <InfoField label="Tipo"         value={detalle.tipo ? `${detalle.tipo.icono ?? ''} ${detalle.tipo.nom}` : '—'} />
              <InfoField label="Marca"        value={detalle.marca} />
              <InfoField label="Modelo"       value={detalle.modelo} />
              <InfoField label="N° de serie"  value={detalle.serie} />
              <InfoField label="Fecha ingreso" value={fmtFecha(detalle.fecha_ingreso)} />
              <InfoField label="Estado"       value={`${detalle.estado?.icono ?? ''} ${detalle.estado?.nom ?? detalle.estado_key}`} />
              <InfoField label="Ubicación"    value={detalle.obra ? `${detalle.obra.cod} — ${detalle.obra.nom}` : 'Depósito'} />
              <InfoField label="Responsable"  value={detalle.responsable} />
            </div>
            {detalle.obs && (
              <div className="bg-gris rounded-xl p-3">
                <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1">Observaciones</div>
                <p className="text-sm text-carbon">{detalle.obs}</p>
              </div>
            )}
            <AuditInfo
              createdBy={detalle.created_by}
              updatedBy={detalle.updated_by}
              createdAt={detalle.created_at}
              updatedAt={detalle.updated_at}
            />
          </div>
        </Modal>
      )}

    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-carbon">
        {value || <span className="text-gris-mid font-normal">—</span>}
      </span>
    </div>
  )
}