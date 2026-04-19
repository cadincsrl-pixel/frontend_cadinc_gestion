'use client'

import { useSessionStore } from '@/store/session.store'
import { TABS_POR_MODULO } from '@/lib/config/modulo-tabs'

/**
 * Devuelve los tabs que el usuario actual puede ver en un módulo.
 * Admins ven todos. Operadores ven solo los configurados (o todos si no se configuró).
 */
export function useTabsPermitidos(modulo: string): string[] {
  const profile = useSessionStore(s => s.profile)

  if (!profile) return []

  // Admins ven todo
  if (profile.rol === 'admin') {
    return (TABS_POR_MODULO[modulo] ?? []).map(t => t.key)
  }

  const permisos = profile.permisos?.[modulo]
  if (!permisos) return []

  // Si no hay tabs configurados, mostrar todos los del módulo
  const tabsConfigurados = permisos.tabs
  if (!tabsConfigurados || tabsConfigurados.length === 0) {
    return (TABS_POR_MODULO[modulo] ?? []).map(t => t.key)
  }

  return tabsConfigurados
}

/**
 * Verifica si un tab específico está permitido
 */
export function useTabPermitido(modulo: string, tab: string): boolean {
  const tabs = useTabsPermitidos(modulo)
  return tabs.includes(tab)
}
