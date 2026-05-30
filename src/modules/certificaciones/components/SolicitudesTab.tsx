'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import {
  useSolicitudes, useCreateSolicitud, useUpdateSolicitud, useDeleteSolicitud,
  useComprarItem, useDespacharItem, useEnviarItem, useRechazarItem, useRevertirItem, useRevertirEnvio,
} from '../hooks/useSolicitudes'
import { useProveedores, useCreateProveedor } from '../hooks/useProveedores'
import { useFacturasCompra, useCreateFactura } from '../hooks/useFacturasCompra'
import { useStockMateriales } from '../hooks/useStock'
import { useCreateRemitoEnvio } from '../hooks/useRemitosEnvio'
import { imprimirRemito } from './RemitoEnvioPrint'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { createClient } from '@/lib/supabase/client'
import { toISO } from '@/lib/utils/dates'
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
  pendiente:    { label: 'Pendiente',     bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  comprado:     { label: 'Comprado',      bg: 'bg-azul-light',     text: 'text-azul'      },
  de_deposito:  { label: 'De depósito',   bg: 'bg-naranja-light',  text: 'text-naranja'   },
  en_proveedor: { label: 'En proveedor',  bg: 'bg-azul-light',     text: 'text-azul-mid'  },
  retirado:     { label: 'Retirado',      bg: 'bg-verde-light',    text: 'text-verde'     },
  enviado:      { label: 'Enviado',       bg: 'bg-verde-light',    text: 'text-verde'     },
  rechazado:    { label: 'Rechazado',     bg: 'bg-rojo-light',     text: 'text-rojo'      },
}

function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
// Formatea un timestamp "YYYY-MM-DDTHH:mm[:ss]" a "DD/MM/YYYY HH:mm".
function fmtFH(s: string) { const [fecha, hora = ''] = s.split('T'); return `${fmtF(fecha)}${hora ? ' ' + hora.slice(0, 5) : ''}` }

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

// ── Categorías para los tabs ──
// "Por comprar" / "Por enviar" / "Enviadas" son los 3 tabs principales y mapean
// a `progreso` cuando la solicitud está aprobada. "Sin aprobar" y "Rechazadas"
// son secundarias y viven en un dropdown "Otras" para no saturar el header.
const CATEGORIAS_PRINCIPALES = ['por-comprar', 'por-enviar', 'enviadas'] as const
const CATEGORIAS_OTRAS       = ['sin-aprobar', 'rechazadas']           as const
const CATEGORIAS_ALL = [...CATEGORIAS_PRINCIPALES, ...CATEGORIAS_OTRAS] as const
type CategoriaSol = typeof CATEGORIAS_ALL[number]

const CATEGORIA_LABEL: Record<CategoriaSol, string> = {
  'por-comprar': 'Por comprar',
  'por-enviar':  'Por enviar',
  'enviadas':    'Enviadas',
  'sin-aprobar': 'Sin aprobar',
  'rechazadas':  'Rechazadas',
}

function matchCategoria(s: SolicitudCompra, cat: CategoriaSol): boolean {
  switch (cat) {
    case 'por-comprar': return s.estado === 'aprobada' && s.progreso === 'pendiente'
    case 'por-enviar':  return s.estado === 'aprobada' && s.progreso === 'en_gestion'
    case 'enviadas':    return s.estado === 'aprobada' && s.progreso === 'enviada'
    case 'sin-aprobar': return s.estado === 'pendiente'
    case 'rechazadas':  return s.estado === 'rechazada'
  }
}

function isCategoriaValida(s: string | null): s is CategoriaSol {
  return s !== null && (CATEGORIAS_ALL as readonly string[]).includes(s)
}

