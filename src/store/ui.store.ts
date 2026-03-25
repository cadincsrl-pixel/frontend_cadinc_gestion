import { create } from 'zustand'

interface UIStore {
  obraActiva: {
    obraCod: string
    obraNom: string
  } | null
  setObraActiva: (obra: { obraCod: string; obraNom: string } | null) => void

  // Callback que TarjaObraPage registra para recibir acciones del topbar
  topbarAccion: ((accion: string) => void) | null
  setTopbarAccion: (fn: ((accion: string) => void) | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  obraActiva:     null,
  setObraActiva:  (obra) => set({ obraActiva: obra }),
  topbarAccion:   null,
  setTopbarAccion: (fn) => set({ topbarAccion: fn }),
}))