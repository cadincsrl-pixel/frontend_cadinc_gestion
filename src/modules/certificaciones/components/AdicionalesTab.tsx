'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useAdicionales, useCreateAdicional, useUpdateAdicional, useDeleteAdicional } from '../hooks/useCertificaciones'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { createClient } from '@/lib/supabase/client'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import type { CertAdicional, Obra } from '@/types/domain.types'

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
function fmtF(s: string) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }

const BUCKET = 'cert-adjuntos'

async function uploadAdjunto(file: File): Promise<{ url: string; nombre: string }> {
  const supabase = createClient()
  const ext  = file.name.split('.').pop()
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nombre: file.name }
}

async function getSignedUrl(url: string): Promise<string> {
  // Si ya es pública, devolver directo
  if (url.includes('/public/')) return url
  const supabase = createClient()
  // Extraer el path del bucket
  const parts = url.split(`/${BUCKET}/`)
  if (parts.length < 2) return url
  const path = parts[1]!
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return url
  return data.signedUrl
}

export function AdicionalesTab() {
  const toast = useToast()
  const { data: obras = [] }      = useObras()
  const [obraFiltro, setObraFiltro] = useState('')
  const { data: adicionales = [] } = useAdicionales(obraFiltro || undefined)
  const { mutate: create, isPending: creating } = useCreateAdicional()
  const { mutate: update, isPending: updating } = useUpdateAdicional()
  const { mutate: remove } = useDeleteAdicional()

  const [modalNuevo,   setModalNuevo]   = useState(false)
  const [editando,     setEditando]     = useState<CertAdicional | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [adjuntoNuevo, setAdjuntoNuevo] = useState<{ url: string; nombre: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileRefEdit = useRef<HTMLInputElement>(null)

  const formNuevo = useForm<any>({ defaultValues: { monto: 0 } })
  const formEdit  = useForm<any>()

  const obrasActivas = (obras as Obra[]).filter(o => !o.archivada)
  const obraOptions  = [{ value: '', label: 'Todas las obras' }, ...obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` }))]

  async function handleFile(file: File | undefined, onDone: (r: { url: string; nombre: string }) => void) {
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadAdjunto(file)
      onDone(r)
      toast('✓ Adjunto subido', 'ok')
    } catch {
      toast('Error al subir adjunto', 'err')
    } finally {
      setUploading(false)
    }
  }

  function handleCreate(data: any) {
    if (!data.obra_cod) { toast('Seleccioná una obra', 'err'); return }
    create({
      obra_cod:       data.obra_cod,
      fecha:          data.fecha,
      descripcion:    data.descripcion,
      monto:          Number(data.monto),
      adjunto_url:    adjuntoNuevo?.url    ?? '',
      adjunto_nombre: adjuntoNuevo?.nombre ?? '',
      obs:            data.obs || '',
    }, {
      onSuccess: () => {
        toast('✓ Adicional cargado', 'ok')
        setModalNuevo(false)
        setAdjuntoNuevo(null)
        formNuevo.reset({ monto: 0 })
      },
      onError: () => toast('Error al cargar', 'err'),
    })
  }

  function openEdit(a: CertAdicional) {
    formEdit.reset({
      fecha: a.fecha, descripcion: a.descripcion,
      monto: a.monto, obs: a.obs ?? '',
    })
    setEditando(a)
  }

  function handleUpdate(data: any) {
    if (!editando) return
    update({ id: editando.id, dto: {
      fecha:       data.fecha,
      descripcion: data.descripcion,
      monto:       Number(data.monto),
      obs:         data.obs || '',
    }}, {
      onSuccess: () => { toast('✓ Actualizado', 'ok'); setEditando(null) },
      onError:   () => toast('Error al actualizar', 'err'),
    })
  }

  async function abrirAdjunto(url: string) {
    try {
      const signed = await getSignedUrl(url)
      window.open(signed, '_blank')
    } catch {
      toast('Error al abrir adjunto', 'err')
    }
  }

  const totalGeneral = (adicionales as CertAdicional[]).reduce((s, a) => s + a.monto, 0)

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <Select
          label=""
          options={obraOptions}
          value={obraFiltro}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setObraFiltro(e.target.value)}
        />
        <Button variant="primary" size="sm" onClick={() => {
          formNuevo.setValue('fecha', new Date().toISOString().slice(0, 10))
          setAdjuntoNuevo(null)
          setModalNuevo(true)
        }}>
          ＋ Cargar adicional
        </Button>
      </div>

      <div className="bg-white rounded-card shadow-card overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr>
              {['Obra', 'Fecha', 'Descripción', 'Monto', 'Adjunto', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(adicionales as CertAdicional[]).length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gris-dark text-sm italic">Sin adicionales registrados.</td></tr>
            ) : (adicionales as CertAdicional[]).map(a => (
              <tr key={a.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-azul">{a.obra_cod}</td>
                <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtF(a.fecha)}</td>
                <td className="px-4 py-3 text-sm text-carbon font-medium">
                  {a.descripcion}
                  {a.obs && <div className="text-xs text-gris-dark mt-0.5">{a.obs}</div>}
                </td>
                <td className="px-4 py-3 font-mono font-bold text-carbon">{fmtM(a.monto)}</td>
                <td className="px-4 py-3">
                  {a.adjunto_url ? (
                    <button
                      onClick={() => abrirAdjunto(a.adjunto_url!)}
                      className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
                    >
                      📎 {a.adjunto_nombre ?? 'Ver adjunto'}
                    </button>
                  ) : (
                    <span className="text-gris-mid text-xs">Sin adjunto</span>
                  )}
                </td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  <button onClick={() => openEdit(a)} className="text-xs px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                  <button onClick={() => { if (confirm('¿Eliminar adicional?')) remove(a.id, { onSuccess: () => toast('✓ Eliminado', 'ok'), onError: () => toast('Error', 'err') }) }} className="text-xs px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          {(adicionales as CertAdicional[]).length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className="px-4 py-3 text-xs font-bold text-right text-gris-dark uppercase tracking-wide">Total general</td>
                <td className="px-4 py-3 font-mono font-bold text-lg text-naranja">{fmtM(totalGeneral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal nuevo */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="🧾 CARGAR ADICIONAL"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating || uploading} onClick={formNuevo.handleSubmit(handleCreate)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Select label="Obra" options={obrasActivas.map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` }))} {...formNuevo.register('obra_cod')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formNuevo.register('fecha')} />
            <Input label="Monto ($)" type="number" step="1" {...formNuevo.register('monto')} />
          </div>
          <Input label="Descripción" placeholder="Ej: Reparación de encofrado..." {...formNuevo.register('descripcion')} />
          <Input label="Observaciones" placeholder="Notas opcionales..." {...formNuevo.register('obs')} />

          {/* Adjunto */}
          <div>
            <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Adjunto (foto o PDF)</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0], r => setAdjuntoNuevo(r))}
            />
            {adjuntoNuevo ? (
              <div className="flex items-center gap-2 bg-gris rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-carbon flex-1 truncate">📎 {adjuntoNuevo.nombre}</span>
                <button onClick={() => setAdjuntoNuevo(null)} className="text-gris-dark hover:text-rojo text-xs font-bold">✕</button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                📎 Adjuntar comprobante
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal editar */}
      <Modal open={!!editando} onClose={() => setEditando(null)} title="✏️ EDITAR ADICIONAL"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button variant="primary" loading={updating} onClick={formEdit.handleSubmit(handleUpdate)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formEdit.register('fecha')} />
            <Input label="Monto ($)" type="number" step="1" {...formEdit.register('monto')} />
          </div>
          <Input label="Descripción" {...formEdit.register('descripcion')} />
          <Input label="Observaciones" {...formEdit.register('obs')} />
          {editando?.adjunto_url && (
            <div className="text-xs text-gris-dark">
              Adjunto actual:{' '}
              <button onClick={() => abrirAdjunto(editando.adjunto_url!)} className="font-bold text-azul hover:underline">
                📎 {editando.adjunto_nombre ?? 'Ver'}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
