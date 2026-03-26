'use client'

import { useRouter } from 'next/navigation'
import { useHerrStats, useHerramientas } from '../hooks/useHerramientas'
import { useObras } from '@/modules/tarja/hooks/useObras'
import type { HerrMovimiento } from '@/types/domain.types'

function fmtFecha(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const COLOR_MAP: Record<string, string> = {
  verde:   'bg-verde-light text-verde',
  naranja: 'bg-naranja-light text-naranja-dark',
  rojo:    'bg-rojo-light text-rojo',
  azul:    'bg-azul-light text-azul-mid',
  gris:    'bg-gris text-gris-dark',
}

export function HerrDashboard() {
  const router = useRouter()
  const { data: stats,        isLoading: loadingStats } = useHerrStats()
  const { data: herramientas = [] }                      = useHerramientas()
  const { data: obras        = [] }                      = useObras()

  const enReparacion = herramientas.filter(h => h.estado_key === 'reparacion')

  if (loadingStats) {
    return (
      <div className="p-8 flex items-center gap-3 text-gris-dark">
        <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
        Cargando dashboard...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[2rem] tracking-wider text-azul">HERRAMIENTAS</h1>
          <p className="text-sm text-gris-dark mt-0.5">Resumen general del sistema</p>
        </div>
        <div className="text-xs font-mono text-gris-dark">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Total"        value={stats?.total       ?? 0} color="azul"    icon="🔧" onClick={() => router.push('/herramientas/inventario')} />
        <KPICard label="Disponibles"  value={stats?.disponibles ?? 0} color="verde"   icon="✓"  onClick={() => router.push('/herramientas/inventario')} />
        <KPICard label="En uso"       value={stats?.enUso       ?? 0} color="naranja" icon="↗"  onClick={() => router.push('/herramientas/inventario')} />
        <KPICard label="Reparación"   value={stats?.enRep       ?? 0} color="rojo"    icon="⚙"  onClick={() => router.push('/herramientas/inventario')} />
        <KPICard label="En obras"     value={stats?.enObras     ?? 0} color="azul"    icon="🏗"  />
        <KPICard label="Bajas"        value={stats?.bajas       ?? 0} color="gris"    icon="✕"  />
      </div>

      {/* Últimos movimientos + En reparación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Últimos movimientos */}
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris flex items-center justify-between">
            <h3 className="font-bold text-azul">Últimos movimientos</h3>
            <button
              onClick={() => router.push('/herramientas/movimientos')}
              className="text-xs font-bold text-naranja hover:text-naranja-dark transition-colors"
            >
              Ver todos →
            </button>
          </div>
          <div className="p-4 flex flex-col gap-0">
            {!stats?.ultimosMovimientos?.length ? (
              <p className="text-center py-8 text-gris-dark text-sm">Sin movimientos registrados</p>
            ) : (
              stats.ultimosMovimientos.map(m => (
                <MovimientoTL key={m.id} mov={m} />
              ))
            )}
          </div>
        </div>

        {/* En reparación */}
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris flex items-center justify-between">
            <h3 className="font-bold text-azul">En reparación</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${enReparacion.length > 0 ? 'bg-rojo-light text-rojo' : 'bg-verde-light text-verde'}`}>
              {enReparacion.length} herramienta{enReparacion.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="p-4 flex flex-col gap-0">
            {!enReparacion.length ? (
              <p className="text-center py-8 text-gris-dark text-sm">✓ Ninguna herramienta en reparación</p>
            ) : (
              enReparacion.map(h => (
                <div key={h.id} className="flex items-center gap-3 py-3 border-b border-gris last:border-0">
                  <div className="w-8 h-8 rounded-full bg-rojo-light flex items-center justify-center text-rojo font-bold flex-shrink-0">
                    ⚙
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-carbon truncate">{h.nom}</div>
                    <div className="text-xs text-gris-dark font-mono">{h.codigo} · {h.marca ?? '—'}</div>
                  </div>
                  <div className="text-xs text-gris-dark text-right flex-shrink-0">
                    {h.responsable ?? '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Herramientas por obra */}
      {obras.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-gris">
            <h3 className="font-bold text-azul">Herramientas por obra</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Código', 'Obra', 'Herramientas activas'].map(h => (
                    <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-2.5 text-left uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obras
                  .map(o => ({
                    obra: o,
                    count: herramientas.filter(h => h.obra_cod === o.cod && h.estado_key === 'uso').length,
                  }))
                  .filter(r => r.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map(row => (
                    <tr key={row.obra.cod} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-gris px-2 py-0.5 rounded text-gris-dark font-bold">
                          {row.obra.cod}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-sm text-carbon">{row.obra.nom}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gris rounded-full h-2 max-w-[120px]">
                            <div
                              className="bg-naranja h-2 rounded-full"
                              style={{ width: `${Math.min(row.count / (stats?.enUso || 1) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-sm text-naranja-dark">{row.count}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                }
                {herramientas.filter(h => h.estado_key === 'uso').length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-gris-dark text-sm">
                      No hay herramientas asignadas a obras
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

function KPICard({
  label, value, color, icon, onClick,
}: {
  label: string; value: number; color: string; icon: string; onClick?: () => void
}) {
  const borders: Record<string, string> = {
    azul:    'border-azul',
    verde:   'border-verde',
    naranja: 'border-naranja',
    rojo:    'border-rojo',
    gris:    'border-gris-mid',
  }
  const vals: Record<string, string> = {
    azul:    'text-azul',
    verde:   'text-verde',
    naranja: 'text-naranja-dark',
    rojo:    'text-rojo',
    gris:    'text-gris-dark',
  }
  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-card shadow-card p-4 border-l-4 ${borders[color]}
        ${onClick ? 'cursor-pointer hover:shadow-card-lg transition-shadow' : ''}
      `}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gris-dark">{label}</span>
      </div>
      <div className={`font-display text-3xl tracking-wider ${vals[color]}`}>{value}</div>
    </div>
  )
}

function MovimientoTL({ mov }: { mov: HerrMovimiento }) {
  const COLOR_DOT: Record<string, string> = {
    verde:   'bg-verde-light text-verde',
    naranja: 'bg-naranja-light text-naranja-dark',
    rojo:    'bg-rojo-light text-rojo',
    azul:    'bg-azul-light text-azul-mid',
    gris:    'bg-gris text-gris-dark',
  }
  const color = mov.tipo?.color ?? 'azul'
  const origen  = mov.obra_origen?.nom  ?? 'Depósito'
  const destino = mov.obra_destino?.nom ?? 'Depósito'

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gris last:border-0">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${COLOR_DOT[color]}`}>
        {mov.tipo?.icono ?? '→'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-carbon truncate">
          {mov.herramienta?.nom ?? '—'} · {mov.tipo?.nom ?? mov.tipo_key}
        </div>
        <div className="text-xs text-gris-dark mt-0.5">
          {origen} → {destino}
          {mov.responsable ? ` · ${mov.responsable}` : ''}
        </div>
        <div className="text-[10px] font-mono text-gris-dark mt-0.5">{fmtFecha(mov.fecha)}</div>
      </div>
    </div>
  )
}