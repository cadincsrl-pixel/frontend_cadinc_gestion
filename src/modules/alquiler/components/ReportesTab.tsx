'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  useObrasAlquiler,
  useObraMaquinas,
  usePartes,
  useReporteHoras,
} from '../hooks/useAlquiler'
import { fmtHoras } from '../utils/horas'
import { MAQUINA_TIPO_LABEL, type MaquinaTipo, type ObraMaquina, type Parte } from '../types'

// ── Helpers de fecha (TZ-safe, sin new Date(iso) que corre el día) ──

/** dd/mm/yyyy desde 'YYYY-MM-DD' por split (NO new Date: corrimiento TZ). */
function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

/** Rango del mes actual (primer y último día) como strings 'YYYY-MM-DD'. */
function rangoMesActual(): { desde: string; hasta: string } {
  const hoy = new Date() // hora local del navegador
  const y = hoy.getFullYear()
  const month = hoy.getMonth() // 0-based
  const mm = String(month + 1).padStart(2, '0')
  const ultimoDia = new Date(y, month + 1, 0).getDate()
  return {
    desde: `${y}-${mm}-01`,
    hasta: `${y}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

/** Label legible del tipo crudo del enum (cae al crudo si no matchea). */
function tipoLabel(tipo: string | null): string {
  if (!tipo) return '—'
  return MAQUINA_TIPO_LABEL[tipo as MaquinaTipo] ?? tipo
}

// ─────────────────────────── Tab raíz ───────────────────────────
type SubVista = 'horas' | 'resumen'

export function ReportesTab() {
  const [vista, setVista] = useState<SubVista>('horas')

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-toggle entre los dos reportes */}
      <div className="bg-white rounded-card shadow-card p-2 flex gap-2">
        <PillButton activo={vista === 'horas'} onClick={() => setVista('horas')}>
          ⏱ Horas por máquina
        </PillButton>
        <PillButton activo={vista === 'resumen'} onClick={() => setVista('resumen')}>
          📅 Resumen por obra
        </PillButton>
      </div>

      {vista === 'horas' ? <ReporteHorasView /> : <ResumenPorObraView />}
    </div>
  )
}

function PillButton({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors ${
        activo
          ? 'bg-azul text-white'
          : 'bg-gris text-gris-dark hover:bg-gris-mid hover:text-carbon'
      }`}
    >
      {children}
    </button>
  )
}

