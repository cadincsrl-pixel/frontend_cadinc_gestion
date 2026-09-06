/**
 * Roles editables (tabla `roles`) — CRUD contra /api/usuarios/roles.
 *
 * El rol es la PLANTILLA; `profiles.permisos` sigue siendo lo efectivo. Editar
 * un rol no cambia a nadie hasta que el admin lo aplica (`useAplicarRol`), y
 * eso solo pisa a los usuarios sin ajustes propios (`personalizado = false`).
 *
 * El endpoint es admin-only: los componentes que se renderizan para todo el
 * mundo (ej. SimulacionBanner) pasan `enabled` para no generar 403s.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client'
import type { ObrasScope, Permisos, Rol, RolBase } from '@/types/domain.types'

export const ROLES_KEY = ['roles'] as const
// Misma key que usa UsuariosTab para GET /api/usuarios: aplicar un rol cambia
// los permisos de sus usuarios y el badge de la tabla depende del label.
const USUARIOS_KEY = ['usuarios'] as const

export interface CrearRolDto {
  key:                  string          // slug [a-z0-9_]{2,40}
  label:                string
  descripcion?:         string
  permisos:             Permisos
  obras_scope_default?: ObrasScope
  rol_base?:            RolBase | null
}

export interface ActualizarRolDto {
  label?:               string
  descripcion?:         string
  permisos?:            Permisos
  obras_scope_default?: ObrasScope
  rol_base?:            RolBase | null
  activo?:              boolean
  orden?:               number
}

export interface AplicarRolResultado {
  aplicados: number
  usuarios:  string[]
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey:  ROLES_KEY,
    queryFn:   () => apiGet<Rol[]>('/api/usuarios/roles'),
    staleTime: 60_000,
    enabled,
  })
}

/** Roles que se ofrecen al elegir (activos), ordenados por `orden`. */
export function rolesActivos(roles: Rol[] | undefined): Rol[] {
  return (roles ?? [])
    .filter(r => r.activo)
    .sort((a, b) => a.orden - b.orden || a.key.localeCompare(b.key))
}

export function useCrearRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CrearRolDto) => apiPost<Rol>('/api/usuarios/roles', dto),
    onSuccess: (rol) => {
      // El rol nuevo entra al cache ya mismo (la tarjeta aparece sin esperar
      // el refetch); la invalidación confirma contra el servidor.
      qc.setQueryData<Rol[]>(ROLES_KEY, old => (old ? [...old.filter(r => r.key !== rol.key), rol] : [rol]))
      qc.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}

export function useActualizarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, dto }: { key: string; dto: ActualizarRolDto }) =>
      apiPatch<Rol>(`/api/usuarios/roles/${encodeURIComponent(key)}`, dto),
    onSuccess: (rol) => {
      // Reemplazo inmediato: el editor compara su draft contra la versión del
      // servidor y así no "vuelve" a los valores viejos entre PATCH y refetch.
      qc.setQueryData<Rol[]>(ROLES_KEY, old => old?.map(r => (r.key === rol.key ? rol : r)))
      qc.invalidateQueries({ queryKey: ROLES_KEY })
      // El label del rol se muestra en la tabla de usuarios.
      qc.invalidateQueries({ queryKey: USUARIOS_KEY })
    },
  })
}

export function useAplicarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiPost<AplicarRolResultado>(`/api/usuarios/roles/${encodeURIComponent(key)}/aplicar`, {}),
    onSuccess: () => {
      // Cambian los permisos de los usuarios del rol (y sus conteos).
      qc.invalidateQueries({ queryKey: ROLES_KEY })
      qc.invalidateQueries({ queryKey: USUARIOS_KEY })
    },
  })
}

export function useEliminarRol() {
  const qc = useQueryClient()
  return useMutation({
    // 204 sin body: apiDelete devuelve undefined.
    mutationFn: (key: string) => apiDelete<void>(`/api/usuarios/roles/${encodeURIComponent(key)}`),
    onSuccess: (_res, key) => {
      qc.setQueryData<Rol[]>(ROLES_KEY, old => old?.filter(r => r.key !== key))
      qc.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}