// ── Componente principal ──
export function SolicitudesTab() {
  const toast = useToast()
  const perfiles = usePerfilesMap()
  // Permisos: deshabilitar (no ocultar) botones según capacidad. El backend
  // valida igual; esto evita clicks que rebotan con error feo (CLAUDE.md §6).
  const { puedeCrear, puedeEditar, puedeEliminar, resolverItems } = usePermisos('certificaciones')
  const { data: obras = [] } = useObras('certificaciones')
  const { data: proveedores = [] } = useProveedores()
  const { data: facturas = [] } = useFacturasCompra()
  const { data: stockMateriales = [] } = useStockMateriales()
  const { mutate: createProveedor } = useCreateProveedor()
  const { mutate: createFactura } = useCreateFactura()
  const stockMap = new Map((stockMateriales as StockMaterial[]).map(m => [m.id, m]))

  const [obraFiltro, setObraFiltro] = useState('')
  const router       = useRouter()
  const searchParams = useSearchParams()
  // Categoría activa: viene del query param `?categoria=...`. Si no hay,
  // default a "por-comprar" (lo más accionable del día a día).
  const catParam = searchParams.get('categoria')
  const categoriaSel: CategoriaSol = isCategoriaValida(catParam) ? catParam : 'por-comprar'
  function setCategoria(c: CategoriaSol) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('categoria', c)
    router.replace(`?${params.toString()}`, { scroll: false })
  }
  // Si la URL trae un valor inválido (ej. del dropdown viejo) lo normalizamos
  // al default — evita que quede una categoría "fantasma" en URL.
  useEffect(() => {
    if (catParam && !isCategoriaValida(catParam)) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('categoria')
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }, [catParam, router, searchParams])

  const { data: solicitudes = [], isLoading } = useSolicitudes(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateSolicitud()
  const { mutate: updateSol } = useUpdateSolicitud()
  const { mutate: removeSol } = useDeleteSolicitud()
  const { mutate: comprarItem } = useComprarItem()
  const { mutate: despacharItem } = useDespacharItem()
  const { mutate: enviarItem } = useEnviarItem()
  const { mutate: rechazarItem } = useRechazarItem()
  const { mutate: revertirItem } = useRevertirItem()
  const { mutate: revertirEnvio } = useRevertirEnvio()
  const { mutate: createRemito } = useCreateRemitoEnvio()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Selección de items pendientes para compra en LOTE (mismo proveedor +
  // misma factura, precio individual por item). Map<solicitudId, Set<itemId>>
  // — la selección es por solicitud porque una factura típicamente cubre
  // items de UNA solicitud.
  const [selCompra, setSelCompra] = useState<Map<number, Set<number>>>(new Map())
  function toggleSelCompra(solId: number, itemId: number) {
    setSelCompra(prev => {
      const next = new Map(prev)
      const set  = new Set(next.get(solId) ?? [])
      if (set.has(itemId)) set.delete(itemId)
      else                 set.add(itemId)
      if (set.size > 0) next.set(solId, set)
      else              next.delete(solId)
      return next
    })
  }
  function clearSelCompra(solId: number) {
    setSelCompra(prev => {
      const next = new Map(prev)
      next.delete(solId)
      return next
    })
  }

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
  const [modalComprarLote, setModalComprarLote] = useState<{
    solId: number
    items: SolicitudCompraItem[]
  } | null>(null)
  const [fallidosLote, setFallidosLote] = useState<Array<{ desc: string; error: string }>>([])
  const [loteSubmitting, setLoteSubmitting] = useState(false)
  const [modalNuevoProveedor, setModalNuevoProveedor] = useState(false)
  const [modalNuevaFactura, setModalNuevaFactura] = useState(false)

  // Forms
  const formCab = useForm<any>({ defaultValues: { prioridad: 'normal', obs: '', entrega_tentativa: '' } })
  const formEdit = useForm<any>({ defaultValues: { prioridad: 'normal', obs: '', entrega_tentativa: '' } })
  const formComprar = useForm<any>({ defaultValues: { proveedor_id: '', precio_unit: 0, factura_id: '', pagado_por: 'cadinc', cantidad_comprada: 0 } })
  const formComprarLote = useForm<any>({
    defaultValues: { proveedor_id: '', factura_id: '', queda_en_proveedor: false, pagado_por: 'cadinc', precios: {} },
  })
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

  // Contadores live por categoría — para los chips de cada tab.
  const counts = useMemo(() => {
    const c: Record<CategoriaSol, number> = {
      'por-comprar': 0, 'por-enviar': 0, 'enviadas': 0,
      'sin-aprobar': 0, 'rechazadas': 0,
    }
    for (const s of (solicitudes as SolicitudCompra[])) {
      for (const cat of CATEGORIAS_ALL) {
        if (matchCategoria(s, cat)) c[cat]++
      }
    }
    return c
  }, [solicitudes])

  // Filtrar por la categoría activa.
  const filtered = (solicitudes as SolicitudCompra[]).filter(s => matchCategoria(s, categoriaSel))

  const sorted = [...filtered].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad === 'urgente' ? -1 : 1
    return b.fecha.localeCompare(a.fecha)
  })

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Crear solicitud ──
  function abrirNuevo() {
    setLineas([newLinea()]); setObraNueva(''); formCab.reset({ prioridad: 'normal', obs: '', entrega_tentativa: '' }); setModalNuevo(true)
  }

  function handleCreate(cab: any) {
    if (!obraNueva) { toast('Seleccioná una obra', 'err'); return }
    const items = lineas.filter(l => l.descripcion.trim()).map(l => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, obs: l.obs || null, material_id: l.material_id }))
    if (!items.length) { toast('Agregá al menos un material', 'err'); return }
    create({ obra_cod: obraNueva, prioridad: cab.prioridad, obs: cab.obs || null, entrega_tentativa: cab.entrega_tentativa || null, items }, {
      onSuccess: () => { toast('Solicitud creada', 'ok'); setModalNuevo(false) },
      onError: () => toast('Error al crear solicitud', 'err'),
    })
  }

  // ── Editar solicitud ──
  function abrirEditar(s: SolicitudCompra) {
    formEdit.reset({ prioridad: s.prioridad, obs: s.obs ?? '', entrega_tentativa: s.entrega_tentativa ? s.entrega_tentativa.slice(0, 16) : '' })
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
        entrega_tentativa: cab.entrega_tentativa || null,
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
    formComprar.reset({ proveedor_id: '', precio_unit: 0, factura_id: '', queda_en_proveedor: false, pagado_por: 'cadinc', cantidad_comprada: item.cantidad })
    setModalComprar(item)
  }
  function handleComprar(data: any) {
    if (!modalComprar?.id) return
    const cantComprada = Number(data.cantidad_comprada)
    comprarItem({
      itemId: modalComprar.id,
      dto: {
        proveedor_id:        Number(data.proveedor_id),
        precio_unit:         Number(data.precio_unit),
        factura_id:          data.factura_id ? Number(data.factura_id) : null,
        queda_en_proveedor:  !!data.queda_en_proveedor,
        pagado_por:          data.pagado_por === 'cliente' ? 'cliente' : 'cadinc',
        // Solo se manda si difiere de la solicitada (>0). Si es igual, queda null.
        ...(cantComprada > 0 && cantComprada !== modalComprar.cantidad
          ? { cantidad_comprada: cantComprada }
          : {}),
      },
    }, {
      onSuccess: () => {
        toast(data.queda_en_proveedor ? 'Comprado (queda en proveedor)' : 'Compra registrada', 'ok')
        setModalComprar(null)
      },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  // ── Compra LOTE: misma factura/proveedor para N items pendientes de una sol ──
  function abrirComprarLote(solId: number, items: SolicitudCompraItem[]) {
    // Precarga precios con stock.precio_ref si está vinculado; si no, 0.
    // Cantidades arrancan con la solicitada (editable si se compró distinto).
    const precios: Record<string, number> = {}
    const cantidades: Record<string, number> = {}
    for (const it of items) {
      const mat = it.material_id ? stockMap.get(it.material_id) : null
      precios[String(it.id)] = (mat as StockMaterial | undefined)?.precio_ref ?? 0
      cantidades[String(it.id)] = it.cantidad
    }
    formComprarLote.reset({ proveedor_id: '', factura_id: '', queda_en_proveedor: false, pagado_por: 'cadinc', precios, cantidades })
    setFallidosLote([])
    setModalComprarLote({ solId, items })
  }

  // Manejo independiente de errores (decisión del user): los que andan se
  // aplican igual; los que fallan se reportan al final con opción de reintentar.
  async function handleComprarLote(data: any) {
    if (!modalComprarLote || loteSubmitting) return
    if (!data.proveedor_id) { toast('Elegí proveedor', 'err'); return }
    const proveedorId = Number(data.proveedor_id)
    const facturaId   = data.factura_id ? Number(data.factura_id) : null
    const queda       = !!data.queda_en_proveedor
    const pagadoPor: 'cadinc' | 'cliente' = data.pagado_por === 'cliente' ? 'cliente' : 'cadinc'
    setLoteSubmitting(true)

    const fallidos: Array<{ desc: string; error: string }> = []
    let ok = 0
    // Si llegamos acá después de un intento previo, retomamos solo los items
    // que estaban fallados — los exitosos ya cambiaron de estado en backend
    // y el invalidate los va a refrescar.
    const itemsActuales = fallidosLote.length > 0
      ? modalComprarLote.items.filter(it => fallidosLote.some(f => f.desc === it.descripcion))
      : modalComprarLote.items

    for (const it of itemsActuales) {
      const precio = Number(data.precios?.[String(it.id)] ?? 0)
      if (!precio || precio <= 0) {
        fallidos.push({ desc: it.descripcion, error: 'precio inválido' })
        continue
      }
      const cantComprada = Number(data.cantidades?.[String(it.id)] ?? it.cantidad)
      try {
        await new Promise<void>((resolve, reject) => {
          comprarItem({
            itemId: it.id!,
            dto: {
              proveedor_id: proveedorId,
              precio_unit: precio,
              factura_id: facturaId,
              queda_en_proveedor: queda,
              pagado_por: pagadoPor,
              // Solo si difiere de la solicitada.
              ...(cantComprada > 0 && cantComprada !== it.cantidad
                ? { cantidad_comprada: cantComprada }
                : {}),
            },
          }, { onSuccess: () => resolve(), onError: (e: any) => reject(e) })
        })
        ok++
      } catch (e: any) {
        fallidos.push({ desc: it.descripcion, error: e?.message || 'error desconocido' })
      }
    }
    setLoteSubmitting(false)

    if (fallidos.length === 0) {
      toast(`✓ ${ok} ítem${ok !== 1 ? 's' : ''} comprado${ok !== 1 ? 's' : ''}${queda ? ' (queda en proveedor)' : ''}`, 'ok')
      clearSelCompra(modalComprarLote.solId)
      setModalComprarLote(null)
      setFallidosLote([])
    } else {
      const txt = ok > 0
        ? `${ok} ok · ${fallidos.length} con error`
        : `${fallidos.length} ítem${fallidos.length !== 1 ? 's' : ''} no se pudo${fallidos.length !== 1 ? 'eron' : ''} comprar`
      toast(txt, 'err')
      setFallidosLote(fallidos)
    }
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

  // Deshace solo el envío: vuelve a comprado/de_deposito y borra el remito.
  function handleRevertirEnvio(itemId: number) {
    if (!confirm('¿Deshacer el envío? El ítem vuelve a "comprado/depósito" y se elimina el remito generado. La compra se mantiene.')) return
    revertirEnvio(itemId, {
      onSuccess: () => toast('Envío deshecho — ítem listo para reenviar', 'ok'),
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  // ── Selección y envío grupal con remito ──
  function toggleSelect(itemId: number) {
    setSelected(prev => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n })
  }

  function enviarConRemito(solicitud: SolicitudCompra, itemIds: number[]) {
    const items = (solicitud.items ?? []).filter(it => itemIds.includes(it.id!))
    if (!items.length) return

    const n = items.length
    const obra = obrasMap.get(solicitud.obra_cod)
    const esDeposito = obra?.es_deposito === true
    const msgConfirm = esDeposito
      ? `¿Recibir ${n > 1 ? `${n} ítems` : 'el ítem'} en el depósito? Ingresan al stock y se genera el comprobante.`
      : `¿Generar remito y marcar como enviado${n > 1 ? ` ${n} ítems` : ''}? Esta acción crea el remito de envío a la obra.`
    if (!confirm(msgConfirm)) return
    const remitoItems = items.map(it => ({
      item_id: it.id,
      descripcion: it.descripcion,
      // Cantidad efectiva: la comprada si difiere de la solicitada.
      cantidad: it.cantidad_comprada ?? it.cantidad,
      unidad: it.unidad,
      precio_unit: it.precio_unit ?? null,
      origen: (it.estado === 'comprado' || it.estado === 'retirado') ? 'proveedor' : 'deposito',
      proveedor: it.proveedores?.nombre ?? null,
    }))

    createRemito({
      obra_cod: solicitud.obra_cod,
      solicitud_id: solicitud.id,
      origen: remitoItems.some(r => r.origen === 'proveedor') ? 'mixto' : 'deposito',
      items: remitoItems,
      enviar_items: itemIds,
    }, {
      onSuccess: (remito: any) => {
        toast(esDeposito ? 'Recibido e ingresado al depósito' : 'Remito generado e ítems enviados', 'ok')
        setSelected(new Set())
        imprimirRemito(remito, obra?.nom)
      },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function enviarUnoConRemito(solicitud: SolicitudCompra, itemId: number) {
    enviarConRemito(solicitud, [itemId])
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
      {/* Header: filtro de obra + tabs por categoría + botón nueva */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <div className="min-w-[220px] max-w-xs">
            <Combobox placeholder="Filtrar por obra..." options={obraOptions} value={obraFiltro} onChange={setObraFiltro} />
          </div>
          <CategoriaTabs categoriaSel={categoriaSel} counts={counts} onSelect={setCategoria} />
        </div>
        <Button variant="primary" size="sm" onClick={abrirNuevo} disabled={!puedeCrear}>+ Nueva solicitud</Button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      ) : (
        <div className="hidden md:flex flex-col gap-3">
          {sorted.length === 0 ? (
            <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
              Sin solicitudes.
            </div>
          ) : sorted.map(s => {
            const obra = obrasMap.get(s.obra_cod)
            const isExp = expanded.has(s.id)
            const items = s.items ?? []

            return (
              <div key={s.id} className="bg-white rounded-card shadow-card overflow-hidden">
                {/* Header del card (clickeable) */}
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gris/30 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(s.id)}
                >
                  <span className="text-xs text-gris-dark select-none shrink-0">{isExp ? '▼' : '▶'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-carbon">{obra?.nom ?? s.obra_cod}</span>
                      {obra && <span className="font-mono text-[11px] font-semibold text-azul">{s.obra_cod}</span>}
                      {s.progreso ? (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${PROGRESO_CFG[s.progreso].bg} ${PROGRESO_CFG[s.progreso].text}`}>
                          {PROGRESO_CFG[s.progreso].label}
                        </span>
                      ) : (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${ESTADO_SOL[s.estado].bg} ${ESTADO_SOL[s.estado].text}`}>
                          {ESTADO_SOL[s.estado].label}
                        </span>
                      )}
                      {s.prioridad === 'urgente' && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rojo text-white uppercase">Urgente</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{fmtF(s.fecha)}</span>
                      <span>·</span>
                      <span>{s.solicitante ? (perfiles.get(s.solicitante) ?? '…') : '—'}</span>
                      <span>·</span>
                      {s.resumen ? (
                        <span>
                          <span className="font-bold text-carbon">{s.resumen.resueltos}/{s.resumen.total}</span> resueltos
                          {s.resumen.enviados > 0 && (
                            <span className="text-verde font-bold ml-1.5">{s.resumen.enviados} enviados</span>
                          )}
                        </span>
                      ) : (
                        <span>{items.length} material{items.length !== 1 ? 'es' : ''}</span>
                      )}
                      {s.entrega_tentativa && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-naranja-light text-naranja-dark font-bold">
                          📅 Entrega: {fmtFH(s.entrega_tentativa)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end shrink-0" onClick={e => e.stopPropagation()}>
                    {s.estado === 'pendiente' && (
                      <>
                        <button disabled={!puedeEditar} onClick={() => aprobar(s.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Aprobar</button>
                        <button disabled={!puedeEditar} onClick={() => rechazar(s.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Rechazar</button>
                      </>
                    )}
                    <button disabled={!puedeEditar} onClick={() => abrirEditar(s)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✏️ Editar</button>
                    <button disabled={!puedeEliminar} onClick={() => eliminar(s.id)} className="text-xs px-3 py-1.5 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                  </div>
                </div>

                {/* Detalle expandido */}
                {isExp && (
                  <div className="border-t border-gris">
                    <table className="w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-10" />
                        <col />
                        <col className="w-[72px]" />
                        <col className="w-[112px]" />
                        <col className="w-[24%]" />
                        <col className="w-[230px]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-gris/50">
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gris-dark uppercase tracking-wide">#</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide">Material</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gris-dark uppercase tracking-wide">Stock</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide">Estado</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide">Detalle</th>
                          <th className="px-4 py-2 text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => {
                          const cfg = ITEM_ESTADO_CFG[item.estado]
                          const stk = item.material_id ? stockMap.get(item.material_id) : null
                          return (
                            <tr key={item.id ?? i} className="border-t border-gris bg-gris/20 align-top">
                              <td className="px-2 py-2.5 text-xs text-gris-mid text-center">{i + 1}</td>
                              <td className="px-4 py-2.5">
                                <div className="text-sm font-medium text-carbon">{item.descripcion}</div>
                                {(() => {
                                  const unidLabel = UNIDADES.find(u => u.value === item.unidad)?.label ?? item.unidad
                                  const cantEfectiva = item.cantidad_comprada ?? item.cantidad
                                  const difiere = item.cantidad_comprada != null && item.cantidad_comprada !== item.cantidad
                                  return (
                                    <div className="text-xs text-gris-dark font-mono mt-0.5">
                                      {difiere ? (
                                        <span title={`Solicitado: ${item.cantidad} ${unidLabel}`}>
                                          <span className="line-through text-gris-mid">{item.cantidad}</span>
                                          {' → '}
                                          <strong className="text-naranja-dark">{cantEfectiva}</strong> {unidLabel}
                                        </span>
                                      ) : (
                                        <>{item.cantidad} {unidLabel}</>
                                      )}
                                      {item.precio_unit != null && <span className="ml-2">× {fmtM(item.precio_unit)} = <strong>{fmtM(cantEfectiva * item.precio_unit)}</strong></span>}
                                    </div>
                                  )
                                })()}
                              </td>
                              <td className="px-2 py-2.5 text-center">
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
                              <td className="px-4 py-2.5 text-xs text-gris-dark break-words">
                                {item.proveedores && <div>Prov: <strong>{item.proveedores.nombre}</strong></div>}
                                {item.estado === 'de_deposito' && <div><strong>Depósito propio</strong></div>}
                                {item.pagado_por === 'cliente' && ['comprado', 'en_proveedor', 'retirado', 'enviado'].includes(item.estado) && (
                                  <div className="mt-0.5">
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-naranja-light text-naranja-dark uppercase tracking-wide">
                                      💵 Cliente pagó directo
                                    </span>
                                  </div>
                                )}
                                {item.facturas_compra?.adjunto_url && (
                                  <a href={item.facturas_compra.adjunto_url} target="_blank" rel="noopener" className="text-azul hover:underline font-bold">
                                    📎 Factura {item.facturas_compra.numero || ''}
                                  </a>
                                )}
                                {item.fecha_envio && <div className="text-verde font-semibold mt-0.5">Enviado {fmtF(item.fecha_envio)}</div>}
                              </td>
                              <td className="px-4 py-2.5">
                                {s.estado === 'aprobada' && (
                                  <div className="flex gap-1 justify-end flex-wrap items-center">
                                    {item.estado === 'pendiente' && (
                                      <>
                                        <input
                                          type="checkbox"
                                          disabled={!resolverItems}
                                          checked={selCompra.get(s.id)?.has(item.id!) ?? false}
                                          onChange={() => toggleSelCompra(s.id, item.id!)}
                                          className="accent-azul w-4 h-4 disabled:opacity-40"
                                          title="Seleccionar para compra en lote (mismo proveedor)"
                                        />
                                        <button disabled={!resolverItems} onClick={() => abrirComprar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Comprar</button>
                                        <button disabled={!resolverItems} onClick={() => abrirDespachar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-naranja-light text-naranja hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Depósito</button>
                                        <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                      </>
                                    )}
                                    {(item.estado === 'comprado' || item.estado === 'de_deposito' || item.estado === 'retirado') && (
                                      <>
                                        <input type="checkbox" disabled={!resolverItems} checked={selected.has(item.id!)} onChange={() => toggleSelect(item.id!)}
                                          className="accent-verde w-4 h-4 disabled:opacity-40" title="Seleccionar para envío grupal" />
                                        <button disabled={!resolverItems} onClick={() => enviarUnoConRemito(s, item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">{obra?.es_deposito ? 'Recibir en depósito' : 'Enviar + Remito'}</button>
                                        <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs px-3 py-1.5 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩</button>
                                      </>
                                    )}
                                    {item.estado === 'rechazado' && (
                                      <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-amarillo-light text-[#7A5500] hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
                                    )}
                                    {item.estado === 'enviado' && (
                                      <button disabled={!resolverItems} onClick={() => handleRevertirEnvio(item.id!)} title="Deshacer el envío (vuelve a comprado/depósito, borra el remito)" className="text-xs font-bold px-3 py-1.5 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Deshacer envío</button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Obs */}
                    {s.obs && (
                      <div className="border-t border-gris bg-amarillo-light/30 px-4 py-2 text-sm text-[#7A5500] italic flex gap-2">
                        <span className="text-gris-mid not-italic">💬</span>
                        <span>{s.obs}</span>
                      </div>
                    )}

                    {/* Compra en lote (items pendientes seleccionados) */}
                    {(() => {
                      const set = selCompra.get(s.id)
                      if (!set || set.size === 0) return null
                      const itemsLote = items.filter(it => it.estado === 'pendiente' && set.has(it.id!))
                      if (itemsLote.length === 0) return null
                      return (
                        <div className="border-t border-gris bg-azul-light/40 px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-bold text-azul">
                              {itemsLote.length} ítem{itemsLote.length > 1 ? 's' : ''} para comprar al mismo proveedor
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => clearSelCompra(s.id)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg text-gris-dark hover:bg-white transition-colors"
                              >
                                Limpiar
                              </button>
                              <button
                                disabled={!resolverItems}
                                onClick={() => abrirComprarLote(s.id, itemsLote)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-azul text-white hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                🛒 Comprar {itemsLote.length} ítem{itemsLote.length > 1 ? 's' : ''}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Envío grupal */}
                    {(() => {
                      const itemsSeleccionados = items.filter(it => selected.has(it.id!) && (it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado'))
                      if (itemsSeleccionados.length === 0) return null
                      return (
                        <div className="border-t border-gris bg-verde-light/30 px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-verde">
                              {itemsSeleccionados.length} ítem{itemsSeleccionados.length > 1 ? 's' : ''} seleccionado{itemsSeleccionados.length > 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => enviarConRemito(s, itemsSeleccionados.map(it => it.id!))}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde text-white hover:opacity-90 transition-colors"
                            >
                              📄 Enviar seleccionados + Generar remito
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cards — mobile */}
      {!isLoading && (
        <div className="flex flex-col gap-2 md:hidden">
          {sorted.length === 0 ? (
            <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm italic">
              Sin solicitudes.
            </div>
          ) : sorted.map(s => {
            const obra = obrasMap.get(s.obra_cod)
            const isExp = expanded.has(s.id)
            const items = s.items ?? []
            const itemsSeleccionados = items.filter(it => selected.has(it.id!) && (it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado'))
            return (
              <div key={s.id} className="bg-white rounded-card shadow-sm border border-gris-mid p-3">
                {/* Resumen */}
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-carbon">{obra?.nom ?? s.obra_cod}</span>
                        {s.prioridad === 'urgente' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rojo text-white uppercase">Urgente</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-gris-dark font-mono">
                        {obra && <span className="font-bold text-azul">{s.obra_cod}</span>}
                        <span>{fmtF(s.fecha)}</span>
                      </div>
                      {s.entrega_tentativa && (
                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-naranja-light text-naranja-dark text-[10px] font-bold">
                          📅 Entrega: {fmtFH(s.entrega_tentativa)}
                        </div>
                      )}
                    </div>
                    {s.progreso ? (
                      <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${PROGRESO_CFG[s.progreso].bg} ${PROGRESO_CFG[s.progreso].text}`}>
                        {PROGRESO_CFG[s.progreso].label}
                      </span>
                    ) : (
                      <span className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${ESTADO_SOL[s.estado].bg} ${ESTADO_SOL[s.estado].text}`}>
                        {ESTADO_SOL[s.estado].label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <div>
                      {s.resumen ? (
                        <span>
                          <span className="font-bold text-carbon">{s.resumen.resueltos}/{s.resumen.total}</span>
                          <span className="text-gris-dark ml-1">resueltos</span>
                          {s.resumen.enviados > 0 && (
                            <span className="text-verde ml-2 font-bold">{s.resumen.enviados} enviados</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gris-dark">{items.length} material{items.length !== 1 ? 'es' : ''}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-gris-mid select-none">{isExp ? '▼ ocultar' : '▶ ver ítems'}</span>
                  </div>
                  {s.solicitante && (
                    <div className="mt-1 text-[11px] text-gris-mid">
                      Solicitante: {perfiles.get(s.solicitante) ?? '…'}
                    </div>
                  )}
                </button>

                {/* Acciones de cabecera */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {s.estado === 'pendiente' && (
                    <>
                      <button disabled={!puedeEditar} onClick={() => aprobar(s.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Aprobar</button>
                      <button disabled={!puedeEditar} onClick={() => rechazar(s.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Rechazar</button>
                    </>
                  )}
                  <button disabled={!puedeEditar} onClick={() => abrirEditar(s)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✏️ Editar</button>
                  <button disabled={!puedeEliminar} onClick={() => eliminar(s.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕ Eliminar</button>
                </div>

                {/* Obs */}
                {isExp && s.obs && (
                  <div className="mt-3 bg-amarillo-light/30 rounded-lg px-3 py-2 text-xs text-[#7A5500] italic">
                    💬 {s.obs}
                  </div>
                )}

                {/* Detalle de ítems expandido */}
                {isExp && (
                  <div className="mt-3 pt-3 border-t border-gris flex flex-col gap-2">
                    {items.map((item, i) => {
                      const cfg = ITEM_ESTADO_CFG[item.estado]
                      const stk = item.material_id ? stockMap.get(item.material_id) : null
                      return (
                        <div key={item.id ?? i} className="bg-gris/30 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gris-mid">#{i + 1}</div>
                              <div className="text-sm font-medium text-carbon">{item.descripcion}</div>
                              <div className="text-[11px] text-gris-dark font-mono mt-0.5">
                                {item.cantidad} {UNIDADES.find(u => u.value === item.unidad)?.label ?? item.unidad}
                                {item.precio_unit != null && (
                                  <span className="ml-2">× {fmtM(item.precio_unit)} = <strong>{fmtM(item.cantidad * item.precio_unit)}</strong></span>
                                )}
                              </div>
                            </div>
                            <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                          </div>

                          {/* Info extra */}
                          <div className="mt-2 text-[11px] text-gris-dark space-y-0.5">
                            {stk && (
                              <div>
                                Stock depósito:{' '}
                                <span className={`font-mono font-bold ${(stk as StockMaterial).stock_actual <= 0 ? 'text-rojo' : (stk as StockMaterial).stock_actual < item.cantidad ? 'text-[#7A5500]' : 'text-verde'}`}>
                                  {(stk as StockMaterial).stock_actual}
                                </span>
                              </div>
                            )}
                            {item.proveedores && <div>Prov: <strong>{item.proveedores.nombre}</strong></div>}
                            {item.estado === 'de_deposito' && <div><strong>Depósito propio</strong></div>}
                            {item.facturas_compra?.adjunto_url && (
                              <a href={item.facturas_compra.adjunto_url} target="_blank" rel="noopener" className="text-azul hover:underline font-bold inline-block">
                                📎 Factura {item.facturas_compra.numero || ''}
                              </a>
                            )}
                            {item.fecha_envio && <div className="text-verde font-semibold">Enviado {fmtF(item.fecha_envio)}</div>}
                          </div>

                          {/* Acciones del ítem */}
                          {s.estado === 'aprobada' && (
                            <div className="mt-3">
                              {item.estado === 'pendiente' && (
                                <div className="grid grid-cols-3 gap-2">
                                  <button disabled={!resolverItems} onClick={() => abrirComprar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Comprar</button>
                                  <button disabled={!resolverItems} onClick={() => abrirDespachar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-naranja-light text-naranja hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Depósito</button>
                                  <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                </div>
                              )}
                              {(item.estado === 'comprado' || item.estado === 'de_deposito' || item.estado === 'retirado') && (
                                <div className="flex flex-col gap-2">
                                  <label className="flex items-center gap-2 text-[11px] text-gris-dark">
                                    <input
                                      type="checkbox"
                                      disabled={!resolverItems}
                                      checked={selected.has(item.id!)}
                                      onChange={() => toggleSelect(item.id!)}
                                      className="accent-verde w-4 h-4 disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    Seleccionar para envío grupal
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button disabled={!resolverItems} onClick={() => enviarUnoConRemito(s, item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">{obra?.es_deposito ? 'Recibir en depósito' : 'Enviar + Remito'}</button>
                                    <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Revertir</button>
                                  </div>
                                </div>
                              )}
                              {item.estado === 'rechazado' && (
                                <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="w-full text-xs font-bold px-3 py-1.5 rounded bg-amarillo-light text-[#7A5500] hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
                              )}
                              {item.estado === 'enviado' && (
                                <button disabled={!resolverItems} onClick={() => handleRevertirEnvio(item.id!)} className="w-full text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Deshacer envío</button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Envío grupal */}
                    {itemsSeleccionados.length > 0 && (
                      <div className="bg-verde-light/30 rounded-lg p-3 flex flex-col gap-2">
                        <span className="text-sm font-bold text-verde">
                          {itemsSeleccionados.length} ítem{itemsSeleccionados.length > 1 ? 's' : ''} seleccionado{itemsSeleccionados.length > 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => enviarConRemito(s, itemsSeleccionados.map(it => it.id!))}
                          className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-verde text-white hover:opacity-90 min-h-[40px]"
                        >
                          📄 Enviar seleccionados + Generar remito
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal nueva solicitud ── */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🛒 NUEVA SOLICITUD" width="max-w-3xl"
        footer={<>
          <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
          <Button variant="primary" loading={creating} onClick={formCab.handleSubmit(handleCreate)}>Crear solicitud</Button>
        </>}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox label="Obra destino" placeholder="Buscar obra..." options={obraOptions} value={obraNueva} onChange={setObraNueva} />
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Prioridad</label>
              <select {...formCab.register('prioridad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                <option value="normal">Normal</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">📅 Entrega tentativa (fecha y hora)</label>
            <input
              type="datetime-local"
              {...formCab.register('entrega_tentativa')}
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
            />
            <p className="text-[10px] text-gris-mid mt-1">Opcional — cuándo se espera/necesita el material en obra.</p>
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
      {(() => {
        // Validación: requiere proveedor + precio > 0 + cantidad > 0.
        const cpProv   = formComprar.watch('proveedor_id')
        const cpPrecio = Number(formComprar.watch('precio_unit'))
        const cpCant   = Number(formComprar.watch('cantidad_comprada'))
        const compraInvalida = !cpProv || !(cpPrecio > 0) || !(cpCant > 0)
        return (
      <Modal open={!!modalComprar} onClose={() => setModalComprar(null)} title="🛒 COMPRAR A PROVEEDOR"
        footer={<>
          <Button variant="secondary" onClick={() => setModalComprar(null)}>Cancelar</Button>
          <Button variant="primary" onClick={formComprar.handleSubmit(handleComprar)} disabled={compraInvalida}>Confirmar compra</Button>
        </>}>
        {modalComprar && (
          <div className="flex flex-col gap-4">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-azul">{modalComprar.descripcion}</div>
              <div className="text-xs text-gris-dark font-mono">
                Solicitado: {modalComprar.cantidad} {UNIDADES.find(u => u.value === modalComprar.unidad)?.label ?? modalComprar.unidad}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Combobox label="Proveedor" placeholder="Buscar proveedor..." options={provOptions} value={formComprar.watch('proveedor_id')} onChange={v => formComprar.setValue('proveedor_id', v)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => { formProv.reset({ nombre: '', cuit: '', tel: '' }); setModalNuevoProveedor(true) }}>+ Nuevo</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`Cantidad comprada (${UNIDADES.find(u => u.value === modalComprar.unidad)?.label ?? modalComprar.unidad})`}
                type="number" step="any" min="0"
                hint={Number(formComprar.watch('cantidad_comprada')) !== modalComprar.cantidad ? `Difiere de lo solicitado (${modalComprar.cantidad})` : undefined}
                {...formComprar.register('cantidad_comprada')}
              />
              <Input label="Precio unitario ($)" type="number" step="1" {...formComprar.register('precio_unit')} />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Factura (opcional)</label>
                <select {...formComprar.register('factura_id')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="">Sin factura</option>
                  {(facturas as any[]).map(f => <option key={f.id} value={f.id}>#{f.numero || f.id} — {f.proveedores?.nombre ?? ''}</option>)}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                formFact.reset({ proveedor_id: formComprar.watch('proveedor_id'), numero: '', fecha: toISO(new Date()), total: 0 })
                setAdjunto(null); setModalNuevaFactura(true)
              }}>+ Factura</Button>
            </div>
            {/* Pagador: CADINC adelanta (se suma a la cuenta del cliente) o cliente paga directo */}
            <div>
              <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">¿Quién pagó al proveedor?</div>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 px-3 py-2 border-[1.5px] rounded-lg cursor-pointer transition-colors ${formComprar.watch('pagado_por') === 'cadinc' ? 'border-azul bg-azul-light' : 'border-gris-mid hover:border-azul'}`}>
                  <input type="radio" value="cadinc" {...formComprar.register('pagado_por')} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-azul">CADINC</div>
                    <div className="text-[10px] text-gris-dark">Se suma a la cuenta del cliente</div>
                  </div>
                </label>
                <label className={`flex items-start gap-2 px-3 py-2 border-[1.5px] rounded-lg cursor-pointer transition-colors ${formComprar.watch('pagado_por') === 'cliente' ? 'border-naranja bg-naranja-light' : 'border-gris-mid hover:border-naranja'}`}>
                  <input type="radio" value="cliente" {...formComprar.register('pagado_por')} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-naranja">Cliente directo</div>
                    <div className="text-[10px] text-gris-dark">Solo registro de rendición</div>
                  </div>
                </label>
              </div>
            </div>
            <label className="flex items-start gap-2.5 px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg hover:border-naranja transition-colors cursor-pointer">
              <input
                type="checkbox"
                {...formComprar.register('queda_en_proveedor')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-azul">🏭 Material queda en proveedor</div>
                <div className="text-[11px] text-gris-dark mt-0.5">
                  El material no llega a CADINC ni a la obra todavía: queda en el galpón del proveedor. Lo vas a retirar después desde el tab "Stock en proveedores". No se factura al cliente hasta retirarlo.
                </div>
              </div>
            </label>
          </div>
        )}
      </Modal>
        )
      })()}

      {/* ── Modal COMPRAR EN LOTE (N items, mismo proveedor + factura) ── */}
      <Modal
        open={!!modalComprarLote}
        onClose={() => { if (!loteSubmitting) { setModalComprarLote(null); setFallidosLote([]) } }}
        title={`🛒 COMPRAR ${modalComprarLote?.items.length ?? 0} ÍTEMS AL MISMO PROVEEDOR`}
        width="max-w-2xl"
        footer={<>
          <Button variant="secondary" onClick={() => { setModalComprarLote(null); setFallidosLote([]) }} disabled={loteSubmitting}>
            {fallidosLote.length > 0 ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button variant="primary" onClick={formComprarLote.handleSubmit(handleComprarLote)} loading={loteSubmitting}>
            {fallidosLote.length > 0 ? 'Reintentar fallidos' : `Confirmar compra (${modalComprarLote?.items.length ?? 0})`}
          </Button>
        </>}
      >
        {modalComprarLote && (
          <div className="flex flex-col gap-4">
            {fallidosLote.length > 0 && (
              <div className="bg-rojo-light border border-rojo/30 rounded-xl px-4 py-3 text-sm">
                <div className="font-bold text-rojo mb-1.5">⚠ No se pudieron comprar:</div>
                <ul className="list-disc list-inside text-rojo text-xs space-y-0.5">
                  {fallidosLote.map((f, i) => <li key={i}><strong>{f.desc}</strong>: {f.error}</li>)}
                </ul>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Combobox label="Proveedor" placeholder="Buscar proveedor..." options={provOptions}
                  value={formComprarLote.watch('proveedor_id')}
                  onChange={v => formComprarLote.setValue('proveedor_id', v)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => { formProv.reset({ nombre: '', cuit: '', tel: '' }); setModalNuevoProveedor(true) }}>+ Nuevo</Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Factura (opcional, compartida por todos)</label>
                <select {...formComprarLote.register('factura_id')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="">Sin factura</option>
                  {(facturas as any[]).map(f => <option key={f.id} value={f.id}>#{f.numero || f.id} — {f.proveedores?.nombre ?? ''}</option>)}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                formFact.reset({ proveedor_id: formComprarLote.watch('proveedor_id'), numero: '', fecha: toISO(new Date()), total: 0 })
                setAdjunto(null); setModalNuevaFactura(true)
              }}>+ Factura</Button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Precios por ítem</label>
              <div className="border border-gris-mid rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gris">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase">Ítem</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[110px]">Cant. comprada</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[120px]">Precio unit. ($)</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[110px]">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalComprarLote.items.map(it => {
                      const precio = Number(formComprarLote.watch(`precios.${it.id}`) ?? 0)
                      const cant   = Number(formComprarLote.watch(`cantidades.${it.id}`) ?? it.cantidad)
                      const subtotal = precio * cant
                      const difiere = cant !== it.cantidad
                      const unidLabel = UNIDADES.find(u => u.value === it.unidad)?.label ?? it.unidad
                      return (
                        <tr key={it.id} className="border-t border-gris">
                          <td className="px-3 py-2">
                            <div className="font-medium text-sm">{it.descripcion}</div>
                            <div className="text-[10px] text-gris-dark">Solicitado: {it.cantidad} {unidLabel}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                {...formComprarLote.register(`cantidades.${it.id}`, { valueAsNumber: true })}
                                className={`w-16 px-2 py-1 border rounded text-right font-mono text-sm outline-none focus:border-naranja ${difiere ? 'border-naranja bg-naranja-light/40' : 'border-gris-mid'}`}
                              />
                              <span className="text-[10px] text-gris-dark">{unidLabel}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              {...formComprarLote.register(`precios.${it.id}`, { valueAsNumber: true })}
                              className="w-full px-2 py-1 border border-gris-mid rounded text-right font-mono text-sm outline-none focus:border-naranja"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm font-bold">
                            {subtotal > 0 ? fmtM(subtotal) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gris">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold text-gris-dark uppercase">Total</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-bold text-azul">
                        {fmtM(modalComprarLote.items.reduce((acc, it) => acc + (Number(formComprarLote.watch(`precios.${it.id}`) ?? 0) * Number(formComprarLote.watch(`cantidades.${it.id}`) ?? it.cantidad)), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            {/* Pagador del lote: común a todos los ítems */}
            <div>
              <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">¿Quién pagó al proveedor? (común al lote)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 px-3 py-2 border-[1.5px] rounded-lg cursor-pointer transition-colors ${formComprarLote.watch('pagado_por') === 'cadinc' ? 'border-azul bg-azul-light' : 'border-gris-mid hover:border-azul'}`}>
                  <input type="radio" value="cadinc" {...formComprarLote.register('pagado_por')} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-azul">CADINC</div>
                    <div className="text-[10px] text-gris-dark">Se suma a la cuenta del cliente</div>
                  </div>
                </label>
                <label className={`flex items-start gap-2 px-3 py-2 border-[1.5px] rounded-lg cursor-pointer transition-colors ${formComprarLote.watch('pagado_por') === 'cliente' ? 'border-naranja bg-naranja-light' : 'border-gris-mid hover:border-naranja'}`}>
                  <input type="radio" value="cliente" {...formComprarLote.register('pagado_por')} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-naranja">Cliente directo</div>
                    <div className="text-[10px] text-gris-dark">Solo registro de rendición</div>
                  </div>
                </label>
              </div>
            </div>
            <label className="flex items-start gap-2.5 px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg hover:border-naranja transition-colors cursor-pointer">
              <input type="checkbox" {...formComprarLote.register('queda_en_proveedor')} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-bold text-azul">🏭 Todos los ítems quedan en el galpón del proveedor</div>
                <div className="text-[11px] text-gris-dark mt-0.5">
                  Aplica a todos los ítems del lote. Los retirás después desde "Stock en proveedores".
                </div>
              </div>
            </label>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox label="Proveedor" placeholder="Buscar..." options={provOptions} value={formFact.watch('proveedor_id')} onChange={v => formFact.setValue('proveedor_id', v)} />
            <Input label="Nro factura" {...formFact.register('numero')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Combobox label="Obra destino" placeholder="Buscar obra..." options={obraOptions} value={obraEdit} onChange={setObraEdit} />
              <div>
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Prioridad</label>
                <select {...formEdit.register('prioridad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">📅 Entrega tentativa (fecha y hora)</label>
              <input
                type="datetime-local"
                {...formEdit.register('entrega_tentativa')}
                className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja"
              />
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

// ── Tabs de categoría (segmented control) + dropdown "Otras" ──
// Componente local para no inflar la API de SolicitudesTab. Si en algún
// momento se reusa en otro módulo, se extrae a `components/ui/`.
function CategoriaTabs({
  categoriaSel,
  counts,
  onSelect,
}: {
  categoriaSel: CategoriaSol
  counts:       Record<CategoriaSol, number>
  onSelect:     (c: CategoriaSol) => void
}) {
  const [otrasOpen, setOtrasOpen] = useState(false)
  const otrasActiva = (CATEGORIAS_OTRAS as readonly string[]).includes(categoriaSel)
  const totalOtras = counts['sin-aprobar'] + counts['rechazadas']

  // Cerrar dropdown al perder foco (cualquier click afuera).
  useEffect(() => {
    if (!otrasOpen) return
    const onDocClick = () => setOtrasOpen(false)
    // Defer 1 tick para que el click que lo abrió no lo cierre.
    const id = setTimeout(() => document.addEventListener('click', onDocClick), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', onDocClick)
    }
  }, [otrasOpen])

  return (
    <div className="flex gap-1 bg-gris rounded-xl p-1 relative">
      {CATEGORIAS_PRINCIPALES.map(c => {
        const active = categoriaSel === c
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
              active
                ? 'bg-azul text-white shadow-sm'
                : 'text-gris-dark hover:text-carbon hover:bg-white'
            }`}
          >
            {CATEGORIA_LABEL[c]}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                active ? 'bg-white/20' : 'bg-white border border-gris-mid text-carbon'
              }`}
            >
              {counts[c]}
            </span>
          </button>
        )
      })}
      {/* Otras dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOtrasOpen(v => !v) }}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
            otrasActiva
              ? 'bg-azul text-white shadow-sm'
              : 'text-gris-dark hover:text-carbon hover:bg-white'
          }`}
        >
          {otrasActiva ? CATEGORIA_LABEL[categoriaSel] : 'Otras'}
          {totalOtras > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                otrasActiva ? 'bg-white/20' : 'bg-white border border-gris-mid text-carbon'
              }`}
            >
              {totalOtras}
            </span>
          )}
          <span className="text-[8px] opacity-70">▾</span>
        </button>
        {otrasOpen && (
          <div
            className="absolute top-full right-0 mt-1 bg-white border border-gris-mid rounded-lg shadow-lg z-10 min-w-[180px] py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {CATEGORIAS_OTRAS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onSelect(c); setOtrasOpen(false) }}
                className={`w-full text-left text-xs font-bold px-3 py-2 hover:bg-gris transition-colors flex items-center justify-between ${
                  categoriaSel === c ? 'text-azul' : 'text-carbon'
                }`}
              >
                <span>{CATEGORIA_LABEL[c]}</span>
                <span className="text-[10px] font-bold bg-gris text-gris-dark px-1.5 py-0.5 rounded-full">
                  {counts[c]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
