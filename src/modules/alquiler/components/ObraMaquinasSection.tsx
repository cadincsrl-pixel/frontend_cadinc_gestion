'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import {
  useObraMaquinas,
  useMaquinas,
  useAsignarMaquina,
  useUpdateObraMaquina,
  useDesasignarMaquina,
} from '../hooks/useAlquiler'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { MAQUINA_TIPO_LABEL } from '../types'

interface Props {
  obraId: number
  puedeEditar: boolean
}

// Plata: '$' + miles es-AR, sin decimales (mismo formato que FacturacionTab).
function fmtPrecio(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

// Parsea el value de un <input type="number"> a number|null. Vacío, NaN o
// negativo → null (sin precio).
function parsePrecio(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
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
  const { mutate: actualizarAsignacion } = useUpdateObraMaquina()
  const { mutate: desasignar } = useDesasignarMaquina()

  const [maquinaSel, setMaquinaSel] = useState('')
  const [maquinistaSel, setMaquinistaSel] = useState('')
  const [precioSel, setPrecioSel] = useState('')

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
          precio_hora: parsePrecio(precioSel),
        },
      },
      {
        onSuccess: () => {
          toast('✓ Máquina asignada', 'ok')
          setMaquinaSel('')
          setMaquinistaSel('')
          setPrecioSel('')
        },
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al asignar', 'err'),
      },
    )
  }

  function handleCambiarMaquinista(id: number, value: string) {
    actualizarAsignacion(
      { id, obraId, dto: { maquinista_leg: value || null } },
      {
        onSuccess: () => toast('✓ Maquinista actualizado', 'ok'),
        onError: (err: unknown) => toast((err as { message?: string })?.message || 'Error al actualizar', 'err'),
      },
    )
  }

  function handleCambiarPrecio(id: number, precio: number | null) {
    actualizarAsignacion(
      { id, obraId, dto: { precio_hora: precio } },
      {
        onSuccess: () => toast('✓ Precio actualizado', 'ok'),
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
            <Input
              label="$/hora (opcional)"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="Ej: 25000"
              value={precioSel}
              onChange={e => setPrecioSel(e.target.value)}
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
              <div className="flex items-center gap-2 flex-wrap">
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
                {puedeEditar ? (
                  <PrecioHoraCell
                    // Remontar cuando cambia el valor del servidor (tras
                    // invalidar la query) para re-inicializar el draft sin
                    // sincronizar estado en un effect.
                    key={`precio-${a.id}-${a.precio_hora ?? 'null'}`}
                    initial={a.precio_hora}
                    onCommit={precio => handleCambiarPrecio(a.id, precio)}
                  />
                ) : (
                  <span className="text-xs text-gris-dark whitespace-nowrap">
                    {a.precio_hora != null ? `${fmtPrecio(a.precio_hora)}/h` : 'Sin precio'}
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

// Input numérico chico para editar el $/hora de una asignación. Mantiene un
// draft local mientras se tipea y recién dispara `onCommit` en blur/Enter, y
// solo si el valor cambió (evita PATCHs redundantes). El padre lo remonta vía
// `key` cuando cambia el valor del servidor, así `initial` re-siembra el draft
// sin sincronizar estado en un effect.
function PrecioHoraCell({ initial, onCommit }: {
  initial:  number | null
  onCommit: (precio: number | null) => void
}) {
  const [draft, setDraft] = useState(initial != null ? String(initial) : '')

  function commit() {
    const parsed = parsePrecio(draft)
    if (parsed === initial) return
    onCommit(parsed)
  }

  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gris-dark pointer-events-none">$</span>
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        aria-label="Precio por hora"
        placeholder="$/h"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-24 pl-5 pr-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-xs text-carbon bg-white outline-none transition-colors focus:border-naranja"
      />
    </div>
  )
}
