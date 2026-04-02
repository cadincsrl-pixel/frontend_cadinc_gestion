import { create } from 'zustand'
import type { Accion, Profile } from '@/types/domain.types'

interface SessionStore {
  profile:    Profile | null
  email:      string
  setProfile: (p: Profile | null) => void
  setEmail:   (e: string) => void
  hasModulo:  (key: string) => boolean
  isAdmin:    () => boolean
  canDo:      (modulo: string, accion: Accion) => boolean
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  profile:    null,
  email:      '',
  setProfile: (p) => set({ profile: p }),
  setEmail:   (e) => set({ email: e }),
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