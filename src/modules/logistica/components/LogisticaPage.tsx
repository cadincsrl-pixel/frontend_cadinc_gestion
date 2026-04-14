'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTramos, useChoferes, useCamiones } from '../hooks/useLogistica'
import { ViajesTab }        from './ViajesTab'
import { LiquidacionesTab } from './LiquidacionesTab'
import { ChoferesTab }      from './ChoferesTab'
import { CamionesTab }      from './CamionesTab'
import { LugaresTab }       from './LugaresTab'
import { FacturacionTab }   from './FacturacionTab'

const TAB_TITLES: Record<string, { icon: string; label: string; sub: string }> = {
  viajes:        { icon: '🚛', label: 'Tramos',        sub: 'Viajes cargados y vacíos'              },
  liquidaciones: { icon: '💰', label: 'Liquidaciones', sub: 'Pago por días trabajados + km'         },
  choferes:      { icon: '👷', label: 'Choferes',      sub: 'Personal de conducción'                },
  camiones:      { icon: '🚚', label: 'Camiones',      sub: 'Flota de vehículos'                    },
  lugares:       { icon: '📍', label: 'Lugares',       sub: 'Canteras · Descargas · Relevos'        },
  facturacion:   { icon: '🧾', label: 'Facturación',   sub: 'Cobros a empresas transportistas'         },
}

function LogisticaContent() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'viajes') as keyof typeof TAB_TITLES
  const info = TAB_TITLES[tab] ?? TAB_TITLES['viajes']

  const { data: tramos   = [] } = useTramos()
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()

  const cargas    = tramos.filter((t: any) => t.tipo === 'carga').length
  const descargas = tramos.filter((t: any) => t.tipo === 'descarga').length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
        {tab === 'viajes' && (
          <div className="flex gap-3 mt-3 flex-wrap">
            <Stat value={cargas}    label="Cargas"    color="orange" />
            <Stat value={descargas} label="Descargas" color="green"  />
            <Stat value={choferes.filter(c => c.estado === 'activo').length} label="Choferes activos" color="blue" />
            <Stat value={camiones.filter(c => c.estado === 'activo').length} label="Camiones activos" color="blue" />
          </div>
        )}
      </div>

      {/* Contenido según tab */}
      {tab === 'viajes'        && <ViajesTab />}
      {tab === 'liquidaciones' && <LiquidacionesTab />}
      {tab === 'choferes'      && <ChoferesTab />}
      {tab === 'camiones'      && <CamionesTab />}
      {tab === 'lugares'       && <LugaresTab />}
      {tab === 'facturacion'   && <FacturacionTab />}

    </div>
  )
}

export function LogisticaPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gris-dark">Cargando…</div>}>
      <LogisticaContent />
    </Suspense>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  const colors = {
    orange: 'bg-naranja-light text-naranja-dark',
    green:  'bg-verde-light text-verde',
    blue:   'bg-azul-light text-azul-mid',
  }
  return (
    <div className={`rounded-lg px-3 py-1.5 ${colors[color as keyof typeof colors]}`}>
      <span className="font-mono font-bold">{value}</span>
      <span className="text-xs ml-1.5 font-semibold opacity-80">{label}</span>
    </div>
  )
}