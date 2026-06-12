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
import {
  useMovimientos, useCreateMovimiento, useUpdateMovimiento, useDeleteMovimiento,
  useClientesAridos, useMateriales, usePreciosCliente, useStockAridos, useMunicipios,
  useCanterasAridos, useUnidades, useUnidadEta,
} from '../hooks/useAridos'
import type { MovimientoArido, PrecioCliente, MunicipioArido, UnidadEta } from '../types'

interface VentaForm {
  fecha:       string
  hora:        string
  cliente_id:  string
  material_id: string
  cantidad:    string
  origen:      'cantera' | 'deposito' | 'obra'
  cantera_id:  string
  modo_precio: 'lista' | 'especial'
  precio_unit: string
  entrega_direccion: string
  municipio_id: string
  unidad_id:   string
  costo_total: string
  flete_obs:   string
  remito:      string
  obs:         string
}

const DEFAULTS: VentaForm = {
  fecha: '', hora: '', cliente_id: '', material_id: '', cantidad: '', origen: 'cantera',
  cantera_id: '', modo_precio: 'lista', precio_unit: '', entrega_direccion: '', municipio_id: '',
  unidad_id: '', costo_total: '', flete_obs: '', remito: '', obs: '',
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

// Precio de lista del cliente (vigente a la fecha) con el recargo del
// municipio aplicado. Devuelve null si no hay precio de lista cargado.
function precioConRecargo(
  precios: PrecioCliente[],
  municipios: MunicipioArido[],
  clienteId: string,
  materialId: string,
  fecha: string,
  municipioId: string,
): { base: PrecioCliente; final: number; recargoPct: number } | null {
  if (!clienteId || !materialId || !fecha) return null
  const base = precios
    .filter(p => p.cliente_id === Number(clienteId) && p.material_id === Number(materialId) && p.vigente_desde <= fecha)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  if (!base) return null
  const recargoPct = municipioId
    ? Number(municipios.find(m => m.id === Number(municipioId))?.recargo_pct ?? 0)
    : 0
  const final = Math.round(Number(base.precio) * (1 + recargoPct / 100) * 100) / 100
  return { base, final, recargoPct }
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
  const { data: municipios = [] } = useMunicipios()
  const { data: stock = [] }      = useStockAridos()
  const { data: canteras = [] }   = useCanterasAridos()
  const { data: unidades = [] }   = useUnidades()
  const { mutate: crear, isPending: creando }       = useCreateMovimiento()
  const { mutate: actualizar, isPending: editando } = useUpdateMovimiento()
  const { mutate: borrar } = useDeleteMovimiento()
  const { mutate: consultarEta, isPending: consultandoEta } = useUnidadEta()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [etaResult, setEtaResult] = useState<UnidadEta | null>(null)
  const [etaDe, setEtaDe] = useState<number | null>(null)  // id del movimiento consultando

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<VentaForm>({
    defaultValues: { ...DEFAULTS, fecha: toISO(new Date()) },
  })

  const wCliente   = watch('cliente_id')
  const wMaterial  = watch('material_id')
  const wFecha     = watch('fecha')
  const wCantidad  = watch('cantidad')
  const wPrecio    = watch('precio_unit')
  const wOrigen    = watch('origen')
  const wModo      = watch('modo_precio')
  const wMunicipio = watch('municipio_id')

  const materialSel = materiales.find(m => m.id === Number(wMaterial))
  const esViaje     = materialSel?.unidad === 'viaje'
  const unidadLabel = esViaje ? 'viaje(s)' : 'm³'

  const lista = precioConRecargo(precios, municipios, wCliente, wMaterial, wFecha, wMunicipio)

  // Recalcula el precio cuando cambia algo que afecta la lista,
  // solo si el modo es "lista" (el especial no se pisa).
  function recalc(over: Partial<Record<'cliente' | 'material' | 'fecha' | 'municipio' | 'modo', string>>) {
    const cli  = over.cliente   ?? wCliente
    const mat  = over.material  ?? wMaterial
    const fec  = over.fecha     ?? wFecha
    const mun  = over.municipio ?? wMunicipio
    const modo = over.modo      ?? wModo
    if (modo !== 'lista') return
    const r = precioConRecargo(precios, municipios, cli, mat, fec, mun)
    setValue('precio_unit', r ? String(r.final) : '')
  }

  // El escombro (unidad viaje) sale de la obra del cliente; los m³ de
  // cantera o depósito. Al cambiar el material se corrige el origen.
  function onMaterialChange(materialId: string) {
    const mat = materiales.find(m => m.id === Number(materialId))
    if (mat?.unidad === 'viaje') {
      setValue('origen', 'obra')
      setValue('cantera_id', '')
    } else if (watch('origen') === 'obra') {
      setValue('origen', 'cantera')
    }
    recalc({ material: materialId })
  }

  const importe = (Number(wCantidad) || 0) * (Number(wPrecio) || 0)

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
      hora:        v.hora ? v.hora.slice(0, 5) : '',
      cliente_id:  String(v.cliente_id ?? ''),
      material_id: String(v.material_id),
      cantidad:    String(v.cantidad),
      origen:      v.origen ?? 'cantera',
      cantera_id:  v.cantera_id ? String(v.cantera_id) : '',
      modo_precio: v.precio_especial ? 'especial' : 'lista',
      precio_unit: v.precio_unit != null ? String(v.precio_unit) : '',
      entrega_direccion: v.entrega_direccion ?? '',
      municipio_id: v.municipio_id ? String(v.municipio_id) : '',
      unidad_id:   v.unidad_id ? String(v.unidad_id) : '',
      costo_total: v.costo_total != null ? String(v.costo_total) : '',
      flete_obs:   v.flete_obs ?? '',
      remito:      v.remito ?? '',
      obs:         v.obs ?? '',
    })
    setModalOpen(true)
  }

  function onSubmit(data: VentaForm) {
    // El escombro (unidad viaje) siempre sale de la obra del cliente,
    // aunque el registro editado venga con un origen viejo.
    const mat = materiales.find(m => m.id === Number(data.material_id))
    const origen = mat?.unidad === 'viaje' ? 'obra' : data.origen
    const dto = {
      tipo:        'venta',
      fecha:       data.fecha,
      hora:        data.hora || null,
      cliente_id:  Number(data.cliente_id),
      material_id: Number(data.material_id),
      cantidad:    Number(data.cantidad),
      origen,
      cantera_id:  origen === 'cantera' && data.cantera_id ? Number(data.cantera_id) : null,
      precio_unit: data.precio_unit ? Number(data.precio_unit) : null,
      importe:     (Number(data.cantidad) || 0) * (Number(data.precio_unit) || 0),
      precio_especial:   data.modo_precio === 'especial',
      entrega_direccion: data.entrega_direccion.trim() || null,
      municipio_id:      data.municipio_id ? Number(data.municipio_id) : null,
      unidad_id:   data.unidad_id ? Number(data.unidad_id) : null,
      costo_total: origen === 'cantera' && data.costo_total ? Number(data.costo_total) : null,
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

  // Consulta GPS + Google Maps on-demand: ¿dónde está la unidad y cuánto
  // falta para que llegue a la dirección de entrega de esta venta?
  function handleEta(v: MovimientoArido) {
    if (!v.unidad_id || !v.entrega_direccion) return
    setEtaDe(v.id)
    consultarEta({ unidadId: v.unidad_id, direccion: v.entrega_direccion }, {
      onSuccess: (r) => { setEtaResult(r); setEtaDe(null) },
      onError:   (err: unknown) => { toast(mensajeError(err, 'No se pudo consultar el GPS'), 'err'); setEtaDe(null) },
    })
  }

  const clienteOptions   = [{ value: '', label: 'Seleccionar cliente…' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]
  const materialOptions  = [{ value: '', label: 'Seleccionar material…' }, ...materiales.filter(m => m.activo).map(m => ({ value: m.id, label: `${m.nombre} ($/${m.unidad === 'm3' ? 'm³' : 'viaje'})` }))]
  const canteraOptions   = [{ value: '', label: 'Sin especificar' }, ...canteras.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre }))]
  const municipioOptions = [{ value: '', label: 'Sin recargo (zona base)' }, ...municipios.map(m => ({ value: m.id, label: `${m.nombre}${Number(m.recargo_pct) > 0 ? ` (+${m.recargo_pct}%)` : ''}` }))]
  const unidadOptions    = [{ value: '', label: 'Sin especificar' }, ...unidades.filter(u => u.activo).map(u => ({ value: u.id, label: `${u.nombre} · ${u.patente}${u.chofer ? ` · ${u.chofer}` : ''}` }))]

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
            <table className="w-full border-collapse min-w-[980px]">
              <thead>
                <tr>
                  {['Fecha', 'Cliente', 'Material', 'Cantidad', 'Origen', 'Entrega', 'Precio', 'Importe', 'Remito', ''].map((h, i) => (
                    <th key={i} className="bg-azul text-white text-xs font-bold px-3 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-3 py-2.5 text-sm text-carbon whitespace-nowrap">
                      {fmtDate(v.fecha)}
                      {v.hora && <span className="text-[10px] text-gris-dark ml-1">{v.hora.slice(0, 5)} hs</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold text-carbon">{v.aridos_clientes?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-carbon">{v.aridos_materiales?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sm font-mono text-carbon whitespace-nowrap">
                      {fmtCant(Number(v.cantidad))} {v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark">
                      {v.origen === 'deposito'
                        ? <span className="font-bold text-azul-mid">Depósito</span>
                        : v.origen === 'obra'
                          ? <span className="font-bold text-[#7A5500]">Obra (escombro)</span>
                          : <span>{v.aridos_canteras?.nombre ?? 'Cantera'}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark max-w-[180px]">
                      <div className="truncate" title={v.entrega_direccion ?? ''}>{v.entrega_direccion || '—'}</div>
                      {v.aridos_municipios && <div className="text-[10px]">{v.aridos_municipios.nombre}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-gris-dark whitespace-nowrap">
                      {v.precio_unit != null ? fmtM(Number(v.precio_unit)) : '—'}
                      {v.precio_especial && <span className="text-[10px] text-naranja font-bold ml-1" title="Precio especial (no de lista)">ESP</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono font-bold text-verde whitespace-nowrap">{v.importe != null ? fmtM(Number(v.importe)) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gris-dark font-mono">{v.remito || '—'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {v.unidad_id != null && v.entrega_direccion && (
                        <Button
                          variant="ghost" size="sm"
                          disabled={consultandoEta}
                          onClick={() => handleEta(v)}
                          title={`¿Dónde está ${v.aridos_unidades?.nombre ?? 'la unidad'}? Tiempo de llegada a la entrega`}
                        >
                          {etaDe === v.id ? '⏳' : '🛰'}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(v)}>✎</Button>
                      <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => handleEliminar(v)}>🗑</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gris/40">
                  <td colSpan={7} className="px-3 py-2.5 text-xs font-bold text-gris-dark text-right uppercase">Total listado ({ventas.length} venta{ventas.length !== 1 ? 's' : ''})</td>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Fecha" type="date" error={errors.fecha?.message}
              {...register('fecha', {
                required: 'Requerida',
                onChange: e => recalc({ fecha: e.target.value }),
              })} />
            <Input label="Hora" type="time" {...register('hora')} />
            <div className="col-span-2">
              <Select label="Cliente" options={clienteOptions} error={errors.cliente_id?.message}
                {...register('cliente_id', {
                  required: 'Elegí un cliente',
                  onChange: e => recalc({ cliente: e.target.value }),
                })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Select label="Material" options={materialOptions} error={errors.material_id?.message}
                {...register('material_id', {
                  required: 'Elegí un material',
                  onChange: e => onMaterialChange(e.target.value),
                })} />
            </div>
            <Input label={`Cantidad (${unidadLabel})`} type="number" step="0.01" placeholder="0" error={errors.cantidad?.message}
              {...register('cantidad', { required: 'Requerida', validate: v => Number(v) > 0 || 'Debe ser mayor a 0' })} />
          </div>

          {/* Origen: m³ desde cantera/depósito; escombro siempre desde la obra del cliente */}
          {!esViaje ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select label="Origen" options={[
                { value: 'cantera', label: 'Cantera (directo)' },
                { value: 'deposito', label: 'Depósito propio' },
              ]} {...register('origen')} />
              {wOrigen === 'cantera' ? (
                <Select label="Cantera (proveedor)" options={canteraOptions} {...register('cantera_id')} />
              ) : (
                <div className="flex items-end pb-2">
                  <span className="text-xs text-gris-dark">
                    Stock actual: <b className="font-mono">{stockMaterial != null ? fmtCant(stockMaterial) : '—'} m³</b>
                  </span>
                </div>
              )}
              <Select label="Municipio de entrega" options={municipioOptions}
                {...register('municipio_id', { onChange: e => recalc({ municipio: e.target.value }) })} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-end pb-2">
                <span className="text-xs font-bold text-[#7A5500] bg-amarillo-light px-2 py-1 rounded">
                  🚧 Retiro: obra del cliente → depósito
                </span>
              </div>
              <div className="sm:col-span-2">
                <Select label="Municipio (de la obra)" options={municipioOptions}
                  {...register('municipio_id', { onChange: e => recalc({ municipio: e.target.value }) })} />
              </div>
            </div>
          )}

          <Input
            label={esViaje ? 'Dirección de retiro (obra del cliente)' : 'Dirección de entrega'}
            placeholder={esViaje ? 'Ej: Obra Av. Aconquija 1500, Yerba Buena' : 'Ej: Av. Roca 2300, San Miguel de Tucumán'}
            {...register('entrega_direccion')}
          />

          {wOrigen === 'cantera' && !esViaje && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <Input label="Costo cantera ($ total del viaje)" type="number" step="0.01" placeholder="Lo que cobra la cantera" {...register('costo_total')} />
              <p className="sm:col-span-2 text-[11px] text-gris-dark pb-2">
                Es lo que la cantera te cobra por este retiro — carga la deuda en su cuenta corriente. La lista de precios está en Canteras y unidades → 💲 Precios.
              </p>
            </div>
          )}

          {/* Precio: lista (autocalculado, bloqueado) o especial (a mano) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Tipo de precio" options={[
              { value: 'lista',    label: 'Precio de lista' },
              { value: 'especial', label: 'Precio especial (a mano)' },
            ]} {...register('modo_precio', { onChange: e => recalc({ modo: e.target.value }) })} />
            <Input label="Precio unitario ($)" type="number" step="0.01" placeholder="0.00"
              disabled={wModo === 'lista'}
              error={errors.precio_unit?.message}
              {...register('precio_unit', { required: 'Requerido', validate: v => Number(v) >= 0 || 'Inválido' })} />
            <div className="flex items-end pb-2">
              <span className="text-sm font-bold text-carbon">
                Importe: <span className="font-mono text-verde">{fmtM(importe)}</span>
              </span>
            </div>
          </div>

          <div className="bg-gris/30 rounded-card px-3 py-2 text-xs text-gris-dark">
            {lista
              ? <>Lista del cliente: <b className="font-mono">{fmtM(Number(lista.base.precio))}</b> (desde {fmtDate(lista.base.vigente_desde)}){lista.recargoPct > 0 && <> + <b>{lista.recargoPct}%</b> municipio = <b className="font-mono">{fmtM(lista.final)}</b></>}</>
              : (wCliente && wMaterial)
                ? <span className="text-[#7A5500] font-semibold">⚠ Sin precio de lista para este cliente/material — usá &quot;Precio especial&quot;.</span>
                : 'Elegí cliente y material para ver el precio de lista.'}
          </div>

          {wModo === 'lista' && !lista && wCliente && wMaterial && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
              ⚠ No hay precio de lista: cambiá a &quot;Precio especial&quot; para cargar el valor a mano, o precargalo en la ficha del cliente.
            </div>
          )}

          {excedeStock && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
              ⚠ La cantidad supera el stock calculado del depósito ({fmtCant(stockMaterial!)} m³). Se puede registrar igual — el papel manda — pero revisá si falta cargar un acopio.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Select label="Unidad (camión + chofer)" options={unidadOptions} {...register('unidad_id')} />
            </div>
            <Input label="Flete externo" placeholder="Si no es unidad propia" {...register('flete_obs')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Remito" placeholder="N° de remito (opcional)" {...register('remito')} />
            <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
          </div>
        </div>
      </Modal>

      {/* Modal resultado ETA (GPS + Google Maps) */}
      <Modal
        open={!!etaResult}
        onClose={() => setEtaResult(null)}
        title={`🛰 ${etaResult?.unidad.nombre ?? ''} — ${etaResult?.unidad.patente ?? ''}`}
        width="max-w-md"
        footer={<Button variant="secondary" onClick={() => setEtaResult(null)}>Cerrar</Button>}
      >
        {etaResult && (
          <div className="flex flex-col gap-3">
            <div className="bg-azul/5 rounded-card p-4 text-center">
              <div className="text-3xl font-display text-azul">
                {etaResult.eta_traffic_min ?? etaResult.eta_min} min
              </div>
              <div className="text-xs text-gris-dark mt-1">
                tiempo estimado de llegada{etaResult.eta_traffic_min != null ? ' (con tráfico)' : ''} · {etaResult.distancia_km} km
              </div>
            </div>
            <div className="text-xs text-gris-dark flex flex-col gap-1">
              <div><b>Destino:</b> {etaResult.destino.direccion}</div>
              {etaResult.unidad.chofer && <div><b>Chofer:</b> {etaResult.unidad.chofer}</div>}
              <div>
                <b>Posición:</b>{' '}
                <a
                  href={`https://www.google.com/maps?q=${etaResult.posicion.lat},${etaResult.posicion.lng}`}
                  target="_blank" rel="noreferrer"
                  className="text-azul-mid underline"
                >ver en el mapa</a>
                {etaResult.posicion.velocidad != null && <span> · {Math.round(etaResult.posicion.velocidad)} km/h</span>}
                {etaResult.posicion.lectura_en && <span> · lectura {new Date(etaResult.posicion.lectura_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
