'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useObras }        from '@/modules/tarja/hooks/useObras'
import { useSessionStore } from '@/store/session.store'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

const NAV_ITEMS_TARJA = [
  { href: '/tarja',            icon: '📋', label: 'Tarja',              meta: 'Control de horas',     exact: false },
  { href: '/dashboard', icon: '📊', label: 'Resumen General', meta: 'Resumen general e histórico', exact: false },
  { href: '/horas-trabajador',  icon: '👤', label: 'Horas x Trabajador', meta: 'Historial individual', exact: false },
  { href: '/tarja/prestamos',  icon: '💵', label: 'Préstamos',          meta: 'Préstamos y descuentos',  exact: false },
  { href: '/tarja/ropa',       icon: '👕', label: 'Ropa de trabajo',    meta: 'Control de entregas',     exact: false },
  { href: '/personal',         icon: '👷', label: 'Personal',           meta: 'Gestión de nómina',       exact: false },
  { href: '/configuracion',    icon: '⚙️', label: 'Configuración',      meta: 'Categorías y tarifas', exact: false },
  { href: '/tarja/archivadas', icon: '📦', label: 'Obras archivadas',   meta: 'Historial de obras',   exact: true  },
]

const NAV_ITEMS_LOGISTICA = [
  { href: '/logistica',              icon: '🚛', label: 'Viajes',         meta: 'Tramos cargados y vacíos'   },
  { href: '/logistica/liquidaciones',icon: '💰', label: 'Liquidaciones',  meta: 'Pago a choferes'            },
  { href: '/logistica/facturacion',  icon: '🧾', label: 'Facturación',    meta: 'Cobro por tonelada'         },
  { href: '/logistica/choferes',     icon: '👷', label: 'Choferes',       meta: 'Personal de conducción'     },
  { href: '/logistica/camiones',     icon: '🚚', label: 'Camiones',       meta: 'Flota de vehículos'         },
  { href: '/logistica/empresas',     icon: '🏢', label: 'Empresas',       meta: 'Clientes / canteras'        },
  { href: '/logistica/lugares',      icon: '📍', label: 'Lugares',        meta: 'Canteras · Descargas · Relevos' },
  { href: '/logistica/rutas',        icon: '🗺️', label: 'Rutas & Km',     meta: 'Distancias entre puntos'    },
]

const HERR_SUBNAV = [
  { href: '/herramientas/inventario',   icon: '🔧', label: 'Inventario',   meta: 'Catálogo de herramientas'  },
  { href: '/herramientas/movimientos',  icon: '↔',  label: 'Movimientos',  meta: 'Registrar traslados'       },
  { href: '/herramientas/trazabilidad', icon: '📍', label: 'Trazabilidad', meta: 'Historial por herramienta' },
  { href: '/herramientas/remitos',      icon: '📄', label: 'Remitos',      meta: 'Emisión de remitos'        },
  { href: '/herramientas/parametros',   icon: '⚙️', label: 'Parámetros',   meta: 'Tipos y configuración'     },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname        = usePathname()
  const router          = useRouter()
  const decodedPathname = decodeURIComponent(pathname)
  const { data: obras = [] } = useObras()
  const hasModulo = useSessionStore(s => s.hasModulo)
  const profile   = useSessionStore(s => s.profile)

  const enHerramientas = decodedPathname.startsWith('/herramientas')
  const enLogistica    = decodedPathname.startsWith('/logistica')

  function navigate(href: string) {
    router.push(href)
    onClose?.()
  }

  function isActiveTarja(item: typeof NAV_ITEMS_TARJA[0]) {
    if (item.exact) return decodedPathname === item.href
    if (item.href === '/tarja') {
      return decodedPathname.startsWith('/tarja') &&
             decodedPathname !== '/tarja/archivadas' &&
             !decodedPathname.startsWith('/tarja/prestamos') &&
             !decodedPathname.startsWith('/tarja/ropa')
    }
    return decodedPathname.startsWith(item.href)
  }

  function isActiveHerr(href: string) {
    if (href === '/herramientas') return decodedPathname === '/herramientas'
    return decodedPathname.startsWith(href)
  }

  const showObrasSubnav =
    !enHerramientas &&
    !enLogistica &&
    decodedPathname.startsWith('/tarja') &&
    decodedPathname !== '/tarja/archivadas'

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

        {/* ── Nav principal ── */}
        <div className="pt-3">
          <div className="px-4 py-2 text-[10px] font-bold tracking-[2.5px] uppercase text-white/35">
            {enHerramientas ? 'Herramientas' : enLogistica ? 'Logística' : 'Menú'}
          </div>

          {/* LOGÍSTICA nav */}
          {enLogistica && NAV_ITEMS_LOGISTICA.map(item => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
                text-left transition-all border border-transparent
                ${decodedPathname === item.href || (item.href !== '/logistica' && decodedPathname.startsWith(item.href))
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

          {/* TARJA nav — solo si NO estamos en herramientas ni logística */}
          {!enHerramientas && !enLogistica && NAV_ITEMS_TARJA.map(item => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
                text-left transition-all border border-transparent
                ${isActiveTarja(item)
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

          {/* HERRAMIENTAS nav — solo si estamos en herramientas */}
          {enHerramientas && HERR_SUBNAV.map(item => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
                text-left transition-all border border-transparent
                ${isActiveHerr(item.href)
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

        {/* ── Botón cambiar módulo ── */}
        <div className="px-3 mt-3">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[9px] border-[1.5px] border-dashed border-white/20 text-white/40 hover:border-white/50 hover:text-white/70 transition-all text-sm font-semibold"
          >
            <span>⇐</span>
            <span>Cambiar módulo</span>
          </button>
        </div>

        {/* ── Info usuario ── */}
        <div className="mt-auto px-4 pt-4 border-t border-white/10">
          <UserInfo />
        </div>

      </aside>
    </>
  )
}

function UserInfo() {
  const profile = useSessionStore(s => s.profile)
  const email   = useSessionStore(s => s.email)
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