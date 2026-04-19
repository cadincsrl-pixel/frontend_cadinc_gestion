'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { useUIStore } from '@/store/ui.store'

const MODULO_BRANDING: Record<string, { label: string; accent: string; icono: string }> = {
  tarja:          { label: 'CADINC',  accent: 'SRL',  icono: '📋' },
  herramientas:   { label: 'CADINC',  accent: 'SRL',  icono: '🔧' },
  logistica:      { label: 'CADINC',  accent: 'SRL',  icono: '🚛' },
  certificaciones:{ label: 'CADINC',  accent: 'SRL',  icono: '🛒' },
  caja:           { label: 'CADINC',  accent: 'SRL',  icono: '💵' },
}

function getModuloActual(pathname: string): string {
  if (pathname.startsWith('/herramientas'))   return 'herramientas'
  if (pathname.startsWith('/logistica'))      return 'logistica'
  if (pathname.startsWith('/certificaciones')) return 'certificaciones'
  if (pathname.startsWith('/caja'))           return 'caja'
  return 'tarja'
}

interface TopbarProps {
  onMenuToggle?: () => void
  showMenuBtn?: boolean
}

export function Topbar({ onMenuToggle, showMenuBtn }: TopbarProps) {
  const router     = useRouter()
  const pathname   = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)
  const [showAcciones, setShowAcciones] = useState(false)

  const obraActiva = useUIStore(s => s.obraActiva)
  const topbarAccion = useUIStore(s => s.topbarAccion)
  const moduloKey  = getModuloActual(pathname)
  const branding   = MODULO_BRANDING[moduloKey] ?? MODULO_BRANDING.tarja!

  // Lógica de visualización separada:
  // 1. Mostrar botones si estamos en el módulo Tarja (excepto archivadas)
  const esModuloTarja = moduloKey === 'tarja' 
  const mostrarAccionesTarja = esModuloTarja && !!topbarAccion
  
  // 2. Mostrar nombre de la obra SOLO si existe la obra activa
  const mostrarNombreObra = esModuloTarja && !!obraActiva

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión?')) return
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="bg-azul sticky top-0 z-[200] border-b-2 border-naranja/50">
      <div className="flex items-center justify-between w-full min-h-[54px] px-4">

        {/* Left */}
        <div className="flex items-center gap-3">
          {showMenuBtn && (
            <button
              onClick={onMenuToggle}
              className="text-white/70 hover:text-white transition-colors text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10"
            >
              ☰
            </button>
          )}
          <div className="font-display text-[1.65rem] tracking-[3px] text-white flex items-center gap-2">
            {branding.label}<em className="text-naranja not-italic">{branding.accent}</em>
          </div>

          {/* Nombre obra activa — Se muestra solo si hay una obra en el store */}
          {mostrarNombreObra && (
            <div className="hidden md:flex items-center gap-2 ml-2">
              <span className="text-white/30">·</span>
              <span className="text-white/70 text-sm font-semibold truncate max-w-[200px]">
                {obraActiva?.obraNom}
              </span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">

          {/* Botones de acción — Se muestran siempre en el módulo Tarja */}
          {mostrarAccionesTarja && (
            <>
              <div className="hidden sm:flex items-center gap-1">
                <TopbarBtn icon="📊" label="Excel" onClick={() => topbarAccion?.('excel')} />
                <TopbarBtn icon="🖨" label="Recibos" onClick={() => topbarAccion?.('recibos')} />
                <TopbarBtn icon="⬇" label="CSV" onClick={() => topbarAccion?.('csv')} />
              </div>

              <div className="relative sm:hidden">
                <button
                  onClick={() => setShowAcciones(p => !p)}
                  className="bg-white/10 hover:bg-white/20 border border-white/18 text-white px-3 py-1.5 rounded-lg font-sans text-xs font-bold tracking-wide transition-colors"
                >
                  ⋯ Acciones
                </button>
                {showAcciones && (
                  <div className="absolute right-0 top-[calc(100%+6px)] bg-white rounded-xl shadow-card-lg border border-gris-mid z-[300] min-w-[160px] overflow-hidden">
                    {[
                      { icon: '📊', label: 'Excel obras',   accion: 'excel'   },
                      { icon: '🖨', label: 'Recibos PDF',   accion: 'recibos' },
                      { icon: '⬇', label: 'CSV Tarja',     accion: 'csv'     },
                    ].map(item => (
                      <button
                        key={item.accion}
                        onClick={() => {
                          topbarAccion?.(item.accion)
                          setShowAcciones(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-carbon hover:bg-gris transition-colors border-b border-gris last:border-0"
                      >
                        <span>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="bg-white/10 hover:bg-white/20 border border-white/18 text-white px-3 py-1.5 rounded-lg font-sans text-xs font-bold tracking-wide transition-colors disabled:opacity-60"
          >
            {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
          </button>

        </div>
      </div>
    </header>
  )
}

function TopbarBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white/10 hover:bg-white/20 border border-white/18 text-white px-3 py-1.5 rounded-lg font-sans text-xs font-bold tracking-wide transition-colors flex items-center gap-1.5"
    >
      <span>{icon}</span>
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}