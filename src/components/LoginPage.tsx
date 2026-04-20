'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api/client'
import { useSessionStore } from '@/store/session.store'
import type { Profile } from '@/types/domain.types'

const MODULO_META: Record<string, { nombre: string; icono: string; redirect: string }> = {
  tarja: { nombre: 'Tarja de Obra', icono: '📋', redirect: '/dashboard' },
  logistica: { nombre: 'Logística', icono: '🚛', redirect: '/logistica' },
  herramientas: { nombre: 'Herramientas', icono: '🔧', redirect: '/herramientas' },
}

interface Props {
  modulo: string
}

export function LoginPage({ modulo }: Props) {
  const router = useRouter()
  const setProfile = useSessionStore(s => s.setProfile)
  const meta = MODULO_META[modulo]!

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleResetPassword() {
    if (!email) { setError('Ingresá tu email primero'); return }
    setResetLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      // 1 — Autenticar con Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !data.session) {
        setError('Email o contraseña incorrectos')
        setLoading(false)
        return
      }

      // 2 — Obtener perfil usando el token directamente (no esperar cookies)
      const token = data.session.access_token
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/me/profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!res.ok) {
        setError('No se pudo obtener el perfil de usuario')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      const profile: Profile = await res.json()

      // 3 — Verificar acceso al módulo
      const tieneAcceso = profile.rol === 'admin' || profile.modulos.includes(modulo)
      if (!tieneAcceso) {
        setError(`No tenés acceso al módulo ${meta.nombre}. Contactá al administrador.`)
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // 4 — Guardar perfil y redirigir
      setProfile(profile)
      router.push(meta.redirect)
      router.refresh()

    } catch {
      setError('Error inesperado. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">

      {/* Back */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors text-sm font-bold flex items-center gap-1"
      >
        ← Volver
      </button>

      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          <div className="text-5xl mb-4">{meta.icono}</div>
          <div className="font-display text-[2rem] tracking-[3px] text-white">
            CADINC<em className="text-naranja not-italic">SRL</em>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
            <span className="text-white/60 text-xs font-bold uppercase tracking-wider">
              {meta.nombre}
            </span>
          </div>
        </div>

        {/* Card login */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-5">
          <div>
            <h2 className="font-bold text-azul text-xl">Ingresá a tu cuenta</h2>
            <p className="text-gris-dark text-sm mt-0.5">
              Usá tus credenciales de acceso
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                className="px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none transition-colors focus:border-naranja bg-white"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none transition-colors focus:border-naranja bg-white"
              />
            </div>

            {error && (
              <div className="bg-rojo-light border border-rojo/20 text-rojo text-sm font-semibold px-3 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-naranja hover:bg-naranja-dark text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1 tracking-wide"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          {resetSent ? (
            <div className="bg-verde-light border border-verde/20 text-verde text-sm font-semibold px-3 py-2.5 rounded-lg text-center">
              Te enviamos un email para restablecer tu contraseña. Revisá tu bandeja de entrada.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetLoading}
              className="text-xs text-azul hover:text-naranja font-semibold transition-colors text-center disabled:opacity-50"
            >
              {resetLoading ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
            </button>
          )}
        </div>

        <p className="text-white/20 text-xs text-center">
          CADINC SRL · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}