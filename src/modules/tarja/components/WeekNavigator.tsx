'use client'

import { useState, useRef, useEffect } from 'react'
import { useTarjaStore } from '../store/tarja.store'
import { useCierresObra } from '../hooks/useCierres'
import { getSemLabel, toISO, getViernes } from '@/lib/utils/dates'
import { Button } from '@/components/ui/Button'

interface Props {
  obraCod: string
}

export function WeekNavigator({ obraCod }: Props) {
  const { semActual, navSem, setSemActual, irHoy } = useTarjaStore()
  const { data: cierres = [] } = useCierresObra(obraCod)
  const [pickerOpen, setPickerOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const esHoy = toISO(semActual) === toISO(getViernes(new Date()))

  // Cerrar picker al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const semanas = Array.from({ length: 32 }, (_, i) => {
    const vie = getViernes(new Date())
    vie.setDate(vie.getDate() + (2 - i) * 7)
    return new Date(vie)
  }).reverse()

  function getCierreInfo(semKey: string) {
    return cierres.find(c => c.sem_key === semKey)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative" ref={ref}>
        <div className="flex items-center bg-white border-[1.5px] border-gris-mid rounded-[9px] shadow-card overflow-hidden">
          <button
            onClick={() => navSem(-1)}
            className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
          >
            ‹
          </button>

          {/* Label clickeable — abre picker */}
          <button
            onClick={() => setPickerOpen(p => !p)}
            className="px-4 py-2 text-sm font-bold text-azul border-x border-gris-mid min-w-[230px] text-center whitespace-nowrap hover:bg-gris transition-colors"
          >
            {getSemLabel(semActual)}
            {esHoy && (
              <span className="ml-2 bg-naranja text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Actual
              </span>
            )}
          </button>

          <button
            onClick={() => navSem(1)}
            className="px-3 py-2 text-azul hover:bg-gris transition-colors font-bold text-lg"
          >
            ›
          </button>
        </div>

        {/* Picker desplegable */}
        {pickerOpen && (
          <div className="absolute top-[calc(100%+6px)] left-0 z-[500] bg-white border-[1.5px] border-gris-mid rounded-xl shadow-card-lg min-w-[300px] max-h-[360px] overflow-y-auto">
            <div className="px-4 py-2 text-[10px] font-bold text-gris-dark uppercase tracking-wider bg-gris border-b border-gris-mid rounded-t-xl sticky top-0">
              Elegí una semana
            </div>
            {semanas.map(vie => {
              const semKey = toISO(vie)
              const cierre = getCierreInfo(semKey)
              const isSelected = semKey === toISO(semActual)
              const isActual = semKey === toISO(getViernes(new Date()))

              return (
                <button
                  key={semKey}
                  onClick={() => { setSemActual(vie); setPickerOpen(false) }}
                  className={`
                    w-full flex items-center justify-between px-4 py-2.5 text-left
                    border-b border-gris last:border-0 transition-colors
                    ${isSelected ? 'bg-azul-light font-bold text-azul' : 'hover:bg-gris'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-carbon">
                      {getSemLabel(vie)}
                    </span>
                    {isActual && (
                      <span className="text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded-full">
                        Actual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {cierre && (
                      <span className={`
                        text-[10px] font-bold px-2 py-0.5 rounded
                        ${cierre.estado === 'cerrado'
                          ? 'bg-verde-light text-verde'
                          : 'bg-amarillo-light text-[#7A5000]'
                        }
                      `}>
                        {cierre.estado === 'cerrado' ? '✓ Cerrada' : 'Pendiente'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!esHoy && (
        <Button variant="ghost" size="sm" onClick={irHoy}>
          Semana actual
        </Button>
      )}
    </div>
  )
}