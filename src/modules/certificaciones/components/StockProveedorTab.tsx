'use client'

import { useMemo, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import {
  useStockProveedor,
  useMovimientosItemProveedor,
  useRemitosRetiroProv,
  useCrearRemitoRetiro,
  uploadComprobanteRetiro,
  fetchRemitoComprobanteUrl,
  type StockProveedorRow,
} from '../hooks/useStockProveedor'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { useProveedores } from '../hooks/useProveedores'
import { toISO } from '@/lib/utils/dates'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'

const fmtM   = (n: number | null) => n == null ? '—' : '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtFecha = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

interface FiltrosState {
  proveedor_id: string
  obra_cod:     string
  incluir_retirados: boolean
}

export function StockProveedorTab() {
  const toast = useToast()
  const { puedeCrear } = usePermisos('certificaciones')

  const [filtros, setFiltros] = useState<FiltrosState>({ proveedor_id: '', obra_cod: '', incluir_retirados: false })
  const [proveedorActivo, setProveedorActivo] = useState<number | null>(null)
  const [modalRetiro,  setModalRetiro] = useState<{ proveedor_id: number; nombre: string; obra_cod: string } | null>(null)
  const [detalleItem,  setDetalleItem] = useState<StockProveedorRow | null>(null)

  const { data: proveedores = [] } = useProveedores()
  const { data: obras = [] } = useObras()
  const { data: stock = [], isLoading } = useStockProveedor({
    proveedor_id: filtros.proveedor_id ? Number(filtros.proveedor_id) : undefined,
    obra_cod:     filtros.obra_cod || undefined,
    incluir_retirados: filtros.incluir_retirados,
  })

  // Agrupar por proveedor para el "summary card" de cada uno.
  const porProveedor = useMemo(() => {
    const map = new Map<number, { nombre: string; items: StockProveedorRow[]; total_pendiente_arsAprox: number; obras: Set<string> }>()
    for (const row of stock as StockProveedorRow[]) {
      if (row.cantidad_pendiente <= 0 && !filtros.incluir_retirados) continue
      const key = row.proveedor_id
      if (!map.has(key)) {
        map.set(key, { nombre: row.proveedor_nombre ?? `Proveedor #${row.proveedor_id}`, items: [], total_pendiente_arsAprox: 0, obras: new Set() })
      }
      const grp = map.get(key)!
      grp.items.push(row)
      if (row.precio_unit != null) {
        grp.total_pendiente_arsAprox += row.cantidad_pendiente * Number(row.precio_unit)
      }
      if (row.obra_cod) grp.obras.add(row.obra_cod)
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }))
  }, [stock, filtros.incluir_retirados])

  const provOptions = [
    { value: '', label: 'Todos los proveedores' },
    ...(proveedores as any[]).filter(p => p.activo).map(p => ({ value: String(p.id), label: p.nombre })),
  ]
  const obraOptions = [
    { value: '', label: 'Todas las obras' },
    ...(obras as any[]).map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` })),
  ]

  return (
    <div className="flex flex-col gap-4 no-spinner">

      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <Combobox
            label="Proveedor"
            placeholder="Filtrar..."
            options={provOptions}
            value={filtros.proveedor_id}
            onChange={(v) => setFiltros(f => ({ ...f, proveedor_id: v }))}
          />
        </div>
        <div className="min-w-[260px]">
          <Combobox
            label="Obra"
            placeholder="Filtrar..."
            options={obraOptions}
            value={filtros.obra_cod}
            onChange={(v) => setFiltros(f => ({ ...f, obra_cod: v }))}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gris-dark cursor-pointer">
          <input
            type="checkbox"
            checked={filtros.incluir_retirados}
            onChange={(e) => setFiltros(f => ({ ...f, incluir_retirados: e.target.checked }))}
          />
          Incluir items ya retirados (histórico)
        </label>
      </div>

      {/* Vista lista */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-6 text-sm text-gris-dark">Cargando…</div>
      ) : porProveedor.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
          No hay materiales pendientes de retiro en ningún proveedor.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {porProveedor.map(grp => (
            <div key={grp.id} className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-naranja">
              <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-gris">
                <div>
                  <div className="font-display text-lg text-azul">{grp.nombre}</div>
                  <div className="text-xs text-gris-dark mt-0.5">
                    {grp.items.length} item{grp.items.length !== 1 ? 's' : ''}
                    {grp.obras.size > 0 && <> · {grp.obras.size} obra{grp.obras.size !== 1 ? 's' : ''}</>}
                    {grp.total_pendiente_arsAprox > 0 && <> · valor pendiente aprox. <strong>{fmtM(grp.total_pendiente_arsAprox)}</strong></>}
                  </div>
                </div>
                <div className="text-[11px] text-gris-mid italic hidden md:block">Click una fila para ver historial. Botón "Retirar" para descargar.</div>
              </div>

              {/* Tabla — desktop/tablet */}
              <div className="hidden md:block overflow-x-auto">
                <table className="hidden md:table w-full border-collapse min-w-[820px]">
                  <thead>
                    <tr>
                      {['Solicitud', 'Obra', 'Descripción', 'Cantidad', 'Pendiente', 'Retirada', 'Precio unit.', 'Estado', ''].map(h => (
                        <th key={h} className="bg-gris/40 text-xs font-bold px-3 py-2 text-left uppercase tracking-wide text-gris-dark">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grp.items.map(item => (
                      <tr
                        key={item.item_id}
                        className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                        onClick={() => setDetalleItem(item)}
                      >
                        <td className="px-3 py-2 font-mono text-xs">#{item.solicitud_id}</td>
                        <td className="px-3 py-2 text-xs text-gris-dark">{item.obra_cod || '—'}</td>
                        <td className="px-3 py-2 text-sm">{item.descripcion}</td>
                        <td className="px-3 py-2 font-mono text-xs">{fmtNum(item.cantidad_total)} {item.unidad}</td>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-azul">{fmtNum(item.cantidad_pendiente)} {item.unidad}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gris-dark">{fmtNum(item.cantidad_retirada)} {item.unidad}</td>
                        <td className="px-3 py-2 font-mono text-xs">{fmtM(item.precio_unit)}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={item.estado === 'retirado' ? 'activo' : 'pendiente'}
                            label={item.estado === 'retirado' ? 'Retirado' : 'En proveedor'}
                          />
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {item.estado === 'en_proveedor' && puedeCrear && (
                            <Button
                              size="sm"
                              onClick={() => setModalRetiro({ proveedor_id: item.proveedor_id, nombre: grp.nombre, obra_cod: item.obra_cod ?? '' })}
                            >📤 Retirar</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards — mobile */}
              <div className="flex flex-col gap-2 p-3 md:hidden">
                {grp.items.map(item => (
                  <div
                    key={item.item_id}
                    className="bg-white rounded-card shadow-sm border border-gris-mid p-3 active:bg-gris/40 transition-colors"
                    onClick={() => setDetalleItem(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-carbon truncate">{item.descripcion}</div>
                        <div className="text-[11px] text-gris-dark mt-0.5">
                          Sol. <span className="font-mono">#{item.solicitud_id}</span>
                          {item.obra_cod ? <> · Obra <span className="font-mono">{item.obra_cod}</span></> : null}
                        </div>
                      </div>
                      <Badge
                        variant={item.estado === 'retirado' ? 'activo' : 'pendiente'}
                        label={item.estado === 'retirado' ? 'Retirado' : 'En proveedor'}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                      <div>
                        <div className="text-gris-mid uppercase tracking-wide">Total</div>
                        <div className="font-mono font-bold">{fmtNum(item.cantidad_total)} {item.unidad}</div>
                      </div>
                      <div>
                        <div className="text-gris-mid uppercase tracking-wide">Pendiente</div>
                        <div className="font-mono font-bold text-azul">{fmtNum(item.cantidad_pendiente)} {item.unidad}</div>
                      </div>
                      <div>
                        <div className="text-gris-mid uppercase tracking-wide">Retirada</div>
                        <div className="font-mono">{fmtNum(item.cantidad_retirada)} {item.unidad}</div>
                      </div>
                    </div>
                    {item.precio_unit != null && (
                      <div className="mt-2 text-[11px] text-gris-dark">
                        Precio unit. <span className="font-mono font-bold">{fmtM(item.precio_unit)}</span>
                      </div>
                    )}
                    {item.estado === 'en_proveedor' && puedeCrear && (
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => setModalRetiro({ proveedor_id: item.proveedor_id, nombre: grp.nombre, obra_cod: item.obra_cod ?? '' })}
                        >📤 Retirar</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalRetiro && (
        <ModalRetiro
          proveedorId={modalRetiro.proveedor_id}
          proveedorNombre={modalRetiro.nombre}
          obraCodSugerida={modalRetiro.obra_cod}
          stockDelProveedor={(stock as StockProveedorRow[]).filter(s => s.proveedor_id === modalRetiro.proveedor_id && s.estado === 'en_proveedor' && s.cantidad_pendiente > 0)}
          obras={obras as any[]}
          onClose={() => setModalRetiro(null)}
        />
      )}

      {detalleItem && (
        <ModalDetalleItem
          item={detalleItem}
          onClose={() => setDetalleItem(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Modal Retiro: arma el remito con N items (cantidades parciales OK).
// ────────────────────────────────────────────────────────────────────────
interface ModalRetiroProps {
  proveedorId:     number
  proveedorNombre: string
  obraCodSugerida: string
  stockDelProveedor: StockProveedorRow[]
  obras: any[]
  onClose: () => void
}

interface FormRetiro {
  obra_cod: string
  fecha:    string
  obs:      string
  items:    Array<{ item_id: number; cantidad: number; descripcion: string; unidad: string; pendiente: number }>
}

function ModalRetiro({ proveedorId, proveedorNombre, obraCodSugerida, stockDelProveedor, obras, onClose }: ModalRetiroProps) {
  const toast = useToast()
  const { mutateAsync: crear, isPending } = useCrearRemitoRetiro()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  // Por defecto, todos los items del proveedor con la obra sugerida se incluyen
  // con cantidad = pendiente. Después el usuario puede tildar/destildar y editar.
  const itemsCompletos = useMemo(() =>
    stockDelProveedor.map(s => ({
      item_id:     s.item_id,
      cantidad:    s.cantidad_pendiente,
      descripcion: s.descripcion,
      unidad:      s.unidad,
      pendiente:   s.cantidad_pendiente,
      obra_cod:    s.obra_cod ?? '',
    })),
  [stockDelProveedor])

  const [seleccionados, setSeleccionados] = useState<Record<number, { incluido: boolean; cantidad: number }>>(() => {
    const init: Record<number, { incluido: boolean; cantidad: number }> = {}
    for (const it of itemsCompletos) {
      init[it.item_id] = { incluido: it.obra_cod === obraCodSugerida, cantidad: it.cantidad }
    }
    return init
  })

  const form = useForm<{ obra_cod: string; fecha: string; obs: string }>({
    defaultValues: {
      obra_cod: obraCodSugerida || '',
      fecha:    toISO(new Date()),
      obs:      '',
    },
  })

  const obraSeleccionada = form.watch('obra_cod')

  const obraOptions = (obras as any[]).map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` }))

  // Filtrar items mostrados: solo los de la obra seleccionada (para evitar
  // mezclar materiales de obras distintas en un mismo remito).
  const itemsDeObra = itemsCompletos.filter(it => it.obra_cod === obraSeleccionada)

  async function handleSubmit(data: { obra_cod: string; fecha: string; obs: string }) {
    if (!data.obra_cod) { toast('Elegí una obra', 'err'); return }
    const items = itemsDeObra
      .filter(it => seleccionados[it.item_id]?.incluido && (seleccionados[it.item_id]?.cantidad ?? 0) > 0)
      .map(it => ({ item_id: it.item_id, cantidad: Number(seleccionados[it.item_id]!.cantidad) }))

    if (items.length === 0) { toast('Marcá al menos un item con cantidad > 0', 'err'); return }

    // Validar cantidades vs pendiente
    for (const it of items) {
      const ref = itemsDeObra.find(x => x.item_id === it.item_id)!
      if (it.cantidad > ref.pendiente) {
        toast(`La cantidad para "${ref.descripcion}" supera el pendiente (${ref.pendiente})`, 'err')
        return
      }
    }

    try {
      let comprobante_path: string | null = null
      if (archivo) {
        setSubiendo(true)
        comprobante_path = await uploadComprobanteRetiro(archivo)
      }
      await crear({
        proveedor_id: proveedorId,
        obra_cod:     data.obra_cod,
        fecha:        data.fecha,
        comprobante_path,
        obs:          data.obs || null,
        items,
      })
      toast('✓ Remito de retiro creado', 'ok')
      onClose()
    } catch (e: any) {
      const code = e?.body?.error
      if (code === 'COMPROBANTE_DUPLICADO') toast('El comprobante ya está cargado en otro remito', 'err')
      else if (code === 'CANTIDAD_EXCEDE_PENDIENTE') toast('Una cantidad supera el pendiente — revisá', 'err')
      else if (code === 'ITEM_PROVEEDOR_DISTINTO') toast('Hay un item de otro proveedor — revisá', 'err')
      else toast(e?.message || 'Error al crear el remito', 'err')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`📤 RETIRAR DE ${proveedorNombre.toUpperCase()}`}
      width="max-w-3xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={isPending || subiendo} onClick={form.handleSubmit(handleSubmit)}>
          {subiendo ? '⬆ Subiendo…' : '✓ Crear remito'}
        </Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <div className="bg-azul-light rounded-xl px-4 py-3 text-xs">
          Estás creando un remito de retiro. Al guardar: descuenta del stock en proveedor y suma a "materiales a cuenta cliente" (facturable).
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Combobox
            label="Obra (destino)"
            placeholder="Elegir..."
            options={obraOptions}
            value={obraSeleccionada}
            onChange={(v) => form.setValue('obra_cod', v)}
          />
          <Input label="Fecha del remito" type="date" {...form.register('fecha')} />
        </div>

        {/* Items */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gris-dark mb-2">
            Items a retirar para esta obra ({itemsDeObra.length})
          </div>
          {itemsDeObra.length === 0 ? (
            <div className="text-xs text-gris-dark italic px-3 py-2">
              {obraSeleccionada
                ? 'Este proveedor no tiene materiales pendientes para la obra seleccionada.'
                : 'Elegí una obra para ver los materiales disponibles.'}
            </div>
          ) : (
            <div className="border border-gris rounded-lg divide-y divide-gris">
              {itemsDeObra.map(it => {
                const sel = seleccionados[it.item_id]!
                return (
                  <div key={it.item_id} className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-gris/30">
                    <input
                      type="checkbox"
                      checked={sel.incluido}
                      onChange={(e) => setSeleccionados(s => ({ ...s, [it.item_id]: { ...s[it.item_id]!, incluido: e.target.checked } }))}
                      className="w-5 h-5 shrink-0 accent-naranja"
                    />
                    {/* En mobile la descripción toma el ancho completo (arriba) y
                        cantidad+unidad quedan en la fila de abajo — antes quedaban
                        ~90px para el nombre y no se distinguia el material. */}
                    <div className="basis-[calc(100%-2rem)] sm:basis-auto sm:flex-1 min-w-0">
                      <div className="text-sm font-bold text-carbon truncate">{it.descripcion}</div>
                      <div className="text-[11px] text-gris-dark">Pendiente: <span className="font-mono font-bold">{fmtNum(it.pendiente)} {it.unidad}</span></div>
                    </div>
                    <div className="w-32 ml-auto sm:ml-0">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={it.pendiente}
                        disabled={!sel.incluido}
                        value={sel.cantidad}
                        onChange={(e) => setSeleccionados(s => ({ ...s, [it.item_id]: { ...s[it.item_id]!, cantidad: parseFloat(e.target.value) || 0 } }))}
                        className="w-full px-2 py-1 text-sm font-mono text-right border-[1.5px] border-gris-mid rounded outline-none focus:border-naranja disabled:opacity-50"
                      />
                    </div>
                    <span className="text-xs text-gris-dark w-10">{it.unidad}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Comprobante */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-gris-dark uppercase tracking-wider">Comprobante (foto/PDF, opcional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
          />
          {archivo && (
            <div className="text-xs text-gris-dark mt-1 flex items-center gap-2">
              <span>📎 {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setArchivo(null)} className="text-rojo hover:underline py-2 px-2 -my-2 min-h-[36px] inline-flex items-center">Quitar</button>
            </div>
          )}
          <p className="text-[11px] text-gris-mid italic">Foto del remito real del proveedor. Máx 10 MB.</p>
        </div>

        <Input label="Observaciones (opcional)" placeholder="Notas del retiro..." {...form.register('obs')} />
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Modal Detalle: muestra los movimientos de un item (entradas y salidas).
// ────────────────────────────────────────────────────────────────────────
function ModalDetalleItem({ item, onClose }: { item: StockProveedorRow; onClose: () => void }) {
  const toast = useToast()
  const { data: movs = [], isLoading } = useMovimientosItemProveedor(item.item_id)

  async function verRemito(remitoId: number) {
    await abrirAdjuntoFirmado(
      () => fetchRemitoComprobanteUrl(remitoId),
      () => toast('No hay comprobante en ese remito', 'err'),
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="📋 HISTORIAL DEL ITEM"
      width="max-w-2xl"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="bg-azul-light rounded-xl p-3">
          <div className="font-bold text-sm text-azul">{item.descripcion}</div>
          <div className="text-[11px] text-gris-dark mt-0.5">
            Solicitud #{item.solicitud_id} · Obra {item.obra_cod ?? '—'} · Proveedor {item.proveedor_nombre}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs">
            <div>Total: <strong className="font-mono">{fmtNum(item.cantidad_total)}</strong> {item.unidad}</div>
            <div>Pendiente: <strong className="font-mono text-azul">{fmtNum(item.cantidad_pendiente)}</strong></div>
            <div>Retirada: <strong className="font-mono">{fmtNum(item.cantidad_retirada)}</strong></div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-xs text-gris-dark">Cargando movimientos…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[520px]">
              <thead>
                <tr>
                  {['Fecha', 'Tipo', 'Cantidad', 'Motivo', 'Remito', ''].map(h => (
                    <th key={h} className="bg-gris/40 text-[11px] font-bold px-3 py-1.5 text-left uppercase tracking-wide text-gris-dark">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(movs as any[]).map(m => (
                  <tr key={m.id} className="border-b border-gris last:border-0">
                    <td className="px-3 py-1.5 text-xs font-mono">{fmtFecha(m.fecha)}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={m.tipo === 'entrada' ? 'activo' : 'inactivo'} label={m.tipo} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs font-bold">{fmtNum(Number(m.cantidad))}</td>
                    <td className="px-3 py-1.5 text-xs text-gris-dark capitalize">{m.motivo}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{m.remito?.numero ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      {m.remito_retiro_id && (
                        <button
                          onClick={() => verRemito(m.remito_retiro_id)}
                          className="text-sm font-bold px-3 py-2 min-h-[40px] min-w-[40px] rounded hover:bg-azul-light text-azul"
                        >👁</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
