'use client'

import { useRef, useState } from 'react'
import {
  usePersonalDocumentos, useUploadDocumento, useDeleteDocumento,
  fetchDocSignedUrl,
} from '../hooks/usePersonalDocumentos'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { PersonalDocumento, PersonalDocTipo } from '@/types/domain.types'

interface Props {
  leg: string
}

const TIPOS: { key: PersonalDocTipo; label: string; icon: string }[] = [
  { key: 'dni',            label: 'DNI',                 icon: '🪪' },
  { key: 'alta_temprana',  label: 'Alta temprana',       icon: '📄' },
  { key: 'baja',           label: 'Baja',                icon: '📤' },
  { key: 'telegrama',      label: 'Telegrama',           icon: '✉️' },
]

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

export function PersonalDocumentosSection({ leg }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('personal')
  const { puedeCrear: puedeCrearTarja, puedeEliminar: puedeEliminarTarja } = usePermisos('tarja')

  const canCreate = puedeCrear || puedeCrearTarja
  const canDelete = puedeEliminar || puedeEliminarTarja

  const { data: docs = [], isLoading } = usePersonalDocumentos(leg)
  const { mutate: uploadDoc, isPending: uploading } = useUploadDocumento()
  const { mutate: deleteDoc } = useDeleteDocumento()

  // Un ref por tipo para poder disparar el file picker programáticamente
  const fileInputs = useRef<Record<PersonalDocTipo, HTMLInputElement | null>>({
    dni: null, alta_temprana: null, baja: null, telegrama: null,
  })
  const [pendingTipo, setPendingTipo] = useState<PersonalDocTipo | null>(null)

  function handleFileChange(tipo: PersonalDocTipo, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // permite re-subir el mismo archivo
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast('Archivo demasiado grande (máx 10 MB)', 'err')
      return
    }

    setPendingTipo(tipo)
    uploadDoc(
      { leg, file, tipo },
      {
        onSuccess: () => { toast(`✓ ${file.name} subido`, 'ok'); setPendingTipo(null) },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Error al subir'
          toast(msg.includes('DOC_DUPLICADO') ? 'Ese archivo ya está cargado en el legajo' : msg, 'err')
          setPendingTipo(null)
        },
      }
    )
  }

  async function handleVer(doc: PersonalDocumento) {
    try {
      const url = await fetchDocSignedUrl(leg, doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast('No se pudo generar el link', 'err')
    }
  }

  function handleBorrar(doc: PersonalDocumento) {
    if (!confirm(`¿Borrar "${doc.nombre_archivo}"? Se puede recuperar desde la DB si hace falta.`)) return
    deleteDoc(
      { leg, id: doc.id },
      {
        onSuccess: () => toast('✓ Documento eliminado', 'ok'),
        onError: () => toast('Error al eliminar', 'err'),
      }
    )
  }

  // Agrupa docs por tipo
  const porTipo = TIPOS.map(t => ({
    ...t,
    docs: docs.filter(d => d.tipo === t.key),
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">📂 Documentos del legajo</h3>
        <span className="text-xs text-gris-dark">
          {docs.length} archivo{docs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando documentos…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {porTipo.map(({ key, label, icon, docs: docsTipo }) => (
            <div
              key={key}
              className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2 bg-gris/20"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm text-carbon flex items-center gap-1.5">
                  <span>{icon}</span>
                  <span>{label}</span>
                  {docsTipo.length > 0 && (
                    <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded-full">
                      {docsTipo.length}
                    </span>
                  )}
                </div>
                {canCreate && (
                  <>
                    <button
                      onClick={() => fileInputs.current[key]?.click()}
                      disabled={uploading && pendingTipo === key}
                      className="text-[11px] font-bold px-2.5 py-1 rounded bg-azul text-white hover:bg-azul-mid transition-colors disabled:opacity-50"
                    >
                      {uploading && pendingTipo === key ? '⏳ Subiendo…' : '＋ Subir'}
                    </button>
                    <input
                      ref={el => { fileInputs.current[key] = el }}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      onChange={e => handleFileChange(key, e)}
                    />
                  </>
                )}
              </div>

              {docsTipo.length === 0 ? (
                <div className="text-[11px] text-gris-dark italic">Sin documentos.</div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {docsTipo.map(doc => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 bg-white border border-gris-mid rounded px-2 py-1.5"
                    >
                      <span className="text-base">{doc.mime_type === 'application/pdf' ? '📕' : '🖼'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-carbon truncate" title={doc.nombre_archivo}>
                          {doc.nombre_archivo}
                        </div>
                        <div className="text-[10px] text-gris-dark">
                          {fmtSize(doc.size_bytes)} · {fmtFecha(doc.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleVer(doc)}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                        title="Ver / descargar"
                      >
                        👁 Ver
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleBorrar(doc)}
                          className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
