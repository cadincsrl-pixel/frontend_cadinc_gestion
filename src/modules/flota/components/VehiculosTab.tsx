'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useFlotaVehiculos, useCreateFlotaVehiculo } from '../hooks/useFlotaVehiculos'
import { useFlotaSyncTodos, mensajeAmigableErrorSync } from '../hooks/useFlotaGpsSync'
import { VehiculoDetalleModal } from './VehiculoDetalleModal'
import type { FlotaVehiculo, FlotaVehiculoTipo, FlotaVehiculoEstado } from '@/types/domain.types'

const TIPO_OPTIONS: { value: FlotaVehiculoTipo; label: string }[] = [
  { value: 'auto',       label: 'Auto' },
  { value: 'camioneta',  label: 'Camioneta' },
  { value: 'utilitario', label: 'Utilitario' },
  { value: 'pickup',     label: 'Pickup' },
  { value: 'moto',       label: 'Moto' },
  { value: 'otro',       label: 'Otro' },
]

const ESTADO_OPTIONS: { value: FlotaVehiculoEstado; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'taller', label: 'En taller' },
  { value: 'baja',   label: 'Baja' },
]

interface NuevoForm {
  patente:     string
  tipo:        FlotaVehiculoTipo
  marca:       string
  modelo:      string
  anio:        string
  km_actuales: string
  estado:      FlotaVehiculoEstado
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-AR') + ' km'
}

export function VehiculosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('flota')
  const { data: vehiculos = [], isLoading } = useFlotaVehiculos()
  const { mutate: create, isPending: creating } = useCreateFlotaVehiculo()
  const { mutate: syncTodos, isPending: syncingAll } = useFlotaSyncTodos()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const formNuevo = useForm<NuevoForm>({
    defaultValues: { tipo: 'camioneta', estado: 'activo', km_actuales: '0' },
  })

  const detalle = useMemo(
    () => vehiculos.find(v => v.id === detalleId) ?? null,
    [vehiculos, detalleId],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return vehiculos
    return vehiculos.filter(v =>
      v.patente.toLowerCase().includes(q) ||
      (v.marca  ?? '').toLowerCase().includes(q) ||
      (v.modelo ?? '').toLowerCase().includes(q),
    )
  }, [vehiculos, busqueda])

  function handleSyncTodos() {
    syncTodos(undefined, {
      onSuccess: (r) => {
        // Mostramos resumen compacto. `ok` = actualizados, `sin_cambio` = ya estaban
        // al día, `error` + `no_match` los agrupamos como "con problemas".
        const problemas = r.error + r.no_match
        toast(
          `✓ Sync completo — ${r.ok} actualizados, ${r.sin_cambio} sin cambios, ${problemas} con problemas`,
          problemas > 0 ? 'warn' : 'ok',
        )
      },
      onError: (err) => toast(mensajeAmigableErrorSync(err), 'err'),
    })
  }

  function handleCreate(data: NuevoForm) {
    create(
      {
        patente:     data.patente.trim(),
        tipo:        data.tipo,
        marca:       data.marca.trim() || null,
        modelo:      data.modelo.trim() || null,
        anio:        data.anio ? Number(data.anio) : null,
        km_actuales: Number(data.km_actuales) || 0,
        estado:      data.estado,
      },
      {
        onSuccess: (v) => {
          toast('✓ Vehículo agregado', 'ok')
          setModalNuevo(false)
          formNuevo.reset({ tipo: 'camioneta', estado: 'activo', km_actuales: '0' })
          // Abrir directo el detalle del nuevo para que el user suba papeles.
          if (v?.id) setDetalleId(v.id)
        },
        onError: (err: any) => {
          const msg = err?.message ?? 'Error al crear'
          toast(msg.includes('unique') || msg.includes('23505') ? 'Patente duplicada' : msg, 'err')
        },
      },
    )
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por patente, marca o modelo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-72"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>✕ Limpiar</Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {puedeEditar && (
            <Button
              variant="secondary"
              size="sm"
              loading={syncingAll}
              onClick={handleSyncTodos}
            >
              🔄 Sincronizar flota
            </Button>
          )}
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
              ＋ Nuevo vehículo
            </Button>
          )}
        </div>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                {['Patente', 'Tipo', 'Marca / modelo', 'Año', 'Km actuales', 'Estado'].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gris-dark text-sm italic">
                    {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay vehículos cargados.'}
                  </td>
                </tr>
              ) : filtrados.map(v => (
                <tr
                  key={v.id}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                  onClick={() => setDetalleId(v.id)}
                >
                  <td className="px-4 py-3 font-mono font-bold text-sm text-carbon">{v.patente}</td>
                  <td className="px-4 py-3 text-xs text-gris-dark capitalize">{v.tipo}</td>
                  <td className="px-4 py-3 text-sm text-carbon">
                    {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gris-dark">{v.anio ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gris-dark">{fmtKm(v.km_actuales)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        v.estado === 'activo' ? 'activo' :
                        v.estado === 'baja'   ? 'inactivo' :
                                                'pendiente'
                      }
                      label={v.estado === 'taller' ? 'En taller' : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2">
        {isLoading ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            Cargando...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay vehículos cargados.'}
          </div>
        ) : filtrados.map(v => (
          <button
            key={v.id}
            onClick={() => setDetalleId(v.id)}
            className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm text-carbon">{v.patente}</div>
                <div className="text-xs text-gris-dark mt-0.5 capitalize">
                  {v.tipo}{v.marca || v.modelo ? ` · ${[v.marca, v.modelo].filter(Boolean).join(' ')}` : ''}
                </div>
              </div>
              <Badge
                variant={
                  v.estado === 'activo' ? 'activo' :
                  v.estado === 'baja'   ? 'inactivo' :
                                          'pendiente'
                }
                label={v.estado === 'taller' ? 'En taller' : undefined}
              />
            </div>
            <div className="text-[11px] text-gris-dark mt-2 font-mono">
              {fmtKm(v.km_actuales)}{v.anio ? ` · ${v.anio}` : ''}
            </div>
          </button>
        ))}
      </div>

      {/* Modal nuevo */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🚙 NUEVO VEHÍCULO"
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>
              ✓ Crear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Patente" placeholder="AB123CD" {...formNuevo.register('patente', { required: true })} />
            <Select label="Tipo" options={TIPO_OPTIONS} {...formNuevo.register('tipo')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Marca"  placeholder="Toyota"   {...formNuevo.register('marca')} />
            <Input label="Modelo" placeholder="Hilux SR" {...formNuevo.register('modelo')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Año"         type="number" placeholder="2022" {...formNuevo.register('anio')} />
            <Input label="Km actuales" type="number" placeholder="0"    {...formNuevo.register('km_actuales')} />
            <Select label="Estado"     options={ESTADO_OPTIONS}         {...formNuevo.register('estado')} />
          </div>
          <p className="text-[11px] text-gris-dark italic">
            Después de crear, abrí el vehículo para cargar marca/color/VIN, papeles y vincular MobilQuest.
          </p>
        </div>
      </Modal>

      {/* Modal detalle */}
      <VehiculoDetalleModal
        vehiculo={detalle}
        onClose={() => setDetalleId(null)}
      />
    </>
  )
}
