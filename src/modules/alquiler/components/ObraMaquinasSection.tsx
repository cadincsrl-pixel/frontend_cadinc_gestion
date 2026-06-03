'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import {
  useObraMaquinas,
  useMaquinas,
  useAsignarMaquina,
  useUpdateMaquinista,
  useDesasignarMaquina,
} from '../hooks/useAlquiler'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { MAQUINA_TIPO_LABEL } from '../types'

interface Props {
  obraId: number
  puedeEditar: boolean
}

// Sección "Máquinas asignadas" dentro del detalle de una obra de alquiler.
// Permite asignar máquinas a la obra y a cada una un maquinista (texto del
// usuario). POST/PATCH/DELETE a obra-maquinas, con invalidación.
export function ObraMaquinasSection({ obraId, puedeEditar }: Props) {
  const toast = useToast()
  const { data: asignadas = [], isLoading, isError } = useObraMaquinas(obraId)
  const { data: todasMaquinas = [] } = useMaquinas()
  // Maquinista = trabajador del listado de personal de tarja (sin login).
  const { data: personal = [] } = usePersonal()
  const { mutate: asignar, isPending: asignando } = useAsignarMaquina()
  const { mutate: cambiarMaquinista } = useUpdateMaquinista()
  const { mutate: desasignar } = useDesasignarMaquina()

  const [maquinaSel, setMaquinaSel] = useState('')
  const [maquinistaSel, setMaquinistaSel] = useState('')

  // Máquinas que todavía no están asignadas a esta obra.
  const disponibles = useMemo(() => {
    const yaAsignadas = new Set(asignadas.map(a => a.maquina_id))
    return todasMaquinas.filter(m => !yaAsignadas.has(m.id))
  }, [todasMaquinas, asignadas])

  const opcionesMaquina = useMemo(
    () => disponibles.map(m => ({ value: String(m.id), label: `${m.nombre} · ${MAQUINA_TIPO_LABEL[m.tipo]}` })),
    [disponibles],
  )

  // Opciones de maquinista desde el personal (ordenado por nombre).
  const opcionesMaquinista = useMemo(
    () => [
      { value: '', label: '— sin maquinista —' },
      ...[...personal]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .map(p => ({ value: p.leg, label: `${p.leg} · ${p.nom}` })),
    ],
    [personal],
  )

  const nombrePersonal = useMemo(() => {
    const m = new Map<string, string>()
    personal.forEach(p => m.set(p.leg, p.nom))
    return m
  }, [personal])

  function handleAsignar() {
    if (!maquinaSel) { toast('Elegí una máquina', 'warn'); return }
    asignar(
      {
        obraId,
        dto: {
          maquina_id: Number(maquinaSel),
          maquinista_leg: maquinistaSel || null,
        },
      },
      {
        onSuccess: () => {
          toast('✓ Máquina asignada', 'ok')
          setMaquinaSel('')
          setMaquinistaSel('')
        },
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al asignar', 'err'),
      },
    )
  }

  function handleCambiarMaquinista(id: number, value: string) {
    cambiarMaquinista(
      { id, obraId, maquinista_leg: value || null },
      {
        onSuccess: () => toast('✓ Maquinista actualizado', 'ok'),
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al actualizar', 'err'),
      },
    )
  }

  function handleDesasignar(id: number, nombre: string) {
    if (!confirm(`¿Quitar "${nombre}" de esta obra?`)) return
    desasignar(
      { id, obraId },
      {
        onSuccess: () => toast('✓ Máquina quitada', 'ok'),
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al quitar', 'err'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
        Máquinas asignadas
      </div>

      {/* Formulario de asignación */}
      {puedeEditar && (
        <div className="bg-gris/40 rounded-lg p-3 flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Combobox
              label="Máquina"
              placeholder={disponibles.length ? 'Buscar máquina...' : 'No quedan máquinas libres'}
              options={opcionesMaquina}
              value={maquinaSel}
              onChange={setMaquinaSel}
              disabled={disponibles.length === 0}
            />
            <Combobox
              label="Maquinista (opcional)"
              placeholder="Buscar usuario..."
              options={opcionesMaquinista}
              value={maquinistaSel}
              onChange={setMaquinistaSel}
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              loading={asignando}
              disabled={!maquinaSel || disponibles.length === 0}
              onClick={handleAsignar}
            >
              ＋ Asignar máquina
            </Button>
          </div>
        </div>
      )}

      {/* Lista de asignadas */}
      {isLoading ? (
        <div className="text-center py-4 text-gris-dark text-sm">Cargando...</div>
      ) : isError ? (
        <div className="text-center py-4 text-rojo text-sm">No se pudieron cargar las asignaciones.</div>
      ) : asignadas.length === 0 ? (
        <div className="text-center py-4 text-gris-dark text-sm italic">
          No hay máquinas asignadas a esta obra.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {asignadas.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 bg-white border border-gris rounded-lg px-3 py-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-bold text-sm text-carbon truncate">{a.maquina.nombre}</div>
                <div className="text-xs text-gris-dark">
                  {MAQUINA_TIPO_LABEL[a.maquina.tipo]}
                  {a.maquina.identificacion && <span className="font-mono"> · {a.maquina.identificacion}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {puedeEditar ? (
                  <Select
                    aria-label="Maquinista"
                    options={opcionesMaquinista}
                    value={a.maquinista_leg ?? ''}
                    onChange={e => handleCambiarMaquinista(a.id, e.target.value)}
                    className="text-xs"
                  />
                ) : (
                  <span className="text-xs text-gris-dark">
                    👷 {a.maquinista_leg ? (nombrePersonal.get(a.maquinista_leg) ?? '—') : 'Sin maquinista'}
                  </span>
                )}
                {puedeEditar && (
                  <Button variant="ghost" size="sm" onClick={() => handleDesasignar(a.id, a.maquina.nombre)}>🗑</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
