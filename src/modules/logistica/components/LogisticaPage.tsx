'use client'

import { useState } from 'react'
import { useViajes, useChoferes, useCamiones, useDeleteViaje } from '../hooks/useLogistica'
import { ViajesTab } from './ViajesTab'
import { LiquidacionesTab } from './LiquidacionesTab'
import { ChoferesTab } from './ChoferesTab'
import { CamionesTab } from './CamionesTab'
import { LugaresTab } from './LugaresTab'


type Tab = 'viajes' | 'liquidaciones' | 'choferes' | 'camiones' | 'lugares'

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'viajes',        icon: '🚛', label: 'Tramos'        },
  { id: 'liquidaciones', icon: '💰', label: 'Liquidaciones'  },
  { id: 'choferes',      icon: '👷', label: 'Choferes'       },
  { id: 'camiones',      icon: '🚚', label: 'Camiones'       },
  { id: 'lugares',       icon: '📍', label: 'Lugares'        },
]

export function LogisticaPage() {
  const [tab, setTab] = useState<Tab>('viajes')
  const { data: viajes = [] } = useViajes()
  const { data: choferes = [] } = useChoferes()
  const { data: camiones = [] } = useCamiones()

  const enCurso    = viajes.filter(v => v.estado === 'en_curso').length
  const completados = viajes.filter(v => v.estado === 'completado').length

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
          LOGÍSTICA
        </h1>
        <p className="text-sm text-gris-dark mt-1">
          Control de viajes, choferes y liquidaciones
        </p>
        <div className="flex gap-3 mt-3 flex-wrap">
          <Stat value={enCurso}     label="En curso"    color="orange" />
          <Stat value={completados} label="Completados" color="green"  />
          <Stat value={choferes.filter(c => c.estado === 'activo').length} label="Choferes activos" color="blue" />
          <Stat value={camiones.filter(c => c.estado === 'activo').length} label="Camiones activos" color="blue" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-card shadow-card p-1.5 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm
              transition-all whitespace-nowrap flex-shrink-0
              ${tab === t.id
                ? 'bg-azul text-white shadow-sm'
                : 'text-gris-dark hover:bg-gris hover:text-carbon'
              }
            `}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'viajes'        && <ViajesTab />}
      {tab === 'liquidaciones' && <LiquidacionesTab />}
      {tab === 'choferes'      && <ChoferesTab />}
      {tab === 'camiones'      && <CamionesTab />}
      {tab === 'lugares'       && <LugaresTab />}

    </div>
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