'use client'

import { useState } from 'react'
import { WeekNavigator } from './WeekNavigator'
import { Button } from '@/components/ui/Button'
import type { Personal } from '@/types/domain.types'

interface Props {
  personal: Personal[]
  obraCod: string
  onAgregarTrabajador: () => void
  onAutoFill: (hs: number, legs: string[]) => void
  onLimpiar: (legs: string[]) => void
  onExcel: () => void
}

export function ToolbarTarja({
  personal,
  onAgregarTrabajador,
  onAutoFill,
  onLimpiar,
  onExcel,
}: Props) {
  const [showAutoFill, setShowAutoFill] = useState(false)
  const [horas, setHoras] = useState<string>('8')
  const [seleccionados, setSeleccionados] = useState<string[]>([])

  // Cuando se abre el panel, seleccionar todos por defecto
  function handleOpenAutoFill() {
    setSeleccionados(personal.map(p => p.leg))
    setShowAutoFill(true)
  }

  function toggleTrabajador(leg: string) {
    setSeleccionados(prev =>
      prev.includes(leg)
        ? prev.filter(l => l !== leg)
        : [...prev, leg]
    )
  }

  function selectAll() {
    setSeleccionados(personal.map(p => p.leg))
  }

  function selectNone() {
    setSeleccionados([])
  }

  function handleConfirmarAutoFill() {
    const hs = parseFloat(horas)
    if (isNaN(hs) || hs <= 0 || hs > 24) return
    if (!seleccionados.length) return
    onAutoFill(hs, seleccionados)
    setShowAutoFill(false)
  }

  function handleLimpiar() {
    if (!personal.length) return
    if (!confirm('¿Limpiar las horas de la semana para todos los trabajadores?')) return
    onLimpiar(personal.map(p => p.leg))
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Fila principal */}
      <div className="flex items-center gap-2 flex-wrap">
        <WeekNavigator />
        <Button
          variant="primary"
          size="sm"
          onClick={onAgregarTrabajador}
        >
          ＋ Trabajador
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenAutoFill}
          disabled={!personal.length}
        >
          ⚡ Auto-fill
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLimpiar}
          disabled={!personal.length}
        >
          🗑 Limpiar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onExcel}
        >
          ⬇ Excel
        </Button>
      </div>

      {/* Panel Auto-fill */}
      {showAutoFill && (
        <div className="bg-white rounded-card shadow-card border border-gris-mid p-4 flex flex-col gap-4 animate-[slideUp_0.15s_ease]">

          {/* Header panel */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-azul text-sm tracking-wide">
              ⚡ AUTO-FILL DE HORAS
            </h3>
            <button
              onClick={() => setShowAutoFill(false)}
              className="text-gris-dark hover:text-carbon text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-gris transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Input horas */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider whitespace-nowrap">
              Horas por día
            </label>
            <div className="flex items-center gap-1">
              {[4, 5, 6, 7, 8, 9].map(h => (
                <button
                  key={h}
                  onClick={() => setHoras(String(h))}
                  className={`
                    w-9 h-9 rounded-lg font-mono font-bold text-sm transition-colors
                    ${horas === String(h)
                      ? 'bg-naranja text-white'
                      : 'bg-gris text-carbon hover:bg-naranja-light hover:text-naranja-dark'
                    }
                  `}
                >
                  {h}
                </button>
              ))}
              <input
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={horas}
                onChange={e => setHoras(e.target.value)}
                className="w-16 h-9 border-[1.5px] border-gris-mid rounded-lg text-center font-mono font-bold text-sm outline-none focus:border-naranja bg-blanco ml-1"
                placeholder="Ej: 7.5"
              />
            </div>
          </div>

          {/* Selección de trabajadores */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                Aplicar a ({seleccionados.length}/{personal.length})
              </label>
              <div className="flex gap-1">
                <button
                  onClick={selectAll}
                  className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris"
                >
                  Todos
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris"
                >
                  Ninguno
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {personal.map(p => {
                const sel = seleccionados.includes(p.leg)
                return (
                  <button
                    key={p.leg}
                    onClick={() => toggleTrabajador(p.leg)}
                    className={`
                      flex items-center gap-2.5 px-3 py-2 rounded-lg
                      border-[1.5px] transition-all text-left
                      ${sel
                        ? 'border-naranja bg-naranja-light'
                        : 'border-gris-mid bg-white hover:border-gris-dark'
                      }
                    `}
                  >
                    {/* Checkbox visual */}
                    <div className={`
                      w-4 h-4 rounded flex items-center justify-center flex-shrink-0
                      border-[1.5px] transition-colors
                      ${sel
                        ? 'bg-naranja border-naranja-dark'
                        : 'border-gris-mid bg-white'
                      }
                    `}>
                      {sel && (
                        <span className="text-white text-[10px] font-bold leading-none">✓</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-carbon truncate">
                        {p.nom}
                      </div>
                      <div className="font-mono text-[10px] text-gris-dark">
                        Leg. {p.leg}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-2 justify-end border-t border-gris pt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAutoFill(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!seleccionados.length || !horas}
              onClick={handleConfirmarAutoFill}
            >
              ⚡ Aplicar {horas}hs a {seleccionados.length} trabajador{seleccionados.length !== 1 ? 'es' : ''}
            </Button>
          </div>

        </div>
      )}
    </div>
  )
}