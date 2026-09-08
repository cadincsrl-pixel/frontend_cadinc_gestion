'use client'

import { Fragment, useMemo, useState } from 'react'
import { useTarifasObra, useUpsertTarifa } from '../hooks/useTarifas'
import { useCategorias } from '../hooks/useCategorias'
import { motivoAfectaCerradas } from '@/lib/utils/cierres'
import { useToast } from '@/components/ui/Toast'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO, getViernes, getSemLabel } from '@/lib/utils/dates'
import { parseNumeroAR } from '@/lib/utils/numeros'
import type { Categoria, Tarifa } from '@/types/domain.types'

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

function fmtCorta(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`

/**
 * Tarifas de obra por categoría, como tabla: una fila por categoría, las que
 * tienen precio propio primero. El editor de precio y el historial se abren
 * debajo de la fila (de a uno). Plegado por defecto. Antes eran once tarjetas
 * con selector, input y botón cada una, aunque solo tres tuvieran precio propio.
 */
export function TarifasPanel({ obraCod, readonly = false }: Props) {
  const toast = useToast()
  const { puedeEditar: puedeEditarPerm, verPii } = usePermisos('tarja')
  // PUT /api/tarifas exige tarja.actualizacion + ver_pii. Se deshabilita, no se oculta.
  const puedeEditar = puedeEditarPerm && verPii && !readonly
  const motivoBloqueo = readonly ? 'Obra archivada: solo lectura'
    : !puedeEditarPerm ? 'Sin permiso de edición en tarja'
    : !verPii ? 'Requiere el permiso ver_pii en tarja'
    : undefined
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas = [], refetch } = useTarifasObra(obraCod)
  const { mutate: upsert, isPending } = useUpsertTarifa()

  const perfiles = usePerfilesMap()
  const [expanded, setExpanded] = useState(false)
  const [editorAbierto, setEditorAbierto] = useState<number | null>(null)
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null)
  const [semState, setSemState] = useState<Record<number, CatSemState>>({})

  const semanas = useMemo(() => buildSemanas(), [])
  const viernesActual = useMemo(() => toISO(getViernes(new Date())), [])
  const hoy = toISO(new Date())

  function getSemForCat(catId: number): CatSemState {
    return semState[catId] ?? { viernes: viernesActual, value: '' }
  }

  function updateSemState(catId: number, field: keyof CatSemState, val: string) {
    setSemState(prev => ({
      ...prev,
      [catId]: { ...getSemForCat(catId), [field]: val },
    }))
  }

  // Tarifa que rige hoy en esta obra (la más reciente con desde <= hoy; si
  // todas son futuras, la más antigua). Una fila con vh null es "global".
  function getTarifaVigente(catId: number): Tarifa | null {
    const hist = tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => a.desde.localeCompare(b.desde))
    let vigente = hist[0] ?? null
    for (const t of hist) {
      if (t.desde <= hoy) vigente = t
    }
    return vigente
  }

  function getTarifaHist(catId: number): Tarifa[] {
    return tarifas
      .filter(t => t.cat_id === catId)
      .sort((a, b) => b.desde.localeCompare(a.desde))
  }

  function getTarifaEnSem(catId: number, viernesKey: string) {
    return tarifas.find(t => t.cat_id === catId && t.desde === viernesKey)
  }

  // Filas: primero las categorías con precio propio, después el resto; cada
  // grupo por nombre.
  const filas = useMemo(() => {
    const conInfo = categorias.map(cat => {
      const vigente = getTarifaVigente(cat.id)
      const esCustom = vigente !== null && vigente.vh !== null && vigente.vh !== cat.vh
      return { cat, vigente, esCustom }
    })
    return conInfo.sort((a, b) =>
      Number(b.esCustom) - Number(a.esCustom) || a.cat.nom.localeCompare(b.cat.nom, 'es'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias, tarifas, hoy])

  const nCustom = filas.filter(f => f.esCustom).length

  function handleSave(cat: Categoria) {
    const state = getSemForCat(cat.id)
    // El valor hora se tipea con coma: parseFloat lo truncaría (ver
    // lib/utils/numeros). "2.500,50" y "2500.5" son el mismo precio.
    const vh = parseNumeroAR(state.value)
    if (vh === null || vh <= 0) {
      toast('Ingresá un precio válido', 'err')
      return
    }
    const dto = { obra_cod: obraCod, cat_id: cat.id, vh, desde: state.viernes }
    const onSuccess = () => {
      toast(`✓ ${cat.nom}: ${fmt(vh)}/h desde la semana del ${fmtCorta(state.viernes)}`, 'ok')
      setSemState(prev => ({ ...prev, [cat.id]: { viernes: state.viernes, value: '' } }))
      setEditorAbierto(null)
      refetch()
    }
    upsert(dto, {
      onSuccess,
      onError: (err) => {
        // El backend rechaza una vigencia pasada porque recalcula semanas ya
        // cerradas; si el usuario lo confirma, se reintenta con la marca.
        const motivo = motivoAfectaCerradas(err)
        if (motivo && confirm(`${motivo}\n\n¿Aplicar la tarifa igual?`)) {
          upsert({ ...dto, confirmar_historico: true }, { onSuccess, onError: () => toast('Error al guardar tarifa', 'err') })
          return
        }
        toast(motivo ? 'Tarifa no aplicada' : (err.message ?? 'Error al guardar tarifa'), motivo ? 'warn' : 'err')
      },
    })
  }

  // "Volver al global" guarda una fila con vh null desde esta semana: desde
  // ahí rige el precio global (y lo sigue cuando cambie).
  function handleResetGlobal(cat: Categoria) {
    if (!confirm(`¿${cat.nom} vuelve al precio global desde esta semana (hoy ${fmt(cat.vh)}/h)?`)) return
    upsert(
      { obra_cod: obraCod, cat_id: cat.id, vh: null, desde: viernesActual },
      {
        onSuccess: () => {
          toast(`↺ ${cat.nom}: desde esta semana rige el precio global`, 'ok')
          refetch()
        },
        onError: (err) => toast(err.message ?? 'Error al restablecer tarifa', 'err'),
      }
    )
  }

  const btn = 'text-[11px] font-bold px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="bg-white rounded-card shadow-card border-l-4 border-azul-mid">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="font-display text-xl tracking-wider text-azul">
            TARIFAS DE OBRA
          </h3>
          <p className="text-xs text-gris-dark mt-0.5">
            {nCustom === 0
              ? 'Todas las categorías usan el precio global.'
              : `${nCustom} categoría${nCustom === 1 ? '' : 's'} con precio propio en esta obra; el resto usa el global.`}
            {' '}Cada cambio rige desde el viernes de la semana elegida.
          </p>
        </div>
        <span className="text-azul text-lg">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] font-bold text-gris-dark uppercase tracking-wider border-b border-gris-mid">
                <th className="text-left py-1.5 pr-3">Categoría</th>
                <th className="text-right py-1.5 px-3">Global</th>
                <th className="text-right py-1.5 px-3">En esta obra</th>
                <th className="text-left py-1.5 px-3">Desde</th>
                <th className="py-1.5 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ cat, vigente, esCustom }) => {
                const hist = getTarifaHist(cat.id)
                const state = getSemForCat(cat.id)
                const tarifaEnSemSel = getTarifaEnSem(cat.id, state.viernes)
                const editando = editorAbierto === cat.id
                const verHist = historialAbierto === cat.id
                return (
                  <Fragment key={cat.id}>
                    <tr className={`border-b border-gris ${esCustom ? 'bg-naranja-light/40' : ''}`}>
                      <td className="py-2 pr-3 font-bold text-carbon whitespace-nowrap">{cat.nom}</td>
                      <td className="py-2 px-3 text-right font-mono text-gris-dark whitespace-nowrap">{fmt(cat.vh)}</td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {esCustom ? (
                          <>
                            <span className="font-mono font-bold text-naranja-dark">{fmt(vigente!.vh!)}</span>
                            <span className="ml-1.5 text-[9px] font-bold bg-naranja text-white px-1.5 py-0.5 rounded uppercase tracking-wide">custom</span>
                          </>
                        ) : (
                          <span className="text-xs text-gris-dark">global</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-gris-dark whitespace-nowrap">
                        {esCustom ? fmtCorta(vigente!.desde) : ''}
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => { setEditorAbierto(editando ? null : cat.id); setHistorialAbierto(null) }}
                          disabled={!puedeEditar}
                          title={motivoBloqueo ?? 'Cargar un precio para una semana'}
                          className={`${btn} ${editando ? 'bg-naranja text-white' : 'bg-gris text-carbon hover:bg-naranja-light hover:text-naranja-dark'}`}
                        >
                          Precio…
                        </button>
                        {esCustom && (
                          <button
                            onClick={() => handleResetGlobal(cat)}
                            disabled={!puedeEditar || isPending}
                            title={motivoBloqueo ?? 'Desde esta semana rige el precio global (y lo sigue si cambia)'}
                            className={`${btn} ml-1 bg-gris text-gris-dark hover:bg-azul-light hover:text-azul`}
                          >
                            ↺ Global
                          </button>
                        )}
                        {hist.length > 0 && (
                          <button
                            onClick={() => { setHistorialAbierto(verHist ? null : cat.id); setEditorAbierto(null) }}
                            className={`${btn} ml-1 ${verHist ? 'bg-azul text-white' : 'text-azul hover:bg-gris'}`}
                          >
                            Historial ({hist.length})
                          </button>
                        )}
                      </td>
                    </tr>

                    {editando && (
                      <tr className="border-b border-gris bg-gris/30">
                        <td colSpan={5} className="py-2 px-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Semana</span>
                            <select
                              value={state.viernes}
                              onChange={e => updateSemState(cat.id, 'viernes', e.target.value)}
                              className="text-xs px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg outline-none focus:border-naranja bg-white font-semibold cursor-pointer"
                            >
                              {semanas.map(vie => {
                                const key = toISO(vie)
                                const guardada = getTarifaEnSem(cat.id, key)
                                return (
                                  <option key={key} value={key}>
                                    {getSemLabel(vie)}
                                    {key === viernesActual ? ' ← Actual' : ''}
                                    {guardada ? (guardada.vh === null ? ' · global' : ` · ${fmt(guardada.vh)}`) : ''}
                                  </option>
                                )
                              })}
                            </select>
                            <span className="text-sm text-gris-dark font-bold">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoFocus
                              value={state.value}
                              onChange={e => updateSemState(cat.id, 'value', e.target.value)}
                              placeholder={tarifaEnSemSel && tarifaEnSemSel.vh !== null ? String(tarifaEnSemSel.vh) : String(cat.vh)}
                              onKeyDown={e => { if (e.key === 'Enter' && puedeEditar) handleSave(cat); if (e.key === 'Escape') setEditorAbierto(null) }}
                              className="w-28 border-b-2 border-gris-mid focus:border-naranja outline-none bg-transparent font-mono font-bold text-verde text-sm py-1 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-xs text-gris-dark">/h</span>
                            <button
                              onClick={() => handleSave(cat)}
                              disabled={!puedeEditar || !state.value || isPending}
                              className="px-3 py-1 bg-naranja text-white text-xs font-bold rounded-lg hover:bg-naranja-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              ✓ Guardar
                            </button>
                            <button
                              onClick={() => setEditorAbierto(null)}
                              className="px-2 py-1 text-xs font-bold text-gris-dark hover:text-carbon"
                            >
                              Cancelar
                            </button>
                            {tarifaEnSemSel && (
                              <span className="text-[10px] text-naranja-dark font-semibold">
                                {tarifaEnSemSel.vh === null
                                  ? 'Esa semana ya vuelve al global: se sobreescribe.'
                                  : `Esa semana ya tiene ${fmt(tarifaEnSemSel.vh)}/h: se sobreescribe.`}
                              </span>
                            )}
                            {state.viernes < viernesActual && (
                              <span className="text-[10px] text-rojo font-bold">
                                ⚠ Semana anterior a la actual: recalcula costos ya cerrados desde esa semana.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {verHist && (
                      <tr className="border-b border-gris">
                        <td colSpan={5} className="py-1 px-2">
                          <ul className="text-[11px] divide-y divide-gris">
                            {hist.map((t, i) => (
                              <li
                                key={t.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 cursor-pointer hover:bg-gris rounded px-1"
                                title="Click para cargar un precio en esa semana"
                                onClick={() => { updateSemState(cat.id, 'viernes', t.desde); setEditorAbierto(cat.id); setHistorialAbierto(null) }}
                              >
                                <span className="text-gris-dark w-20">{i === 0 ? <strong className="text-carbon">Vigente</strong> : 'Anterior'}</span>
                                <span className="font-mono">desde {fmtCorta(t.desde)}</span>
                                <span className="font-mono font-bold text-carbon">{t.vh === null ? '↺ global' : `${fmt(t.vh)}/h`}</span>
                                {t.updated_by && (
                                  <span className="text-[10px] text-gris-dark">
                                    ✎ {perfiles.get(t.updated_by) ?? '…'}
                                    {t.updated_at && <> · {new Date(t.updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</>}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
