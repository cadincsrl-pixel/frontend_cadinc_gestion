'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { MovimientosFondosView } from './MovimientosFondosView'
import { ConceptosFondosView } from './ConceptosFondosView'

type Vista = 'movimientos' | 'conceptos'

const VISTAS: { key: Vista; label: string }[] = [
  { key: 'movimientos', label: 'Movimientos de fondos' },
  { key: 'conceptos',   label: 'Conceptos' },
]

/**
 * Tesorería (tanda 5, 20260928l): la operación diaria de fondos que NO pasa
 * por una factura: comisiones y gastos bancarios, impuesto al cheque, VEP,
 * sueldos, retiros y aportes de socios, transferencias entre cuentas propias.
 * Cada movimiento se contabiliza con el circuito «Fondos» de Automáticos.
 *
 * La sub-vista vive en la URL (`?vista=`); `?mov=<id>` abre un movimiento
 * (link desde la ficha del asiento y desde Automáticos). El ABM de las
 * cuentas de tesorería sigue en Plan de cuentas. Acá va a vivir también la
 * conciliación bancaria.
 */
export function TesoreriaTab() {
  const router = useRouter()
  const sp = useSearchParams()
  const vista: Vista = sp.get('vista') === 'conceptos' ? 'conceptos' : 'movimientos'
  const movId = Number(sp.get('mov')) || null

  function setVista(v: Vista) {
    const p = new URLSearchParams(sp.toString())
    p.set('vista', v)
    p.delete('mov')
    router.replace(`/contabilidad?${p.toString()}`)
  }

  function cerrarMov() {
    const p = new URLSearchParams(sp.toString())
    p.delete('mov')
    router.replace(`/contabilidad?${p.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Tesorería">
        {VISTAS.map(v => (
          <button key={v.key} type="button" role="tab" aria-selected={vista === v.key} onClick={() => setVista(v.key)}
            className={`text-sm px-3 py-1.5 rounded-full border ${vista === v.key ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
            {v.label}
          </button>
        ))}
      </div>
      {vista === 'movimientos'
        ? <MovimientosFondosView movIdUrl={movId} onCerrarMovUrl={cerrarMov} />
        : <ConceptosFondosView />}
    </div>
  )
}
