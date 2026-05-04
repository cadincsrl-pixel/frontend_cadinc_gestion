'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useSyncGpsCamion, useSetIdVehiculoGps, useGpsSyncLog } from '../hooks/useGpsSync'
import { usePermisos } from '@/hooks/usePermisos'
import type { Camion } from '@/types/domain.types'

interface Props {
  camion: Camion
}

// Devuelve "hace 5 min", "hace 3h", "hace 2 días" desde un ISO timestamp.
function fmtHace(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60)        return `hace ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60)        return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)        return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d !== 1 ? 's' : ''}`
}

function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function GpsCamionSection({ camion }: Props) {
  const toast = useToast()
  const { puedeEditar } = usePermisos('logistica')
  const [editandoId, setEditandoId] = useState(false)
  const [idDraft, setIdDraft] = useState(camion.id_vehiculo_gps ?? '')
  const { mutate: sync, isPending: syncing } = useSyncGpsCamion()
  const { mutate: setId, isPending: savingId } = useSetIdVehiculoGps()
  const { data: logData = [] } = useGpsSyncLog({ camionId: camion.id, limit: 5 })

  function handleSync() {
    sync(camion.id, {
      onSuccess: (r) => {
        if (r.estado === 'no_match') {
          toast('⚠ Mobile Quest no devolvió datos para este camión', 'err')
        } else if (r.estado === 'error') {
          toast(`Error: ${r.error_mensaje ?? 'desconocido'}`, 'err')
        } else if (r.estado === 'sin_cambio') {
          toast('GPS sincronizado · sin cambios en el km', 'ok')
        } else {
          const dif = (r.km_nuevo ?? 0) - (r.km_anterior ?? 0)
          toast(`✓ GPS sincronizado · +${dif.toLocaleString('es-AR')} km`, 'ok')
        }
      },
      onError: () => toast('Error al sincronizar GPS', 'err'),
    })
  }

  function handleSaveId() {
    const valor = idDraft.trim() || null
    setId({ camionId: camion.id, idVehiculoGps: valor }, {
      onSuccess: () => {
        toast(valor ? '✓ ID GPS asignado' : '✓ ID GPS removido', 'ok')
        setEditandoId(false)
      },
      onError: (err: any) => {
        if (err?.message?.includes('ID_VEHICULO_GPS_DUPLICADO')) {
          toast('Ese ID GPS ya está asignado a otro camión', 'err')
        } else {
          toast('Error al guardar', 'err')
        }
      },
    })
  }

  const tieneGps = !!camion.id_vehiculo_gps
  const ultimoSync = camion.gps_ultimo_sync_en
  const ultimaLectura = camion.gps_ultima_lectura_en
  const estadoSync = camion.gps_ultimo_sync_estado

  // Color del badge según frescura del último sync.
  const horasSync = ultimoSync
    ? (Date.now() - new Date(ultimoSync).getTime()) / 36e5
    : Infinity
  const colorSync =
    estadoSync === 'error'           ? 'bg-rojo-light text-rojo' :
    !ultimoSync                      ? 'bg-gris/40 text-gris-dark' :
    horasSync < 24                   ? 'bg-verde-light text-verde-dark' :
    horasSync < 72                   ? 'bg-amarillo-light text-[#7A5500]' :
                                       'bg-rojo-light text-rojo'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-carbon flex items-center gap-2">
          🛰 Seguimiento GPS (Mobile Quest)
        </h4>
        {tieneGps && puedeEditar && (
          <Button variant="secondary" size="sm" loading={syncing} onClick={handleSync}>
            Sincronizar ahora
          </Button>
        )}
      </div>

      {/* Mapping id_vehiculo_gps */}
      <div className="bg-gris/30 rounded-card p-3 flex flex-col gap-2">
        <div className="text-[11px] text-gris-dark uppercase tracking-wide font-bold">ID Vehículo GPS</div>
        {!editandoId ? (
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-sm">
              {camion.id_vehiculo_gps ?? <span className="text-gris-mid italic">no asignado</span>}
            </div>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => { setIdDraft(camion.id_vehiculo_gps ?? ''); setEditandoId(true) }}
                className="text-xs text-azul hover:underline"
              >
                {camion.id_vehiculo_gps ? 'Cambiar' : 'Asignar'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={idDraft}
                onChange={e => setIdDraft(e.target.value)}
                placeholder="ej: 12345"
                disabled={savingId}
              />
            </div>
            <Button variant="primary" size="sm" loading={savingId} onClick={handleSaveId}>
              Guardar
            </Button>
            <Button variant="secondary" size="sm" disabled={savingId} onClick={() => setEditandoId(false)}>
              Cancelar
            </Button>
          </div>
        )}
        {!tieneGps && (
          <div className="text-[11px] text-gris-dark">
            El sync por patente lo va a asignar solo si Mobile Quest devuelve la patente <span className="font-mono font-bold">{camion.patente}</span>.
          </div>
        )}
      </div>

      {/* Estado actual del GPS */}
      {tieneGps && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-gris rounded-card p-2.5 flex flex-col gap-0.5">
            <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Último sync</div>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colorSync}`}>
                {estadoSync === 'error' ? '❌ error' :
                 estadoSync === 'no_match' ? '⚠ sin match' :
                 estadoSync === 'sin_cambio' ? '✓ ok' :
                 estadoSync === 'ok' ? '✓ ok' :
                 'sin datos'}
              </span>
              <span className="text-gris-dark">{fmtHace(ultimoSync)}</span>
            </div>
            {camion.gps_ultimo_sync_error && (
              <div className="text-rojo text-[11px] mt-1">{camion.gps_ultimo_sync_error}</div>
            )}
          </div>
          <div className="bg-white border border-gris rounded-card p-2.5 flex flex-col gap-0.5">
            <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Última lectura GPS</div>
            <div className="text-gris-dark">{fmtFechaHora(ultimaLectura)}</div>
            <div className="text-gris-mid text-[11px]">{fmtHace(ultimaLectura)}</div>
          </div>
          {camion.km_actualizado_en && (
            <div className="bg-white border border-gris rounded-card p-2.5 flex flex-col gap-0.5">
              <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Km actualizados</div>
              <div className="font-mono">{Number(camion.km_actuales).toLocaleString('es-AR')} km</div>
              <div className="text-gris-mid text-[11px]">{fmtHace(camion.km_actualizado_en)}</div>
            </div>
          )}
          {(camion.gps_ultima_lat != null && camion.gps_ultima_lng != null) && (
            <div className="bg-white border border-gris rounded-card p-2.5 flex flex-col gap-0.5">
              <div className="text-[10px] text-gris-dark uppercase tracking-wide font-bold">Posición</div>
              <a
                href={`https://www.google.com/maps?q=${camion.gps_ultima_lat},${camion.gps_ultima_lng}`}
                target="_blank" rel="noreferrer"
                className="text-azul hover:underline font-mono text-[11px]"
              >
                {Number(camion.gps_ultima_lat).toFixed(5)}, {Number(camion.gps_ultima_lng).toFixed(5)} ↗
              </a>
              {camion.gps_ultima_velocidad != null && (
                <div className="text-gris-mid text-[11px]">
                  Velocidad: {Number(camion.gps_ultima_velocidad).toFixed(1)} km/h
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Histórico de sync (últimas 5 entradas) */}
      {logData.length > 0 && (
        <details className="bg-gris/20 rounded-card p-2 text-xs">
          <summary className="cursor-pointer font-bold text-gris-dark uppercase tracking-wide text-[11px]">
            Últimos {logData.length} sync
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {logData.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-2 py-1 border-b border-gris last:border-0">
                <span className="text-[11px] text-gris-dark">{fmtFechaHora(l.created_at)}</span>
                <span className="text-[11px]">{l.tipo}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  l.estado === 'ok' ? 'bg-verde-light text-verde-dark' :
                  l.estado === 'sin_cambio' ? 'bg-gris/60 text-gris-dark' :
                  'bg-rojo-light text-rojo'
                }`}>{l.estado}</span>
                {l.km_nuevo != null && l.km_anterior != null && (
                  <span className="text-[11px] font-mono text-gris-dark">
                    +{(l.km_nuevo - l.km_anterior).toLocaleString('es-AR')} km
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// Mini badge GPS para mostrar en la lista de camiones (tabla + cards mobile).
export function GpsBadge({ camion }: { camion: Camion }) {
  if (!camion.id_vehiculo_gps) return null
  const ultimoSync = camion.gps_ultimo_sync_en
  const horas = ultimoSync
    ? (Date.now() - new Date(ultimoSync).getTime()) / 36e5
    : Infinity
  const estado = camion.gps_ultimo_sync_estado

  const cls =
    estado === 'error'    ? 'bg-rojo-light text-rojo' :
    !ultimoSync           ? 'bg-gris/40 text-gris-dark' :
    horas < 24            ? 'bg-verde-light text-verde-dark' :
    horas < 72            ? 'bg-amarillo-light text-[#7A5500]' :
                            'bg-rojo-light text-rojo'

  const titulo = ultimoSync ? `GPS — sync hace ${fmtHace(ultimoSync)}` : 'GPS asignado · sin sync aún'
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}
    >
      🛰 GPS
    </span>
  )
}