// ═══════════════════ Reporte A — Horas por máquina ═══════════════════
function ReporteHorasView() {
  const { data: obras = [], isLoading: loadingObras } = useObrasAlquiler()

  const [obraId, setObraId] = useState<number | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const filtro = useMemo(() => {
    const f: { obra_id?: number; desde?: string; hasta?: string } = {}
    if (obraId != null) f.obra_id = obraId
    if (desde) f.desde = desde
    if (hasta) f.hasta = hasta
    return f
  }, [obraId, desde, hasta])

  const { data: filas = [], isLoading, isError } = useReporteHoras(filtro)

  const opcionesObra = useMemo(
    () => [
      { value: '', label: 'Todas las obras' },
      ...obras.map(o => ({
        value: String(o.id),
        label: o.estado === 'cerrada' ? `${o.nombre} (cerrada)` : o.nombre,
      })),
    ],
    [obras],
  )

  const totalHoras = useMemo(
    () => Math.round(filas.reduce((acc, f) => acc + f.total_horas, 0) * 100) / 100,
    [filas],
  )

  // Para escalar las barras: la máquina con más horas ocupa el 100%.
  const maxHoras = useMemo(
    () => filas.reduce((m, f) => Math.max(m, f.total_horas), 0),
    [filas],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <Select
            label="Obra"
            options={opcionesObra}
            value={obraId != null ? String(obraId) : ''}
            onChange={e => setObraId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingObras}
          />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* Estados */}
      {isLoading ? (
        <SpinnerCard texto="Calculando horas por máquina..." />
      ) : isError ? (
        <ErrorCard />
      ) : filas.length === 0 ? (
        <EmptyCard texto="No hay horas cargadas para los filtros seleccionados." />
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {/* Tabla con barras */}
          <div className="divide-y divide-gris">
            {filas.map(f => (
              <div key={f.maquina_id} className="p-3 sm:p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-carbon truncate">
                    🚜 {f.maquina_nombre ?? '—'}
                  </div>
                  <div className="text-xs text-gris-dark">
                    {tipoLabel(f.maquina_tipo)} · {f.dias} {f.dias === 1 ? 'día' : 'días'}
                  </div>
                  {/* Barra proporcional */}
                  <div className="mt-1.5 h-1.5 w-full bg-gris rounded-full overflow-hidden">
                    <div
                      className="h-full bg-naranja rounded-full"
                      style={{ width: maxHoras > 0 ? `${(f.total_horas / maxHoras) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-xl tracking-wider text-azul whitespace-nowrap">
                    {fmtHoras(f.total_horas)} hs
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total general */}
          <div className="bg-azul text-white px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wide">
              Total general ({filas.length} {filas.length === 1 ? 'máquina' : 'máquinas'})
            </span>
            <span className="font-display text-2xl tracking-wider whitespace-nowrap">
              {fmtHoras(totalHoras)} hs
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ Reporte B — Resumen por obra (día × máquina) ═══════════════
function ResumenPorObraView() {
  const { data: obras = [], isLoading: loadingObras } = useObrasAlquiler()

  const [obraId, setObraId] = useState<number | null>(null)
  const mesActual = useMemo(rangoMesActual, [])
  const [desde, setDesde] = useState(mesActual.desde)
  const [hasta, setHasta] = useState(mesActual.hasta)

  // Default a la primera obra activa cuando cargan (mismo patrón que PartesTab).
  const primeraObraId = obras.length > 0
    ? (obras.find(o => o.estado === 'activa') ?? obras[0]!).id
    : null
  useEffect(() => {
    if (obraId == null && primeraObraId != null) {
      setObraId(primeraObraId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeraObraId])

  const { data: maquinas = [], isLoading: loadingMaquinas } = useObraMaquinas(obraId)

  const filtroPartes = useMemo(
    () => (obraId != null ? { obra_id: obraId, desde, hasta } : {}),
    [obraId, desde, hasta],
  )
  const { data: partes = [], isLoading: loadingPartes, isError } = usePartes(
    filtroPartes,
    obraId != null,
  )

  const opcionesObra = useMemo(
    () => obras.map(o => ({
      value: String(o.id),
      label: o.estado === 'cerrada' ? `${o.nombre} (cerrada)` : o.nombre,
    })),
    [obras],
  )

  const obraSel = obras.find(o => o.id === obraId) ?? null
  const cargando = loadingMaquinas || loadingPartes

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <Select
            label="Obra"
            options={opcionesObra}
            placeholder={loadingObras ? 'Cargando...' : 'Elegí una obra'}
            value={obraId != null ? String(obraId) : ''}
            onChange={e => setObraId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingObras || obras.length === 0}
          />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="w-full sm:w-44">
          <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* Estados */}
      {obras.length === 0 && !loadingObras ? (
        <EmptyCard texto="No hay obras de alquiler. Creá una en el tab Obras." />
      ) : obraId == null ? (
        <EmptyCard texto="Elegí una obra para ver el resumen del período." />
      ) : cargando ? (
        <SpinnerCard texto="Armando el resumen..." />
      ) : isError ? (
        <ErrorCard />
      ) : (
        <ResumenGrilla
          partes={partes}
          maquinas={maquinas}
          obraNombre={obraSel?.nombre ?? ''}
        />
      )}
    </div>
  )
}

// ── Grilla pivot: filas = fechas, columnas = máquinas ──
function ResumenGrilla({
  partes,
  maquinas,
  obraNombre,
}: {
  partes: Parte[]
  maquinas: ObraMaquina[]
  obraNombre: string
}) {
  // Pivot: fecha → maquina_id → horas. Solo fechas con al menos un parte.
  const { fechas, horasPorFechaMaquina } = useMemo(() => {
    const map = new Map<string, Map<number, number>>()
    for (const p of partes) {
      let fila = map.get(p.fecha)
      if (!fila) {
        fila = new Map<number, number>()
        map.set(p.fecha, fila)
      }
      // Si hubiera más de un parte por (fecha, máquina) — no debería —, sumamos.
      fila.set(p.maquina_id, (fila.get(p.maquina_id) ?? 0) + p.horas)
    }
    const fechasOrdenadas = Array.from(map.keys()).sort() // 'YYYY-MM-DD' ordena lexicográfico = cronológico
    return { fechas: fechasOrdenadas, horasPorFechaMaquina: map }
  }, [partes])

  // Total por máquina (columna) y total general.
  const { totalPorMaquina, totalGeneral } = useMemo(() => {
    const porMaquina = new Map<number, number>()
    let general = 0
    for (const fila of horasPorFechaMaquina.values()) {
      for (const [mid, hs] of fila.entries()) {
        porMaquina.set(mid, (porMaquina.get(mid) ?? 0) + hs)
        general += hs
      }
    }
    return {
      totalPorMaquina: porMaquina,
      totalGeneral: Math.round(general * 100) / 100,
    }
  }, [horasPorFechaMaquina])

  if (fechas.length === 0) {
    return (
      <EmptyCard
        texto={
          obraNombre
            ? `La obra «${obraNombre}» no tiene partes en el período seleccionado.`
            : 'No hay partes en el período seleccionado.'
        }
      />
    )
  }

  const totalFila = (fecha: string): number => {
    const fila = horasPorFechaMaquina.get(fecha)
    if (!fila) return 0
    let t = 0
    for (const hs of fila.values()) t += hs
    return Math.round(t * 100) / 100
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-azul text-white">
            <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[11px] sticky left-0 bg-azul z-10">
              Fecha
            </th>
            {maquinas.map(om => (
              <th
                key={om.id}
                className="px-3 py-2 font-bold text-[11px] text-center whitespace-nowrap"
                title={MAQUINA_TIPO_LABEL[om.maquina.tipo]}
              >
                {om.maquina.nombre}
              </th>
            ))}
            <th className="px-3 py-2 font-bold uppercase tracking-wide text-[11px] text-right whitespace-nowrap bg-azul-mid sticky right-0 z-10">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {fechas.map((fecha, idx) => {
            const fila = horasPorFechaMaquina.get(fecha)
            const filaBg = idx % 2 === 0 ? 'bg-white' : 'bg-gris'
            return (
              <tr key={fecha} className={filaBg}>
                <td className={`px-3 py-2 font-bold text-carbon whitespace-nowrap sticky left-0 z-10 ${filaBg}`}>
                  {fmtFecha(fecha)}
                </td>
                {maquinas.map(om => {
                  const hs = fila?.get(om.maquina_id)
                  return (
                    <td
                      key={om.id}
                      className={`px-3 py-2 text-center whitespace-nowrap ${
                        hs != null ? 'text-carbon font-semibold' : 'text-gris-mid'
                      }`}
                    >
                      {hs != null ? `${fmtHoras(hs)}` : '—'}
                    </td>
                  )
                })}
                <td className={`px-3 py-2 text-right font-display tracking-wider text-azul whitespace-nowrap sticky right-0 z-10 ${filaBg}`}>
                  {fmtHoras(totalFila(fecha))}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-azul-mid text-white">
            <td className="px-3 py-2 font-bold uppercase tracking-wide text-[11px] sticky left-0 z-10 bg-azul-mid">
              Total máquina
            </td>
            {maquinas.map(om => {
              const t = totalPorMaquina.get(om.maquina_id) ?? 0
              return (
                <td key={om.id} className="px-3 py-2 text-center font-bold whitespace-nowrap">
                  {t > 0 ? fmtHoras(Math.round(t * 100) / 100) : '—'}
                </td>
              )
            })}
            <td className="px-3 py-2 text-right font-display text-lg tracking-wider whitespace-nowrap sticky right-0 z-10 bg-azul-mid">
              {fmtHoras(totalGeneral)} hs
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─────────────────────────── Estados compartidos ───────────────────────────
function SpinnerCard({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
      <span className="inline-flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        {texto}
      </span>
    </div>
  )
}

function ErrorCard() {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-rojo text-sm italic">
      No se pudo cargar el reporte. Reintentá en unos segundos.
    </div>
  )
}

function EmptyCard({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
      {texto}
    </div>
  )
}
