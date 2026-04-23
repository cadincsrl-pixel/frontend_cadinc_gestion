'use client'

import { Suspense, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useObras }        from '@/modules/tarja/hooks/useObras'
import { useSessionStore } from '@/store/session.store'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

const NAV_ITEMS_CERT = [
  { tab: 'solicitudes', icon: '🛒', label: 'Solicitudes', meta: 'Pedidos de compra y envío'      },
  { tab: 'stock',       icon: '🏗️', label: 'Stock',       meta: 'Stock en depósito'              },
  { tab: 'materiales',  icon: '📦', label: 'Materiales',  meta: 'A cuenta del cliente'           },
]

function CertNav({ navigate, activeTab, allowedTabs }: { navigate: (href: string) => void; activeTab: string; allowedTabs?: string[] }) {
  return (
    <>
      {NAV_ITEMS_CERT.filter(item => !allowedTabs || allowedTabs.includes(item.tab)).map(item => {
        const isActive = activeTab === item.tab
        return (
          <button
            key={item.tab}
            onClick={() => navigate(`/certificaciones?tab=${item.tab}`)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
              text-left transition-all border border-transparent
              ${isActive
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
        )
      })}
    </>
  )
}

function CertNavWithParams({ navigate }: { navigate: (href: string) => void }) {
  const searchParams = useSearchParams()
  const activeTab    = searchParams.get('tab') ?? 'solicitudes'
  const allowedTabs  = useTabsPermitidos('certificaciones')
  return <CertNav navigate={navigate} activeTab={activeTab} allowedTabs={allowedTabs} />
}

const NAV_ITEMS_CAJA = [
  { tab: 'movimientos',   icon: '💵', label: 'Movimientos',   meta: 'Ingresos y egresos'       },
  { tab: 'resumen',       icon: '📊', label: 'Resumen',       meta: 'Totales por período'      },
  { tab: 'configuracion', icon: '⚙️', label: 'Configuración', meta: 'Conceptos y centros'      },
]

function CajaNav({ navigate, activeTab, allowedTabs }: { navigate: (href: string) => void; activeTab: string; allowedTabs?: string[] }) {
  return (
    <>
      {NAV_ITEMS_CAJA.filter(item => !allowedTabs || allowedTabs.includes(item.tab)).map(item => {
        const isActive = activeTab === item.tab
        return (
          <button
            key={item.tab}
            onClick={() => navigate(`/caja?tab=${item.tab}`)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
              text-left transition-all border border-transparent
              ${isActive
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
        )
      })}
    </>
  )
}

function CajaNavWithParams({ navigate }: { navigate: (href: string) => void }) {
  const searchParams = useSearchParams()
  const activeTab    = searchParams.get('tab') ?? 'movimientos'
  const allowedTabs  = useTabsPermitidos('caja')
  return <CajaNav navigate={navigate} activeTab={activeTab} allowedTabs={allowedTabs} />
}

const NAV_ITEMS_TARJA = [
  { href: '/tarja',            icon: '📋', label: 'Tarja',              meta: 'Control de horas',            exact: false, tabKey: 'tarja'            },
  { href: '/dashboard',        icon: '📊', label: 'Resumen General',    meta: 'Resumen general e histórico', exact: false, tabKey: 'dashboard'        },
  { href: '/horas-trabajador', icon: '👤', label: 'Horas x Trabajador', meta: 'Historial individual',        exact: false, tabKey: 'horas-trabajador' },
  { href: '/tarja/prestamos',  icon: '💵', label: 'Préstamos',          meta: 'Préstamos y descuentos',      exact: false, tabKey: 'prestamos'        },
  { href: '/tarja/ropa',       icon: '👕', label: 'Ropa de trabajo',    meta: 'Control de entregas',         exact: false, tabKey: 'ropa'             },
  { href: '/personal',         icon: '👷', label: 'Personal',           meta: 'Gestión de nómina',           exact: false, tabKey: 'personal'         },
  { href: '/tarja/costos',     icon: '📊', label: 'Costos',              meta: 'Operarios y contratistas',    exact: false, tabKey: 'costos'           },
  { href: '/configuracion',    icon: '⚙️', label: 'Configuración',      meta: 'Categorías y tarifas',        exact: false, tabKey: 'configuracion'    },
  { href: '/tarja/archivadas', icon: '📦', label: 'Obras archivadas',   meta: 'Historial de obras',          exact: true,  tabKey: 'archivadas'       },
]

const NAV_ITEMS_LOGISTICA = [
  { tab: 'viajes',        icon: '🚛', label: 'Tramos',        meta: 'Cargados y vacíos'             },
  { tab: 'liquidaciones', icon: '💰', label: 'Liquidaciones', meta: 'Saldo y pago a choferes'       },
  { tab: 'facturacion',   icon: '🧾', label: 'Facturación',   meta: 'Cobros a empresas'              },
  { tab: 'choferes',      icon: '👷', label: 'Choferes',      meta: 'Personal de conducción'        },
  { tab: 'camiones',      icon: '🚚', label: 'Camiones',      meta: 'Flota de vehículos'            },
  { tab: 'lugares',       icon: '📍', label: 'Lugares',       meta: 'Canteras · Depósitos'          },
  { tab: 'gastos',        icon: '💸', label: 'Gastos',        meta: 'Combustible · Gomería · Peajes' },
]

const NAV_ITEMS_ADMIN = [
  { tab: 'usuarios',  icon: '👥', label: 'Usuarios y permisos', meta: 'Cuentas, roles y accesos' },
  { tab: 'auditoria', icon: '📋', label: 'Auditoría',           meta: 'Registro de actividad'    },
]

const HERR_SUBNAV = [
  { href: '/herramientas/inventario',   icon: '🔧', label: 'Inventario',   meta: 'Catálogo de herramientas',  tabKey: 'inventario'   },
  { href: '/herramientas/movimientos',  icon: '↔',  label: 'Movimientos',  meta: 'Registrar traslados',       tabKey: 'movimientos'  },
  { href: '/herramientas/trazabilidad', icon: '📍', label: 'Trazabilidad', meta: 'Historial por herramienta', tabKey: 'trazabilidad' },
  { href: '/herramientas/remitos',      icon: '📄', label: 'Remitos',      meta: 'Emisión de remitos',        tabKey: 'remitos'      },
  { href: '/herramientas/parametros',   icon: '⚙️', label: 'Parámetros',   meta: 'Tipos y configuración',     tabKey: 'parametros'   },
]

function LogisticaNav({ navigate, activeTab, allowedTabs }: { navigate: (href: string) => void; activeTab: string; allowedTabs?: string[] }) {
  return (
    <>
      {NAV_ITEMS_LOGISTICA.filter(item => !allowedTabs || allowedTabs.includes(item.tab)).map(item => {
        const isActive = activeTab === item.tab
        return (
          <button
            key={item.tab}
            onClick={() => navigate(`/logistica?tab=${item.tab}`)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
              text-left transition-all border border-transparent
              ${isActive
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
        )
      })}
    </>
  )
}

function LogisticaNavWithParams({ navigate }: { navigate: (href: string) => void }) {
  const searchParams = useSearchParams()
  const activeTab    = searchParams.get('tab') ?? 'viajes'
  const allowedTabs  = useTabsPermitidos('logistica')
  return <LogisticaNav navigate={navigate} activeTab={activeTab} allowedTabs={allowedTabs} />
}

function AdminNav({ navigate, activeTab, allowedTabs }: { navigate: (href: string) => void; activeTab: string; allowedTabs?: string[] }) {
  return (
    <>
      {NAV_ITEMS_ADMIN.filter(item => !allowedTabs || allowedTabs.includes(item.tab)).map(item => {
        const isActive = activeTab === item.tab
        return (
          <button
            key={item.tab}
            onClick={() => navigate(`/admin?tab=${item.tab}`)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 rounded-[9px]
              text-left transition-all border border-transparent
              ${isActive
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
        )
      })}
    </>
  )
}

function AdminNavWithParams({ navigate }: { navigate: (href: string) => void }) {
  const searchParams = useSearchParams()
  const activeTab    = searchParams.get('tab') ?? 'usuarios'
  const allowedTabs  = useTabsPermitidos('admin')
  return <AdminNav navigate={navigate} activeTab={activeTab} allowedTabs={allowedTabs} />
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname        = usePathname()
  const router          = useRouter()
  const decodedPathname = decodeURIComponent(pathname)
  const { data: obras = [] } = useObras()
  const hasModulo = useSessionStore(s => s.hasModulo)
  const profile   = useSessionStore(s => s.profile)

  const tarjaTabs = useTabsPermitidos('tarja')
  const herrTabs  = useTabsPermitidos('herramientas')
  const enHerramientas     = decodedPathname.startsWith('/herramientas')
  const enLogistica        = decodedPathname.startsWith('/logistica')
  const enCertificaciones  = decodedPathname.startsWith('/certificaciones')
  const enCaja             = decodedPathname.startsWith('/caja')
  const enAdmin            = decodedPathname.startsWith('/admin')

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
             !decodedPathname.startsWith('/tarja/ropa') &&
             !decodedPathname.startsWith('/tarja/costos')
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
    !enCertificaciones &&
    !enCaja &&
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
            {enAdmin ? 'Administración' : enHerramientas ? 'Herramientas' : enLogistica ? 'Logística' : enCertificaciones ? 'Compras y Stock' : enCaja ? 'Caja' : 'Menú'}
          </div>

          {/* LOGÍSTICA nav */}
          {enLogistica && (
            <Suspense fallback={<LogisticaNav navigate={navigate} activeTab="viajes" />}>
              <LogisticaNavWithParams navigate={navigate} />
            </Suspense>
          )}

          {/* CERTIFICACIONES nav */}
          {enCertificaciones && (
            <Suspense fallback={<CertNav navigate={navigate} activeTab="solicitudes" />}>
              <CertNavWithParams navigate={navigate} />
            </Suspense>
          )}

          {/* CAJA nav */}
          {enCaja && (
            <Suspense fallback={<CajaNav navigate={navigate} activeTab="movimientos" />}>
              <CajaNavWithParams navigate={navigate} />
            </Suspense>
          )}

          {/* ADMIN nav */}
          {enAdmin && (
            <Suspense fallback={null}>
              <AdminNavWithParams navigate={navigate} />
            </Suspense>
          )}

          {/* TARJA nav — solo si NO estamos en otros módulos */}
          {!enHerramientas && !enLogistica && !enCertificaciones && !enCaja && !enAdmin && NAV_ITEMS_TARJA.filter(item => tarjaTabs.includes(item.tabKey)).map(item => (
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

          {/* HERRAMIENTAS nav */}
          {enHerramientas && HERR_SUBNAV.filter(item => herrTabs.includes(item.tabKey)).map(item => (
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
  const [showChangePass, setShowChangePass] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [changing, setChanging] = useState(false)
  const [msg, setMsg] = useState('')

  if (!profile) return null

  async function handleChangePassword() {
    if (newPass.length < 6) { setMsg('Mínimo 6 caracteres'); return }
    setChanging(true)
    setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPass })
    setChanging(false)
    if (error) { setMsg(error.message); return }
    setMsg('Contraseña actualizada')
    setNewPass('')
    setTimeout(() => { setShowChangePass(false); setMsg('') }, 2000)
  }

  return (
    <div className="flex flex-col gap-2">
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
      <button
        onClick={() => setShowChangePass(p => !p)}
        className="text-[10px] text-white/30 hover:text-white/60 transition-colors text-left font-semibold"
      >
        🔑 Cambiar contraseña
      </button>
      {showChangePass && (
        <div className="flex flex-col gap-1.5">
          <input
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            placeholder="Nueva contraseña..."
            className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs outline-none focus:border-naranja placeholder:text-white/30"
          />
          <button
            onClick={handleChangePassword}
            disabled={changing}
            className="text-[10px] font-bold bg-naranja text-white px-3 py-1.5 rounded-lg hover:bg-naranja-dark transition-colors disabled:opacity-50"
          >
            {changing ? 'Guardando...' : 'Cambiar'}
          </button>
          {msg && <span className={`text-[10px] font-bold ${msg.includes('actualizada') ? 'text-verde' : 'text-rojo'}`}>{msg}</span>}
        </div>
      )}
    </div>
  )
}