'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useMovimientos, useCreateMovimiento, useDeleteMovimiento, useMateriales,
  useCanterasAridos, useUnidades,
} from '../hooks/useAridos'
import type { MovimientoArido } from '../types'

interface AcopioForm {
  fecha:       string
  material_id: string
  cantidad:    string
  cantera_id:  string
  unidad_id:   string
  flete_obs:   string
  remito:      string
  obs:         string
}

interface AjusteForm {
  fecha:       string
  material_id: string
  cantidad:    string
  obs:         string
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmtCant(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function AcopiosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('aridos')

  // El listado junta acopios y ajustes (todo lo que toca el depósito)
  const { data: acopios = [], isLoading: loadA } = useMovimientos({ tipo: 'acopio' })
  const { data: ajustes = [], isLoading: loadJ } = useMovimientos({ tipo: 'ajuste' })
  const { data: materiales = [] } = useMateriales()
  const { data: canteras = [] }   = useCanterasAridos()
  const { data: unidades = [] }   = useUnidades()
  const { mutate: crear, isPending: creando } = useCreateMovimiento()
  const { mutate: borrar } = useDeleteMovimiento()

  const movimientos = [...acopios, ...ajustes].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || b.id - a.id
  )

  const [modalAcopio, setModalAcopio] = useState(false)
  const [modalAjuste, setModalAjuste] = useState(false)

  const formAcopio = useForm<AcopioForm>({
    defaultValues: { fecha: toISO(new Date()), material_id: '', cantidad: '', cantera_id: '', unidad_id: '', flete_obs: '', remito: '', obs: '' },
  })
  const formAjuste = useForm<AjusteForm>({
    defaultValues: { fecha: toISO(new Date()), material_id: '', cantidad: '', obs: '' },
  })

