'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useStockCliente,
  useMovimientosStockCliente,
  useEntradaStockCliente,
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

interface EntradaForm {
  obra_cod:    string
  descripcion: string
  unidad:      string
  cantidad:    number | string
  fecha:       string
  obs:         string
}

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
  const { mutate: registrarEntrada, isPending: entrando } = useEntradaStockCliente()
  const { mutate: registrarSalida,  isPending: saliendo } = useSalidaStockCliente()

  const formEntrada = useForm<EntradaForm>({
    defaultValues: { obra_cod: '', descripcion: '', unidad: 'unid', cantidad: '', fecha: toISO(new Date()), obs: '' },
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

  function handleEntrada(data: EntradaForm) {
    const cantidad = Number(data.cantidad)
    if (!data.obra_cod)             { toast('Elegí la obra', 'err'); return }
    if (!data.descripcion.trim())   { toast('Poné la descripción del material', 'err'); return }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { toast('Cantidad inválida', 'err'); return }
    registrarEntrada({
      obra_cod:    data.obra_cod,
      descripcion: data.descripcion.trim(),
      unidad:      data.unidad.trim() || 'unid',
      cantidad,
      fecha:       data.fecha || undefined,
      obs:         data.obs || undefined,
    }, {
      onSuccess: () => { toast('Entrega registrada', 'ok'); setModalEntrada(false) },
      onError:   (e: Error) => toast(e.message || 'Error al registrar la entrega', 'err'),
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
              formEntrada.reset({ obra_cod: obraFiltro || '', descripcion: '', unidad: 'unid', cantidad: '', fecha: toISO(new Date()), obs: '' })
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

      {/* ── Modal entrada (entrega del cliente) ── */}
      <Modal
        open={modalEntrada}
        onClose={() => setModalEntrada(false)}
        title="➕ ENTREGA DEL CLIENTE"
        footer={<>
          <Button variant="secondary" onClick={() => setModalEntrada(false)}>Cancelar</Button>
          <Button variant="primary" loading={entrando} onClick={formEntrada.handleSubmit(handleEntrada)}>✓ Registrar</Button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <Combobox
            label="Obra (dueña del material)"
            placeholder="Buscar obra..."
            options={obraOptions.filter(o => o.value !== '')}
            value={formEntrada.watch('obra_cod')}
            onChange={v => formEntrada.setValue('obra_cod', v)}
          />
          <Input label="Material" placeholder="Ej: Cemento x50kg" {...formEntrada.register('descripcion')} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Cantidad" type="number" min="0" step="any" inputMode="decimal" {...formEntrada.register('cantidad')} />
            <Input label="Unidad" placeholder="unid / bolsas / m3" {...formEntrada.register('unidad')} />
            <Input label="Fecha" type="date" {...formEntrada.register('fecha')} />
          </div>
          <Input label="Observaciones (opcional)" placeholder="Remito del corralón, transporte, etc." {...formEntrada.register('obs')} />
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
