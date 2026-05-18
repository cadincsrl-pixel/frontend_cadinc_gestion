'use client'

import { useSessionStore } from '@/store/session.store'

export function usePermisos(modulo: string) {
  // Suscribirse a `profile` directamente para que el componente re-renderice
  // cuando el perfil carga de forma asíncrona (ProfileLoader).
  // Sin esto, `canDo` siempre devuelve false al montar (profile === null)
  // y nunca se actualiza porque la referencia de `canDo` nunca cambia.
  const profile = useSessionStore(s => s.profile)
  const canDo = useSessionStore(s => s.canDo)

  // Lectura del JSONB `profiles.permisos[modulo][key]` con default.
  // No diferencia admin acá; la polaridad la maneja el wrapper.
  const rawFlag = (key: string, defaultValue: boolean): boolean => {
    if (!profile) return defaultValue
    const v = (profile.permisos as any)?.[modulo]?.[key]
    return v === undefined ? defaultValue : Boolean(v)
  }

  // Capacidad: true = el user la tiene. Admin siempre true (bypass).
  // Capacidades v3: ver_costos, ver_pii, resolver_items, forzar_despacho,
  // administrar_obras. vista_completa y solo_carga_horas fueron eliminadas.
  const flagCapacidad = (key: string, defaultValue: boolean = false): boolean => {
    if (profile?.rol === 'admin') return true
    return rawFlag(key, defaultValue)
  }

  // vistaCompleta y soloCargaHoras se mantienen como props derivadas para no
  // romper consumers. La fuente de verdad ahora es `profile.obras_scope`:
  //   - scope='todas'    → vistaCompleta=true (ve cierres/tarifas/etc)
  //   - scope='asignadas' → vistaCompleta=false (vista capataz / cargas propias)
  const vistaCompleta = (() => {
    if (profile?.rol === 'admin') return true
    if (!profile) return true
    return profile.obras_scope !== 'asignadas'
  })()

  // Identidad estructural: el usuario es capataz puro (rol_base='capataz').
  // Útil para reglas específicas como "solo carga hoy".
  // Admin NO es capataz.
  const esCapataz = profile?.rol === 'operador' && profile?.rol_base === 'capataz'

  return {
    puedeVer:      canDo(modulo, 'lectura'),
    puedeCrear:    canDo(modulo, 'creacion'),
    puedeEditar:   canDo(modulo, 'actualizacion'),
    puedeEliminar: canDo(modulo, 'eliminacion'),
    verCostos:       flagCapacidad('ver_costos', true),       // back-compat: ve costos por default
    verPii:          flagCapacidad('ver_pii', true),          // back-compat: ve PII por default
    vistaCompleta,
    resolverItems:   flagCapacidad('resolver_items', false),
    forzarDespacho:  flagCapacidad('forzar_despacho', false),
    puedeAdministrarObras: flagCapacidad('administrar_obras', false),
    soloCargaHoras:  !vistaCompleta,
    esCapataz,
  }
}
