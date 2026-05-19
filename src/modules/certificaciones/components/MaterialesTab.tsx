'use client'

import { useState, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useMateriales, useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../hooks/useCertificaciones'
import { useStockMateriales } from '../hooks/useStock'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { createClient } from '@/lib/supabase/client'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { CertMaterial, Obra, StockMaterial } from '@/types/domain.types'

type DescripcionOption = { value: string; label: string; sub?: string }

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

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }

const BUCKET = 'cert-adjuntos'

async function uploadAdjunto(file: File): Promise<{ url: string; nombre: string }> {
  const supabase = createClient()
  const ext  = file.name.split('.').pop()
  const path = `mat_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nombre: file.name }
}

// ── Agrupación por compra ────────────────────────────────────────────────────
interface Compra {
  key:           string
  obra_cod:      string
  fecha:         string
  proveedor:     string | null
  obs:           string | null
  adjunto_url:   string | null
  adjunto_nombre: string | null
  items:         CertMaterial[]
  total:         number
}

function groupMateriales(mats: CertMaterial[]): Compra[] {
  const map = new Map<string, Compra>()
  for (const m of mats) {
    const key = m.compra_id || `single_${m.id}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        obra_cod:      m.obra_cod,
        fecha:         m.fecha,
        proveedor:     m.proveedor,
        obs:           m.obs,
        adjunto_url:   m.adjunto_url,
        adjunto_nombre: m.adjunto_nombre,
        items:         [],
        total:         0,
      })
    }
    const c = map.get(key)!
    c.items.push(m)
    c.total += m.total
  }
  return Array.from(map.values())
}

// ── Fila de línea dentro del modal ──────────────────────────────────────────
interface Linea {
  id:          number
  descripcion: string
  cantidad:    number
  unidad:      string
  precio_unit: number
}

function LineaRow({
  linea, onChange, onRemove, showRemove, descripcionOptions,
}: {
  linea:     Linea
  onChange:  (l: Linea) => void
  onRemove:  () => void
  showRemove: boolean
  descripcionOptions: DescripcionOption[]
}) {
  const total = linea.cantidad * linea.precio_unit
  return (
    <tr className="border-b border-gris last:border-0">
      <td className="py-1.5 pr-2">
        <Combobox
          placeholder="Buscar o escribir material..."
          options={descripcionOptions}
          value={linea.descripcion}
          onChange={v => onChange({ ...linea, descripcion: v })}
          onCreate={q => onChange({ ...linea, descripcion: q })}
          createLabel="Usar"
          freeText
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
      <td className="py-1.5 pr-2 w-32">
        <input
          type="number"
          min="0"
          step="1"
          value={linea.precio_unit}
          onChange={e => onChange({ ...linea, precio_unit: parseFloat(e.target.value) || 0 })}
          className="w-full px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja"
        />
      </td>
      <td className="py-1.5 pr-2 w-28 text-right font-mono font-bold text-carbon text-sm">
        {fmtM(total)}
      </td>
      <td className="py-1.5 w-8 text-center">
        {showRemove && (
          <button onClick={onRemove} className="text-gris-mid hover:text-rojo text-sm font-bold transition-colors">✕</button>
        )}
      </td>
    </tr>
  )
}

let nextId = 1
function newLinea(): Linea {
  return { id: nextId++, descripcion: '', cantidad: 1, unidad: 'unid', precio_unit: 0 }
}

