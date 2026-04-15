'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useMateriales, useCreateMaterial, useUpdateMaterial, useDeleteMaterial } from '../hooks/useCertificaciones'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { createClient } from '@/lib/supabase/client'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import type { CertMaterial, Obra } from '@/types/domain.types'

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

// ── Fila de línea dentro del modal ──────────────────────────────────────────
interface Linea {
  id:          number
  descripcion: string
  cantidad:    number
  unidad:      string
  precio_unit: number
}

function LineaRow({
  linea, onChange, onRemove, showRemove,
}: {
  linea:     Linea
  onChange:  (l: Linea) => void
  onRemove:  () => void
  showRemove: boolean
}) {
  const total = linea.cantidad * linea.precio_unit
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

// ── Componente principal ─────────────────────────────────────────────────────
export function MaterialesTab() {
  const toast = useToast()
  const { data: obras = [] }      = useObras()
  const [obraFiltro, setObraFiltro] = useState('')
  const { data: materiales = [] } = useMateriales(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateMaterial()
  const { mutate: update, isPending: updating } = useUpdateMaterial()
  const { mutate: remove } = useDeleteMaterial()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [editando,   setEditando]   = useState<CertMaterial | null>(null)
  const [lineas,     setLineas]     = useState<Linea[]>([newLinea()])
  const [adjunto,    setAdjunto]    = useState<{ url: string; nombre: string } | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [obraNueva,  setObraNueva]  = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const formCab  = useForm<any>({ defaultValues: { fecha: '', proveedor: '', obs: '' } })
  const formEdit = useForm<any>()

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions  = obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.resp ?? undefined }))

  const totalCompra = lineas.reduce((s, l) => s + l.cantidad * l.precio_unit, 0)

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

  async function abrirAdjunto(url: string) {
    window.open(url, '_blank')
  }

  const totalGeneral = (materiales as CertMaterial[]).reduce((s, m) => s + m.total, 0)

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

      {/* Tabla listado */}
      <div className="bg-white rounded-card shadow-card overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr>
              {['Obra', 'Fecha', 'Descripción', 'Proveedor', 'Cant.', 'Precio unit.', 'Total', 'Adjunto', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(materiales as CertMaterial[]).length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gris-dark text-sm italic">Sin materiales registrados.</td></tr>
            ) : (materiales as CertMaterial[]).map(m => (
              <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-azul">{m.obra_cod}</td>
                <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(m.fecha)}</td>
                <td className="px-4 py-3 text-sm text-carbon font-medium">{m.descripcion}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{m.proveedor || '—'}</td>
                <td className="px-4 py-3 text-sm font-mono text-right">{m.cantidad} {m.unidad}</td>
                <td className="px-4 py-3 text-sm font-mono text-right">{fmtM(m.precio_unit)}</td>
                <td className="px-4 py-3 font-mono font-bold text-right text-carbon">{fmtM(m.total)}</td>
                <td className="px-4 py-3">
                  {m.adjunto_url ? (
                    <button onClick={() => abrirAdjunto(m.adjunto_url!)} className="text-xs font-bold text-azul hover:underline">📎 Ver</button>
                  ) : <span className="text-gris-mid text-xs">—</span>}
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  <button onClick={() => openEdit(m)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                  <button onClick={() => { if (confirm('¿Eliminar?')) remove(m.id, { onSuccess: () => toast('✓ Eliminado', 'ok'), onError: () => toast('Error', 'err') }) }} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          {(materiales as CertMaterial[]).length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs font-bold text-right text-gris-dark uppercase tracking-wide">Total general</td>
                <td className="px-4 py-3 font-mono font-bold text-lg text-naranja">{fmtM(totalGeneral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
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
          {/* Cabecera de la compra */}
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              label="Obra"
              placeholder="Buscar obra..."
              options={obraOptions}
              value={obraNueva}
              onChange={setObraNueva}
            />
            <Input label="Fecha de compra" type="date" {...formCab.register('fecha')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="overflow-x-auto">
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
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botón agregar línea */}
            <button
              onClick={() => setLineas(prev => [...prev, newLinea()])}
              className="mt-2 text-xs font-bold text-azul hover:text-naranja transition-colors flex items-center gap-1"
            >
              ＋ Agregar línea
            </button>
          </div>

          {/* Subtotal */}
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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formEdit.register('fecha')} />
            <Input label="Proveedor" {...formEdit.register('proveedor')} />
          </div>
          <Input label="Descripción" {...formEdit.register('descripcion')} />
          <div className="grid grid-cols-3 gap-3">
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
