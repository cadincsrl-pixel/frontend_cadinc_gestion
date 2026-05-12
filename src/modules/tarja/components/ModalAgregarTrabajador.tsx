'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useAgregarVariosASemana } from '@/modules/tarja/hooks/useAsignaciones'
import { useToast } from '@/components/ui/Toast'
import { getSemLabel } from '@/lib/utils/dates'
import type { Personal } from '@/types/domain.types'

interface Props {
  open: boolean
  onClose: () => void
  obraCod: string
  semActual: Date
  personalSemana: Personal[]
}

export function ModalAgregarTrabajador({ open, onClose, obraCod, semActual, personalSemana }: Props) {
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

  const { data: todoElPersonal = [] } = usePersonal()
  const { mutate: agregarVarios, isPending } = useAgregarVariosASemana()

  // Reset al cerrar o abrir, para no arrastrar selección de la vez anterior.
  useEffect(() => {
    if (!open) {
      setBusqueda('')
      setSeleccionados(new Set())
    }
  }, [open])

  // Solo mostrar los que NO están ya en esta semana.
  const disponibles = useMemo(
    () => todoElPersonal.filter(p => !personalSemana.some(po => po.leg === p.leg)),
    [todoElPersonal, personalSemana],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return disponibles
    return disponibles.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.leg.toLowerCase().includes(q)
    )
  }, [disponibles, busqueda])

  function toggle(leg: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(leg)) next.delete(leg)
      else next.add(leg)
      return next
    })
  }

  function seleccionarTodosFiltrados() {
    setSeleccionados(prev => {
      const next = new Set(prev)
      filtrados.forEach(p => next.add(p.leg))
      return next
    })
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set())
  }

  function handleConfirm() {
    if (seleccionados.size === 0) {
      toast('Seleccioná al menos un trabajador', 'warn')
      return
    }
    agregarVarios(
      { obraCod, legs: Array.from(seleccionados), semActual },
      {
        onSuccess: () => {
          const n = seleccionados.size
          toast(`✓ ${n} trabajador${n !== 1 ? 'es' : ''} agregado${n !== 1 ? 's' : ''} a la semana`, 'ok')
          onClose()
        },
        onError: (err) => {
          toast(err.message ?? 'Error al agregar', 'err')
        },
      }
    )
  }

  const cantSelec = seleccionados.size

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 AGREGAR A ESTA SEMANA"
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            disabled={cantSelec === 0}
            onClick={handleConfirm}
          >
            ✓ Agregar{cantSelec > 0 ? ` (${cantSelec})` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="bg-azul-light text-azul text-xs font-bold px-3 py-2 rounded-lg">
          Semana: {getSemLabel(semActual)}
        </div>

        {disponibles.length === 0 ? (
          <p className="text-sm text-gris-dark bg-gris rounded-lg p-3">
            Todos los trabajadores ya están en esta semana.
          </p>
        ) : (
          <>
            {/* Buscador + contador */}
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="🔍 Buscar por nombre o legajo..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="flex-1 min-w-[180px]"
              />
              <span className="text-[11px] text-gris-dark font-bold">
                {busqueda
                  ? `${filtrados.length} de ${disponibles.length}`
                  : `${disponibles.length} disponibles`}
              </span>
            </div>

            {/* Acciones rápidas */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <button
                type="button"
                onClick={seleccionarTodosFiltrados}
                disabled={filtrados.length === 0}
                className="font-bold text-azul hover:text-naranja disabled:text-gris-mid disabled:cursor-not-allowed underline-offset-2 hover:underline"
              >
                Seleccionar {busqueda ? 'filtrados' : 'todos'}
              </button>
              <span className="text-gris-mid">·</span>
              <button
                type="button"
                onClick={limpiarSeleccion}
                disabled={cantSelec === 0}
                className="font-bold text-gris-dark hover:text-rojo disabled:text-gris-mid disabled:cursor-not-allowed underline-offset-2 hover:underline"
              >
                Limpiar selección
              </button>
              {cantSelec > 0 && (
                <span className="ml-auto text-naranja-dark font-bold">
                  {cantSelec} seleccionado{cantSelec !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Lista */}
            <div className="bg-gris/40 rounded-lg max-h-72 overflow-y-auto divide-y divide-gris">
              {filtrados.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gris-dark text-center italic">
                  Sin resultados para "{busqueda}"
                </p>
              ) : (
                filtrados.map(p => {
                  const checked = seleccionados.has(p.leg)
                  return (
                    <label
                      key={p.leg}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/60 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.leg)}
                        className="w-4 h-4 accent-naranja"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-carbon truncate">{p.nom}</div>
                        <div className="text-[11px] text-gris-dark font-mono">Leg. {p.leg}</div>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </>
        )}

        <p className="text-xs text-gris-dark">
          ¿No está en la lista? Agregalo en Gestión de Personal.
        </p>
      </div>
    </Modal>
  )
}
