'use client'

import { useEffect, useState } from 'react'
import { useAuditLog } from '../hooks/useAudit'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import type { AuditLogEntry } from '@/types/domain.types'

// Módulos conocidos del sistema — lista fija para que el filtro sirva aunque
// el módulo buscado no aparezca en las 500 filas cargadas.
const MODULOS_CONOCIDOS = [
  'admin', 'alquiler', 'aridos', 'asignaciones', 'caja', 'cat-obra', 'categorias',
  'certificaciones', 'cierres', 'contratistas', 'cuenta-cliente', 'facturas-compra',
  'herramientas', 'horas', 'hs-extras', 'logistica', 'obras', 'oficina',
  'personal', 'prestamos', 'ropa', 'solicitudes', 'stock', 'tarifas', 'usuarios',
]

const ACCIONES = ['crear', 'actualizar', 'eliminar'] as const

function fmtFH(s: string) {
  const d = new Date(s)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const ACCION_CFG: Record<string, { bg: string; text: string }> = {
  crear:                 { bg: 'bg-verde-light',    text: 'text-verde' },
  actualizar:            { bg: 'bg-azul-light',     text: 'text-azul' },
  eliminar:              { bg: 'bg-rojo-light',     text: 'text-rojo' },
  comprar:               { bg: 'bg-azul-light',     text: 'text-azul' },
  'despachar de depósito': { bg: 'bg-naranja-light', text: 'text-naranja' },
  'marcar enviado':      { bg: 'bg-verde-light',    text: 'text-verde' },
  rechazar:              { bg: 'bg-rojo-light',      text: 'text-rojo' },
  revertir:              { bg: 'bg-amarillo-light',  text: 'text-[#7A5500]' },
}

export function AuditoriaTab() {
  const perfiles = usePerfilesMap()
  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroUser, setFiltroUser] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  // Búsqueda de texto server-side (detalle/entidad/id) con debounce: busca
  // sobre TODA la tabla de auditoría, no solo las filas ya cargadas.
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data: logs = [], isLoading, isFetching } = useAuditLog({
    modulo: filtroModulo || undefined,
    user_id: filtroUser || undefined,
    accion: filtroAccion || undefined,
    q: busquedaDebounced || undefined,
    // Los límites de día en hora argentina (-03): sin esto, "hasta" cortaría
    // a la medianoche UTC (21:00 ART) y perdería la tarde-noche del día.
    desde: filtroDesde ? `${filtroDesde}T00:00:00-03:00` : undefined,
    hasta: filtroHasta ? `${filtroHasta}T23:59:59-03:00` : undefined,
  })

  // El endpoint trae como máximo 500 filas: si llegaron exactamente 500,
  // casi seguro hay más — avisar para que el user acote con fechas.
  const tocaElTope = (logs as AuditLogEntry[]).length === 500

  // Módulos: lista fija ∪ los presentes en las filas (por si aparece uno nuevo).
  const modulos = [...new Set([...MODULOS_CONOCIDOS, ...(logs as AuditLogEntry[]).map(l => l.modulo)])].sort()
  // Usuarios: TODOS los perfiles del sistema (no solo los de las filas cargadas).
  const usuarios = [...perfiles.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const hayFiltros = !!(filtroModulo || filtroUser || filtroAccion || filtroDesde || filtroHasta || busqueda)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-col gap-2">
        {/* Buscador de texto — busca en detalle, entidad e ID sobre TODO el
            historial (server-side), no solo las filas cargadas. */}
        <div className="relative max-w-xl">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-mid text-xs pointer-events-none">🔍</span>
          <input
            type="text"
            autoComplete="off"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar en el detalle... (ej: FARM 25, contrat_id=2, leg=074, un monto)"
            className="w-full pl-8 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-mid hover:text-rojo text-xs font-bold"
            >✕</button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroUser} onChange={e => setFiltroUser(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todos los usuarios</option>
            {usuarios.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
          <select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todas las acciones</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div>
            <label className="block text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-0.5">Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-0.5">Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja" />
          </div>
          {hayFiltros && (
            <button onClick={() => { setFiltroModulo(''); setFiltroUser(''); setFiltroAccion(''); setFiltroDesde(''); setFiltroHasta(''); setBusqueda('') }}
              className="text-[11px] font-semibold text-gris-dark hover:text-rojo self-end pb-2">
              ✕ Limpiar filtros
            </button>
          )}
          <span className="text-xs text-gris-dark">
            {(logs as AuditLogEntry[]).length} registros{isFetching && !isLoading ? ' · buscando…' : ''}
          </span>
          {tocaElTope && (
            <span className="text-xs font-semibold bg-amarillo-light text-[#7A5500] px-2 py-1 rounded">
              ⚠ Mostrando los 500 más recientes que matchean — acotá con fechas o afiná la búsqueda
            </span>
          )}
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  {['Fecha', 'Usuario', 'Módulo', 'Acción', 'Entidad', 'ID', 'Detalle'].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(logs as AuditLogEntry[]).length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">
                    {hayFiltros ? 'Sin registros que matcheen los filtros — probá ampliar fechas o cambiar el texto.' : 'Sin registros de actividad.'}
                  </td></tr>
                ) : (logs as AuditLogEntry[]).map(l => {
                  const cfg = ACCION_CFG[l.accion] ?? { bg: 'bg-gris', text: 'text-carbon' }
                  return (
                    <tr key={l.id} className="border-b border-gris last:border-0 hover:bg-gris/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-gris-dark font-mono whitespace-nowrap">{fmtFH(l.created_at)}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-carbon">{l.user_id ? (perfiles.get(l.user_id) ?? l.user_nombre ?? '…') : '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold bg-gris text-gris-dark px-2 py-0.5 rounded">{l.modulo}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{l.accion}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-carbon">{l.entidad}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark font-mono">{l.entidad_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark">{l.detalle ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
