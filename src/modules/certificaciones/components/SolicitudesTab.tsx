'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import {
  useSolicitudes, useCreateSolicitud, useUpdateSolicitud, useDeleteSolicitud,
  useComprarItem, useDespacharItem, useEnviarItem, useRechazarItem, useRevertirItem, useRevertirEnvio, useComprarFaltante,
  useRecibirDevolucion,
  useResolverStockCliente,
  useEditarItem,
} from '../hooks/useSolicitudes'
import { useProveedores, useCreateProveedor } from '../hooks/useProveedores'
import { useStockCliente } from '../hooks/useStockCliente'
import { useFacturasCompra, useCreateFactura } from '../hooks/useFacturasCompra'
import { useStockMateriales, useStockRubros, useCreateStockMaterial, useUpdateStockMaterial, parseMaterialConflicto } from '../hooks/useStock'
import type { CreateStockMaterialDto, MaterialConflicto, MaterialCandidato } from '../hooks/useStock'
import { MaterialParecidoModal } from './MaterialParecidoModal'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateRemitoEnvio } from '../hooks/useRemitosEnvio'
import { imprimirRemito, armarEstadoPedido, armarEnvios, useSoloEnvio, SoloEnvioCheck, type EstadoPedido } from './RemitoEnvioPrint'
import { useRemitosEnvio } from '../hooks/useRemitosEnvio'
import { EMPRESA } from '@/lib/config/empresa'
import { netaAFinal, finalANeta } from '@/lib/utils/iva'
import { ItemHistorialModal } from './ItemHistorialModal'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { UNIDADES } from '../constants'
import { createClient } from '@/lib/supabase/client'
import { toISO } from '@/lib/utils/dates'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { SolicitudCompra, SolicitudCompraItem, SolicitudEstado, SolicitudProgreso, ItemEstado, ItemClase, Obra, Proveedor, StockMaterial, StockRubro, RemitoEnvio, StockClienteRow } from '@/types/domain.types'


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
  de_stock_cliente: { label: 'Stock cliente', bg: 'bg-verde-light', text: 'text-azul-mid'  },
  enviado:      { label: 'Enviado',       bg: 'bg-verde-light',    text: 'text-verde'     },
  rechazado:    { label: 'Rechazado',     bg: 'bg-rojo-light',     text: 'text-rojo'      },
}

function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
// Formatea un timestamp "YYYY-MM-DDTHH:mm[:ss]" a "DD/MM/YYYY HH:mm".
function fmtFH(s: string) { const [fecha, hora = ''] = s.split('T'); return `${fmtF(fecha)}${hora ? ' ' + hora.slice(0, 5) : ''}` }
// Hora local (zona del navegador, AR) de un timestamp CON timezone como
// `created_at` (viene en UTC). Acá `new Date()` es correcto: el valor trae
// offset, no es un date-only (no aplica el corrimiento de los 'YYYY-MM-DD').
function fmtHora(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

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
/**
 * `libre` = el usuario pidió explícitamente escribir el material a mano
 * (link "No encuentro el material"). Antes el input de texto libre estaba
 * SIEMPRE visible debajo del buscador, y era el camino de menor resistencia:
 * de ahí salieron los 3.116 ítems históricos con descripción inventada, los
 * duplicados del catálogo y los 63 pedidos cargados con precio 1. Ahora hay
 * que optar por él. No se elimina: hay material real que no está catalogado
 * y bloquear el pedido sería peor.
 */
interface LineaForm { _id: number; descripcion: string; cantidad: number; unidad: string; obs: string; material_id: number | null; libre: boolean; color: string; clase: ItemClase; devuelve: boolean }
let nextId = 1
function newLinea(): LineaForm { return { _id: nextId++, descripcion: '', cantidad: 1, unidad: 'unid', obs: '', material_id: null, libre: false, color: '', clase: 'material', devuelve: false } }

/**
 * El color en las pantallas donde se RESUELVE el pedido (comprar, despachar).
 * Si solo se ve en el detalle, el que compra confirma sin saber el tono y trae
 * el color equivocado — que es exactamente el problema que el campo venía a
 * resolver.
 */
function ChipColor({ color }: { color?: string | null }) {
  if (!color) return null
  return (
    <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul align-middle">
      {color}
    </span>
  )
}

/**
 * Material o herramienta, por línea. Y si es herramienta, si la obra la PIDE o
 * la DEVUELVE.
 *
 * Es la puerta única: el pedido se carga entero acá, mezclado, y la
 * derivación al pañol es un filtro sobre `clase`. No hay pantalla aparte para
 * pedir herramientas porque el pedido de obra es UNO SOLO (97 solicitudes
 * mixtas en 60 días) y partirlo es pelearle a cómo trabajan.
 *
 * El toggle es explícito y no se deduce del catálogo: el 97,6% de las
 * herramientas se piden en texto libre, sin material_id. El catálogo solo
 * pre-tilda.
 */
function ClaseLinea({ linea, onChange }: {
  linea:    LineaForm
  onChange: (patch: Partial<LineaForm>) => void
}) {
  const esHerr = linea.clase === 'herramienta'
  const base = 'px-2 py-1 text-[11px] font-bold rounded transition-colors'
  const on   = 'bg-carbon text-white'
  const off  = 'bg-gris text-gris-dark hover:bg-gris-mid'
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div className="flex rounded-lg overflow-hidden border border-gris-mid">
        <button type="button" onClick={() => onChange({ clase: 'material', devuelve: false })}
          className={`${base} ${!esHerr ? on : off}`}>Material</button>
        <button type="button" onClick={() => onChange({ clase: 'herramienta' })}
          className={`${base} ${esHerr ? on : off}`}>🔧 Herramienta</button>
      </div>
      {esHerr && (
        <div className="flex rounded-lg overflow-hidden border border-gris-mid">
          <button type="button" onClick={() => onChange({ devuelve: false })}
            className={`${base} ${!linea.devuelve ? on : off}`}>Pide</button>
          <button type="button" onClick={() => onChange({ devuelve: true })}
            className={`${base} ${linea.devuelve ? on : off}`} title="La obra devuelve esta herramienta al pañol">↩ Devuelve</button>
        </div>
      )}
    </div>
  )
}

/**
 * El color solo se pide donde es una elección real (pinturas, pastina, cable
 * unipolar, cerámicos), marcado con `stock_materiales.usa_color`. En el resto no
 * aparece: un input de color en las 900 filas, incluido el tornillo, sería ruido.
 *
 * Va como texto libre a propósito — la carta de colores es del proveedor y cambia.
 */
function ColorLinea({ linea, material, onChange }: {
  linea:    LineaForm
  material: StockMaterial | null | undefined
  onChange: (patch: Partial<LineaForm>) => void
}) {
  if (!material?.usa_color) return null
  return (
    <input
      type="text" autoComplete="off"
      placeholder="Color..."
      value={linea.color}
      onChange={e => onChange({ color: e.target.value })}
      className="w-28 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja"
    />
  )
}

/**
 * El escape del catálogo, detrás de un link en vez de un input siempre
 * visible (ver `LineaForm.libre`). Se usa igual en el modal de alta y en el
 * de edición, por eso está acá afuera.
 */
function DescripcionLibre({ linea, onChange }: {
  linea:    LineaForm
  onChange: (patch: Partial<LineaForm>) => void
}) {
  if (linea.material_id) return null

  // Las herramientas NO se cargan en texto libre ni se crean desde el pedido
  // (decisión del user 2026-09-05): así nacieron los duplicados del catálogo.
  // Si no está, se da de alta en Herramientas › Catálogo. Un renglón viejo que
  // ya venía libre (edición) sigue mostrando su texto.
  if (linea.clase === 'herramienta' && !linea.libre) {
    return (
      <p className="mt-2 text-xs text-gris-dark">
        Las herramientas salen del catálogo. Si no está,{' '}
        <a href="/herramientas/catalogo" target="_blank" rel="noreferrer" className="font-semibold text-azul underline underline-offset-2">cargala en Herramientas › Catálogo</a>
        {' '}y volvé a buscarla.
      </p>
    )
  }

  if (!linea.libre) {
    return (
      <button
        type="button"
        onClick={() => onChange({ libre: true })}
        className="mt-2 text-xs font-semibold text-gris-dark underline underline-offset-2 hover:text-naranja transition-colors"
      >
        No encuentro el material
      </button>
    )
  }

  return (
    <div className="mt-2">
      <input
        type="text" autoComplete="off" autoFocus
        placeholder="Describí el material..."
        value={linea.descripcion}
        onChange={e => onChange({ descripcion: e.target.value })}
        className="w-full px-2 py-1.5 border border-naranja/60 rounded-lg text-sm outline-none focus:border-naranja"
      />
      <div className="flex items-start justify-between gap-2 mt-1">
        <span className="text-[11px] text-gris-dark">
          Sin catalogar: no cruza precios ni stock con el resto de las obras.
        </span>
        <button
          type="button"
          onClick={() => onChange({ libre: false, descripcion: '' })}
          className="shrink-0 text-[11px] font-bold text-azul hover:text-naranja transition-colors"
        >
          Volver al catálogo
        </button>
      </div>
    </div>
  )
}

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

// Mapeo estado-de-ítem → tab donde se muestra ese ítem. Los 3 tabs principales
// se arman por ESTADO DE ÍTEM (no por el `progreso` global de la solicitud), de
// modo que un mismo pedido aparezca REPARTIDO: sus ítems pendientes en "Por
// comprar" y los ya comprados en "Por enviar". Un ítem `rechazado` no cae en
// ningún tab (se oculta de comprar/enviar/enviadas; sigue visible en el detalle).
const ITEM_CAT: Partial<Record<ItemEstado, CategoriaSol>> = {
  pendiente:    'por-comprar',
  comprado:     'por-enviar',
  de_deposito:  'por-enviar',
  en_proveedor: 'por-enviar',   // comprado pero aún en el proveedor (falta retirar)
  retirado:     'por-enviar',
  de_stock_cliente: 'por-enviar',  // material del cliente ya descontado del ledger, falta enviarlo
  enviado:      'enviadas',
}
function esTabPorItem(cat: CategoriaSol): boolean {
  return cat === 'por-comprar' || cat === 'por-enviar' || cat === 'enviadas'
}
function itemEnCategoria(estado: ItemEstado, cat: CategoriaSol): boolean {
  return ITEM_CAT[estado] === cat
}

function matchCategoria(s: SolicitudCompra, cat: CategoriaSol): boolean {
  const items = s.items ?? []
  switch (cat) {
    // Tabs por-ítem: la solicitud aprobada aparece si tiene AL MENOS un ítem
    // cuyo estado cae en este tab (por eso un pedido se reparte entre tabs).
    case 'por-comprar':
    case 'por-enviar':
      return s.estado === 'aprobada' && items.some(it => itemEnCategoria(it.estado, cat))
    case 'enviadas': {
      if (s.estado !== 'aprobada' || items.length === 0) return false
      // Terminal: tiene ítems enviados, o ya no queda nada activo (todo
      // enviado/rechazado) — así un pedido "cerrado" no desaparece de la vista.
      const hayActivo = items.some(it =>
        itemEnCategoria(it.estado, 'por-comprar') || itemEnCategoria(it.estado, 'por-enviar'))
      return items.some(it => it.estado === 'enviado') || !hayActivo
    }
    case 'sin-aprobar': return s.estado === 'pendiente'
    case 'rechazadas':  return s.estado === 'rechazada'
  }
}

// Fecha del envío más reciente de un pedido = max(fecha_envio) de sus ítems
// enviados. Se usa para ordenar la pestaña "Enviadas" por lo último que se mandó.
function ultimoEnvio(s: SolicitudCompra): string {
  let max = ''
  for (const it of s.items ?? []) {
    if (it.estado === 'enviado' && it.fecha_envio && it.fecha_envio > max) max = it.fecha_envio
  }
  return max
}

