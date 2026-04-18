'use client'

import { useMemo, useState } from 'react'
import { useTarifasObra, useUpsertTarifa } from '../hooks/useTarifas'
import { useCategorias } from '../hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO, getViernes, getSemLabel } from '@/lib/utils/dates'

interface Props {
  obraCod: string
  readonly?: boolean
}

interface CatSemState {
  viernes: string
  value: string
}

function buildSemanas() {
  return Array.from({ length: 24 }, (_, i) => {
    const vie = getViernes(new Date())
    vie.setDate(vie.getDate() + (2 - i) * 7)
    return new Date(vie)
  }).reverse()
}

export function TarifasPanel({ obraCod, readonly = false }: Props) {
  const toast = useToast()
  const { puedeEditar: puedeEditarPerm } = usePermisos('tarja')
  const puedeEditar = puedeEditarPerm && !readonly
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas = [], refetch } = useTarifasObra(obraCod)
  const { mutate: upsert } = useUpsertTarifa()

  const perfiles = usePerfilesMap()
  const [expanded, setExpanded] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null)
  const [semState, setSemState] = useState<Record<number, CatSemState>>({})

  const semanas = useMemo(() => buildSemanas(), [])
  const viernesActual = useMemo(() => toISO(getViernes(new Date())), [])

  function getSemForCat(catId: number): CatSemState {
    return semState[catId] ?? { viernes: viernesActual, value: '' }
  }

  function updateSemState(catId: number, field: keyof CatSemState, val: string) {
    setSemState(prev => ({
      ...prev,
      [catId]: { ...getSemForCat(catId), [field]: val },
    }))
  }

  // Tarifa vigente hoy para mostrar en la card
  function getTarifaVigente(catId: number) {
    const hoy = toISO(new Date())
    const hist = tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => a.desde.localeCompare(b.desde))
    let vigente = hist[0] ?? null
    for (const t of hist) {
      if (t.desde <= hoy) vigente = t
    }
    return vigente
  }

  // Historial completo de una categoría, más reciente primero
  function getTarifaHist(catId: number) {
    return tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => b.desde.localeCompare(a.desde))
  }

  // Precio guardado exactamente para esa semana (si existe)
  function getTarifaEnSem(catId: number, viernesKey: string) {
    return tarifas.find(t => t.cat_id === catId && t.desde === viernesKey)
  }

  function handleSave(catId: number) {
    const state = getSemForCat(catId)
    const vh = parseFloat(state.value)
    if (isNaN(vh) || vh <= 0) {
      toast('Ingresá un precio válido', 'err')
      return
    }
    upsert(
      { obra_cod: obraCod, cat_id: catId, vh, desde: state.viernes },
      {
        onSuccess: () => {
          toast(`✓ Tarifa guardada para ${state.viernes}`, 'ok')
          setSemState(prev => ({
            ...prev,
            [catId]: { viernes: state.viernes, value: '' },
          }))
          setHistorialAbierto(catId)
          refetch()
        },
        onError: () => toast('Error al guardar tarifa', 'err'),
      }
    )
  }

  function handleResetGlobal(catId: number, globalVH: number) {
    upsert(
      { obra_cod: obraCod, cat_id: catId, vh: globalVH, desde: viernesActual },
      {
        onSuccess: () => {
          toast('↺ Vuelto al precio global desde esta semana', 'ok')
          refetch()
        },
        onError: () => toast('Error al restablecer tarifa', 'err'),
      }
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card border-l-4 border-azul-mid">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <h3 className="font-display text-xl tracking-wider text-azul">
            TARIFAS DE OBRA
          </h3>
          <p className="text-xs text-gris-dark mt-0.5">
            Precios por hora por semana. Cada cambio aplica desde el viernes de la semana elegida.
          </p>
        </div>
        <span className="text-azul text-lg">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorias.map(cat => {
              const vigente  = getTarifaVigente(cat.id)
              const hist     = getTarifaHist(cat.id)
              const esCustom = vigente !== null && vigente.vh !== cat.vh
              const showHist = historialAbierto === cat.id
              const state    = getSemForCat(cat.id)
              const tarifaEnSemSel = getTarifaEnSem(cat.id, state.viernes)

              // Placeholder del input: precio ya guardado para esa semana, o global
              const inputPlaceholder = tarifaEnSemSel
                ? String(tarifaEnSemSel.vh)
                : String(cat.vh)

              return (
                <div
                  key={cat.id}
                  className={`
                    border-[1.5px] rounded-xl p-3 transition-all
                    ${esCustom
                      ? 'border-naranja bg-naranja-light'
                      : 'border-gris-mid bg-white hover:border-azul-mid'
                    }
                  `}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-sm text-azul">{cat.nom}</div>
                      <div className="text-xs text-gris-dark">
                        Global: ${cat.vh.toLocaleString('es-AR')}/h
                        {esCustom && (
                          <span className="ml-1 font-bold text-naranja-dark">
                            · Vigente: ${vigente!.vh.toLocaleString('es-AR')}/h
                          </span>
                        )}
                      </div>
                    </div>
                    {esCustom && (
                      <span className="text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                        Custom
                      </span>
                    )}
                  </div>

                  {/* Editor de precio por semana */}
                  <div className="mt-2">
                    <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                      Precio para semana
                    </div>

                    {/* Selector de semana */}
                    <select
                      value={state.viernes}
                      onChange={e => updateSemState(cat.id, 'viernes', e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white mb-2 font-semibold cursor-pointer"
                    >
                      {semanas.map(vie => {
                        const key = toISO(vie)
                        const esActual = key === viernesActual
                        const tarifaGuardada = getTarifaEnSem(cat.id, key)
                        return (
                          <option key={key} value={key}>
                            {getSemLabel(vie)}
                            {esActual ? ' ← Actual' : ''}
                            {tarifaGuardada ? ` · $${tarifaGuardada.vh.toLocaleString('es-AR')}` : ''}
                          </option>
                        )
                      })}
                    </select>

                    {/* Input de precio + botón guardar */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gris-dark font-bold flex-shrink-0">$</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={state.value}
                        onChange={e => updateSemState(cat.id, 'value', e.target.value)}
                        placeholder={inputPlaceholder}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(cat.id) }}
                        className="flex-1 min-w-0 border-b-2 border-gris-mid focus:border-naranja outline-none bg-transparent font-mono font-bold text-verde text-sm py-1 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-gris-dark flex-shrink-0">/h</span>
                      {puedeEditar && (
                        <button
                          onClick={() => handleSave(cat.id)}
                          disabled={!state.value}
                          className="px-3 py-1 bg-naranja text-white text-xs font-bold rounded-lg hover:bg-naranja-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          ✓ Guardar
                        </button>
                      )}
                    </div>

                    {/* Aviso si hay precio guardado para la semana seleccionada */}
                    {tarifaEnSemSel && (
                      <p className="text-[10px] text-naranja-dark font-semibold mt-1">
                        Ya existe precio para esta semana: ${tarifaEnSemSel.vh.toLocaleString('es-AR')}/h — se sobreescribirá.
                      </p>
                    )}
                  </div>

                  {/* Historial */}
                  {hist.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gris-mid">
                      <button
                        onClick={() => setHistorialAbierto(p => p === cat.id ? null : cat.id)}
                        className="text-[10px] text-gris-dark hover:text-azul transition-colors"
                      >
                        {showHist ? '▾' : '▸'} Historial ({hist.length})
                      </button>
                      {showHist && (
                        <div className="mt-1 max-h-40 overflow-y-auto">
                          {hist.map((t, i) => (
                            <div
                              key={i}
                              className="flex flex-col py-1 border-b border-gris last:border-0 cursor-pointer hover:bg-gris rounded px-1"
                              title="Click para editar esta semana"
                              onClick={() => updateSemState(cat.id, 'viernes', t.desde)}
                            >
                              <div className="flex justify-between text-[10px]">
                                <span className="text-gris-dark">
                                  {i === 0 ? <strong className="text-carbon">Vigente</strong> : 'Anterior'} · desde {t.desde}
                                </span>
                                <span className="font-mono font-bold text-carbon">
                                  ${t.vh.toLocaleString('es-AR')}
                                </span>
                              </div>
                              {t.updated_by && (
                                <span className="text-[9px] text-gris-dark mt-0.5">
                                  ✎ {perfiles.get(t.updated_by) ?? '…'}
                                  {t.updated_at && (
                                    <> · {new Date(t.updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</>
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reset al global */}
                  {esCustom && puedeEditar && (
                    <button
                      onClick={() => handleResetGlobal(cat.id, cat.vh)}
                      className="mt-2 w-full text-[10px] font-bold text-gris-dark hover:text-naranja-dark transition-colors text-left py-1 border-t border-naranja/20"
                    >
                      ↺ Volver al global desde hoy (${cat.vh.toLocaleString('es-AR')}/h)
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
