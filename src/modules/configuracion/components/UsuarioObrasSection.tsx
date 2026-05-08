'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from '@/lib/api/client'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/types/domain.types'

interface AssignedObra {
  obra_cod: string
  modulo:   string | null
  obras: { cod: string; nom: string; dir: string | null } | null
}

interface Props {
  user: Profile
}

// ─── Cálculo de qué módulos requieren obras explícitas ──────────────
//
// Devuelve un array ordenado de "scopes asignables": cada uno es un
// módulo (o null para "globales") que tiene scope='asignadas'. Si el
// scope global del perfil es 'asignadas' Y no está sobreescrito por
// todos los módulos que el user tiene, se incluye "globales" (null).
function getScopesAsignables(user: Profile): Array<{ key: string | null; label: string }> {
  if (user.rol === 'admin') return []
  const result: Array<{ key: string | null; label: string }> = []

  // Globales: aplica si el scope global es 'asignadas'.
  if (user.obras_scope === 'asignadas') {
    result.push({ key: null, label: '🌐 Globales (todos los módulos)' })
  }

  // Por módulo: aplica si hay un override 'asignadas' en permisos.<m>.obras_scope.
  const permisos = (user.permisos ?? {}) as Record<string, { obras_scope?: 'todas' | 'asignadas' }>
  for (const [mod, flags] of Object.entries(permisos)) {
    if (flags?.obras_scope === 'asignadas') {
      // Si ya está cubierto por "globales" + ese módulo no tiene override
      // distinto, podríamos omitirlo, pero acá solo entramos si SI hay
      // override explícito así que es un selector diferenciado.
      result.push({ key: mod, label: `📋 ${capitalize(mod)}` })
    }
  }

  return result
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Componente principal ──────────────────────────────────────────

export function UsuarioObrasSection({ user }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('')
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())

  const scopes = useMemo(() => getScopesAsignables(user), [user])

  // Módulo (o null para globales) actualmente seleccionado en la UI.
  const [moduloActivo, setModuloActivo] = useState<string | null>(scopes[0]?.key ?? null)

  // Si cambian los scopes (por ejemplo el admin cambió el rol del user),
  // re-seleccionar el primero para no quedar apuntando a uno inválido.
  useEffect(() => {
    if (scopes.length === 0) return
    const aunValido = scopes.some(s => s.key === moduloActivo)
    if (!aunValido) setModuloActivo(scopes[0].key)
  }, [scopes, moduloActivo])

  // Cargar obras existentes (no archivadas) y las asignaciones del user.
  const { data: obras = [] } = useObras()
  const { data: asignadas = [], isLoading } = useQuery({
    queryKey: ['usuario-obras', user.id],
    queryFn:  () => apiGet<AssignedObra[]>(`/api/usuarios/${user.id}/obras`),
  })

  // Filtrar las asignaciones que corresponden al módulo activo.
  // Ojo: en este selector solo mostramos las rows del scope que
  // estamos editando. Las rows con otros módulos no se ven acá.
  const asignadasDelScope = useMemo(
    () => asignadas.filter(a => a.modulo === moduloActivo),
    [asignadas, moduloActivo],
  )

  // Mantener el set local sincronizado con lo que vino del server, filtrado por scope.
  useEffect(() => {
    setSeleccionadas(new Set(asignadasDelScope.map(a => a.obra_cod)))
  }, [asignadasDelScope])

  const { mutate: guardar, isPending: guardando } = useMutation({
    mutationFn: (payload: { obras: string[]; modulo: string | null }) =>
      apiPut(`/api/usuarios/${user.id}/obras`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-obras', user.id] })
      toast('✓ Obras actualizadas', 'ok')
    },
    onError: (err: { message?: string }) => toast(err?.message || 'Error al guardar', 'err'),
  })

  const obrasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return obras
    return obras.filter(o =>
      o.cod.toLowerCase().includes(q) ||
      o.nom.toLowerCase().includes(q),
    )
  }, [obras, filtro])

  const initialSet = useMemo(
    () => new Set(asignadasDelScope.map(a => a.obra_cod)),
    [asignadasDelScope],
  )
  const dirty = useMemo(() => {
    if (initialSet.size !== seleccionadas.size) return true
    for (const c of seleccionadas) if (!initialSet.has(c)) return true
    return false
  }, [initialSet, seleccionadas])

  function toggle(cod: string) {
    setSeleccionadas(prev => {
      const next = new Set(prev)
      if (next.has(cod)) next.delete(cod)
      else next.add(cod)
      return next
    })
  }

  function seleccionarTodas() {
    setSeleccionadas(new Set(obras.map(o => o.cod)))
  }
  function quitarTodas() {
    setSeleccionadas(new Set())
  }

  // No mostrar para admin: ven todo siempre.
  if (user.rol === 'admin') return null

  // Si ningún módulo requiere obras asignadas, no mostrar la sección.
  // (Pasa cuando obras_scope='todas' y ningún módulo tiene override.)
  if (scopes.length === 0) return null

  // Texto contextual del scope activo.
  const labelActivo = scopes.find(s => s.key === moduloActivo)?.label ?? ''
  const help = moduloActivo === null
    ? 'Las obras tildadas aplican a todos los módulos donde el usuario tiene scope "asignadas".'
    : `Obras visibles solo para el módulo "${moduloActivo}". El resto de los módulos no se ve afectado.`

  return (
    <div className="border-t border-gris pt-4 mt-2 flex flex-col gap-3">
      <div>
        <h4 className="font-bold text-sm text-azul">Obras asignadas</h4>
        <p className="text-[11px] text-gris-dark mt-0.5">
          Sin tildar = sin acceso a esa obra en el módulo seleccionado.
        </p>
      </div>

      {/* Tabs por scope, solo si hay >1. */}
      {scopes.length > 1 && (
        <div className="flex gap-1 flex-wrap border-b border-gris -mb-2">
          {scopes.map(s => (
            <button
              key={s.key ?? '__global__'}
              type="button"
              onClick={() => setModuloActivo(s.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-t-lg border-[1.5px] border-b-0 transition-all
                ${moduloActivo === s.key
                  ? 'bg-naranja-light border-naranja text-naranja-dark'
                  : 'bg-white border-transparent text-gris-dark hover:text-naranja'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {scopes.length === 1 && (
        <div className="text-[11px] text-azul-mid bg-azul-light/50 px-2 py-1 rounded">
          {labelActivo}
        </div>
      )}

      <p className="text-[11px] text-gris-dark italic">{help}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por código o nombre..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="flex-1 min-w-[160px]"
        />
        <Button variant="ghost" size="sm" onClick={seleccionarTodas} disabled={obras.length === 0}>
          Todas ({obras.length})
        </Button>
        <Button variant="ghost" size="sm" onClick={quitarTodas} disabled={seleccionadas.size === 0}>
          Ninguna
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando obras asignadas...</div>
      ) : (
        <div className="bg-gris/40 rounded-lg max-h-56 overflow-y-auto divide-y divide-gris">
          {obrasFiltradas.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gris-dark text-center italic">
              {filtro ? 'Sin resultados' : 'No hay obras cargadas'}
            </p>
          ) : (
            obrasFiltradas.map(o => {
              const checked = seleccionadas.has(o.cod)
              return (
                <label
                  key={o.cod}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.cod)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] bg-gris text-gris-dark px-1.5 py-0.5 rounded font-bold">
                        {o.cod}
                      </span>
                      <span className="text-sm font-semibold text-carbon truncate">{o.nom}</span>
                    </div>
                    {o.dir && (
                      <div className="text-[11px] text-gris-dark mt-0.5 truncate">📍 {o.dir}</div>
                    )}
                  </div>
                </label>
              )
            })
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gris-dark">
          {seleccionadas.size} obra{seleccionadas.size !== 1 ? 's' : ''} seleccionada{seleccionadas.size !== 1 ? 's' : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          loading={guardando}
          disabled={!dirty}
          onClick={() => guardar({ obras: Array.from(seleccionadas), modulo: moduloActivo })}
        >
          ✓ Guardar obras
        </Button>
      </div>
    </div>
  )
}
