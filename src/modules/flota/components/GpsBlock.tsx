'use client'

import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFlotaSyncIndividual,
  mensajeAmigableErrorSync,
} from '../hooks/useFlotaGpsSync'
import type { FlotaVehiculo, FlotaGpsSyncEstado } from '@/types/domain.types'

interface Props {
  vehiculo: FlotaVehiculo
}

function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-AR') + ' km'
}

// Mapeo de estado → estilo Tailwind del badge. Mismas convenciones
// que FlotaDocumentosSection para mantener coherencia visual.
const ESTADO_BADGE: Record<FlotaGpsSyncEstado, { label: string; cls: string }> = {
  ok:         { label: 'OK',         cls: 'bg-verde-light text-verde' },
  sin_cambio: { label: 'Sin cambio', cls: 'bg-amarillo-light text-amarillo' },
  error:      { label: 'Error',      cls: 'bg-rojo-light text-rojo' },
  no_match:   { label: 'No match',   cls: 'bg-gris text-gris-dark' },
}

function BadgeEstado({ estado }: { estado: FlotaGpsSyncEstado | null | undefined }) {
  if (!estado) return null
  const cfg = ESTADO_BADGE[estado]
  if (!cfg) return null
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export function GpsBlock({ vehiculo }: Props) {
  const toast = useToast()
  const { puedeEditar } = usePermisos('flota')
  const { mutate: sync, isPending } = useFlotaSyncIndividual()

  // Estado vacío: no hay device_id vinculado.
  if (!vehiculo.mobilquest_device_id) {
    return (
      <div className="border border-gris-mid rounded-lg p-3 bg-gris/20 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-azul uppercase tracking-wider">
            📡 GPS MobilQuest
          </h3>
        </div>
        <p className="text-xs text-gris-dark italic">
          Sin GPS vinculado. Cargá un ID MobilQuest en el modo edición para empezar a sincronizar.
        </p>
      </div>
    )
  }

  function handleSync() {
    sync(vehiculo.id, {
      onSuccess: (data) => {
        const est = data.resultado?.estado
        if (est === 'ok') {
          toast(`✓ GPS sincronizado — km: ${fmtKm(data.resultado.km_nuevo)}`, 'ok')
        } else if (est === 'sin_cambio') {
          toast('Sync OK — el km no cambió respecto al GPS', 'warn')
        } else if (est === 'error') {
          toast(`Sync con error: ${data.resultado.error_mensaje ?? 'desconocido'}`, 'err')
        } else {
          toast('Sync completado', 'ok')
        }
      },
      onError: (err) => toast(mensajeAmigableErrorSync(err), 'err'),
    })
  }

  const lat = vehiculo.gps_ultima_lat
  const lng = vehiculo.gps_ultima_lng
  const tieneCoords = lat != null && lng != null
  const velocidad = vehiculo.gps_ultima_velocidad
  const mostrarVelocidad = velocidad != null && velocidad > 0

  return (
    <div className="border border-gris-mid rounded-lg p-3 bg-white flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider flex items-center gap-2">
          📡 GPS MobilQuest
          <BadgeEstado estado={vehiculo.gps_ultimo_sync_estado} />
        </h3>
        {puedeEditar && (
          <button
            onClick={handleSync}
            disabled={isPending}
            className="text-[11px] font-bold px-2.5 py-1 rounded bg-azul text-white hover:bg-azul-mid transition-colors disabled:opacity-50"
          >
            {isPending ? '⏳ Sincronizando…' : '🔄 Sincronizar ahora'}
          </button>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex flex-col">
          <dt className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
            Última sync
          </dt>
          <dd className="text-carbon font-mono">
            {fmtFechaHora(vehiculo.mobilquest_ultima_sync_at)}
          </dd>
        </div>

        <div className="flex flex-col">
          <dt className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
            Última lectura GPS
          </dt>
          <dd className="text-carbon font-mono">
            {fmtFechaHora(vehiculo.gps_ultima_lectura_en)}
          </dd>
        </div>

        <div className="flex flex-col">
          <dt className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
            Km al sincronizar
          </dt>
          <dd className="text-carbon font-mono flex items-baseline gap-1.5 flex-wrap">
            <span>{fmtKm(vehiculo.km_actuales)}</span>
            {vehiculo.km_actualizado_en && (
              <span className="text-[10px] text-gris-dark">
                ({fmtFechaHora(vehiculo.km_actualizado_en)})
              </span>
            )}
          </dd>
        </div>

        {mostrarVelocidad && (
          <div className="flex flex-col">
            <dt className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">
              Velocidad
            </dt>
            <dd className="text-carbon font-mono">
              {velocidad} km/h
            </dd>
          </div>
        )}
      </dl>

      {tieneCoords && (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-[11px] font-bold px-2.5 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
        >
          📍 Ver en Maps
        </a>
      )}

      {vehiculo.gps_ultimo_sync_error && (
        <div className="bg-rojo-light border border-rojo/30 rounded px-2.5 py-1.5 text-xs text-rojo">
          <span className="font-bold">Error del último sync:</span>{' '}
          {vehiculo.gps_ultimo_sync_error}
        </div>
      )}
    </div>
  )
}
