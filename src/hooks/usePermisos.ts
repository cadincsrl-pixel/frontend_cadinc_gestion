'use client'

import { useSessionStore } from '@/store/session.store'

export function usePermisos(modulo: string) {
  // Suscribirse a `profile` directamente para que el componente re-renderice
  // cuando el perfil carga de forma asíncrona (ProfileLoader).
  // Sin esto, `canDo` siempre devuelve false al montar (profile === null)
  // y nunca se actualiza porque la referencia de `canDo` nunca cambia.
  useSessionStore(s => s.profile)
  const canDo = useSessionStore(s => s.canDo)
  return {
    puedeVer:      canDo(modulo, 'lectura'),
    puedeCrear:    canDo(modulo, 'creacion'),
    puedeEditar:   canDo(modulo, 'actualizacion'),
    puedeEliminar: canDo(modulo, 'eliminacion'),
  }
}
