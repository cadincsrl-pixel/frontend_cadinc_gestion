'use client'

import { useTarjaStore } from '../store/tarja.store'
import { getSemLabel, toISO, getViernes } from '@/lib/utils/dates'
import { Button } from '@/components/ui/Button'

export function WeekNavigator() {
  const { semActual, navSem, irHoy } = useTarjaStore()

  const esHoy = toISO(semActual) === toISO(getViernes(new Date()))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center bg-white border-[1.5px] border-gris-mid rounded-[9px] shadow-card overflow-hidden">
        <button
          onClick={() => navSem(-1)}
          className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
        >
          ‹
        </button>
        <span className="px-4 py-2 text-sm font-bold text-azul border-x border-gris-mid min-w-[230px] text-center whitespace-nowrap">
          {getSemLabel(semActual)}
          {esHoy && (
            <span className="ml-2 bg-naranja text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              Actual
            </span>
          )}
        </span>
        <button
          onClick={() => navSem(1)}
          className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
        >
          ›
        </button>
      </div>
      {!esHoy && (
        <Button variant="ghost" size="sm" onClick={irHoy}>
          Semana actual
        </Button>
      )}
    </div>
  )
}