'use client'

import { useEffect } from 'react'
import { useSessionStore } from '@/store/session.store'
import { apiGet }          from '@/lib/api/client'
import { createClient }    from '@/lib/supabase/client'
import type { Profile }    from '@/types/domain.types'

export function ProfileLoader({ children }: { children: React.ReactNode }) {
  const setProfile = useSessionStore(s => s.setProfile)
  const setEmail   = useSessionStore(s => s.setEmail)
  const iniciarSimulacion = useSessionStore(s => s.iniciarSimulacion)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setEmail(user.email)

      try {
        const realProfile = await apiGet<Profile>('/api/me/profile')
        setProfile(realProfile)
        // Rehidratar simulación si había una en curso antes de la navegación
        // hard. Solo si el perfil real es admin (defensive: si dejó de serlo,
        // la simulación se descarta).
        if (typeof window !== 'undefined' && realProfile.rol === 'admin') {
          const rawTarget = window.sessionStorage.getItem('simulando:target')
          if (rawTarget) {
            try {
              const target = JSON.parse(rawTarget) as Profile
              iniciarSimulacion(target)
            } catch { /* JSON inválido, ignorar */ }
          }
        }
      } catch {
        setProfile(null)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
