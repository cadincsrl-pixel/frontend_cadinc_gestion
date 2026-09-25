'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { useEditarItem } from '../hooks/useSolicitudes'
import { useMaterialCompras } from '../hooks/useStock'
import { mensajeErrorCertificaciones } from '../utils/certificaciones.errores'
import { HistorialPreciosCuerpo } from './HistorialPrecios'
import { ItemHistorialCuerpo } from './ItemHistorialModal'
import type { SolicitudCompraItem, StockMaterial } from '@/types/domain.types'

/**
 * La ficha de un renglón de pedido (24/09, pedido del dueño: «que de cada item
 * se abra el modal y se vea la historia, el precio de cada proveedor»).
 *
 * Reemplaza al botón «Editar precio» de la fila, que editaba a ciegas: acá el
 * precio se corrige MIRANDO la referencia del catálogo, la última compra y lo
 * que se le pagó a cada proveedor. Tres pestañas:
 *   · Precio: el del renglón y los de comparación, y el campo para corregirlo.
 *   · Proveedores: las compras del material (el mismo historial del catálogo);
 *     «usar» copia ese precio al campo del renglón, no al catálogo.
 *   · Historial: la línea de tiempo del renglón (lo que antes abría el 🕑).
 */

export type TabFicha = 'precio' | 'proveedores' | 'historial'

