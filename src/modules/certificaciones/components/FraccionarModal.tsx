'use client'

import { useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useFraccionar, type Equivalencia } from '../hooks/useStock'

/**
 * Abrir un bulto: un tambor de 200 lts se convierte en 200 litros, una tonelada
 * de arena en 40 bolsas.
 *
 * Es la operación que hasta ahora se hacía a mano y sin rastro — el tambor de
 * thinner figuraba en 0 y la ficha por litro en 180 porque alguien lo convirtió
 * de memoria. Acá queda con sus dos movimientos de stock enlazados.
 *
 * El precio NO se toca: fraccionar tiene su propio costo (ensacar la arena, por
 * ejemplo) y `precio_ref` es precio de venta. El costo prorrateado se muestra
 * como dato para que quien lo hace sepa a cuánto le salió la unidad.
 */

interface MaterialFraccionable {
  id:           number
  nombre:       string
  unidad:       string
  stock_actual: number
  precio_ref:   number
}

interface Props {
  material:  MaterialFraccionable
  /** La equivalencia de esta ficha, con el nombre y la unidad del destino. */
  equiv:     Equivalencia
  destino:   { nombre: string; unidad: string } | null
  onClose:   () => void
}

export function FraccionarModal({ material, equiv, destino, onClose }: Props) {
  const toast = useToast()
  const { mutate: fraccionar, isPending } = useFraccionar()
  const [cantidad, setCantidad] = useState('1')
  const [obs, setObs] = useState('')

  const num      = Number(cantidad.replace(',', '.'))
  const valida   = cantidad.trim() !== '' && Number.isFinite(num) && num > 0 && num <= material.stock_actual
  const seExcede = cantidad.trim() !== '' && Number.isFinite(num) && num > material.stock_actual
  const salen    = valida ? num * Number(equiv.factor) : null
  const costo    = valida && material.precio_ref > 0 && salen ? (num * material.precio_ref) / salen : null

  const fmt = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

  function guardar() {
    if (!valida) {
      toast(seExcede
        ? `Solo hay ${material.stock_actual} ${material.unidad} en el depósito`
        : 'Poné cuántos bultos se abren', 'err')
      return
    }
    fraccionar({ materialId: material.id, cantidad: num, obs: obs.trim() || undefined }, {
      onSuccess: (r) => {
        toast(`✓ ${r.unidades} ${r.unidad_destino} de "${r.destino_nombre}"`, 'ok')
        setCantidad('1'); setObs(''); onClose()
      },
      onError: (err: unknown) => {
        const code = (err as { body?: { error?: string } })?.body?.error
        toast(
          code === 'SIN_EQUIVALENCIA'   ? 'Esta ficha no tiene definido en qué se fracciona.' :
          code === 'STOCK_INSUFICIENTE' ? 'No hay tanto en el depósito.' :
          (err as Error).message || 'No se pudo fraccionar', 'err')
      },
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Fraccionar bulto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={guardar} loading={isPending} disabled={!valida}>Fraccionar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm">
          <div className="font-bold">{material.nombre}</div>
          <div className="text-gris">Hay {material.stock_actual} {material.unidad} en el depósito</div>
        </div>

        <div className="flex-1 min-w-0">
          <Input
            label={`¿Cuántos se abren? (${material.unidad})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            error={seExcede ? `Solo hay ${material.stock_actual}` : undefined}
            hint={`1 ${material.unidad} = ${equiv.factor} ${destino?.unidad ?? ''}${equiv.obs ? ` · ${equiv.obs}` : ''}`}
          />
        </div>

        {/* Qué va a pasar, antes de confirmar. */}
        {salen !== null && destino && (
          <div className="text-sm rounded p-2 bg-verde-light text-verde-dark">
            Salen <b>{salen} {destino.unidad}</b> de <b>{destino.nombre}</b>.
            {costo !== null && (
              <div className="text-xs mt-1 opacity-80">
                Te sale <b>{fmt(costo)}</b> cada {destino.unidad}. El precio de venta de esa ficha no cambia.
              </div>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">Nota <span className="text-gris font-normal">(opcional)</span></span>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Tambor nuevo, se abrió para la obra de…"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>
    </Modal>
  )
}
