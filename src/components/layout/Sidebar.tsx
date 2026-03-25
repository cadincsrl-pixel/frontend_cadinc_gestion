'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useSessionStore } from '@/store/session.store'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

// Todos los items con su módulo requerido
const NAV_ITEMS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard', meta: 'Resumen y gráficos', exact: false, modulo: 'tarja' },
  { href: '/tarja', icon: '📋', label: 'Tarja', meta: 'Control de horas', exact: false, modulo: 'tarja' },
  { href: '/horas-trabajador', icon: '👤', label: 'Horas x Trabajador', meta: 'Historial individual', exact: false, modulo: 'tarja' },
  { href: '/personal', icon: '👷', label: 'Personal', meta: 'Gestión de nómina', exact: false, modulo: 'tarja' },
  { href: '/herramientas', icon: '🔧', label: 'Herramientas', meta: 'Control de equipos', exact: false, modulo: 'herramientas' },
  { href: '/configuracion', icon: '⚙️', label: 'Configuración', meta: 'Categorías y tarifas', exact: false, modulo: 'tarja' },
  { href: '/tarja/archivadas', icon: '📦', label: 'Obras archivadas', meta: 'Historial de obras', exact: true, modulo: 'tarja' },
]
export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const decodedPathname = decodeURIComponent(pathname)
  const { data: obras = [] } = useObras()
  const hasModulo = useSessionStore(s => s.hasModulo)
  const isAdmin = useSessionStore(s => s.isAdmin)

  // Filtrar items según módulos del usuario
  const navItems = NAV_ITEMS.filter(item => hasModulo(item.modulo))

  function navigate(href: string) {
    router.push(href)
    onClose?.()
  }

  function isActive(item: typeof NAV_ITEMS[0]) {
    if (item.exact) return decodedPathname === item.href
    if (item.href === '/tarja') {
      return decodedPathname.startsWith('/tarja') && decodedPathname !== '/tarja/archivadas'
    }
    return decodedPathname.startsWith(item.href)
  }

  const showObras = decodedPathname.startsWith('/tarja') && decodedPathname !== '/tarja/archivadas'

  return (
    <>
      {open !== undefined && open && (
        <div
          className="fixed inset-0 z-[150] bg-azul/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        bg-azul flex flex-col overflow-y-auto pb-6
        ${open !== undefined
          ? `fixed top-[54px] left-0 h-[calc(100dvh-54px)] w-[280px] z-[160] transition-transform duration-250
             ${open ? 'translate-x-0' : '-translate-x-full'}`
          : 'relative h-full'
        }
      `}>

        {/* Nav items */}
        <div className="pt-3">
          <div className="px-4 py-2 text-[10px] font-bold tracking-[2.5px] uppercase text-white/35">
            Módulos
          </div>
          {navItems.map(item => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
                text-left transition-all border border-transparent
                ${isActive(item)
                  ? 'bg-naranja text-white border-naranja-dark shadow-[0_4px_14px_rgba(232,98,26,.4)]'
                  : 'text-white hover:bg-white hover:text-black'
                }
              `}
              style={{ width: 'calc(100% - 16px)' }}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{item.label}</div>
                <div className="text-[11px] opacity-60 font-normal">{item.meta}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Obras activas — solo en módulo tarja */}
        {showObras && hasModulo('tarja') && (
          <div className="mt-4">
            <div className="px-4 py-2 text-[10px] font-bold tracking-[2.5px] uppercase text-white/35">
              Obras activas
            </div>

            {obras.map(obra => (
              <button
                key={obra.cod}
                onClick={() => navigate(`/tarja/${encodeURIComponent(obra.cod)}`)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
                  text-left transition-all border border-transparent
                  ${decodedPathname === `/tarja/${obra.cod}`
                    ? 'bg-naranja text-white border-naranja-dark shadow-[0_4px_14px_rgba(232,98,26,.4)]'
                    : 'text-white hover:bg-white hover:text-black'
                  }
                `}
                style={{ width: 'calc(100% - 16px)' }}
              >
                <span className="text-base w-5 text-center flex-shrink-0">🏗</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{obra.nom}</div>
                  <div className="text-[11px] opacity-60 font-mono">{obra.cod}</div>
                </div>
                <span className="text-[10px] font-mono bg-white/14 px-1.5 py-0.5 rounded flex-shrink-0">
                  {obra.cod}
                </span>
              </button>
            ))}

            <button
              onClick={() => navigate('/tarja')}
              className="w-full flex items-center gap-2 px-3 py-2 mx-2 rounded-[9px] border-[1.5px] border-dashed border-white/20 text-white/40 hover:border-naranja hover:text-naranja transition-all text-sm font-semibold mt-10"
              style={{ width: 'calc(100% - 16px)' }}
            >
              <span>＋</span>
              <span>Nueva obra</span>
            </button>
          </div>
        )}

        {/* Info usuario */}
        <div className="mt-auto px-4 pt-4 border-t border-white/10">
          <UserInfo />
        </div>

      </aside>
    </>
  )
}

function UserInfo() {
  const profile = useSessionStore(s => s.profile)
  const email = useSessionStore(s => s.email)
  if (!profile) return null

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-full bg-naranja flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {profile.nombre.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-white text-xs font-bold truncate">{profile.nombre}</div>
        <div className="text-white/40 text-[10px] truncate">{email}</div>
        <div className="text-white/30 text-[10px] font-semibold uppercase tracking-wide">
          {profile.rol === 'admin' ? '⭐ Admin' : 'Operador'}
        </div>
      </div>
    </div>
  )
}