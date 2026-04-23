'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useObras, useObrasArchivadas } from '@/modules/tarja/hooks/useObras'
import { useHorasTrabajador } from '@/modules/tarja/hooks/useHoras'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { getViernes, getSemKey, getSemLabel } from '@/lib/utils/dates'
import type { Personal, Hora } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  trabajador: Personal | null
  onEditar: (t: Personal) => void
}

interface SemanaResumen {
  semKey: string
  semLabel: string
  horas: number
}

interface ObraResumen {
  obraCod: string
  obraNom: string | null
  totalHoras: number
  semanas: SemanaResumen[]
}

export function ModalDetalleTrabajador({ open, onClose, trabajador, onEditar }: Props) {
  const { data: categorias = [] } = useCategorias()
  const { data: obras = [] } = useObras()
  const { data: obrasArchivadas = [] } = useObrasArchivadas()
  const { data: horas = [], isLoading: loadingHoras } = useHorasTrabajador(trabajador?.leg)

  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [horasAbierto, setHorasAbierto] = useState(false)

  const obrasResumen = useMemo<ObraResumen[]>(() => {
    if (!horas.length) return []

    const obraIndex = new Map<string, string>()
    for (const o of obras) obraIndex.set(o.cod, o.nom)
    for (const o of obrasArchivadas) if (!obraIndex.has(o.cod)) obraIndex.set(o.cod, o.nom)

    const porObra = new Map<string, Map<string, SemanaResumen>>()

    for (const h of horas as Hora[]) {
      const vie = getViernes(new Date(h.fecha + 'T12:00:00'))
      const semKey = getSemKey(vie)
      const semLabel = getSemLabel(vie)

      let semanas = porObra.get(h.obra_cod)
      if (!semanas) {
        semanas = new Map()
        porObra.set(h.obra_cod, semanas)
      }
      const prev = semanas.get(semKey)
      if (prev) {
        prev.horas += Number(h.horas) || 0
      } else {
        semanas.set(semKey, { semKey, semLabel, horas: Number(h.horas) || 0 })
      }
    }

    const result: ObraResumen[] = []
    for (const [obraCod, semanasMap] of porObra.entries()) {
      const semanas = Array.from(semanasMap.values())
        .sort((a, b) => b.semKey.localeCompare(a.semKey))
      const totalHoras = semanas.reduce((acc, s) => acc + s.horas, 0)
      result.push({
        obraCod,
        obraNom: obraIndex.get(obraCod) ?? null,
        totalHoras,
        semanas,
      })
    }
    return result.sort((a, b) => b.totalHoras - a.totalHoras)
  }, [horas, obras, obrasArchivadas])

  if (!trabajador) return null

  const catActual = categorias.find(c => c.id === trabajador.cat_id)

  // Historial ordenado de más reciente a más antiguo
  const historial = [...(trabajador.personal_cat_historial ?? [])]
    .sort((a, b) => b.desde.localeCompare(a.desde))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 DETALLE TRABAJADOR"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              onEditar(trabajador)
            }}
          >
            ✏️ Editar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Datos principales */}
        <div className="bg-gris rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-azul text-lg leading-tight">
                {trabajador.nom}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="font-mono text-xs bg-white border border-gris-mid px-2 py-0.5 rounded text-gris-dark font-bold">
                  LEG. {trabajador.leg}
                </span>
                {catActual && (
                  <span className="text-xs bg-naranja-light text-naranja-dark font-bold px-2 py-0.5 rounded">
                    {catActual.nom}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info de contacto */}
        <div className="grid grid-cols-2 gap-3">
          <InfoField label="DNI" value={trabajador.dni} />
          <InfoField label="Teléfono" value={trabajador.tel} />
          <InfoField label="Dirección" value={trabajador.dir} className="col-span-2" />
          {trabajador.obs && (
            <InfoField label="Observaciones" value={trabajador.obs} className="col-span-2" />
          )}
        </div>

        {/* Ropa de trabajo */}
        {(trabajador.talle_pantalon || trabajador.talle_botines || trabajador.talle_camisa) && (
          <div>
            <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
              👕 Ropa de trabajo
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <InfoField label="Pantalón" value={trabajador.talle_pantalon} />
              <InfoField label="Botines"  value={trabajador.talle_botines}  />
              <InfoField label="Camisa"   value={trabajador.talle_camisa}   />
            </div>
          </div>
        )}

        {/* Obras y horas trabajadas */}
        <div>
          {loadingHoras ? (
            <>
              <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
                📋 Obras y horas trabajadas
              </h3>
              <p className="text-sm text-gris-dark">Cargando…</p>
            </>
          ) : obrasResumen.length === 0 ? (
            <>
              <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
                📋 Obras y horas trabajadas
              </h3>
              <p className="text-sm text-gris-dark">Sin horas registradas.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setHorasAbierto(v => !v)}
                className="w-full flex items-center justify-between mb-3 group"
                aria-expanded={horasAbierto}
              >
                <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                  📋 Obras y horas trabajadas ({obrasResumen.length})
                </h3>
                <Chevron abierto={horasAbierto} />
              </button>
              {horasAbierto && (
                <div className="flex flex-col gap-3">
                  {obrasResumen.map(o => (
                    <div
                      key={o.obraCod}
                      className="border border-gris-mid rounded-xl overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-2 bg-gris">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-carbon leading-tight">
                            {o.obraNom ?? o.obraCod}
                          </span>
                          <span className="font-mono text-[10px] text-gris-dark">
                            {o.obraCod}
                          </span>
                        </div>
                        <span className="text-xs font-bold bg-azul text-white px-2 py-1 rounded-full font-mono">
                          {formatHoras(o.totalHoras)} h
                        </span>
                      </div>
                      <div className="flex flex-col">
                        {o.semanas.map(s => (
                          <div
                            key={s.semKey}
                            className="flex items-center justify-between px-4 py-2 bg-white border-t border-gris"
                          >
                            <span className="text-xs text-gris-dark">
                              Semana {s.semLabel}
                            </span>
                            <span className="font-mono text-xs font-bold text-carbon">
                              {formatHoras(s.horas)} h
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Historial de categorías */}
        <div>
          {historial.length === 0 ? (
            <>
              <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                Historial de categorías
              </h3>
              <p className="text-xs text-gris-dark">Sin historial.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setHistorialAbierto(v => !v)}
                className="w-full flex items-center justify-between mb-3 group"
                aria-expanded={historialAbierto}
              >
                <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">
                  Historial de categorías ({historial.length})
                </h3>
                <Chevron abierto={historialAbierto} />
              </button>
              {historialAbierto && (
                <div className="flex flex-col gap-1 border border-gris-mid rounded-xl overflow-hidden">
                  {historial.map((h, i) => {
                    const cat = categorias.find(c => c.id === h.cat_id)
                    const esActual = i === 0
                    return (
                      <div
                        key={`${h.cat_id}-${h.desde}`}
                        className={`
                          flex items-center justify-between px-4 py-3
                          border-b border-gris last:border-0
                          ${esActual ? 'bg-azul-light' : 'bg-white'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`
                            w-2 h-2 rounded-full flex-shrink-0
                            ${esActual ? 'bg-verde' : 'bg-gris-mid'}
                          `} />
                          <div>
                            <div className="font-bold text-sm text-carbon">
                              {cat?.nom ?? `Categoría #${h.cat_id}`}
                            </div>
                            {cat && (
                              <div className="text-xs text-gris-dark font-mono">
                                ${cat.vh}/h
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gris-dark">
                            desde {formatFecha(h.desde)}
                          </span>
                          {esActual && (
                            <span className="text-[10px] font-bold bg-verde text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Actual
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <AuditInfo
          createdBy={trabajador.created_by}
          updatedBy={trabajador.updated_by}
          createdAt={trabajador.created_at}
          updatedAt={trabajador.updated_at}
        />

      </div>
    </Modal>
  )
}

// ── Helpers ──

function InfoField({
  label,
  value,
  className = '',
}: {
  label: string
  value?: string | null
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-semibold text-carbon">
        {value || <span className="text-gris-mid font-normal">—</span>}
      </span>
    </div>
  )
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 text-gris-dark transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function formatHoras(h: number): string {
  if (Number.isInteger(h)) return String(h)
  return h.toFixed(1).replace(/\.0$/, '')
}

function formatFecha(fecha: string): string {
  const [year, month, day] = fecha.split('-')
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  return `${day} ${meses[parseInt(month!) - 1]} ${year}`
}
