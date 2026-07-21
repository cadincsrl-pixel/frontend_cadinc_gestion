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
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import { toISO } from '@/lib/utils/dates'
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
  { key: 'homologacion',   label: 'Homologación',    icon: '✅' },
  // Son 2 PDFs: el casillero acepta varios archivos (se listan todos)
  { key: 'registro_modificacion', label: 'Registro de modificación', icon: '🔧' },
]

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtFecha(iso: string): string {
  // TZ-safe: parsea los componentes de la fecha (YYYY-MM-DD) sin construir un
  // Date, que interpretaría el string date-only como UTC y en UTC-3 mostraría
  // un día menos (inconsistente con el badge de vencimiento). Toma sólo la
  // parte de fecha, por si llega un timestamp ISO completo (ej. created_at).
  const [y, m, day] = iso.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
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

  const [pendingTipo, setPendingTipo] = useState<VehiculoDocTipo | null>(null)
  // Modal de carga: tipo a cargar + archivo elegido + fecha de vencimiento.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadTipo,  setUploadTipo]  = useState<VehiculoDocTipo | null>(null)
  const [uploadFile,  setUploadFile]  = useState<File | null>(null)
  const [uploadVence, setUploadVence] = useState('')
  // Modal de edición del vencimiento de un documento ya cargado.
  const [editDoc,   setEditDoc]   = useState<VehiculoDocumento | null>(null)
  const [editVence, setEditVence] = useState('')
  // Tipos cuyo "anteriores (archivados)" está desplegado.
  const [verAnteriores, setVerAnteriores] = useState<Set<VehiculoDocTipo>>(new Set())
  function toggleAnteriores(tipo: VehiculoDocTipo) {
    setVerAnteriores(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo); else next.add(tipo)
      return next
    })
  }

  function abrirUpload(tipo: VehiculoDocTipo) {
    setUploadTipo(tipo)
    setUploadFile(null)
    setUploadVence('')
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('Archivo demasiado grande (máx 10 MB)', 'err')
      return
    }
    setUploadFile(file)
  }

  function confirmarUpload() {
    if (!uploadTipo || !uploadFile) return
    const cfg = TIPOS.find(t => t.key === uploadTipo)!
    const venceVal = uploadVence.trim() || null
    if (cfg.venceObligatorio && !venceVal) {
      toast(`Cargá la fecha de vencimiento de ${cfg.label} antes de subir`, 'err')
      return
    }
    setPendingTipo(uploadTipo)
    uploadDoc(
      { entidad, id, file: uploadFile, tipo: uploadTipo, vence_el: venceVal },
      {
        onSuccess: () => {
          toast(`✓ ${cfg.label} cargado`, 'ok')
          setPendingTipo(null)
          setUploadTipo(null)
          setUploadFile(null)
          setUploadVence('')
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
    await abrirAdjuntoFirmado(
      () => fetchVehiculoDocSignedUrl(entidad, id, doc.id),
      () => toast('No se pudo generar el link', 'err'),
    )
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

  function abrirEditVence(doc: VehiculoDocumento) {
    setEditDoc(doc)
    setEditVence(doc.vence_el ?? '')
  }

  function guardarVence() {
    if (!editDoc) return
    // <input type="date"> entrega siempre YYYY-MM-DD o '' → no hace falta validar formato.
    updateDoc(
      { entidad, id, docId: editDoc.id, vence_el: editVence.trim() || null },
      {
        onSuccess: () => { toast('✓ Vencimiento actualizado', 'ok'); setEditDoc(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  // Render de un doc (vigente o archivado). Para archivados muestra un badge
  // gris "Archivado" en vez del rojo "Vencido".
  function renderDocLi(doc: VehiculoDocumento, archivado: boolean, venceObligatorio?: boolean) {
    return (
      <li
        key={doc.id}
        className={`flex items-center gap-2 bg-white border border-gris-mid rounded px-2 py-1.5 flex-wrap ${archivado ? 'opacity-60' : ''}`}
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
            {archivado ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-gris text-gris-dark">
                Archivado
              </span>
            ) : badgeVencimiento(doc.vence_el)}
          </div>
        </div>
        <button
          onClick={() => handleVer(doc)}
          className="text-sm font-bold px-2.5 py-1.5 min-w-[36px] rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
          title="Ver / descargar"
        >
          👁
        </button>
        {puedeEditar && (venceObligatorio || doc.vence_el) && (
          <button
            onClick={() => abrirEditVence(doc)}
            className="text-sm font-bold px-2.5 py-1.5 min-w-[36px] rounded bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
            title="Editar fecha de vencimiento"
          >
            📅
          </button>
        )}
        {puedeEliminar && (
          <button
            onClick={() => handleBorrar(doc)}
            className="text-sm font-bold px-2.5 py-1.5 min-w-[36px] rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
            title="Eliminar"
          >
            ✕
          </button>
        )}
      </li>
    )
  }

  // Para tipos renovables (los que vencen, ej. RTO/póliza): el doc más nuevo es
  // el VIGENTE y los anteriores quedan "archivados" (no muestran 'vencido', van
  // a un desplegable). Para el resto se muestran todos como hasta ahora.
  const porTipo = TIPOS.map(t => {
    const docsTipo = docs.filter(d => d.tipo === t.key)
    if (t.venceObligatorio && docsTipo.length > 1) {
      const ord = [...docsTipo].sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? '') || (b.id - a.id))
      return { ...t, vigentes: ord.slice(0, 1), archivados: ord.slice(1) }
    }
    return { ...t, vigentes: docsTipo, archivados: [] as VehiculoDocumento[] }
  })

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
          {porTipo.map(({ key, label, icon, venceObligatorio, vigentes, archivados }) => (
            <div
              key={key}
              className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2 bg-gris/20"
            >
              <div className="font-bold text-sm text-carbon flex items-center gap-1.5">
                <span>{icon}</span>
                <span>{label}</span>
                {(vigentes.length + archivados.length) > 0 && (
                  <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded-full">
                    {vigentes.length + archivados.length}
                  </span>
                )}
              </div>

              {puedeCrear && (
                <button
                  onClick={() => abrirUpload(key)}
                  disabled={uploading && pendingTipo === key}
                  className="self-start text-[11px] font-bold px-2.5 py-1 rounded bg-azul text-white hover:bg-azul-mid transition-colors disabled:opacity-50"
                  title={venceObligatorio ? 'Cargar archivo + fecha de vencimiento' : 'Cargar archivo'}
                >
                  {uploading && pendingTipo === key ? '⏳ Subiendo…' : '＋ Cargar'}
                </button>
              )}

              {vigentes.length === 0 && archivados.length === 0 ? (
                <div className="text-[11px] text-gris-dark italic">Sin documentos.</div>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5">
                    {vigentes.map(doc => renderDocLi(doc, false, venceObligatorio))}
                  </ul>
                  {archivados.length > 0 && (
                    <div className="mt-0.5">
                      <button
                        onClick={() => toggleAnteriores(key)}
                        className="text-[11px] font-semibold text-gris-dark hover:text-azul transition-colors"
                      >
                        {verAnteriores.has(key) ? '▼ Ocultar' : '▸ Ver'} anteriores ({archivados.length})
                      </button>
                      {verAnteriores.has(key) && (
                        <ul className="flex flex-col gap-1.5 mt-1.5">
                          {archivados.map(doc => renderDocLi(doc, true, venceObligatorio))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de carga: archivo + fecha de vencimiento juntos ── */}
      {uploadTipo && (() => {
        const cfg = TIPOS.find(t => t.key === uploadTipo)!
        const venceVal = uploadVence.trim()
        const vencida  = !!venceVal && venceVal < toISO(new Date())
        return (
          <Modal
            open
            onClose={() => { if (!uploading) setUploadTipo(null) }}
            title={`${cfg.icon} Cargar ${cfg.label}`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setUploadTipo(null)} disabled={uploading}>Cancelar</Button>
                <Button variant="primary" loading={uploading} disabled={!uploadFile} onClick={confirmarUpload}>
                  ✓ Subir documento
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {/* Archivo */}
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-1.5">Archivo</div>
                {uploadFile ? (
                  <div className="flex items-center gap-2 bg-gris/40 rounded-lg px-3 py-2">
                    <span className="text-lg">{uploadFile.type === 'application/pdf' ? '📕' : '🖼'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-carbon truncate" title={uploadFile.name}>{uploadFile.name}</div>
                      <div className="text-[11px] text-gris-dark">{fmtSize(uploadFile.size)}</div>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-bold text-azul hover:underline shrink-0">
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>📎 Elegir archivo</Button>
                )}
                <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
                <p className="text-[11px] text-gris-dark mt-1">Imagen o PDF, hasta 10 MB.</p>
              </div>

              {/* Vencimiento */}
              <div>
                <Input
                  label={`Fecha de vencimiento${cfg.venceObligatorio ? ' *' : ' (opcional)'}`}
                  type="date"
                  value={uploadVence}
                  onChange={e => setUploadVence(e.target.value)}
                />
                {cfg.venceObligatorio && !venceVal && (
                  <p className="text-[11px] text-naranja-dark mt-1">
                    Obligatoria: con esta fecha el sistema avisa cuando la {cfg.label} esté por vencer.
                  </p>
                )}
                {vencida && (
                  <p className="text-[11px] text-rojo mt-1">⚠ Esa fecha ya pasó — el documento quedará marcado como vencido.</p>
                )}
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── Modal de edición del vencimiento ── */}
      {editDoc && (
        <Modal
          open
          onClose={() => setEditDoc(null)}
          title="📅 Fecha de vencimiento"
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditDoc(null)}>Cancelar</Button>
              <Button variant="primary" onClick={guardarVence}>Guardar</Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-carbon truncate" title={editDoc.nombre_archivo}>📄 {editDoc.nombre_archivo}</p>
            <Input label="Vence el" type="date" value={editVence} onChange={e => setEditVence(e.target.value)} />
            <p className="text-[11px] text-gris-dark">Dejá la fecha vacía para quitar el vencimiento.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
