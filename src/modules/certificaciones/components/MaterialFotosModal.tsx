'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useStockFotos, useUploadStockFoto, useDeleteStockFoto, useReordenarStockFotos } from '../hooks/useStockFotos'

/**
 * Galería de fotos de una ficha del catálogo (20260912g). Para que el que pide
 * o el que compra sepa si "eso" es lo que quiere. La primera foto es la
 * principal: es la que se ve en el selector del pedido y en el catálogo.
 */
interface Props {
  material:    { id: number; nombre: string } | null
  onClose:     () => void
  /** Subir, sacar y reordenar. Sin permiso se ve la galería nada más. */
  puedeEditar: boolean
}

export function MaterialFotosModal({ material, onClose, puedeEditar }: Props) {
  const toast = useToast()
  const materialId = material?.id ?? null
  const { data: fotos = [], isLoading } = useStockFotos(materialId)
  const { mutateAsync: subir, isPending: subiendo } = useUploadStockFoto()
  const { mutate: borrar, isPending: borrando } = useDeleteStockFoto(materialId)
  const { mutate: reordenar, isPending: reordenando } = useReordenarStockFotos(materialId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [grande, setGrande] = useState<string | null>(null)
  const ocupado = subiendo || borrando || reordenando

  async function onArchivos(files: FileList | null) {
    if (!files || !materialId) return
    let ok = 0, fallidas = 0
    for (const file of Array.from(files)) {
      try { await subir({ materialId, file }); ok++ }
      catch (e) {
        fallidas++
        const msg = e instanceof Error ? e.message : ''
        toast(/FOTO_DUPLICADA/.test(msg) ? `${file.name}: esa foto ya está en la ficha` : `${file.name}: ${msg || 'no se pudo subir'}`, 'err')
      }
    }
    if (ok > 0) toast(`✓ ${ok} foto${ok !== 1 ? 's' : ''} subida${ok !== 1 ? 's' : ''}`, 'ok')
    if (fileRef.current) fileRef.current.value = ''
    void fallidas
  }

  function hacerPrincipal(id: number) {
    reordenar([id, ...fotos.filter(f => f.id !== id).map(f => f.id)], {
      onSuccess: () => toast('Foto principal cambiada', 'ok'),
      onError:   () => toast('No se pudo cambiar la principal', 'err'),
    })
  }

  function sacar(id: number) {
    if (!confirm('¿Sacar esta foto de la ficha?')) return
    borrar(id, {
      onSuccess: () => toast('Foto sacada', 'ok'),
      onError:   () => toast('No se pudo sacar la foto', 'err'),
    })
  }

  return (
    <Modal open={!!material} onClose={onClose} title={`📷 ${material?.nombre ?? ''}`} width="max-w-2xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        {puedeEditar && (
          <Button variant="primary" loading={subiendo} onClick={() => fileRef.current?.click()}>+ Subir fotos</Button>
        )}
      </>}>
      <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={e => onArchivos(e.target.files)} />
      {grande && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setGrande(null)}>
          <img src={grande} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gris-dark">
          La primera foto es la <b>principal</b>: es la que se ve al elegir el material en un pedido y en el catálogo.
          {puedeEditar ? ' Hasta 5 MB por foto; JPG, PNG, WEBP o HEIC.' : ''}
        </p>
        {isLoading && <div className="text-sm text-gris-dark">Cargando…</div>}
        {!isLoading && fotos.length === 0 && (
          <div className="border-2 border-dashed border-gris-mid rounded-xl px-4 py-8 text-center text-sm text-gris-dark">
            Esta ficha todavía no tiene fotos.
            {puedeEditar && <div className="mt-2"><Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Subir la primera</Button></div>}
          </div>
        )}
        {fotos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fotos.map((f, i) => (
              <figure key={f.id} className={`relative rounded-xl overflow-hidden border-[1.5px] ${i === 0 ? 'border-azul' : 'border-gris-mid'} bg-gris/30`}>
                <button type="button" onClick={() => setGrande(f.url)} className="block w-full aspect-square cursor-zoom-in" title="Ver grande">
                  <img src={f.url} alt={f.descripcion ?? material?.nombre ?? ''} loading="lazy" className="w-full h-full object-cover" />
                </button>
                {i === 0 && <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wider bg-azul text-white px-1.5 py-0.5 rounded">Principal</span>}
                {puedeEditar && (
                  <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white text-[11px]">
                    {i === 0
                      ? <span className="text-gris-dark">principal</span>
                      : <button type="button" disabled={ocupado} onClick={() => hacerPrincipal(f.id)} className="font-bold text-azul hover:underline disabled:opacity-50">Hacer principal</button>}
                    <button type="button" disabled={ocupado} onClick={() => sacar(f.id)} className="font-bold text-gris-dark hover:text-rojo disabled:opacity-50">Sacar</button>
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
