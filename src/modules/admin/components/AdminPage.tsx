'use client'

import { useSearchParams } from 'next/navigation'
import { UsuariosTab } from '@/modules/configuracion/components/UsuariosTab'
import { AuditoriaTab } from './AuditoriaTab'

const TABS = [
  { key: 'usuarios',  icon: '👥', label: 'Usuarios',  sub: 'Gestión de cuentas y roles' },
  { key: 'permisos',  icon: '🔐', label: 'Permisos',  sub: 'Matriz de permisos por usuario' },
  { key: 'auditoria', icon: '📋', label: 'Auditoría', sub: 'Registro de actividad de usuarios' },
]

export function AdminPage() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'usuarios'
  const info = TABS.find(t => t.key === tab) ?? TABS[0]!

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-naranja">
        <h1 className="font-display text-[2rem] tracking-wider text-azul leading-none">
          {info.icon} {info.label.toUpperCase()}
        </h1>
        <p className="text-sm text-gris-dark mt-1">{info.sub}</p>
      </div>

      {/* Contenido */}
      <div className="flex flex-col gap-4">
        {tab === 'usuarios'  && <UsuariosTab />}
        {tab === 'permisos'  && <UsuariosTab />}
        {tab === 'auditoria' && <AuditoriaTab />}
      </div>
    </div>
  )
}
