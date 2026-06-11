'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import { useCanteras, useChoferes, useCamiones } from '@/modules/logistica/hooks/useLogistica'
import {
  useMovimientos, useCreateMovimiento, useUpdateMovimiento, useDeleteMovimiento,
  useClientesAridos, useMateriales, usePreciosCliente, useStockAridos,
} from '../hooks/useAridos'
import type { MovimientoArido } from '../types'

interface VentaForm {
  fecha:       string
  cliente_id:  string
  material_id: string
  cantidad:    string
  origen:      'cantera' | 'deposito'
  cantera_id:  string
  precio_unit: string
  chofer_id:   string
  camion_id:   string
  flete_obs:   string
  remito:      string
  obs:         string
}

const DEFAULTS: VentaForm = {
  fecha: '', cliente_id: '', material_id: '', cantidad: '', origen: 'cantera',
  cantera_id: '', precio_unit: '', chofer_id: '', camion_id: '', flete_obs: '', remito: '', obs: '',
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtCant(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function VentasTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')

  const [fCliente, setFCliente]   = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fDesde, setFDesde]       = useState('')
  const [fHasta, setFHasta]       = useState('')

  const { data: ventas = [], isLoading } = useMovimientos({
    tipo: 'venta',
    cliente_id:  fCliente ? Number(fCliente) : undefined,
    material_id: fMaterial ? Number(fMaterial) : undefined,
    fecha_desde: fDesde || undefined,
    fecha_hasta: fHasta || undefined,
  })
  const { data: clientes = [] }   = useClientesAridos()
  const { data: materiales = [] } = useMateriales()
  const { data: precios = [] }    = usePreciosCliente()
  const { data: stock = [] }      = useStockAridos()
  const { data: canteras = [] }   = useCanteras()
  const { data: choferes = [] }   = useChoferes()
  const { data: camiones = [] }   = useCamiones()
  const { mutate: crear, isPending: creando }       = useCreateMovimiento()
  const { mutate: actualizar, isPending: editando } = useUpdateMovimiento()
  const { mutate: borrar } = useDeleteMovimiento()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<VentaForm>({
    defaultValues: { ...DEFAULTS, fecha: toISO(new Date()) },
  })

  const wCliente  = watch('cliente_id')
  const wMaterial = watch('material_id')
  const wFecha    = watch('fecha')
  const wCantidad = watch('cantidad')
  const wPrecio   = watch('precio_unit')
  const wOrigen   = watch('origen')

  const materialSel = materiales.find(m => m.id === Number(wMaterial))
  const unidadLabel = materialSel?.unidad === 'viaje' ? 'viaje(s)' : 'm³'

  // Precio de lista del cliente para el material, vigente a la fecha.
  // Se autocompleta al elegir cliente+material; queda editable (escombro
  // u operaciones puntuales se cotizan a mano).
  const precioLista = useMemo(() => {
    if (!wCliente || !wMaterial || !wFecha) return null
    const candidatos = precios
      .filter(p => p.cliente_id === Number(wCliente) && p.material_id === Number(wMaterial) && p.vigente_desde <= wFecha)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))
    return candidatos[0] ?? null
  }, [precios, wCliente, wMaterial, wFecha])

  function autofillPrecio(clienteId: string, materialId: string, fecha: string) {
    if (!clienteId || !materialId || !fecha) return
    const cand = precios
      .filter(p => p.cliente_id === Number(clienteId) && p.material_id === Number(materialId) && p.vigente_desde <= fecha)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
    setValue('precio_unit', cand ? String(cand.precio) : '')
  }

  const importe = (Number(wCantidad) || 0) * (Number(wPrecio) || 0)

  // Aviso (no bloqueo) si la venta desde depósito supera el stock calculado
  const stockMaterial = stock.find(s => s.material_id === Number(wMaterial))?.stock ?? null
  const excedeStock = wOrigen === 'deposito' && stockMaterial != null && Number(wCantidad) > stockMaterial

  const totalListado = ventas.reduce((s, v) => s + Number(v.importe ?? 0), 0)

  function abrirNueva() {
    setEditId(null)
    reset({ ...DEFAULTS, fecha: toISO(new Date()) })
    setModalOpen(true)
  }

  function abrirEditar(v: MovimientoArido) {
    setEditId(v.id)
    reset({
      fecha:       v.fecha,
      cliente_id:  String(v.cliente_id ?? ''),
      material_id: String(v.material_id),
      cantidad:    String(v.cantidad),
      origen:      v.origen ?? 'cantera',
      cantera_id:  v.cantera_id ? String(v.cantera_id) : '',
      precio_unit: v.precio_unit != null ? String(v.precio_unit) : '',
      chofer_id:   v.chofer_id ? String(v.chofer_id) : '',
      camion_id:   v.camion_id ? String(v.camion_id) : '',
      flete_obs:   v.flete_obs ?? '',
      remito:      v.remito ?? '',
      obs:         v.obs ?? '',
    })
    setModalOpen(true)
  }

  function onSubmit(data: VentaForm) {
    const dto = {
      tipo:        'venta',
      fecha:       data.fecha,
      cliente_id:  Number(data.cliente_id),
      material_id: Number(data.material_id),
      cantidad:    Number(data.cantidad),
      origen:      data.origen,
      cantera_id:  data.origen === 'cantera' && data.cantera_id ? Number(data.cantera_id) : null,
      precio_unit: data.precio_unit ? Number(data.precio_unit) : null,
      importe:     (Number(data.cantidad) || 0) * (Number(data.precio_unit) || 0),
      chofer_id:   data.chofer_id ? Number(data.chofer_id) : null,
      camion_id:   data.camion_id ? Number(data.camion_id) : null,
      flete_obs:   data.flete_obs.trim() || null,
      remito:      data.remito.trim() || null,
      obs:         data.obs.trim() || null,
    }
    if (editId == null) {
      crear(dto, {
        onSuccess: () => { toast('✓ Venta registrada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al registrar la venta'), 'err'),
      })
    } else {
      const { tipo: _tipo, ...rest } = dto
      actualizar({ id: editId, dto: rest }, {
        onSuccess: () => { toast('✓ Venta actualizada', 'ok'); setModalOpen(false) },
        onError:   (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  function handleEliminar(v: MovimientoArido) {
    if (!confirm(`¿Eliminar la venta de ${v.aridos_materiales?.nombre ?? 'material'} a ${v.aridos_clientes?.nombre ?? 'cliente'} del ${fmtDate(v.fecha)}?`)) return
    borrar(v.id, {
      onSuccess: () => toast('✓ Venta eliminada', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'Error al eliminar'), 'err'),
    })
  }

  const clienteOptions  = [{ value: '', label: 'Seleccionar cliente…' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]
  const materialOptions = [{ value: '', label: 'Seleccionar material…' }, ...materiales.filter(m => m.activo).map(m => ({ value: m.id, label: `${m.nombre} ($/${m.unidad === 'm3' ? 'm³' : 'viaje'})` }))]
  const canteraOptions  = [{ value: '', label: 'Sin especificar' }, ...canteras.map(c => ({ value: c.id, label: c.nombre }))]
  const choferOptions   = [{ value: '', label: 'Sin especificar' }, ...choferes.map(c => ({ value: c.id, label: c.nombre }))]
  const camionOptions   = [{ value: '', label: 'Sin especificar' }, ...camiones.map(c => ({ value: c.id, label: c.patente }))]

  return (
    <>
      {/* Filtros + alta */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-end gap-2 flex-wrap">
          <Select label="Cliente" options={[{ value: '', label: 'Todos' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]} value={fCliente} onChange={e => setFCliente(e.target.value)} />
          <Select label="Material" options={[{ value: '', label: 'Todos' }, ...materiales.map(m => ({ value: m.id, label: m.nombre }))]} value={fMaterial} onChange={e => setFMaterial(e.target.value)} />
          <Input label="Desde" type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} />
          {(fCliente || fMaterial || fDesde || fHasta) && (
            <Button variant="ghost" size="sm" onClick={() => { setFCliente(''); setFMaterial(''); setFDesde(''); setFHasta('') }}>✕ Limpiar</Button>
          )}
        </div>
        <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={abrirNueva}>
          ＋ Nueva venta
        </Button>
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando ventas...</div>
      ) : ventas.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Sin ventas registradas{(fCliente || fMaterial || fDesde || fHasta) ? ' para los filtros elegidos' : ''}.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr>
                  {['Fecha', 'Cliente', 'Material', 'Cantidad', 'Origen', 'Precio', 'Importe', 'Remito', ''].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-3 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-3 py-2.5 text-sm text-carbon whitespace-nowrap">{fmtDate(v.fecha)}</td>
                    <td className="px-3 py-2.5 text-sm font-bold text-carbon">{v.aridos_clientes?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-carbon">{v.aridos_materiales?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sm font-mono text-carbon whitespace-nowrap">
                      {fmtCant(Number(v.cantidad))} {v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark">
                      {v.origen === 'deposito'
                        ? <span className="font-bold text-azul-mid">Depósito</span>
                        : <span>{v.canteras?.nombre ?? 'Cantera'}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-gris-dark whitespace-nowrap">{v.precio_unit != null ? fmtM(Number(v.precio_unit)) : '—'}</td>
                    <td className="px-3 py-2.5 text-sm font-mono font-bold text-verde whitespace-nowrap">{v.importe != null ? fmtM(Number(v.importe)) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark font-mono">{v.remito || '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(v)}>✎</Button>
                      <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => handleEliminar(v)}>🗑</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gris/40">
                  <td colSpan={6} className="px-3 py-2.5 text-xs font-bold text-gris-dark text-right uppercase">Total listado ({ventas.length} venta{ventas.length !== 1 ? 's' : ''})</td>
                  <td className="px-3 py-2.5 text-sm font-mono font-bold text-verde whitespace-nowrap">{fmtM(totalListado)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal nueva/editar venta */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId == null ? '🛒 NUEVA VENTA' : '🛒 EDITAR VENTA'}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || editando} onClick={handleSubmit(onSubmit)}>
              ✓ {editId == null ? 'Registrar' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Fecha" type="date" error={errors.fecha?.message}
              {...register('fecha', {
                required: 'Requerida',
                onChange: e => autofillPrecio(wCliente, wMaterial, e.target.value),
              })} />
            <div className="sm:col-span-2">
              <Select label="Cliente" options={clienteOptions} error={errors.cliente_id?.message}
                {...register('cliente_id', {
                  required: 'Elegí un cliente',
                  onChange: e => autofillPrecio(e.target.value, wMaterial, wFecha),
                })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Select label="Material" options={materialOptions} error={errors.material_id?.message}
                {...register('material_id', {
                  required: 'Elegí un material',
                  onChange: e => autofillPrecio(wCliente, e.target.value, wFecha),
                })} />
            </div>
            <Input label={`Cantidad (${unidadLabel})`} type="number" step="0.01" placeholder="0" error={errors.cantidad?.message}
              {...register('cantidad', { required: 'Requerida', validate: v => Number(v) > 0 || 'Debe ser mayor a 0' })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Origen" options={[
              { value: 'cantera', label: 'Cantera (directo)' },
              { value: 'deposito', label: 'Depósito propio' },
            ]} {...register('origen')} />
            {wOrigen === 'cantera' ? (
              <Select label="Cantera" options={canteraOptions} {...register('cantera_id')} />
            ) : (
              <div className="flex items-end pb-2">
                <span className="text-xs text-gris-dark">
                  Stock actual: <b className="font-mono">{stockMaterial != null ? fmtCant(stockMaterial) : '—'} m³</b>
                </span>
              </div>
            )}
            <Input label="Precio unitario ($)" type="number" step="0.01" placeholder="0.00" error={errors.precio_unit?.message}
              {...register('precio_unit', { required: 'Requerido', validate: v => Number(v) >= 0 || 'Inválido' })} />
          </div>

          {/* Hints de precio e importe */}
          <div className="bg-gris/30 rounded-card px-3 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
            <span className="text-gris-dark">
              {precioLista
                ? <>Precio de lista del cliente: <b className="font-mono">{fmtM(Number(precioLista.precio))}</b> (desde {fmtDate(precioLista.vigente_desde)})</>
                : (wCliente && wMaterial)
                  ? <span className="text-[#7A5500] font-semibold">⚠ Este cliente no tiene precio de lista para este material — cargalo a mano.</span>
                  : 'Elegí cliente y material para autocompletar el precio de lista.'}
            </span>
            <span className="font-bold text-carbon">
              Importe: <span className="font-mono text-verde">{fmtM(importe)}</span>
            </span>
          </div>

          {excedeStock && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
              ⚠ La cantidad supera el stock calculado del depósito ({fmtCant(stockMaterial!)} m³). Se puede registrar igual — el papel manda — pero revisá si falta cargar un acopio.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Chofer" options={choferOptions} {...register('chofer_id')} />
            <Select label="Camión" options={camionOptions} {...register('camion_id')} />
            <Input label="Flete externo" placeholder="Si no es flota propia" {...register('flete_obs')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Remito" placeholder="N° de remito (opcional)" {...register('remito')} />
            <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
          </div>
        </div>
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
