'use client'

import { useSessionStore } from '@/store/session.store'
import { useRoles } from '@/modules/configuracion/hooks/useRoles'
import { labelDeRol } from '@/lib/permisos/plantillas'

/**
 * Banner persistente cuando el admin está en modo "Simular usuario".
 * - Solo se muestra si `simulando` está activo.
 * - Recuerda al admin que las queries del backend siguen usando SU JWT,
 *   así que la data visible puede ser más amplia que la real del user
 *   simulado.
 * - Click en "Salir" restaura el perfil real del admin.
 */
export function SimulacionBanner() {
  const simulando = useSessionStore(s => s.simulando)
  const profile = useSessionStore(s => s.profile)
  const realProfile = useSessionStore(s => s.realProfile)
  const salirSimulacion = useSessionStore(s => s.salirSimulacion)
  // Solo pedimos los roles durante la simulación (el JWT sigue siendo el del
  // admin); el endpoint es admin-only y el banner se monta para todos.
  const { data: roles } = useRoles(simulando)

  if (!simulando || !profile || !realProfile) return null

  // Label del rol (tabla `roles`); un perfil viejo sin rol_key cae al rol_base.
  const etiqueta = profile.rol === 'admin'
    ? 'admin'
    : (labelDeRol(profile.rol_key ?? profile.rol_base ?? null, profile.rol_base ?? null, roles) ?? 'Personalizado')
  const ajustes = profile.rol !== 'admin' && profile.personalizado ? ' · ajustes propios' : ''

  return (
    <div className="bg-amarillo-light border-b-2 border-amarillo text-[#7A5500] text-xs font-bold px-4 py-1.5 flex items-center justify-center gap-3 sticky top-0 z-[210]">
      <span>🎭</span>
      <span>
        Simulando como <strong>{profile.nombre}</strong>
        {' '}({etiqueta}{ajustes})
      </span>
      <span className="text-[10px] text-[#7A5500]/70">
        — la data del backend sigue siendo de {realProfile.nombre}
      </span>
      <button
        onClick={salirSimulacion}
        className="ml-2 bg-[#7A5500] text-white px-2.5 py-0.5 rounded hover:bg-[#5C4000] transition-colors text-[11px]"
      >
        ✕ Salir
      </button>
    </div>
  )
}
