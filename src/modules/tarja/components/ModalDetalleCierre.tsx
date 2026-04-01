'use client'

import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { getSemDays, getSemLabel, getViernesCobro, toISO } from '@/lib/utils/dates'
import type { Cierre } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  cierre: Cierre | null
  onToggleEstado: (cierre: Cierre) => void
  isPending?: boolean
}

export function ModalDetalleCierre({ open, onClose, cierre, onToggleEstado, isPending }: Props) {
  if (!cierre) return null

  const vie = new Date(cierre.sem_key + 'T12:00:00')
  const days = getSemDays(vie)
  const cobro = getViernesCobro(vie)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📋 DETALLE DE CIERRE"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant={cierre.estado === 'cerrado' ? 'secondary' : 'primary'}
            loading={isPending}
            onClick={() => onToggleEstado(cierre)}
          >
            {cierre.estado === 'cerrado' ? '↩ Reabrir semana' : '✓ Cerrar semana'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Estado y período */}
        <div className="bg-gris rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-bold text-azul text-base">
                {getSemLabel(vie)}
              </div>
              <div className="text-xs text-gris-dark mt-0.5 font-mono">
                sem_key: {cierre.sem_key}
              </div>
            </div>
            <Badge
              variant={cierre.estado === 'cerrado' ? 'cerrado' : 'pendiente'}
            />
          </div>
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-1 gap-3">
          <DetailRow
            icon="📅"
            label="Período"
            value={`${formatFecha(toISO(days[0]!))} → ${formatFecha(toISO(days[6]!))}`}
          />
          <DetailRow
            icon="💰"
            label="Fecha de cobro"
            value={formatFecha(toISO(cobro))}
            highlight
          />
          {cierre.cerrado_en && (
            <DetailRow
              icon="✓"
              label="Cerrado el"
              value={formatFecha(cierre.cerrado_en.slice(0, 10))}
              variant="green"
            />
          )}
        </div>

        {/* Días de la semana */}
        <div>
          <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
            Días del período
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const DIAS = ['Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue']
              const esJue = i === 6
              return (
                <div
                  key={i}
                  className={`
                    flex flex-col items-center p-2 rounded-lg text-center
                    ${esJue
                      ? 'bg-azul text-white'
                      : 'bg-gris text-carbon'
                    }
                  `}
                >
                  <span className="text-[10px] font-bold uppercase opacity-70">
                    {DIAS[i]}
                  </span>
                  <span className="font-mono font-bold text-sm mt-0.5">
                    {d.getDate()}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gris-dark mt-1.5">
            El jueves es el último día del período. El cobro es el viernes siguiente.
          </p>
        </div>

        <AuditInfo
          createdBy={cierre.created_by}
          updatedBy={cierre.updated_by}
          createdAt={cierre.created_at}
          updatedAt={cierre.updated_at}
        />

      </div>
    </Modal>
  )
}

// ── Helpers ──

function DetailRow({
  icon,
  label,
  value,
  highlight,
  variant,
}: {
  icon: string
  label: string
  value: string
  highlight?: boolean
  variant?: 'green'
}) {
  return (
    <div className={`
      flex items-center justify-between px-4 py-3 rounded-xl
      ${highlight ? 'bg-naranja-light border border-naranja/20' : 'bg-gris'}
      ${variant === 'green' ? 'bg-verde-light border border-verde/20' : ''}
    `}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className={`
          text-sm font-semibold
          ${highlight ? 'text-naranja-dark' : 'text-gris-dark'}
          ${variant === 'green' ? 'text-verde' : ''}
        `}>
          {label}
        </span>
      </div>
      <span className={`
        font-mono text-sm font-bold
        ${highlight ? 'text-naranja-dark' : 'text-carbon'}
        ${variant === 'green' ? 'text-verde' : ''}
      `}>
        {value}
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