  function onSubmitAcopio(data: AcopioForm) {
    crear({
      tipo:        'acopio',
      fecha:       data.fecha,
      material_id: Number(data.material_id),
      cantidad:    Number(data.cantidad),
      cantera_id:  data.cantera_id ? Number(data.cantera_id) : null,
      unidad_id:   data.unidad_id ? Number(data.unidad_id) : null,
      flete_obs:   data.flete_obs.trim() || null,
      remito:      data.remito.trim() || null,
      obs:         data.obs.trim() || null,
    }, {
      onSuccess: () => {
        toast('✓ Acopio registrado', 'ok')
        setModalAcopio(false)
        formAcopio.reset({ fecha: toISO(new Date()), material_id: '', cantidad: '', cantera_id: '', unidad_id: '', flete_obs: '', remito: '', obs: '' })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'Error al registrar el acopio'), 'err'),
    })
  }

  function onSubmitAjuste(data: AjusteForm) {
    crear({
      tipo:        'ajuste',
      fecha:       data.fecha,
      material_id: Number(data.material_id),
      cantidad:    Number(data.cantidad),
      obs:         data.obs.trim() || null,
    }, {
      onSuccess: () => {
        toast('✓ Ajuste registrado', 'ok')
        setModalAjuste(false)
        formAjuste.reset({ fecha: toISO(new Date()), material_id: '', cantidad: '', obs: '' })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'Error al registrar el ajuste'), 'err'),
    })
  }

  function handleEliminar(m: MovimientoArido) {
    const label = m.tipo === 'acopio' ? 'el acopio' : 'el ajuste'
    if (!confirm(`¿Eliminar ${label} de ${m.aridos_materiales?.nombre ?? 'material'} del ${fmtDate(m.fecha)}? El stock se recalcula.`)) return
    borrar(m.id, {
      onSuccess: () => toast('✓ Eliminado', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'Error al eliminar'), 'err'),
    })
  }

  const materialOptions = [{ value: '', label: 'Seleccionar material…' }, ...materiales.filter(m => m.activo && m.unidad === 'm3').map(m => ({ value: m.id, label: m.nombre }))]
  const canteraOptions  = [{ value: '', label: 'Sin especificar' }, ...canteras.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre }))]
  const unidadOptions   = [{ value: '', label: 'Sin especificar' }, ...unidades.filter(u => u.activo).map(u => ({ value: u.id, label: `${u.nombre} · ${u.patente}` }))]

  const isLoading = loadA || loadJ

  return (
    <>
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="secondary" size="sm" disabled={!puedeCrear} onClick={() => setModalAjuste(true)}>
          ± Ajuste de inventario
        </Button>
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={() => setModalAcopio(true)}>
          ＋ Nuevo acopio
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando...</div>
      ) : movimientos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Sin acopios cargados. Registrá acá el material que traés de cantera al depósito.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {['Fecha', 'Tipo', 'Material', 'Cantidad', 'Cantera', 'Remito', 'Obs', ''].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-3 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-3 py-2.5 text-sm text-carbon whitespace-nowrap">{fmtDate(m.fecha)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${m.tipo === 'acopio' ? 'bg-verde-light text-verde' : 'bg-amarillo-light text-[#7A5500]'}`}>
                        {m.tipo === 'acopio' ? 'ACOPIO' : 'AJUSTE'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold text-carbon">{m.aridos_materiales?.nombre ?? '—'}</td>
                    <td className={`px-3 py-2.5 text-sm font-mono whitespace-nowrap ${Number(m.cantidad) < 0 ? 'text-rojo' : 'text-verde'}`}>
                      {Number(m.cantidad) >= 0 ? '+' : ''}{fmtCant(Number(m.cantidad))} m³
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark">{m.aridos_canteras?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark font-mono">{m.remito || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark max-w-[200px] truncate" title={m.obs ?? ''}>{m.obs || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => handleEliminar(m)}>🗑</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal acopio */}
      <Modal
        open={modalAcopio}
        onClose={() => setModalAcopio(false)}
        title="⛏ NUEVO ACOPIO (cantera → depósito)"
        width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAcopio(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando} onClick={formAcopio.handleSubmit(onSubmitAcopio)}>✓ Registrar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Fecha" type="date" {...formAcopio.register('fecha', { required: true })} />
            <Select label="Material" options={materialOptions} error={formAcopio.formState.errors.material_id?.message}
              {...formAcopio.register('material_id', { required: 'Elegí un material' })} />
            <Input label="Cantidad (m³)" type="number" step="0.01" placeholder="0" error={formAcopio.formState.errors.cantidad?.message}
              {...formAcopio.register('cantidad', { required: 'Requerida', validate: v => Number(v) > 0 || 'Debe ser mayor a 0' })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Cantera de origen" options={canteraOptions} {...formAcopio.register('cantera_id')} />
            <Select label="Unidad (camión + chofer)" options={unidadOptions} {...formAcopio.register('unidad_id')} />
            <Input label="Flete externo" placeholder="Si no es unidad propia" {...formAcopio.register('flete_obs')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Remito" placeholder="Opcional" {...formAcopio.register('remito')} />
            <Input label="Observaciones" placeholder="Notas..." {...formAcopio.register('obs')} />
          </div>
        </div>
      </Modal>

      {/* Modal ajuste */}
      <Modal
        open={modalAjuste}
        onClose={() => setModalAjuste(false)}
        title="± AJUSTE DE INVENTARIO"
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAjuste(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando} onClick={formAjuste.handleSubmit(onSubmitAjuste)}>✓ Registrar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formAjuste.register('fecha', { required: true })} />
            <Select label="Material" options={materialOptions} error={formAjuste.formState.errors.material_id?.message}
              {...formAjuste.register('material_id', { required: 'Elegí un material' })} />
          </div>
          <Input label="Cantidad (m³, negativa para restar)" type="number" step="0.01" placeholder="Ej: -12.5"
            error={formAjuste.formState.errors.cantidad?.message}
            {...formAjuste.register('cantidad', { required: 'Requerida', validate: v => Number(v) !== 0 || 'No puede ser 0' })} />
          <Input label="Motivo" placeholder="Ej: medición física del playón" {...formAjuste.register('obs')} />
          <p className="text-[11px] text-gris-dark">
            Usalo para corregir el stock contra lo que hay físicamente en el depósito (merma, compactación, error de carga).
          </p>
        </div>
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
