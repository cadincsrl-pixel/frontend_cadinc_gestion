'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import {
  useFlotaGastos,
  useFlotaGastosCategorias,
  fetchFlotaGastoComprobanteUrl,
} from '../hooks/useFlotaGastos'
import { useFlotaVehiculos } from '../hooks/useFlotaVehiculos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { FlotaGasto, FlotaVehiculo } from '@/types/domain.types'

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function fmtMonto(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function patente(vehs: FlotaVehiculo[], id: number): string {
  return vehs.find(v => v.id === id)?.patente ?? `#${id}`
}

export function GastosTab() {
  const toast = useToast()
  const router = useRouter()
  const { data: categorias = [] } = useFlotaGastosCategorias()
  const { data: vehiculos = [] } = useFlotaVehiculos()

  const [vehiculoId,   setVehiculoId]   = useState('')
  const [categoriaId,  setCategoriaId]  = useState('')
  const [desde,        setDesde]        = useState('')
  const [hasta,        setHasta]        = useState('')

  // El backend acepta los mismos filtros. Pasamos solo los que tienen valor
  // para no enviar query params vacíos que el zod podría rechazar.
  const filtros = useMemo(() => ({
    vehiculo_id:  vehiculoId  ? Number(vehiculoId)  : undefined,
    categoria_id: categoriaId ? Number(categoriaId) : undefined,
    desde:        desde || undefined,
    hasta:        hasta || undefined,
  }), [vehiculoId, categoriaId, desde, hasta])

  const { data: gastos = [], isLoading } = useFlotaGastos(filtros)
  const total = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)
  const tieneFiltros = !!(vehiculoId || categoriaId || desde || hasta)

  async function handleVerComprobante(id: number) {
    await abrirAdjuntoFirmado(
      () => fetchFlotaGastoComprobanteUrl(id),
      () => toast('No se pudo abrir el comprobante', 'err'),
    )
  }

  function abrirVehiculo(g: FlotaGasto) {
    // Deep-link al modal del vehículo en su tab Gastos.
    router.push(`/flota?tab=vehiculos&vehiculo=${g.vehiculo_id}&seccion=gastos`)
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="px-4 py-3 border-b border-gris">
        <h2 className="font-bold text-azul text-base">Historial de gastos</h2>
        <p className="text-[11px] text-gris-dark mt-0.5">
          Todos los gastos registrados en la flota. Click sobre una fila para abrir el vehículo.
        </p>
      </div>

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
        <div className="flex-1 min-w-[160px]">
          <Select
            label="Categoría"
            options={[
              { value: '', label: 'Todas' },
              ...categorias.filter(c => c.activo).map(c => ({
                value: String(c.id),
                label: `${c.icono ?? ''} ${c.nombre}`.trim(),
              })),
            ]}
            value={categoriaId}
            onChange={e => setCategoriaId(e.target.value)}
          />
        </div>
        <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        {tieneFiltros && (
          <button
            onClick={() => { setVehiculoId(''); setCategoriaId(''); setDesde(''); setHasta('') }}
            className="text-[11px] text-gris-dark hover:text-rojo pb-2 self-end"
          >
            ✕ Limpiar
          </button>
        )}
        <div className="ml-auto self-end text-right">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">
            Total filtrado
          </div>
          <div className="font-mono font-bold text-verde">{fmtMonto(total)}</div>
        </div>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr>
              {['Fecha', 'Vehículo', 'Categoría', 'Monto', 'Proveedor', 'Descripción', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">Cargando...</td></tr>
            ) : gastos.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">
                  {tieneFiltros ? 'Sin resultados para los filtros aplicados.' : 'Sin gastos registrados.'}
                </td>
              </tr>
            ) : gastos.map(g => (
              <tr
                key={g.id}
                onClick={() => abrirVehiculo(g)}
                className="border-b border-gris last:border-0 hover:bg-azul-light/40 cursor-pointer transition-colors"
                title="Abrir vehículo"
              >
                <td className="px-4 py-2.5 font-mono text-xs">{fmtFecha(g.fecha)}</td>
                <td className="px-4 py-2.5 font-mono text-xs font-bold text-azul">{patente(vehiculos, g.vehiculo_id)}</td>
                <td className="px-4 py-2.5 text-sm">
                  {g.categoria?.icono ?? ''} {g.categoria?.nombre ?? 'Sin categoría'}
                </td>
                <td className="px-4 py-2.5 font-mono text-sm font-bold text-verde">{fmtMonto(g.monto)}</td>
                <td className="px-4 py-2.5 text-xs text-gris-dark truncate max-w-[180px]">{g.proveedor ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gris-dark italic truncate max-w-[200px]">{g.descripcion ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {g.comprobante_path && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleVerComprobante(g.id) }}
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
        ) : gastos.length === 0 ? (
          <div className="text-center py-6 text-gris-dark text-sm italic">
            {tieneFiltros ? 'Sin resultados para los filtros aplicados.' : 'Sin gastos registrados.'}
          </div>
        ) : gastos.map(g => (
          <div
            key={g.id}
            onClick={() => abrirVehiculo(g)}
            className="bg-white border border-gris-mid rounded-lg p-3 flex flex-col gap-1.5 shadow-sm cursor-pointer hover:bg-gris/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-mono text-[11px] font-bold bg-azul-light text-azul-mid px-2 py-0.5 rounded">
                  {patente(vehiculos, g.vehiculo_id)}
                </span>
                <span className="text-[11px] text-gris-dark">{fmtFecha(g.fecha)}</span>
              </div>
              {g.comprobante_path && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleVerComprobante(g.id) }}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                >
                  📎
                </button>
              )}
            </div>
            <div className="font-bold text-sm text-carbon">
              {g.categoria?.icono ?? ''} {g.categoria?.nombre ?? 'Sin categoría'}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gris-dark">
              <span className="font-mono font-bold text-verde text-sm">{fmtMonto(g.monto)}</span>
              {g.proveedor && (<><span>·</span><span className="truncate">{g.proveedor}</span></>)}
            </div>
            {g.descripcion && (
              <div className="text-[11px] text-gris-dark italic truncate">{g.descripcion}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
