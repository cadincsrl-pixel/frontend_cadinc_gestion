'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFlotaServicios, useFlotaTiposServicio, fetchFlotaServicioComprobanteUrl } from '../hooks/useFlotaServicios'
import { useFlotaVehiculos } from '../hooks/useFlotaVehiculos'
import { useToast } from '@/components/ui/Toast'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { FlotaServicio, FlotaTipoServicio, FlotaVehiculo } from '@/types/domain.types'

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function fmtMonto(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function tipoLabel(tipos: FlotaTipoServicio[], s: FlotaServicio): string {
  if (s.tipo_id != null) {
    const t = tipos.find(x => x.id === s.tipo_id)
    return t?.nombre ?? `Tipo #${s.tipo_id}`
  }
  return s.tipo_libre || '—'
}

function patente(vehs: FlotaVehiculo[], id: number): string {
  return vehs.find(v => v.id === id)?.patente ?? `#${id}`
}

export function ServiciosTab() {
  const toast = useToast()
  const { data: servicios = [], isLoading } = useFlotaServicios()
  const { data: tipos = [] } = useFlotaTiposServicio()
  const { data: vehiculos = [] } = useFlotaVehiculos()

  const [vehiculoId, setVehiculoId] = useState('')
  const [tipoId,     setTipoId]     = useState('')
  const [desde,      setDesde]      = useState('')
  const [hasta,      setHasta]      = useState('')

  const filtrados = useMemo(() => {
    return servicios.filter(s => {
      if (vehiculoId && s.vehiculo_id !== Number(vehiculoId)) return false
      if (tipoId     && s.tipo_id     !== Number(tipoId))     return false
      if (desde      && s.fecha       <  desde) return false
      if (hasta      && s.fecha       >  hasta) return false
      return true
    })
  }, [servicios, vehiculoId, tipoId, desde, hasta])

  const totalCosto = filtrados.reduce((sum, s) => sum + (s.costo ?? 0), 0)

  async function handleVerComprobante(id: number) {
    await abrirAdjuntoFirmado(
      () => fetchFlotaServicioComprobanteUrl(id),
      () => toast('No se pudo abrir el comprobante', 'err'),
    )
  }

  const tieneFiltros = vehiculoId || tipoId || desde || hasta

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="px-4 py-3 border-b border-gris">
        <h2 className="font-bold text-azul text-base">Historial de servicios</h2>
        <p className="text-[11px] text-gris-dark mt-0.5">
          Todos los services registrados en la flota.
        </p>
      </div>

      {/* Filtros */}
      <div className="px-4 py-3 flex flex-wrap items-end gap-2 border-b border-gris">
        <div className="flex-1 min-w-[140px]">
          <Select
            label="Vehículo"
            options={[
              { value: '', label: 'Todos' },
              ...vehiculos.map(v => ({ value: String(v.id), label: v.patente })),
            ]}
            value={vehiculoId}
            onChange={e => setVehiculoId(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <Select
            label="Tipo"
            options={[
              { value: '', label: 'Todos' },
              ...tipos.map(t => ({ value: String(t.id), label: t.nombre })),
            ]}
            value={tipoId}
            onChange={e => setTipoId(e.target.value)}
          />
        </div>
        <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        {tieneFiltros && (
          <button
            onClick={() => { setVehiculoId(''); setTipoId(''); setDesde(''); setHasta('') }}
            className="text-[11px] text-gris-dark hover:text-rojo pb-2 self-end"
          >
            ✕ Limpiar
          </button>
        )}
        <div className="ml-auto self-end text-right">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">
            Total filtrado
          </div>
          <div className="font-mono font-bold text-verde">{fmtMonto(totalCosto)}</div>
        </div>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr>
              {['Fecha', 'Vehículo', 'Tipo', 'Km', 'Costo', 'Proveedor', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">Cargando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">
                  {tieneFiltros ? 'Sin resultados para los filtros aplicados.' : 'Sin servicios registrados.'}
                </td>
              </tr>
            ) : filtrados.map(s => (
              <tr key={s.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs">{fmtFecha(s.fecha)}</td>
                <td className="px-4 py-2.5 font-mono text-xs font-bold text-azul">{patente(vehiculos, s.vehiculo_id)}</td>
                <td className="px-4 py-2.5 text-sm">{tipoLabel(tipos, s)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{Math.round(s.km_service).toLocaleString('es-AR')} km</td>
                <td className="px-4 py-2.5 font-mono text-sm font-bold text-verde">{fmtMonto(s.costo)}</td>
                <td className="px-4 py-2.5 text-xs text-gris-dark truncate max-w-[180px]">{s.proveedor ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {s.comprobante_path && (
                    <button
                      onClick={() => handleVerComprobante(s.id)}
                      className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                      title="Ver comprobante"
                    >
                      📎
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2 p-3">
        {isLoading ? (
          <div className="text-center py-6 text-gris-dark text-sm italic">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-6 text-gris-dark text-sm italic">
            {tieneFiltros ? 'Sin resultados para los filtros aplicados.' : 'Sin servicios registrados.'}
          </div>
        ) : filtrados.map(s => (
          <div key={s.id} className="bg-white border border-gris-mid rounded-lg p-3 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-mono text-[11px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                  {patente(vehiculos, s.vehiculo_id)}
                </span>
                <span className="text-[11px] text-gris-dark">{fmtFecha(s.fecha)}</span>
              </div>
              {s.comprobante_path && (
                <button
                  onClick={() => handleVerComprobante(s.id)}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                  title="Ver comprobante"
                >
                  📎
                </button>
              )}
            </div>
            <div className="font-bold text-sm text-carbon">{tipoLabel(tipos, s)}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gris-dark">
              <span className="font-mono">{Math.round(s.km_service).toLocaleString('es-AR')} km</span>
              <span>·</span>
              <span className="font-mono font-bold text-verde">{fmtMonto(s.costo)}</span>
              {s.proveedor && (<>
                <span>·</span>
                <span className="truncate">{s.proveedor}</span>
              </>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
