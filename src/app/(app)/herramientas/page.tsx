'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/store/session.store'
import { useTabsPermitidos } from '@/hooks/useTabsPermitidos'

// Entrada del módulo: manda al primer tab que el usuario puede ver. Antes
// renderizaba Movimientos siempre, así que un usuario con tabs:['salidas',
// 'retornos'] (Sosa, depósito) entraba a una pantalla que el menú le ocultaba
// — y con el tabRequerido de cada página, el guard lo hubiera mandado a /tarja.
const RUTA_POR_TAB: Record<string, string> = {
  movimientos:  '/herramientas/movimientos',
  inventario:   '/herramientas/inventario',
  trazabilidad: '/herramientas/trazabilidad',
  salidas:      '/herramientas/salidas',
  retornos:     '/herramientas/retornos',
  parametros:   '/herramientas/parametros',
}
const ORDEN = ['movimientos', 'inventario', 'trazabilidad', 'salidas', 'retornos', 'parametros']

export default function Page() {
  const router    = useRouter()
  const profile   = useSessionStore(s => s.profile)
  const hasModulo = useSessionStore(s => s.hasModulo)
  const tabs      = useTabsPermitidos('herramientas')
  const tabsKey   = tabs.join('|')

  useEffect(() => {
    if (profile === null) return
    if (!hasModulo('herramientas')) { router.replace('/'); return }
    const permitidos = tabsKey ? tabsKey.split('|') : []
    const primero = ORDEN.find(t => permitidos.includes(t))
    router.replace(primero ? RUTA_POR_TAB[primero] : '/')
  }, [profile, hasModulo, tabsKey, router])

  return (
    <div className="p-8 flex items-center gap-3 text-gris-dark">
      <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
      Abriendo herramientas...
    </div>
  )
}
