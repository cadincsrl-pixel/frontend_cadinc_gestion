'use client'

import { Suspense, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useObras }        from '@/modules/tarja/hooks/useObras'
import { useSessionStore } from '@/store/session.store'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'
import { useNotificaciones } from '@/hooks/useNotificaciones'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

// ── Tabs basados en path absoluto (no ?tab=...) ───────────────────
// Tarja y Herramientas tienen páginas separadas, no son tabs de una sola
// page como certificaciones/caja/etc. Mantienen estructura propia con
// `href`. `tabKey` apunta al permiso correspondiente en `TABS_POR_MODULO`.
const NAV_ITEMS_TARJA = [
  { href: '/tarja',            icon: '📋', label: 'Tarja',              meta: 'Control de horas',            exact: false, tabKey: 'tarja'            },
  { href: '/dashboard',        icon: '📊', label: 'Resumen General',    meta: 'Resumen general e histórico', exact: false, tabKey: 'dashboard'        },
  { href: '/horas-trabajador', icon: '👤', label: 'Horas x Trabajador', meta: 'Historial individual',        exact: false, tabKey: 'horas-trabajador' },
  { href: '/tarja/prestamos',  icon: '💵', label: 'Préstamos',          meta: 'Préstamos y descuentos',      exact: false, tabKey: 'prestamos'        },
  { href: '/tarja/ropa',       icon: '👕', label: 'Ropa de trabajo',    meta: 'Control de entregas',         exact: false, tabKey: 'ropa'             },
  { href: '/personal',         icon: '👷', label: 'Personal',           meta: 'Gestión de nómina',           exact: false, tabKey: 'personal'         },
  { href: '/tarja/costos',     icon: '📊', label: 'Costos',              meta: 'Operarios y contratistas',    exact: false, tabKey: 'costos'           },
  { href: '/configuracion',    icon: '⚙️', label: 'Categorías y tarifas', meta: 'Valor hora por categoría',  exact: false, tabKey: 'configuracion'    },
  { href: '/tarja/archivadas', icon: '📦', label: 'Obras archivadas',   meta: 'Historial de obras',          exact: true,  tabKey: 'archivadas'       },
]

const HERR_SUBNAV = [
  { href: '/herramientas/inventario',   icon: '🔧', label: 'Inventario',   meta: 'Catálogo de herramientas',   tabKey: 'inventario'   },
  { href: '/herramientas/por-obra',     icon: '🏗', label: 'Por obra',     meta: 'Inventario pivotado por obra', tabKey: 'inventario' },
  { href: '/herramientas/movimientos',  icon: '↔',  label: 'Movimientos',  meta: 'Registrar traslados',        tabKey: 'movimientos'  },
  { href: '/herramientas/trazabilidad', icon: '📍', label: 'Trazabilidad', meta: 'Historial por herramienta',  tabKey: 'trazabilidad' },
  { href: '/herramientas/parametros',   icon: '⚙️', label: 'Parámetros',   meta: 'Tipos y configuración',      tabKey: 'parametros'   },
]

// ── ModuloNav genérico para módulos con ?tab=... ──────────────────
// Reemplaza a los antiguos CertNav/LogisticaNav/AdminNav/CajaNav/FlotaNav.
// Toda la info de tabs (label, icon, meta) vive en `TABS_POR_MODULO`. El
// filtrado por permisos viene de `useTabsPermitidos`. Soporta un slot
// opcional `renderBadge` para casos como "Logística > Gastos pendientes".
function ModuloNav({
  modulo,
  basePath,
  defaultTab,
  navigate,
  renderBadge,
}: {
  modulo:      string
  basePath:    string
  defaultTab:  string
  navigate:    (href: string) => void
  renderBadge?: (tabKey: string) => ReactNode
}) {
  const searchParams = useSearchParams()
  const activeTab    = searchParams.get('tab') ?? defaultTab
  const allowedTabs  = useTabsPermitidos(modulo)
  const items        = TABS_POR_MODULO[modulo] ?? []

  return (
    <>
      {items.filter(item => allowedTabs.includes(item.key)).map(item => {
        const isActive = activeTab === item.key
        const badge    = renderBadge?.(item.key)
        return (
          <button
            key={item.key}
            onClick={() => navigate(`${basePath}?tab=${item.key}`)}
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
              <div className="text-sm font-bold truncate flex items-center gap-1.5">
                {item.label}
                {badge}
              </div>
              {item.meta && <div className="text-[11px] opacity-60 font-normal">{item.meta}</div>}
            </div>
          </button>
        )
      })}
    </>
  )
}

