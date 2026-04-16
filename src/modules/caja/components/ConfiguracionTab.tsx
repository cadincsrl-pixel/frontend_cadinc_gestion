'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useConceptos, useCentrosCosto,
  useCreateConcepto, useToggleConcepto,
  useCreateCentro, useToggleCentro,
} from '../hooks/useCaja'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'

export function ConfiguracionTab() {
  const toast = useToast()
  const { data: conceptos = [] } = useConceptos()
  const { data: centros   = [] } = useCentrosCosto()

  const createConcepto = useCreateConcepto()
  const toggleConcepto = useToggleConcepto()
  const createCentro   = useCreateCentro()
  const toggleCentro   = useToggleCentro()

  const [showFormConcepto, setShowFormConcepto] = useState(false)
  const [showFormCentro,   setShowFormCentro]   = useState(false)

  const formConcepto = useForm<any>()
  const formCentro   = useForm<any>()

  async function handleCreateConcepto(data: any) {
    try {
      await createConcepto.mutateAsync({ nombre: data.nombre, tipo: data.tipo || 'ambos' })
      toast('✓ Concepto agregado', 'ok')
      formConcepto.reset()
      setShowFormConcepto(false)
    } catch { toast('Error al agregar', 'err') }
  }

  async function handleCreateCentro(data: any) {
    try {
      await createCentro.mutateAsync({ nombre: data.nombre })
      toast('✓ Centro de costo agregado', 'ok')
      formCentro.reset()
      setShowFormCentro(false)
    } catch { toast('Error al agregar', 'err') }
  }

  async function handleToggleConcepto(id: number, activo: boolean) {
    try {
      await toggleConcepto.mutateAsync({ id, activo: !activo })
    } catch { toast('Error', 'err') }
  }

  async function handleToggleCentro(id: number, activo: boolean) {
    try {
      await toggleCentro.mutateAsync({ id, activo: !activo })
    } catch { toast('Error', 'err') }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Conceptos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg tracking-wider text-azul">📝 Conceptos</h3>
          <Button variant="secondary" size="sm" onClick={() => setShowFormConcepto(p => !p)}>
            {showFormConcepto ? 'Cancelar' : '＋ Concepto'}
          </Button>
        </div>

        {showFormConcepto && (
          <div className="bg-white rounded-card shadow-card p-4 mb-3 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <Input label="Nombre" placeholder="Ej: Combustible" {...formConcepto.register('nombre', { required: true })} />
            </div>
            <div className="w-44">
              <Select
                label="Tipo"
                options={[
                  { value: 'ambos',   label: 'Ingreso / Egreso' },
                  { value: 'ingreso', label: 'Solo ingreso'      },
                  { value: 'egreso',  label: 'Solo egreso'       },
                ]}
                {...formConcepto.register('tipo')}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={createConcepto.isPending}
              onClick={formConcepto.handleSubmit(handleCreateConcepto)}
            >
              ✓ Guardar
            </Button>
          </div>
        )}

        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {conceptos.length === 0 ? (
            <p className="text-center py-6 text-gris-dark text-sm">No hay conceptos. Agregá uno.</p>
          ) : (
            conceptos.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gris last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`font-semibold text-sm ${c.activo ? 'text-carbon' : 'text-gris-dark line-through'}`}>{c.nombre}</span>
                  <span className="text-xs text-gris-dark bg-gris px-2 py-0.5 rounded-full">
                    {c.tipo === 'ambos' ? 'ing/egr' : c.tipo}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleConcepto(c.id, c.activo)}
                  className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                    c.activo
                      ? 'bg-verde/10 text-verde hover:bg-verde/20'
                      : 'bg-gris text-gris-dark hover:bg-gris-dark/20'
                  }`}
                >
                  {c.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Centros de costo */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg tracking-wider text-azul">🏷️ Centros de Costo</h3>
          <Button variant="secondary" size="sm" onClick={() => setShowFormCentro(p => !p)}>
            {showFormCentro ? 'Cancelar' : '＋ Centro'}
          </Button>
        </div>

        {showFormCentro && (
          <div className="bg-white rounded-card shadow-card p-4 mb-3 flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Nombre" placeholder="Ej: Obra Norte" {...formCentro.register('nombre', { required: true })} />
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={createCentro.isPending}
              onClick={formCentro.handleSubmit(handleCreateCentro)}
            >
              ✓ Guardar
            </Button>
          </div>
        )}

        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {centros.length === 0 ? (
            <p className="text-center py-6 text-gris-dark text-sm">No hay centros de costo. Agregá uno.</p>
          ) : (
            centros.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gris last:border-0">
                <span className={`font-semibold text-sm ${c.activo ? 'text-carbon' : 'text-gris-dark line-through'}`}>{c.nombre}</span>
                <button
                  onClick={() => handleToggleCentro(c.id, c.activo)}
                  className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                    c.activo
                      ? 'bg-verde/10 text-verde hover:bg-verde/20'
                      : 'bg-gris text-gris-dark hover:bg-gris-dark/20'
                  }`}
                >
                  {c.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
