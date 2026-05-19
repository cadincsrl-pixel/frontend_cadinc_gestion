'use client'

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useHerramientaFotos,
  useUploadHerramientaFoto,
  useDeleteHerramientaFoto,
  fetchHerramientaFotoUrl,
} from '../hooks/useHerramientaFotos'

interface Props {
  /** Si es null, la herramienta todavía no fue guardada (modo nuevo). */
  herramientaId: number | null
  /** En modo detalle ocultamos botones de subir/borrar (solo lectura). */
  readOnly?: boolean
}

/**
 * Galería de fotos para una herramienta. Soporta múltiples imágenes.
 * - Click sobre una miniatura → abre la foto en tamaño completo.
 * - Botón ✕ por foto → borra (soft delete).
 * - Botón "＋ Subir foto" → file input (acepta múltiples).
 *
 * Si `herramientaId` es null avisa que hay que guardar la herramienta
 * primero (la tabla herramienta_fotos requiere FK).
 */
export function HerramientaFotosSection({ herramientaId, readOnly = false }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('herramientas')

  const { data: fotos = [], isLoading } = useHerramientaFotos(herramientaId)
  const { mutate: uploadFoto, isPending: uploading } = useUploadHerramientaFoto()
  const { mutate: deleteFoto } = useDeleteHerramientaFoto(herramientaId ?? 0)

  // Map fotoId → URL firmada. Las URLs caducan a los 15 min, refrescamos
  // si se quedan sin uso por más tiempo.
  const [urls, setUrls] = useState<Record<number, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const ids = fotos.map(f => f.id).filter(id => !urls[id])
      if (ids.length === 0) return
      const entries = await Promise.all(ids.map(async id => {
        try {
          const url = await fetchHerramientaFotoUrl(id)
          return [id, url] as const
        } catch {
          return [id, ''] as const
        }
      }))
      if (cancelled) return
      setUrls(prev => {
        const next = { ...prev }
        for (const [id, url] of entries) if (url) next[id] = url
        return next
      })
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos.map(f => f.id).join(',')])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!herramientaId) return
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    files.forEach((file, idx) => {
      uploadFoto(
        { herramientaId, file, orden: (fotos.length + idx) * 10 },
        {
          onError: (err: any) => {
            const msg = err?.message ?? 'Error al subir foto'
            toast(msg.includes('FOTO_DUPLICADA') ? `${file.name}: ya estaba cargada` : `${file.name}: ${msg}`, 'err')
          },
        },
      )
    })
    // Limpiamos el input para que se pueda subir el mismo archivo si se
    // borra y se quiere volver a cargar.
    e.target.value = ''
  }

  function handleBorrar(fotoId: number) {
    if (!confirm('¿Borrar esta foto?')) return
    deleteFoto(fotoId, {
      onSuccess: () => toast('✓ Foto eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  if (!herramientaId) {
    return (
      <div className="text-xs text-gris-dark italic bg-amarillo-light/40 border border-amarillo/30 rounded-lg p-3">
        Guardá la herramienta primero — después podés subir fotos desde el modo edición.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">📷 Fotos</h3>
        {puedeCrear && !readOnly && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-naranja text-white hover:bg-naranja-dark transition-colors disabled:opacity-60"
            >
              {uploading ? '⏳ Subiendo…' : '＋ Subir foto'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando fotos…</div>
      ) : fotos.length === 0 ? (
        <div className="text-xs text-gris-dark italic bg-gris/30 rounded-lg p-4 text-center">
          Sin fotos cargadas todavía.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {fotos.map(f => {
            const url = urls[f.id]
            return (
              <div
                key={f.id}
                className="relative group bg-gris rounded-lg overflow-hidden border border-gris-mid aspect-square"
              >
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block w-full h-full">
                    <img
                      src={url}
                      alt={f.descripcion ?? `Foto #${f.id}`}
                      className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gris-mid text-xs">
                    Cargando…
                  </div>
                )}
                {puedeEliminar && !readOnly && (
                  <button
                    onClick={() => handleBorrar(f.id)}
                    title="Borrar foto"
                    className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 hover:bg-rojo transition-all"
                  >
                    ✕
                  </button>
                )}
                {f.descripcion && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
                    {f.descripcion}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && fotos.length > 0 && (
        <div className="text-[11px] text-gris-dark">
          {fotos.length} foto{fotos.length === 1 ? '' : 's'} · Click para abrir en grande
        </div>
      )}
    </div>
  )
}
