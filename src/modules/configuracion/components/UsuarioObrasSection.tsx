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
  obras: { cod: string; nom: string; dir: string | null } | null
}

interface Props {
  user: Profile
}

// Sección dentro del modal de "Editar usuario" para asignar obras a un user
// no-admin. Permite ver, agregar y quitar obras del set asignado.
//
// El backend reemplaza el set completo en cada PUT (es atómico, simple para
// UI: el user toca checkboxes y al guardar persiste). No mostramos esta
// sección para usuarios admin: ven todo por definición.
export function UsuarioObrasSection({ user }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('')
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())

  // Cargar las obras existentes (sin archivadas).
  const { data: obras = [] } = useObras()
  const { data: asignadas = [], isLoading } = useQuery({
    queryKey: ['usuario-obras', user.id],
    queryFn:  () => apiGet<AssignedObra[]>(`/api/usuarios/${user.id}/obras`),
  })

  // Mantener el set local sincronizado con lo que vino del server.
  useEffect(() => {
    setSeleccionadas(new Set(asignadas.map(a => a.obra_cod)))
  }, [asignadas])

  const { mutate: guardar, isPending: guardando } = useMutation({
    mutationFn: (obrasArr: string[]) =>
      apiPut(`/api/usuarios/${user.id}/obras`, { obras: obrasArr }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-obras', user.id] })
      toast('✓ Obras actualizadas', 'ok')
    },
    onError: (err: any) => toast(err?.message || 'Error al guardar', 'err'),
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
    () => new Set(asignadas.map(a => a.obra_cod)),
    [asignadas],
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

  return (
    <div className="border-t border-gris pt-4 mt-2 flex flex-col gap-3">
      <div>
        <h4 className="font-bold text-sm text-azul">Obras asignadas</h4>
        <p className="text-[11px] text-gris-dark mt-0.5">
          El usuario solo va a ver pedidos / certificaciones / etc. de las obras tildadas.
          Sin tildar = sin acceso a ninguna obra.
        </p>
      </div>

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
          onClick={() => guardar(Array.from(seleccionadas))}
        >
          ✓ Guardar obras
        </Button>
      </div>
    </div>
  )
}
