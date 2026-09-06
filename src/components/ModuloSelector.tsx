'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/session.store'
import { EMPRESA } from '@/lib/config/empresa'

import { modulosOrdenados, type Modulo, type ModuloInfo } from '@/lib/config/modulos'

// Adónde lleva cada módulo. Ropa y préstamos viven dentro de tarja.
const HREF_MODULO: Record<Modulo, string> = {
  tarja: '/tarja', logistica: '/logistica', herramientas: '/herramientas', certificaciones: '/certificaciones',
  caja: '/caja', ropa: '/tarja/ropa', prestamos: '/tarja/prestamos', configuracion: '/configuracion',
  flota: '/flota', alquiler: '/alquiler', aridos: '/aridos', admin: '/admin',
}
// Tabs de tarja que también existen como módulo: si el user ya tiene tarja
// no se repiten como tarjeta; si solo tiene esos, son su única entrada (antes
// esta lista era propia, sin ellos, y a ese user lo deslogueaba "sin módulos").
const DENTRO_DE_TARJA = new Set<Modulo>(['ropa', 'prestamos'])

// Página post-login: muestra solo los módulos a los que el user tiene acceso.
//
// - Si no hay sesión → redirige a /login.
// - Si el user tiene UN solo módulo → redirige directo (sin pasar por el grid).
// - Si tiene varios → muestra el grid filtrado.
// - Admin ve todos los módulos.
export function ModuloSelector() {
  const router = useRouter()
  const profile = useSessionStore(s => s.profile)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session) {
        router.replace('/login')
        return
      }

      // Si todavía no se cargó el profile (ProfileLoader corre dentro de
      // (app), no acá), lo pedimos directo.
      let currentProfile = profile
      if (!currentProfile) {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/me/profile`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          )
          if (res.ok) {
            currentProfile = await res.json()
            if (currentProfile) useSessionStore.getState().setProfile(currentProfile)
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return

      if (!currentProfile) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      // Auto-redirect si tiene un solo módulo accesible.
      const accesibles = filtrarAccesibles(currentProfile.rol, currentProfile.modulos)
      if (accesibles.length === 1) {
        router.replace(HREF_MODULO[accesibles[0]!.key])
        return
      }
      if (accesibles.length === 0) {
        // Sin módulos asignados: cerrar sesión y mostrar login.
        await supabase.auth.signOut()
        router.replace('/login?error=sin-modulos')
        return
      }

      setBootstrapping(false)
    }
    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    useSessionStore.getState().setProfile(null)
    useSessionStore.getState().setEmail('')
    router.replace('/login')
  }

  if (bootstrapping || !profile) {
    return (
      <div className="min-h-screen bg-azul flex items-center justify-center text-white/60 text-sm">
        <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />
        Cargando…
      </div>
    )
  }

  const accesibles = filtrarAccesibles(profile.rol, profile.modulos)

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-10 text-center">
        <img src={EMPRESA.logoUrl} alt={EMPRESA.nombre} className="h-32 mx-auto mb-3" />
        <p className="text-white/50 text-sm mt-2 tracking-wider uppercase font-semibold">
          Sistema de gestión
        </p>
      </div>

      {/* Título */}
      <div className="text-center mb-8">
        <h2 className="text-white/90 text-lg font-bold">
          ¿A qué módulo querés ingresar?
        </h2>
        <p className="text-white/40 text-sm mt-1">
          Sesión activa como {profile.nombre}
        </p>
      </div>

      {/* Grid de módulos accesibles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-2xl">
        {accesibles.map(m => (
          <button
            key={m.key}
            onClick={() => router.push(HREF_MODULO[m.key])}
            className="relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-white/20 bg-white/10 hover:bg-white/20 hover:border-naranja hover:scale-[1.03] cursor-pointer active:scale-[0.98] transition-all"
          >
            <div className="text-5xl">{m.icono}</div>
            <div className="text-center">
              <div className="font-display text-white text-lg tracking-wider">
                {m.label.toUpperCase()}
              </div>
              <div className="text-white/50 text-xs mt-1 font-semibold">
                {m.descripcion}
              </div>
            </div>
            <div className="text-naranja text-xl font-bold">→</div>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mt-10 text-white/40 hover:text-white text-xs font-semibold tracking-wider uppercase transition-colors"
      >
        ↻ Cerrar sesión
      </button>

      <p className="text-white/20 text-xs mt-6 text-center">
        Powered by Ing. Franco Leiro · {new Date().getFullYear()}
      </p>
    </div>
  )
}

function filtrarAccesibles(rol: string, modulos: string[]): ModuloInfo[] {
  const todos = modulosOrdenados({ incluirAdmin: true })
  // Administración al final, como siempre estuvo.
  const ordenados = [...todos.filter(m => m.key !== 'admin'), ...todos.filter(m => m.key === 'admin')]
  if (rol === 'admin') return ordenados.filter(m => !DENTRO_DE_TARJA.has(m.key))
  const tieneTarja = modulos.includes('tarja')
  return ordenados.filter(m => modulos.includes(m.key) && !(tieneTarja && DENTRO_DE_TARJA.has(m.key)))
}