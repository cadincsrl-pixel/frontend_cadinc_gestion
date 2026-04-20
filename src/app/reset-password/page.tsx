'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase redirige con tokens en el hash — el cliente los procesa automáticamente
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // También verificar si ya hay sesión de recovery
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (error) { setError(error.message); return }

    setSuccess(true)
    setTimeout(() => router.push('/'), 3000)
  }

  return (
    <div className="min-h-screen bg-azul flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <div className="font-display text-[2rem] tracking-[3px] text-white">
            CADINC<em className="text-naranja not-italic">SRL</em>
          </div>
          <p className="text-white/50 text-sm mt-2">Restablecer contraseña</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-5">
          {success ? (
            <div className="text-center">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="font-bold text-verde text-lg">Contraseña actualizada</h2>
              <p className="text-gris-dark text-sm mt-2">Redirigiendo al inicio...</p>
            </div>
          ) : !ready ? (
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-naranja border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gris-dark text-sm">Verificando enlace...</p>
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-bold text-azul text-xl">Nueva contraseña</h2>
                <p className="text-gris-dark text-sm mt-0.5">Ingresá tu nueva contraseña</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Nueva contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repetí la contraseña"
                    required
                    className="px-3 py-2.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
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
                  className="bg-naranja hover:bg-naranja-dark text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-60 tracking-wide"
                >
                  {loading ? 'Guardando...' : 'Cambiar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
