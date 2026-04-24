'use client'

import { useState, useMemo } from 'react'
import { useQuery }          from '@tanstack/react-query'
import { useCierresObra, useCreateCierre, useUpdateCierre } from '../hooks/useCierres'
import { useTarjaStore }     from '../store/tarja.store'
import { useTarifasObra }    from '../hooks/useTarifas'
import { useCategorias }     from '../hooks/useCategorias'
import { usePersonal }       from '../hooks/usePersonal'
import { useHsExtrasAll }    from '../hooks/useHsExtras'
import {
  getSemDays, toISO, getSemLabel, getViernesCobro, getViernes,
} from '@/lib/utils/dates'
import { calcularTotalesSemana, fmtMonto, fmtHs } from '@/lib/utils/costos'
import { apiGet }            from '@/lib/api/client'
import { ModalDetalleCierre } from './ModalDetalleCierre'
import { Badge }  from '@/components/ui/Badge'
import { Chip }   from '@/components/ui/Chip'
import { useToast }       from '@/components/ui/Toast'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos }    from '@/hooks/usePermisos'
import type { Cierre, Hora, Certificacion, Personal, TarjaHsExtra } from '@/types/domain.types'

interface Props {
  obraCod: string
}

// Modelo derivado: representa una semana con actividad (horas/certs/extras) en
// la obra, combinada con su cierre si existe. Cuando la semana ya pasó su
// jueves de cierre y no tiene row, se considera cerrada automáticamente
// (el flujo real del negocio es: jueves cierra, viernes se paga).
type SemanaEfectiva = {
  semKey: string
  cierre: Cierre | null
  estadoEfectivo: 'pendiente' | 'cerrado'
  esAutomatico: boolean       // true = no hay row pero está auto-cerrada
  esActual: boolean
}

