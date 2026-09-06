'use client'

import { useEffect, useState } from 'react'
import { useAuditLog, fetchAuditTodo, type AuditFiltros } from '../hooks/useAudit'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { useToast } from '@/components/ui/Toast'
import type { AuditLogEntry } from '@/types/domain.types'

const POR_PAGINA = 200
const MAX_EXPORT = 10_000

// Módulos conocidos del sistema — lista fija para que el filtro sirva aunque
// el módulo buscado no aparezca en la página cargada.
const MODULOS_CONOCIDOS = [
  'admin', 'alquiler', 'aridos', 'asignaciones', 'asistente', 'caja', 'cat-obra', 'categorias',
  'certificaciones', 'cierres', 'contratistas', 'cuenta-cliente', 'facturas-compra', 'flota',
  'herramientas', 'horas', 'hs-extras', 'logistica', 'obras', 'oficina', 'personal', 'prestamos',
  'proveedores', 'remitos-envio', 'ropa', 'solicitudes', 'stock', 'stock-cliente', 'stock-proveedor',
  'tarifas', 'usuarios',
]

// Acciones que escribe el backend (middleware de auditoría + trigger
// `audit_cambios`). 'cambio' = antes/después de una tabla sensible;
// 'denegado' = un 403.
const ACCIONES = [
  'crear', 'actualizar', 'eliminar', 'cambio', 'denegado',
  'cargar horas', 'poblar semana', 'cargar en lote',
  'archivar', 'desarchivar', 'comprar', 'despachar de depósito', 'marcar enviado', 'rechazar', 'revertir',
  'cerrar', 'reabrir', 'aprobar', 'marcar pagado', 'cobrar', 'subir adjunto', 'dar de baja',
  'fusionar', 'retirar de proveedor',
]

