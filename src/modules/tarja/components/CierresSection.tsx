'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCierresObra, useCreateCierre, useUpdateCierre } from '../hooks/useCierres'
import { useTarjaStore } from '../store/tarja.store'
import { getSemDays, toISO, getSemLabel, getViernesCobro } from '@/lib/utils/dates'
import { ModalDetalleCierre } from './ModalDetalleCierre'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { usePermisos } from '@/hooks/usePermisos'
import { usePersonal } from '../hooks/usePersonal'
import { useCategorias } from '../hooks/useCategorias'
import { useTarifasObra } from '../hooks/useTarifas'
import { useCertificacionesObra } from '../hooks/useContratistas'
import { calcularTotalesSemana, fmtMonto, fmtHs } from '@/lib/utils/costos'
import { apiGet } from '@/lib/api/client'
import type { Cierre, Hora } from '@/types/domain.types'

interface Props {
  obraCod: string
}

export function CierresSection({ obraCod }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('tarja')
  const { semActual, setSemActual } = useTarjaStore()
  const { data: cierres = [], isLoading } = useCierresObra(obraCod)
  const { mutate: createCierre, isPending: creating } = useCreateCierre()
  const { mutate: updateCierre, isPending: updating } = useUpdateCierre()
  const [expanded, setExpanded] = useState(true)
  const [detalle, setDetalle] = useState<Cierre | null>(null)

  const semKey = toISO(semActual)
  const cierreActual = cierres.find(c => c.sem_key === semKey)
  const perfiles = usePerfilesMap()

  // ── Datos para calcular totales por semana ──
  const { data: todasHoras = [] } = useQuery({
    queryKey: ['horas', obraCod, 'all'],
    queryFn: () => apiGet<Hora[]>(`/api/horas/${encodeURIComponent(obraCod)}`),
    enabled: !!obraCod,
  })
  const { data: todosPersonal = [] } = usePersonal()
  const { data: categorias = [] } = useCategorias()
  const { data: tarifas = [] } = useTarifasObra(obraCod)
  const { data: certs = [] } = useCertificacionesObra(obraCod)

  function getTotalesCierre(semKeyStr: string) {
    const vie = new Date(semKeyStr + 'T12:00:00')
    const days = getSemDays(vie)
    const fechas = days.map(toISO)

    const horasSem = todasHoras.filter(h => fechas.includes(h.fecha))
    const legsSem = [...new Set(horasSem.map(h => h.leg))]
    const personalSem = todosPersonal.filter(p => legsSem.includes(p.leg))

    const { totalHs, totalCosto } = calcularTotalesSemana(
      horasSem, personalSem, categorias, tarifas, obraCod, days
    )
    const totalCertif = certs
      .filter(c => c.sem_key === semKeyStr)
      .reduce((sum, c) => sum + c.monto, 0)

    return {
      hs: totalHs,
      costoOp: totalCosto,
      costoContrat: totalCertif,
      total: totalCosto + totalCertif,
      operarios: legsSem.length,
    }
  }

  function handleCrearCierre() {
    createCierre(
      { obra_cod: obraCod, sem_key: semKey },
      {
        onSuccess: () => toast('✓ Cierre registrado', 'ok'),
        onError: () => toast('Error al registrar el cierre', 'err'),
      }
    )
  }

  function handleToggleEstado(cierre: Cierre) {
    const nuevoEstado = cierre.estado === 'cerrado' ? 'pendiente' : 'cerrado'
    updateCierre(
      { obraCod, semKey: cierre.sem_key, estado: nuevoEstado },
      {
        onSuccess: () => {
          toast(
            nuevoEstado === 'cerrado' ? '✓ Semana cerrada' : '↩ Semana reabierta',
            'ok'
          )
          setDetalle(null)
        },
        onError: () => toast('Error al actualizar el cierre', 'err'),
      }
    )
  }

  if (isLoading) return null

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

          {!cierreActual && puedeCrear && (
            <Button
              variant="primary"
              size="sm"
              loading={creating}
              onClick={handleCrearCierre}
            >
              ＋ Registrar semana actual
            </Button>
          )}
        </div>

        {/* Lista */}
        {expanded && (
          <div className="flex flex-col gap-2">
            {cierres.length === 0 ? (
              <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
                No hay cierres registrados para esta obra.
              </div>
            ) : (
              cierres.map(cierre => {
                const vie = new Date(cierre.sem_key + 'T12:00:00')
                const days = getSemDays(vie)
                const cobro = getViernesCobro(vie)
                const esActual = cierre.sem_key === semKey
                const totales = getTotalesCierre(cierre.sem_key)

                return (
                  <div
                    key={cierre.sem_key}
                    className={`
                      bg-white rounded-card shadow-card p-4
                      border-l-4 transition-all
                      ${cierre.estado === 'cerrado' ? 'border-verde' : 'border-amarillo'}
                      ${esActual ? 'ring-2 ring-naranja/30' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            variant={cierre.estado === 'cerrado' ? 'cerrado' : 'pendiente'}
                          />
                          {esActual && (
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

                        {/* ── Totales de la semana ── */}
                        {totales.hs > 0 && (
                          <div className="flex items-center gap-0 flex-wrap mt-3">
                            <StatItem value={fmtHs(totales.hs)} label="HORAS" />
                            <Divider />
                            <StatItem value={fmtMonto(totales.costoOp)} label="OPERARIOS" color="green" />
                            {totales.costoContrat > 0 && (
                              <>
                                <Divider />
                                <StatItem value={fmtMonto(totales.costoContrat)} label="CONTRATISTAS" color="purple" />
                              </>
                            )}
                            <Divider />
                            <StatItem value={fmtMonto(totales.total)} label="TOTAL SEMANA" color="orange" />
                            <Divider />
                            <StatItem value={String(totales.operarios)} label="OPERARIOS" />
                          </div>
                        )}

                        {cierre.cerrado_en && (
                          <div className="text-xs text-verde mt-2 font-semibold">
                            ✓ Cerrado el {formatFecha(cierre.cerrado_en.slice(0, 10))}
                          </div>
                        )}
                        {(cierre.created_by || cierre.updated_by) && (
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {cierre.created_by && (
                              <span className="text-[10px] text-gris-dark">
                                ✦ Creado por <span className="font-bold text-azul">{perfiles.get(cierre.created_by) ?? '…'}</span>
                              </span>
                            )}
                            {cierre.updated_by && cierre.updated_by !== cierre.created_by && (
                              <span className="text-[10px] text-gris-dark">
                                ✎ Editado por <span className="font-bold text-naranja">{perfiles.get(cierre.updated_by) ?? '…'}</span>
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
                          Ver Detalle
                        </button>
                        {puedeEditar && (
                          <button
                            onClick={() => handleToggleEstado(cierre)}
                            disabled={updating}
                            className={`
                              text-xs font-bold px-3 py-1.5 rounded-lg transition-colors
                              ${cierre.estado === 'cerrado'
                                ? 'bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo'
                                : 'bg-verde-light text-verde hover:bg-verde hover:text-white'
                              }
                            `}
                          >
                            {cierre.estado === 'cerrado' ? '↩ Reabrir' : '✓ Cerrar'}
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

      {/* Modal detalle */}
      <ModalDetalleCierre
        open={!!detalle}
        onClose={() => setDetalle(null)}
        cierre={detalle}
        onToggleEstado={handleToggleEstado}
        isPending={updating}
      />
    </>
  )
}

// ── Subcomponentes de stats ────────────────────────────────────────────────

type StatColor = 'green' | 'purple' | 'orange' | 'default'

const colorMap: Record<StatColor, string> = {
  green:   'text-verde',
  purple:  'text-[#9B59B6]',
  orange:  'text-naranja',
  default: 'text-azul',
}

function StatItem({ value, label, color = 'default' }: { value: string; label: string; color?: StatColor }) {
  return (
    <div className="flex flex-col items-start px-3 py-1 min-w-[70px]">
      <span className={`font-mono font-bold text-base leading-tight ${colorMap[color]}`}>
        {value}
      </span>
      <span className="text-[9px] font-bold text-gris-dark uppercase tracking-wider mt-0.5">
        {label}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-8 bg-gris-mid self-center mx-1" />
}

function formatFecha(fecha: string): string {
  const [year, month, day] = fecha.split('-')
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  return `${day} ${meses[parseInt(month!) - 1]} ${year}`
}
