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

  // Flag de tipo "capacidad" (true = otorga). Admin SIEMPRE true.
  // Ejemplos: ver_costos, resolver_items, forzar_despacho.
  const flagCapacidad = (key: string, defaultValue: boolean = false): boolean => {
    if (profile?.rol === 'admin') return true
    return rawFlag(key, defaultValue)
  }

  // Flag de tipo "restricción" (true = restringe). Admin SIEMPRE false.
  // Ejemplo: solo_carga_horas.
  const flagRestriccion = (key: string, defaultValue: boolean = false): boolean => {
    if (profile?.rol === 'admin') return false
    return rawFlag(key, defaultValue)
  }

  return {
    puedeVer:      canDo(modulo, 'lectura'),
    puedeCrear:    canDo(modulo, 'creacion'),
    puedeEditar:   canDo(modulo, 'actualizacion'),
    puedeEliminar: canDo(modulo, 'eliminacion'),
    // Flags. Para admin: capacidades=true, restricciones=false.
    verCostos:       flagCapacidad('ver_costos', true),       // back-compat: ve costos por default
    resolverItems:   flagCapacidad('resolver_items', false),
    forzarDespacho:  flagCapacidad('forzar_despacho', false),
    soloCargaHoras:  flagRestriccion('solo_carga_horas', false),
  }
}
