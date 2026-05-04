'use client'

import { useState } from 'react'
import {
  useChoferes,
  useUpdateChofer,
} from '../hooks/useLogistica'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'

export function TarifasTab() {
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
    <div className="md:bg-white md:rounded-card md:shadow-card">
      <div className="bg-white rounded-card shadow-card md:rounded-none md:shadow-none px-5 py-4 md:border-b md:border-gris">
        <h2 className="font-bold text-azul text-base">Tarifas choferes</h2>
        <p className="text-xs text-gris-dark mt-0.5">Básico por día trabajado y adicional por kilómetro recorrido</p>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
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
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2 mt-2">
        {activos.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            No hay choferes activos.
          </div>
        ) : activos.map(c => {
          const enEdicion = editando === c.id
          return (
            <div
              key={c.id}
              onClick={() => { if (!enEdicion && puedeEditar) openEdit(c.id) }}
              className={`bg-white rounded-card shadow-card p-3 transition-colors w-full ${enEdicion ? '' : 'active:bg-gris/40 cursor-pointer'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-carbon truncate">{c.nombre}</div>
                  {!enEdicion && (
                    <div className="text-xs text-gris-dark mt-0.5 font-mono">
                      Básico {c.basico_dia ? `$${Number(c.basico_dia).toLocaleString('es-AR')}` : '—'}
                      {' · '}
                      $/km {c.precio_km ? `$${Number(c.precio_km).toLocaleString('es-AR')}` : '—'}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  c.estado === 'activo' ? 'bg-verde-light text-verde' : 'bg-naranja-light text-naranja-dark'
                }`}>
                  {c.estado === 'activo' ? 'Activo' : 'Descanso'}
                </span>
              </div>

              {enEdicion && (
                <div className="mt-3 pt-3 border-t border-gris flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                  <Input
                    label="Básico/día"
                    type="number"
                    inputMode="numeric"
                    value={basicoDia}
                    onChange={e => setBasicoDia(e.target.value)}
                    step="100"
                    placeholder="0"
                  />
                  <Input
                    label="$/km adicional"
                    type="number"
                    inputMode="numeric"
                    value={precioKm}
                    onChange={e => setPrecioKm(e.target.value)}
                    step="1"
                    placeholder="0"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                    <Button variant="primary" size="sm" loading={updating} onClick={handleSave}>✓ Guardar</Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
