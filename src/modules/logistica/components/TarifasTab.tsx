'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useCanteras,
  useChoferes,
  useUpdateChofer,
  useTarifasCantera,
  useUpsertTarifaCantera,
  useDeleteTarifaCantera,
} from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { TarifaCantera } from '@/types/domain.types'

// ─── Sección: Tarifas por cantera ────────────────────────────────────────────

function TarifasCantera() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')
  const { data: canteras      = [] } = useCanteras()
  const { data: tarifas       = [] } = useTarifasCantera()
  const { mutate: upsert, isPending: saving } = useUpsertTarifaCantera()
  const { mutate: remove } = useDeleteTarifaCantera()

  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState<TarifaCantera | null>(null)
  const form = useForm<{ cantera_id: string; valor_ton: string; obs: string }>()

  // Canteras sin tarifa asignada (para el selector de "nueva")
  const canterasConTarifa = new Set(tarifas.map(t => t.cantera_id))
  const canterasDisponibles = canteras.filter(c => !canterasConTarifa.has(c.id) || (editando && editando.cantera_id === c.id))

  function openNueva() {
    setEditando(null)
    form.reset({ cantera_id: '', valor_ton: '', obs: '' })
    setModal(true)
  }

  function openEdit(t: TarifaCantera) {
    setEditando(t)
    form.reset({
      cantera_id: String(t.cantera_id),
      valor_ton:  String(t.valor_ton),
      obs:        t.obs ?? '',
    })
    setModal(true)
  }

  function handleSubmit(data: any) {
    upsert(
      {
        cantera_id: Number(data.cantera_id),
        valor_ton:  Number(data.valor_ton),
        obs:        data.obs ?? '',
      },
      {
        onSuccess: () => { toast('✓ Tarifa guardada', 'ok'); setModal(false) },
        onError:   () => toast('Error al guardar', 'err'),
      }
    )
  }

  function handleDelete(t: TarifaCantera) {
    const nombre = t.canteras?.nombre ?? `ID ${t.cantera_id}`
    if (!confirm(`¿Eliminar tarifa de ${nombre}?`)) return
    remove(t.id, {
      onSuccess: () => toast('✓ Tarifa eliminada', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  const canteraOptions = [
    { value: '', label: 'Seleccionar cantera…' },
    ...canterasDisponibles.map(c => ({
      value: c.id,
      label: c.nombre + (c.localidad ? ` — ${c.localidad}` : ''),
    })),
  ]

  return (
    <>
      <div className="bg-white rounded-card shadow-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gris">
          <div>
            <h2 className="font-bold text-azul text-base">Tarifas empresa — $/ton por cantera</h2>
            <p className="text-xs text-gris-dark mt-0.5">Lo que cobra la empresa por cada tonelada cargada según la cantera de origen</p>
          </div>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={openNueva}>＋ Nueva tarifa</Button>
          )}
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Cantera', 'Localidad', '$/ton', 'Observaciones', ''].map(h => (
                <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tarifas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gris-dark text-sm">
                  No hay tarifas registradas. Agregá una con el botón de arriba.
                </td>
              </tr>
            ) : tarifas.map(t => (
              <tr key={t.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                <td className="px-4 py-3 font-bold text-sm text-carbon">{t.canteras?.nombre ?? `—`}</td>
                <td className="px-4 py-3 text-sm text-gris-dark">{t.canteras?.localidad ?? '—'}</td>
                <td className="px-4 py-3 font-mono font-bold text-verde text-sm">
                  ${Number(t.valor_ton).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-xs text-gris-dark">{t.obs || '—'}</td>
                <td className="px-4 py-3 flex gap-1 justify-end">
                  {puedeEditar && (
                    <button onClick={() => openEdit(t)} className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                  )}
                  {puedeEliminar && (
                    <button onClick={() => handleDelete(t)} className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editando ? '✏️ EDITAR TARIFA CANTERA' : '💲 NUEVA TARIFA CANTERA'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={saving} onClick={form.handleSubmit(handleSubmit)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Cantera"
            options={canteraOptions}
            disabled={!!editando}
            {...form.register('cantera_id')}
          />
          <Input
            label="$/ton"
            type="number"
            step="0.01"
            placeholder="0.00"
            {...form.register('valor_ton')}
          />
          <Input
            label="Observaciones"
            placeholder="Notas..."
            {...form.register('obs')}
          />
        </div>
      </Modal>
    </>
  )
}

// ─── Sección: Tarifas choferes ────────────────────────────────────────────────

function TarifasChoferes() {
  const toast = useToast()
  const { puedeEditar } = usePermisos('logistica')
  const { data: choferes = [] } = useChoferes()
  const { mutate: update, isPending: updating } = useUpdateChofer()

  const [editando, setEditando]   = useState<number | null>(null)
  const [basicoDia, setBasicoDia] = useState('')
  const [precioKm, setPrecioKm]   = useState('')

  const activos = choferes.filter(c => c.estado !== 'inactivo')

  function openEdit(id: number) {
    const c = choferes.find(x => x.id === id)!
    setBasicoDia(String(c.basico_dia ?? 0))
    setPrecioKm(String(c.precio_km ?? 0))
    setEditando(id)
  }

  function handleSave() {
    if (editando === null) return
    update(
      { id: editando, dto: { basico_dia: Number(basicoDia), precio_km: Number(precioKm) } },
      {
        onSuccess: () => { toast('✓ Tarifas actualizadas', 'ok'); setEditando(null) },
        onError:   () => toast('Error al actualizar', 'err'),
      }
    )
  }

  return (
    <div className="bg-white rounded-card shadow-card">
      <div className="px-5 py-4 border-b border-gris">
        <h2 className="font-bold text-azul text-base">Tarifas choferes</h2>
        <p className="text-xs text-gris-dark mt-0.5">Básico por día trabajado y adicional por kilómetro recorrido</p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['Chofer', 'Estado', 'Básico/día', '$/km adicional', ''].map(h => (
              <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activos.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-gris-dark text-sm">No hay choferes activos.</td>
            </tr>
          ) : activos.map(c => (
            <tr key={c.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
              <td className="px-4 py-3 font-bold text-sm text-carbon">{c.nombre}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  c.estado === 'activo' ? 'bg-verde-light text-verde' : 'bg-naranja-light text-naranja-dark'
                }`}>
                  {c.estado === 'activo' ? 'Activo' : 'Descanso'}
                </span>
              </td>

              {editando === c.id ? (
                <>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={basicoDia}
                      onChange={e => setBasicoDia(e.target.value)}
                      className="border border-gris rounded px-2 py-1 text-sm font-mono w-28 focus:outline-none focus:border-azul"
                      step="100"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={precioKm}
                      onChange={e => setPrecioKm(e.target.value)}
                      className="border border-gris rounded px-2 py-1 text-sm font-mono w-24 focus:outline-none focus:border-azul"
                      step="1"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2 flex gap-1 justify-end">
                    <Button variant="primary" size="sm" loading={updating} onClick={handleSave}>✓</Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>✕</Button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 font-mono text-sm text-carbon">
                    {c.basico_dia ? `$${Number(c.basico_dia).toLocaleString('es-AR')}` : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-carbon">
                    {c.precio_km ? `$${Number(c.precio_km).toLocaleString('es-AR')}` : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-4 py-3 flex gap-1 justify-end">
                    {puedeEditar && (
                      <button onClick={() => openEdit(c.id)} className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function TarifasTab() {
  return (
    <div className="flex flex-col gap-6">
      <TarifasCantera />
      <TarifasChoferes />
    </div>
  )
}