export function CierresSection({ obraCod }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('tarja')
  const { semActual, setSemActual } = useTarjaStore()
  const { data: cierres = [], isLoading: loadingCierres } = useCierresObra(obraCod)
  const { mutate: createCierre, isPending: creating } = useCreateCierre()
  const { mutate: updateCierre, isPending: updating } = useUpdateCierre()
  const [expanded, setExpanded] = useState(true)
  const [detalle, setDetalle] = useState<Cierre | null>(null)

  const semKeyActual = toISO(semActual)
  const perfiles = usePerfilesMap()

  // Datos para calcular totales y detectar semanas con actividad
  const { data: todasHoras    = [], isLoading: loadingHoras } = useQuery({ queryKey: ['horas', 'all'],   queryFn: () => apiGet<Hora[]>('/api/horas/all') })
  const { data: todasCerts    = [], isLoading: loadingCerts } = useQuery({ queryKey: ['certs', 'all'],   queryFn: () => apiGet<Certificacion[]>('/api/contratistas/cert/all') })
  const { data: tarifas       = [] } = useTarifasObra(obraCod)
  const { data: categorias    = [] } = useCategorias()
  const { data: personal      = [] } = usePersonal()
  const { data: todasHsExtras = [] } = useHsExtrasAll() as { data: TarjaHsExtra[] }

  const personalObra = useMemo(() => {
    const legs = new Set(todasHoras.filter(h => h.obra_cod === obraCod).map(h => h.leg))
    return personal.filter((p: Personal) => legs.has(p.leg))
  }, [todasHoras, personal, obraCod])

  // Semanas efectivas: unión de (semanas con horas de la obra + semanas con
  // certs + semanas con hs extras + semanas con cierre existente) cruzada con
  // el estado de cierre derivado (real o automático post-jueves).
  const semanasEfectivas: SemanaEfectiva[] = useMemo(() => {
    const hoyISO = toISO(new Date())
    const keysConActividad = new Set<string>()

    // Horas de la obra
    todasHoras.forEach(h => {
      if (h.obra_cod !== obraCod) return
      const vie = getViernes(new Date(h.fecha + 'T12:00:00'))
      keysConActividad.add(toISO(vie))
    })
    // Certificaciones
    todasCerts.forEach(c => {
      if (c.obra_cod === obraCod) keysConActividad.add(c.sem_key)
    })
    // Hs extras
    todasHsExtras.forEach(e => {
      if (e.obra_cod === obraCod && e.hs > 0) keysConActividad.add(e.sem_key)
    })
    // Cierres ya existentes (por si quedaron filas sin actividad actual — raro
    // pero lo respetamos para no ocultar data)
    cierres.forEach(c => keysConActividad.add(c.sem_key))

    // Mapa para lookup O(1)
    const cierreMap = new Map(cierres.map(c => [c.sem_key, c]))

    return [...keysConActividad]
      .sort((a, b) => b.localeCompare(a))  // más reciente primero
      .map((semKey): SemanaEfectiva => {
        const cierre = cierreMap.get(semKey) ?? null
        const juevesSem = toISO(new Date(new Date(semKey + 'T12:00:00').getTime() + 6 * 86_400_000))
        const juevesPaso = hoyISO > juevesSem

        let estadoEfectivo: 'pendiente' | 'cerrado'
        let esAutomatico = false
        if (cierre) {
          estadoEfectivo = cierre.estado
        } else if (juevesPaso) {
          estadoEfectivo = 'cerrado'
          esAutomatico = true
        } else {
          estadoEfectivo = 'pendiente'
        }

        return {
          semKey,
          cierre,
          estadoEfectivo,
          esAutomatico,
          esActual: semKey === semKeyActual,
        }
      })
  }, [todasHoras, todasCerts, todasHsExtras, cierres, obraCod, semKeyActual])

  function totalesCierre(semKey: string) {
    const vie  = new Date(semKey + 'T12:00:00')
    const days = getSemDays(vie)
    const { totalHs, totalCosto } = calcularTotalesSemana(
      todasHoras, personalObra, categorias, tarifas, obraCod, days, todasHsExtras,
    )
    const totalContrat = todasCerts
      .filter(c => c.obra_cod === obraCod && c.sem_key === semKey)
      .reduce((s, c) => s + c.monto, 0)
    return { totalHs, totalCosto, totalContrat }
  }

  // Acción unificada: cierra o reabre una semana.
  // - Sin row → crea (POST con estado objetivo).
  // - Con row → update (PATCH).
  // Así el user no distingue entre "cierres automáticos" y reales.
  function handleAccion(sem: SemanaEfectiva, nuevoEstado: 'pendiente' | 'cerrado') {
    if (sem.cierre) {
      updateCierre(
        { obraCod, semKey: sem.semKey, estado: nuevoEstado },
        {
          onSuccess: () => {
            toast(nuevoEstado === 'cerrado' ? '✓ Semana cerrada' : '↩ Semana reabierta', 'ok')
            setDetalle(null)
          },
          onError: () => toast('Error al actualizar el cierre', 'err'),
        }
      )
    } else {
      createCierre(
        { obra_cod: obraCod, sem_key: sem.semKey, estado: nuevoEstado },
        {
          onSuccess: () => toast(nuevoEstado === 'cerrado' ? '✓ Semana cerrada' : '↩ Semana reabierta', 'ok'),
          onError: () => toast('Error al registrar el cierre', 'err'),
        }
      )
    }
  }

  if (loadingCierres || loadingHoras || loadingCerts) return null

  return (
    <>
      <div className="flex flex-col gap-3 mt-2">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex items-center gap-2 font-display text-xl tracking-wider text-azul hover:text-naranja transition-colors"
          >
            <span>{expanded ? '▾' : '▸'}</span>
            CIERRES DE SEMANA
          </button>
        </div>

        {/* Lista */}
        {expanded && (
          <div className="flex flex-col gap-2">
            {semanasEfectivas.length === 0 ? (
              <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
                No hay semanas con actividad registrada para esta obra.
              </div>
            ) : (
              semanasEfectivas.map(sem => {
                const vie = new Date(sem.semKey + 'T12:00:00')
                const days = getSemDays(vie)
                const cobro = getViernesCobro(vie)
                const { totalHs, totalCosto, totalContrat } = totalesCierre(sem.semKey)
                const borderClr = sem.estadoEfectivo === 'cerrado' ? 'border-verde' : 'border-amarillo'

                return (
                  <div
                    key={sem.semKey}
                    className={`
                      bg-white rounded-card shadow-card p-4
                      border-l-4 transition-all
                      ${borderClr}
                      ${sem.esActual ? 'ring-2 ring-naranja/30' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={sem.estadoEfectivo === 'cerrado' ? 'cerrado' : 'pendiente'} />
                          {sem.esAutomatico && (
                            <span className="text-[10px] font-bold bg-verde-light text-verde px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Automática
                            </span>
                          )}
                          {sem.esActual && (
                            <span className="text-[10px] font-bold bg-naranja text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Semana actual
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-sm text-azul">
                          {getSemLabel(vie)}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mt-1">
                          <span className="text-xs text-gris-dark">
                            📅 {formatFecha(toISO(days[0]!))} → {formatFecha(toISO(days[6]!))}
                          </span>
                          <span className="text-xs text-gris-dark">
                            💰 Cobro: {formatFecha(toISO(cobro))}
                          </span>
                        </div>
                        {/* Chips totales */}
                        {(totalHs > 0 || totalContrat > 0) && (
                          <div className="flex gap-2 flex-wrap mt-2">
                            {totalHs > 0 && (
                              <Chip value={fmtHs(totalHs)} label="Horas" />
                            )}
                            {totalCosto > 0 && (
                              <Chip value={fmtMonto(totalCosto)} label="Operarios" variant="green" />
                            )}
                            {totalContrat > 0 && (
                              <Chip value={fmtMonto(totalContrat)} label="Contratistas" />
                            )}
                          </div>
                        )}

                        {sem.cierre?.cerrado_en && (
                          <div className="text-xs text-verde mt-1 font-semibold">
                            ✓ Cerrado el {formatFecha(sem.cierre.cerrado_en.slice(0, 10))}
                          </div>
                        )}
                        {sem.esAutomatico && (
                          <div className="text-xs text-gris-dark mt-1 italic">
                            Cerrada automáticamente al pasar el jueves.
                          </div>
                        )}
                        {sem.cierre && (sem.cierre.created_by || sem.cierre.updated_by) && (
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {sem.cierre.created_by && (
                              <span className="text-[10px] text-gris-dark">
                                ✦ Creado por <span className="font-bold text-azul">{perfiles.get(sem.cierre.created_by) ?? '…'}</span>
                              </span>
                            )}
                            {sem.cierre.updated_by && sem.cierre.updated_by !== sem.cierre.created_by && (
                              <span className="text-[10px] text-gris-dark">
                                ✎ Editado por <span className="font-bold text-naranja">{perfiles.get(sem.cierre.updated_by) ?? '…'}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            setSemActual(vie)
                            document.getElementById('tarja-table-top')?.scrollIntoView({ behavior: 'smooth' })
                          }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                        >
                          📋 Ver tarja de esta semana
                        </button>
                        {(puedeEditar || (puedeCrear && !sem.cierre)) && (
                          <button
                            onClick={() => handleAccion(sem, sem.estadoEfectivo === 'cerrado' ? 'pendiente' : 'cerrado')}
                            disabled={updating || creating}
                            className={`
                              text-xs font-bold px-3 py-1.5 rounded-lg transition-colors
                              ${sem.estadoEfectivo === 'cerrado'
                                ? 'bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo'
                                : 'bg-verde-light text-verde hover:bg-verde hover:text-white'
                              }
                            `}
                          >
                            {sem.estadoEfectivo === 'cerrado' ? '↩ Reabrir' : '✓ Cerrar'}
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

      </div>

      {/* Modal detalle (mantiene compatibilidad con ModalDetalleCierre) */}
      <ModalDetalleCierre
        open={!!detalle}
        onClose={() => setDetalle(null)}
        cierre={detalle}
        onToggleEstado={(c) => handleAccion(
          semanasEfectivas.find(s => s.semKey === c.sem_key) ?? {
            semKey: c.sem_key, cierre: c, estadoEfectivo: c.estado, esAutomatico: false, esActual: false,
          },
          c.estado === 'cerrado' ? 'pendiente' : 'cerrado',
        )}
        isPending={updating || creating}
      />
    </>
  )
}

function formatFecha(fecha: string): string {
  const [year, month, day] = fecha.split('-')
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  return `${day} ${meses[parseInt(month!) - 1]} ${year}`
}
