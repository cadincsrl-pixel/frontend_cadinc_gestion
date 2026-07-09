'use client'

import { useRef, useState } from 'react'
import {
  useCobroAdjuntos, useUploadCobroAdjunto, useDeleteCobroAdjunto,
  fetchCobroAdjSignedUrl,
} from '../hooks/useCobroAdjuntos'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { CobroAdjunto, CobroAdjuntoTipo, EmpresaModalidadCobro } from '@/types/domain.types'

interface Props {
  cobroId: number
  // Define qué slots de adjuntos se muestran: liquidación (líquido producto)
  // o factura emitida (facturación por viaje). Default: líquido producto.
  modalidad?: EmpresaModalidadCobro
}

const TODOS_TIPOS: { key: CobroAdjuntoTipo; label: string; icon: string }[] = [
  { key: 'liquidacion',  label: 'Liquidación líquido producto', icon: '🧾' },
  { key: 'factura',      label: 'Factura emitida',               icon: '🧾' },
  { key: 'comprobante',  label: 'Comprobante de cobro',          icon: '💰' },
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

export function CobroAdjuntosSection({ cobroId, modalidad = 'liquido_producto' }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('logistica')

  const { data: adjuntos = [], isLoading } = useCobroAdjuntos(cobroId)
  const { mutate: uploadAdj, isPending: uploading } = useUploadCobroAdjunto()
  const { mutate: deleteAdj } = useDeleteCobroAdjunto()

  const fileInputs = useRef<Record<CobroAdjuntoTipo, HTMLInputElement | null>>({
    liquidacion: null, comprobante: null, factura: null,
  })
  const [pendingTipo, setPendingTipo] = useState<CobroAdjuntoTipo | null>(null)

  function handleFileChange(tipo: CobroAdjuntoTipo, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('Archivo demasiado grande (máx 10 MB)', 'err')
      return
    }
    setPendingTipo(tipo)
    uploadAdj(
      { cobroId, file, tipo },
      {
        onSuccess: () => { toast(`✓ ${file.name} subido`, 'ok'); setPendingTipo(null) },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Error al subir'
          toast(msg.includes('ADJ_DUPLICADO') ? 'Ese archivo ya está cargado' : msg, 'err')
          setPendingTipo(null)
        },
      }
    )
  }

  async function handleVer(adj: CobroAdjunto) {
    await abrirAdjuntoFirmado(
      () => fetchCobroAdjSignedUrl(cobroId, adj.id),
      () => toast('No se pudo generar el link', 'err'),
    )
  }

  function handleBorrar(adj: CobroAdjunto) {
    if (!confirm(`¿Borrar "${adj.nombre_archivo}"?`)) return
    deleteAdj(
      { cobroId, id: adj.id },
      {
        onSuccess: () => toast('✓ Adjunto eliminado', 'ok'),
        onError:   () => toast('Error al eliminar', 'err'),
      }
    )
  }

  // Slots según modalidad, más cualquier tipo fuera de ella que ya tenga
  // archivos (p.ej. un cobro viejo con liquidación de una empresa que
  // después pasó a facturación — que no quede oculto).
  const slotsBase: CobroAdjuntoTipo[] = modalidad === 'facturacion'
    ? ['factura', 'comprobante']
    : ['liquidacion', 'comprobante']
  const porTipo = TODOS_TIPOS
    .filter(t => slotsBase.includes(t.key) || adjuntos.some(a => a.tipo === t.key))
    .map(t => ({
      ...t,
      items: adjuntos.filter(a => a.tipo === t.key),
    }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">📂 Adjuntos del cobro</h3>
        <span className="text-xs text-gris-dark">
          {adjuntos.length} archivo{adjuntos.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {porTipo.map(({ key, label, icon, items }) => (
            <div
              key={key}
              className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2 bg-gris/20"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm text-carbon flex items-center gap-1.5">
                  <span>{icon}</span>
                  <span>{label}</span>
                  {items.length > 0 && (
                    <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded-full">
                      {items.length}
                    </span>
                  )}
                </div>
                {puedeCrear && (
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

              {items.length === 0 ? (
                <div className="text-[11px] text-gris-dark italic">Sin archivos.</div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map(adj => (
                    <li
                      key={adj.id}
                      className="flex items-center gap-2 bg-white border border-gris-mid rounded px-2 py-1.5"
                    >
                      <span className="text-base">{adj.mime_type === 'application/pdf' ? '📕' : '🖼'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-carbon truncate" title={adj.nombre_archivo}>
                          {adj.nombre_archivo}
                        </div>
                        <div className="text-[10px] text-gris-dark">
                          {fmtSize(adj.size_bytes)} · {fmtFecha(adj.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleVer(adj)}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                        title="Ver / descargar"
                      >
                        👁
                      </button>
                      {puedeEliminar && (
                        <button
                          onClick={() => handleBorrar(adj)}
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
