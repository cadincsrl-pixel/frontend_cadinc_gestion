'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSolicitudes, useCreateSolicitud, useUpdateSolicitud, useDeleteSolicitud } from '../hooks/useSolicitudes'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { SolicitudCompra, SolicitudCompraItem, SolicitudEstado, Obra } from '@/types/domain.types'

const UNIDADES = [
  { value: 'unid', label: 'Unid.' },
  { value: 'kg',   label: 'kg'    },
  { value: 'tn',   label: 'tn'    },
  { value: 'lt',   label: 'lt'    },
  { value: 'm',    label: 'm'     },
  { value: 'm2',   label: 'm²'    },
  { value: 'm3',   label: 'm³'    },
  { value: 'gl',   label: 'gl'    },
]

const ESTADO_CONFIG: Record<SolicitudEstado, { label: string; bg: string; text: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  aprobada:  { label: 'Aprobada',  bg: 'bg-azul-light',     text: 'text-azul'      },
  rechazada: { label: 'Rechazada', bg: 'bg-rojo-light',     text: 'text-rojo'      },
  enviada:   { label: 'Enviada',   bg: 'bg-naranja-light',  text: 'text-naranja'   },
  recibida:  { label: 'Recibida',  bg: 'bg-verde-light',    text: 'text-verde'     },
}

function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }

// ── Línea de ítem en formulario ──
interface LineaForm {
  _id: number
  descripcion: string
  cantidad: number
  unidad: string
  obs: string
}

let nextId = 1
function newLinea(): LineaForm {
  return { _id: nextId++, descripcion: '', cantidad: 1, unidad: 'unid', obs: '' }
}

