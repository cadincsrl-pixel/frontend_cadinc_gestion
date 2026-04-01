'use client'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { AuditInfo } from '@/components/ui/AuditInfo'
import type { Personal } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  trabajador: Personal | null
  onEditar: (t: Personal) => void
}

export function ModalDetalleTrabajador({ open, onClose, trabajador, onEditar }: Props) {
  const { data: categorias = [] } = useCategorias()

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

        {/* Historial de categorías */}
        <div>
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
            Historial de categorías
          </h3>
          {historial.length === 0 ? (
            <p className="text-sm text-gris-dark">Sin historial registrado.</p>
          ) : (
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

function formatFecha(fecha: string): string {
  const [year, month, day] = fecha.split('-')
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  return `${day} ${meses[parseInt(month!) - 1]} ${year}`
}