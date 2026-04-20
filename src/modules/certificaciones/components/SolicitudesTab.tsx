'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  useSolicitudes, useCreateSolicitud, useUpdateSolicitud, useDeleteSolicitud,
  useComprarItem, useDespacharItem, useEnviarItem, useRechazarItem, useRevertirItem,
} from '../hooks/useSolicitudes'
import { useProveedores, useCreateProveedor } from '../hooks/useProveedores'
import { useFacturasCompra, useCreateFactura } from '../hooks/useFacturasCompra'
import { useStockMateriales } from '../hooks/useStock'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { createClient } from '@/lib/supabase/client'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { SolicitudCompra, SolicitudCompraItem, SolicitudEstado, SolicitudProgreso, ItemEstado, Obra, Proveedor, StockMaterial } from '@/types/domain.types'

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

const ESTADO_SOL: Record<SolicitudEstado, { label: string; bg: string; text: string }> = {
  pendiente: { label: 'Pend. aprobación', bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  aprobada:  { label: 'Aprobada',         bg: 'bg-azul-light',     text: 'text-azul'      },
  rechazada: { label: 'Rechazada',        bg: 'bg-rojo-light',     text: 'text-rojo'      },
}

const PROGRESO_CFG: Record<SolicitudProgreso, { label: string; bg: string; text: string }> = {
  pendiente:  { label: 'Pendiente',  bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  en_gestion: { label: 'En gestión', bg: 'bg-naranja-light',  text: 'text-naranja'   },
  enviada:    { label: 'Enviada',    bg: 'bg-verde-light',    text: 'text-verde'     },
}

const ITEM_ESTADO_CFG: Record<ItemEstado, { label: string; bg: string; text: string }> = {
  pendiente:   { label: 'Pendiente',    bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  comprado:    { label: 'Comprado',     bg: 'bg-azul-light',     text: 'text-azul'      },
  de_deposito: { label: 'De depósito',  bg: 'bg-naranja-light',  text: 'text-naranja'   },
  enviado:     { label: 'Enviado',      bg: 'bg-verde-light',    text: 'text-verde'     },
  rechazado:   { label: 'Rechazado',    bg: 'bg-rojo-light',     text: 'text-rojo'      },
}

function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }

const BUCKET = 'cert-adjuntos'
async function uploadAdjunto(file: File): Promise<{ url: string; nombre: string }> {
  const supabase = createClient()
  const ext  = file.name.split('.').pop()
  const path = `fact_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nombre: file.name }
}

// ── Línea de ítem en formulario de nueva solicitud ──
interface LineaForm { _id: number; descripcion: string; cantidad: number; unidad: string; obs: string; material_id: number | null }
let nextId = 1
function newLinea(): LineaForm { return { _id: nextId++, descripcion: '', cantidad: 1, unidad: 'unid', obs: '', material_id: null } }

// ── Componente principal ──
export function SolicitudesTab() {
  const toast = useToast()
  const perfiles = usePerfilesMap()
  const { data: obras = [] } = useObras()
  const { data: proveedores = [] } = useProveedores()
  const { data: facturas = [] } = useFacturasCompra()
  const { data: stockMateriales = [] } = useStockMateriales()
  const { mutate: createProveedor } = useCreateProveedor()
  const { mutate: createFactura } = useCreateFactura()
  const stockMap = new Map((stockMateriales as StockMaterial[]).map(m => [m.id, m]))

  const [obraFiltro, setObraFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string>('')
  const { data: solicitudes = [], isLoading } = useSolicitudes(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateSolicitud()
  const { mutate: updateSol } = useUpdateSolicitud()
  const { mutate: removeSol } = useDeleteSolicitud()
  const { mutate: comprarItem } = useComprarItem()
  const { mutate: despacharItem } = useDespacharItem()
  const { mutate: enviarItem } = useEnviarItem()
  const { mutate: rechazarItem } = useRechazarItem()
  const { mutate: revertirItem } = useRevertirItem()

  // Estado UI
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalEditar, setModalEditar] = useState<SolicitudCompra | null>(null)
  const [lineas, setLineas] = useState<LineaForm[]>([newLinea()])
  const [lineasEdit, setLineasEdit] = useState<(LineaForm & { itemId?: number; estado?: string })[]>([])
  const [itemsAEliminar, setItemsAEliminar] = useState<number[]>([])
  const [obraNueva, setObraNueva] = useState('')
  const [obraEdit, setObraEdit] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Modales de acciones sobre ítems
  const [modalComprar, setModalComprar] = useState<SolicitudCompraItem | null>(null)
  const [modalDespachar, setModalDespachar] = useState<SolicitudCompraItem | null>(null)
  const [modalNuevoProveedor, setModalNuevoProveedor] = useState(false)
  const [modalNuevaFactura, setModalNuevaFactura] = useState(false)

  // Forms
  const formCab = useForm<any>({ defaultValues: { prioridad: 'normal', obs: '' } })
  const formEdit = useForm<any>({ defaultValues: { prioridad: 'normal', obs: '' } })
  const formComprar = useForm<any>({ defaultValues: { proveedor_id: '', precio_unit: 0, factura_id: '' } })
  const formDespachar = useForm<any>({ defaultValues: { precio_unit: 0 } })
  const formProv = useForm<any>({ defaultValues: { nombre: '', cuit: '', tel: '' } })
  const formFact = useForm<any>({ defaultValues: { proveedor_id: '', numero: '', fecha: '', total: 0 } })

  // Factura upload
  const fileRef = useRef<HTMLInputElement>(null)
  const [adjunto, setAdjunto] = useState<{ url: string; nombre: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions = obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))
  const obrasMap = new Map((obras as Obra[]).map(o => [o.cod, o]))
  const provOptions = (proveedores as Proveedor[]).map(p => ({ value: String(p.id), label: p.nombre, sub: p.cuit ?? undefined }))

  // Filtrar
  const filtered = (solicitudes as SolicitudCompra[]).filter(s => {
    if (!estadoFiltro) return true
    if (estadoFiltro === 'pendiente' || estadoFiltro === 'rechazada') return s.estado === estadoFiltro
    if (estadoFiltro === 'aprobada') return s.estado === 'aprobada' && s.progreso === 'pendiente'
    if (estadoFiltro === 'en_gestion') return s.progreso === 'en_gestion'
    if (estadoFiltro === 'enviada') return s.progreso === 'enviada'
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad === 'urgente' ? -1 : 1
    return b.fecha.localeCompare(a.fecha)
  })

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Crear solicitud ──
  function abrirNuevo() {
    setLineas([newLinea()]); setObraNueva(''); formCab.reset({ prioridad: 'normal', obs: '' }); setModalNuevo(true)
  }

  function handleCreate(cab: any) {
    if (!obraNueva) { toast('Seleccioná una obra', 'err'); return }
    const items = lineas.filter(l => l.descripcion.trim()).map(l => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, obs: l.obs || null, material_id: l.material_id }))
    if (!items.length) { toast('Agregá al menos un material', 'err'); return }
    create({ obra_cod: obraNueva, prioridad: cab.prioridad, obs: cab.obs || null, items }, {
      onSuccess: () => { toast('Solicitud creada', 'ok'); setModalNuevo(false) },
      onError: () => toast('Error al crear solicitud', 'err'),
    })
  }

  // ── Editar solicitud ──
  function abrirEditar(s: SolicitudCompra) {
    formEdit.reset({ prioridad: s.prioridad, obs: s.obs ?? '' })
    setObraEdit(s.obra_cod)
    setItemsAEliminar([])
    const editLines = (s.items ?? []).map((it, i) => ({
      _id: nextId++,
      itemId: it.id,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      unidad: it.unidad,
      obs: it.obs ?? '',
      material_id: it.material_id ?? null,
      estado: it.estado,
    }))
    setLineasEdit(editLines)
    setModalEditar(s)
  }

  function handleEditar(cab: any) {
    if (!modalEditar) return
    if (!obraEdit) { toast('Seleccioná una obra', 'err'); return }

    // Items nuevos o editados (solo pendientes)
    const itemsToSend = lineasEdit
      .filter(l => l.descripcion.trim() && (!l.estado || l.estado === 'pendiente'))
      .map(l => ({
        id: l.itemId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        unidad: l.unidad,
        obs: l.obs || null,
        material_id: l.material_id,
      }))

    updateSol({
      id: modalEditar.id,
      dto: {
        obra_cod: obraEdit,
        prioridad: cab.prioridad,
        obs: cab.obs || null,
        items: itemsToSend,
        remove_items: itemsAEliminar.length > 0 ? itemsAEliminar : undefined,
      },
    }, {
      onSuccess: () => { toast('Solicitud actualizada', 'ok'); setModalEditar(null) },
      onError: () => toast('Error al actualizar', 'err'),
    })
  }

  // ── Aprobar / Rechazar solicitud ──
  function aprobar(id: number) {
    updateSol({ id, dto: { estado: 'aprobada' } }, {
      onSuccess: () => toast('Solicitud aprobada', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }
  function rechazar(id: number) {
    updateSol({ id, dto: { estado: 'rechazada' } }, {
      onSuccess: () => toast('Solicitud rechazada', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }
  function eliminar(id: number) {
    if (!confirm('¿Eliminar esta solicitud?')) return
    removeSol(id, { onSuccess: () => toast('Eliminada', 'ok'), onError: (e: any) => toast(e.message || 'Error', 'err') })
  }

  // ── Acciones sobre ítems ──
  function abrirComprar(item: SolicitudCompraItem) {
    formComprar.reset({ proveedor_id: '', precio_unit: 0, factura_id: '' })
    setModalComprar(item)
  }
  function handleComprar(data: any) {
    if (!modalComprar?.id) return
    comprarItem({ itemId: modalComprar.id, dto: { proveedor_id: Number(data.proveedor_id), precio_unit: Number(data.precio_unit), factura_id: data.factura_id ? Number(data.factura_id) : null } }, {
      onSuccess: () => { toast('Compra registrada', 'ok'); setModalComprar(null) },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function abrirDespachar(item: SolicitudCompraItem) {
    const mat = item.material_id ? stockMap.get(item.material_id) : null
    formDespachar.reset({ precio_unit: mat?.precio_ref ?? 0 })
    setModalDespachar(item)
  }
  function handleDespachar(data: any) {
    if (!modalDespachar?.id) return
    despacharItem({ itemId: modalDespachar.id, dto: { precio_unit: Number(data.precio_unit) } }, {
      onSuccess: () => { toast('Despacho registrado', 'ok'); setModalDespachar(null) },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function handleEnviar(itemId: number) {
    enviarItem({ itemId }, {
      onSuccess: () => toast('Marcado como enviado', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function handleRechazarItem(itemId: number) {
    rechazarItem(itemId, {
      onSuccess: () => toast('Ítem rechazado', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function handleRevertir(itemId: number) {
    if (!confirm('¿Revertir este ítem a pendiente?')) return
    revertirItem(itemId, {
      onSuccess: () => toast('Revertido a pendiente', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  // ── Crear proveedor inline ──
  function handleCreateProv(data: any) {
    createProveedor(data, {
      onSuccess: (p: any) => {
        toast('Proveedor creado', 'ok')
        setModalNuevoProveedor(false)
        formComprar.setValue('proveedor_id', String(p.id))
      },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  // ── Crear factura inline ──
  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try { const r = await uploadAdjunto(file); setAdjunto(r); toast('Adjunto subido', 'ok') }
    catch { toast('Error al subir', 'err') }
    finally { setUploading(false) }
  }

  function handleCreateFact(data: any) {
    createFactura({ ...data, proveedor_id: Number(data.proveedor_id), total: Number(data.total) || 0, adjunto_url: adjunto?.url ?? '', adjunto_nombre: adjunto?.nombre ?? '' }, {
      onSuccess: (f: any) => {
        toast('Factura cargada', 'ok')
        setModalNuevaFactura(false)
        setAdjunto(null)
        formComprar.setValue('factura_id', String(f.id))
      },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div className="min-w-[220px] max-w-xs">
            <Combobox placeholder="Filtrar por obra..." options={obraOptions} value={obraFiltro} onChange={setObraFiltro} />
          </div>
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todos</option>
            <option value="pendiente">Pend. aprobación</option>
            <option value="aprobada">Aprobada — pendiente</option>
            <option value="en_gestion">En gestión</option>
            <option value="enviada">Enviada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={abrirNuevo}>+ Nueva solicitud</Button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[750px]">
              <thead>
                <tr>
                  {['', 'Obra', 'Fecha', 'Items', 'Estado', 'Solicitante', 'Prioridad', ''].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gris-dark text-sm italic">Sin solicitudes.</td></tr>
                ) : sorted.map(s => {
                  const obra = obrasMap.get(s.obra_cod)
                  const isExp = expanded.has(s.id)
                  const items = s.items ?? []

                  return (
                    <tr key={s.id}>
                      <td colSpan={8} className="p-0">
                        <table className="w-full"><tbody>
                          {/* Fila cabecera */}
                          <tr className="border-b border-gris hover:bg-gris/30 transition-colors cursor-pointer" onClick={() => toggleExpand(s.id)}>
                            <td className="px-4 py-3 w-8">
                              <span className="text-xs text-gris-dark select-none">{isExp ? '▼' : '▶'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-azul">{s.obra_cod}</span>
                              {obra && <div className="text-[11px] text-gris-dark">{obra.nom}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(s.fecha)}</td>
                            <td className="px-4 py-3">
                              {s.resumen ? (
                                <div className="text-sm">
                                  <span className="font-bold text-carbon">{s.resumen.resueltos}/{s.resumen.total}</span>
                                  <span className="text-gris-dark text-xs ml-1">resueltos</span>
                                  {s.resumen.enviados > 0 && (
                                    <span className="text-verde text-xs ml-2 font-bold">{s.resumen.enviados} enviados</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-gris-dark">{items.length} material{items.length !== 1 ? 'es' : ''}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {s.progreso ? (
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${PROGRESO_CFG[s.progreso].bg} ${PROGRESO_CFG[s.progreso].text}`}>
                                  {PROGRESO_CFG[s.progreso].label}
                                </span>
                              ) : (
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${ESTADO_SOL[s.estado].bg} ${ESTADO_SOL[s.estado].text}`}>
                                  {ESTADO_SOL[s.estado].label}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gris-dark">
                              {s.solicitante ? (perfiles.get(s.solicitante) ?? '…') : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {s.prioridad === 'urgente' && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rojo text-white uppercase">Urgente</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                {s.estado === 'pendiente' && (
                                  <>
                                    <button onClick={() => aprobar(s.id)} className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:opacity-80 transition-colors">Aprobar</button>
                                    <button onClick={() => rechazar(s.id)} className="text-[11px] font-bold px-2 py-1 rounded bg-rojo-light text-rojo hover:opacity-80 transition-colors">Rechazar</button>
                                  </>
                                )}
                                <button onClick={() => abrirEditar(s)} className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors">✏️ Editar</button>
                                <button onClick={() => eliminar(s.id)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                              </div>
                            </td>
                          </tr>

                          {/* Detalle de ítems */}
                          {isExp && items.map((item, i) => {
                            const cfg = ITEM_ESTADO_CFG[item.estado]
                            const stk = item.material_id ? stockMap.get(item.material_id) : null
                            return (
                              <tr key={item.id ?? i} className="border-b border-gris bg-gris/20">
                                <td className="pl-8 pr-2 py-2.5 text-xs text-gris-mid text-center">{i + 1}</td>
                                <td className="px-4 py-2.5">
                                  <div className="text-sm font-medium text-carbon">{item.descripcion}</div>
                                  <div className="text-xs text-gris-dark font-mono mt-0.5">
                                    {item.cantidad} {UNIDADES.find(u => u.value === item.unidad)?.label ?? item.unidad}
                                    {item.precio_unit != null && <span className="ml-2">× {fmtM(item.precio_unit)} = <strong>{fmtM(item.cantidad * item.precio_unit)}</strong></span>}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {stk ? (
                                    <div>
                                      <span className={`font-mono font-bold text-sm ${(stk as StockMaterial).stock_actual <= 0 ? 'text-rojo' : (stk as StockMaterial).stock_actual < item.cantidad ? 'text-[#7A5500]' : 'text-verde'}`}>
                                        {(stk as StockMaterial).stock_actual}
                                      </span>
                                      <div className="text-[9px] text-gris-dark">en depósito</div>
                                    </div>
                                  ) : (
                                    <span className="text-gris-mid text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                                </td>
                                <td colSpan={2} className="px-4 py-2.5 text-xs text-gris-dark">
                                  {item.proveedores && <div>Prov: <strong>{item.proveedores.nombre}</strong></div>}
                                  {item.estado === 'de_deposito' && <div><strong>Depósito propio</strong></div>}
                                  {item.facturas_compra?.adjunto_url && (
                                    <a href={item.facturas_compra.adjunto_url} target="_blank" rel="noopener" className="text-azul hover:underline font-bold">
                                      📎 Factura {item.facturas_compra.numero || ''}
                                    </a>
                                  )}
                                  {item.fecha_envio && <div className="text-verde font-semibold mt-0.5">Enviado {fmtF(item.fecha_envio)}</div>}
                                </td>
                                <td className="px-4 py-2.5">
                                  {s.estado === 'aprobada' && (
                                    <div className="flex gap-1 justify-end flex-wrap">
                                      {item.estado === 'pendiente' && (
                                        <>
                                          <button onClick={() => abrirComprar(item)} className="text-[10px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:opacity-80">Comprar</button>
                                          <button onClick={() => abrirDespachar(item)} className="text-[10px] font-bold px-2 py-1 rounded bg-naranja-light text-naranja hover:opacity-80">Depósito</button>
                                          <button onClick={() => handleRechazarItem(item.id!)} className="text-[10px] font-bold px-2 py-1 rounded bg-rojo-light text-rojo hover:opacity-80">✕</button>
                                        </>
                                      )}
                                      {(item.estado === 'comprado' || item.estado === 'de_deposito') && (
                                        <>
                                          <button onClick={() => handleEnviar(item.id!)} className="text-[10px] font-bold px-2 py-1 rounded bg-verde-light text-verde hover:opacity-80">Enviar</button>
                                          <button onClick={() => handleRevertir(item.id!)} className="text-[10px] px-1.5 py-1 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light">↩</button>
                                        </>
                                      )}
                                      {item.estado === 'rechazado' && (
                                        <button onClick={() => handleRevertir(item.id!)} className="text-[10px] font-bold px-2 py-1 rounded bg-amarillo-light text-[#7A5500] hover:opacity-80">Reactivar</button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}

                          {/* Obs */}
                          {isExp && s.obs && (
                            <tr className="border-b border-gris bg-amarillo-light/30">
                              <td className="pl-8 text-xs text-gris-mid">💬</td>
                              <td colSpan={7} className="px-4 py-2 text-sm text-[#7A5500] italic">{s.obs}</td>
                            </tr>
                          )}
                        </tbody></table>
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
        footer={<>
          <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
          <Button variant="primary" loading={creating} onClick={formCab.handleSubmit(handleCreate)}>Crear solicitud</Button>
        </>}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Combobox label="Obra destino" placeholder="Buscar obra..." options={obraOptions} value={obraNueva} onChange={setObraNueva} />
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Prioridad</label>
              <select {...formCab.register('prioridad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                <option value="normal">Normal</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <Input label="Observaciones" placeholder="Notas adicionales..." {...formCab.register('obs')} />
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Materiales solicitados</div>
            <div className="flex flex-col gap-2">
              {lineas.map(l => {
                const matVinculado = l.material_id ? stockMap.get(l.material_id) : null
                const stockOptions = (stockMateriales as StockMaterial[]).map(m => ({
                  value: String(m.id),
                  label: m.nombre,
                  sub: `Stock: ${m.stock_actual} ${m.unidad}`,
                }))
                return (
                  <div key={l._id} className="border border-gris-mid rounded-lg p-3 bg-gris/20">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <Combobox
                          placeholder="Buscar material del catálogo..."
                          options={stockOptions}
                          value={l.material_id ? String(l.material_id) : ''}
                          onChange={val => {
                            const mat = val ? (stockMateriales as StockMaterial[]).find(m => m.id === Number(val)) : null
                            setLineas(p => p.map(x => x._id === l._id ? {
                              ...x,
                              material_id: mat ? mat.id : null,
                              descripcion: mat ? mat.nombre : '',
                              unidad: mat ? mat.unidad : x.unidad,
                            } : x))
                          }}
                        />
                      </div>
                      {matVinculado && (
                        <div className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold ${matVinculado.stock_actual > 0 ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'}`}>
                          Stock: {matVinculado.stock_actual}
                        </div>
                      )}
                      {lineas.length > 1 && <button onClick={() => setLineas(p => p.filter(x => x._id !== l._id))} className="text-gris-mid hover:text-rojo text-lg font-bold mt-1">✕</button>}
                    </div>
                    {!l.material_id && (
                      <input type="text" placeholder="O escribir descripción libre..." value={l.descripcion}
                        onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, descripcion: e.target.value } : x))}
                        className="w-full mt-2 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                    )}
                    <div className="flex gap-2 mt-2">
                      <input type="number" min="0" step="1" value={l.cantidad} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                        placeholder="Cant." className="w-20 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja" />
                      <select value={l.unidad} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, unidad: e.target.value } : x))}
                        className="w-20 px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white">
                        {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <input type="text" placeholder="Obs..." value={l.obs} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, obs: e.target.value } : x))}
                        className="flex-1 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLineas(p => [...p, newLinea()])} className="mt-2 text-xs font-bold text-azul hover:text-naranja transition-colors">+ Agregar material</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal comprar a proveedor ── */}
      <Modal open={!!modalComprar} onClose={() => setModalComprar(null)} title="🛒 COMPRAR A PROVEEDOR"
        footer={<>
          <Button variant="secondary" onClick={() => setModalComprar(null)}>Cancelar</Button>
          <Button variant="primary" onClick={formComprar.handleSubmit(handleComprar)}>Confirmar compra</Button>
        </>}>
        {modalComprar && (
          <div className="flex flex-col gap-4">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-azul">{modalComprar.descripcion}</div>
              <div className="text-xs text-gris-dark font-mono">{modalComprar.cantidad} {UNIDADES.find(u => u.value === modalComprar.unidad)?.label ?? modalComprar.unidad}</div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Combobox label="Proveedor" placeholder="Buscar proveedor..." options={provOptions} value={formComprar.watch('proveedor_id')} onChange={v => formComprar.setValue('proveedor_id', v)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => { formProv.reset({ nombre: '', cuit: '', tel: '' }); setModalNuevoProveedor(true) }}>+ Nuevo</Button>
            </div>
            <Input label="Precio unitario ($)" type="number" step="1" {...formComprar.register('precio_unit')} />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Factura (opcional)</label>
                <select {...formComprar.register('factura_id')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="">Sin factura</option>
                  {(facturas as any[]).map(f => <option key={f.id} value={f.id}>#{f.numero || f.id} — {f.proveedores?.nombre ?? ''}</option>)}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                formFact.reset({ proveedor_id: formComprar.watch('proveedor_id'), numero: '', fecha: new Date().toISOString().slice(0, 10), total: 0 })
                setAdjunto(null); setModalNuevaFactura(true)
              }}>+ Factura</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal despachar de depósito ── */}
      <Modal open={!!modalDespachar} onClose={() => setModalDespachar(null)} title="📦 DESPACHAR DE DEPÓSITO"
        footer={<>
          <Button variant="secondary" onClick={() => setModalDespachar(null)}>Cancelar</Button>
          <Button variant="primary" onClick={formDespachar.handleSubmit(handleDespachar)}>Confirmar despacho</Button>
        </>}>
        {modalDespachar && (
          <div className="flex flex-col gap-4">
            <div className="bg-naranja-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-naranja">{modalDespachar.descripcion}</div>
              <div className="text-xs text-gris-dark font-mono">{modalDespachar.cantidad} {UNIDADES.find(u => u.value === modalDespachar.unidad)?.label ?? modalDespachar.unidad}</div>
            </div>
            {(() => {
              const mat = modalDespachar.material_id ? stockMap.get(modalDespachar.material_id) : null
              if (!mat) return null
              return (
                <>
                  <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${mat.stock_actual >= modalDespachar.cantidad ? 'bg-verde-light' : 'bg-amarillo-light'}`}>
                    <span className="text-xs font-bold">Stock en depósito</span>
                    <span className={`font-mono font-bold text-lg ${mat.stock_actual >= modalDespachar.cantidad ? 'text-verde' : 'text-[#7A5500]'}`}>
                      {mat.stock_actual} {UNIDADES.find(u => u.value === mat.unidad)?.label ?? mat.unidad}
                    </span>
                  </div>
                  {mat.precio_ref > 0 && (
                    <div className="text-xs text-gris-dark">Precio de referencia del catálogo: <strong className="font-mono">{fmtM(mat.precio_ref)}</strong></div>
                  )}
                </>
              )
            })()}
            <Input label="Precio unitario interno ($)" type="number" step="1" {...formDespachar.register('precio_unit')} />
          </div>
        )}
      </Modal>

      {/* ── Modal nuevo proveedor ── */}
      <Modal open={modalNuevoProveedor} onClose={() => setModalNuevoProveedor(false)} title="➕ NUEVO PROVEEDOR"
        footer={<>
          <Button variant="secondary" onClick={() => setModalNuevoProveedor(false)}>Cancelar</Button>
          <Button variant="primary" onClick={formProv.handleSubmit(handleCreateProv)}>Crear</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Input label="Nombre" {...formProv.register('nombre')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CUIT" placeholder="XX-XXXXXXXX-X" {...formProv.register('cuit')} />
            <Input label="Teléfono" {...formProv.register('tel')} />
          </div>
        </div>
      </Modal>

      {/* ── Modal nueva factura ── */}
      <Modal open={modalNuevaFactura} onClose={() => setModalNuevaFactura(false)} title="🧾 CARGAR FACTURA"
        footer={<>
          <Button variant="secondary" onClick={() => setModalNuevaFactura(false)}>Cancelar</Button>
          <Button variant="primary" loading={uploading} onClick={formFact.handleSubmit(handleCreateFact)}>Guardar</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Combobox label="Proveedor" placeholder="Buscar..." options={provOptions} value={formFact.watch('proveedor_id')} onChange={v => formFact.setValue('proveedor_id', v)} />
            <Input label="Nro factura" {...formFact.register('numero')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formFact.register('fecha')} />
            <Input label="Total ($)" type="number" step="1" {...formFact.register('total')} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Adjunto (PDF / imagen)</div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            {adjunto ? (
              <div className="flex items-center gap-2 bg-azul-light rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-azul flex-1 truncate">📎 {adjunto.nombre}</span>
                <button onClick={() => setAdjunto(null)} className="text-gris-dark hover:text-rojo text-xs font-bold">✕</button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>📎 Adjuntar</Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Modal editar solicitud ── */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title="✏️ EDITAR SOLICITUD" width="max-w-3xl"
        footer={<>
          <Button variant="secondary" onClick={() => setModalEditar(null)}>Cancelar</Button>
          <Button variant="primary" onClick={formEdit.handleSubmit(handleEditar)}>Guardar cambios</Button>
        </>}>
        {modalEditar && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Combobox label="Obra destino" placeholder="Buscar obra..." options={obraOptions} value={obraEdit} onChange={setObraEdit} />
              <div>
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Prioridad</label>
                <select {...formEdit.register('prioridad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <Input label="Observaciones" placeholder="Notas adicionales..." {...formEdit.register('obs')} />

            <div>
              <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Materiales</div>
              <div className="flex flex-col gap-2">
                {lineasEdit.map(l => {
                  const esPendiente = !l.estado || l.estado === 'pendiente'
                  const matVinculado = l.material_id ? stockMap.get(l.material_id) : null
                  const stockOptions = (stockMateriales as StockMaterial[]).map(m => ({
                    value: String(m.id),
                    label: m.nombre,
                    sub: `Stock: ${m.stock_actual} ${m.unidad}`,
                  }))

                  if (!esPendiente) {
                    // Ítems ya resueltos: solo mostrar, no editar
                    const cfg = ITEM_ESTADO_CFG[l.estado as ItemEstado]
                    return (
                      <div key={l._id} className="border border-gris-mid rounded-lg p-3 bg-gris/30 opacity-70">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">{l.descripcion}</span>
                            <span className="text-xs text-gris-dark ml-2 font-mono">{l.cantidad} {l.unidad}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg?.bg} ${cfg?.text}`}>{cfg?.label}</span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={l._id} className="border border-gris-mid rounded-lg p-3 bg-gris/20">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Combobox
                            placeholder="Buscar material del catálogo..."
                            options={stockOptions}
                            value={l.material_id ? String(l.material_id) : ''}
                            onChange={val => {
                              const mat = val ? (stockMateriales as StockMaterial[]).find(m => m.id === Number(val)) : null
                              setLineasEdit(p => p.map(x => x._id === l._id ? {
                                ...x,
                                material_id: mat ? mat.id : null,
                                descripcion: mat ? mat.nombre : '',
                                unidad: mat ? mat.unidad : x.unidad,
                              } : x))
                            }}
                          />
                        </div>
                        {matVinculado && (
                          <div className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold ${(matVinculado as StockMaterial).stock_actual > 0 ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'}`}>
                            Stock: {(matVinculado as StockMaterial).stock_actual}
                          </div>
                        )}
                        <button onClick={() => {
                          if (l.itemId) setItemsAEliminar(p => [...p, l.itemId!])
                          setLineasEdit(p => p.filter(x => x._id !== l._id))
                        }} className="text-gris-mid hover:text-rojo text-lg font-bold mt-1">✕</button>
                      </div>
                      {!l.material_id && (
                        <input type="text" placeholder="O escribir descripción libre..." value={l.descripcion}
                          onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, descripcion: e.target.value } : x))}
                          className="w-full mt-2 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                      )}
                      <div className="flex gap-2 mt-2">
                        <input type="number" min="0" step="1" value={l.cantidad} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                          placeholder="Cant." className="w-20 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja" />
                        <select value={l.unidad} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, unidad: e.target.value } : x))}
                          className="w-20 px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white">
                          {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                        <input type="text" placeholder="Obs..." value={l.obs} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, obs: e.target.value } : x))}
                          className="flex-1 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setLineasEdit(p => [...p, { ...newLinea(), estado: 'pendiente' }])} className="mt-2 text-xs font-bold text-azul hover:text-naranja transition-colors">+ Agregar material</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
