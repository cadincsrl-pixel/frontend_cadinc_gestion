'use client'

import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'

interface Props {
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} ${hora}`
}

export function AuditInfo({ createdBy, updatedBy, createdAt, updatedAt }: Props) {
  const perfiles = usePerfilesMap()

  const creadorNombre  = createdBy ? (perfiles.get(createdBy) ?? 'Usuario desconocido') : null
  const editorNombre   = updatedBy ? (perfiles.get(updatedBy) ?? 'Usuario desconocido') : null

  // No renderizar si no hay ningún dato de auditoría
  if (!createdBy && !updatedBy && !createdAt && !updatedAt) return null

  const mismoPerfil  = createdBy && updatedBy && createdBy === updatedBy
  const mismaFecha   = createdAt && updatedAt && createdAt === updatedAt

  return (
    <div className="mt-1 pt-3 border-t border-gris-mid">
      <p className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-2">
        Auditoría
      </p>
      <div className="flex flex-col gap-1">
        {/* Creación */}
        {(creadorNombre || createdAt) && (
          <div className="flex items-center gap-1.5 text-[11px] text-gris-dark">
            <span className="text-[13px]">✦</span>
            <span>
              <span className="font-semibold text-carbon">Creado</span>
              {creadorNombre && (
                <> por <span className="font-bold text-azul">{creadorNombre}</span></>
              )}
              {createdAt && (
                <span className="text-gris-dark"> · {fmtFecha(createdAt)}</span>
              )}
            </span>
          </div>
        )}

        {/* Última edición — solo mostrar si difiere de la creación */}
        {(editorNombre || updatedAt) && !(mismoPerfil && mismaFecha) && (
          <div className="flex items-center gap-1.5 text-[11px] text-gris-dark">
            <span className="text-[13px]">✎</span>
            <span>
              <span className="font-semibold text-carbon">Última edición</span>
              {editorNombre && (
                <> por <span className="font-bold text-naranja">{editorNombre}</span></>
              )}
              {updatedAt && (
                <span className="text-gris-dark"> · {fmtFecha(updatedAt)}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
