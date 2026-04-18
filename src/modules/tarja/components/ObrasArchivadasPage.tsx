'use client'

import { useState, useMemo } from 'react'
import { useObrasArchivadas, useDesarchivarObra } from '@/modules/tarja/hooks/useObras'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useContratistasObra, useCertificacionesObra } from '@/modules/tarja/hooks/useContratistas'
import { apiGet } from '@/lib/api/client'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import type { Obra, Hora } from '@/types/domain.types'

// ── Panel de detalle de una obra archivada ──────────────────────────────────
function ObraArchivadasDetalle({ obra }: { obra: Obra }) {
  const [tab, setTab] = useState<'horas' | 'contratistas'>('horas')
  const { data: personal = [] } = usePersonal()
  const { data: contratistas = [] } = useContratistasObra(obra.cod)
  const { data: certificaciones = [] } = useCertificacionesObra(obra.cod)

  const { data: horas = [], isLoading: loadingHoras } = useQuery({
    queryKey: ['horas', obra.cod, 'all'],
    queryFn: () => apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obra.cod)}`),
  })

  // Agrupar horas por semana (viernes)
  const horasPorSemana = useMemo(() => {
    const map = new Map<string, Hora[]>()
    for (const h of horas) {
      // Calcular el viernes de esa fecha
      const d = new Date(h.fecha + 'T12:00:00')
      const diff = (5 - d.getDay() + 7) % 7
      d.setDate(d.getDate() + diff)
      const key = d.toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(h)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [horas])

  // Agrupar certificaciones por sem_key
  const certPorSemana = useMemo(() => {
    const map = new Map<string, typeof certificaciones>()
    for (const c of certificaciones) {
      if (!map.has(c.sem_key)) map.set(c.sem_key, [])
      map.get(c.sem_key)!.push(c)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [certificaciones])

  return (
    <div className="mt-3 border-t border-gris pt-3">
      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(['horas', 'contratistas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
              tab === t ? 'bg-azul text-white' : 'bg-gris text-gris-dark hover:bg-gris-mid'
            }`}
          >
            {t === 'horas' ? `Personal (${horas.length} registros)` : `Contratistas (${certificaciones.length} cert.)`}
          </button>
        ))}
      </div>

      {tab === 'horas' && (
        loadingHoras ? (
          <div className="text-xs text-gris-dark">Cargando...</div>
        ) : horasPorSemana.length === 0 ? (
          <div className="text-xs text-gris-dark italic">Sin registros de horas</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {horasPorSemana.map(([semKey, semHoras]) => {
              const totalH = semHoras.reduce((s, h) => s + h.horas, 0)
              const legs = [...new Set(semHoras.map(h => h.leg))]
              return (
                <div key={semKey} className="bg-gris rounded-lg p-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-azul">Sem. {semKey}</span>
                    <span className="text-xs font-mono text-gris-dark">{totalH}h — {legs.length} personas</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {legs.map(leg => {
                      const p = personal.find(x => x.leg === leg)
                      const h = semHoras.filter(x => x.leg === leg).reduce((s, x) => s + x.horas, 0)
                      return (
                        <span key={leg} className="text-[10px] bg-white rounded px-1.5 py-0.5 font-mono">
                          {p?.nom ?? leg}: {h}h
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'contratistas' && (
        certPorSemana.length === 0 ? (
          <div className="text-xs text-gris-dark italic">Sin certificaciones de contratistas</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {certPorSemana.map(([semKey, certs]) => (
              <div key={semKey} className="bg-gris rounded-lg p-2">
                <div className="text-xs font-bold text-azul mb-1">Sem. {semKey}</div>
                <div className="flex flex-col gap-0.5">
                  {certs.map((cert: any) => {
                    const contrat = contratistas.find((c: any) => c.contrat_id === cert.contrat_id)
                    return (
                      <div key={cert.id} className="flex justify-between text-[10px]">
                        <span className="font-mono">{(contrat as any)?.contratistas?.nom ?? `ID ${cert.contrat_id}`}</span>
                        <span className="text-gris-dark">${cert.monto?.toLocaleString('es-AR') ?? '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ── Fila de obra archivada ──────────────────────────────────────────────────
function ObraArchivadasRow({ obra }: { obra: Obra }) {
  const [expandida, setExpandida] = useState(false)
  const toast = useToast()
  const { mutate: desarchivar, isPending } = useDesarchivarObra()

  function handleDesarchivar(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`¿Desarchivar "${obra.nom}"? Volverá a aparecer en la lista de obras activas.`)) return
    desarchivar(obra.cod, {
      onSuccess: () => toast('✓ Obra desarchivada', 'ok'),
      onError: () => toast('Error al desarchivar', 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card p-4 border-l-[5px] border-gris-mid">
      <div
        className="flex items-start justify-between gap-3 flex-wrap cursor-pointer"
        onClick={() => setExpandida(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-gris-dark bg-gris px-2 py-0.5 rounded">
              {obra.cod}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gris text-gris-dark">
              Archivada
            </span>
          </div>
          <h2 className="font-bold text-carbon text-base">{obra.nom}</h2>
          {obra.dir && <p className="text-sm text-gris-dark mt-0.5">{obra.dir}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {obra.fecha_archivo && (
            <span className="text-xs text-gris-dark font-mono hidden sm:block">
              {obra.fecha_archivo}
            </span>
          )}
          <button
            onClick={handleDesarchivar}
            disabled={isPending}
            className="text-xs font-bold px-3 py-1 rounded bg-azul text-white hover:bg-azul/80 transition-colors disabled:opacity-50"
          >
            {isPending ? '...' : '↩ Desarchivar'}
          </button>
          <span className="text-gris-dark text-sm select-none">{expandida ? '▲' : '▼'}</span>
        </div>
      </div>

      {expandida && <ObraArchivadasDetalle obra={obra} />}
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export function ObrasArchivadasPage() {
  const { data: obras = [], isLoading } = useObrasArchivadas()
  const [busqueda, setBusqueda] = useState('')

  const filtradas = obras.filter(o =>
    o.nom.toLowerCase().includes(busqueda.toLowerCase()) ||
    o.cod.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[2rem] tracking-wider text-azul">
          OBRAS ARCHIVADAS
        </h1>
        <p className="text-sm text-gris-dark mt-0.5">
          {obras.length} obras en el historial
        </p>
      </div>

      {obras.length > 0 && (
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border-[1.5px] border-gris-mid rounded-lg font-sans text-sm outline-none transition-colors focus:border-naranja bg-white"
        />
      )}

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          {busqueda ? 'No se encontraron resultados' : 'No hay obras archivadas.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtradas.map(obra => (
            <ObraArchivadasRow key={obra.cod} obra={obra} />
          ))}
        </div>
      )}
    </div>
  )
}
