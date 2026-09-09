'use client'

import { useEffect, useRef } from 'react'
import { useSugerenciaPrecio } from '../hooks/useSolicitudes'
import { UNIDADES } from '../constants'

/**
 * Lo que el comprador ve al lado del precio en el modal de compra (fase 2 del
 * plan de precios, 2026-09-09): el precio de referencia del catálogo, la última
 * compra y la última compra a ESTE proveedor, cada una con "Usar", más el tilde
 * "poner este precio en el catálogo".
 *
 * El tilde arranca solo cuando la compra es una suba razonable (+0,5 % a +40 %)
 * o la ficha no tenía precio; una baja o un salto grande se tildan a mano. La
 * regla de compatibilidad de unidades viene del backend (`unidad_compatible`),
 * acá no se reimplementa.
 */

function fmtM(n: number) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
function fmtF(s: string | null | undefined) {
  if (!s) return ''
  return s.length > 10 ? new Date(s).toLocaleDateString('es-AR') : s.split('-').reverse().join('/')
}
const unidLabel = (u: string | null | undefined) => UNIDADES.find(x => x.value === u)?.label ?? u ?? ''

interface Props {
  itemId: number
  proveedorId: number | null
  /** Precio FINAL tipeado ahora en el modal (0 = vacío). */
  precio: number
  onUsar: (precio: number) => void
  /** Tilde "poner este precio en el catálogo", controlado por el form del padre. */
  actualizar: boolean
  onActualizar: (v: boolean) => void
  /** Permiso de catálogo (cargar_precios o admin). Sin él, el tilde se ve pero no se puede marcar. */
  puedeActualizar: boolean
  /** La compra entra sin precio: no hay nada que llevar al catálogo. */
  esperando: boolean
}

function Linea({ label, precio, detalle, viejo, compatible, onUsar }: {
  label: string; precio: number; detalle: string; viejo?: boolean; compatible: boolean; onUsar: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0">
        <b>{label}</b>{' '}
        <span className="font-mono">{fmtM(precio)}</span>{' '}
        <span className="text-gris-dark">{detalle}</span>
        {viejo && <span className="ml-1 text-[9px] font-bold bg-amarillo-light text-[#7A5500] px-1 py-0.5 rounded" title="Hace más de 45 días que no se actualiza">+45 días</span>}
        {!compatible && <span className="ml-1 text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded" title="Está en otra unidad que el renglón: no es comparable">otra unidad</span>}
      </span>
      <button type="button" onClick={onUsar} disabled={!compatible || !(precio > 0)}
        className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-azul-light text-azul hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed">
        Usar
      </button>
    </div>
  )
}

export function SugerenciaPrecio({ itemId, proveedorId, precio, onUsar, actualizar, onActualizar, puedeActualizar, esperando }: Props) {
  const { data: sug, isLoading } = useSugerenciaPrecio(itemId, proveedorId, true)
  // Después de que el usuario tocó el tilde, el default no lo pisa más.
  const tocado = useRef(false)
  // El callback del padre cambia en cada render; se guarda en un ref (en un
  // efecto, no durante el render) para que el efecto de abajo no dependa de él.
  const cb = useRef(onActualizar)
  useEffect(() => { cb.current = onActualizar })

  const ref = sug?.ficha?.precio_ref ?? 0
  const dif = ref > 0 && precio > 0 ? ((precio - ref) / ref) * 100 : null
  const puede = !!sug?.puede_actualizar_ref && !esperando && precio > 0 && puedeActualizar

  useEffect(() => {
    if (tocado.current) return
    if (!puede) { cb.current(false); return }
    if (ref <= 0) { cb.current(true); return }          // la ficha no tenía precio: este es el primero
    if (dif === null) { cb.current(false); return }
    cb.current(dif > 0.5 && dif <= 40)                    // suba razonable: sí; baja o salto grande: a mano
  }, [puede, ref, dif])

  let hint: string
  if (!puedeActualizar) hint = 'Necesitás el permiso de cargar precios para tocar el catálogo.'
  else if (!(precio > 0)) hint = 'Cargá el precio y te digo cómo queda contra el catálogo.'
  else if (ref <= 0) hint = 'La ficha no tiene precio de referencia: este sería el primero.'
  else if (dif !== null && Math.abs(dif) <= 0.5) hint = `El catálogo ya está a este precio (${fmtM(ref)}).`
  else if (dif !== null && dif > 40) hint = `${dif > 0 ? '+' : ''}${dif.toFixed(1)} % sobre el catálogo (${fmtM(ref)}). Es un salto grande: tildalo solo si el precio es el real.`
  else if (dif !== null && dif < 0) hint = `${dif.toFixed(1)} % contra el catálogo (${fmtM(ref)}). Es más barato: destildado por las dudas.`
  else hint = `${dif !== null && dif > 0 ? '+' : ''}${dif?.toFixed(1)} % sobre el catálogo (${fmtM(ref)}).`

  return (
    <div className="rounded-lg border-[1.5px] border-gris-mid px-3 py-2.5 text-xs flex flex-col gap-1.5">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Precio de referencia</div>
      {isLoading && <div className="text-gris-mid">Buscando…</div>}
      {sug?.motivo === 'SIN_FICHA' && (
        <div className="text-gris-dark">Este renglón no tiene ficha del catálogo: no hay precio de referencia para comparar.</div>
      )}
      {sug?.ficha && (
        <Linea label="Catálogo" precio={sug.ficha.precio_ref} compatible={sug.compatible}
          detalle={`por ${unidLabel(sug.ficha.unidad)}${sug.ficha.dias_desde_precio != null ? ` · hace ${sug.ficha.dias_desde_precio} días` : ''}`}
          viejo={sug.ficha.precio_viejo} onUsar={() => onUsar(sug.ficha!.precio_ref)} />
      )}
      {sug?.ultima_compra && (
        <Linea label="Última compra" precio={sug.ultima_compra.precio_unit} compatible={sug.ultima_compra.compatible}
          detalle={`por ${unidLabel(sug.ultima_compra.unidad)} · ${sug.ultima_compra.proveedor ?? ''} ${fmtF(sug.ultima_compra.fecha)}`}
          onUsar={() => onUsar(sug.ultima_compra!.precio_unit)} />
      )}
      {sug?.a_este_proveedor && (
        <Linea label="A este proveedor" precio={sug.a_este_proveedor.precio_unit} compatible={sug.a_este_proveedor.compatible}
          detalle={`por ${unidLabel(sug.a_este_proveedor.unidad)} · ${fmtF(sug.a_este_proveedor.fecha)}`}
          onUsar={() => onUsar(sug.a_este_proveedor!.precio_unit)} />
      )}
      {sug?.ficha && sug.motivo === 'UNIDAD_DISTINTA' && (
        <div className="text-naranja-dark">
          ⚠ La ficha se mide por <b>{unidLabel(sug.ficha.unidad)}</b> y este renglón por <b>{unidLabel(sug.unidad_renglon)}</b>: los precios no son comparables y esta compra no puede ir al catálogo.
        </div>
      )}
      {sug?.puede_actualizar_ref && !esperando && (
        <label className="flex items-start gap-2 mt-1 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={actualizar} disabled={!puede}
            onChange={e => { tocado.current = true; onActualizar(e.target.checked) }} />
          <span>
            <span className="font-bold text-azul">Poner este precio en el catálogo</span>
            <span className="block text-[11px] text-gris-dark">{hint}</span>
          </span>
        </label>
      )}
    </div>
  )
}
