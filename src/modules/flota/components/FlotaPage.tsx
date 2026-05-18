'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { VehiculosTab } from './VehiculosTab'
import { ServiciosTab } from './ServiciosTab'
import { GastosTab }    from './GastosTab'
import { ParametrosTab } from './ParametrosTab'
import { FlotaNotificacionesSection } from './FlotaNotificacionesSection'

const TABS = [
  { key: 'vehiculos',  icon: '🚙', label: 'Vehículos',  sub: 'Flota interna de CADINC' },
  { key: 'servicios',  icon: '🔧', label: 'Servicios',  sub: 'Historial de services de mantenimiento' },
  { key: 'gastos',     icon: '💸', label: 'Gastos',     sub: 'Combustible, peajes, lavado y otros gastos por vehículo' },
  { key: 'parametros', icon: '⚙️', label: 'Parámetros', sub: 'Catálogo de tipos de servicio y reglas' },
]

export function FlotaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedTabs = useTabsPermitidos('flota')
  const tab = searchParams.get('tab') ?? 'vehiculos'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/flota?tab=${allowedTabs[0]}`)
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

      {/* Notificaciones locales del módulo (papeles vencidos / por vencer) */}
      {tab === 'vehiculos' && <FlotaNotificacionesSection />}

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {tab === 'vehiculos'  && <VehiculosTab />}
        {tab === 'servicios'  && <ServiciosTab />}
        {tab === 'gastos'     && <GastosTab />}
        {tab === 'parametros' && <ParametrosTab />}
      </div>
    </div>
  )
}
