'use client'

import { useRef, useState } from 'react'
import {
  useVehiculoDocumentos,
  useUploadVehiculoDocumento,
  useUpdateVehiculoDocumento,
  useDeleteVehiculoDocumento,
  fetchVehiculoDocSignedUrl,
  calcularEstadoVencimiento,
} from '../hooks/useVehiculoDocumentos'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { VehiculoDocumento, VehiculoDocTipo, VehiculoEntidad } from '@/types/domain.types'

interface Props {
  entidad: VehiculoEntidad
  id:      number
}

const TIPOS: { key: VehiculoDocTipo; label: string; icon: string; venceObligatorio?: boolean }[] = [
  { key: 'titulo',         label: 'Título',          icon: '📜' },
  { key: 'tarjeta_verde',  label: 'Tarjeta verde',   icon: '🪪' },
  { key: 'rto',            label: 'RTO',             icon: '🛠', venceObligatorio: true },
  { key: 'poliza_seguro',  label: 'Póliza de seguro',icon: '🛡', venceObligatorio: true },
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

function badgeVencimiento(vence_el: string | null) {
  if (!vence_el) return null
  const { estado, diasRestantes } = calcularEstadoVencimiento(vence_el)
  if (estado === 'sin_vto') return null
  const cls =
    estado === 'vencido'    ? 'bg-rojo text-white' :
    estado === 'por_vencer' ? 'bg-naranja text-white' :
    'bg-verde-light text-verde'
  const txt =
    estado === 'vencido'    ? `Vencido hace ${Math.abs(diasRestantes!)}d` :
    estado === 'por_vencer' ? `Vence en ${diasRestantes}d` :
    'Vigente'
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {txt}
    </span>
  )
}

export function VehiculoDocumentosSection({ entidad, id }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')

  const { data: docs = [], isLoading } = useVehiculoDocumentos(entidad, id)
  const { mutate: uploadDoc, isPending: uploading } = useUploadVehiculoDocumento()
  const { mutate: updateDoc } = useUpdateVehiculoDocumento()
  const { mutate: deleteDoc } = useDeleteVehiculoDocumento()

  const fileInputs = useRef<Record<VehiculoDocTipo, HTMLInputElement | null>>(
    Object.fromEntries(TIPOS.map(t => [t.key, null])) as any,
  )
  const [pendingTipo, setPendingTipo] = useState<VehiculoDocTipo | null>(null)
  const [pendingVence, setPendingVence] = useState<Record<VehiculoDocTipo, string>>(
    Object.fromEntries(TIPOS.map(t => [t.key, ''])) as any,
  )

  function handleFileChange(tipo: VehiculoDocTipo, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('Archivo demasiado grande (máx 10 MB)', 'err')
      return
    }
    const tipoCfg = TIPOS.find(t => t.key === tipo)!
    const venceVal = pendingVence[tipo]?.trim() || null
    if (tipoCfg.venceObligatorio && !venceVal) {
      toast(`Cargá la fecha de vencimiento de ${tipoCfg.label} antes de subir`, 'err')
      return
    }

    setPendingTipo(tipo)
    uploadDoc(
      { entidad, id, file, tipo, vence_el: venceVal },
      {
        onSuccess: () => {
          toast(`✓ ${file.name} subido`, 'ok')
          setPendingTipo(null)
          setPendingVence(prev => ({ ...prev, [tipo]: '' }))
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Error al subir'
          toast(msg.includes('DOC_DUPLICADO') ? 'Ese archivo ya está cargado' : msg, 'err')
          setPendingTipo(null)
        },
      }
    )
  }

  async function handleVer(doc: VehiculoDocumento) {
    try {
      const url = await fetchVehiculoDocSignedUrl(entidad, id, doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast('No se pudo generar el link', 'err')
    }
  }

  function handleBorrar(doc: VehiculoDocumento) {
    if (!confirm(`¿Borrar "${doc.nombre_archivo}"?`)) return
    deleteDoc(
      { entidad, id, docId: doc.id },
      {
        onSuccess: () => toast('✓ Documento eliminado', 'ok'),
        onError:   () => toast('Error al eliminar', 'err'),
      }
    )
  }

  function handleEditarVence(doc: VehiculoDocumento) {
    const cur = doc.vence_el ?? ''
    const nueva = prompt(`Nueva fecha de vencimiento (YYYY-MM-DD) para ${doc.nombre_archivo}:`, cur)
    if (nueva === null) return
    const trimmed = nueva.trim()
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      toast('Formato inválido. Usá YYYY-MM-DD', 'err')
      return
    }
    updateDoc(
      { entidad, id, docId: doc.id, vence_el: trimmed || null },
      {
        onSuccess: () => toast('✓ Vencimiento actualizado', 'ok'),
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  const porTipo = TIPOS.map(t => ({
    ...t,
    docs: docs.filter(d => d.tipo === t.key),
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">📂 Documentos del vehículo</h3>
        <span className="text-xs text-gris-dark">
          {docs.length} archivo{docs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {porTipo.map(({ key, label, icon, venceObligatorio, docs: docsTipo }) => (
            <div
              key={key}
              className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2 bg-gris/20"
            >
              <div className="font-bold text-sm text-carbon flex items-center gap-1.5">
                <span>{icon}</span>
                <span>{label}</span>
                {docsTipo.length > 0 && (
                  <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded-full">
                    {docsTipo.length}
                  </span>
                )}
              </div>

              {puedeCrear && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {venceObligatorio && (
                    <input
                      type="date"
                      value={pendingVence[key] ?? ''}
                      onChange={e => setPendingVence(prev => ({ ...prev, [key]: e.target.value }))}
                      className="text-[11px] px-1.5 py-1 border-[1.5px] border-gris-mid rounded outline-none focus:border-naranja"
                      title="Fecha de vencimiento"
                    />
                  )}
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
                </div>
              )}

              {docsTipo.length === 0 ? (
                <div className="text-[11px] text-gris-dark italic">Sin documentos.</div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {docsTipo.map(doc => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 bg-white border border-gris-mid rounded px-2 py-1.5 flex-wrap"
                    >
                      <span className="text-base">{doc.mime_type === 'application/pdf' ? '📕' : '🖼'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-carbon truncate" title={doc.nombre_archivo}>
                          {doc.nombre_archivo}
                        </div>
                        <div className="text-[10px] text-gris-dark flex items-center gap-1.5 flex-wrap">
                          <span>{fmtSize(doc.size_bytes)} · {fmtFecha(doc.created_at)}</span>
                          {doc.vence_el && (
                            <>
                              <span>·</span>
                              <span>vence {fmtFecha(doc.vence_el)}</span>
                            </>
                          )}
                          {badgeVencimiento(doc.vence_el)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleVer(doc)}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                        title="Ver / descargar"
                      >
                        👁
                      </button>
                      {puedeEditar && (venceObligatorio || doc.vence_el) && (
                        <button
                          onClick={() => handleEditarVence(doc)}
                          className="text-[11px] font-bold px-2 py-1 rounded bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
                          title="Editar fecha de vencimiento"
                        >
                          📅
                        </button>
                      )}
                      {puedeEliminar && (
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
