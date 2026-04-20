'use client'

import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useForm } from 'react-hook-form'
import {
  useStockRubros, useStockMateriales, useStockMovimientos,
  useCreateStockMaterial, useUpdateStockMaterial, useDeleteStockMaterial,
  useCreateMovimiento, useCreateRubro,
} from '../hooks/useStock'
import { useProveedores } from '../hooks/useProveedores'
import { usePermisos } from '@/hooks/usePermisos'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import type { StockMaterial, StockRubro, StockMovimiento, Proveedor } from '@/types/domain.types'

const UNIDADES = [
  { value: 'unid', label: 'Unid.' }, { value: 'kg', label: 'kg' },
  { value: 'tn', label: 'tn' }, { value: 'lt', label: 'lt' },
  { value: 'm', label: 'm' }, { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' }, { value: 'gl', label: 'gl' },
  { value: 'rollo', label: 'Rollo' }, { value: 'bolsa', label: 'Bolsa' },
  { value: 'balde', label: 'Balde' }, { value: 'lata', label: 'Lata' },
]

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) }
function fmtF(s: string) {
  const iso = s.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

// ── Tipos de formulario ──
interface MaterialForm {
  rubro_id: number | ''
  nombre: string
  unidad: string
  stock_minimo: number | string
  precio_ref: number | string
  proveedor_id: string
}
interface MovimientoForm {
  cantidad: number | string
  tipo: 'entrada' | 'salida' | 'ajuste'
  motivo: 'compra' | 'despacho_obra' | 'devolucion' | 'ajuste_inventario'
  obs: string
}
interface RubroForm {
  nombre: string
  icono: string
}

const MOTIVO_LABEL: Record<string, string> = {
  compra: 'Compra', despacho_obra: 'Despacho a obra', devolucion: 'Devolución', ajuste_inventario: 'Ajuste inventario',
}
const TIPO_CFG: Record<string, { label: string; color: string }> = {
  entrada: { label: '+ Entrada', color: 'text-verde' },
  salida:  { label: '- Salida',  color: 'text-rojo' },
  ajuste:  { label: '↔ Ajuste', color: 'text-naranja' },
}

export function StockTab() {
  const toast = useToast()
  const perfiles = usePerfilesMap()
  const { puedeEliminar: puedeAjustar } = usePermisos('certificaciones')
  const { data: rubros = [] } = useStockRubros()
  const { data: materiales = [], isLoading } = useStockMateriales()
  const { data: proveedores = [] } = useProveedores()
  const provOptions = (proveedores as Proveedor[]).map(p => ({ value: String(p.id), label: p.nombre, sub: p.cuit ?? undefined }))
  const { mutate: createMat } = useCreateStockMaterial()
  const { mutate: updateMat } = useUpdateStockMaterial()
  const { mutate: deleteMat } = useDeleteStockMaterial()
  const { mutate: createMov, mutateAsync: createMovAsync } = useCreateMovimiento()
  const { mutate: createRubro } = useCreateRubro()

  const [rubroFiltro, setRubroFiltro] = useState<number | ''>('')
  const [stockFiltro, setStockFiltro] = useState<'' | 'con_stock' | 'sin_stock' | 'stock_bajo'>('con_stock')
  const [busqueda, setBusqueda] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalEntrada, setModalEntrada] = useState<StockMaterial | null>(null)
  const [modalHistorial, setModalHistorial] = useState<StockMaterial | null>(null)
  const [modalEditar, setModalEditar] = useState<StockMaterial | null>(null)
  const [modalNuevoRubro, setModalNuevoRubro] = useState(false)
  const [modalEliminar, setModalEliminar] = useState<StockMaterial | null>(null)

  const formNuevo = useForm<MaterialForm>({ defaultValues: { rubro_id: '', nombre: '', unidad: 'unid', stock_minimo: 0, precio_ref: 0, proveedor_id: '' } })
  const formEntrada = useForm<MovimientoForm>({ defaultValues: { cantidad: 0, tipo: 'entrada', motivo: 'compra', obs: '' } })
  const formEditar = useForm<MaterialForm>({ defaultValues: { rubro_id: '', nombre: '', unidad: 'unid', stock_minimo: 0, precio_ref: 0, proveedor_id: '' } })
  const formRubro = useForm<RubroForm>({ defaultValues: { nombre: '', icono: '' } })

  // Filtrar y agrupar
  const filtered = useMemo(() => {
    let list = materiales as StockMaterial[]
    if (rubroFiltro) list = list.filter(m => m.rubro_id === rubroFiltro)
    if (stockFiltro === 'con_stock') list = list.filter(m => m.stock_actual > 0)
    if (stockFiltro === 'sin_stock') list = list.filter(m => m.stock_actual <= 0)
    if (stockFiltro === 'stock_bajo') list = list.filter(m => m.stock_minimo > 0 && m.stock_actual > 0 && m.stock_actual <= m.stock_minimo)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(m =>
        m.nombre.toLowerCase().includes(q)
        || (m.proveedores?.nombre?.toLowerCase().includes(q) ?? false)
      )
    }
    return list
  }, [materiales, rubroFiltro, stockFiltro, busqueda])

  const grouped = useMemo(() => {
    const map = new Map<number, { rubro: StockRubro; items: StockMaterial[] }>()
    for (const m of filtered) {
      if (!map.has(m.rubro_id)) {
        const rubro = (rubros as StockRubro[]).find(r => r.id === m.rubro_id)
        if (rubro) map.set(m.rubro_id, { rubro, items: [] })
      }
      map.get(m.rubro_id)?.items.push(m)
    }
    return [...map.values()].sort((a, b) => a.rubro.orden - b.rubro.orden)
  }, [filtered, rubros])

  // Stats
  const totalItems = filtered.length
  const stockBajo = filtered.filter(m => m.stock_actual > 0 && m.stock_actual <= m.stock_minimo).length
  const sinStock = filtered.filter(m => m.stock_actual <= 0).length

  // Crear material
  function handleCreateMat(data: MaterialForm) {
    if (!data.rubro_id) { toast('Seleccioná un rubro', 'err'); return }
    const nombre = data.nombre.trim()
    if (!nombre) { toast('Ingresá un nombre', 'err'); return }
    const stockMinimo = Number(data.stock_minimo)
    const precioRef = Number(data.precio_ref)
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) { toast('Stock mínimo inválido', 'err'); return }
    if (!Number.isFinite(precioRef) || precioRef < 0) { toast('Precio inválido', 'err'); return }
    createMat({ ...data, nombre, rubro_id: Number(data.rubro_id), stock_minimo: stockMinimo, precio_ref: precioRef, proveedor_id: data.proveedor_id ? Number(data.proveedor_id) : null }, {
      onSuccess: () => { toast('Material creado', 'ok'); setModalNuevo(false) },
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'err'),
    })
  }

  // Entrada/salida de stock
  function abrirEntrada(m: StockMaterial) {
    formEntrada.reset({ cantidad: 0, tipo: 'entrada', motivo: 'compra', obs: '' })
    setModalEntrada(m)
  }

  function handleMovimiento(data: MovimientoForm) {
    if (!modalEntrada) return
    const cantidad = Number(data.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) { toast('Cantidad debe ser mayor a 0', 'err'); return }
    if (data.tipo === 'salida' && cantidad > modalEntrada.stock_actual) {
      toast(`No hay stock suficiente (disponible: ${modalEntrada.stock_actual})`, 'err')
      return
    }
    createMov({
      material_id: modalEntrada.id,
      tipo: data.tipo,
      cantidad,
      motivo: data.motivo,
      obs: data.obs || '',
    }, {
      onSuccess: () => { toast('Movimiento registrado', 'ok'); setModalEntrada(null) },
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'err'),
    })
  }

  // Editar material
  function abrirEditar(m: StockMaterial) {
    formEditar.reset({ nombre: m.nombre, unidad: m.unidad, stock_minimo: m.stock_minimo, precio_ref: m.precio_ref, rubro_id: m.rubro_id, proveedor_id: m.proveedor_id ? String(m.proveedor_id) : '' })
    setModalEditar(m)
  }

  function handleUpdate(data: MaterialForm) {
    if (!modalEditar) return
    if (!data.rubro_id) { toast('Seleccioná un rubro', 'err'); return }
    const nombre = data.nombre.trim()
    if (!nombre) { toast('Ingresá un nombre', 'err'); return }
    const stockMinimo = Number(data.stock_minimo)
    const precioRef = Number(data.precio_ref)
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) { toast('Stock mínimo inválido', 'err'); return }
    if (!Number.isFinite(precioRef) || precioRef < 0) { toast('Precio inválido', 'err'); return }
    updateMat({ id: modalEditar.id, dto: { ...data, nombre, rubro_id: Number(data.rubro_id), stock_minimo: stockMinimo, precio_ref: precioRef, proveedor_id: data.proveedor_id ? Number(data.proveedor_id) : null } }, {
      onSuccess: () => { toast('Actualizado', 'ok'); setModalEditar(null) },
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'err'),
    })
  }

  function handleDelete() {
    if (!modalEliminar) return
    const id = modalEliminar.id
    deleteMat(id, {
      onSuccess: () => { toast('Eliminado', 'ok'); setModalEliminar(null) },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : ''
        if (/foreign key|referenc|violates/i.test(msg)) {
          toast('No se puede eliminar: el material tiene movimientos registrados', 'err')
        } else {
          toast(msg || 'Error', 'err')
        }
      },
    })
  }

  function handleCreateRubro(data: RubroForm) {
    const nombre = data.nombre.trim()
    if (!nombre) { toast('Ingresá un nombre', 'err'); return }
    createRubro({ nombre, icono: data.icono.trim() }, {
      onSuccess: () => { toast('Rubro creado', 'ok'); setModalNuevoRubro(false) },
      onError: (e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'err'),
    })
  }

  // ── Exportar Excel ──
  const importRef = useRef<HTMLInputElement>(null)

  function exportarExcel() {
    const rows: (string | number)[][] = [
      ['Rubro', 'Material', 'Unidad', 'Stock Actual', 'Stock Mínimo', 'Precio Ref.', 'Proveedor'],
    ]
    for (const { rubro, items } of grouped) {
      for (const m of items) {
        rows.push([
          rubro.nombre,
          m.nombre,
          m.unidad,
          m.stock_actual,
          m.stock_minimo,
          m.precio_ref,
          m.proveedores?.nombre ?? '',
        ])
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 22 }, { wch: 35 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    XLSX.writeFile(wb, `Stock_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast('Excel exportado', 'ok')
  }

  // ── Importar Excel (ajuste masivo de stock) ──
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

  async function importarExcel(file: File) {
    let rows: Record<string, unknown>[]
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]!]!
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    } catch {
      toast('Error al leer el archivo', 'err')
      return
    }

    // Índice por (rubro, nombre) normalizado → lookup O(1) y desambiguación de duplicados entre rubros
    const rubroById = new Map((rubros as StockRubro[]).map(r => [r.id, r.nombre]))
    const idx = new Map<string, StockMaterial>()
    const nombresAmbiguos = new Set<string>()
    for (const m of materiales as StockMaterial[]) {
      const rubroNom = rubroById.get(m.rubro_id) ?? ''
      idx.set(`${norm(rubroNom)}::${norm(m.nombre)}`, m)
      // Registrar si el nombre solo aparece en más de un rubro
      const soloNombreKey = `__sn__${norm(m.nombre)}`
      if (idx.has(soloNombreKey)) nombresAmbiguos.add(norm(m.nombre))
      else idx.set(soloNombreKey, m)
    }

    const tareas: Promise<void>[] = []
    let omitidos = 0
    let ambiguos = 0
    let noEncontrados = 0

    for (const row of rows) {
      const nombreRaw = row['Material'] ?? row['material'] ?? row['nombre']
      const rubroRaw = row['Rubro'] ?? row['rubro']
      const stockNuevo = Number(row['Stock Actual'] ?? row['stock_actual'] ?? row['stock'])
      if (!nombreRaw || !Number.isFinite(stockNuevo)) { omitidos++; continue }

      const nombreN = norm(String(nombreRaw))
      let mat: StockMaterial | undefined

      if (rubroRaw) {
        mat = idx.get(`${norm(String(rubroRaw))}::${nombreN}`)
      } else if (nombresAmbiguos.has(nombreN)) {
        // Sin rubro en la fila y el nombre es ambiguo entre varios rubros
        ambiguos++
        continue
      } else {
        mat = idx.get(`__sn__${nombreN}`)
      }

      if (!mat) { noEncontrados++; continue }

      tareas.push(
        createMovAsync({
          material_id: mat.id,
          tipo: 'ajuste',
          cantidad: stockNuevo,
          motivo: 'ajuste_inventario',
          obs: 'Importación masiva desde Excel',
        }).then(() => undefined)
      )
    }

    const resultados = await Promise.allSettled(tareas)
    const actualizados = resultados.filter(r => r.status === 'fulfilled').length
    const fallidos = resultados.length - actualizados
    const errores = fallidos + ambiguos + noEncontrados

    const partes: string[] = [`${actualizados} actualizados`]
    if (fallidos) partes.push(`${fallidos} con error`)
    if (noEncontrados) partes.push(`${noEncontrados} no encontrados`)
    if (ambiguos) partes.push(`${ambiguos} ambiguos (agregá columna "Rubro")`)
    if (omitidos) partes.push(`${omitidos} omitidos`)

    toast(`Importación: ${partes.join(', ')}`, actualizados > 0 && errores === 0 ? 'ok' : actualizados > 0 ? 'warn' : 'err')
  }

  return (
    <>
      {/* Filtros + stats */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <select value={rubroFiltro} onChange={e => setRubroFiltro(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todos los rubros</option>
            {(rubros as StockRubro[]).map(r => (
              <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>
            ))}
          </select>
          <select value={stockFiltro} onChange={e => setStockFiltro(e.target.value as typeof stockFiltro)}
            className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
            <option value="">Todo el stock</option>
            <option value="con_stock">Con stock</option>
            <option value="sin_stock">Sin stock</option>
            <option value="stock_bajo">Stock bajo</option>
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-[350px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gris-dark text-sm">🔍</span>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar material o proveedor..."
              className="w-full pl-9 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white focus:border-naranja" />
            {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gris-dark hover:text-carbon text-sm">✕</button>}
          </div>
          <div className="flex gap-2 text-xs">
            <span className="bg-azul-light text-azul px-2 py-1 rounded font-bold">{totalItems} materiales</span>
            {stockBajo > 0 && <span className="bg-amarillo-light text-[#7A5500] px-2 py-1 rounded font-bold">{stockBajo} stock bajo</span>}
            {sinStock > 0 && <span className="bg-rojo-light text-rojo px-2 py-1 rounded font-bold">{sinStock} sin stock</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarExcel}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-verde-light text-verde border border-verde/30 text-xs font-bold hover:bg-verde hover:text-white transition-colors disabled:opacity-40"
          >
            📊 Exportar Excel
          </button>
          {puedeAjustar && (
            <>
              <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { if (e.target.files?.[0]) importarExcel(e.target.files[0]); e.target.value = '' }} />
              <button
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amarillo-light text-[#7A5500] border border-[#E0A800]/30 text-xs font-bold hover:bg-[#E0A800] hover:text-white transition-colors"
              >
                📥 Importar Excel
              </button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => { formRubro.reset({ nombre: '', icono: '' }); setModalNuevoRubro(true) }}>+ Rubro</Button>
          <Button variant="primary" size="sm" onClick={() => { formNuevo.reset({ rubro_id: '', nombre: '', unidad: 'unid', stock_minimo: 0, precio_ref: 0, proveedor_id: '' }); setModalNuevo(true) }}>+ Material</Button>
        </div>
      </div>

      {/* Tabla agrupada por rubro */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 flex items-center justify-center gap-3 text-gris-dark">
          <span className="w-5 h-5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
          Cargando stock...
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          {busqueda ? 'Sin resultados para esa búsqueda.' : 'Sin materiales en el catálogo.'}
        </div>
      ) : grouped.map(({ rubro, items }) => (
        <div key={rubro.id} className="bg-white rounded-card shadow-card overflow-hidden">
          {/* Header del rubro */}
          <div className="bg-azul px-4 py-2.5 flex items-center gap-2">
            <span className="text-lg">{rubro.icono}</span>
            <span className="text-white font-bold text-sm uppercase tracking-wide">{rubro.nombre}</span>
            <span className="text-white/50 text-xs ml-2">{items.length} items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  {['Material', 'Proveedor', 'Unidad', 'Stock', 'Mínimo', 'Precio ref.', ''].map((h, i) => (
                    <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-4 py-2 uppercase tracking-wide ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'} last:text-right`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const bajo = m.stock_minimo > 0 && m.stock_actual <= m.stock_minimo
                  const cero = m.stock_actual <= 0
                  return (
                    <tr key={m.id} className="border-b border-gris last:border-0 hover:bg-gris/30 transition-colors">
                      <td className="px-4 py-2.5 text-sm font-medium text-carbon">{m.nombre}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark">{m.proveedores?.nombre ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gris-dark font-mono">{UNIDADES.find(u => u.value === m.unidad)?.label ?? m.unidad}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono font-bold text-sm ${cero ? 'text-rojo' : bajo ? 'text-[#7A5500]' : 'text-verde'}`}>
                          {m.stock_actual}
                        </span>
                        {bajo && !cero && <span className="ml-1.5 text-[9px] font-bold bg-amarillo-light text-[#7A5500] px-1.5 py-0.5 rounded">BAJO</span>}
                        {cero && <span className="ml-1.5 text-[9px] font-bold bg-rojo-light text-rojo px-1.5 py-0.5 rounded">SIN STOCK</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gris-dark">{m.stock_minimo || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gris-dark">{m.precio_ref > 0 ? fmtM(m.precio_ref) : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => abrirEntrada(m)} className="text-[10px] font-bold px-2 py-1 rounded bg-verde-light text-verde hover:opacity-80">+ Entrada</button>
                          <button onClick={() => setModalHistorial(m)} className="text-[10px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:opacity-80">Historial</button>
                          <button onClick={() => abrirEditar(m)} aria-label={`Editar ${m.nombre}`} title="Editar" className="text-xs px-1.5 py-1 rounded hover:bg-gris transition-colors">✏️</button>
                          <button onClick={() => setModalEliminar(m)} aria-label={`Eliminar ${m.nombre}`} title="Eliminar" className="text-xs px-1.5 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ── Modal nuevo material ── */}
      <Modal open={modalNuevo} onClose={() => setModalNuevo(false)} title="➕ NUEVO MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button><Button variant="primary" onClick={formNuevo.handleSubmit(handleCreateMat)}>Crear</Button></>}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Rubro</label>
            <select {...formNuevo.register('rubro_id')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
              <option value="">Seleccionar rubro...</option>
              {(rubros as StockRubro[]).map(r => <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>)}
            </select>
          </div>
          <Input label="Nombre del material" {...formNuevo.register('nombre')} />
          <Combobox label="Proveedor de referencia" placeholder="Buscar proveedor..." options={provOptions} value={formNuevo.watch('proveedor_id')} onChange={v => formNuevo.setValue('proveedor_id', v)} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Unidad</label>
              <select {...formNuevo.register('unidad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <Input label="Stock mínimo" type="number" step="1" {...formNuevo.register('stock_minimo')} />
            <Input label="Precio ref. ($)" type="number" step="1" {...formNuevo.register('precio_ref')} />
          </div>
        </div>
      </Modal>

      {/* ── Modal entrada/salida ── */}
      <Modal open={!!modalEntrada} onClose={() => setModalEntrada(null)} title="📦 MOVIMIENTO DE STOCK"
        footer={<><Button variant="secondary" onClick={() => setModalEntrada(null)}>Cancelar</Button><Button variant="primary" onClick={formEntrada.handleSubmit(handleMovimiento)}>Registrar</Button></>}>
        {modalEntrada && (
          <div className="flex flex-col gap-3">
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-sm text-azul">{modalEntrada.nombre}</div>
              <div className="text-xs text-gris-dark">Stock actual: <strong className="font-mono">{modalEntrada.stock_actual}</strong> {UNIDADES.find(u => u.value === modalEntrada.unidad)?.label ?? modalEntrada.unidad}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Tipo</label>
                <select {...formEntrada.register('tipo')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="entrada">+ Entrada</option>
                  <option value="salida">- Salida</option>
                  {puedeAjustar && <option value="ajuste">↔ Ajuste (setear stock)</option>}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Motivo</label>
                <select {...formEntrada.register('motivo')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                  <option value="compra">Compra</option>
                  <option value="despacho_obra">Despacho a obra</option>
                  <option value="devolucion">Devolución</option>
                  <option value="ajuste_inventario">Ajuste inventario</option>
                </select>
              </div>
            </div>
            <Input label="Cantidad" type="number" step="0.001" min="0" {...formEntrada.register('cantidad')} />
            <Input label="Observaciones" placeholder="Detalle opcional..." {...formEntrada.register('obs')} />
          </div>
        )}
      </Modal>

      {/* ── Modal historial ── */}
      <HistorialModal material={modalHistorial} onClose={() => setModalHistorial(null)} perfiles={perfiles} />

      {/* ── Modal editar material ── */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title="✏️ EDITAR MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setModalEditar(null)}>Cancelar</Button><Button variant="primary" onClick={formEditar.handleSubmit(handleUpdate)}>Guardar</Button></>}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Rubro</label>
            <select {...formEditar.register('rubro_id')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
              {(rubros as StockRubro[]).map(r => <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>)}
            </select>
          </div>
          <Input label="Nombre" {...formEditar.register('nombre')} />
          <Combobox label="Proveedor de referencia" placeholder="Buscar proveedor..." options={provOptions} value={formEditar.watch('proveedor_id')} onChange={v => formEditar.setValue('proveedor_id', v)} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1 block">Unidad</label>
              <select {...formEditar.register('unidad')} className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none bg-white font-semibold focus:border-naranja">
                {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <Input label="Stock mínimo" type="number" step="1" {...formEditar.register('stock_minimo')} />
            <Input label="Precio ref. ($)" type="number" step="1" {...formEditar.register('precio_ref')} />
          </div>
        </div>
      </Modal>

      {/* ── Modal confirmar eliminación ── */}
      <Modal open={!!modalEliminar} onClose={() => setModalEliminar(null)} title="🗑️ ELIMINAR MATERIAL"
        footer={<><Button variant="secondary" onClick={() => setModalEliminar(null)}>Cancelar</Button><Button variant="danger" onClick={handleDelete}>Eliminar</Button></>}>
        {modalEliminar && (
          <p className="text-sm text-carbon">
            ¿Eliminar <strong>{modalEliminar.nombre}</strong> del catálogo? Esta acción no se puede deshacer.
          </p>
        )}
      </Modal>

      {/* ── Modal nuevo rubro ── */}
      <Modal open={modalNuevoRubro} onClose={() => setModalNuevoRubro(false)} title="➕ NUEVO RUBRO"
        footer={<><Button variant="secondary" onClick={() => setModalNuevoRubro(false)}>Cancelar</Button><Button variant="primary" onClick={formRubro.handleSubmit(handleCreateRubro)}>Crear</Button></>}>
        <div className="flex flex-col gap-3">
          <Input label="Nombre" {...formRubro.register('nombre')} />
          <Input label="Ícono (emoji)" placeholder="🔧" {...formRubro.register('icono')} />
        </div>
      </Modal>
    </>
  )
}

// ── Historial de movimientos de un material ──
function HistorialModal({ material, onClose, perfiles }: { material: StockMaterial | null; onClose: () => void; perfiles: Map<string, string> }) {
  const { data: movimientos = [] } = useStockMovimientos(material?.id)

  if (!material) return null

  return (
    <Modal open={true} onClose={onClose} title={`📋 HISTORIAL — ${material.nombre}`} width="max-w-2xl">
      <div className="max-h-[400px] overflow-y-auto">
        {(movimientos as StockMovimiento[]).length === 0 ? (
          <p className="text-center text-gris-dark text-sm italic py-4">Sin movimientos registrados.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Fecha', 'Tipo', 'Cantidad', 'Motivo', 'Usuario'].map((h, i) => (
                  <th key={i} className="bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 text-left uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(movimientos as StockMovimiento[]).map(m => {
                const tipoCfg = TIPO_CFG[m.tipo] ?? { label: m.tipo, color: '' }
                return (
                  <tr key={m.id} className="border-b border-gris last:border-0">
                    <td className="px-3 py-2 text-sm font-mono text-gris-dark">{fmtF(m.fecha)}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-bold ${tipoCfg.color}`}>{tipoCfg.label}</span></td>
                    <td className="px-3 py-2 font-mono font-bold text-sm">{m.cantidad}</td>
                    <td className="px-3 py-2 text-xs text-gris-dark">{MOTIVO_LABEL[m.motivo] ?? m.motivo}{m.obra_cod && <span className="ml-1 font-mono text-azul">({m.obra_cod})</span>}{m.obs && <div className="text-[11px] italic mt-0.5">{m.obs}</div>}</td>
                    <td className="px-3 py-2 text-xs text-gris-dark">{m.created_by ? perfiles.get(m.created_by) ?? '…' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
