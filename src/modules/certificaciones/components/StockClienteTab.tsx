'use client'

import { useMemo, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useStockCliente,
  useMovimientosStockCliente,
  useEntradaLoteStockCliente,
  useSalidaStockCliente,
} from '../hooks/useStockCliente'
import { useObras } from '@/modules/tarja/hooks/useObras'
import { toISO } from '@/lib/utils/dates'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { Obra, StockClienteRow, StockClienteMovimiento } from '@/types/domain.types'

const fmtNum   = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtFecha = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const MOTIVO_LABEL: Record<StockClienteMovimiento['motivo'], string> = {
  entrega_cliente: 'Entrega del cliente',
  consumo_obra:    'Consumo de la obra',
  ajuste:          'Ajuste',
  devolucion:      'Devolución',
}

// ── Form tipado de entrega en lote (RHF + zod, sin useForm<any>) ──
// `cantidad` viaja como string (los <input type="number"> de RHF devuelven
// string) y se convierte a number recién al armar el DTO — el zod valida que
// sea un número > 0. Espejo client-side del EntradaLoteStockClienteSchema
// del backend, con mensajes legibles en vez de códigos.
const itemLoteSchema = z.object({
  descripcion: z.string().trim().min(1, 'Falta la descripción'),
  unidad:      z.string(),
  cantidad:    z.string().refine(v => Number.isFinite(Number(v)) && Number(v) > 0, 'Cantidad inválida'),
})

const entradaLoteSchema = z.object({
  obra_cod: z.string().min(1, 'Elegí la obra'),
  fecha:    z.string(),
  obs:      z.string(),
  items:    z.array(itemLoteSchema).min(1, 'Cargá al menos un material'),
}).superRefine((val, ctx) => {
  const vistos = new Set<string>()
  val.items.forEach((it, i) => {
    const key = it.descripcion.trim().toLowerCase()
    if (!key) return
    if (vistos.has(key)) {
      ctx.addIssue({
        code:    'custom',
        message: 'Este material está repetido en el lote',
        path:    ['items', i, 'descripcion'],
      })
    }
    vistos.add(key)
  })
})

type EntradaLoteForm = z.infer<typeof entradaLoteSchema>

const ITEM_VACIO = { descripcion: '', unidad: 'unid', cantidad: '' }

interface SalidaForm {
  cantidad: number | string
  motivo:   'consumo_obra' | 'ajuste' | 'devolucion'
  fecha:    string
  obs:      string
}