// Badge específico de "Logística > Gastos" — lo usa `renderBadge` del ModuloNav.
function GastosPendientesBadge() {
  const { gastosPendientes } = useNotificaciones()
  const n = gastosPendientes.length
  if (n === 0) return null
  return (
    <span
      title={`${n} gasto${n !== 1 ? 's' : ''} pendiente${n !== 1 ? 's' : ''} de aprobar`}
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-rojo text-white"
    >
      {n}
    </span>
  )
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
  const enFlota            = decodedPathname.startsWith('/flota')

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
    !enFlota &&
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
            {enAdmin ? 'Administración' : enHerramientas ? 'Herramientas' : enLogistica ? 'Logística' : enCertificaciones ? 'Compras y Stock' : enCaja ? 'Caja' : enFlota ? 'Flota interna' : 'Menú'}
          </div>

          {/* Módulos con ?tab=... — todos usan el mismo `<ModuloNav>`. */}
          {enLogistica && (
            <Suspense fallback={null}>
              <ModuloNav
                modulo="logistica"
                basePath="/logistica"
                defaultTab="viajes"
                navigate={navigate}
                renderBadge={(key) => key === 'gastos' ? <GastosPendientesBadge /> : null}
              />
            </Suspense>
          )}

          {enCertificaciones && (
            <Suspense fallback={null}>
              <ModuloNav modulo="certificaciones" basePath="/certificaciones" defaultTab="solicitudes" navigate={navigate} />
            </Suspense>
          )}

          {enCaja && (
            <Suspense fallback={null}>
              <ModuloNav modulo="caja" basePath="/caja" defaultTab="movimientos" navigate={navigate} />
            </Suspense>
          )}

          {enAdmin && (
            <Suspense fallback={null}>
              <ModuloNav modulo="admin" basePath="/admin" defaultTab="usuarios" navigate={navigate} />
            </Suspense>
          )}

          {enFlota && (
            <Suspense fallback={null}>
              <ModuloNav modulo="flota" basePath="/flota" defaultTab="vehiculos" navigate={navigate} />
            </Suspense>
          )}

          {/* TARJA nav — solo si NO estamos en otros módulos.
              El filtro por tabs[] ya limita lo visible (capataz tiene
              tabs:['tarja'], capataz_supervisor tabs:['tarja','personal']). */}
          {!enHerramientas && !enLogistica && !enCertificaciones && !enCaja && !enAdmin && !enFlota && NAV_ITEMS_TARJA
            .filter(item => tarjaTabs.includes(item.tabKey))
            .map(item => (
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

        {/* ── Botón cambiar módulo — solo si tiene más de un módulo accesible ── */}
        {(() => {
          const totalModulos = profile?.rol === 'admin'
            ? 6 // admin ve todos
            : (profile?.modulos?.length ?? 0)
          if (totalModulos <= 1) return null
          return (
            <div className="px-3 mt-3">
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[9px] border-[1.5px] border-dashed border-white/20 text-white/40 hover:border-white/50 hover:text-white/70 transition-all text-sm font-semibold"
              >
                <span>⇐</span>
                <span>Cambiar módulo</span>
              </button>
            </div>
          )
        })()}

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
  const [newPassConfirm, setNewPassConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [changing, setChanging] = useState(false)
  const [msg, setMsg] = useState('')

  if (!profile) return null

  async function handleChangePassword() {
    if (newPass.length < 6) { setMsg('Mínimo 6 caracteres'); return }
    if (newPass !== newPassConfirm) { setMsg('Las contraseñas no coinciden'); return }
    setChanging(true)
    setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPass })
    setChanging(false)
    if (error) { setMsg(error.message); return }
    setMsg('Contraseña actualizada')
    setNewPass('')
    setNewPassConfirm('')
    setShowPass(false)
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
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="Nueva contraseña..."
              autoComplete="new-password"
              className="w-full pl-2 pr-9 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs outline-none focus:border-naranja placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPass ? 'Ocultar' : 'Mostrar'}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-sm"
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={newPassConfirm}
              onChange={e => setNewPassConfirm(e.target.value)}
              placeholder="Repetí la contraseña..."
              autoComplete="new-password"
              className="w-full pl-2 pr-9 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs outline-none focus:border-naranja placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPass ? 'Ocultar' : 'Mostrar'}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-sm"
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changing || newPass.length < 6 || newPass !== newPassConfirm}
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