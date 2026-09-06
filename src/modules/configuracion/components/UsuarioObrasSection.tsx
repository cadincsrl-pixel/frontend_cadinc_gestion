'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from '@/lib/api/client'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/types/domain.types'

interface AssignedObra {
  obra_cod: string
  obras: { cod: string; nom: string; dir: string | null } | null
}

interface Props {
  user: Profile
}

/**
 * Qué alcances usan la lista de obras del usuario: el global del perfil
 * (`obras_scope='asignadas'`) y/o los overrides por módulo
 * (`permisos.<modulo>.obras_scope='asignadas'`). Hay UNA lista por usuario
 * (`usuario_obras` ya no distingue módulo); el módulo solo decide si la
 * lista aplica o si ve todas las obras.
 */
function alcancesConObrasAsignadas(user: Profile): { global: boolean; modulos: string[] } {
  const permisos = (user.permisos ?? {}) as Record<string, { obras_scope?: 'todas' | 'asignadas' } | undefined>
  const modulos = Object.entries(permisos)
    .filter(([, flags]) => flags?.obras_scope === 'asignadas')
    .map(([mod]) => mod)
  return { global: user.obras_scope === 'asignadas', modulos }
}

export function UsuarioObrasSection({ user }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('')
  // null = sin cambios locales: se muestra lo que vino del server. Así no
  // hace falta sincronizar un estado con un efecto cada vez que refetchea.
  const [edicion, setEdicion] = useState<Set<string> | null>(null)

  const alcance = useMemo(() => alcancesConObrasAsignadas(user), [user])
  const aplica = user.rol !== 'admin' && (alcance.global || alcance.modulos.length > 0)

  // Obras existentes (no archivadas) y las asignadas al user.
  const { data: obras = [] } = useObras()
  const { data: asignadas = [], isLoading, isError, error } = useQuery({
    queryKey: ['usuario-obras', user.id],
    queryFn:  () => apiGet<AssignedObra[]>(`/api/usuarios/${user.id}/obras`),
    enabled:  aplica,
  })

  const { mutate: guardar, isPending: guardando } = useMutation({
    mutationFn: (payload: { obras: string[] }) => apiPut(`/api/usuarios/${user.id}/obras`, payload),
    onSuccess: () => {
      setEdicion(null)
      qc.invalidateQueries({ queryKey: ['usuario-obras', user.id] })
      toast('✓ Obras actualizadas', 'ok')
    },
    onError: (err: { message?: string }) => toast(err?.message || 'Error al guardar', 'err'),
  })

  const obrasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return obras
    return obras.filter(o => o.cod.toLowerCase().includes(q) || o.nom.toLowerCase().includes(q))
  }, [obras, filtro])

  const initialSet = useMemo(() => new Set(asignadas.map(a => a.obra_cod)), [asignadas])
  const seleccionadas = edicion ?? initialSet
  const dirty = useMemo(() => {
    if (!edicion) return false
    if (initialSet.size !== edicion.size) return true
    for (const c of edicion) if (!initialSet.has(c)) return true
    return false
  }, [initialSet, edicion])

  function toggle(cod: string) {
    setEdicion(prev => {
      const next = new Set(prev ?? initialSet)
      if (next.has(cod)) next.delete(cod)
      else next.add(cod)
      return next
    })
  }

  // Admin ve todo; si ningún alcance es "asignadas" la lista no se usa.
  if (!aplica) return null

  const help = alcance.global
    ? `Estas obras son las que el usuario ve y opera en todos los módulos con alcance "solo obras asignadas"${alcance.modulos.length ? ` (además, por módulo: ${alcance.modulos.join(', ')})` : ''}.`
    : `Estas obras aplican solo a: ${alcance.modulos.join(', ')}. En el resto de los módulos ve todas.`

  return (
    <div className="border-t border-gris pt-4 mt-2 flex flex-col gap-3">
      <div>
        <h4 className="font-bold text-sm text-azul">Obras asignadas</h4>
        <p className="text-[11px] text-gris-dark mt-0.5">Sin tildar = sin acceso a esa obra.</p>
      </div>

      <p className="text-[11px] text-gris-dark italic">{help}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por código o nombre..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="flex-1 min-w-[160px]"
        />
        <Button variant="ghost" size="sm" onClick={() => setEdicion(new Set(obras.map(o => o.cod)))} disabled={obras.length === 0}>
          Todas ({obras.length})
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEdicion(new Set())} disabled={seleccionadas.size === 0}>
          Ninguna
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando obras asignadas...</div>
      ) : isError ? (
        <div className="text-xs text-rojo font-semibold">
          No se pudieron cargar las obras asignadas: {error instanceof Error ? error.message : 'error'}
        </div>
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
                  <input type="checkbox" checked={checked} onChange={() => toggle(o.cod)} className="w-4 h-4" />
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
          disabled={!dirty || isError}
          onClick={() => guardar({ obras: Array.from(seleccionadas) })}
        >
          ✓ Guardar obras
        </Button>
      </div>
    </div>
  )
}
