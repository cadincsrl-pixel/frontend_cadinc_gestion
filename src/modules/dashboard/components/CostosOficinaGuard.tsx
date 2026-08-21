'use client'

/**
 * Guard de la página /costos-oficina: además del módulo (GuardWrapper en la
 * page), exige el flag sensible `tarja.costos_oficina` (admin bypass). Sin
 * el flag redirige al dashboard — y el backend valida igual en /api/oficina/*.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePermisos } from '@/hooks/usePermisos'
import { CostosOficinaTab } from './CostosOficinaTab'

export function CostosOficinaGuard() {
  const router = useRouter()
  const { costosOficina } = usePermisos('tarja')

  useEffect(() => {
    if (!costosOficina) router.replace('/dashboard')
  }, [costosOficina, router])

  if (!costosOficina) return null

  return (
    <div className="p-4 md:p-6">
      <CostosOficinaTab />
    </div>
  )
}
