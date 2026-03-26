'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/store/session.store'

interface Props {
  modulo: string
  children: React.ReactNode
}

export function GuardWrapper({ modulo, children }: Props) {
  const router = useRouter()
  const profile = useSessionStore(s => s.profile)
  const hasModulo = useSessionStore(s => s.hasModulo)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (profile === null) return
    if (!hasModulo(modulo)) {
      router.replace('/')
    } else {
      setChecked(true)
    }
  }, [profile])

  if (!checked) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Verificando acceso...
      </div>
    )
  }

  return <>{children}</>
}