function LineaRow({
  linea, onChange, onRemove, showRemove,
}: {
  linea: LineaForm
  onChange: (l: LineaForm) => void
  onRemove: () => void
  showRemove: boolean
}) {
  return (
    <tr className="border-b border-gris last:border-0">
      <td className="py-1.5 pr-2">
        <input
          type="text"
          placeholder="Descripción del material..."
          value={linea.descripcion}
          onChange={e => onChange({ ...linea, descripcion: e.target.value })}
          className="w-full px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja"
        />
      </td>
      <td className="py-1.5 pr-2 w-20">
        <input
          type="number"
          min="0"
          step="0.001"
          value={linea.cantidad}
          onChange={e => onChange({ ...linea, cantidad: parseFloat(e.target.value) || 0 })}
          className="w-full px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja"
        />
      </td>
      <td className="py-1.5 pr-2 w-20">
        <select
          value={linea.unidad}
          onChange={e => onChange({ ...linea, unidad: e.target.value })}
          className="w-full px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
        >
          {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="text"
          placeholder="Obs..."
          value={linea.obs}
          onChange={e => onChange({ ...linea, obs: e.target.value })}
          className="w-full px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja"
        />
      </td>
      <td className="py-1.5 w-8 text-center">
        {showRemove && (
          <button onClick={onRemove} className="text-gris-mid hover:text-rojo text-sm font-bold transition-colors">✕</button>
        )}
      </td>
    </tr>
  )
}

// ── Estado chip ──
function EstadoChip({ estado }: { estado: SolicitudEstado }) {
  const cfg = ESTADO_CONFIG[estado]
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Prioridad chip ──
function PrioridadChip({ prioridad }: { prioridad: 'normal' | 'urgente' }) {
  if (prioridad === 'normal') return null
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rojo text-white uppercase tracking-wide">
      Urgente
    </span>
  )
}

// ── Componente principal ──
export function SolicitudesTab() {
  const toast = useToast()
  const perfiles = usePerfilesMap()
  const { data: obras = [] } = useObras()
  const [obraFiltro, setObraFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string>('')
  const { data: solicitudes = [], isLoading } = useSolicitudes(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateSolicitud()
  const { mutate: update } = useUpdateSolicitud()
  const { mutate: remove } = useDeleteSolicitud()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalle, setDetalle] = useState<SolicitudCompra | null>(null)
  const [lineas, setLineas] = useState<LineaForm[]>([newLinea()])
  const [obraNueva, setObraNueva] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const formCab = useForm<any>({ defaultValues: { prioridad: 'normal', obs: '' } })

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions = obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))
  const obrasMap = new Map((obras as Obra[]).map(o => [o.cod, o]))

  // Filtrar por estado
  const filtered = estadoFiltro
    ? (solicitudes as SolicitudCompra[]).filter(s => s.estado === estadoFiltro)
    : (solicitudes as SolicitudCompra[])

  // Ordenar: urgentes primero, luego por fecha desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad === 'urgente' ? -1 : 1
    return b.fecha.localeCompare(a.fecha)
  })

  // Contadores por estado
  const contadores = (solicitudes as SolicitudCompra[]).reduce((acc, s) => {
    acc[s.estado] = (acc[s.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function abrirNuevo() {
    setLineas([newLinea()])
    setObraNueva('')
    formCab.reset({ prioridad: 'normal', obs: '' })
    setModalNuevo(true)
  }

  function handleCreate(cab: any) {
    if (!obraNueva) { toast('Selecciona una obra', 'err'); return }
    const items = lineas
      .filter(l => l.descripcion.trim())
      .map(l => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, obs: l.obs || null }))
    if (!items.length) { toast('Agrega al menos un material', 'err'); return }

    create({
      obra_cod: obraNueva,
      prioridad: cab.prioridad,
      obs: cab.obs || null,
      items,
    }, {
      onSuccess: () => { toast('Solicitud creada', 'ok'); setModalNuevo(false) },
      onError: () => toast('Error al crear solicitud', 'err'),
    })
  }

  function cambiarEstado(id: number, estado: SolicitudEstado) {
    const dto: any = { estado }
    if (estado === 'enviada') dto.fecha_envio = new Date().toISOString().slice(0, 10)
    update({ id, dto }, {
      onSuccess: () => toast(`Estado actualizado a "${ESTADO_CONFIG[estado].label}"`, 'ok'),
      onError: () => toast('Error al actualizar estado', 'err'),
    })
  }

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta solicitud?')) return
    remove(id, {
      onSuccess: () => { toast('Solicitud eliminada', 'ok'); setDetalle(null) },
      onError: () => toast('Error al eliminar', 'err'),
    })
  }

  // Siguiente estado posible
  function nextEstados(estado: SolicitudEstado): SolicitudEstado[] {
    switch (estado) {
      case 'pendiente': return ['aprobada', 'rechazada']
      case 'aprobada':  return ['enviada', 'rechazada']
      case 'enviada':   return ['recibida']
      default:          return []
    }
  }

  return (
    <>
      {/* Filtros y botón */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div className="min-w-[220px] max-w-xs">
            <Combobox placeholder="Filtrar por obra..." options={obraOptions} value={obraFiltro} onChange={setObraFiltro} />
          </div>
          <select
            value={estadoFiltro}
            onChange={e => setEstadoFiltro(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
          >
            <option value="">Todos los estados</option>
            {(Object.entries(ESTADO_CONFIG) as [SolicitudEstado, typeof ESTADO_CONFIG[SolicitudEstado]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label} {contadores[k] ? `(${contadores[k]})` : ''}</option>
            ))}
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={abrirNuevo}>
          + Nueva solicitud
        </Button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando solicitudes...
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  {['', 'Obra', 'Fecha', 'Items', 'Estado', 'Prioridad', 'Solicitante', ''].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gris-dark text-sm italic">
                      No hay solicitudes {estadoFiltro ? `con estado "${ESTADO_CONFIG[estadoFiltro as SolicitudEstado]?.label}"` : ''}.
                    </td>
                  </tr>
                ) : sorted.map(s => {
                  const obra = obrasMap.get(s.obra_cod)
                  const isExpanded = expanded.has(s.id)
                  const items = s.items ?? []

                  return (
                    <tr key={s.id}>
                      <td colSpan={8} className="p-0">
                        <table className="w-full">
                          <tbody>
                            {/* Fila principal */}
                            <tr
                              className="border-b border-gris hover:bg-gris/30 transition-colors cursor-pointer"
                              onClick={() => toggleExpand(s.id)}
                            >
                              <td className="px-4 py-3 w-8">
                                <span className="inline-block w-5 text-center text-gris-dark select-none text-xs">
                                  {items.length > 0 ? (isExpanded ? '▼' : '▶') : ' '}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs font-bold text-azul">{s.obra_cod}</span>
                                {obra && <div className="text-[11px] text-gris-dark">{obra.nom}</div>}
                              </td>
                              <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(s.fecha)}</td>
                              <td className="px-4 py-3">
                                <span className="text-sm font-semibold text-carbon">{items.length} material{items.length !== 1 ? 'es' : ''}</span>
                              </td>
                              <td className="px-4 py-3"><EstadoChip estado={s.estado} /></td>
                              <td className="px-4 py-3"><PrioridadChip prioridad={s.prioridad} /></td>
                              <td className="px-4 py-3 text-sm text-gris-dark">
                                {s.solicitante ? (perfiles.get(s.solicitante) ?? '…') : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                  {nextEstados(s.estado).map(ne => (
                                    <button
                                      key={ne}
                                      onClick={() => cambiarEstado(s.id, ne)}
                                      className={`text-[11px] font-bold px-2 py-1 rounded transition-colors ${ESTADO_CONFIG[ne].bg} ${ESTADO_CONFIG[ne].text} hover:opacity-80`}
                                    >
                                      → {ESTADO_CONFIG[ne].label}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => handleDelete(s.id)}
                                    className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Detalle de ítems expandido */}
                            {isExpanded && items.map((item, i) => (
                              <tr key={item.id ?? i} className="border-b border-gris bg-azul-light/40">
                                <td className="pl-8 pr-2 py-2 text-xs text-gris-mid text-center">{i + 1}</td>
                                <td colSpan={2} className="px-4 py-2 text-sm text-carbon font-medium">
                                  {item.descripcion}
                                </td>
                                <td className="px-4 py-2 text-sm text-gris-dark font-mono">
                                  {item.cantidad} {UNIDADES.find(u => u.value === item.unidad)?.label ?? item.unidad}
                                </td>
                                <td colSpan={3} className="px-4 py-2 text-xs text-gris-dark">
                                  {item.obs || ''}
                                </td>
                                <td />
                              </tr>
                            ))}

                            {/* Obs de la solicitud */}
                            {isExpanded && s.obs && (
                              <tr className="border-b border-gris bg-amarillo-light/30">
                                <td className="pl-8 pr-2 py-2 text-xs text-gris-mid">💬</td>
                                <td colSpan={7} className="px-4 py-2 text-sm text-[#7A5500] italic">
                                  {s.obs}
                                </td>
                              </tr>
                            )}

                            {/* Info de envío */}
                            {isExpanded && s.fecha_envio && (
                              <tr className="border-b border-gris bg-verde-light/30">
                                <td className="pl-8 pr-2 py-2 text-xs text-gris-mid">📦</td>
                                <td colSpan={7} className="px-4 py-2 text-sm text-verde font-semibold">
                                  Enviado el {fmtF(s.fecha_envio)}
                                  {s.aprobado_por && <span className="text-gris-dark font-normal ml-2">· Aprobado por {perfiles.get(s.aprobado_por) ?? '…'}</span>}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal nueva solicitud ── */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🛒 NUEVA SOLICITUD" width="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formCab.handleSubmit(handleCreate)}>
              Crear solicitud
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              label="Obra destino"
              placeholder="Buscar obra..."
              options={obraOptions}
              value={obraNueva}
              onChange={setObraNueva}
            />
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Prioridad</label>
              <select
                {...formCab.register('prioridad')}
                className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
              >
                <option value="normal">Normal</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <Input label="Observaciones" placeholder="Notas adicionales..." {...formCab.register('obs')} />

          {/* Líneas de ítems */}
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Materiales solicitados</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b-2 border-gris">
                    <th className="text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2">Descripción</th>
                    <th className="text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-20">Cantidad</th>
                    <th className="text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-20">Unidad</th>
                    <th className="text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2">Obs</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <LineaRow
                      key={l._id}
                      linea={l}
                      onChange={updated => setLineas(prev => prev.map(x => x._id === l._id ? updated : x))}
                      onRemove={() => setLineas(prev => prev.filter(x => x._id !== l._id))}
                      showRemove={lineas.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => setLineas(prev => [...prev, newLinea()])}
              className="mt-2 text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-1"
            >
              + Agregar material
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
