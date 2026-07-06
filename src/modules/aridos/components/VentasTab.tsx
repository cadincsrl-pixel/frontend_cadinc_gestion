'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  useCanterasAridos, useUnidades, useUnidadEta, useEmitirRemitoVenta,
  usePreciosGlobal, useCostosCantera,
} from '../hooks/useAridos'
import { RemitoVentaModal } from './RemitoVentaModal'
import { esMaterialFlete } from '../types'
import type { MovimientoArido, PrecioCliente, PrecioGlobal, MunicipioArido, UnidadEta, CostoCantera } from '../types'

interface VentaForm {
  fecha:       string
  hora:        string
  cliente_id:  string
  material_id: string
  cantidad:    string
  origen:      'cantera' | 'deposito' | 'obra'
  cantera_id:  string
  // Zona de la lista de precios de la cantera (solo UI, para elegir el costo
  // cuando el material tiene precio en más de una zona). No se persiste.
  costo_zona:  string
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
  cantera_id: '', costo_zona: '', modo_precio: 'lista', precio_unit: '', entrega_direccion: '', municipio_id: '',
  unidad_id: '', costo_total: '', flete_obs: '', remito: '', obs: '',
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// HH:MM local para el default del campo hora
function horaActual(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtCant(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

// Precio de lista (vigente a la fecha) con el recargo del municipio.
// Resolución: precio propio del CLIENTE si tiene; si no, lista GLOBAL.
function precioConRecargo(
  precios: PrecioCliente[],
  preciosGlobal: PrecioGlobal[],
  municipios: MunicipioArido[],
  clienteId: string,
  materialId: string,
  fecha: string,
  municipioId: string,
): { precio: number; vigente_desde: string; fuente: 'cliente' | 'global'; final: number; recargoPct: number } | null {
  if (!clienteId || !materialId || !fecha) return null
  const delCliente = precios
    .filter(p => p.cliente_id === Number(clienteId) && p.material_id === Number(materialId) && p.vigente_desde <= fecha)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  const global = preciosGlobal
    .filter(p => p.material_id === Number(materialId) && p.vigente_desde <= fecha)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
  const base = delCliente ?? global
  if (!base) return null
  const recargoPct = municipioId
    ? Number(municipios.find(m => m.id === Number(municipioId))?.recargo_pct ?? 0)
    : 0
  const final = Math.round(Number(base.precio) * (1 + recargoPct / 100) * 100) / 100
  return { precio: Number(base.precio), vigente_desde: base.vigente_desde, fuente: delCliente ? 'cliente' : 'global', final, recargoPct }
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
  const { data: preciosGlobal = [] } = usePreciosGlobal()
  const { data: municipios = [] } = useMunicipios()
  const { data: stock = [] }      = useStockAridos()
  const { data: canteras = [] }   = useCanterasAridos()
  const { data: costosCantera = [] } = useCostosCantera()
  const { data: unidades = [] }   = useUnidades()
  const { mutate: crear, isPending: creando }       = useCreateMovimiento()
  const { mutate: actualizar, isPending: editando } = useUpdateMovimiento()
  const { mutate: borrar } = useDeleteMovimiento()
  const { mutate: consultarEta, isPending: consultandoEta } = useUnidadEta()
  const { mutate: emitirRemito, isPending: emitiendoRemito } = useEmitirRemitoVenta()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  // Movimiento en edición: lo guardamos para comparar el stock sin falso "excede"
  // (el stock que vemos ya tiene descontada esta venta si era de depósito).
  const [editMov, setEditMov] = useState<MovimientoArido | null>(null)
  const [etaResult, setEtaResult] = useState<UnidadEta | null>(null)
  const [etaDe, setEtaDe] = useState<number | null>(null)  // id del movimiento consultando
  const [remitoVenta, setRemitoVenta] = useState<MovimientoArido | null>(null)
  const [remitoDe, setRemitoDe] = useState<number | null>(null)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<VentaForm>({
    defaultValues: { ...DEFAULTS, fecha: toISO(new Date()), hora: horaActual() },
  })

  const wCliente   = watch('cliente_id')
  const wMaterial  = watch('material_id')
  const wFecha     = watch('fecha')
  const wCantidad  = watch('cantidad')
  const wPrecio    = watch('precio_unit')
  const wOrigen    = watch('origen')
  const wModo      = watch('modo_precio')
  const wMunicipio = watch('municipio_id')
  const wCantera   = watch('cantera_id')
  const wCostoZona = watch('costo_zona')

  const materialSel = materiales.find(m => m.id === Number(wMaterial))
  const esViaje     = materialSel?.unidad === 'viaje'
  // Flete punto A → punto B: servicio de transporte, sin stock ni cantera.
  // El precio se carga a mano según cliente/distancia (siempre "especial").
  const esFlete     = esViaje && esMaterialFlete(materialSel?.nombre)
  const unidadLabel = esViaje ? 'viaje(s)' : 'm³'

  const lista = precioConRecargo(precios, preciosGlobal, municipios, wCliente, wMaterial, wFecha, wMunicipio)

  // Recalcula el precio cuando cambia algo que afecta la lista,
  // solo si el modo es "lista" (el especial no se pisa).
  // `force`: al EDITAR una venta vieja NO re-cotizamos automáticamente (cambiar
  // fecha/cliente/municipio no debe pisar el precio histórico y descuadrar la
  // cuenta corriente). Solo recalculamos ante intención explícita: cambiar el
  // material (otro producto) o pasar el modo a "lista".
  function recalc(
    over: Partial<Record<'cliente' | 'material' | 'fecha' | 'municipio' | 'modo', string>>,
    opts?: { force?: boolean },
  ) {
    const cli  = over.cliente   ?? wCliente
    const mat  = over.material  ?? wMaterial
    const fec  = over.fecha     ?? wFecha
    const mun  = over.municipio ?? wMunicipio
    const modo = over.modo      ?? wModo
    if (modo !== 'lista') return
    if (editId != null && !opts?.force) return
    const r = precioConRecargo(precios, preciosGlobal, municipios, cli, mat, fec, mun)
    setValue('precio_unit', r ? String(r.final) : '')
  }

  // ── Costo de retiro: autocompletado desde la lista de precios de la cantera ──
  // Matchea por cantera + material VINCULADO en la lista (material_id) vigente a
  // la fecha. Si hay precio en más de una zona, el user elige con el select.
  // Tipear el costo a mano corta el autocompletado hasta cambiar cantera/material.
  const costoManualRef = useRef(false)

  const costosMatch = useMemo(() => {
    if (wOrigen !== 'cantera' || !wCantera || !wMaterial || !wFecha) return []
    const candidatos = costosCantera.filter(c =>
      c.cantera_id === Number(wCantera) &&
      c.material_id === Number(wMaterial) &&
      c.vigente_desde <= wFecha &&
      c.unidad !== 'hora')
    // Vigente por zona (el historial guarda versiones viejas del mismo concepto)
    const porZona = new Map<string, CostoCantera>()
    for (const c of candidatos) {
      const key = c.zona ?? ''
      const prev = porZona.get(key)
      if (!prev || c.vigente_desde > prev.vigente_desde) porZona.set(key, c)
    }
    return Array.from(porZona.values()).sort((a, b) => (a.zona ?? '').localeCompare(b.zona ?? ''))
  }, [costosCantera, wOrigen, wCantera, wMaterial, wFecha])

  const costoSel = costosMatch.length === 1
    ? costosMatch[0]!
    : costosMatch.find(c => (c.zona ?? '') === wCostoZona) ?? null

  const costoCalculado = costoSel == null ? null
    : costoSel.unidad === 'viaje' ? Number(costoSel.costo)
    : (Number(wCantidad) || 0) > 0 ? Math.round(Number(costoSel.costo) * Number(wCantidad) * 100) / 100
    : null

  // Preseleccionar la primera zona cuando hay varias y la elegida no aplica.
  useEffect(() => {
    if (costosMatch.length > 1 && !costosMatch.some(c => (c.zona ?? '') === wCostoZona)) {
      setValue('costo_zona', costosMatch[0]!.zona ?? '')
    }
  }, [costosMatch, wCostoZona, setValue])

  // Autocompletar SOLO en ventas nuevas: al editar una venta vieja no se pisa
  // el costo histórico (mismo criterio que el precio de venta).
  useEffect(() => {
    if (editId != null || costoManualRef.current || wOrigen !== 'cantera') return
    setValue('costo_total', costoCalculado != null ? String(costoCalculado) : '')
  }, [costoCalculado, wOrigen, editId, setValue])

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
    costoManualRef.current = false
    // El flete no tiene precio de lista: pasa solo a "especial" (a mano).
    if (mat?.unidad === 'viaje' && esMaterialFlete(mat.nombre)) {
      setValue('modo_precio', 'especial')
      recalc({ material: materialId, modo: 'especial' }, { force: true })
      return
    }
    recalc({ material: materialId }, { force: true })
  }

  const importe = (Number(wCantidad) || 0) * (Number(wPrecio) || 0)

  const stockMaterial = stock.find(s => s.material_id === Number(wMaterial))?.stock ?? null
  // Al editar una venta de depósito ya registrada, el stock que muestra el
  // backend YA tiene restada su cantidad; se la sumamos de vuelta para comparar
  // contra el stock real disponible y no dar un falso "excede".
  const stockComparable = stockMaterial == null ? null : stockMaterial + (
    editMov && editMov.origen === 'deposito' && editMov.material_id === Number(wMaterial)
      ? Number(editMov.cantidad) : 0
  )
  const excedeStock = wOrigen === 'deposito' && stockComparable != null && Number(wCantidad) > stockComparable

  const totalListado = ventas.reduce((s, v) => s + Number(v.importe ?? 0), 0)

  function abrirNueva() {
    setEditId(null)
    setEditMov(null)
    costoManualRef.current = false
    reset({ ...DEFAULTS, fecha: toISO(new Date()), hora: horaActual() })
    setModalOpen(true)
  }

  function abrirEditar(v: MovimientoArido) {
    setEditId(v.id)
    setEditMov(v)
    costoManualRef.current = true
    reset({
      fecha:       v.fecha,
      hora:        v.hora ? v.hora.slice(0, 5) : '',
      cliente_id:  String(v.cliente_id ?? ''),
      material_id: String(v.material_id),
      cantidad:    String(v.cantidad),
      origen:      v.origen ?? 'cantera',
      cantera_id:  v.cantera_id ? String(v.cantera_id) : '',
      costo_zona:  '',
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
        onSuccess: (mov) => {
          toast(mov.remito_numero ? `✓ Venta registrada · remito ${mov.remito_numero}` : '✓ Venta registrada', 'ok')
          setModalOpen(false)
          // El remito se emite solo al registrar: lo dejamos abierto
          // para imprimir/mandar al cliente en el momento.
          if (mov.remito_numero) setRemitoVenta(mov)
        },
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

  // Emite (o reusa) el remito RV-NNNN y abre la vista previa.
  function handleRemito(v: MovimientoArido) {
    setRemitoDe(v.id)
    emitirRemito(v.id, {
      onSuccess: (mov) => { setRemitoVenta(mov); setRemitoDe(null) },
      onError:   (err: unknown) => { toast(mensajeError(err, 'Error al emitir el remito'), 'err'); setRemitoDe(null) },
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
        <>
        {/* Tabla — desktop/tablet */}
        <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
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
                          ? esMaterialFlete(v.aridos_materiales?.nombre)
                            ? <span className="font-bold text-naranja">🚚 Flete</span>
                            : <span className="font-bold text-[#7A5500]">Obra (escombro)</span>
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
                    <td className="px-3 py-2.5 text-sm font-mono font-bold text-verde whitespace-nowrap">
                      {v.importe != null ? fmtM(Number(v.importe)) : '—'}
                      {v.cobro_id != null && <span className="text-[9px] font-sans bg-verde-light text-verde px-1 py-0.5 rounded ml-1" title="Remito cobrado">✓ COBRADO</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">
                      {v.remito_numero && <div className="font-bold text-naranja">{v.remito_numero}</div>}
                      <div className="text-gris-dark">{v.remito || (v.remito_numero ? '' : '—')}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost" size="sm"
                        disabled={emitiendoRemito}
                        onClick={() => handleRemito(v)}
                        title={v.remito_numero ? `Ver remito ${v.remito_numero}` : 'Emitir remito de la venta'}
                      >
                        {remitoDe === v.id ? '⏳' : '🧾'}
                      </Button>
                      {v.unidad_id != null && v.entrega_direccion && (
                        <Button
                          variant="ghost" size="sm"
                          disabled={consultandoEta && etaDe === v.id}
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

        {/* Cards — mobile */}
        <div className="md:hidden flex flex-col gap-2">
          {ventas.map(v => (
            <div key={v.id} className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-gris-dark">
                    {fmtDate(v.fecha)}{v.hora && <span className="ml-1">{v.hora.slice(0, 5)} hs</span>}
                  </div>
                  <div className="font-bold text-sm text-carbon truncate">{v.aridos_clientes?.nombre ?? '—'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-verde text-sm whitespace-nowrap">{v.importe != null ? fmtM(Number(v.importe)) : '—'}</div>
                  {v.cobro_id != null && <span className="text-[9px] font-bold bg-verde-light text-verde px-1 py-0.5 rounded">✓ COBRADO</span>}
                </div>
              </div>

              <div className="text-xs text-carbon flex flex-wrap gap-x-2 gap-y-0.5">
                <span>{v.aridos_materiales?.nombre ?? '—'}</span>
                <span className="font-mono">· {fmtCant(Number(v.cantidad))} {v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'}</span>
                <span className="text-gris-dark">·{' '}
                  {v.origen === 'deposito' ? 'Depósito' : v.origen === 'obra' ? (esMaterialFlete(v.aridos_materiales?.nombre) ? '🚚 Flete' : 'Obra (escombro)') : (v.aridos_canteras?.nombre ?? 'Cantera')}
                </span>
              </div>

              {v.entrega_direccion && (
                <div className="text-[11px] text-gris-dark truncate">📍 {v.entrega_direccion}{v.aridos_municipios ? ` (${v.aridos_municipios.nombre})` : ''}</div>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-mono text-gris-dark">
                  {v.precio_unit != null ? fmtM(Number(v.precio_unit)) : '—'}
                  {v.precio_especial && <span className="text-[10px] text-naranja font-bold ml-1">ESP</span>}
                  {v.remito_numero && <span className="text-naranja font-bold ml-2">{v.remito_numero}</span>}
                  {v.remito && <span className="ml-1">· {v.remito}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={emitiendoRemito} onClick={() => handleRemito(v)} title={v.remito_numero ? `Ver remito ${v.remito_numero}` : 'Emitir remito'}>
                    {remitoDe === v.id ? '⏳' : '🧾'}
                  </Button>
                  {v.unidad_id != null && v.entrega_direccion && (
                    <Button variant="ghost" size="sm" disabled={consultandoEta && etaDe === v.id} onClick={() => handleEta(v)} title="Tiempo de llegada">
                      {etaDe === v.id ? '⏳' : '🛰'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={!puedeEditar} onClick={() => abrirEditar(v)}>✎</Button>
                  <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => handleEliminar(v)}>🗑</Button>
                </div>
              </div>
            </div>
          ))}
          <div className="bg-gris/40 rounded-card px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-bold text-gris-dark uppercase">Total ({ventas.length} venta{ventas.length !== 1 ? 's' : ''})</span>
            <span className="font-mono font-bold text-verde text-sm">{fmtM(totalListado)}</span>
          </div>
        </div>
        </>
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
                <Select label="Cantera (proveedor)" options={canteraOptions}
                  {...register('cantera_id', { onChange: () => { costoManualRef.current = false } })} />
              ) : (
                <div className="flex items-end pb-2">
                  <span className="text-xs text-gris-dark">
                    Stock disponible: <b className="font-mono">{stockComparable != null ? fmtCant(stockComparable) : '—'} m³</b>
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
                  {esFlete ? '🚚 Flete: punto A → punto B' : '🚧 Retiro: obra del cliente → depósito'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <Select label={esFlete ? 'Municipio (si aplica)' : 'Municipio (de la obra)'} options={municipioOptions}
                  {...register('municipio_id', { onChange: e => recalc({ municipio: e.target.value }) })} />
              </div>
            </div>
          )}

          <Input
            label={esFlete ? 'Recorrido (punto A → punto B)' : esViaje ? 'Dirección de retiro (obra del cliente)' : 'Dirección de entrega'}
            placeholder={esFlete ? 'Ej: Cantera Campero → Obra Av. Aconquija 1500' : esViaje ? 'Ej: Obra Av. Aconquija 1500, Yerba Buena' : 'Ej: Av. Roca 2300, San Miguel de Tucumán'}
            {...register('entrega_direccion')}
          />

          {wOrigen === 'cantera' && !esViaje && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <Input label="Costo cantera ($ total del viaje)" type="number" step="0.01" placeholder="Lo que cobra la cantera"
                {...register('costo_total', { onChange: () => { costoManualRef.current = true } })} />
              {costosMatch.length > 1 && (
                <Select label="Zona (lista de la cantera)"
                  options={costosMatch.map(c => ({ value: c.zona ?? '', label: c.zona || '(sin zona)' }))}
                  {...register('costo_zona')} />
              )}
              <div className={`text-[11px] text-gris-dark pb-2 ${costosMatch.length > 1 ? '' : 'sm:col-span-2'}`}>
                {costoSel && costoCalculado != null ? (
                  <>
                    Lista{costoSel.concepto ? ` (${costoSel.concepto})` : ''}: <b className="font-mono">{fmtM(Number(costoSel.costo))}</b>/{costoSel.unidad === 'm3' ? 'm³' : 'viaje'}
                    {costoSel.unidad === 'm3' && <> × {fmtCant(Number(wCantidad))} m³ = <b className="font-mono">{fmtM(costoCalculado)}</b></>}
                    {' '}(desde {fmtDate(costoSel.vigente_desde)}). Se puede pisar a mano.
                    {editId != null && Number(watch('costo_total')) !== costoCalculado && (
                      <button type="button" className="ml-1 text-azul font-semibold hover:underline"
                        onClick={() => setValue('costo_total', String(costoCalculado))}>
                        Usar lista
                      </button>
                    )}
                  </>
                ) : costoSel ? (
                  <>Lista: <b className="font-mono">{fmtM(Number(costoSel.costo))}</b>/m³ — poné la cantidad para calcular el total.</>
                ) : (
                  <>
                    Es lo que la cantera te cobra por este retiro — carga la deuda en su cuenta corriente.{' '}
                    {wCantera && wMaterial
                      ? <span className="text-[#7A5500] font-semibold">Este material no tiene precio vinculado en la lista de esta cantera — vinculalo en Canteras y unidades → 💲 Precios (campo Material).</span>
                      : 'La lista de precios está en Canteras y unidades → 💲 Precios.'}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Precio: lista (autocalculado, bloqueado) o especial (a mano) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Tipo de precio" options={[
              { value: 'lista',    label: 'Precio de lista' },
              { value: 'especial', label: 'Precio especial (a mano)' },
            ]} {...register('modo_precio', { onChange: e => recalc({ modo: e.target.value }, { force: true }) })} />
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
            {esFlete
              ? <>🚚 Flete punto a punto: el precio se carga <b>a mano</b> según el cliente y la distancia del recorrido.</>
              : lista
              ? wModo === 'especial'
                // En especial el recargo de municipio NO se aplica solo: el
                // precio de lista va como referencia para no confundir.
                ? <>Precio de lista (referencia): <b className="font-mono">{fmtM(lista.final)}</b>{lista.recargoPct > 0 && <> (incluye +{lista.recargoPct}% municipio)</>}. Estás cargando un <b>precio especial a mano</b> — el recargo no se aplica automáticamente.</>
                : <>{lista.fuente === 'cliente' ? 'Precio propio del cliente' : 'Lista global'}: <b className="font-mono">{fmtM(lista.precio)}</b> (desde {fmtDate(lista.vigente_desde)}){lista.recargoPct > 0 && <> + <b>{lista.recargoPct}%</b> municipio = <b className="font-mono">{fmtM(lista.final)}</b></>}</>
              : (wCliente && wMaterial)
                ? <span className="text-[#7A5500] font-semibold">⚠ Sin precio en la lista global ni del cliente — usá &quot;Precio especial&quot;.</span>
                : 'Elegí cliente y material para ver el precio de lista.'}
          </div>

          {!esFlete && wModo === 'lista' && !lista && wCliente && wMaterial && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
              ⚠ No hay precio de lista: cambiá a &quot;Precio especial&quot; para cargar el valor a mano, o precargalo en la ficha del cliente.
            </div>
          )}

          {excedeStock && (
            <div className="bg-amarillo-light border border-[#7A5500]/30 rounded-card px-3 py-2 text-xs text-[#7A5500] font-semibold">
              ⚠ La cantidad supera el stock calculado del depósito ({fmtCant(stockComparable!)} m³). Se puede registrar igual — el papel manda — pero revisá si falta cargar un acopio.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Select label="Unidad (camión + chofer)" options={unidadOptions} {...register('unidad_id')} />
            </div>
            <Input label="Flete externo" placeholder="Si no es unidad propia" {...register('flete_obs')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Remito papel (N°)" placeholder="Si entregaste remito físico" {...register('remito')} />
            <Input label="Observaciones" placeholder="Notas..." {...register('obs')} />
          </div>
        </div>
      </Modal>

      <RemitoVentaModal venta={remitoVenta} onClose={() => setRemitoVenta(null)} />

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