function fmtFH(s: string) {
  const d = new Date(s)
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtN = (n: number) => n.toLocaleString('es-AR')

const ACCION_CFG: Record<string, { bg: string; text: string }> = {
  crear:                   { bg: 'bg-verde-light',    text: 'text-verde' },
  actualizar:              { bg: 'bg-azul-light',     text: 'text-azul' },
  eliminar:                { bg: 'bg-rojo-light',     text: 'text-rojo' },
  cambio:                  { bg: 'bg-[#EEE6FA]',      text: 'text-[#5B2E9E]' },
  denegado:                { bg: 'bg-rojo',           text: 'text-white' },
  'cargar horas':          { bg: 'bg-verde-light',    text: 'text-verde' },
  'poblar semana':         { bg: 'bg-gris',           text: 'text-gris-dark' },
  'cargar en lote':        { bg: 'bg-gris',           text: 'text-gris-dark' },
  comprar:                 { bg: 'bg-azul-light',     text: 'text-azul' },
  'despachar de depósito': { bg: 'bg-naranja-light',  text: 'text-naranja' },
  'marcar enviado':        { bg: 'bg-verde-light',    text: 'text-verde' },
  rechazar:                { bg: 'bg-rojo-light',     text: 'text-rojo' },
  revertir:                { bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  archivar:                { bg: 'bg-gris',           text: 'text-gris-dark' },
  cerrar:                  { bg: 'bg-azul-light',     text: 'text-azul' },
  reabrir:                 { bg: 'bg-amarillo-light', text: 'text-[#7A5500]' },
  'subir adjunto':         { bg: 'bg-gris',           text: 'text-gris-dark' },
}

/** El detalle: los 'cambio' se abren en "campo: antes → después" por renglón. */
function Detalle({ l }: { l: AuditLogEntry }) {
  if (!l.detalle) return <span className="text-gris-mid">—</span>
  if (l.accion === 'cambio') {
    return (
      <ul className="space-y-0.5">
        {l.detalle.split(' · ').map((parte, i) => {
          const m = parte.match(/^(.+?): (.*) → (.*)$/)
          if (!m) return <li key={i}>{parte}</li>
          return (
            <li key={i} className="font-mono text-[11px] leading-4">
              <span className="font-bold text-carbon">{m[1]}</span>
              <span className="text-gris-mid">: </span>
              <span className="line-through text-gris-dark">{m[2]}</span>
              <span className="text-gris-mid"> → </span>
              <span className="font-bold text-azul">{m[3]}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <span className={`whitespace-pre-wrap break-words ${l.accion === 'denegado' ? 'text-rojo font-semibold' : ''}`}>
      {l.detalle}
    </span>
  )
}

function aCSV(rows: AuditLogEntry[], nombreDe: (l: AuditLogEntry) => string): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cab = ['fecha', 'usuario', 'modulo', 'accion', 'entidad', 'id', 'detalle', 'ip']
  const filas = rows.map(l => [fmtFH(l.created_at), nombreDe(l), l.modulo, l.accion, l.entidad, l.entidad_id ?? '', l.detalle ?? '', l.ip ?? ''].map(esc).join(';'))
  // BOM para que Excel (es-AR) abra el UTF-8 y tome el ; como separador.
  return '﻿' + [cab.join(';'), ...filas].join('\r\n')
}

function descargar(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const selectCls = 'px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja'
const btnPagina = 'px-2.5 py-1 rounded-md border-[1.5px] border-gris-mid text-xs font-bold text-carbon hover:bg-gris disabled:opacity-40 disabled:cursor-not-allowed'

export function AuditoriaTab() {
  const perfiles = usePerfilesMap()
  const toast = useToast()
  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroUser, setFiltroUser] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  // La carga de horas de tarja es la mitad del historial: se esconde por
  // defecto y se prende cuando hace falta.
  const [verTarja, setVerTarja] = useState(false)
  const [pagina, setPagina] = useState(0)
  const [exportando, setExportando] = useState(false)
  // Búsqueda de texto server-side (detalle/entidad/id/usuario) con debounce:
  // busca sobre TODA la tabla de auditoría, no solo las filas ya cargadas.
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtros: AuditFiltros = {
    modulo: filtroModulo || undefined,
    user_id: filtroUser || undefined,
    accion: filtroAccion || undefined,
    q: busquedaDebounced || undefined,
    // Los límites de día en hora argentina (-03): sin esto, "hasta" cortaría
    // a la medianoche UTC (21:00 ART) y perdería la tarde-noche del día.
    desde: filtroDesde ? `${filtroDesde}T00:00:00-03:00` : undefined,
    hasta: filtroHasta ? `${filtroHasta}T23:59:59-03:00` : undefined,
    excluir: verTarja || filtroModulo === 'horas' ? undefined : ['horas'],
  }
  const claveFiltros = JSON.stringify(filtros)
  // Cualquier cambio de filtro vuelve a la primera página.
  useEffect(() => { setPagina(0) }, [claveFiltros])

  const { data, isLoading, isFetching, isError, error } = useAuditLog({ ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA })
  const logs = data?.items ?? []
  const total = data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const desdeN = total === 0 ? 0 : pagina * POR_PAGINA + 1
  const hastaN = Math.min(total, (pagina + 1) * POR_PAGINA)

  // Módulos: lista fija ∪ los presentes en las filas (por si aparece uno nuevo).
  const modulos = [...new Set([...MODULOS_CONOCIDOS, ...logs.map(l => l.modulo)])].sort()
  // Usuarios: TODOS los perfiles del sistema (no solo los de las filas cargadas).
  const usuarios = [...perfiles.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const hayFiltros = !!(filtroModulo || filtroUser || filtroAccion || filtroDesde || filtroHasta || busqueda)

  const nombreDe = (l: AuditLogEntry) =>
    l.user_id ? (perfiles.get(l.user_id) ?? l.user_nombre ?? '…') : (l.user_nombre || 'sistema')

  async function exportar() {
    setExportando(true)
    try {
      const { items, total: totalReal } = await fetchAuditTodo(filtros, MAX_EXPORT)
      const hoy = new Date().toISOString().slice(0, 10)
      descargar(`auditoria-${hoy}.csv`, aCSV(items, nombreDe))
      toast(totalReal > items.length
        ? `Exportadas ${fmtN(items.length)} de ${fmtN(totalReal)} filas (tope ${fmtN(MAX_EXPORT)}): acotá con fechas para el resto.`
        : `Exportadas ${fmtN(items.length)} filas.`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'err')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="relative max-w-xl">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-mid text-xs pointer-events-none">🔍</span>
          <input
            type="text"
            autoComplete="off"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar en el detalle, id o usuario... (ej: FARM 25, precio_ref, leg=074, un monto)"
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
          <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)} className={selectCls}>
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filtroUser} onChange={e => setFiltroUser(e.target.value)} className={selectCls}>
            <option value="">Todos los usuarios</option>
            {usuarios.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
          <select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)} className={selectCls}>
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
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer select-none self-end pb-2">
            <input type="checkbox" checked={verTarja} onChange={e => setVerTarja(e.target.checked)} className="accent-naranja" />
            Ver carga de horas
          </label>
          {hayFiltros && (
            <button onClick={() => { setFiltroModulo(''); setFiltroUser(''); setFiltroAccion(''); setFiltroDesde(''); setFiltroHasta(''); setBusqueda('') }}
              className="text-[11px] font-semibold text-gris-dark hover:text-rojo self-end pb-2">
              ✕ Limpiar filtros
            </button>
          )}
          <button
            type="button"
            onClick={exportar}
            disabled={exportando || total === 0}
            title={`Descarga hasta ${fmtN(MAX_EXPORT)} filas con los filtros actuales (CSV para Excel)`}
            className="ml-auto text-xs font-bold px-3 py-2 rounded-lg border-[1.5px] border-gris-mid text-carbon hover:bg-gris disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exportando ? 'Exportando…' : '⬇ Exportar CSV'}
          </button>
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      ) : isError ? (
        <div className="bg-rojo-light text-rojo rounded-card p-4 text-sm font-semibold">
          No se pudo cargar la auditoría: {error instanceof Error ? error.message : 'error'}
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gris text-xs text-gris-dark">
            <span>
              {total === 0 ? 'Sin registros' : <>Mostrando <b>{fmtN(desdeN)}–{fmtN(hastaN)}</b> de <b>{fmtN(total)}</b></>}
              {isFetching && !isLoading ? ' · actualizando…' : ''}
            </span>
            {paginas > 1 && (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <button type="button" className={btnPagina} disabled={pagina === 0} onClick={() => setPagina(0)} title="Primera página">«</button>
                <button type="button" className={btnPagina} disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>‹ Anterior</button>
                <span className="px-1 font-semibold">pág. {fmtN(pagina + 1)} / {fmtN(paginas)}</span>
                <button type="button" className={btnPagina} disabled={pagina >= paginas - 1} onClick={() => setPagina(p => p + 1)}>Siguiente ›</button>
                <button type="button" className={btnPagina} disabled={pagina >= paginas - 1} onClick={() => setPagina(paginas - 1)} title="Última página">»</button>
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {['Fecha', 'Usuario', 'Módulo', 'Acción', 'Entidad', 'ID', 'Detalle'].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">
                    {hayFiltros ? 'Sin registros que matcheen los filtros — probá ampliar fechas o cambiar el texto.' : 'Sin registros de actividad.'}
                  </td></tr>
                ) : logs.map(l => {
                  const cfg = ACCION_CFG[l.accion] ?? { bg: 'bg-gris', text: 'text-carbon' }
                  const esDenegado = l.accion === 'denegado'
                  return (
                    <tr key={l.id} className={`border-b border-gris last:border-0 transition-colors ${esDenegado ? 'bg-rojo-light/40 hover:bg-rojo-light/60' : 'hover:bg-gris/30'}`}>
                      <td className="px-4 py-2.5 text-xs text-gris-dark font-mono whitespace-nowrap align-top">{fmtFH(l.created_at)}</td>
                      <td className={`px-4 py-2.5 text-sm font-medium align-top ${l.user_id ? 'text-carbon' : 'text-gris-dark italic'}`} title={l.ip ? `IP ${l.ip}` : undefined}>
                        {nombreDe(l)}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span className="text-xs font-bold bg-gris text-gris-dark px-2 py-0.5 rounded">{l.modulo}</span>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${cfg.bg} ${cfg.text}`}>{l.accion}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-carbon align-top">{l.entidad}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark font-mono align-top whitespace-nowrap">{l.entidad_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark align-top max-w-[560px]"><Detalle l={l} /></td>
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
