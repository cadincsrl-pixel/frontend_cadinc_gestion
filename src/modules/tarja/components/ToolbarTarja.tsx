'use client'

import { useState, useRef } from 'react'
import { WeekNavigator } from './WeekNavigator'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useTarjaStore } from '../store/tarja.store'
import { exportarTarjaExcel, importarTarjaExcel } from '@/lib/utils/excel'
import { useUpsertHorasLote } from '../hooks/useHoras'
import { useCopiarSemanaAnterior } from '../hooks/useAsignaciones'
import type { Personal, Categoria, Hora, Tarifa, Obra } from '@/types/domain.types'

interface Props {
  personal: Personal[]
  categorias: Categoria[]
  horasData: Hora[]
  tarifas: Tarifa[]
  obra: Obra
  obraCod: string
  onAgregarTrabajador: () => void
  onAutoFill: (hs: number, legs: string[]) => void
  onLimpiar: (legs: string[]) => void
  undoCount?: number
  onUndo?: () => void
}

export function ToolbarTarja({
  personal, categorias, horasData, tarifas, obra, obraCod,
  onAgregarTrabajador, onAutoFill, onLimpiar, undoCount, onUndo,
}: Props) {
  const toast = useToast()
  const { semActual } = useTarjaStore()
  const { mutate: upsertLote, isPending: importing } = useUpsertHorasLote()
  const { mutate: copiarSemana, isPending: copiando } = useCopiarSemanaAnterior()
  const fileRef = useRef<HTMLInputElement>(null)

  const [showAutoFill, setShowAutoFill] = useState(false)
  const [horas, setHoras] = useState<string>('8')
  const [seleccionados, setSeleccionados] = useState<string[]>([])

  function handleOpenAutoFill() {
    setSeleccionados(personal.map(p => p.leg))
    setShowAutoFill(true)
  }

  function toggleTrabajador(leg: string) {
    setSeleccionados(prev =>
      prev.includes(leg) ? prev.filter(l => l !== leg) : [...prev, leg]
    )
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
    onLimpiar(personal.map(p => p.leg))
  }

  function handleCopiarSemana() {
    copiarSemana(
      { obraCod, semActual },
      {
        onSuccess: () => toast('✓ Trabajadores copiados de la semana anterior', 'ok'),
        onError: (err) => toast(err.message ?? 'Error al copiar semana', 'err'),
      }
    )
  }

  function handleExportExcel() {
    if (!personal.length) { toast('No hay trabajadores asignados', 'warn'); return }
    exportarTarjaExcel(
      obraCod, obra.nom, semActual,
      personal, categorias, horasData, tarifas
    )
    toast('⬇ Excel exportado', 'ok')
  }

  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    importarTarjaExcel(
      file, obraCod, personal,
      resultado => {
        if (!confirm(`¿Importar ${resultado.length} registros de horas? Se sobreescribirán las horas existentes.`)) return
        upsertLote(
          { obra_cod: obraCod, horas: resultado },
          {
            onSuccess: () => toast(`✓ ${resultado.length} horas importadas`, 'ok'),
            onError: () => toast('Error al importar', 'err'),
          }
        )
      },
      msg => toast(msg, 'err')
    )
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Fila principal */}
      <div className="flex items-center gap-2 flex-wrap">
        <WeekNavigator obraCod={obraCod} />
        <Button variant="primary" size="sm" onClick={onAgregarTrabajador}>
          ＋ Trabajador
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopiarSemana}
          disabled={copiando}
        >
          {copiando ? '⏳ Copiando...' : '📋 Copiar sem. anterior'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleOpenAutoFill} disabled={!personal.length}>
          ⚡ Auto-fill
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLimpiar} disabled={!personal.length}>
          🗑 Limpiar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!undoCount}
          title="Deshacer último cambio (Ctrl+Z)"
        >
          ↩ Deshacer{undoCount ? ` (${undoCount})` : ''}
        </Button>
        <div className="flex gap-1 ml-auto">
          <Button variant="ghost" size="sm" onClick={handleExportExcel} disabled={!personal.length}>
            ⬇ Excel
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Importando...' : '📥 Importar'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportExcel}
          />
        </div>
      </div>

      {/* Panel Auto-fill (sin cambios) */}
      {showAutoFill && (
        <div className="bg-white rounded-card shadow-card border border-gris-mid p-4 flex flex-col gap-4 animate-[slideUp_0.15s_ease]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-azul text-sm tracking-wide">⚡ AUTO-FILL DE HORAS</h3>
            <button onClick={() => setShowAutoFill(false)} className="text-gris-dark hover:text-carbon text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-gris transition-colors">✕</button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gris-dark uppercase tracking-wider whitespace-nowrap">Horas por día</label>
            <div className="flex items-center gap-1">
              {[4, 5, 6, 7, 8, 9].map(h => (
                <button
                  key={h}
                  onClick={() => setHoras(String(h))}
                  className={`w-9 h-9 rounded-lg font-mono font-bold text-sm transition-colors ${horas === String(h) ? 'bg-naranja text-white' : 'bg-gris text-carbon hover:bg-naranja-light hover:text-naranja-dark'}`}
                >
                  {h}
                </button>
              ))}
              <input
                type="number" min={0.5} max={24} step={0.5}
                value={horas}
                onChange={e => setHoras(e.target.value)}
                className="w-16 h-9 border-[1.5px] border-gris-mid rounded-lg text-center font-mono font-bold text-sm outline-none focus:border-naranja bg-blanco ml-1"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                Aplicar a ({seleccionados.length}/{personal.length})
              </label>
              <div className="flex gap-1">
                <button onClick={() => setSeleccionados(personal.map(p => p.leg))} className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris">Todos</button>
                <button onClick={() => setSeleccionados([])} className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris">Ninguno</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {personal.map(p => {
                const sel = seleccionados.includes(p.leg)
                return (
                  <button
                    key={p.leg}
                    onClick={() => toggleTrabajador(p.leg)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-[1.5px] transition-all text-left ${sel ? 'border-naranja bg-naranja-light' : 'border-gris-mid bg-white hover:border-gris-dark'}`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-[1.5px] transition-colors ${sel ? 'bg-naranja border-naranja-dark' : 'border-gris-mid bg-white'}`}>
                      {sel && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-carbon truncate">{p.nom}</div>
                      <div className="font-mono text-[10px] text-gris-dark">Leg. {p.leg}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-gris pt-3">
            <Button variant="secondary" size="sm" onClick={() => setShowAutoFill(false)}>Cancelar</Button>
            <Button
              variant="primary" size="sm"
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