// Material que el CLIENTE compró y entregó a CADINC para administrar en el
// depósito. Los consumos no facturan (el material ya es del cliente) — el
// anti-doble-cobro vive en la resolución "Cliente" de Solicitudes. Acá:
// entregas, salidas manuales y el saldo pendiente por obra.
export function StockClienteTab() {
  const toast = useToast()
  const { puedeCrear } = usePermisos('certificaciones')

  const [obraFiltro, setObraFiltro] = useState('')
  const [incluirAgotados, setIncluirAgotados] = useState(false)
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalSalida,  setModalSalida]  = useState<StockClienteRow | null>(null)
  const [modalMovs,    setModalMovs]    = useState<StockClienteRow | null>(null)

  const { data: obras = [] } = useObras()
  const { data: rows = [], isLoading } = useStockCliente({
    obra_cod: obraFiltro || undefined,
    incluir_agotados: incluirAgotados,
  })
  const { mutate: registrarLote,   isPending: entrando } = useEntradaLoteStockCliente()
  const { mutate: registrarSalida, isPending: saliendo } = useSalidaStockCliente()

  const formEntrada = useForm<EntradaLoteForm>({
    resolver: zodResolver(entradaLoteSchema),
    defaultValues: { obra_cod: '', fecha: toISO(new Date()), obs: '', items: [{ ...ITEM_VACIO }] },
  })
  const { fields: filas, append: agregarFila, remove: quitarFila } = useFieldArray({
    control: formEntrada.control,
    name:    'items',
  })
  const formSalida = useForm<SalidaForm>({
    defaultValues: { cantidad: '', motivo: 'consumo_obra', fecha: toISO(new Date()), obs: '' },
  })

  const obrasMap = useMemo(() => new Map((obras as Obra[]).map(o => [o.cod, o])), [obras])
  const obraOptions = [
    { value: '', label: 'Todas las obras' },
    ...(obras as Obra[]).filter(o => !o.archivada).map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}` })),
  ]

  // Agrupar por obra: la pregunta operativa es "¿qué le queda a la obra X?".
  const porObra = useMemo(() => {
    const map = new Map<string, StockClienteRow[]>()
    for (const r of rows as StockClienteRow[]) {
      if (!map.has(r.obra_cod)) map.set(r.obra_cod, [])
      map.get(r.obra_cod)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  function handleEntrada(data: EntradaLoteForm) {
    registrarLote({
      obra_cod: data.obra_cod,
      fecha:    data.fecha || undefined,
      obs:      data.obs.trim() || undefined,
      items: data.items.map(it => ({
        descripcion: it.descripcion.trim(),
        unidad:      it.unidad.trim() || 'unid',
        cantidad:    Number(it.cantidad),
      })),
    }, {
      onSuccess: (res) => {
        const n = res.items.length
        toast(n === 1 ? '✓ 1 material registrado' : `✓ ${n} materiales registrados`, 'ok')
        setModalEntrada(false)
      },
      onError: (e: Error) => {
        // El loop del backend es secuencial no-atómico: si falla a mitad,
        // el detail dice qué entró y qué no. Sacamos del form las filas YA
        // registradas (procesa en orden, son las primeras N) para que
        // reintentar no las sume por segunda vez; el modal queda abierto
        // solo con la fallida y las que no llegaron a procesarse.
        const body = (e as Error & { body?: { error?: string; detail?: { item_fallido?: string; registrados?: number; total?: number } } }).body
        if (body?.error === 'ENTRADA_LOTE_PARCIAL' && body.detail) {
          const d = body.detail
          const registrados = d.registrados ?? 0
          if (registrados > 0) {
            quitarFila(Array.from({ length: registrados }, (_, i) => i))
          }
          toast(`Se registraron ${d.registrados} de ${d.total} materiales. Quedaron en el form "${d.item_fallido}" y los no procesados — corregí y reintentá.`, 'err')
          return
        }
        if (body?.error === 'MATERIAL_DUPLICADO') {
          toast('Hay materiales repetidos en el lote', 'err')
          return
        }
        toast(e.message || 'Error al registrar la entrega', 'err')
      },
    })
  }

  function handleSalida(data: SalidaForm) {
    if (!modalSalida) return
    const cantidad = Number(data.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) { toast('Cantidad inválida', 'err'); return }
    if (cantidad > Number(modalSalida.saldo) + 0.001) {
      toast(`Saldo disponible: ${fmtNum(Number(modalSalida.saldo))} ${modalSalida.unidad}`, 'err')
      return
    }
    registrarSalida({
      item_id:  modalSalida.item_id,
      cantidad,
      motivo:   data.motivo,
      fecha:    data.fecha || undefined,
      obs:      data.obs || undefined,
    }, {
      onSuccess: () => { toast('Salida registrada', 'ok'); setModalSalida(null) },
      onError:   (e: Error) => toast(e.message || 'Error al registrar la salida', 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-4 no-spinner">

      {/* Filtros + acción */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[260px]">
          <Combobox
            label="Obra"
            placeholder="Filtrar..."
            options={obraOptions}
            value={obraFiltro}
            onChange={setObraFiltro}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gris-dark cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={incluirAgotados}
            onChange={e => setIncluirAgotados(e.target.checked)}
          />
          Incluir materiales agotados (histórico)
        </label>
        <div className="ml-auto">
          <Button
            variant="primary" size="sm"
            disabled={!puedeCrear}
            onClick={() => {
              formEntrada.reset({ obra_cod: obraFiltro || '', fecha: toISO(new Date()), obs: '', items: [{ ...ITEM_VACIO }] })
              setModalEntrada(true)
            }}
          >
            ➕ Registrar entrega del cliente
          </Button>
        </div>
      </div>

      {/* Lista agrupada por obra */}
      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-6 text-sm text-gris-dark">Cargando…</div>
      ) : porObra.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-6 text-sm text-gris-dark italic">
          {obraFiltro
            ? 'Esta obra no tiene material del cliente pendiente en depósito.'
            : 'No hay material de clientes en depósito. Registrá una entrega para empezar.'}
        </div>
      ) : (
        porObra.map(([cod, items]) => {
          const obra = obrasMap.get(cod)
          return (
            <div key={cod} className="bg-white rounded-card shadow-card overflow-hidden">
              <div className="px-4 py-3 bg-azul text-white flex items-center justify-between flex-wrap gap-2">
                <div className="font-bold text-sm">
                  🏗️ {cod}{obra ? ` — ${obra.nom}` : ''}
                </div>
                <div className="text-[11px] opacity-80">
                  {items.length} material{items.length !== 1 ? 'es' : ''} del cliente en depósito
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gris text-[11px] text-gris-dark uppercase tracking-wide">
                      <th className="text-left  px-4 py-2">Material</th>
                      <th className="text-right px-3 py-2">Entregado</th>
                      <th className="text-right px-3 py-2">Consumido</th>
                      <th className="text-right px-3 py-2">Saldo</th>
                      <th className="text-left  px-3 py-2">Últ. entrega</th>
                      <th className="text-left  px-3 py-2">Últ. consumo</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gris">
                    {items.map(r => (
                      <tr key={r.item_id} className={Number(r.saldo) <= 0 ? 'opacity-60' : ''}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-carbon">{r.descripcion}</div>
                          {r.obs && <div className="text-[11px] text-gris-dark">{r.obs}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtNum(Number(r.cantidad_entregada))} {r.unidad}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtNum(Number(r.cantidad_consumida))} {r.unidad}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${Number(r.saldo) > 0 ? 'text-verde' : 'text-gris-dark'}`}>
                          {fmtNum(Number(r.saldo))} {r.unidad}
                        </td>
                        <td className="px-3 py-2.5 text-[12px]">{fmtFecha(r.ultima_entrega)}</td>
                        <td className="px-3 py-2.5 text-[12px]">{fmtFecha(r.ultimo_consumo)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => setModalMovs(r)}
                              className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:text-azul"
                              title="Ver entregas y consumos"
                            >
                              🕑 Movs
                            </button>
                            <button
                              disabled={!puedeCrear || Number(r.saldo) <= 0}
                              onClick={() => {
                                formSalida.reset({ cantidad: '', motivo: 'consumo_obra', fecha: toISO(new Date()), obs: '' })
                                setModalSalida(r)
                              }}
                              className="text-[11px] font-bold px-2 py-1 rounded bg-naranja-light text-naranja hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Registrar salida manual (sin solicitud)"
                            >
                              − Salida
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      <p className="text-[11px] text-gris-mid italic px-1">
        Los pedidos de la obra que se cubren con este material se resuelven desde{' '}
        <b>Solicitudes</b> con el botón <b>Cliente</b> — descuentan el saldo y no
        generan deuda (el material ya lo pagó el cliente).
      </p>

      {/* ── Modal entrada (entrega del cliente, lote de materiales) ── */}
      <Modal
        open={modalEntrada}
        onClose={() => setModalEntrada(false)}
        title="➕ ENTREGA DEL CLIENTE"
        width="max-w-2xl"
        footer={<>
          <Button variant="secondary" onClick={() => setModalEntrada(false)}>Cancelar</Button>
          <Button variant="primary" loading={entrando} onClick={formEntrada.handleSubmit(handleEntrada)}>
            ✓ Registrar{filas.length > 1 ? ` (${filas.length} materiales)` : ''}
          </Button>
        </>}
      >
        <div className="flex flex-col gap-4">
          {/* Cabecera: aplica a todos los materiales del lote */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Combobox
                label="Obra (dueña del material)"
                placeholder="Buscar obra..."
                options={obraOptions.filter(o => o.value !== '')}
                value={formEntrada.watch('obra_cod')}
                onChange={v => formEntrada.setValue('obra_cod', v, { shouldValidate: formEntrada.formState.isSubmitted })}
              />
              {formEntrada.formState.errors.obra_cod && (
                <span className="text-xs text-rojo font-semibold">{formEntrada.formState.errors.obra_cod.message}</span>
              )}
            </div>
            <Input label="Fecha" type="date" {...formEntrada.register('fecha')} />
          </div>
          <Input
            label="Observaciones (opcional)"
            placeholder="Nº de factura / remito, transporte..."
            {...formEntrada.register('obs')}
          />

          {/* Filas dinámicas de materiales */}
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">Materiales entregados</div>

            {/* Header de columnas — solo desktop */}
            <div className="hidden sm:flex gap-2 mb-1 pr-10">
              <span className="flex-1 text-[10px] font-bold text-gris-dark uppercase tracking-wide">Material</span>
              <span className="w-24 text-[10px] font-bold text-gris-dark uppercase tracking-wide text-right">Cantidad</span>
              <span className="w-24 text-[10px] font-bold text-gris-dark uppercase tracking-wide">Unidad</span>
            </div>

            <div className="flex flex-col gap-2">
              {filas.map((fila, i) => (
                <div key={fila.id} className="flex flex-wrap sm:flex-nowrap gap-2 items-start">
                  <div className="w-full sm:w-auto sm:flex-1">
                    <Input
                      placeholder="Ej: Cemento x50kg"
                      error={formEntrada.formState.errors.items?.[i]?.descripcion?.message}
                      {...formEntrada.register(`items.${i}.descripcion`)}
                    />
                  </div>
                  <div className="flex-1 min-w-0 sm:flex-none sm:w-24">
                    <Input
                      type="number" min="0" step="any" inputMode="decimal"
                      placeholder="Cant."
                      className="text-right"
                      error={formEntrada.formState.errors.items?.[i]?.cantidad?.message}
                      {...formEntrada.register(`items.${i}.cantidad`)}
                    />
                  </div>
                  <div className="flex-1 min-w-0 sm:flex-none sm:w-24">
                    <Input placeholder="unid" {...formEntrada.register(`items.${i}.unidad`)} />
                  </div>
                  <button
                    type="button"
                    disabled={filas.length === 1}
                    onClick={() => quitarFila(i)}
                    className="shrink-0 min-h-[38px] min-w-[32px] flex items-center justify-center text-gris-mid hover:text-rojo text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gris-mid"
                    aria-label="Quitar material"
                    title={filas.length === 1 ? 'El lote necesita al menos un material' : 'Quitar material'}
                  >✕</button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => agregarFila({ ...ITEM_VACIO })}
              className="mt-2 w-full sm:w-auto min-h-[40px] px-3 py-2 rounded-lg border border-dashed border-azul/50 text-xs font-bold text-azul hover:text-naranja hover:border-naranja transition-colors flex items-center justify-center gap-1"
            >
              ＋ Agregar material
            </button>
          </div>

          <p className="text-[11px] text-gris-mid italic">
            Material comprado y pagado por el cliente que queda en el depósito de
            CADINC. Si ya existe un material con el mismo nombre para la obra, la
            entrega se suma a su saldo.
          </p>
        </div>
      </Modal>

      {/* ── Modal salida manual ── */}
      {modalSalida && (
        <Modal
          open
          onClose={() => setModalSalida(null)}
          title={`− SALIDA — ${modalSalida.descripcion}`}
          footer={<>
            <Button variant="secondary" onClick={() => setModalSalida(null)}>Cancelar</Button>
            <Button variant="primary" loading={saliendo} onClick={formSalida.handleSubmit(handleSalida)}>✓ Registrar</Button>
          </>}
        >
          <div className="flex flex-col gap-3">
            <div className="text-xs text-gris-dark">
              Obra <b>{modalSalida.obra_cod}</b> · saldo disponible:{' '}
              <span className="font-mono font-bold text-verde">{fmtNum(Number(modalSalida.saldo))} {modalSalida.unidad}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={`Cantidad (${modalSalida.unidad})`} type="number" min="0" step="any" inputMode="decimal" {...formSalida.register('cantidad')} />
              <Input label="Fecha" type="date" {...formSalida.register('fecha')} />
            </div>
            <Select
              label="Motivo"
              options={[
                { value: 'consumo_obra', label: 'Consumo de la obra (sin solicitud)' },
                { value: 'devolucion',   label: 'Devolución al cliente' },
                { value: 'ajuste',       label: 'Ajuste de inventario' },
              ]}
              {...formSalida.register('motivo')}
            />
            <Input label="Observaciones (opcional)" {...formSalida.register('obs')} />
            <p className="text-[11px] text-gris-mid italic">
              Para consumos que responden a un pedido cargado, usá el botón{' '}
              <b>Cliente</b> en Solicitudes — deja la trazabilidad completa del ítem.
            </p>
          </div>
        </Modal>
      )}

      {/* ── Modal movimientos ── */}
      {modalMovs && (
        <ModalMovimientos row={modalMovs} onClose={() => setModalMovs(null)} />
      )}
    </div>
  )
}

function ModalMovimientos({ row, onClose }: { row: StockClienteRow; onClose: () => void }) {
  const { data: movs = [], isLoading } = useMovimientosStockCliente(row.item_id)
  return (
    <Modal
      open
      onClose={onClose}
      title={`🕑 MOVIMIENTOS — ${row.descripcion}`}
      width="max-w-2xl"
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="text-xs text-gris-dark">
          Obra <b>{row.obra_cod}</b> · entregado {fmtNum(Number(row.cantidad_entregada))} ·
          consumido {fmtNum(Number(row.cantidad_consumida))} · saldo{' '}
          <span className="font-mono font-bold text-verde">{fmtNum(Number(row.saldo))} {row.unidad}</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-gris-dark italic py-3 text-center">Cargando…</p>
        ) : movs.length === 0 ? (
          <p className="text-sm text-gris-dark italic py-3 text-center">Sin movimientos.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gris border border-gris-mid rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
            {(movs as StockClienteMovimiento[]).map(m => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 bg-white text-sm">
                <span className={`shrink-0 font-mono font-bold ${m.tipo === 'entrada' ? 'text-verde' : 'text-naranja'}`}>
                  {m.tipo === 'entrada' ? '+' : '−'}{fmtNum(Number(m.cantidad))}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-carbon">{MOTIVO_LABEL[m.motivo] ?? m.motivo}</div>
                  <div className="text-[11px] text-gris-dark truncate">
                    {fmtFecha(m.fecha)}
                    {m.solicitud_item_id != null && ` · ítem de solicitud #${m.solicitud_item_id}`}
                    {m.obs ? ` · ${m.obs}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
