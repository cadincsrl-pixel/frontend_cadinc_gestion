'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/store/session.store'

export function useGuard(modulo: string) {
  const router    = useRouter()
  const profile   = useSessionStore(s => s.profile)
  const hasModulo = useSessionStore(s => s.hasModulo)

  useEffect(() => {
    // Esperar a que el perfil cargue
    if (profile === null) return
    if (!hasModulo(modulo)) {
      router.replace('/')
    }
  }, [profile, modulo])
}