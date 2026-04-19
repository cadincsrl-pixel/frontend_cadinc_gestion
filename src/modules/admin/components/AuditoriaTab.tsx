'use client'

import { useState } from 'react'
import { useAuditLog } from '../hooks/useAudit'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import type { AuditLogEntry } from '@/types/domain.types'

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

  const { data: logs = [], isLoading } = useAuditLog({
    modulo: filtroModulo || undefined,
    user_id: filtroUser || undefined,
  })

  const modulos = [...new Set((logs as AuditLogEntry[]).map(l => l.modulo))].sort()
  const usuarios = [...new Map((logs as AuditLogEntry[]).filter(l => l.user_id).map(l => [l.user_id, perfiles.get(l.user_id!) ?? l.user_nombre ?? '…'])).entries()]

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
          <option value="">Todos los módulos</option>
          {modulos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtroUser} onChange={e => setFiltroUser(e.target.value)}
          className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
          <option value="">Todos los usuarios</option>
          {usuarios.map(([id, nom]) => <option key={id} value={id!}>{nom}</option>)}
        </select>
        <span className="text-xs text-gris-dark">{(logs as AuditLogEntry[]).length} registros</span>
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
                  <tr><td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">Sin registros de actividad.</td></tr>
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