// ── Fila de compra expandible ─────────────────────────────────────────────────
function CompraRow({
  compra, expanded, onToggle, onEditItem, onDeleteItem, onAbrirAdjunto,
}: {
  compra:        Compra
  expanded:      boolean
  onToggle:      () => void
  onEditItem:    (m: CertMaterial) => void
  onDeleteItem:  (id: number) => void
  onAbrirAdjunto: (url: string) => void
}) {
  const tieneMultiple = compra.items.length > 1
  return (
    <>
      {/* Fila resumen de la compra */}
      <tr
        className="border-b border-gris hover:bg-gris/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-mono text-xs font-bold text-azul w-8">
          <span className="inline-block w-5 text-center text-gris-dark select-none">
            {tieneMultiple ? (expanded ? '▼' : '▶') : ' '}
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-xs font-bold text-azul">{compra.obra_cod}</td>
        <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(compra.fecha)}</td>
        <td className="px-4 py-3 text-sm text-carbon font-medium">
          {tieneMultiple ? (
            <span className="text-azul font-semibold">{compra.items.length} materiales</span>
          ) : (
            <span>{compra.items[0]?.descripcion ?? ''}</span>
          )}
          {compra.proveedor && (
            <div className="text-xs text-gris-dark mt-0.5">{compra.proveedor}</div>
          )}
        </td>
        <td className="px-4 py-3 font-mono font-bold text-right text-carbon">{fmtM(compra.total)}</td>
        <td className="px-4 py-3">
          {compra.adjunto_url ? (
            <button
              onClick={e => { e.stopPropagation(); onAbrirAdjunto(compra.adjunto_url!) }}
              className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
            >
              📎 {compra.adjunto_nombre ?? 'Ver'}
            </button>
          ) : (
            <span className="text-gris-mid text-xs">—</span>
          )}
        </td>
        {/* Si es 1 solo ítem, mostramos los botones en la fila resumen */}
        <td className="px-4 py-3">
          {!tieneMultiple && compra.items[0] && (
            <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
              <button onClick={() => onEditItem(compra.items[0]!)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
              <button onClick={() => onDeleteItem(compra.items[0]!.id)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
            </div>
          )}
          {tieneMultiple && (
            <div className="text-xs text-gris-mid text-right pr-1 select-none">{expanded ? 'ocultar' : 'ver detalle'}</div>
          )}
        </td>
      </tr>

      {/* Filas de detalle expandibles */}
      {expanded && compra.items.map((m, i) => (
        <tr key={m.id} className="border-b border-gris bg-azul-light/40 hover:bg-azul-light/70 transition-colors">
          <td className="pl-8 pr-2 py-2 text-xs text-gris-mid text-center">{i + 1}</td>
          <td className="px-2 py-2" />
          <td className="px-2 py-2 text-xs text-gris-dark font-mono">{fmtF(m.fecha)}</td>
          <td className="px-4 py-2 text-sm text-carbon">
            {m.descripcion}
            <span className="text-xs text-gris-dark ml-2 font-mono">{m.cantidad} {m.unidad} × {fmtM(m.precio_unit)}</span>
          </td>
          <td className="px-4 py-2 font-mono text-right text-carbon text-sm">{fmtM(m.total)}</td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2">
            <div className="flex gap-1 justify-end">
              <button onClick={() => onEditItem(m)} className="text-xs px-2 py-1 rounded hover:bg-white transition-colors">✏️</button>
              <button onClick={() => onDeleteItem(m.id)} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
export function MaterialesTab() {
  const toast = useToast()
  const { data: obras = [] }      = useObras('certificaciones')
  const [obraFiltro, setObraFiltro] = useState('')
  const { data: materiales = [] } = useMateriales(obraFiltro || undefined)
  // Para el autocomplete del modal: necesitamos descripciones de TODAS las
  // obras + nombres del catálogo de stock. El query sin filtro de obra usa
  // queryKey distinto (`'all'`) y no compite con el filtrado.
  const { data: materialesAll = [] } = useMateriales(undefined)
  const { data: stockMateriales = [] } = useStockMateriales()
  const { mutate: create, isPending: creating } = useCreateMaterial()
  const { mutate: update, isPending: updating } = useUpdateMaterial()
  const { mutate: remove } = useDeleteMaterial()

  const [modalNuevo, setModalNuevo]   = useState(false)
  const [editando,   setEditando]     = useState<CertMaterial | null>(null)
  const [lineas,     setLineas]       = useState<Linea[]>([newLinea()])
  const [adjunto,    setAdjunto]      = useState<{ url: string; nombre: string } | null>(null)
  const [uploading,  setUploading]    = useState(false)
  const [obraNueva,  setObraNueva]    = useState('')
  const [expanded,   setExpanded]     = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const formCab  = useForm<any>({ defaultValues: { fecha: '', proveedor: '', obs: '' } })
  const formEdit = useForm<any>()

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions  = obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))

  const totalCompra = lineas.reduce((s, l) => s + l.cantidad * l.precio_unit, 0)
  const compras     = groupMateriales(materiales as CertMaterial[])
  const totalGeneral = compras.reduce((s, c) => s + c.total, 0)

  // Opciones de autocomplete para descripciones (catálogo de stock + descripciones
  // ya usadas en cert_materiales, dedupeadas por nombre normalizado). Se calcula
  // una sola vez en el padre y se pasa como prop a cada LineaRow para evitar
  // recálculos por línea.
  const descripcionOptions = useMemo<DescripcionOption[]>(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const map = new Map<string, DescripcionOption>()
    // 1) Catálogo de stock (prioridad — se muestra el sub "📦 catálogo")
    for (const m of stockMateriales as StockMaterial[]) {
      const nom = m.nombre?.trim()
      if (!nom) continue
      const key = norm(nom)
      if (!map.has(key)) {
        map.set(key, { value: nom, label: nom, sub: '📦 catálogo' })
      }
    }
    // 2) Descripciones ya usadas en cert_materiales (solo agregar si no estaba)
    for (const m of materialesAll as CertMaterial[]) {
      const desc = m.descripcion?.trim()
      if (!desc) continue
      const key = norm(desc)
      if (!map.has(key)) {
        map.set(key, { value: desc, label: desc, sub: 'usado antes' })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [stockMateriales, materialesAll])

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function abrirNuevo() {
    setLineas([newLinea()])
    setAdjunto(null)
    setObraNueva('')
    formCab.reset({ fecha: new Date().toISOString().slice(0, 10), proveedor: '', obs: '' })
    setModalNuevo(true)
  }

  function updateLinea(id: number, l: Linea) {
    setLineas(prev => prev.map(x => x.id === id ? l : x))
  }

  function removeLinea(id: number) {
    setLineas(prev => prev.filter(x => x.id !== id))
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadAdjunto(file)
      setAdjunto(r)
      toast('✓ Adjunto subido', 'ok')
    } catch {
      toast('Error al subir adjunto', 'err')
    } finally {
      setUploading(false)
    }
  }

  async function handleCreate(cab: any) {
    if (!obraNueva) { toast('Seleccioná una obra', 'err'); return }
    const lineasValidas = lineas.filter(l => l.descripcion.trim())
    if (!lineasValidas.length) { toast('Agregá al menos una línea con descripción', 'err'); return }

    // ID de compra compartido entre todas las líneas
    const compra_id = crypto.randomUUID()

    let pendientes = lineasValidas.length
    let errores = 0

    for (const l of lineasValidas) {
      create({
        obra_cod:       obraNueva,
        fecha:          cab.fecha,
        descripcion:    l.descripcion,
        proveedor:      cab.proveedor || '',
        cantidad:       l.cantidad,
        unidad:         l.unidad,
        precio_unit:    l.precio_unit,
        obs:            cab.obs || '',
        adjunto_url:    adjunto?.url    ?? '',
        adjunto_nombre: adjunto?.nombre ?? '',
        compra_id,
      }, {
        onSuccess: () => {
          pendientes--
          if (pendientes === 0 && errores === 0) {
            toast(`✓ ${lineasValidas.length} material${lineasValidas.length > 1 ? 'es' : ''} cargado${lineasValidas.length > 1 ? 's' : ''}`, 'ok')
            setModalNuevo(false)
          }
        },
        onError: () => { errores++; toast('Error al cargar uno o más materiales', 'err') },
      })
    }
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: {
      fecha:       data.fecha,
      descripcion: data.descripcion,
      proveedor:   data.proveedor || '',
      cantidad:    Number(data.cantidad),
      unidad:      data.unidad,
      precio_unit: Number(data.precio_unit),
      obs:         data.obs || '',
    }}, {
      onSuccess: () => { toast('✓ Actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  function openEdit(m: CertMaterial) {
    formEdit.reset({
      fecha: m.fecha, descripcion: m.descripcion, proveedor: m.proveedor ?? '',
      cantidad: m.cantidad, unidad: m.unidad, precio_unit: m.precio_unit, obs: m.obs ?? '',
    })
    setEditando(m)
  }

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar este material?')) return
    remove(id, { onSuccess: () => toast('✓ Eliminado', 'ok'), onError: () => toast('Error', 'err') })
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex-1 min-w-[220px] max-w-xs">
          <Combobox placeholder="Buscar obra..." options={obraOptions} value={obraFiltro} onChange={setObraFiltro} />
        </div>
        <Button variant="primary" size="sm" onClick={abrirNuevo}>
          ＋ Cargar materiales
        </Button>
      </div>

      {/* Tabla agrupada por compra — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-x-auto">
        <table className="w-full border-collapse min-w-[680px]">
          <thead>
            <tr>
              {['', 'Obra', 'Fecha', 'Descripción / Proveedor', 'Total', 'Adjunto', ''].map((h, i) => (
                <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide last:text-right [&:nth-child(5)]:text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compras.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">Sin materiales registrados.</td></tr>
            ) : compras.map(c => (
              <CompraRow
                key={c.key}
                compra={c}
                expanded={expanded.has(c.key)}
                onToggle={() => toggleExpand(c.key)}
                onEditItem={openEdit}
                onDeleteItem={handleDelete}
                onAbrirAdjunto={url => window.open(url, '_blank')}
              />
            ))}
          </tbody>
          {compras.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="px-4 py-3 text-xs font-bold text-right text-gris-dark uppercase tracking-wide">Total general</td>
                <td className="px-4 py-3 font-mono font-bold text-lg text-naranja text-right">{fmtM(totalGeneral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        {compras.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm italic">
            Sin materiales registrados.
          </div>
        ) : compras.map(c => {
          const tieneMultiple = c.items.length > 1
          const isExp = expanded.has(c.key)
          return (
            <div key={c.key} className="bg-white rounded-card shadow-sm border border-gris-mid p-3">
              <button
                onClick={() => toggleExpand(c.key)}
                className="w-full flex items-start justify-between gap-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-azul">{c.obra_cod}</span>
                    <span className="text-[11px] text-gris-dark font-mono">{fmtF(c.fecha)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-carbon">
                    {tieneMultiple ? (
                      <span className="text-azul font-semibold">{c.items.length} materiales</span>
                    ) : (
                      <span className="break-words">{c.items[0]?.descripcion ?? ''}</span>
                    )}
                  </div>
                  {c.proveedor && <div className="text-[11px] text-gris-dark mt-0.5">{c.proveedor}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-sm text-carbon">{fmtM(c.total)}</div>
                  {tieneMultiple && (
                    <span className="text-[10px] text-gris-mid select-none">{isExp ? '▼ ocultar' : '▶ ver detalle'}</span>
                  )}
                </div>
              </button>

              {/* Adjunto + acciones */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {c.adjunto_url && (
                  <button
                    onClick={() => window.open(c.adjunto_url!, '_blank')}
                    className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
                  >
                    📎 {c.adjunto_nombre ?? 'Ver adjunto'}
                  </button>
                )}
                {!tieneMultiple && c.items[0] && (
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => openEdit(c.items[0]!)} className="text-xs font-bold px-3 py-1.5 rounded bg-gris text-gris-dark hover:bg-gris-mid min-h-[36px]">✏️ Editar</button>
                    <button onClick={() => handleDelete(c.items[0]!.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px]">✕</button>
                  </div>
                )}
              </div>

              {/* Detalle expandible */}
              {isExp && tieneMultiple && (
                <div className="mt-3 pt-3 border-t border-gris flex flex-col gap-2">
                  {c.items.map((m, i) => (
                    <div key={m.id} className="bg-azul-light/40 rounded-lg p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gris-mid">#{i + 1}</div>
                          <div className="text-sm text-carbon">{m.descripcion}</div>
                          <div className="text-[11px] text-gris-dark font-mono mt-0.5">
                            {m.cantidad} {m.unidad} × {fmtM(m.precio_unit)}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-sm text-carbon shrink-0">{fmtM(m.total)}</div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => openEdit(m)} className="text-xs font-bold px-3 py-1.5 rounded bg-white text-gris-dark hover:bg-gris flex-1 min-h-[36px]">✏️ Editar</button>
                        <button onClick={() => handleDelete(m.id)} className="text-xs font-bold px-3 py-1.5 rounded bg-rojo-light text-rojo hover:opacity-80 min-h-[36px]">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {compras.length > 0 && (
          <div className="bg-white rounded-card shadow-sm border border-gris-mid p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-gris-dark uppercase tracking-wide">Total general</span>
            <span className="font-mono font-bold text-lg text-naranja">{fmtM(totalGeneral)}</span>
          </div>
        )}
      </div>

      {/* ── Modal nueva compra ── */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="📦 CARGAR MATERIALES" width="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating || uploading} onClick={formCab.handleSubmit(handleCreate)}>
              ✓ Guardar {lineas.filter(l => l.descripcion.trim()).length > 1 ? `(${lineas.filter(l => l.descripcion.trim()).length} ítems)` : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Combobox
              label="Obra"
              placeholder="Buscar obra..."
              options={obraOptions}
              value={obraNueva}
              onChange={setObraNueva}
            />
            <Input label="Fecha de compra" type="date" {...formCab.register('fecha')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Proveedor" placeholder="Nombre del proveedor..." {...formCab.register('proveedor')} />
            <Input label="Observaciones" placeholder="Notas opcionales..." {...formCab.register('obs')} />
          </div>

          {/* Adjunto */}
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Comprobante / Factura</div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />
            {adjunto ? (
              <div className="flex items-center gap-2 bg-azul-light rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-azul flex-1 truncate">📎 {adjunto.nombre}</span>
                <button onClick={() => setAdjunto(null)} className="text-gris-dark hover:text-rojo text-xs font-bold">✕</button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                📎 Adjuntar comprobante
              </Button>
            )}
          </div>

          {/* Líneas de detalle */}
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Detalle de materiales</div>

            {/* Tabla — desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b-2 border-gris">
                    <th className="text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2">Descripción</th>
                    <th className="text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-20">Cantidad</th>
                    <th className="text-left text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-20">Unidad</th>
                    <th className="text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-32">P. Unitario</th>
                    <th className="text-right text-[10px] font-bold text-gris-dark uppercase tracking-wide pb-2 pr-2 w-28">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <LineaRow
                      key={l.id}
                      linea={l}
                      onChange={updated => updateLinea(l.id, updated)}
                      onRemove={() => removeLinea(l.id)}
                      showRemove={lineas.length > 1}
                      descripcionOptions={descripcionOptions}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards — mobile */}
            <div className="flex flex-col gap-2 sm:hidden">
              {lineas.map(l => {
                const total = l.cantidad * l.precio_unit
                return (
                  <div key={l.id} className="border border-gris-mid rounded-lg p-3 bg-gris/20">
                    <Combobox
                      placeholder="Buscar o escribir material..."
                      options={descripcionOptions}
                      value={l.descripcion}
                      onChange={v => updateLinea(l.id, { ...l, descripcion: v })}
                      onCreate={q => updateLinea(l.id, { ...l, descripcion: q })}
                      createLabel="Usar"
                      freeText
                    />
                    <div className="flex gap-2 items-center mt-2">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={l.cantidad}
                        onChange={e => updateLinea(l.id, { ...l, cantidad: parseFloat(e.target.value) || 0 })}
                        placeholder="Cant."
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja"
                      />
                      <select
                        value={l.unidad}
                        onChange={e => updateLinea(l.id, { ...l, unidad: e.target.value })}
                        className="w-20 px-1 py-1.5 border border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
                      >
                        {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={l.precio_unit}
                        onChange={e => updateLinea(l.id, { ...l, precio_unit: parseFloat(e.target.value) || 0 })}
                        placeholder="P. Unit"
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gris-mid rounded-lg text-sm text-right outline-none focus:border-naranja"
                      />
                      {lineas.length > 1 && (
                        <button
                          onClick={() => removeLinea(l.id)}
                          className="text-gris-mid hover:text-rojo text-lg font-bold px-2"
                          aria-label="Eliminar línea"
                        >✕</button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-gris-dark">
                      <span className="uppercase tracking-wide">Total</span>
                      <span className="font-mono font-bold text-sm text-carbon">{fmtM(total)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => setLineas(prev => [...prev, newLinea()])}
              className="mt-2 text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-1"
            >
              ＋ Agregar línea
            </button>
          </div>

          {totalCompra > 0 && (
            <div className="flex justify-end">
              <div className="bg-azul-light rounded-xl px-4 py-2 flex items-center gap-3">
                <span className="text-xs font-bold text-gris-dark uppercase tracking-wide">Total compra</span>
                <span className="font-mono font-bold text-lg text-azul">{fmtM(totalCompra)}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Modal editar (una línea) ── */}
      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button><Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formEdit.register('fecha')} />
            <Input label="Proveedor" {...formEdit.register('proveedor')} />
          </div>
          <Input label="Descripción" {...formEdit.register('descripcion')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input label="Cantidad" type="number" step="0.001" {...formEdit.register('cantidad')} />
            <Select label="Unidad" options={UNIDADES} {...formEdit.register('unidad')} />
            <Input label="Precio unitario ($)" type="number" step="1" {...formEdit.register('precio_unit')} />
          </div>
          <Input label="Observaciones" {...formEdit.register('obs')} />
        </div>
      </Modal>
    </>
  )
}
