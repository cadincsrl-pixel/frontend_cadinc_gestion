'use client'

import { useSessionStore } from '@/store/session.store'

export function usePermisos(modulo: string) {
  // Suscribirse a `profile` directamente para que el componente re-renderice
  // cuando el perfil carga de forma asíncrona (ProfileLoader).
  // Sin esto, `canDo` siempre devuelve false al montar (profile === null)
  // y nunca se actualiza porque la referencia de `canDo` nunca cambia.
  const profile = useSessionStore(s => s.profile)
  const canDo = useSessionStore(s => s.canDo)

  // Flags específicos por módulo (opcionales). Se respetan SOLO para no-admin
  // — el admin ignora los flags y ve todo. Default = true (back-compat con
  // usuarios sin estos flags definidos).
  const flag = (key: string, defaultValue: boolean = true): boolean => {
    if (!profile) return defaultValue
    if (profile.rol === 'admin') return true
    const v = (profile.permisos as any)?.[modulo]?.[key]
    return v === undefined ? defaultValue : Boolean(v)
  }

  return {
    puedeVer:      canDo(modulo, 'lectura'),
    puedeCrear:    canDo(modulo, 'creacion'),
    puedeEditar:   canDo(modulo, 'actualizacion'),
    puedeEliminar: canDo(modulo, 'eliminacion'),
    // Flags específicos. Por ahora:
    //   tarja.ver_costos: si false, ocultar precios/totales (capataz).
    //   certificaciones.forzar_despacho: permitido para resolver items.
    verCostos:       flag('ver_costos', true),
    forzarDespacho:  flag('forzar_despacho', false),
  }
}
