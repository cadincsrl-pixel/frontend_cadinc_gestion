'use client'

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
}

/**
 * Galería en modo cola: el row de herramienta todavía no existe, así que
 * juntamos archivos en estado local y los subimos cuando el parent crea
 * la herramienta. Previews vía URL.createObjectURL (se revocan al borrar
 * o al desmontar).
 */
export function HerramientaFotosCola({ files, onChange }: Props) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of files) {
      const key = `${f.name}_${f.size}_${f.lastModified}`
      next[key] = previews[key] ?? URL.createObjectURL(f)
    }
    // Revocar previews que ya no están.
    for (const [key, url] of Object.entries(previews)) {
      if (!next[key]) URL.revokeObjectURL(url)
    }
    setPreviews(next)
    return () => {
      // Cleanup al unmount.
      for (const url of Object.values(next)) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map(f => `${f.name}_${f.size}_${f.lastModified}`).join('|')])

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const seleccionados = Array.from(e.target.files ?? [])
    if (seleccionados.length === 0) return
    const validos: File[] = []
    for (const f of seleccionados) {
      if (f.size > 5 * 1024 * 1024) {
        toast(`${f.name}: supera los 5 MB`, 'err')
        continue
      }
      validos.push(f)
    }
    onChange([...files, ...validos])
    e.target.value = ''
  }

  function handleRemove(idx: number) {
    onChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">
          📷 Fotos {files.length > 0 && <span className="text-gris-dark font-normal">({files.length} en cola)</span>}
        </h3>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-naranja text-white hover:bg-naranja-dark transition-colors"
        >
          ＋ Agregar foto
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={handleSelect}
        />
      </div>

      {files.length === 0 ? (
        <div className="text-xs text-gris-dark italic bg-gris/30 rounded-lg p-4 text-center">
          Agregá fotos ahora — se suben automáticamente al guardar.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {files.map((f, idx) => {
            const key = `${f.name}_${f.size}_${f.lastModified}`
            const url = previews[key]
            return (
              <div
                key={`${key}_${idx}`}
                className="relative group bg-gris rounded-lg overflow-hidden border border-gris-mid aspect-square"
              >
                {url ? (
                  <img
                    src={url}
                    alt={f.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gris-mid text-xs">
                    …
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  title="Quitar de la cola"
                  className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 hover:bg-rojo transition-all"
                >
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
                  {f.name}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="text-[11px] text-gris-dark italic">
          Las fotos se suben después de guardar la herramienta.
        </div>
      )}
    </div>
  )
}
