'use client'

import { useSearchParams } from 'next/navigation'
import { MovimientosTab }  from './MovimientosTab'
import { ResumenTab }      from './ResumenTab'
import { ConfiguracionTab } from './ConfiguracionTab'

const TABS = [
  { key: 'movimientos',  icon: '💵', label: 'Movimientos',  sub: 'Ingresos y egresos de efectivo' },
  { key: 'resumen',      icon: '📊', label: 'Resumen',      sub: 'Totales por período'             },
  { key: 'configuracion',icon: '⚙️', label: 'Configuración',sub: 'Conceptos y centros de costo'   },
]

export function CajaPage() {
  const searchParams = useSearchParams()
  const tab  = searchParams.get('tab') ?? 'movimientos'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-verde">
        <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      {tab === 'movimientos'   && <MovimientosTab />}
      {tab === 'resumen'       && <ResumenTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
    </div>
  )
}
