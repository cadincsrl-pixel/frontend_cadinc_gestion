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
  // Ejemplos: ver_costos, ver_pii, vista_completa, resolver_items, forzar_despacho.
  // En v2 todos los flags son capacidades (polaridad unificada). El legacy
  // solo_carga_horas (restricción) se reemplazó por vista_completa.
  const flagCapacidad = (key: string, defaultValue: boolean = false): boolean => {
    if (profile?.rol === 'admin') return true
    return rawFlag(key, defaultValue)
  }

  // En v2 unificamos polaridad: todos los flags son capacidades (default false,
  // true=otorga). vista_completa reemplazó a solo_carga_horas (que era una
  // restricción, polaridad invertida). Durante la transición leemos AMBOS:
  // si está seteado vista_completa explícito, lo usamos; si no, derivamos
  // del legacy solo_carga_horas. Cuando todos los perfiles tengan
  // vista_completa, podemos borrar la rama legacy (Fase 5).
  const vistaCompleta = (() => {
    if (profile?.rol === 'admin') return true
    if (!profile) return true
    const t = (profile.permisos as any)?.[modulo]
    if (!t) return true // sin permisos definidos en este módulo → no aplica
    if (typeof t.vista_completa === 'boolean') return t.vista_completa
    if (typeof t.solo_carga_horas === 'boolean') return !t.solo_carga_horas
    return true // default: vista completa
  })()

  return {
    puedeVer:      canDo(modulo, 'lectura'),
    puedeCrear:    canDo(modulo, 'creacion'),
    puedeEditar:   canDo(modulo, 'actualizacion'),
    puedeEliminar: canDo(modulo, 'eliminacion'),
    // Flags. Para admin: capacidades=true, restricciones=false.
    verCostos:       flagCapacidad('ver_costos', true),       // back-compat: ve costos por default
    verPii:          flagCapacidad('ver_pii', true),          // back-compat: ve PII por default (capataz puro lo tiene en false)
    vistaCompleta,                                            // unificado: true=ve toolbar/cierres/tarifas/etc
    resolverItems:   flagCapacidad('resolver_items', false),
    forzarDespacho:  flagCapacidad('forzar_despacho', false),
    // tarja.administrar_obras: crear/editar/archivar/borrar la entidad obra.
    // Independiente de puedeCrear/puedeEditar/puedeEliminar (que en tarja
    // controlan las horas/asignaciones). Admin siempre true por bypass.
    puedeAdministrarObras: flagCapacidad('administrar_obras', false),
    // Legacy: mantengo la prop para no romper consumers que aún no migraron.
    // Es el inverso exacto de vistaCompleta.
    soloCargaHoras:  !vistaCompleta,
  }
}
