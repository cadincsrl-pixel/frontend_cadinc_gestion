'use client'

import { useState } from 'react'
import { usePreciosPropuestos, useResolverPrecioPropuesto } from '../../hooks/useCuentaCliente'
import { usePerfilesMap } from '@/lib/hooks/usePerfilesMap'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { fmtM, fmtFecha } from './cuentaCorriente.utils'

/**
 * Precios esperando aprobación (20260912o).
 *
 * El precio de la cuenta lo fija quien tiene `cargar_precios`, pero el dato lo
 * tiene el que compró: Nicolás compra en cuenta corriente y POLLANO le pasa la
 * cuenta días después. Él propone desde "Cargar precios" y acá se aprueba o se
 * rechaza con motivo. Hasta que se aprueba, la cuenta del cliente no se mueve.
 *
 * Solo se monta para quien puede aprobar: el endpoint responde 403 al resto.
 */
export function PreciosPropuestos() {
  const toast = useToast()
  const { data: propuestos = [], isLoading } = usePreciosPropuestos()
  const { mutate: resolver, isPending } = useResolverPrecioPropuesto()
  const nombres = usePerfilesMap()
  const [rechazando, setRechazando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')

  if (isLoading || propuestos.length === 0) return null

  function aprobar(itemId: number, desc: string, precio: number) {
    resolver({ itemId, aprobar: true }, {
      onSuccess: () => toast(`✓ ${desc}: ${fmtM(precio)}`, 'ok'),
      onError:   e => toast(e instanceof Error ? e.message : 'No se pudo aprobar', 'err'),
    })
  }

  function rechazar(itemId: number) {
    const m = motivo.trim()
    if (m.length < 3) { toast('Escribí por qué lo rechazás: el que lo cargó lo va a ver', 'err'); return }
    resolver({ itemId, aprobar: false, motivo: m }, {
      onSuccess: () => { toast('Precio rechazado', 'ok'); setRechazando(null); setMotivo('') },
      onError:   e => toast(e instanceof Error ? e.message : 'No se pudo rechazar', 'err'),
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-amarillo">
      <div className="px-4 py-3 border-b border-gris-mid">
        <h3 className="font-display text-lg text-azul">
          💲 PRECIOS ESPERANDO TU OK <span className="font-mono text-sm text-gris-dark">({propuestos.length})</span>
        </h3>
        <p className="text-[11px] text-gris-dark">
          Los cargó quien hizo la compra. Hasta que los apruebes, la cuenta del cliente no se mueve.
        </p>
      </div>

      <div className="divide-y divide-gris">
        {propuestos.map(p => {
          const actual = Number(p.precio_unit)
          const nuevo  = Number(p.precio_propuesto)
          const quien  = p.precio_propuesto_por ? (nombres.get(p.precio_propuesto_por) ?? '—') : '—'
          return (
            <div key={p.item_id} className="px-4 py-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-carbon">{p.descripcion}</div>
                  <div className="text-[11px] text-gris-dark">
                    {p.obra_nom} · {Number(p.cantidad).toLocaleString('es-AR')} {p.unidad}
                    {p.proveedor_nom && <> · {p.proveedor_nom}</>}
                    {p.fecha_resolucion && <> · {fmtFecha(p.fecha_resolucion)}</>}
                  </div>
                  <div className="text-[11px] text-gris-dark mt-0.5">
                    Lo cargó <b>{quien}</b>
                    {p.precio_propuesto_obs && <> — «{p.precio_propuesto_obs}»</>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono tabular-nums text-sm">
                    {actual > 0
                      ? <><span className="text-gris-dark line-through">{fmtM(actual)}</span> → </>
                      : <span className="text-gris-dark text-[11px]">sin precio → </span>}
                    <b className="text-base">{fmtM(nuevo)}</b>
                  </div>
                  <div className="text-[11px] text-gris-dark">
                    total {fmtM(nuevo * Number(p.cantidad))}
                  </div>
                </div>
              </div>

              {rechazando === p.item_id ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Por qué lo rechazás (lo ve quien lo cargó)"
                    className="flex-1 min-w-[200px] px-2 py-1.5 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja"
                  />
                  <Button variant="secondary" size="sm" onClick={() => { setRechazando(null); setMotivo('') }}>Cancelar</Button>
                  <Button variant="primary" size="sm" loading={isPending} onClick={() => rechazar(p.item_id)}>Rechazar</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" loading={isPending}
                    onClick={() => aprobar(p.item_id, p.descripcion, nuevo)}>
                    ✓ Aprobar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRechazando(p.item_id); setMotivo('') }}>
                    ✕ Rechazar
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
