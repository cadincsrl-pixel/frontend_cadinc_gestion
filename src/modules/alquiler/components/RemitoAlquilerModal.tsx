'use client'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { RemitoAlquiler } from '../types'
import {
  imprimirRemitoAlquiler,
  textoRemitoAlquiler,
} from '../utils/remito-alquiler'

interface Props {
  open: boolean
  onClose: () => void
  remito: RemitoAlquiler | null
}

// Modal de visualización/export de un remito de alquiler. NO muta nada: el
// remito ya viene emitido. Sirve para imprimir / reenviar / copiar.
export function RemitoAlquilerModal({ open, onClose, remito }: Props) {
  const toast = useToast()

  // El texto se recalcula barato; si no hay remito mostramos vacío.
  const texto = remito ? textoRemitoAlquiler(remito) : ''

  function handleImprimir() {
    if (!remito) return
    imprimirRemitoAlquiler(remito)
  }

  async function handleCopiar() {
    if (!texto) return
    try {
      await navigator.clipboard.writeText(texto)
      toast('✓ Copiado al portapapeles', 'ok')
    } catch {
      toast('No se pudo copiar — seleccioná el texto manualmente', 'err')
    }
  }

  function handleWhatsApp() {
    if (!texto) return
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleDescargar() {
    if (!remito || !texto) return
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `remito-${remito.numero}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={remito ? `🧾 ${remito.numero}` : '🧾 Remito'}
      width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-3">
        {!remito ? (
          <div className="bg-gris/40 border border-gris-mid rounded-lg p-4 text-sm text-gris-dark italic text-center">
            No hay remito para mostrar.
          </div>
        ) : (
          <>
            {/* Vista previa del texto del remito. */}
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Vista previa
            </div>
            <pre className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs font-mono text-carbon whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {texto}
            </pre>

            {/* Botones de export. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button variant="primary" size="sm" onClick={handleImprimir}>
                🖨 Imprimir
              </Button>
              <Button variant="secondary" size="sm" onClick={handleWhatsApp}>
                📱 WhatsApp
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopiar}>
                📋 Copiar
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDescargar}>
                ⬇ .txt
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
