'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useOrden } from '../hooks/usePagos'
import { ModalAvisarPago } from './ModalAvisarPago'

/**
 * «¿Le avisás al proveedor ahora?» (2026-09-23). Pedido del dueño: que el
 * aviso por mail se ofrezca en el momento, apenas el pago tiene su
 * comprobante — al registrarlo, o al subirle el comprobante después. Sigue
 * siendo una pregunta, no un envío automático: un mail con datos de pago no se
 * desmanda, y el modal del aviso muestra antes a qué dirección va.
 */
export function PreguntarAvisoPago({ ordenId, titulo, onClose }: {
  ordenId: number
  /** Lo que acaba de pasar: «Pago registrado», «Comprobante subido». */
  titulo: string
  onClose: () => void
}) {
  const { data: orden } = useOrden(ordenId)
  const [avisar, setAvisar] = useState(false)

  if (avisar && orden) return <ModalAvisarPago orden={orden} onClose={onClose} />

  return (
    <Modal open onClose={onClose} width="max-w-md" title={`${titulo}${orden ? ` · ${orden.numero_fmt}` : ''}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Ahora no</Button>
          <Button size="sm" onClick={() => setAvisar(true)} disabled={!orden} loading={!orden}>✉ Avisar ahora</Button>
        </div>
      }>
      <div className="text-sm flex flex-col gap-2">
        <p><b>¿Le avisás al proveedor por mail ahora?</b></p>
        <p className="text-xs text-gris-dark">
          Se le manda el comprobante del pago{orden ? ` a ${orden.proveedor_nom}` : ''}, y al contador el par completo
          (comprobante y facturas). Antes de enviar ves a qué dirección va. Si no, se puede avisar después desde la orden.
        </p>
      </div>
    </Modal>
  )
}