function isCategoriaValida(s: string | null): s is CategoriaSol {
  return s !== null && (CATEGORIAS_ALL as readonly string[]).includes(s)
}

// ── Componente principal ──
export function SolicitudesTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const perfiles = usePerfilesMap()
  // Permisos: deshabilitar (no ocultar) botones según capacidad. El backend
  // valida igual; esto evita clicks que rebotan con error feo (CLAUDE.md §6).
  const { puedeCrear, puedeEditar, puedeEliminar, resolverItems } = usePermisos('certificaciones')
  // El puente a la bandeja del pañol sólo si el usuario tiene el módulo.
  const { puedeVer: puedeVerHerramientas } = usePermisos('herramientas')
  const { data: obras = [] } = useObras('certificaciones')
  // Historial de remitos emitidos (pedido del dueño 2026-07-31: hasta hoy no
  // había forma de ver ni reimprimir un remito viejo — si se cerraba el modal
  // post-generación, el número quedaba huérfano de papel).
  const [modalRemitos, setModalRemitos] = useState(false)
  const [buscaRemito, setBuscaRemito]   = useState('')
  const { data: proveedores = [] } = useProveedores()
  // Ledger de stock de cliente: materiales con saldo, para ofrecer resolver
  // pedidos con material que el cliente ya pagó (botón "Cliente").
  const { data: stockCliente = [] } = useStockCliente()
  const { data: facturas = [] } = useFacturasCompra()
  const { data: stockMateriales = [] } = useStockMateriales()
  const { mutate: createProveedor, isPending: creandoProv } = useCreateProveedor()
  const { mutate: createFactura, isPending: creandoFact } = useCreateFactura()
  const stockMap = new Map((stockMateriales as StockMaterial[]).map(m => [m.id, m]))

  // ── Alta de material desde el pedido ──
  //
  // Sin esto el operario que no encuentra su material solo puede escribir
  // texto libre, y el catálogo nunca crece: es la fuente de los duplicados
  // que venimos limpiando. El alta pega al módulo `stock` del backend, que
  // exige permiso de `certificaciones` (ver stock.routes.ts), así que
  // `puedeCrear` es el gate correcto — no hace falta otro permiso.
  const { data: stockRubros = [] } = useStockRubros()
  const { mutate: createMat, isPending: creandoMat } = useCreateStockMaterial()
  const { mutate: updateMat, isPending: guardandoMat } = useUpdateStockMaterial()
  /** Qué línea disparó el alta, para poder seleccionarle el material creado. */
  const [modalNuevoMat, setModalNuevoMat] = useState<
    { lineaId: number; enEdicion: boolean; nombre: string; rubro_id: number | ''; unidad: string } | null
  >(null)
  /** 409 del candado anti-duplicados. `dtoCreate` permite reintentar con `forzar`. */
  const [conflictoMat, setConflictoMat] = useState<
    (MaterialConflicto & { nombreIntentado: string; dtoCreate: CreateStockMaterialDto | null; lineaId: number; enEdicion: boolean }) | null
  >(null)

  // Opciones del selector de material del catálogo. Se arma UNA vez por
  // render de la pantalla (antes se rearmaba por cada línea del pedido:
  // ~700 materiales × N líneas).
  //
  // Tres cosas que empujan al operario a usar el catálogo en vez del texto
  // libre (hoy el 97% de los ítems se carga libre):
  //  · `search` = alias del material. La obra pide "lija 150" y el catálogo
  //    guarda "Lija al agua N°150"; los alias cruzan los dos vocabularios
  //    sin mostrarse en la UI.
  //  · `sub` = rubro, y el stock SOLO si hay. Antes decía "Stock: 0" en 684
  //    de 718 materiales (el stock del catálogo está mal cargado): el
  //    operario leía "no hay" y se iba al input de texto libre de abajo.
  //  · `group` = rubro, para no dar una lista plana de 718 ítems.
  const stockOptions: ComboboxOption[] = useMemo(() => {
    const mats = [...(stockMateriales as StockMaterial[])]
    // Ordenamos por rubro y después por nombre: el Combobox agrupa por orden
    // de primera aparición, así los rubros salen alfabéticos y estables.
    mats.sort((a, b) => {
      const ra = a.stock_rubros?.nombre ?? 'Sin rubro'
      const rb = b.stock_rubros?.nombre ?? 'Sin rubro'
      return ra.localeCompare(rb, 'es') || a.nombre.localeCompare(b.nombre, 'es')
    })
    return mats.map(m => {
      const rubro = m.stock_rubros?.nombre ?? 'Sin rubro'
      const hayStock = (m.stock_actual ?? 0) > 0
      return {
        value:  String(m.id),
        label:  m.nombre,
        // OJO: el rubro va SOLO en `group`. Si entra en `sub` contamina la
        // búsqueda (Combobox filtra sobre label+sub+search): tipear "pintura"
        // devolvía las 76 filas del rubro en vez de los 4 materiales que la
        // tienen en el nombre. Medido antes de sacarlo.
        sub:    hayStock ? `${m.stock_actual} ${m.unidad} en depósito` : undefined,
        search: m.alias ?? [],
        group:  rubro,
      }
    })
  }, [stockMateriales])

  /** Deja el material elegido en la línea que disparó el alta. */
  function usarMaterialEnLinea(lineaId: number, enEdicion: boolean, m: StockMaterial) {
    // `color` se limpia si el material nuevo no usa color: si no, el valor queda
    // pegado en el state, el input desaparece y se guarda un color fantasma sobre
    // un material que no lleva (ej. "gris" sobre Cemento Portland).
    const aplicar = (x: LineaForm): LineaForm => ({
      ...x,
      material_id: m.id,
      descripcion: m.nombre,
      unidad:      m.unidad,
      libre:       false,
      color:       m.usa_color ? x.color : '',
      // El catalogo solo PRE-TILDA hacia herramienta, nunca baja la marca del
      // usuario. `stock_materiales.clase` es NOT NULL default 'material', asi que
      // un `??` jamas caeria al valor de la linea: elegir cualquiera de los 891
      // materiales comunes (o crear uno nuevo, que nace 'material') pisaba el
      // toggle Herramienta sin aviso. Lo cazo la revision adversarial.
      clase:       m.clase === 'herramienta' ? 'herramienta' : x.clase,
      devuelve:    (m.clase === 'herramienta' ? 'herramienta' : x.clase) === 'herramienta' ? x.devuelve : false,
    })
    if (enEdicion) setLineasEdit(p => p.map(x => x._id === lineaId ? aplicar(x) : x))
    else           setLineas(p => p.map(x => x._id === lineaId ? aplicar(x) : x))
    setModalNuevoMat(null)
    setConflictoMat(null)
  }

  /**
   * POST del material nuevo. El backend puede responder 409 con el candado
   * anti-duplicados; ahí abrimos "¿No será este?" en vez de dejar al usuario
   * con un toast y sin salida (que es exactamente cuando se va al texto libre).
   */
  function enviarCreateMat(dto: CreateStockMaterialDto, lineaId: number, enEdicion: boolean) {
    createMat(dto, {
      onSuccess: (m: StockMaterial) => {
        toast(dto.forzar ? 'Material creado (confirmado como distinto)' : 'Material agregado al catálogo', 'ok')
        usarMaterialEnLinea(lineaId, enEdicion, m)
      },
      onError: (e: unknown) => {
        const c = parseMaterialConflicto(e)
        if (c) { setConflictoMat({ ...c, nombreIntentado: dto.nombre, dtoCreate: dto, lineaId, enEdicion }); return }
        toast(e instanceof Error ? e.message : 'Error', 'err')
      },
    })
  }

  /**
   * Salida 1 del modal de conflicto: en vez de crear una fila nueva, suma lo
   * que el usuario tipeó como sinónimo del material que ya existe. Es como el
   * catálogo aprende los nombres de obra. `alias` se reemplaza entero, así que
   * hay que mandar los que ya tenía más el nuevo.
   */
  function agregarSinonimoMat(c: MaterialCandidato) {
    if (!conflictoMat) return
    const existente = stockMap.get(c.id)
    if (!existente) { toast('Recargá la página para operar sobre ese material', 'err'); return }
    const termino = conflictoMat.nombreIntentado.trim().toLowerCase()
    const alias = Array.from(new Set([...(existente.alias ?? []), termino]))
    const { lineaId, enEdicion } = conflictoMat
    updateMat({ id: existente.id, dto: { alias } }, {
      onSuccess: (m: StockMaterial) => {
        toast(`Guardado: buscando "${termino}" ahora aparece ${existente.nombre}`, 'ok')
        usarMaterialEnLinea(lineaId, enEdicion, m ?? existente)
      },
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'err'),
    })
  }

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
  const { mutate: updateSol, isPending: updating } = useUpdateSolicitud()
  const { mutate: removeSol } = useDeleteSolicitud()
  const { mutate: comprarItem, isPending: comprando } = useComprarItem()
  const { mutate: despacharItem, isPending: despachando } = useDespacharItem()
  const { mutate: resolverStockCliente, isPending: resolviendoStockCliente } = useResolverStockCliente()
  const { mutate: enviarItem } = useEnviarItem()
  const { mutate: recibirDevolucion, isPending: recibiendoDev } = useRecibirDevolucion()
  const { mutate: rechazarItem } = useRechazarItem()
  const { mutate: revertirItem } = useRevertirItem()
  const { mutate: revertirEnvio } = useRevertirEnvio()
  const { mutate: comprarFaltante } = useComprarFaltante()
  const { mutate: editarPrecioItem, isPending: guardandoPrecio } = useEditarItem()
  const { mutate: createRemito, isPending: enviandoRemito } = useCreateRemitoEnvio()
  // Carga de precio inline para un ítem ya enviado que quedó sin precio.
  // El input es string local; el handler valida y castea a number.
  const [precioItemId, setPrecioItemId] = useState<number | null>(null)
  const [precioDraft, setPrecioDraft] = useState('')
  function guardarPrecioItem(itemId: number) {
    const p = Number(precioDraft)
    if (!Number.isFinite(p) || p <= 0) { toast('Ingresá un precio válido', 'err'); return }
    editarPrecioItem({ itemId, dto: { precio_unit: p } }, {
      onSuccess: () => { toast('✓ Precio cargado', 'ok'); setPrecioItemId(null); setPrecioDraft('') },
      onError: () => toast('Error al cargar el precio', 'err'),
    })
  }
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Último remito generado: se ofrece imprimir desde un modal con su propio
  // botón, para que el window.open corra DENTRO del gesto del usuario. En
  // móvil/PWA, abrir la ventana en el onSuccess async se bloquea silenciosamente
  // y el remito no se abría, aunque el ítem ya quedaba 'enviado'.
  const [ultimoRemito, setUltimoRemito] = useState<{ remito: RemitoEnvio; obraNom?: string; estado?: EstadoPedido } | null>(null)
  // Modal de armado de remito con cantidades editables (envíos parciales):
  // lo que se manda de menos queda pendiente para otro remito.
  const [modalEnvio, setModalEnvio] = useState<{ solicitud: SolicitudCompra; items: SolicitudCompraItem[] } | null>(null)
  // Recibir en depósito acopia stock, pero sólo de los renglones que el backend
  // puede acreditar. Si alguno queda afuera hay que decirlo antes, no después.
  const [confirmoSinStock, setConfirmoSinStock] = useState(false)
  const [cantEnvio, setCantEnvio] = useState<Record<number, string>>({})
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
  // Resolución con material del cliente: ítem + obra para filtrar su ledger.
  const [modalStockCliente, setModalStockCliente] = useState<{ item: SolicitudCompraItem; obraCod: string } | null>(null)
  // ¿Los precios de la tabla del lote se cargan netos o finales? Se guarda
  // SIEMPRE el final (convención de todo el sistema); si el usuario carga
  // netos, la conversión (+21%) se aplica al confirmar y en los subtotales.
  const [lotePreciosNetos, setLotePreciosNetos] = useState(false)
  const [modalComprarLote, setModalComprarLote] = useState<{
    solId: number
    items: SolicitudCompraItem[]
  } | null>(null)
  const [fallidosLote, setFallidosLote] = useState<Array<{ desc: string; error: string }>>([])
  const [loteSubmitting, setLoteSubmitting] = useState(false)
  // Guarda desde qué modal se abrió el alta de proveedor, para asignarlo al form correcto.
  const [modalNuevoProveedor, setModalNuevoProveedor] = useState<null | 'comprar' | 'lote'>(null)
  // Preferencia de impresión, compartida por borrador / post-remito / reimpresión.
  const [soloEnvio, setSoloEnvio] = useSoloEnvio()
  const [modalNuevaFactura, setModalNuevaFactura] = useState(false)
  // Historial de transiciones de un ítem (timeline read-only).
  const [modalHistorial, setModalHistorial] = useState<SolicitudCompraItem | null>(null)

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

  // Detección de proveedor duplicado en el alta inline. La DB tiene un índice único
  // sobre lower(btrim(nombre)) (migración 20260818_proveedores_dedup); acá además
  // colapsamos espacios internos para avisar antes de que el backend devuelva 409.
  const normalizarNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const nombreProvNuevo = formProv.watch('nombre') ?? ''
  const provDuplicado = nombreProvNuevo.trim()
    ? (proveedores as Proveedor[]).find(p => normalizarNombre(p.nombre) === normalizarNombre(nombreProvNuevo))
    : undefined

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
    // En "Enviadas" ordenamos por el envío MÁS RECIENTE del pedido (la última
    // fecha en que se marcó algún ítem como enviado), de más nuevo a más viejo.
    if (categoriaSel === 'enviadas') {
      const ea = ultimoEnvio(a), eb = ultimoEnvio(b)
      if (ea !== eb) return eb.localeCompare(ea)
      return b.id - a.id   // mismo día → el pedido más nuevo primero
    }
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
    const items = lineas.filter(l => l.descripcion.trim()).map(l => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, obs: l.obs || null, material_id: l.material_id, color: l.color.trim() || null, clase: l.clase, devuelve: l.clase === 'herramienta' && l.devuelve }))
    if (!items.length) { toast('Agregá al menos un material', 'err'); return }
    // Cantidad obligatoria: dejar el campo vacío guardaba 0 en silencio y el
    // pedido viajaba con "0 unidades" hasta el remito (dato real: 73 items
    // en 0 cargados así hasta 2026-07-22).
    const sinCantidad = items.find(i => !Number.isFinite(i.cantidad) || i.cantidad <= 0)
    if (sinCantidad) { toast(`Cargá la cantidad de "${sinCantidad.descripcion}"`, 'err'); return }
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
      // Un ítem viejo sin material del catálogo ya tiene descripción escrita a
      // mano: hay que mostrarla, no esconderla detrás del link.
      libre: !it.material_id,
      color: it.color ?? '',
      clase: it.clase ?? 'material',
      devuelve: it.devuelve ?? false,
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
        color: l.color.trim() || null,
        clase: l.clase,
        devuelve: l.clase === 'herramienta' && l.devuelve,
        material_id: l.material_id,
      }))

    // Misma validación que al crear: sin cantidad no hay pedido.
    const sinCantidadEdit = itemsToSend.find(i => !Number.isFinite(i.cantidad) || i.cantidad <= 0)
    if (sinCantidadEdit) { toast(`Cargá la cantidad de "${sinCantidadEdit.descripcion}"`, 'err'); return }

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
    removeSol(id, {
      onSuccess: () => toast('Eliminada', 'ok'),
      onError: (e: any) => {
        const code = e?.body?.error || e?.code
        if (code === 'SOLICITUD_TIENE_COBROS') {
          toast('Tiene materiales ya cobrados al cliente. Eliminá primero el pago en Cuenta del cliente.', 'err')
        } else if (code === 'SOLICITUD_TIENE_REMITOS') {
          toast('Tiene remitos de envío emitidos: no se puede eliminar.', 'err')
        } else {
          toast(e.message || 'Error', 'err')
        }
      },
    })
  }

  // ── Acciones sobre ítems ──
  function abrirComprar(item: SolicitudCompraItem) {
    formComprar.reset({ proveedor_id: '', precio_unit: 0, precio_neto: 0, factura_id: '', queda_en_proveedor: false, pagado_por: 'cadinc', cantidad_comprada: item.cantidad })
    setModalComprar(item)
  }
  function handleComprar(data: any) {
    if (!modalComprar?.id) return
    const proveedorId = Number(data.proveedor_id)
    const precio = Number(data.precio_unit)
    if (!proveedorId) { toast('Elegí un proveedor', 'err'); return }
    // Compra siempre con precio (la factura lo tiene). El despacho de depósito
    // sí puede quedar a tasar; esto es solo para compras.
    if (!Number.isFinite(precio) || precio <= 0) { toast('Cargá un precio unitario mayor a 0', 'err'); return }
    const cantComprada = Number(data.cantidad_comprada)
    comprarItem({
      itemId: modalComprar.id,
      dto: {
        proveedor_id:        proveedorId,
        precio_unit:         precio,
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
    // El toggle arranca en "finales": el precio_ref del catálogo que se
    // precarga abajo es final con IVA, y mezclarlo con modo neto lo inflaría.
    setLotePreciosNetos(false)
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
      const precioCargado = Number(data.precios?.[String(it.id)] ?? 0)
      // Con el toggle en "netos", lo tipeado es sin IVA: se guarda el final.
      const precio = lotePreciosNetos ? netaAFinal(precioCargado) : precioCargado
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

  // Materiales del cliente con saldo, por obra (para el botón "Cliente").
  const stockClientePorObra = useMemo(() => {
    const map = new Map<string, StockClienteRow[]>()
    for (const r of stockCliente as StockClienteRow[]) {
      if (Number(r.saldo) <= 0) continue
      if (!map.has(r.obra_cod)) map.set(r.obra_cod, [])
      map.get(r.obra_cod)!.push(r)
    }
    return map
  }, [stockCliente])

  function handleResolverStockCliente(stockItemId: number) {
    if (!modalStockCliente?.item.id) return
    resolverStockCliente({ itemId: modalStockCliente.item.id, stockItemId }, {
      onSuccess: () => {
        toast('Cubierto con material del cliente — no se factura', 'ok')
        setModalStockCliente(null)
      },
      onError: (e: Error) => {
        const code = e?.message || ''
        toast(
          /SALDO_INSUFICIENTE/.test(code) ? 'El saldo del cliente no alcanza para este ítem'
          : /OBRA_DISTINTA/.test(code)    ? 'Ese material pertenece a otra obra'
          : code || 'Error al resolver con stock del cliente',
          'err',
        )
      },
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
      // El botón ya no se muestra en pedidos con destino depósito, pero una
      // pestaña vieja todavía puede mandarlo: el backend corta con este code
      // y sin traducción el toast escupiría la constante cruda.
      onError: (e: any) => toast(
        e.message === 'DESPACHO_A_DEPOSITO'
          ? 'El depósito no se despacha a sí mismo. Si el material ya está en el depósito, rechazá el renglón.'
          : (e.message || 'Error'),
        'err',
      ),
    })
  }

  // La obra devuelve la herramienta al pañol. Un solo paso: no hay compra ni
  // despacho previos que resolver, y el ledger del pañol lo registra solo.
  function handleRecibirDevolucion(itemId: number) {
    recibirDevolucion({ itemId }, {
      onSuccess: () => toast('Devolución recibida en el pañol', 'ok'),
      onError:   (e: any) => toast(e.message || 'Error', 'err'),
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

  // Parte un ítem de depósito con envío parcial: cierra el original por lo
  // enviado y crea un renglón nuevo por el faltante para comprarlo.
  function handleComprarFaltante(item: SolicitudCompraItem) {
    const efectiva = Number(item.cantidad_comprada ?? item.cantidad)
    const enviada  = Number(item.cantidad_enviada ?? 0)
    const faltante = efectiva - enviada
    if (!confirm(
      `¿Comprar el faltante de "${item.descripcion}"?\n\n` +
      `• El renglón original queda cerrado con las ${enviada} enviadas de depósito` +
      ` (las ${faltante} descontadas de más vuelven al stock).\n` +
      `• Se crea un renglón nuevo por ${faltante} ${item.unidad} en "Por comprar".`
    )) return
    comprarFaltante(item.id!, {
      onSuccess: (r: any) => toast(`✓ Renglón partido: ${r?.faltante ?? faltante} ${item.unidad} pasaron a "Por comprar"`, 'ok'),
      onError: (e: any) => {
        const code = e?.body?.error || e?.code
        if (code === 'ITEM_COBRADO')  toast('El material ya fue cobrado al cliente: liberá el cobro primero (Cuenta del cliente)', 'err')
        else if (code === 'SIN_ENVIOS') toast('Este ítem no tiene envíos parciales: usá ↩ deshacer y resolvelo de nuevo como compra', 'err')
        else toast(e.message || 'Error', 'err')
      },
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

  // Tilda/destilda de una TODOS los ítems enviables del pedido
  // (comprado/de_deposito/retirado). Si ya están todos tildados, los suelta.
  function toggleSelectTodos(items: SolicitudCompraItem[]) {
    const enviables = items.filter(it =>
      it.id != null && (it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado' || it.estado === 'de_stock_cliente'))
    if (enviables.length === 0) return
    const todosTildados = enviables.every(it => selected.has(it.id!))
    setSelected(prev => {
      const n = new Set(prev)
      for (const it of enviables) {
        if (todosTildados) n.delete(it.id!)
        else n.add(it.id!)
      }
      return n
    })
  }

  // Abre el modal de armado de remito con cantidades editables. Cada item
  // arranca con su PENDIENTE de envío (efectiva − ya enviada): si Sosa manda
  // de menos, se baja el número y el resto queda pendiente para otro remito.
  function enviarConRemito(solicitud: SolicitudCompra, itemIds: number[]) {
    const items = (solicitud.items ?? []).filter(it => itemIds.includes(it.id!))
    if (!items.length) return
    const init: Record<number, string> = {}
    for (const it of items) {
      const efectiva  = Number(it.cantidad_comprada ?? it.cantidad)
      const pendiente = efectiva - Number(it.cantidad_enviada ?? 0)
      init[it.id!] = String(pendiente)
    }
    setCantEnvio(init)
    setConfirmoSinStock(false)
    setModalEnvio({ solicitud, items })
  }

  // Vista previa en BORRADOR del remito que se está armando: imprime el papel
  // tal cual va a salir (con estado del pedido incluido) SIN generar nada —
  // ni remito, ni envíos, ni número. Para revisar antes del definitivo
  // (imprimían el definitivo y recién ahí veían los errores de carga).
  function vistaPreviaRemito() {
    if (!modalEnvio) return
    const { solicitud, items } = modalEnvio
    const envios: { item: SolicitudCompraItem; cantidad: number }[] = []
    for (const it of items) {
      const efectiva  = Number(it.cantidad_comprada ?? it.cantidad)
      const pendiente = efectiva - Number(it.cantidad_enviada ?? 0)
      const v = Number(cantEnvio[it.id!])
      if (!Number.isFinite(v) || v < 0) { toast(`Cantidad inválida en "${it.descripcion}"`, 'err'); return }
      if (v > pendiente + 0.001) { toast(`"${it.descripcion}": querés enviar ${v} pero quedan ${pendiente} pendientes`, 'err'); return }
      if (v > 0) envios.push({ item: it, cantidad: v })
    }
    if (!envios.length) { toast('Poné cantidad a enviar en al menos un material', 'err'); return }

    const hoy = new Date()
    const fakeRemito: RemitoEnvio = {
      id: 0,
      numero: 'BORRADOR',
      fecha: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`,
      obra_cod: solicitud.obra_cod,
      solicitud_id: solicitud.id,
      origen: envios.some(e => e.item.estado === 'comprado' || e.item.estado === 'retirado') ? 'mixto' : 'deposito',
      obs: null,
      created_at: '',
      created_by: null,
      items: envios.map(({ item: it, cantidad }, i) => ({
        id: -(i + 1),
        remito_id: 0,
        item_id: it.id!,
        descripcion: it.descripcion,
        cantidad,
        unidad: it.unidad,
        precio_unit: null,
        origen: (it.estado === 'comprado' || it.estado === 'retirado') ? 'proveedor' : 'deposito',
        proveedor: it.proveedores?.nombre ?? null,
        // Viene calculado del backend (campo computado de PostgREST). Sin esto
        // el BORRADOR mostraría distinto del remito definitivo, y la vista
        // previa existe justamente para revisar antes de imprimir.
        es_herramienta: it.es_herramienta ?? false,
      })),
    }
    const remitosCache = (queryClient.getQueryData<RemitoEnvio[]>(['remitos-envio', 'all']) ?? [])
      .filter(r => r.solicitud_id === solicitud.id)
    const obra = obrasMap.get(solicitud.obra_cod)
    imprimirRemito(fakeRemito, obra?.nom, soloEnvio ? undefined : {
      ...armarEstadoPedido(solicitud, fakeRemito, { sumarEsteRemito: true }, remitosCache),
      envios: armarEnvios(fakeRemito, remitosCache),
    }, { borrador: true })
  }

  function confirmarEnvio() {
    if (!modalEnvio) return
    const { solicitud, items } = modalEnvio
    const obra = obrasMap.get(solicitud.obra_cod)
    const esDeposito = obra?.es_deposito === true

    const envios: { item: SolicitudCompraItem; cantidad: number }[] = []
    for (const it of items) {
      const efectiva  = Number(it.cantidad_comprada ?? it.cantidad)
      const pendiente = efectiva - Number(it.cantidad_enviada ?? 0)
      const v = Number(cantEnvio[it.id!])
      if (!Number.isFinite(v) || v < 0) { toast(`Cantidad inválida en "${it.descripcion}"`, 'err'); return }
      if (v > pendiente + 0.001) { toast(`"${it.descripcion}": querés enviar ${v} pero quedan ${pendiente} pendientes`, 'err'); return }
      if (v > 0) envios.push({ item: it, cantidad: v })
    }
    if (!envios.length) { toast('Poné cantidad a enviar en al menos un material', 'err'); return }

    const remitoItems = envios.map(({ item: it, cantidad }) => ({
      item_id: it.id,
      descripcion: it.descripcion,
      cantidad,
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
      enviar_items: envios.map(e => ({ item_id: e.item.id!, cantidad: e.cantidad })),
    }, {
      onSuccess: (remito: any) => {
        const parciales = envios.filter(e => {
          const efectiva  = Number(e.item.cantidad_comprada ?? e.item.cantidad)
          const pendiente = efectiva - Number(e.item.cantidad_enviada ?? 0)
          return e.cantidad < pendiente - 0.001
        }).length
        toast(
          esDeposito ? 'Recibido e ingresado al depósito'
          : parciales > 0 ? `Remito generado · ${parciales} ítem${parciales !== 1 ? 's' : ''} con envío parcial (el resto queda pendiente)`
          : 'Remito generado e ítems enviados',
          'ok',
        )
        setSelected(new Set())
        setModalEnvio(null)
        // No imprimimos acá (estamos fuera del gesto del usuario → el popup se
        // bloquea en móvil). Ofrecemos imprimir desde un modal con su botón.
        // Historial de envíos previos del pedido: del cache de remitos si está
        // cargado (lo llena el modal 📄 Remitos). Si no está, va este remito
        // solo — la tabla de estado sale completa igual.
        const remitosCache = (queryClient.getQueryData<RemitoEnvio[]>(['remitos-envio', 'all']) ?? [])
          .filter(r => r.solicitud_id === solicitud.id)
        setUltimoRemito({
          remito,
          obraNom: obra?.nom,
          // Snapshot ANTES del refetch: el cache aún no incluye este remito.
          estado: {
            ...armarEstadoPedido(solicitud, remito, { sumarEsteRemito: true }, remitosCache),
            envios: armarEnvios(remito, remitosCache),
          },
        })
      },
      onError: (e: any) => toast(e.message || 'Error', 'err'),
    })
  }

  function enviarUnoConRemito(solicitud: SolicitudCompra, itemId: number) {
    enviarConRemito(solicitud, [itemId])
  }

  // ── Crear proveedor inline ──
  function seleccionarProveedor(id: number) {
    const form = modalNuevoProveedor === 'lote' ? formComprarLote : formComprar
    form.setValue('proveedor_id', String(id))
  }

  function handleCreateProv(data: any) {
    // Si ya existe, no creamos otro: lo seleccionamos y listo.
    if (provDuplicado) {
      seleccionarProveedor(provDuplicado.id)
      setModalNuevoProveedor(null)
      toast(`"${provDuplicado.nombre}" ya existía — lo seleccionamos`, 'ok')
      return
    }
    createProveedor(data, {
      onSuccess: (p: any) => {
        toast('Proveedor creado', 'ok')
        seleccionarProveedor(p.id)
        setModalNuevoProveedor(null)
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
      {/* Header: filtro de obra + botón nueva (fila 1) + tabs por categoría (fila 2).
          En mobile el botón queda siempre visible (no se corta) y los tabs envuelven. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0 sm:max-w-xs">
            <Combobox placeholder="Filtrar por obra..." options={obraOptions} value={obraFiltro} onChange={setObraFiltro} />
          </div>
          {/* El módulo Herramientas tiene su propio sidebar, que sólo se ve estando
              adentro. Sosa vive acá, así que el puente va acá.
              `router.push` y no <a href>: en App Router un ancla cruda hace
              navegación de documento completa, tira el cache de React Query y
              recarga la app entera. Era el único <a href> interno del repo. */}
          {puedeVerHerramientas && (
            <button
              type="button"
              onClick={() => router.push('/herramientas/salidas')}
              title="Herramientas que salieron a obra desde los pedidos"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors text-xs font-bold min-h-[36px]">
              <span>🔧</span>
              <span className="hidden sm:inline">Salidas al pañol</span>
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setModalRemitos(true)} className="shrink-0">
            <span className="sm:hidden">📄</span>
            <span className="hidden sm:inline">📄 Remitos</span>
          </Button>
          <Button variant="primary" size="sm" onClick={abrirNuevo} disabled={!puedeCrear} className="shrink-0">
            <span className="sm:hidden">+ Nueva</span>
            <span className="hidden sm:inline">+ Nueva solicitud</span>
          </Button>
        </div>
        <CategoriaTabs categoriaSel={categoriaSel} counts={counts} onSelect={setCategoria} />
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
            // En los tabs de trabajo ("Por comprar" / "Por enviar") mostramos el
            // PEDIDO COMPLETO para no perder la foto: primero los ítems foco de
            // este tab y después los ya resueltos / no-foco (atenuados).
            const tabTrabajo = categoriaSel === 'por-comprar' || categoriaSel === 'por-enviar'
            const itemsFiltrados = items.filter(it => itemEnCategoria(it.estado, categoriaSel))
            const itemsVisibles = !esTabPorItem(categoriaSel)
              ? items
              : tabTrabajo
                ? [...items].sort((a, b) => Number(itemEnCategoria(b.estado, categoriaSel)) - Number(itemEnCategoria(a.estado, categoriaSel)))
                : (itemsFiltrados.length === 0 ? items : itemsFiltrados)
            // Avance de resolución del pedido (chip en el header, solo tabs de trabajo)
            const totalItems = items.length
            const resueltosCount = items.filter(it => it.estado !== 'pendiente' && it.estado !== 'rechazado').length
            const faltanCount = items.filter(it => it.estado === 'pendiente').length

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
                      <span className="font-mono text-xs font-bold text-gris-dark shrink-0">#{s.id}</span>
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
                      {tabTrabajo && totalItems > 0 && (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${faltanCount > 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-verde-light text-verde'}`}>
                          {faltanCount === 0 && '✓ '}{resueltosCount}/{totalItems} resueltos
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{fmtF(s.fecha)}{s.created_at ? ` ${fmtHora(s.created_at)}` : ''}</span>
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
                          <th className="px-4 py-2 text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide">
                            {items.some(it => it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado' || it.estado === 'de_stock_cliente') && (
                              <button
                                onClick={() => toggleSelectTodos(items)}
                                title="Tildar/destildar todos los ítems listos para enviar"
                                className="mr-3 normal-case font-bold text-verde hover:underline"
                              >
                                ☑ todos
                              </button>
                            )}
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsVisibles.map((item, i) => {
                          const cfg = ITEM_ESTADO_CFG[item.estado]
                          const stk = item.material_id ? stockMap.get(item.material_id) : null
                          // Atenuar SOLO lo terminado (enviado/rechazado). Antes se atenuaba
                          // todo lo que no era del tab actual, y en "Por enviar" los
                          // PENDIENTES salían apagados como si estuvieran deshabilitados —
                          // un pendiente es trabajo vivo, tiene que verse a pleno
                          // (reporte de Franco 2026-08-06).
                          const atenuar = tabTrabajo && (item.estado === 'enviado' || item.estado === 'rechazado')
                          return (
                            <tr key={item.id ?? i} className={`border-t border-gris align-top ${atenuar ? 'bg-gris/40 opacity-60' : 'bg-gris/20'}`}>
                              <td className="px-2 py-2.5 text-xs text-gris-mid text-center">{i + 1}</td>
                              <td className="px-4 py-2.5">
                                <div className="text-sm font-medium text-carbon">
                                {item.descripcion}
                                {/* El color es parte de QUÉ se pide, no una nota al pie:
                                    si no se ve acá, el que compra no se entera. */}
                                {item.color && (
                                  <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul align-middle">
                                    {item.color}
                                  </span>
                                )}
                                {/* `clase` es el tilde manual (4 usos en 256 salidas reales);
                                    `es_herramienta` lo calcula el backend con el mismo predicado
                                    que el ledger, así el badge dice la verdad aunque nadie tildó. */}
                                {(item.clase === 'herramienta' || item.es_herramienta) && (
                                  <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-carbon text-white align-middle"
                                        title={item.clase === 'herramienta' ? 'Marcada como herramienta en el pedido' : 'Detectada como herramienta: queda registrada en Salidas a obra'}>
                                    {item.devuelve ? '↩ Devuelve' : '🔧 Pañol'}
                                  </span>
                                )}
                              </div>
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
                                      {Number(item.cantidad_enviada ?? 0) > 0 && item.estado !== 'enviado' && (
                                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul font-sans" title="Envío parcial — el resto queda pendiente de enviar">
                                          📤 {Number(item.cantidad_enviada)}/{cantEfectiva} enviados
                                        </span>
                                      )}
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
                                {/* `!item.devuelve`: una herramienta que VUELVE de la obra nunca va a tener
                                    precio de compra, así que el aviso quedaba clavado para siempre. */}
                                {item.estado === 'enviado' && !item.devuelve && (!item.precio_unit || Number(item.precio_unit) === 0) && !obra?.es_deposito && (
                                  <div className="mt-1">
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amarillo-light text-[#7A5500]">⚠ sin precio</span>
                                  </div>
                                )}
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
                                <div className="flex gap-1 justify-end flex-wrap items-center">
                                  {item.id != null && (
                                    <button onClick={() => setModalHistorial(item)} title="Ver historial del ítem" className="text-xs px-2 py-1.5 rounded text-gris-dark hover:text-azul hover:bg-azul-light min-h-[36px]">🕑</button>
                                  )}
                                  {s.estado === 'aprobada' && (
                                    <>
                                      {item.estado === 'pendiente' && item.devuelve && (
                                        <>
                                          {/* La obra DEVUELVE: no hay nada que comprar ni despachar. Peor,
                                              con material vinculado el botón Depósito descontaría stock
                                              de algo que está entrando. Un solo camino, y la devolución
                                              queda en la bandeja del pañol con sentido='devolucion'. */}
                                          <button disabled={!resolverItems || recibiendoDev} onClick={() => handleRecibirDevolucion(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Recibir en pañol</button>
                                          <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                        </>
                                      )}
                                      {item.estado === 'pendiente' && !item.devuelve && (
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
                                          {/* El depósito no se despacha a sí mismo: el material no se mueve, pero
                                              el despacho descuenta stock y el recibo no lo repone
                                              (sólo acredita los ítems comprados). Pedido #436, agosto 2026.
                                              Para "esto ya lo tengo", el renglón se rechaza. */}
                                          {!obra?.es_deposito && (
                                            <button disabled={!resolverItems} onClick={() => abrirDespachar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-naranja-light text-naranja hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Depósito</button>
                                          )}
                                          {stockClientePorObra.has(s.obra_cod) && (
                                            <button disabled={!resolverItems} onClick={() => setModalStockCliente({ item, obraCod: s.obra_cod })} title="Cubrir con material que el cliente ya pagó y tiene en depósito (no se factura)" className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-azul-mid hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Cliente</button>
                                          )}
                                          <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                        </>
                                      )}
                                      {(item.estado === 'comprado' || item.estado === 'de_deposito' || item.estado === 'retirado' || item.estado === 'de_stock_cliente') && (
                                        <>
                                          <input type="checkbox" disabled={!resolverItems} checked={selected.has(item.id!)} onChange={() => toggleSelect(item.id!)}
                                            className="accent-verde w-4 h-4 disabled:opacity-40" title="Seleccionar para envío grupal" />
                                          <button disabled={!resolverItems || enviandoRemito} onClick={() => enviarUnoConRemito(s, item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">{obra?.es_deposito ? 'Recibir en depósito' : 'Enviar + Remito'}</button>
                                          {item.estado === 'de_deposito' && Number(item.cantidad_enviada ?? 0) > 0 && Number(item.cantidad_enviada ?? 0) < Number(item.cantidad_comprada ?? item.cantidad) && (
                                            <button disabled={!resolverItems} onClick={() => handleComprarFaltante(item)} title="El faltante no está en depósito: cerrar este renglón por lo enviado y crear uno nuevo para comprarlo" className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">🛒 Comprar faltante</button>
                                          )}
                                          <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs px-3 py-1.5 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩</button>
                                        </>
                                      )}
                                      {item.estado === 'rechazado' && (
                                        <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-amarillo-light text-[#7A5500] hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
                                      )}
                                      {item.estado === 'enviado' && !obra?.es_deposito && (
                                        precioItemId === item.id ? (
                                          <>
                                            <input
                                              type="number"
                                              inputMode="decimal"
                                              autoFocus
                                              value={precioDraft}
                                              onChange={e => setPrecioDraft(e.target.value)}
                                              onKeyDown={e => { if (e.key === 'Enter') guardarPrecioItem(item.id!) }}
                                              placeholder="$/unid"
                                              className="w-24 px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs outline-none bg-white font-semibold focus:border-naranja min-h-[36px]"
                                            />
                                            <button disabled={guardandoPrecio} onClick={() => guardarPrecioItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✓</button>
                                            <button onClick={() => { setPrecioItemId(null); setPrecioDraft('') }} className="text-xs font-bold px-3 py-1.5 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light min-h-[36px]">✕</button>
                                          </>
                                        ) : (
                                          <button disabled={!resolverItems} onClick={() => { setPrecioItemId(item.id!); setPrecioDraft(!item.precio_unit || Number(item.precio_unit) === 0 ? '' : String(item.precio_unit)) }} className={`text-xs font-bold px-3 py-1.5 rounded min-h-[36px] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${!item.precio_unit || Number(item.precio_unit) === 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-azul-light text-azul'}`}>{!item.precio_unit || Number(item.precio_unit) === 0 ? '💲 Cargar precio' : '✏️ Editar precio'}</button>
                                        )
                                      )}
                                      {item.estado === 'enviado' && (
                                        <button disabled={!resolverItems} onClick={() => handleRevertirEnvio(item.id!)} title={item.devuelve ? 'Deshacer la recepción (el renglón vuelve a quedar pendiente de recibir)' : 'Deshacer el envío (vuelve a comprado/depósito, borra el remito)'} className="text-xs font-bold px-3 py-1.5 rounded text-gris-dark hover:text-rojo hover:bg-rojo-light min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Deshacer {item.devuelve ? 'recepción' : 'envío'}</button>
                                      )}
                                    </>
                                  )}
                                </div>
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
                      const itemsSeleccionados = items.filter(it => selected.has(it.id!) && (it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado' || it.estado === 'de_stock_cliente'))
                      if (itemsSeleccionados.length === 0) return null
                      return (
                        <div className="border-t border-gris bg-verde-light/30 px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-verde">
                              {itemsSeleccionados.length} ítem{itemsSeleccionados.length > 1 ? 's' : ''} seleccionado{itemsSeleccionados.length > 1 ? 's' : ''}
                            </span>
                            <button
                              disabled={enviandoRemito}
                              onClick={() => enviarConRemito(s, itemsSeleccionados.map(it => it.id!))}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde text-white hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            const itemsSeleccionados = items.filter(it => selected.has(it.id!) && (it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado' || it.estado === 'de_stock_cliente'))
            // En los tabs de trabajo mostramos el pedido completo (foco primero).
            const tabTrabajo = categoriaSel === 'por-comprar' || categoriaSel === 'por-enviar'
            const itemsFiltrados = items.filter(it => itemEnCategoria(it.estado, categoriaSel))
            const itemsVisibles = !esTabPorItem(categoriaSel)
              ? items
              : tabTrabajo
                ? [...items].sort((a, b) => Number(itemEnCategoria(b.estado, categoriaSel)) - Number(itemEnCategoria(a.estado, categoriaSel)))
                : (itemsFiltrados.length === 0 ? items : itemsFiltrados)
            const totalItems = items.length
            const resueltosCount = items.filter(it => it.estado !== 'pendiente' && it.estado !== 'rechazado').length
            const faltanCount = items.filter(it => it.estado === 'pendiente').length
            // Botones de un ítem pendiente en mobile: Comprar y ✕ siempre;
            // Depósito salvo que la obra SEA el depósito; Cliente si esa obra
            // tiene stock del cliente. La grilla se arma con ese número.
            const accionesPendiente = 2
              + (obra?.es_deposito ? 0 : 1)
              + (stockClientePorObra.has(s.obra_cod) ? 1 : 0)
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
                        <span className="font-mono text-xs font-bold text-gris-dark shrink-0">#{s.id}</span>
                        <span className="text-sm font-bold text-carbon">{obra?.nom ?? s.obra_cod}</span>
                        {s.prioridad === 'urgente' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rojo text-white uppercase">Urgente</span>
                        )}
                        {tabTrabajo && totalItems > 0 && (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${faltanCount > 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-verde-light text-verde'}`}>
                            {faltanCount === 0 && '✓ '}{resueltosCount}/{totalItems} resueltos
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-gris-dark font-mono">
                        {obra && <span className="font-bold text-azul">{s.obra_cod}</span>}
                        <span>{fmtF(s.fecha)}{s.created_at ? ` ${fmtHora(s.created_at)}` : ''}</span>
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
                    {items.some(it => it.estado === 'comprado' || it.estado === 'de_deposito' || it.estado === 'retirado' || it.estado === 'de_stock_cliente') && (
                      <button
                        onClick={() => toggleSelectTodos(items)}
                        className="self-start text-[11px] font-bold text-verde px-2 py-1 rounded hover:bg-verde-light"
                      >
                        ☑ Seleccionar todos los enviables
                      </button>
                    )}
                    {itemsVisibles.map((item, i) => {
                      const cfg = ITEM_ESTADO_CFG[item.estado]
                      const stk = item.material_id ? stockMap.get(item.material_id) : null
                      // Misma regla que la tabla: atenuar solo terminados (ver arriba).
                      const atenuar = tabTrabajo && (item.estado === 'enviado' || item.estado === 'rechazado')
                      return (
                        <div key={item.id ?? i} className={`rounded-lg p-3 ${atenuar ? 'bg-gris/50 opacity-60' : 'bg-gris/30'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gris-mid">#{i + 1}</div>
                              <div className="text-sm font-medium text-carbon">
                                {item.descripcion}
                                {/* El color es parte de QUÉ se pide, no una nota al pie:
                                    si no se ve acá, el que compra no se entera. */}
                                {item.color && (
                                  <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul align-middle">
                                    {item.color}
                                  </span>
                                )}
                                {/* `clase` es el tilde manual (4 usos en 256 salidas reales);
                                    `es_herramienta` lo calcula el backend con el mismo predicado
                                    que el ledger, así el badge dice la verdad aunque nadie tildó. */}
                                {(item.clase === 'herramienta' || item.es_herramienta) && (
                                  <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-carbon text-white align-middle"
                                        title={item.clase === 'herramienta' ? 'Marcada como herramienta en el pedido' : 'Detectada como herramienta: queda registrada en Salidas a obra'}>
                                    {item.devuelve ? '↩ Devuelve' : '🔧 Pañol'}
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const unidLabel = UNIDADES.find(u => u.value === item.unidad)?.label ?? item.unidad
                                const cantEfectiva = item.cantidad_comprada ?? item.cantidad
                                const difiere = item.cantidad_comprada != null && item.cantidad_comprada !== item.cantidad
                                return (
                                  <div className="text-[11px] text-gris-dark font-mono mt-0.5">
                                    {difiere ? (
                                      <span title={`Solicitado: ${item.cantidad} ${unidLabel}`}>
                                        <span className="line-through text-gris-mid">{item.cantidad}</span>
                                        {' → '}
                                        <strong className="text-naranja-dark">{cantEfectiva}</strong> {unidLabel}
                                      </span>
                                    ) : (
                                      <>{item.cantidad} {unidLabel}</>
                                    )}
                                    {item.precio_unit != null && (
                                      <span className="ml-2">× {fmtM(item.precio_unit)} = <strong>{fmtM(cantEfectiva * item.precio_unit)}</strong></span>
                                    )}
                                    {Number(item.cantidad_enviada ?? 0) > 0 && item.estado !== 'enviado' && (
                                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul font-sans" title="Envío parcial — el resto queda pendiente de enviar">
                                        📤 {Number(item.cantidad_enviada)}/{cantEfectiva} enviados
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                              {/* `!item.devuelve`: una herramienta que VUELVE de la obra nunca va a tener
                                    precio de compra, así que el aviso quedaba clavado para siempre. */}
                                {item.estado === 'enviado' && !item.devuelve && (!item.precio_unit || Number(item.precio_unit) === 0) && !obra?.es_deposito && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amarillo-light text-[#7A5500]">⚠ sin precio</span>
                              )}
                            </div>
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

                          {/* Historial (siempre disponible, read-only) */}
                          {item.id != null && (
                            <button onClick={() => setModalHistorial(item)} className="mt-1 min-h-[36px] px-2 py-1.5 -ml-2 inline-flex items-center rounded text-[11px] font-bold text-gris-dark hover:text-azul">
                              🕑 Ver historial
                            </button>
                          )}

                          {/* Acciones del ítem */}
                          {s.estado === 'aprobada' && (
                            <div className="mt-3">
                              {item.estado === 'pendiente' && item.devuelve && (
                                <div className="grid grid-cols-2 gap-2">
                                  <button disabled={!resolverItems || recibiendoDev} onClick={() => handleRecibirDevolucion(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Recibir en pañol</button>
                                  <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                </div>
                              )}
                              {item.estado === 'pendiente' && !item.devuelve && (
                                <div className={`grid gap-2 ${accionesPendiente === 4 ? 'grid-cols-2 sm:grid-cols-4' : accionesPendiente === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                  <button disabled={!resolverItems} onClick={() => abrirComprar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Comprar</button>
                                  {/* El depósito no se despacha a sí mismo: el material no se mueve, pero
                                      el despacho descuenta stock y el recibo no lo repone (sólo acredita
                                      los ítems comprados). Pedido #436, agosto 2026. Para "esto ya lo
                                      tengo", el renglón se rechaza. */}
                                  {!obra?.es_deposito && (
                                    <button disabled={!resolverItems} onClick={() => abrirDespachar(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-naranja-light text-naranja hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Depósito</button>
                                  )}
                                  {stockClientePorObra.has(s.obra_cod) && (
                                    <button disabled={!resolverItems} onClick={() => setModalStockCliente({ item, obraCod: s.obra_cod })} title="Cubrir con material que el cliente ya pagó y tiene en depósito (no se factura)" className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-azul-mid hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Cliente</button>
                                  )}
                                  <button disabled={!resolverItems} onClick={() => handleRechazarItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
                                </div>
                              )}
                              {(item.estado === 'comprado' || item.estado === 'de_deposito' || item.estado === 'retirado' || item.estado === 'de_stock_cliente') && (
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
                                    <button disabled={!resolverItems || enviandoRemito} onClick={() => enviarUnoConRemito(s, item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">{obra?.es_deposito ? 'Recibir en depósito' : 'Enviar + Remito'}</button>
                                    {item.estado === 'de_deposito' && Number(item.cantidad_enviada ?? 0) > 0 && Number(item.cantidad_enviada ?? 0) < Number(item.cantidad_comprada ?? item.cantidad) && (
                                      <button disabled={!resolverItems} onClick={() => handleComprarFaltante(item)} className="text-xs font-bold px-3 py-1.5 rounded bg-azul-light text-azul hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">🛒 Comprar faltante</button>
                                    )}
                                    <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Revertir</button>
                                  </div>
                                </div>
                              )}
                              {item.estado === 'rechazado' && (
                                <button disabled={!resolverItems} onClick={() => handleRevertir(item.id!)} className="w-full text-xs font-bold px-3 py-1.5 rounded bg-amarillo-light text-[#7A5500] hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">Reactivar</button>
                              )}
                              {item.estado === 'enviado' && !obra?.es_deposito && (
                                <div className="mb-2">
                                  {precioItemId === item.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        autoFocus
                                        value={precioDraft}
                                        onChange={e => setPrecioDraft(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') guardarPrecioItem(item.id!) }}
                                        placeholder="$/unid"
                                        className="w-24 px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-xs outline-none bg-white font-semibold focus:border-naranja min-h-[36px]"
                                      />
                                      <button disabled={guardandoPrecio} onClick={() => guardarPrecioItem(item.id!)} className="text-xs font-bold px-3 py-1.5 rounded bg-verde-light text-verde hover:opacity-80 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">✓</button>
                                      <button onClick={() => { setPrecioItemId(null); setPrecioDraft('') }} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo min-h-[36px]">✕</button>
                                    </div>
                                  ) : (
                                    <button disabled={!resolverItems} onClick={() => { setPrecioItemId(item.id!); setPrecioDraft(!item.precio_unit || Number(item.precio_unit) === 0 ? '' : String(item.precio_unit)) }} className={`w-full text-xs font-bold px-3 py-1.5 rounded min-h-[36px] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${!item.precio_unit || Number(item.precio_unit) === 0 ? 'bg-amarillo-light text-[#7A5500]' : 'bg-azul-light text-azul'}`}>{!item.precio_unit || Number(item.precio_unit) === 0 ? '💲 Cargar precio' : '✏️ Editar precio'}</button>
                                  )}
                                </div>
                              )}
                              {item.estado === 'enviado' && (
                                <button disabled={!resolverItems} onClick={() => handleRevertirEnvio(item.id!)} className="w-full text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed">↩ Deshacer {item.devuelve ? 'recepción' : 'envío'}</button>
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
                          disabled={enviandoRemito}
                          onClick={() => enviarConRemito(s, itemsSeleccionados.map(it => it.id!))}
                          className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-verde text-white hover:opacity-90 min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* ── Modal historial del ítem (timeline) ── */}
      <ItemHistorialModal item={modalHistorial} onClose={() => setModalHistorial(null)} />

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
                              libre: false,
                              // ver usarMaterialEnLinea: sin esto queda color fantasma
                              color: mat?.usa_color ? x.color : '',
                              // ver usarMaterialEnLinea: el catalogo solo sube a herramienta
                              clase: mat?.clase === 'herramienta' ? 'herramienta' : x.clase,
                              devuelve: (mat?.clase === 'herramienta' || x.clase === 'herramienta') ? x.devuelve : false,
                            } : x))
                          }}
                          onCreate={puedeCrear && l.clase !== 'herramienta' ? q => setModalNuevoMat({
                            lineaId: l._id, enEdicion: false, nombre: q, rubro_id: '', unidad: l.unidad,
                          }) : undefined}
                          createLabel="Agregar al catálogo"
                        />
                      </div>
                      {/* Solo si HAY stock, y en verde: es un dato útil. En rojo y
                          con 0 (684 de 718 materiales) se leía como "no se puede
                          pedir" y mandaba al operario de vuelta al texto libre. */}
                      {matVinculado && matVinculado.stock_actual > 0 && (
                        <div className="flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold bg-verde-light text-verde">
                          Hay {matVinculado.stock_actual} en depósito
                        </div>
                      )}
                      {lineas.length > 1 && <button onClick={() => setLineas(p => p.filter(x => x._id !== l._id))} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gris-mid hover:text-rojo hover:bg-rojo-light text-lg font-bold">✕</button>}
                    </div>
                    <DescripcionLibre
                      linea={l}
                      onChange={patch => setLineas(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                    />
                    <div className="flex gap-2 mt-2">
                      <input type="number" min="0" step="1" value={l.cantidad} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                        placeholder="Cant." className="w-20 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja" />
                      <select value={l.unidad} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, unidad: e.target.value } : x))}
                        className="w-20 px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white">
                        {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <ClaseLinea
                        linea={l}
                        onChange={patch => setLineas(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                      />
                      <ColorLinea
                        linea={l}
                        material={l.material_id ? stockMap.get(l.material_id) : null}
                        onChange={patch => setLineas(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                      />
                      <input type="text" autoComplete="off" placeholder="Obs..." value={l.obs} onChange={e => setLineas(p => p.map(x => x._id === l._id ? { ...x, obs: e.target.value } : x))}
                        className="flex-1 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLineas(p => [...p, newLinea()])} className="mt-2 w-full sm:w-auto min-h-[40px] px-3 py-2 rounded-lg border border-dashed border-azul/50 text-xs font-bold text-azul hover:text-naranja hover:border-naranja transition-colors">+ Agregar material</button>
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
          <Button variant="primary" loading={comprando} onClick={formComprar.handleSubmit(handleComprar)} disabled={compraInvalida}>Confirmar compra</Button>
        </>}>
        {modalComprar && (
          <div className="flex flex-col gap-4">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-azul">{modalComprar.descripcion}<ChipColor color={modalComprar.color} /></div>
              <div className="text-xs text-gris-dark font-mono">
                Solicitado: {modalComprar.cantidad} {UNIDADES.find(u => u.value === modalComprar.unidad)?.label ?? modalComprar.unidad}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Combobox label="Proveedor" placeholder="Buscar proveedor..." options={provOptions} value={formComprar.watch('proveedor_id')} onChange={v => formComprar.setValue('proveedor_id', v)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => { formProv.reset({ nombre: '', cuit: '', tel: '' }); setModalNuevoProveedor('comprar') }}>+ Nuevo</Button>
            </div>
            <Input
              label={`Cantidad comprada (${UNIDADES.find(u => u.value === modalComprar.unidad)?.label ?? modalComprar.unidad})`}
              type="number" step="any" min="0"
              hint={Number(formComprar.watch('cantidad_comprada')) !== modalComprar.cantidad ? `Difiere de lo solicitado (${modalComprar.cantidad})` : undefined}
              {...formComprar.register('cantidad_comprada')}
            />
            {/* Precio en dos casilleros enlazados: cargás cualquiera y el otro
                se calcula solo (IVA 21%). SE GUARDA EL FINAL — es la convención
                de todo el sistema (cobros, cuenta cliente, reportes: con IVA).
                setValue no re-dispara onChange, así que no hay loop. */}
            <div>
              <div className="grid grid-cols-2 gap-3">
                <Controller name="precio_neto" control={formComprar.control} render={({ field }) => (
                  <InputMonto
                    label="P. unit. neto (sin IVA)"
                    decimales={4}
                    value={field.value}
                    onChange={raw => {
                      field.onChange(raw)
                      const n = Number(raw)
                      formComprar.setValue('precio_unit', Number.isFinite(n) && n > 0 ? netaAFinal(n) : 0)
                    }}
                  />
                )} />
                <Controller name="precio_unit" control={formComprar.control} render={({ field }) => (
                  <InputMonto
                    label="P. unit. FINAL (IVA incl.)"
                    value={field.value}
                    onChange={raw => {
                      field.onChange(raw)
                      const n = Number(raw)
                      formComprar.setValue('precio_neto', Number.isFinite(n) && n > 0 ? finalANeta(n) : 0)
                    }}
                  />
                )} />
              </div>
              <p className="text-[11px] text-gris-dark mt-1 px-1">
                Cargá cualquiera de los dos: el otro se calcula solo (IVA 21%). A la cuenta del cliente va el <b>final</b>.
              </p>
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
                    <div className="text-sm font-bold text-azul">{EMPRESA.nombre}</div>
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
              <Button variant="secondary" size="sm" onClick={() => { formProv.reset({ nombre: '', cuit: '', tel: '' }); setModalNuevoProveedor('lote') }}>+ Nuevo</Button>
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
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider block">Precios por ítem</label>
                {/* Se guarda SIEMPRE el final con IVA; el toggle solo define
                    cómo se tipea. El subtotal muestra el final en ambos modos. */}
                <div className="flex rounded-lg border-[1.5px] border-gris-mid overflow-hidden text-[11px] font-bold">
                  <button type="button" onClick={() => setLotePreciosNetos(false)}
                    className={`px-2.5 py-1 transition-colors ${!lotePreciosNetos ? 'bg-azul text-white' : 'bg-white text-gris-dark hover:bg-gris/40'}`}>
                    Finales (IVA incl.)
                  </button>
                  <button type="button" onClick={() => setLotePreciosNetos(true)}
                    className={`px-2.5 py-1 transition-colors ${lotePreciosNetos ? 'bg-azul text-white' : 'bg-white text-gris-dark hover:bg-gris/40'}`}>
                    Netos (+21% solo)
                  </button>
                </div>
              </div>
              {/* overflow-x-auto (no hidden): a 390px las columnas de precio
                  quedaban clipeadas sin scroll y no se podía comprar desde el cel. */}
              <div className="border border-gris-mid rounded-xl overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-gris">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase">Ítem</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[110px]">Cant. comprada</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[120px]">{lotePreciosNetos ? 'P. unit. NETO ($)' : 'Precio unit. ($)'}</th>
                      <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase w-[110px]">Subtotal final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalComprarLote.items.map(it => {
                      const precioTipeado = Number(formComprarLote.watch(`precios.${it.id}`) ?? 0)
                      const precio = lotePreciosNetos ? netaAFinal(precioTipeado) : precioTipeado
                      const cant   = Number(formComprarLote.watch(`cantidades.${it.id}`) ?? it.cantidad)
                      const subtotal = precio * cant
                      const difiere = cant !== it.cantidad
                      const unidLabel = UNIDADES.find(u => u.value === it.unidad)?.label ?? it.unidad
                      return (
                        <tr key={it.id} className="border-t border-gris">
                          <td className="px-3 py-2">
                            <div className="font-medium text-sm">{it.descripcion}<ChipColor color={it.color} /></div>
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
                            <Controller name={`precios.${it.id}`} control={formComprarLote.control} render={({ field }) => (
                              <InputMonto value={field.value} onChange={field.onChange} className="text-right font-mono" />
                            )} />
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
                        {fmtM(modalComprarLote.items.reduce((acc, it) => {
                          const p = Number(formComprarLote.watch(`precios.${it.id}`) ?? 0)
                          return acc + (lotePreciosNetos ? netaAFinal(p) : p) * Number(formComprarLote.watch(`cantidades.${it.id}`) ?? it.cantidad)
                        }, 0))}
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
                    <div className="text-sm font-bold text-azul">{EMPRESA.nombre}</div>
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
          <Button variant="primary" loading={despachando} onClick={formDespachar.handleSubmit(handleDespachar)}>Confirmar despacho</Button>
        </>}>
        {modalDespachar && (
          <div className="flex flex-col gap-4">
            <div className="bg-naranja-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-naranja">{modalDespachar.descripcion}<ChipColor color={modalDespachar.color} /></div>
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
            <Controller name="precio_unit" control={formDespachar.control} render={({ field }) => (
              <InputMonto label="Precio unitario interno ($)" value={field.value} onChange={field.onChange} />
            )} />
          </div>
        )}
      </Modal>

      {/* ── Modal resolver con stock del cliente ── */}
      {modalStockCliente && (() => {
        const candidatos = stockClientePorObra.get(modalStockCliente.obraCod) ?? []
        const item = modalStockCliente.item
        return (
          <Modal
            open
            onClose={() => setModalStockCliente(null)}
            title="🤝 CUBRIR CON MATERIAL DEL CLIENTE"
            footer={<Button variant="secondary" onClick={() => setModalStockCliente(null)}>Cancelar</Button>}
          >
            <div className="flex flex-col gap-3">
              <div className="bg-verde-light rounded-xl px-4 py-3">
                <div className="font-bold text-sm text-azul-mid">{item.descripcion}</div>
                <div className="text-xs text-gris-dark font-mono">Pedido: {item.cantidad} {item.unidad} · obra {modalStockCliente.obraCod}</div>
              </div>
              <p className="text-xs text-gris-dark">
                Elegí de qué material del cliente descontar. <b>No se factura</b>:
                el cliente ya lo pagó — solo se descuenta de su saldo en depósito.
              </p>
              {candidatos.length === 0 ? (
                <p className="text-sm text-gris-dark italic">La obra no tiene material del cliente con saldo.</p>
              ) : (
                <div className="flex flex-col divide-y divide-gris border border-gris-mid rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
                  {candidatos.map(c => {
                    const alcanza = Number(c.saldo) >= Number(item.cantidad)
                    return (
                      <div key={c.item_id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-carbon truncate">{c.descripcion}</div>
                          <div className="text-[11px] text-gris-dark font-mono">
                            Saldo: <b className={alcanza ? 'text-verde' : 'text-rojo'}>{Number(c.saldo).toLocaleString('es-AR')} {c.unidad}</b>
                            {!alcanza && ' — no alcanza'}
                          </div>
                        </div>
                        <Button
                          variant="primary" size="sm"
                          disabled={!alcanza || resolviendoStockCliente}
                          onClick={() => handleResolverStockCliente(c.item_id)}
                        >
                          Usar
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ── Modal nuevo proveedor ── */}
      <Modal open={modalNuevoProveedor !== null} onClose={() => setModalNuevoProveedor(null)} title="➕ NUEVO PROVEEDOR"
        footer={<>
          <Button variant="secondary" onClick={() => setModalNuevoProveedor(null)}>Cancelar</Button>
          <Button variant="primary" loading={creandoProv} onClick={formProv.handleSubmit(handleCreateProv)}>
            {provDuplicado ? 'Usar el existente' : 'Crear'}
          </Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Input label="Nombre" {...formProv.register('nombre')} />
          {provDuplicado && (
            <div className="text-[12px] bg-amber-50 border border-amber-300 text-amber-900 rounded px-3 py-2">
              ⚠ Ya existe <b>{provDuplicado.nombre}</b>
              {provDuplicado.cuit ? ` (CUIT ${provDuplicado.cuit})` : ''}. Al confirmar se selecciona ese en vez de crear un duplicado.
            </div>
          )}
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
          <Button variant="primary" loading={uploading || creandoFact} onClick={formFact.handleSubmit(handleCreateFact)}>Guardar</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox label="Proveedor" placeholder="Buscar..." options={provOptions} value={formFact.watch('proveedor_id')} onChange={v => formFact.setValue('proveedor_id', v)} />
            <Input label="Nro factura" {...formFact.register('numero')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formFact.register('fecha')} />
            <Controller name="total" control={formFact.control} render={({ field }) => (
              <InputMonto label="Total ($)" value={field.value} onChange={field.onChange} />
            )} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Adjunto (PDF / imagen)</div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            {adjunto ? (
              <div className="flex items-center gap-2 bg-azul-light rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-azul flex-1 truncate">📎 {adjunto.nombre}</span>
                <button onClick={() => setAdjunto(null)} className="shrink-0 w-9 h-9 -my-1.5 flex items-center justify-center rounded-lg text-gris-dark hover:text-rojo hover:bg-white text-sm font-bold">✕</button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>📎 Adjuntar</Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Modal editar solicitud ── */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title={`✏️ EDITAR SOLICITUD #${modalEditar?.id ?? ''}`} width="max-w-3xl"
        footer={<>
          <Button variant="secondary" onClick={() => setModalEditar(null)}>Cancelar</Button>
          <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleEditar)}>Guardar cambios</Button>
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
                                libre: false,
                                // ver usarMaterialEnLinea: sin esto queda color fantasma
                                color: mat?.usa_color ? x.color : '',
                                // ver usarMaterialEnLinea: el catalogo solo sube a herramienta
                                clase: mat?.clase === 'herramienta' ? 'herramienta' : x.clase,
                                devuelve: (mat?.clase === 'herramienta' || x.clase === 'herramienta') ? x.devuelve : false,
                              } : x))
                            }}
                            onCreate={puedeCrear && l.clase !== 'herramienta' ? q => setModalNuevoMat({
                              lineaId: l._id, enEdicion: true, nombre: q, rubro_id: '', unidad: l.unidad,
                            }) : undefined}
                            createLabel="Agregar al catálogo"
                          />
                        </div>
                        {matVinculado && (matVinculado as StockMaterial).stock_actual > 0 && (
                          <div className="flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold bg-verde-light text-verde">
                            Hay {(matVinculado as StockMaterial).stock_actual} en depósito
                          </div>
                        )}
                        <button onClick={() => {
                          if (l.itemId) setItemsAEliminar(p => [...p, l.itemId!])
                          setLineasEdit(p => p.filter(x => x._id !== l._id))
                        }} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gris-mid hover:text-rojo hover:bg-rojo-light text-lg font-bold">✕</button>
                      </div>
                      <DescripcionLibre
                        linea={l}
                        onChange={patch => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                      />
                      <div className="flex gap-2 mt-2">
                        <input type="number" min="0" step="1" value={l.cantidad} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x))}
                          placeholder="Cant." className="w-20 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja" />
                        <select value={l.unidad} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, unidad: e.target.value } : x))}
                          className="w-20 px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white">
                          {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                        <ClaseLinea
                          linea={l}
                          onChange={patch => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                        />
                        <ColorLinea
                          linea={l}
                          material={l.material_id ? stockMap.get(l.material_id) : null}
                          onChange={patch => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, ...patch } : x))}
                        />
                        <input type="text" autoComplete="off" placeholder="Obs..." value={l.obs} onChange={e => setLineasEdit(p => p.map(x => x._id === l._id ? { ...x, obs: e.target.value } : x))}
                          className="flex-1 px-2 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja" />
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setLineasEdit(p => [...p, { ...newLinea(), estado: 'pendiente' }])} className="mt-2 w-full sm:w-auto min-h-[40px] px-3 py-2 rounded-lg border border-dashed border-azul/50 text-xs font-bold text-azul hover:text-naranja hover:border-naranja transition-colors">+ Agregar material</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de armado de remito: cantidades editables por item (envíos
          parciales). Lo que se manda de menos queda pendiente para otro remito. */}
      {modalEnvio && (() => {
        const obraEnv = obrasMap.get(modalEnvio.solicitud.obra_cod)
        const esDep = obraEnv?.es_deposito === true
        // Espejo EXACTO de la condición del backend (remitos-envio.service.ts):
        // sólo acredita stock un ítem 'comprado' con material del catálogo. Un
        // renglón de texto libre entra al depósito y no suma nada — 35 ítems se
        // perdieron así entre 05/26 y 09/26 sin que nadie se enterara. Si esta
        // condición cambia allá, cambiarla acá: el aviso no puede mentir.
        // Sólo cuenta lo que se recibe en ESTE remito: un renglón que queda en 0
        // no entra ahora, así que avisar por él sería ruido.
        const sinStock = esDep
          ? modalEnvio.items.filter(it =>
              Number(cantEnvio[it.id!]) > 0 && (it.material_id == null || it.estado !== 'comprado'))
          : []
        return (
          <Modal
            open
            onClose={() => setModalEnvio(null)}
            title={esDep ? '📦 RECIBIR EN DEPÓSITO' : '📦 ARMAR REMITO DE ENVÍO'}
            width="max-w-2xl"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalEnvio(null)}>Cancelar</Button>
                {!esDep && (
                  <Button variant="secondary" onClick={vistaPreviaRemito}>
                    🖨 Vista previa (borrador)
                  </Button>
                )}
                <Button variant="primary" loading={enviandoRemito} onClick={confirmarEnvio}
                  disabled={sinStock.length > 0 && !confirmoSinStock}>
                  {esDep ? '✓ Recibir e ingresar al stock' : '✓ Generar remito'}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="text-xs text-gris-dark">
                Obra: <span className="font-bold text-carbon">{obraEnv?.nom ?? modalEnvio.solicitud.obra_cod}</span>
                {' · '}Ajustá la cantidad si se manda de menos: <b>el resto queda pendiente</b> y el ítem sigue en "por enviar" para otro remito.
              </div>
              <div className="border border-gris rounded-lg divide-y divide-gris">
                {modalEnvio.items.map(it => {
                  const efectiva  = Number(it.cantidad_comprada ?? it.cantidad)
                  const yaEnviada = Number(it.cantidad_enviada ?? 0)
                  const pendiente = efectiva - yaEnviada
                  const v = Number(cantEnvio[it.id!])
                  const excede = Number.isFinite(v) && v > pendiente + 0.001
                  return (
                    <div key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                        <div className="text-sm font-medium text-carbon truncate">{it.descripcion}</div>
                        <div className="text-[11px] text-gris-dark font-mono">
                          Pendiente: <b>{pendiente}</b> {it.unidad}
                          {yaEnviada > 0 && <span className="text-azul"> · ya enviados {yaEnviada}/{efectiva}</span>}
                        </div>
                        {sinStock.includes(it) && (
                          <div className="text-[11px] font-bold text-[#7A5500] mt-0.5">
                            ⚠ No suma stock{it.material_id == null ? ' — sin material del catálogo' : ' — no viene de una compra'}
                          </div>
                        )}
                      </div>
                      <div className="w-28 ml-auto sm:ml-0">
                        <input
                          type="number" min="0" step="any" inputMode="decimal"
                          value={cantEnvio[it.id!] ?? ''}
                          onChange={e => setCantEnvio(p => ({ ...p, [it.id!]: e.target.value }))}
                          className={`w-full px-2 py-1.5 text-sm font-mono text-right border-[1.5px] rounded-lg outline-none focus:border-naranja ${excede ? 'border-rojo bg-rojo-light/30' : 'border-gris-mid'}`}
                        />
                      </div>
                      <span className="text-xs text-gris-dark w-10">{it.unidad}</span>
                      {excede && (
                        <span className="basis-full text-[11px] text-rojo">Máximo pendiente: {pendiente}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {sinStock.length > 0 && (
                <div className="rounded-lg border border-amarillo bg-amarillo-light/40 px-3 py-2.5">
                  <div className="text-xs font-bold text-[#7A5500]">
                    ⚠ {sinStock.length} de {modalEnvio.items.length} renglones NO van a sumar stock
                  </div>
                  <ul className="mt-1 text-[11px] text-[#7A5500] list-disc pl-4">
                    {sinStock.map(it => (
                      <li key={it.id}>
                        {it.descripcion}
                        {it.material_id == null
                          ? ' — vinculalo a un material del catálogo (✏️ Editar) para que acopie'
                          : ' — no viene de una compra, el stock ya se movió cuando se resolvió'}
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2 text-[11px] font-bold text-[#7A5500] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmoSinStock}
                      onChange={e => setConfirmoSinStock(e.target.checked)}
                      className="accent-naranja w-4 h-4"
                    />
                    Recibir igual — entiendo que ese material no queda en el stock del depósito
                  </label>
                </div>
              )}
              <p className="text-[11px] text-gris-mid italic">
                {esDep
                  ? 'Ingresan al stock del depósito los renglones comprados y vinculados al catálogo; lo no recibido queda pendiente.'
                  : 'El remito sale con las cantidades que pongas acá. Cantidad 0 = ese material no va en este remito.'}
              </p>
              {!esDep && <SoloEnvioCheck value={soloEnvio} onChange={setSoloEnvio} />}
            </div>
          </Modal>
        )
      })()}

      {/* Modal post-remito: ofrece imprimir. El window.open de imprimirRemito
          corre DENTRO del gesto del usuario (click del botón), así no se bloquea
          en móvil/PWA. Antes se imprimía en el onSuccess async → popup bloqueado
          y el remito no se abría aunque el ítem ya quedaba 'enviado'. También
          sirve para reimprimir si el usuario cerró la hoja por error. */}
      {ultimoRemito && (
        <Modal
          open={!!ultimoRemito}
          onClose={() => setUltimoRemito(null)}
          title="✓ Remito generado"
          footer={
            <>
              <Button variant="secondary" onClick={() => setUltimoRemito(null)}>Cerrar</Button>
              <Button
                variant="primary"
                onClick={() => { imprimirRemito(ultimoRemito.remito, ultimoRemito.obraNom, soloEnvio ? undefined : ultimoRemito.estado); setUltimoRemito(null) }}
              >
                🖨 Imprimir remito
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm text-carbon">
              Remito <b>{ultimoRemito.remito.numero}</b> generado.
            </p>
            <p className="text-xs text-gris-dark">
              Tocá <b>Imprimir remito</b> para abrir la hoja con las copias (original, duplicado y triplicado).
            </p>
            <SoloEnvioCheck value={soloEnvio} onChange={setSoloEnvio} />
          </div>
        </Modal>
      )}

      {/* Historial de remitos emitidos, con reimpresión. Al final del JSX a
          propósito: Modal no usa portal y todos comparten z-50 — el último en
          el DOM queda arriba. */}
      {modalRemitos && (
        <ModalRemitosEmitidos
          onClose={() => { setModalRemitos(false); setBuscaRemito('') }}
          busca={buscaRemito}
          setBusca={setBuscaRemito}
          obraNombre={(cod: string) => obrasMap.get(cod)?.nom}
          soloEnvio={soloEnvio}
          setSoloEnvio={setSoloEnvio}
        />
      )}

      {/* ── Alta rápida de material desde el pedido ──
          Pide lo mínimo que exige el backend (nombre + rubro). El resto
          (stock mínimo, precio, proveedor) se completa después desde Stock:
          acá el objetivo es que el pedido no se corte. */}
      {modalNuevoMat && (
        <Modal
          open
          onClose={() => setModalNuevoMat(null)}
          width="max-w-md"
          title="＋ AGREGAR AL CATÁLOGO"
          footer={<>
            <Button variant="secondary" onClick={() => setModalNuevoMat(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={creandoMat}
              disabled={!modalNuevoMat.nombre.trim() || !modalNuevoMat.rubro_id}
              onClick={() => {
                const { nombre, rubro_id, unidad, lineaId, enEdicion } = modalNuevoMat
                if (!rubro_id) return
                const lineaOrigen = (enEdicion ? lineasEdit : lineas).find(l => l._id === lineaId)
                enviarCreateMat(
                  // Si la linea ya estaba marcada 🔧, el material nuevo nace
                  // herramienta: el catalogo aprende de lo que la obra pide.
                  { nombre: nombre.trim(), rubro_id: Number(rubro_id), unidad, clase: lineaOrigen?.clase ?? 'material' },
                  lineaId, enEdicion,
                )
              }}
            >
              Agregar y usar
            </Button>
          </>}
        >
          <div className="flex flex-col gap-3">
            <Input
              label="Nombre"
              value={modalNuevoMat.nombre}
              onChange={e => setModalNuevoMat(s => s && { ...s, nombre: e.target.value })}
            />
            <div>
              <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Rubro</label>
              <select
                value={modalNuevoMat.rubro_id}
                onChange={e => setModalNuevoMat(s => s && { ...s, rubro_id: e.target.value ? Number(e.target.value) : '' })}
                className="w-full px-2 py-2 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
              >
                <option value="">Elegí un rubro...</option>
                {(stockRubros as StockRubro[]).map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Unidad</label>
              <select
                value={modalNuevoMat.unidad}
                onChange={e => setModalNuevoMat(s => s && { ...s, unidad: e.target.value })}
                className="w-full px-2 py-2 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
              >
                {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {conflictoMat && (
        <MaterialParecidoModal
          conflicto={conflictoMat}
          materiales={stockMateriales as StockMaterial[]}
          rubros={stockRubros as StockRubro[]}
          ocupado={creandoMat || guardandoMat}
          puedeForzar={conflictoMat.code === 'MATERIAL_PARECIDO' && conflictoMat.dtoCreate !== null}
          onClose={() => setConflictoMat(null)}
          onUsarExistente={m => usarMaterialEnLinea(conflictoMat.lineaId, conflictoMat.enEdicion, m)}
          onAgregarSinonimo={agregarSinonimoMat}
          onForzar={() => {
            const { dtoCreate, lineaId, enEdicion } = conflictoMat
            if (dtoCreate) enviarCreateMat({ ...dtoCreate, forzar: true }, lineaId, enEdicion)
          }}
        />
      )}
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
    <div className="flex flex-wrap gap-1 bg-gris rounded-xl p-1 relative w-fit max-w-full">
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


// ── Historial de remitos emitidos ────────────────────────────────────────────
// Hasta el 2026-07-31 no existía: el remito solo se podía imprimir en el modal
// post-generación, y si se cerraba había que deshacer el envío y regenerar con
// otro número. Esta lista usa el mismo generador (dos modos: triplicado en una
// hoja hasta 15 renglones, multi-página con más).
function ModalRemitosEmitidos({ onClose, busca, setBusca, obraNombre, soloEnvio, setSoloEnvio }: {
  onClose:     () => void
  busca:       string
  setBusca:    (v: string) => void
  obraNombre:  (cod: string) => string | undefined
  soloEnvio:   boolean
  setSoloEnvio: (v: boolean) => void
}) {
  const { data: remitos = [], isLoading } = useRemitosEnvio()
  // Lista SIN filtro de obra: el historial trae remitos de todas las obras y
  // la solicitud de cada uno puede no estar en la lista filtrada del tab.
  const { data: solicitudesTodas = [] } = useSolicitudes()

  function reimprimir(r: RemitoEnvio) {
    const sol = r.solicitud_id != null ? solicitudesTodas.find(s => s.id === r.solicitud_id) : undefined
    // Reimpresión: el acumulado del cache ya incluye este remito → estado de HOY,
    // con el historial de envíos del pedido fecha por fecha.
    const hermanos = r.solicitud_id != null ? remitos.filter(x => x.solicitud_id === r.solicitud_id) : []
    imprimirRemito(r, obraNombre(r.obra_cod), sol && !soloEnvio
      ? { ...armarEstadoPedido(sol, r, { sumarEsteRemito: false }, hermanos), envios: armarEnvios(r, hermanos) }
      : undefined)
  }

  const filtrados = (() => {
    const q = busca.trim().toLowerCase()
    if (!q) return remitos
    const palabras = q.split(/\s+/)
    return remitos.filter(r => {
      const texto = [
        r.numero, r.obra_cod, obraNombre(r.obra_cod) ?? '', r.fecha,
        ...r.items.map(i => i.descripcion),
      ].join(' ').toLowerCase()
      return palabras.every(p => texto.includes(p))
    })
  })()

  return (
    <Modal
      open
      onClose={onClose}
      title="📄 REMITOS EMITIDOS"
      width="max-w-2xl"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          autoComplete="off"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por número, obra, fecha o material..."
          className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
        />
        <SoloEnvioCheck value={soloEnvio} onChange={setSoloEnvio} />
        {isLoading ? (
          <p className="text-sm text-gris-dark italic py-4 text-center">Cargando remitos…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-gris-dark italic py-4 text-center">
            {busca ? 'Ningún remito coincide con la búsqueda.' : 'Todavía no hay remitos emitidos.'}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-gris-dark">
              {filtrados.length} remito{filtrados.length !== 1 ? 's' : ''}
              {busca && remitos.length !== filtrados.length ? ` (de ${remitos.length})` : ''}
            </p>
            <div className="flex flex-col divide-y divide-gris border border-gris-mid rounded-xl overflow-hidden max-h-[55vh] overflow-y-auto">
              {filtrados.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-naranja">{r.numero}</span>
                      <span className="text-xs text-gris-dark">{r.fecha?.split('-').reverse().join('/')}</span>
                    </div>
                    <div className="text-xs text-gris-dark truncate">
                      {r.obra_cod}{obraNombre(r.obra_cod) ? ` — ${obraNombre(r.obra_cod)}` : ''}
                      {' · '}{r.items.length} renglón{r.items.length !== 1 ? 'es' : ''}
                    </div>
                  </div>
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => reimprimir(r)}
                  >
                    🖨 Reimprimir
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
