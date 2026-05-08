'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/store/session.store'

interface Props {
  modulo: string
  /**
   * Tab específico que la página requiere dentro del módulo.
   * Si se pasa, además de validar que el usuario tenga el módulo,
   * se valida que `permisos[modulo].tabs` (si está definido) lo incluya.
   * Si `tabs` es undefined (admin u operador sin restricción), permite.
   */
  tabRequerido?: string
  children: React.ReactNode
}

export function GuardWrapper({ modulo, tabRequerido, children }: Props) {
  const router = useRouter()
  const profile = useSessionStore(s => s.profile)
  const hasModulo = useSessionStore(s => s.hasModulo)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (profile === null) return
    if (!hasModulo(modulo)) {
      router.replace('/')
      return
    }

    // Validación de tab dentro del módulo (solo no-admin).
    if (tabRequerido && profile.rol !== 'admin') {
      const tabs = profile.permisos?.[modulo]?.tabs
      // Si tabs está explícitamente definido y no incluye el tab requerido,
      // redirigimos al fallback más inocuo. Para tarja → /tarja (lista de
      // obras), salvo que el user tampoco tenga el tab "tarja" → en ese
      // caso a "/" para evitar loops.
      if (Array.isArray(tabs) && !tabs.includes(tabRequerido)) {
        const tarjaTabs = profile.permisos?.tarja?.tabs
        const puedeIrATarja =
          hasModulo('tarja') && (
            !Array.isArray(tarjaTabs) || tarjaTabs.includes('tarja')
          )
        router.replace(puedeIrATarja ? '/tarja' : '/')
        return
      }
    }

    setChecked(true)
  }, [profile, modulo, tabRequerido, hasModulo, router])

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
