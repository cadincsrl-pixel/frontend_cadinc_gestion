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
  // aprobar_ajustes_stock, administrar_obras.
  const flagCapacidad = (key: string, defaultValue: boolean = false): boolean => {
    if (profile?.rol === 'admin') return true
    return rawFlag(key, defaultValue)
  }

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
    resolverItems:        flagCapacidad('resolver_items', false),
    forzarDespacho:       flagCapacidad('forzar_despacho', false),
    aprobarAjustesStock:  flagCapacidad('aprobar_ajustes_stock', false),
    puedeAdministrarObras: flagCapacidad('administrar_obras', false),
    esCapataz,
    esAdmin:         profile?.rol === 'admin',
  }
}
