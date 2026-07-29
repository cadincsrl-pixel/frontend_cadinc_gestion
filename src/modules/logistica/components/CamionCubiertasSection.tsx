'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { intInputProps } from '@/lib/utils/inputs'
import {
  useCamionCubiertas,
  useCreateCamionCubiertas,
  useUpdateCamionCubiertas,
  useDeleteCamionCubiertas,
} from '../hooks/useCamionCubiertas'
import type { CamionCubiertas } from '@/types/domain.types'
import { toISO } from '@/lib/utils/dates'

interface Props {
  camionId: number
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Math.round(Number(n)).toLocaleString('es-AR')} km`
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso ?? '—'
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

interface FormValues {
  fecha:     string
  km_camion: number
  cantidad:  number
  obs:       string
}

/**
 * Cubiertas puestas al camión: registro histórico en el legajo.
 * Sin alerta y sin costo a propósito (definido con el dueño el 29/07): el gasto
 * se carga aparte en Gastos. Los km sirven para ver cada cuánto se cambian —
 * el dato que hoy nadie tiene.
 */
export function CamionCubiertasSection({ camionId }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')

  const { data: registros = [], isLoading } = useCamionCubiertas(camionId)
  const { mutate: crear,      isPending: creando }    = useCreateCamionCubiertas(camionId)
  const { mutate: actualizar, isPending: guardando }  = useUpdateCamionCubiertas(camionId)
  const { mutate: eliminar }                          = useDeleteCamionCubiertas(camionId)

  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<CamionCubiertas | null>(null)
  const form = useForm<FormValues>({
    defaultValues: { fecha: toISO(new Date()), km_camion: 0, cantidad: 0, obs: '' },
  })

  // Los registros vienen de más nuevo a más viejo: el "anterior" de cada uno es
  // el siguiente del array. La diferencia de km es la vida útil real del juego.
  const kmDesdeElAnterior = (idx: number): number | null => {
    const actual = registros[idx]
    const previo = registros[idx + 1]
    if (!actual || !previo) return null
    const d = Number(actual.km_camion) - Number(previo.km_camion)
    return d > 0 ? d : null
  }

  const totalCubiertas = registros.reduce((s, r) => s + Number(r.cantidad), 0)

  function abrirNuevo() {
    setEditando(null)
    form.reset({ fecha: toISO(new Date()), km_camion: 0, cantidad: 0, obs: '' })
    setModal(true)
  }

  function abrirEditar(r: CamionCubiertas) {
    setEditando(r)
    form.reset({
      fecha:     r.fecha,
      km_camion: Number(r.km_camion),
      cantidad:  Number(r.cantidad),
      obs:       r.obs ?? '',
    })
    setModal(true)
  }

  function cerrar() {
    setModal(false)
    setEditando(null)
  }

  function onSubmit(data: FormValues) {
    const cantidad = Number(data.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast('Poné cuántas cubiertas se pusieron', 'err'); return
    }
    const dto = {
      fecha:     data.fecha,
      km_camion: Number(data.km_camion) || 0,
      cantidad,
      obs:       data.obs?.trim() || null,
    }
    if (editando) {
      actualizar({ id: editando.id, dto }, {
        onSuccess: () => { toast('✓ Registro actualizado', 'ok'); cerrar() },
        onError:   () => toast('Error al actualizar', 'err'),
      })
    } else {
      crear({ camion_id: camionId, ...dto }, {
        onSuccess: () => { toast('✓ Cubiertas registradas', 'ok'); cerrar() },
        onError:   () => toast('Error al registrar', 'err'),
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-bold text-carbon flex items-center gap-2">
            🛞 Cubiertas
          </h4>
          {registros.length > 0 && (
            <p className="text-[11px] text-gris-dark mt-0.5">
              {totalCubiertas} cubierta{totalCubiertas !== 1 ? 's' : ''} en {registros.length} cambio{registros.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {puedeCrear && (
          <Button variant="secondary" size="sm" onClick={abrirNuevo}>＋ Registrar cubiertas</Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gris-dark italic">Cargando…</p>
      ) : registros.length === 0 ? (
        <p className="text-xs text-gris-dark italic">
          Sin cubiertas registradas. El gasto se carga aparte en Gastos.
        </p>
      ) : (
        <div className="bg-gris/30 rounded-card divide-y divide-gris-mid overflow-hidden">
          {registros.map((r, idx) => {
            const desde = kmDesdeElAnterior(idx)
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-carbon">
                    {r.cantidad} cubierta{Number(r.cantidad) !== 1 ? 's' : ''}
                    <span className="font-normal text-gris-dark"> · {fmtFecha(r.fecha)}</span>
                  </div>
                  <div className="text-[11px] text-gris-dark font-mono">
                    {fmtKm(r.km_camion)}
                    {/* Km recorridos desde el cambio anterior: la vida útil real. */}
                    {desde != null && (
                      <span className="ml-1 font-sans not-italic text-verde font-bold">
                        · duraron {fmtKm(desde)}
                      </span>
                    )}
                  </div>
                  {r.obs && <div className="text-[11px] text-gris-dark italic truncate" title={r.obs}>{r.obs}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {puedeEditar && (
                    <button
                      onClick={() => abrirEditar(r)}
                      title="Editar"
                      className="text-xs px-2 py-1 rounded hover:bg-white transition-colors"
                    >✏️</button>
                  )}
                  {puedeEliminar && (
                    <button
                      onClick={() => {
                        if (!confirm(`¿Eliminar el registro de ${r.cantidad} cubiertas del ${fmtFecha(r.fecha)}?`)) return
                        eliminar(r.id, {
                          onSuccess: () => toast('✓ Registro eliminado', 'ok'),
                          onError:   () => toast('Error al eliminar', 'err'),
                        })
                      }}
                      title="Eliminar"
                      className="text-xs px-2 py-1 rounded text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                    >✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modal}
        onClose={cerrar}
        width="max-w-md"
        title={editando ? '✏️ EDITAR CUBIERTAS' : '🛞 REGISTRAR CUBIERTAS'}
        footer={
          <>
            <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
            <Button variant="primary" loading={creando || guardando} onClick={form.handleSubmit(onSubmit)}>
              ✓ Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...form.register('fecha')} />
            <Input
              label="Cuántas cubiertas"
              {...intInputProps}
              placeholder="Ej: 8"
              {...form.register('cantidad', { valueAsNumber: true })}
            />
          </div>
          <Input
            label="Km del camión"
            {...intInputProps}
            placeholder="Ej: 181400"
            hint="Los km que marcaba el camión cuando se pusieron. Con eso se ve cuánto duró el juego anterior."
            {...form.register('km_camion', { valueAsNumber: true })}
          />
          <Input label="Observaciones" placeholder="Marca, posición, proveedor…" {...form.register('obs')} />
          <p className="text-[11px] text-gris-dark">
            El costo no va acá: se carga aparte como gasto del camión, en la pestaña Gastos.
          </p>
        </div>
      </Modal>
    </div>
  )
}
