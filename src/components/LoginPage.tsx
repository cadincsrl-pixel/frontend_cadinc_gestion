'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/session.store'
import { EMPRESA } from '@/lib/config/empresa'
import type { Profile } from '@/types/domain.types'

interface Props {
  // Login genérico (sin filtrar por módulo). Después del login redirige a `/`
  // que muestra solo los módulos accesibles del user.
  redirectTo?: string
}

export function LoginPage({ redirectTo = '/' }: Props = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setProfile = useSessionStore(s => s.setProfile)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Mensaje cuando ModuloSelector rechaza por usuario sin módulos asignados.
  useEffect(() => {
    if (searchParams.get('error') === 'sin-modulos') {
      setError('Tu usuario no tiene módulos asignados. Contactá al administrador.')
    }
  }, [searchParams])

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

      // 3 — Validar que tenga al menos algún módulo o sea admin.
      const tieneAlgunAcceso = profile.rol === 'admin' || profile.modulos.length > 0
      if (!tieneAlgunAcceso) {
        setError('Tu usuario no tiene módulos asignados. Contactá al administrador.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // 4 — Guardar perfil y mandar a `/` que mostrará los módulos accesibles
      // (o redirigirá automáticamente si tiene uno solo).
      setProfile(profile)
      router.push(redirectTo)
      router.refresh()

    } catch {
      setError('Error inesperado. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">

      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Header */}
        <div className="text-center">
          <img src={EMPRESA.logoUrl} alt={EMPRESA.nombre} className="h-24 mx-auto mb-3" />
          <div className="text-white/50 text-xs tracking-wider uppercase font-semibold">
            Sistema de gestión
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
          {EMPRESA.nombre} · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}