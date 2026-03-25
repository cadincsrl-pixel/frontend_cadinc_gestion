'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  onMenuToggle?: () => void
  showMenuBtn?: boolean
}

export function Topbar({ onMenuToggle, showMenuBtn }: TopbarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión?')) return
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-azul sticky top-0 z-[200] border-b-2 border-naranja/50">
      <div className="flex items-center justify-between w-full min-h-[54px] px-4">

        {/* Left — menu toggle (mobile) + brand */}
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
            TARJA<em className="text-naranja not-italic">OBRA</em>
          </div>
        </div>

        {/* Right — acciones */}
        <div className="flex items-center gap-2">
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