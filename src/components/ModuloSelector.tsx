'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/session.store'

const MODULOS = [
  {
    key: 'tarja',
    nombre: 'Tarja de Obra',
    descripcion: 'Control de horas y personal',
    icono: '📋',
    loginHref: '/login',
    appHref: '/dashboard',
    color: 'naranja',
  },
  {
    key: 'logistica',
    nombre: 'Logística',
    descripcion: 'Transporte de camiones',
    icono: '🚛',
    loginHref: '/login',
    appHref: '/logistica',
    color: 'azul',
  },
  {
    key: 'herramientas',
    nombre: 'Herramientas',
    descripcion: 'Control de herramientas y equipos',
    icono: '🔧',
    loginHref: '/herramientas/login',
    appHref: '/herramientas',
    color: 'purple',
  },
  {
    key: 'certificaciones',
    nombre: 'Certificaciones',
    descripcion: 'Materiales, costos y adicionales',
    icono: '💰',
    loginHref: '/login',
    appHref: '/certificaciones',
    color: 'naranja',
  },
  {
    key: 'caja',
    nombre: 'Caja',
    descripcion: 'Efectivo y movimientos',
    icono: '💵',
    loginHref: '/login',
    appHref: '/caja',
    color: 'verde',
  },
] as const

export function ModuloSelector() {
  const router = useRouter()
  const profile = useSessionStore(s => s.profile)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function handleModulo(m: typeof MODULOS[number]) {

    setError('')
    setChecking(true)

    try {
      // Verificar si ya hay sesión activa
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // No hay sesión → ir al login del módulo
        router.push(m.loginHref)
        return
      }

      // Hay sesión → verificar si el profile ya está cargado
      let currentProfile = profile

      if (!currentProfile) {
        // Cargar profile desde la API
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/me/profile`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        )
        if (res.ok) {
          currentProfile = await res.json()
        }
      }

      if (!currentProfile) {
        // No se pudo obtener el perfil → ir al login
        router.push(m.loginHref)
        return
      }

      // Verificar acceso al módulo
      const tieneAcceso = currentProfile.rol === 'admin' || currentProfile.modulos.includes(m.key)

      if (!tieneAcceso) {
        setError(`Tu usuario no tiene acceso al módulo "${m.nombre}". Iniciá sesión con una cuenta que tenga permisos, o contactá al administrador.`)
        setChecking(false)
        return
      }

      // Tiene acceso → ir directo al módulo
      router.push(m.appHref)

    } catch {
      // Error de red o similar → ir al login como fallback
      router.push(m.loginHref)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="font-display text-[2.8rem] tracking-[4px] text-white flex items-center gap-3 justify-center">
          TARJA<em className="text-naranja not-italic">OBRA</em>
        </div>
        <p className="text-white/50 text-sm mt-2 tracking-wider uppercase font-semibold">
          CADINC SRL — Sistema de gestión
        </p>
      </div>

      {/* Título */}
      <div className="text-center mb-8">
        <h2 className="text-white/90 text-lg font-bold">
          Seleccioná el módulo al que querés acceder
        </h2>
        <p className="text-white/40 text-sm mt-1">
          {profile
            ? `Sesión activa como ${profile.nombre}`
            : 'Ingresarás con tus credenciales de acceso'
          }
        </p>
      </div>

      {/* Error de acceso */}
      {error && (
        <div className="w-full max-w-2xl mb-4 bg-rojo/20 border border-rojo/40 text-white rounded-xl px-5 py-4 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🚫</span>
          <div className="flex-1">
            <p className="font-bold text-sm">{error}</p>
            <button
              onClick={() => {
                setError('')
                // Cerrar sesión para poder loguearse con otro usuario
                const supabase = createClient()
                supabase.auth.signOut().then(() => {
                  useSessionStore.getState().setProfile(null)
                  useSessionStore.getState().setEmail('')
                })
              }}
              className="mt-2 text-xs font-bold text-naranja hover:text-white transition-colors underline"
            >
              Cerrar sesión e ingresar con otra cuenta
            </button>
          </div>
          <button
            onClick={() => setError('')}
            className="text-white/50 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid de módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {MODULOS.map(m => (
          <button
            key={m.key}
            onClick={() => handleModulo(m)}
            disabled={checking}
            className={`
              relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 transition-all
              ${checking
                ? 'border-white/20 bg-white/10 opacity-60 cursor-wait'
                : 'border-white/20 bg-white/10 hover:bg-white/20 hover:border-naranja hover:scale-[1.03] cursor-pointer active:scale-[0.98]'
              }
            `}
          >
            {/* Ícono */}
            <div className="text-5xl">{m.icono}</div>

            {/* Info */}
            <div className="text-center">
              <div className="font-display text-white text-lg tracking-wider">
                {m.nombre.toUpperCase()}
              </div>
              <div className="text-white/50 text-xs mt-1 font-semibold">
                {m.descripcion}
              </div>
            </div>

            {/* Flecha */}
            <div className="text-naranja text-xl font-bold">
              {checking ? '⏳' : '→'}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <p className="text-white/20 text-xs mt-12 text-center">
        CADINC SRL · {new Date().getFullYear()}
      </p>
    </div>
  )
}