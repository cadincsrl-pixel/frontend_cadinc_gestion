'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { MovimientoArido } from '../types'
import { textoRemitoVenta, imprimirRemitoVenta } from '../utils/remito-venta'

// Vista/export del remito de venta ya emitido (no muta nada).
// Toggle "con precios": remito de entrega clásico vs comprobante con importes.
export function RemitoVentaModal({ venta, onClose }: {
  venta: MovimientoArido | null
  onClose: () => void
}) {
  const toast = useToast()
  const [conPrecios, setConPrecios] = useState(true)

  const texto = venta ? textoRemitoVenta(venta, conPrecios) : ''

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
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
  }

  function handleDescargar() {
    if (!venta || !texto) return
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `remito-${venta.remito_numero}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open={!!venta}
      onClose={onClose}
      title={venta?.remito_numero ? `🧾 ${venta.remito_numero}` : '🧾 Remito'}
      width="max-w-lg"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      {venta && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Vista previa</span>
            <label className="flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
              <input type="checkbox" checked={conPrecios} onChange={e => setConPrecios(e.target.checked)} className="accent-azul" />
              Mostrar precios
            </label>
          </div>
          <pre className="bg-gris/40 border border-gris-mid rounded-lg p-3 text-xs font-mono text-carbon whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
            {texto}
          </pre>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button variant="primary" size="sm" onClick={() => imprimirRemitoVenta(venta, conPrecios)}>
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
        </div>
      )}
    </Modal>
  )
}
