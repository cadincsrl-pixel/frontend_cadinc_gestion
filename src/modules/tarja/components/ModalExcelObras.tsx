'use client'

import { useMemo, useState } from 'react'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { exportarExcelObras } from '@/lib/utils/excel'
import { useToast } from '@/components/ui/Toast'
import { getSemLabel, getViernes, toISO } from '@/lib/utils/dates'
import type { Obra, Personal, Categoria, Hora, Tarifa, Cierre, Certificacion, Contratista } from '@/types/domain.types'

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

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

export function ModalExcelObras({
  open, onClose, obras, personal, categorias,
  horas, tarifas, cierres, certificaciones, contratistas, obraActual,
}: Props) {
  const toast = useToast()
  const [semFiltro,  setSemFiltro]  = useState('')
  const [obrasSelec, setObrasSelec] = useState<string[]>(obras.map(o => o.cod))

  const todasSems = [...new Set([
    ...horas.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
    ...certificaciones.map(c => c.sem_key),
  ])].sort((a, b) => b.localeCompare(a))

  function toggleObra(cod: string) {
    setObrasSelec(prev =>
      prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]
    )
  }

  // ── Preview calculado ──
  const preview = useMemo(() => {
    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))

    const horasFilt = horas.filter(h => {
      if (!obrasTarget.some(o => o.cod === h.obra_cod)) return false
      if (!semFiltro) return true
      return toISO(getViernes(new Date(h.fecha + 'T12:00:00'))) === semFiltro
    })

    const certsFilt = certificaciones.filter(c => {
      if (!obrasTarget.some(o => o.cod === c.obra_cod)) return false
      if (!semFiltro) return true
      return c.sem_key === semFiltro
    })

    const totalHs      = horasFilt.reduce((s, h) => s + h.horas, 0)
    const totalCertif  = certsFilt.reduce((s, c) => s + c.monto, 0)
    const operarios    = new Set(horasFilt.map(h => h.leg)).size
    const contratNum   = new Set(certsFilt.map(c => c.contrat_id)).size
    const semanas      = new Set([
      ...horasFilt.map(h => toISO(getViernes(new Date(h.fecha + 'T12:00:00')))),
      ...certsFilt.map(c => c.sem_key),
    ]).size
    const cerradas     = cierres.filter(c =>
      obrasTarget.some(o => o.cod === c.obra_cod) &&
      c.estado === 'cerrado' &&
      (!semFiltro || c.sem_key === semFiltro)
    ).length

    // Costo operarios aproximado (tarifa global)
    const costoOp = horasFilt.reduce((sum, h) => {
      const p   = personal.find(x => x.leg === h.leg)
      if (!p) return sum
      const tarOb = tarifas
        .filter(t => t.obra_cod === h.obra_cod && t.cat_id === p.cat_id && t.desde <= h.fecha)
        .sort((a, b) => b.desde.localeCompare(a.desde))[0]
      const cat = categorias.find(c => c.id === p.cat_id)
      return sum + h.horas * (tarOb?.vh ?? cat?.vh ?? 0)
    }, 0)

    return { totalHs, totalCertif, costoOp, operarios, contratNum, semanas, cerradas, obrasCount: obrasTarget.length }
  }, [obrasSelec, semFiltro, horas, certificaciones, cierres, personal, categorias, tarifas, obras])

  function handleExportar() {
    if (!obrasSelec.length) { toast('Seleccioná al menos una obra', 'err'); return }
    const obrasTarget = obras.filter(o => obrasSelec.includes(o.cod))
    exportarExcelObras(obrasTarget, personal, categorias, horas, tarifas, cierres, certificaciones, contratistas, semFiltro)
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
          <Button variant="primary" onClick={handleExportar} disabled={!obrasSelec.length}>
            📊 Exportar Excel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">

        {/* Filtro semana */}
        <Select
          label="Filtrar por semana (opcional)"
          options={[
            { value: '', label: 'Todas las semanas' },
            ...todasSems.map(sk => ({
              value: sk,
              label: getSemLabel(new Date(sk + 'T12:00:00')),
            })),
          ]}
          value={semFiltro}
          onChange={e => setSemFiltro(e.target.value)}
          hint="Dejá vacío para exportar todo el historial"
        />

        {/* Selección de obras */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Obras a incluir ({obrasSelec.length}/{obras.length})
          </div>
          <div className="flex gap-1 mb-2">
            <button onClick={() => setObrasSelec(obras.map(o => o.cod))} className="text-xs font-bold text-azul hover:text-naranja transition-colors px-2 py-1 rounded hover:bg-gris">✓ Todas</button>
            <button onClick={() => setObrasSelec([])} className="text-xs font-bold text-gris-dark hover:text-carbon transition-colors px-2 py-1 rounded hover:bg-gris">✕ Ninguna</button>
            {obraActual && (
              <button onClick={() => setObrasSelec([obraActual])} className="text-xs font-bold text-naranja hover:text-naranja-dark transition-colors px-2 py-1 rounded hover:bg-naranja-light">⊙ Obra actual</button>
            )}
          </div>
          <div className="bg-gris rounded-xl p-3 max-h-44 overflow-y-auto flex flex-col gap-0.5">
            {obras.map(o => (
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
            ))}
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
                {preview.obrasCount} obra{preview.obrasCount !== 1 ? 's' : ''} · {semFiltro ? getSemLabel(new Date(semFiltro + 'T12:00:00')) : 'Todo el historial'}
              </span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white">
              <StatCell icon="⏱" label="Horas totales" value={`${preview.totalHs.toLocaleString('es-AR')}hs`} color="azul" />
              <StatCell icon="👷" label="Operarios"     value={String(preview.operarios)} color="naranja" />
              <StatCell icon="📅" label="Semanas"       value={String(preview.semanas)} color="azul" />
            </div>

            <div className="grid grid-cols-3 divide-x divide-gris-mid bg-white border-t border-gris-mid">
              <StatCell icon="💰" label="Costo op."     value={fmtM(preview.costoOp)} color="verde" />
              <StatCell icon="🔧" label="Contratistas"  value={String(preview.contratNum)} color="purple" />
              <StatCell icon="✓"  label="Sem. cerradas" value={String(preview.cerradas)} color="verde" />
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
    azul:   'text-azul',
    naranja: 'text-naranja-dark',
    verde:  'text-verde',
    purple: 'text-[#5A2D82]',
  }
  return (
    <div className="flex flex-col items-center py-3 px-2 gap-0.5">
      <span className={`font-mono font-bold text-lg leading-none ${colors[color]}`}>{value}</span>
      <span className="text-[10px] text-gris-dark font-semibold uppercase tracking-wide">{label}</span>
    </div>
  )
}