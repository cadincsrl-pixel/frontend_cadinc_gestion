'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { MaquinasTab } from './MaquinasTab'
import { ObrasTab } from './ObrasTab'
import { PartesTab } from './PartesTab'

const TABS = [
  { key: 'maquinas', icon: '🚜', label: 'Máquinas', sub: 'Flota de maquinaria para alquiler' },
  { key: 'obras',    icon: '🏗', label: 'Obras',    sub: 'Obras de alquiler y máquinas asignadas' },
  { key: 'partes',   icon: '📝', label: 'Partes',   sub: 'Carga de horas por día y por máquina' },
]

export function AlquilerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedTabs = useTabsPermitidos('alquiler')
  const tab = searchParams.get('tab') ?? 'maquinas'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/alquiler?tab=${allowedTabs[0]}`)
    }
  }, [allowedTabs, tab, router])

  if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
    return null
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-2xl sm:text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {tab === 'maquinas' && <MaquinasTab />}
        {tab === 'obras'    && <ObrasTab />}
        {tab === 'partes'   && <PartesTab />}
      </div>
    </div>
  )
}