const fmtM = (n: number) => '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
const fmtFecha = (s: string | null | undefined) => {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function FichaItemModal({ item, ficha, tabInicial = 'precio', puedeEditarPrecio, motivoSinEdicion, onClose }: {
  item: SolicitudCompraItem
  /** La ficha del catálogo del renglón, si está vinculado. */
  ficha?: StockMaterial
  tabInicial?: TabFicha
  puedeEditarPrecio: boolean
  /** Por qué no se puede editar (tooltip y aviso), cuando `puedeEditarPrecio` es false. */
  motivoSinEdicion?: string
  onClose: () => void
}) {
  const toast = useToast()
  const [tab, setTab] = useState<TabFicha>(tabInicial)
  const precioActual = Number(item.precio_unit ?? 0)
  const [draft, setDraft] = useState(precioActual > 0 ? String(precioActual) : '')
  const { mutate: editar, isPending: guardando } = useEditarItem()
  const { data } = useMaterialCompras(item.material_id ?? null)

  const cant = Number(item.cantidad_comprada ?? item.cantidad)
  const ref = Number(ficha?.precio_ref ?? 0)
  // La última compra de OTRO renglón: la de este mismo no sirve de comparación.
  const ultima = (data?.compras ?? []).find(c => c.item_id !== item.id) ?? null
  const nuevo = Number(draft)
  const cambio = Number.isFinite(nuevo) && nuevo > 0 && Math.abs(nuevo - precioActual) > 0.004

  function usar(p: number) {
    setDraft(String(Math.round(p * 100) / 100))
    setTab('precio')
  }

  function guardar() {
    if (!Number.isFinite(nuevo) || nuevo <= 0) { toast('Ingresá un precio válido', 'err'); return }
    editar({ itemId: item.id!, dto: { precio_unit: nuevo } }, {
      onSuccess: () => { toast('✓ Precio guardado', 'ok'); onClose() },
      onError: e => toast(mensajeErrorCertificaciones(e, 'No se pudo guardar el precio'), 'err'),
    })
  }

  const tabs: { key: TabFicha; label: string; deshabilitada?: string }[] = [
    { key: 'precio', label: '💲 Precio' },
    { key: 'proveedores', label: '🏪 Proveedores', deshabilitada: item.material_id ? undefined : 'El renglón no está vinculado a una ficha del catálogo' },
    { key: 'historial', label: '🕑 Historial' },
  ]

  return (
    <Modal open onClose={onClose} title={item.descripcion} width="max-w-3xl"
      footer={
        <div className="flex justify-between items-center gap-2">
          <span className="text-[11px] text-gris-dark">Precios finales, IVA incluido.</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            {tab === 'precio' && puedeEditarPrecio && (
              <Button variant="primary" loading={guardando} disabled={!cambio} onClick={guardar}>✓ Guardar precio</Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Cabecera: qué es y en qué quedó */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gris-dark -mt-1">
          <span className="font-mono">{cant.toLocaleString('es-AR')} {item.unidad}</span>
          {ficha?.codigo && <span className="font-mono font-bold">{ficha.codigo}</span>}
          {item.proveedores?.nombre && <span>Prov: <b className="text-carbon">{item.proveedores.nombre}</b></span>}
          {item.facturas_compra?.numero && <span>Factura {item.facturas_compra.numero}</span>}
          {item.color && <span>Color: <b className="text-carbon">{item.color}</b></span>}
        </div>

        <div className="flex gap-1 border-b border-gris">
          {tabs.map(t => (
            <button key={t.key} type="button" disabled={!!t.deshabilitada} title={t.deshabilitada}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-bold -mb-px border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tab === t.key ? 'border-naranja text-carbon' : 'border-transparent text-gris-dark hover:text-carbon'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Alto mínimo: sin esto la ventana saltaba de lugar al cambiar de pestaña. */}
        <div className="min-h-[340px]">
        {tab === 'precio' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Dato label="Precio del renglón" valor={precioActual > 0 ? fmtM(precioActual) : 'sin precio'}
                sub={precioActual > 0 ? `total ${fmtM(precioActual * cant)}` : 'todavía no se cargó'} destacado />
              <Dato label="Referencia del catálogo" valor={ref > 0 ? fmtM(ref) : '—'}
                sub={ref > 0 ? (ficha?.precio_actualizado_en ? `act. ${fmtFecha(ficha.precio_actualizado_en)}` : undefined) : 'la ficha no tiene precio'}
                accion={ref > 0 && puedeEditarPrecio && ref !== precioActual ? { label: 'usar', onClick: () => usar(ref) } : undefined} />
              <Dato label="Última compra" valor={ultima ? fmtM(Number(ultima.precio_unit)) : '—'}
                sub={ultima ? `${ultima.proveedor_nombre ?? 'sin proveedor'} · ${fmtFecha(ultima.fecha)}` : item.material_id ? 'sin otras compras' : 'sin ficha del catálogo'}
                accion={ultima && puedeEditarPrecio && Number(ultima.precio_unit) !== precioActual ? { label: 'usar', onClick: () => usar(Number(ultima.precio_unit)) } : undefined} />
            </div>

            {puedeEditarPrecio ? (
              <div className="bg-gris/40 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <InputMonto label={`Precio por ${item.unidad} ($)`} value={draft} onChange={setDraft} placeholder="0,00"
                      onKeyDown={e => { if (e.key === 'Enter' && cambio) guardar() }} />
                  </div>
                  {cambio && (
                    <div className="text-xs text-gris-dark pb-2">
                      Total nuevo <b className="font-mono text-carbon">{fmtM(nuevo * cant)}</b>
                      {precioActual > 0 && (
                        <span className={`ml-2 font-bold ${nuevo > precioActual ? 'text-rojo' : 'text-verde'}`}>
                          {nuevo > precioActual ? '+' : ''}{Math.round((nuevo - precioActual) / precioActual * 100)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gris-dark">
                  Cambia el precio de este renglón y de su fila en la cuenta corriente de la obra. No toca el precio de referencia del catálogo.
                  Si el renglón ya está cobrado o certificado, primero hay que soltarlo desde la cuenta corriente.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gris-dark bg-gris/40 rounded-lg p-3">{motivoSinEdicion ?? 'El precio de este renglón no se puede editar.'}</p>
            )}
          </div>
        )}

        {tab === 'proveedores' && item.material_id && ficha && (
          <HistorialPreciosCuerpo
            material={ficha}
            onUsarPrecio={puedeEditarPrecio ? usar : undefined}
            usarTitulo="Usar este precio para el renglón (después se guarda en la pestaña Precio)"
          />
        )}

        {tab === 'historial' && <ItemHistorialCuerpo item={item} />}
        </div>
      </div>
    </Modal>
  )
}

function Dato({ label, valor, sub, destacado, accion }: {
  label: string; valor: string; sub?: string; destacado?: boolean
  accion?: { label: string; onClick: () => void }
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${destacado ? 'bg-azul-light/60' : 'bg-gris/40'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-gris-dark">{label}</div>
        {accion && (
          <button type="button" onClick={accion.onClick}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-azul-light text-azul hover:opacity-80"
            title="Poner este precio en el campo del renglón">{accion.label}</button>
        )}
      </div>
      <div className={`font-mono font-bold ${destacado ? 'text-azul' : 'text-carbon'}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark truncate">{sub}</div>}
    </div>
  )
}
