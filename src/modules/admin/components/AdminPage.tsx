'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { UsuariosTab } from '@/modules/configuracion/components/UsuariosTab'
import { PlantillasTab } from './PlantillasTab'
import { AuditoriaTab } from './AuditoriaTab'

const TABS = [
  { key: 'usuarios',   icon: '👥', label: 'Usuarios y permisos', sub: 'Gestión de cuentas, roles y accesos' },
  { key: 'plantillas', icon: '🎭', label: 'Plantillas de roles', sub: 'Detalle de los presets de permisos disponibles' },
  { key: 'auditoria',  icon: '📋', label: 'Auditoría',           sub: 'Registro de actividad de usuarios' },
]

export function AdminPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedTabs = useTabsPermitidos('admin')
  const tab = searchParams.get('tab') ?? 'usuarios'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      router.replace(`/admin?tab=${allowedTabs[0]}`)
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
        {tab === 'usuarios'   && <UsuariosTab />}
        {tab === 'plantillas' && <PlantillasTab />}
        {tab === 'auditoria'  && <AuditoriaTab />}
      </div>
    </div>
  )
}
