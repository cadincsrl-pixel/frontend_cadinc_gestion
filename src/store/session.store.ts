import { create } from 'zustand'
import type { Accion, Profile } from '@/types/domain.types'

interface SessionStore {
  profile:    Profile | null
  email:      string
  // ── Simulación de usuario ("ver como") ──
  // Permite a un admin previsualizar la UI con los permisos de otro usuario.
  // El JWT real sigue siendo el del admin, así que los GETs al backend NO
  // se filtran como el otro user. Es una herramienta de diagnóstico de
  // gates, NO una vista 100% real. La feature se activa desde
  // /admin?tab=usuarios → botón 👁 Simular.
  realProfile: Profile | null   // backup del admin durante la simulación
  simulando:   boolean          // = realProfile !== null
  // ── Acciones ──
  setProfile:        (p: Profile | null) => void
  setEmail:          (e: string) => void
  iniciarSimulacion: (target: Profile) => void
  salirSimulacion:   () => void
  // ── Helpers (siempre leen `profile`, sea el real o el simulado) ──
  hasModulo:  (key: string) => boolean
  isAdmin:    () => boolean
  canDo:      (modulo: string, accion: Accion) => boolean
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  profile:     null,
  email:       '',
  realProfile: null,
  simulando:   false,
  setProfile:  (p) => set({ profile: p }),
  setEmail:    (e) => set({ email: e }),
  iniciarSimulacion: (target) => {
    const actual = get().profile
    // Solo admins pueden iniciar simulación. Si el caller no es admin,
    // ignoramos silenciosamente para no romper.
    if (!actual || actual.rol !== 'admin') return
    set({ realProfile: actual, profile: target, simulando: true })
    // Persistir en sessionStorage para que sobreviva navegaciones hard.
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('simulando:target', JSON.stringify(target))
        window.sessionStorage.setItem('simulando:real',   JSON.stringify(actual))
      } catch { /* quota / cookies disabled */ }
    }
  },
  salirSimulacion: () => {
    const real = get().realProfile
    if (!real) return
    set({ profile: real, realProfile: null, simulando: false })
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('simulando:target')
        window.sessionStorage.removeItem('simulando:real')
      } catch { /* */ }
    }
  },
  hasModulo:  (key) => {
    const p = get().profile
    if (!p) return false
    if (p.rol === 'admin') return true
    return p.modulos.includes(key)
  },
  isAdmin: () => get().profile?.rol === 'admin',
  canDo: (modulo, accion) => {
    const p = get().profile
    if (!p) return false
    if (p.rol === 'admin') return true
    return p.permisos?.[modulo]?.[accion] === true
  },
}))
