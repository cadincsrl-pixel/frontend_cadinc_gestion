'use client'

import { useEffect } from 'react'
import { useSessionStore } from '@/store/session.store'
import { apiGet }          from '@/lib/api/client'
import { createClient }    from '@/lib/supabase/client'
import type { Profile }    from '@/types/domain.types'

export function ProfileLoader({ children }: { children: React.ReactNode }) {
  const setProfile = useSessionStore(s => s.setProfile)
  const setEmail   = useSessionStore(s => s.setEmail)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setEmail(user.email)

      apiGet<Profile>('/api/me/profile')
        .then(setProfile)
        .catch(() => setProfile(null))
    }
    load()
  }, [])

  return <>{children}</>
}