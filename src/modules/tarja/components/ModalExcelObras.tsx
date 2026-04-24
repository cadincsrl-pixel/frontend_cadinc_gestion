'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { exportarExcelObras } from '@/lib/utils/excel'
import { getVHConCatObra } from '@/lib/utils/costos'
import { useToast } from '@/components/ui/Toast'
import { getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import type { Obra, Personal, Categoria, Hora, Tarifa, Cierre, Certificacion, Contratista } from '@/types/domain.types'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api/client'
import { useHsExtrasAll } from '../hooks/useHsExtras'


interface Props {
  open: boolean
  onClose: () => void
  obras: Obra[]
  personal: Personal[]
  categorias: Categoria[]
  horas: Hora[]
  tarifas: Tarifa[]
  cierres: Cierre[]
  certificaciones: Certificacion[]
  contratistas: Contratista[]
  obraActual?: string
}

function fmtM(n: number) { return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR') }

export function ModalExcelObras({
  open, onClose, obras, personal, categorias,
  horas, tarifas, cierres, certificaciones, contratistas, obraActual,
}: Props) {
  const toast = useToast()
  const [semModo, setSemModo] = useState<'todas' | 'una' | 'rango'>('todas')
  const [semUna, setSemUna] = useState('')
  const [semDesde, setSemDesde] = useState('')
  const [semHasta, setSemHasta] = useState('')
  const [obrasSelec, setObrasSelec] = useState<string[]>(obras.map(o => o.cod))
  const [busqueda, setBusqueda] = useState('')

  const busquedaNorm = busqueda.trim().toLowerCase()
  const obrasVisibles = useMemo(() => {
    if (!busquedaNorm) return obras
    return obras.filter(o =>
      o.cod.toLowerCase().includes(busquedaNorm) ||
      o.nom.toLowerCase().includes(busquedaNorm)
    )
  }, [obras, busquedaNorm])

  const todasSems = [...new Set([
    ...horas.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
    ...certificaciones.map(c => c.sem_key),
  ])].sort((a, b) => b.localeCompare(a))

  // Filtro efectivo (desde/hasta) según modo seleccionado.
  const filtroSem = semModo === 'todas'
    ? { desde: '', hasta: '' }
    : semModo === 'una'
      ? { desde: semUna, hasta: semUna }
      : { desde: semDesde, hasta: semHasta }

  const rangoInvalido = semModo === 'rango' && !!semDesde && !!semHasta && semDesde > semHasta
  const rangoIncompleto = semModo === 'rango' && (!semDesde || !semHasta)
  const unaSinSem = semModo === 'una' && !semUna

  function toggleObra(cod: string) {
    setObrasSelec(prev =>
      prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]
    )
  }

  const { data: todasCatObra = [] } = useQuery({
    queryKey: ['cat-obra', 'all'],
    queryFn: () => apiGet<Array<{ obra_cod: string; leg: string; cat_id: number; desde: string }>>('/api/cat-obra/all'),
  })

  const { data: todasHsExtras = [] } = useHsExtrasAll()

  // Wrapper que cierra sobre la data del componente.
  const getVHConCatObraLocal = (obraCod: string, leg: string, fechaRef: string) =>
    getVHConCatObra(todasCatObra, personal, categorias, tarifas, obraCod, leg, fechaRef)


  // ── Preview calculado ──
  const preview = useMemo(() => {
    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))
    const { desde, hasta } = filtroSem
    const semOk = (sk: string) => !desde || (sk >= desde && sk <= hasta)

    const horasFilt = horas.filter(h => {
      if (!obrasTarget.some(o => o.cod === h.obra_cod)) return false
      return semOk(toISO(getViernes(new Date(h.fecha + 'T12:00:00'))))
    })

    const certsFilt = certificaciones.filter(c => {
      if (!obrasTarget.some(o => o.cod === c.obra_cod)) return false
      return semOk(c.sem_key)
    })

    const hsExtrasFilt = todasHsExtras.filter(x => {
      if (!obrasTarget.some(o => o.cod === x.obra_cod)) return false
      if (!semOk(x.sem_key)) return false
      return x.hs > 0
    })

    const totalHs = horasFilt.reduce((s, h) => s + h.horas, 0)
      + hsExtrasFilt.reduce((s, x) => s + x.hs, 0)
    const totalCertif = certsFilt.reduce((s, c) => s + c.monto, 0)
    const operarios = new Set([
      ...horasFilt.map(h => h.leg),
      ...hsExtrasFilt.map(x => x.leg),
    ]).size
    const contratNum = new Set(certsFilt.map(c => c.contrat_id)).size
    const semanas = new Set([
      ...horasFilt.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
      ...certsFilt.map(c => c.sem_key),
      ...hsExtrasFilt.map(x => x.sem_key),
    ]).size
    const cerradas = cierres.filter(c =>
      obrasTarget.some(o => o.cod === c.obra_cod) &&
      c.estado === 'cerrado' &&
      semOk(c.sem_key)
    ).length

    // Costo operarios aproximado (tarifa global) — incluye hs extras
    const costoHoras = horasFilt.reduce((sum, h) => {
      const sk = toISO(getViernes(new Date(h.fecha + 'T12:00:00')))
      const vh = getVHConCatObraLocal(h.obra_cod, h.leg, sk)
      return sum + h.horas * vh
    }, 0)
    const costoExtras = hsExtrasFilt.reduce((sum, x) => {
      const vh = getVHConCatObraLocal(x.obra_cod, x.leg, x.sem_key)
      return sum + x.hs * vh
    }, 0)
    const costoOp = costoHoras + costoExtras

    return { totalHs, totalCertif, costoOp, operarios, contratNum, semanas, cerradas, obrasCount: obrasTarget.length }
  }, [obrasSelec, filtroSem.desde, filtroSem.hasta, horas, certificaciones, cierres, personal, categorias, tarifas, obras, todasCatObra, todasHsExtras])

  function handleExportar() {
    if (!obrasSelec.length) { toast('Seleccioná al menos una obra', 'err'); return }
    if (rangoInvalido) { toast('La semana "desde" debe ser anterior o igual a "hasta"', 'err'); return }
    if (rangoIncompleto) { toast('Completá ambas semanas del rango', 'err'); return }
    if (unaSinSem) { toast('Seleccioná una semana', 'err'); return }
    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))
    exportarExcelObras(
      obrasTarget, personal, categorias, horas, tarifas, cierres,
      certificaciones, contratistas, filtroSem.desde, todasCatObra, filtroSem.hasta,
      todasHsExtras,
    )
    toast('📊 Excel exportado', 'ok')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📊 EXPORTAR EXCEL OBRAS"
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={handleExportar}
            disabled={!obrasSelec.length || rangoInvalido || rangoIncompleto || unaSinSem}
          >
            📊 Exportar Excel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Filtro semana */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Filtrar por semana
          </div>
          <div className="flex gap-1 mb-3 bg-gris rounded-xl p-1">
            {([
              ['todas', 'Todas'],
              ['una', 'Una semana'],
              ['rango', 'Rango'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSemModo(val)}
                className={`flex-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  semModo === val
                    ? 'bg-azul text-white shadow-sm'
                    : 'text-gris-dark hover:text-carbon hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {semModo === 'una' && (
            <Select
              label="Semana"
              options={[
                { value: '', label: '— Elegir semana —' },
                ...todasSems.map(sk => ({
                  value: sk,
                  label: getSemLabel(new Date(sk + 'T12:00:00')),
                })),
              ]}
              value={semUna}
              onChange={e => setSemUna(e.target.value)}
            />
          )}

          {semModo === 'rango' && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Desde"
                options={[
                  { value: '', label: '— Desde —' },
                  ...todasSems.map(sk => ({
                    value: sk,
                    label: getSemLabel(new Date(sk + 'T12:00:00')),
                  })),
                ]}
                value={semDesde}
                onChange={e => setSemDesde(e.target.value)}
              />
              <Select
                label="Hasta"
                options={[
                  { value: '', label: '— Hasta —' },
                  ...todasSems.map(sk => ({
                    value: sk,
                    label: getSemLabel(new Date(sk + 'T12:00:00')),
                  })),
                ]}
                value={semHasta}
                onChange={e => setSemHasta(e.target.value)}
              />
            </div>
          )}

          {rangoInvalido && (
            <p className="text-xs text-rojo font-semibold mt-2">
              La semana "Desde" debe ser anterior o igual a "Hasta".
            </p>
          )}
          {semModo === 'todas' && (
            <p className="text-xs text-gris-dark mt-1">Exporta todo el historial disponible.</p>
          )}
        </div>

        {/* Selección de obras */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Obras a incluir ({obrasSelec.length}/{obras.length})
            {busquedaNorm && (
              <span className="ml-1 text-gris-mid font-semibold normal-case tracking-normal">
                · {obrasVisibles.length} visible{obrasVisibles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => {
                if (busquedaNorm) {
                  const visibleCods = obrasVisibles.map(o => o.cod)
                  setObrasSelec(prev => Array.from(new Set([...prev, ...visibleCods])))
                } else {
                  setObrasSelec(obras.map(o => o.cod))
                }
              }}
              title={busquedaNorm
                ? 'Agrega a la selección solo las obras visibles (preserva las ya seleccionadas fuera del filtro)'
                : 'Seleccionar todas las obras'}
              className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris"
            >
              ✓ Todas
            </button>
            <button
              onClick={() => {
                if (busquedaNorm) {
                  const visibleCods = new Set(obrasVisibles.map(o => o.cod))
                  setObrasSelec(prev => prev.filter(c => !visibleCods.has(c)))
                } else {
                  setObrasSelec([])
                }
              }}
              title={busquedaNorm
                ? 'Quita de la selección solo las obras visibles'
                : 'Vaciar selección'}
              className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris"
            >
              ✕ Ninguna
            </button>
            {obraActual && (
              <button
                onClick={() => setObrasSelec([obraActual])}
                title="Seleccionar solo la obra actual"
                className="text-xs font-bold text-naranja hover:text-naranja-dark transition-colors px-2 py-1 rounded hover:bg-naranja-light"
              >
                ⊙ Obra actual
              </button>
            )}
          </div>
          <div className="mb-2">
            <Input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape' && busqueda) {
                  // Primera Escape limpia la búsqueda; frenamos la propagación
                  // para que el listener global del Modal no cierre el modal.
                  e.nativeEvent.stopImmediatePropagation()
                  e.stopPropagation()
                  setBusqueda('')
                }
              }}
              placeholder="Buscar obra por código o nombre…"
              className="text-sm"
            />
          </div>
          <div className="bg-gris rounded-xl p-3 max-h-44 overflow-y-auto flex flex-col gap-0.5">
            {obrasVisibles.length === 0 ? (
              <div className="text-center text-xs text-gris-dark italic py-4">
                Sin obras que coincidan con “{busqueda}”
              </div>
            ) : (
              obrasVisibles.map(o => (
                <label key={o.cod} className="flex items-center gap-2 cursor-pointer py-1.5 border-b border-gris-mid/50 last:border-0">
                  <input
                    type="checkbox"
                    checked={obrasSelec.includes(o.cod)}
                    onChange={() => toggleObra(o.cod)}
                    className="accent-azul w-4 h-4 flex-shrink-0"
                  />
                  <span className="font-mono text-[10px] bg-white border border-gris-mid px-1.5 py-0.5 rounded text-azul-mid flex-shrink-0">{o.cod}</span>
                  <span className="font-semibold text-sm text-carbon truncate">{o.nom}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* ── Preview mejorado ── */}
        {obrasSelec.length > 0 && (
          <div className="border border-gris-mid rounded-xl overflow-hidden">
            {/* Header preview */}
            <div className="bg-azul px-4 py-2.5 flex items-center justify-between">
              <span className="text-white text-xs font-bold uppercase tracking-wider">
                Vista previa
              </span>
              <span className="text-white/60 text-xs">
                {preview.obrasCount} obra{preview.obrasCount !== 1 ? 's' : ''} · {
                  semModo === 'todas' ? 'Todo el historial'
                  : semModo === 'una'
                    ? (semUna ? getSemLabel(new Date(semUna + 'T12:00:00')) : 'Sin semana')
                    : (semDesde && semHasta
                        ? `${getSemLabel(new Date(semDesde + 'T12:00:00'))} → ${getSemLabel(new Date(semHasta + 'T12:00:00'))}`
                        : 'Rango incompleto')
                }
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white">
              <StatCell icon="⏱" label="Horas totales" value={`${preview.totalHs.toLocaleString('es-AR')}hs`} color="azul" />
              <StatCell icon="👷" label="Operarios" value={String(preview.operarios)} color="naranja" />
              <StatCell icon="📅" label="Semanas" value={String(preview.semanas)} color="azul" />
            </div>

            <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white border-t border-gris-mid">
              <StatCell icon="💰" label="Costo op." value={fmtM(preview.costoOp)} color="verde" />
              <StatCell icon="🔧" label="Contratistas" value={String(preview.contratNum)} color="purple" />
              <StatCell icon="✓" label="Sem. cerradas" value={String(preview.cerradas)} color="verde" />
            </div>

            {/* Hojas que incluye */}
            <div className="bg-gris px-4 py-2 flex items-center gap-1.5 flex-wrap border-t border-gris-mid">
              {['Resumen', 'Detalle Semanal', 'Contratistas', 'Personal'].map(h => (
                <span key={h} className="text-[10px] font-bold bg-white border border-gris-mid text-gris-dark px-2 py-0.5 rounded-full">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {!obrasSelec.length && (
          <div className="bg-rojo-light border border-rojo/20 rounded-xl px-4 py-3 text-sm text-rojo font-semibold">
            Seleccioná al menos una obra para exportar.
          </div>
        )}

      </div>
    </Modal>
  )
}

function StatCell({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string
}) {
  const colors: Record<string, string> = {
    azul: 'text-azul',
    naranja: 'text-naranja-dark',
    verde: 'text-verde',
    purple: 'text-[#5A2D82]',
  }
  return (
    <div className="flex flex-col items-center py-3 px-2 gap-0.5">
      <span className={`font-mono font-bold text-lg leading-none ${colors[color]}`}>{value}</span>
      <span className="text-[10px] text-gris-dark font-semibold uppercase tracking-wide">{label}</span>
    </div>
  )
}