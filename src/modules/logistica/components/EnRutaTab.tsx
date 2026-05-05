'use client'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useTramosEnRuta, useRefrescarEnRuta, type TramoEnRuta } from '../hooks/useEnRuta'
import { useSyncGpsTodos } from '../hooks/useGpsSync'
import { usePermisos } from '@/hooks/usePermisos'

function fmtKm(metros: number | null): string {
  if (metros == null) return '—'
  return `${Math.round(metros / 1000).toLocaleString('es-AR')} km`
}

function fmtETA(segs: number | null): string {
  if (segs == null) return '—'
  const min = Math.round(segs / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function fmtHace(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  return `hace ${h}h`
}

function fmtFecha(s: string | null): string {
  if (!s) return '—'
  const [y, mo, d] = s.split('-')
  if (!y || !mo || !d) return s
  return `${d}/${mo}/${y}`
}

export function EnRutaTab() {
  const toast = useToast()
  const { puedeEditar } = usePermisos('logistica')
  const { data: filas = [], isLoading, isFetching } = useTramosEnRuta()
  const refrescar = useRefrescarEnRuta()
  const { mutate: syncGps, isPending: syncing } = useSyncGpsTodos()

  function handleActualizar() {
    syncGps(undefined, {
      onSuccess: (r) => {
        refrescar()
        toast(`✓ GPS sincronizado · ${r.ok} actualizados`, 'ok')
      },
      onError: () => {
        // Aún sin sync, refrescamos para reflejar cualquier cambio en DB.
        refrescar()
        toast('Error al sincronizar GPS — recalculé con la última posición disponible', 'err')
      },
    })
  }

  const conCalculo  = filas.filter(f => f.distancia_m != null)
  const sinCalculo  = filas.filter(f => f.distancia_m == null)

  return (
    <div className="flex flex-col gap-4">

      {/* Header con stats y botón */}
      <div className="bg-white rounded-card shadow-card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg text-azul">🛰 Camiones en ruta</h2>
            <p className="text-xs text-gris-dark mt-0.5">
              Tramos cargados en curso · distancia y ETA al destino vía Google Maps
            </p>
          </div>
          {puedeEditar && (
            <Button variant="primary" size="sm" loading={syncing} onClick={handleActualizar}>
              🔄 Actualizar ahora
            </Button>
          )}
        </div>
        <div className="flex gap-3 mt-3 flex-wrap text-xs">
          <Stat label="Cargados en ruta" value={filas.length} color="orange" />
          <Stat label="Con cálculo"      value={conCalculo.length} color="verde" />
          {sinCalculo.length > 0 && (
            <Stat label="Sin cálculo" value={sinCalculo.length} color="rojo" />
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gris-dark text-sm">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="p-6 text-center text-gris-dark text-sm">
            No hay camiones cargados en curso.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-azul text-white">
                <tr>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Camión</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Chofer</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Origen → Destino</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-wide">Falta (km)</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-wide">ETA</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-wide">Vel.</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Última lectura</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-wide">Mapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris">
                {filas.map(f => <FilaEnRuta key={f.tramo_id} f={f} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFetching && !isLoading && (
        <div className="text-xs text-gris-dark text-center">Recalculando…</div>
      )}
    </div>
  )
}

function FilaEnRuta({ f }: { f: TramoEnRuta }) {
  // Color del ETA según urgencia.
  const etaSegs = f.duracion_traffic_s ?? f.duracion_s
  const etaCls =
    etaSegs == null         ? 'text-gris-mid' :
    etaSegs < 30 * 60       ? 'text-verde font-bold' :
    etaSegs < 90 * 60       ? 'text-[#7A5500] font-bold' :
                              'text-carbon'

  const mapsUrl = (f.gps_lat != null && f.gps_lng != null && f.destino_lat != null && f.destino_lng != null)
    ? `https://www.google.com/maps/dir/${f.gps_lat},${f.gps_lng}/${f.destino_lat},${f.destino_lng}`
    : null

  return (
    <tr>
      <td className="px-3 py-2 font-mono font-bold">{f.patente ?? '—'}</td>
      <td className="px-3 py-2">{f.chofer_nombre ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        <div className="text-gris-dark">{f.cantera_nombre ?? '—'} →</div>
        <div className="font-semibold">{f.deposito_nombre ?? '—'}</div>
        {f.fecha_carga && (
          <div className="text-[11px] text-gris-mid mt-0.5">
            Cargó {fmtFecha(f.fecha_carga)}
            {f.toneladas != null && ` · ${Number(f.toneladas).toLocaleString('es-AR')} t`}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono font-bold">
        {f.distancia_m != null ? (
          fmtKm(f.distancia_m)
        ) : (
          <span title={f.motivo_sin_calcular ?? ''} className="text-rojo text-xs">⚠ {f.motivo_sin_calcular ?? '—'}</span>
        )}
      </td>
      <td className={`px-3 py-2 text-right font-mono ${etaCls}`}>
        {fmtETA(etaSegs)}
        {f.duracion_traffic_s != null && f.duracion_s != null && f.duracion_traffic_s > f.duracion_s + 60 && (
          <div className="text-[10px] text-rojo">+ tráfico</div>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {f.gps_velocidad != null ? `${Math.round(f.gps_velocidad)} km/h` : '—'}
      </td>
      <td className="px-3 py-2 text-[11px] text-gris-dark">{fmtHace(f.gps_lectura_en)}</td>
      <td className="px-3 py-2">
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-azul hover:underline text-xs">
            Ver ruta ↗
          </a>
        ) : <span className="text-gris-mid text-xs">—</span>}
      </td>
    </tr>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: 'orange' | 'verde' | 'rojo' }) {
  const cls =
    color === 'orange' ? 'bg-naranja-light text-naranja-dark' :
    color === 'verde'  ? 'bg-verde-light text-verde'          :
                         'bg-rojo-light text-rojo'
  return (
    <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${cls}`}>
      {value} {label}
    </div>
  )
}
