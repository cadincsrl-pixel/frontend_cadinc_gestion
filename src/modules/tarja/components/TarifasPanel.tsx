'use client'

import { useState } from 'react'
import { useTarifasObra, useUpsertTarifa } from '../hooks/useTarifas'
import { useCategorias } from '../hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'

interface Props {
  obraCod: string
}

export function TarifasPanel({ obraCod }: Props) {
  const toast = useToast()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas    = [], refetch } = useTarifasObra(obraCod)
  const { mutate: upsert } = useUpsertTarifa()
  const [expanded,         setExpanded]         = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null)

  function getTarifaRegistro(catId: number) {
    const hist = tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => a.desde.localeCompare(b.desde))
    if (!hist.length) return null
    const hoy = toISO(new Date())
    let vigente = null
    for (const t of hist) {
      if (t.desde <= hoy) vigente = t
    }
    return vigente ?? hist[0]!
  }

  function getTarifaHist(catId: number) {
    return tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => b.desde.localeCompare(a.desde))
  }

  function handleChange(catId: number, valor: string, esResetGlobal = false) {
    const vh = parseFloat(valor)
    if (isNaN(vh) || vh < 0) return
    upsert(
      { obra_cod: obraCod, cat_id: catId, vh },
      {
        onSuccess: () => {
          toast(
            esResetGlobal
              ? '↺ Vuelto al precio global'
              : '✓ Tarifa actualizada',
            'ok'
          )
          refetch()
        },
        onError: () => toast('Error al guardar tarifa', 'err'),
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
            Precios por hora personalizados. Si no se define, usa el precio global.
          </p>
        </div>
        <span className="text-azul text-lg">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categorias.map(cat => {
              const registro     = getTarifaRegistro(cat.id)
              const hist         = getTarifaHist(cat.id)
              const tarifaObra   = registro?.vh ?? null
              // Es custom solo si hay registro Y el valor es distinto al global
              const esCustom     = tarifaObra !== null && tarifaObra !== cat.vh
              const valorMostrar = tarifaObra ?? cat.vh
              const showHist     = historialAbierto === cat.id

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
                      </div>
                    </div>
                    {esCustom && (
                      <span className="text-[10px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                        Custom
                      </span>
                    )}
                  </div>

                  {/* Input — key fuerza re-mount cuando cambia valorMostrar */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gris-dark font-bold">$</span>
                    <input
                      key={`${cat.id}-${valorMostrar}`}
                      type="number"
                      defaultValue={valorMostrar}
                      onBlur={e => handleChange(cat.id, e.target.value)}
                      className="flex-1 border-b-2 border-gris-mid focus:border-naranja outline-none bg-transparent font-mono font-bold text-verde text-sm py-1 transition-colors"
                    />
                    <span className="text-xs text-gris-dark">/h</span>
                  </div>

                  {/* Historial */}
                  {hist.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setHistorialAbierto(p => p === cat.id ? null : cat.id)}
                        className="text-[10px] text-gris-dark hover:text-azul transition-colors"
                      >
                        {showHist ? '▾' : '▸'} Historial ({hist.length})
                      </button>
                      {showHist && (
                        <div className="mt-1 max-h-20 overflow-y-auto">
                          {hist.map((t, i) => (
                            <div key={i} className="flex justify-between text-[10px] py-0.5 border-b border-gris last:border-0">
                              <span className="text-gris-dark">desde {t.desde}</span>
                              <span className="font-mono font-bold text-carbon">
                                ${t.vh.toLocaleString('es-AR')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botón volver al global — solo si es custom */}
                  {esCustom && (
                    <button
                      onClick={() => handleChange(cat.id, String(cat.vh), true)}
                      className="mt-2 w-full text-[10px] font-bold text-gris-dark hover:text-naranja-dark transition-colors text-left py-1 border-t border-naranja/20"
                    >
                      ↺ Volver al global (${cat.vh.toLocaleString('es-AR')}/h)
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