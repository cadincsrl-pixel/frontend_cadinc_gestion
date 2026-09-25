'use client'

import type { PagosAdjuntoPendiente } from '@/types/domain.types'

/**
 * Un comprobante aparte que se subió ANTES de pasar la forma a cheque/e-cheq
 * (20260929w). Con cheques el comprobante es el de cada cheque, así que éste
 * NO se manda; queda guardado por si se vuelve a transferencia, y si no se usa
 * se borra al registrar o al cerrar. Se avisa para que no se pierda en
 * silencio: si era el PDF del e-cheq, va en la fila del cheque.
 */
export function ComprobanteQueNoViaja({ comprobante, onQuitar }: { comprobante: PagosAdjuntoPendiente; onQuitar: () => void }) {
  return (
    <div className="text-[11px] text-[#7A5000] bg-amarillo-light border border-amarillo/40 rounded px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
      <span>
        ⚠ Subiste un comprobante aparte (<b className="font-semibold">{comprobante.nombre_archivo}</b>). Con cheque o e-cheq
        no se usa: el comprobante va en cada cheque. Si era el de un cheque, subilo en su fila.
      </span>
      <button type="button" onClick={onQuitar} className="text-rojo hover:underline font-semibold">Quitar</button>
    </div>
  )
}
