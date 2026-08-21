'use client'

import { estadoVencimiento } from '../utils/docs-vigentes'

// Chip de vencimiento de RTO/VTV: rojo vencida, ámbar ≤30 días, gris normal.
// La campana de notificaciones ya avisa estos vencimientos; esto los pone
// de frente en los listados de camiones y bateas.
export function RtoChip({ venceEl }: { venceEl: string | null | undefined }) {
  const { estado, dias } = estadoVencimiento(venceEl)
  if (estado === 'sin_doc' || !venceEl) return <span className="text-xs text-gris-mid">— sin RTO</span>
  const fecha = new Date(venceEl + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  if (estado === 'vencido') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rojo-light text-rojo">
        ⚠ VENCIDA {fecha}
      </span>
    )
  }
  if (estado === 'por_vencer') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-naranja-light text-naranja-dark">
        ⏳ {dias === 0 ? 'vence HOY' : dias === 1 ? 'vence mañana' : `vence en ${dias} días`} · {fecha}
      </span>
    )
  }
  return <span className="text-xs font-mono text-gris-dark">{fecha}</span>
}
