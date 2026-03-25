import { create } from 'zustand'
import { getViernes, toISO } from '@/lib/utils/dates'

interface TarjaStore {
  semActual: Date
  setSemActual: (d: Date) => void
  navSem: (dir: -1 | 1) => void
  irHoy: () => void
}

export const useTarjaStore = create<TarjaStore>((set) => ({
  semActual: getViernes(new Date()),

  setSemActual: (d) => set({ semActual: d }),

  navSem: (dir) =>
    set((state) => {
      const nueva = new Date(state.semActual)
      nueva.setDate(nueva.getDate() + dir * 7)
      return { semActual: nueva }
    }),

  irHoy: () => set({ semActual: getViernes(new Date()) }),
}))