'use client'

import { useMemo } from 'react'
import { useFlotaNotificacionesDocs, type FlotaNotifDoc } from '../hooks/useFlotaNotificaciones'
import { calcularEstadoVencimiento } from '../hooks/useFlotaDocumentos'

const TIPO_LABEL: Record<string, string> = {
  titulo:         'Título',
  tarjeta_verde:  'Tarjeta verde',
  vtv:            'VTV',
  rto:            'RTO',
  poliza_seguro:  'Póliza',
  patente:        'Patente',
  oblea:          'Oblea GNC',
  otro:           'Otro',
}

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

export function FlotaNotificacionesSection({
  onSelectVehiculo,
}: {
  onSelectVehiculo?: (vehiculoId: number) => void
}) {
  const { data: docs = [], isLoading } = useFlotaNotificacionesDocs()

  const { vencidos, porVencer } = useMemo(() => {
    const v: FlotaNotifDoc[] = []
    const p: FlotaNotifDoc[] = []
    for (const d of docs) {
      const { estado } = calcularEstadoVencimiento(d.vence_el)
      if (estado === 'vencido')    v.push(d)
      else if (estado === 'por_vencer') p.push(d)
    }
    v.sort((a, b) => a.vence_el.localeCompare(b.vence_el))
    p.sort((a, b) => a.vence_el.localeCompare(b.vence_el))
    return { vencidos: v, porVencer: p }
  }, [docs])

  if (isLoading) return null
  if (vencidos.length === 0 && porVencer.length === 0) return null

  function renderFila(d: FlotaNotifDoc, kind: 'vencido' | 'por_vencer') {
    const { diasRestantes } = calcularEstadoVencimiento(d.vence_el)
    const cls = kind === 'vencido' ? 'border-rojo' : 'border-naranja'
    const txt = kind === 'vencido'
      ? `Vencido hace ${Math.abs(diasRestantes!)}d`
      : `Vence en ${diasRestantes}d`
    return (
      <button
        key={d.doc_id}
        onClick={() => onSelectVehiculo?.(d.entidad_id)}
        className={`bg-white rounded-lg shadow-sm border-l-4 ${cls} px-3 py-2 text-left flex items-center gap-3 flex-wrap hover:bg-gris/30 transition-colors w-full`}
      >
        <span className="font-mono font-bold text-sm text-carbon shrink-0">{d.entidad_patente}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-azul">
            {TIPO_LABEL[d.tipo] ?? d.tipo}
          </div>
          <div className="text-[11px] text-gris-dark">
            vence {fmtFecha(d.vence_el)}
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${kind === 'vencido' ? 'bg-rojo text-white' : 'bg-naranja text-white'}`}>
          {txt}
        </span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-amarillo">
      <div className="px-4 py-3 bg-amarillo-light/60 border-b border-amarillo/30">
        <h2 className="font-bold text-[#7A5500] text-base">
          🔔 Papeles con vencimiento próximo
        </h2>
        <p className="text-[11px] text-[#7A5500]/80 mt-0.5">
          {vencidos.length} vencido{vencidos.length !== 1 ? 's' : ''} ·
          {' '}{porVencer.length} por vencer en los próximos 30 días
        </p>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {vencidos.map(d => renderFila(d, 'vencido'))}
        {porVencer.map(d => renderFila(d, 'por_vencer'))}
      </div>
    </div>
  )
}
