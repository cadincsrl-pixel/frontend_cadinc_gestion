'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-azul flex items-center justify-center flex-col gap-6">
      <div className="bg-white rounded-[20px] p-10 w-[360px] max-w-[95vw] shadow-card-lg">

        {/* Logo */}
        <div className="text-center mb-1">
          <h1 className="font-display text-4xl tracking-widest text-azul">
            TARJA<em className="text-naranja not-italic">OBRA</em>
          </h1>
        </div>
        <p className="text-center text-gris-dark text-xs mb-7 tracking-wider uppercase">
          CADINC SRL
        </p>

        {/* Error */}
        {error && (
          <div className="bg-rojo-light text-rojo rounded-lg px-3 py-2 text-sm font-semibold mb-4">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@cadinc.com.ar"
              required
              className="w-full px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-blanco"
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
              onKeyDown={e => e.key === 'Enter' && handleLogin(e as any)}
              className="w-full px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-blanco"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-naranja hover:bg-naranja-dark text-white rounded-lg font-sans font-bold text-sm tracking-wider transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Ingresando...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  )
}