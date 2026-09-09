'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useGuardarPreciosMCC } from '../../hooks/useCuentaCliente'
import { useEditarItem } from '../../hooks/useSolicitudes'
import { fetchCuentaRenglonesTodos, CUENTA_CORRIENTE_KEY } from '../../hooks/useCuentaCorriente'
import { UNIDADES } from '../../constants'
import type { CuentaRenglon } from '@/types/domain.types'
import { ESTADO_META, fmtM } from './cuentaCorriente.utils'

const unidadLabel = (u: string | null | undefined) => UNIDADES.find(x => x.value === u)?.label ?? u ?? ''

/**
 * Carga masiva de precios de una obra. Cubre TODOS los renglones de la obra
 * (a cobrar, pagó directo y gasto de CADINC); solo los ya cobrados quedan
 * afuera porque el monto está congelado en el pago. Reusa el PATCH del ítem,
 * que recalcula la fila de la cuenta (total = cant × precio).
 *
 * Lo tipeado se guarda como "override" por ítem; el valor efectivo es el
 * override o el precio actual. Así no hace falta inicializar estado cuando
 * llegan los datos.
 */

interface Props {
  open:    boolean
  onClose: () => void
  obraCod: string
  obraNom: string
}

export function ModalCargarPrecios({ open, onClose, obraCod, obraNom }: Props) {
  const toast = useToast()
  // El PATCH del ítem exige `actualizacion` + flag `resolver_items` (solicitudes.routes.ts).
  const { puedeEditar, resolverItems, cargarPrecios, esAdmin } = usePermisos('certificaciones')
  // Tocar precios mueve lo que se le cobra al cliente: además del permiso de
  // siempre exige el flag cargar_precios (que arranca solo en admin — pedido
  // del dueño). El backend lo re-valida campo por campo.
  const puedeCargarPrecios = puedeEditar && resolverItems && (cargarPrecios || esAdmin)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'obra-todos', obraCod],
    queryFn:  () => fetchCuentaRenglonesTodos({ obra_cod: obraCod }),
    enabled:  open && !!obraCod,
  })
  const { mutate: guardarPrecios, isPending } = useGuardarPreciosMCC()
  const { mutate: editarItem, isPending: convirtiendo } = useEditarItem()
  // "Pasar el renglón a la unidad de la ficha" (fase 3): el renglón dice "15 m"
  // y la ficha va por rollo; se pide cuánto es en la unidad de la ficha y el
  // backend escala la cuenta, los envíos y el stock descontado.
  const [convertir, setConvertir] = useState<CuentaRenglon | null>(null)
  const [cantNueva, setCantNueva] = useState('')

  const [overrides, setOverrides] = useState<Record<number, string>>({})
  // Overrides de "quién lo pagó": cambiar un renglón a pago directo del
  // cliente lo saca de la deuda (y viceversa). Editable acá porque el caso
  // real aparece tarde: se descubre que el cliente pagó algo cuando ya está
  // cargado como "CADINC adelantó".
  const [pagadores, setPagadores] = useState<Record<number, 'cadinc' | 'cliente'>>({})
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const editables = useMemo(() => rows.filter(r => r.cobro_id == null), [rows])
  const cobrados  = rows.length - editables.length

  function valorDe(r: CuentaRenglon): string {
    return overrides[r.item_id] ?? (Number(r.precio_unit) > 0 ? String(r.precio_unit) : '')
  }
  function precioVal(r: CuentaRenglon): number {
    const raw = valorDe(r)
    const v = raw === '' ? 0 : Number(raw)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }

  function pagadorDe(r: CuentaRenglon): 'cadinc' | 'cliente' {
    return pagadores[r.item_id] ?? ((r.pagado_por === 'cliente' ? 'cliente' : 'cadinc'))
  }
  const cambios       = editables.filter(r =>
    precioVal(r) !== Number(r.precio_unit) || pagadorDe(r) !== (r.pagado_por === 'cliente' ? 'cliente' : 'cadinc'))
  const sinPrecio     = editables.filter(r => Number(r.precio_unit) === 0).length
  // Renglones en $0 cuya ficha tiene precio de referencia en una unidad
  // compatible: se tasan con un click ("Usar sugeridos"). Es la tasación "al
  // precio de hoy" que hasta ahora se hacía por SQL.
  const sugeribles    = editables.filter(r => Number(r.precio_unit) === 0 && precioVal(r) === 0 && Number(r.ficha_precio_ref ?? 0) > 0 && r.ficha_unidad_ok === true)
  const conUnidadDistinta = editables.filter(r => Number(r.precio_unit) === 0 && r.ficha_unidad_ok === false && Number(r.ficha_precio_ref ?? 0) > 0).length
  const totalObra     = editables.reduce((s, r) => s + Number(r.cantidad) * precioVal(r), 0)
  const q             = busqueda.trim().toLowerCase()
  // Se muestra TODO el listado de la obra, congelados incluidos (en gris, solo
  // lectura): el pedido del user fue poder ver la cuenta entera desde acá, no
  // solo lo que falta tasar.
  const visibles      = rows
    .filter(r => !soloSinPrecio || (r.cobro_id == null && Number(r.precio_unit) === 0))
    .filter(r => !q || r.descripcion.toLowerCase().includes(q))

  function cerrar() { setOverrides({}); setPagadores({}); setSoloSinPrecio(false); setBusqueda(''); setConvertir(null); onClose() }

  function usarSugeridos() {
    if (sugeribles.length === 0) return
    setOverrides(p => ({ ...p, ...Object.fromEntries(sugeribles.map(r => [r.item_id, String(r.ficha_precio_ref)])) }))
    toast(`${sugeribles.length} precio${sugeribles.length !== 1 ? 's' : ''} sugerido${sugeribles.length !== 1 ? 's' : ''} cargado${sugeribles.length !== 1 ? 's' : ''}: revisá y guardá`, 'ok')
  }

  function confirmarConversion() {
    if (!convertir || !convertir.ficha_unidad) return
    const n = Number(cantNueva.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) { toast('Cargá la cantidad en la unidad de la ficha', 'err'); return }
    const r = convertir
    editarItem({ itemId: r.item_id, dto: { unidad: r.ficha_unidad, cantidad: n } }, {
      onSuccess: () => {
        toast(`✓ ${r.descripcion}: ${n} ${unidadLabel(r.ficha_unidad)}`, 'ok')
        // Ya está en la unidad de la ficha: se deja el precio sugerido listo para guardar.
        if (Number(r.ficha_precio_ref ?? 0) > 0) setOverrides(p => ({ ...p, [r.item_id]: String(r.ficha_precio_ref) }))
        setConvertir(null); setCantNueva('')
      },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : ''
        toast(/ITEM_COBRADO/.test(msg) ? 'Ese renglón ya está cobrado: no se puede cambiar' : /ITEM_CERTIFICADO/.test(msg) ? 'Ese renglón ya está certificado: no se puede cambiar' : (msg || 'No se pudo cambiar la unidad'), 'err')
      },
    })
  }

  function guardar() {
    if (cambios.length === 0) { toast('No cambiaste nada', 'err'); return }
    const aCero = cambios.filter(r => Number(r.precio_unit) > 0 && precioVal(r) === 0).length
    if (aCero > 0 && !confirm(`Vas a dejar en $0 ${aCero} material(es) que tenían precio cargado.\n¿Continuar?`)) return
    guardarPrecios(cambios.map(r => ({
      itemId: r.item_id,
      ...(precioVal(r) !== Number(r.precio_unit) ? { precio_unit: precioVal(r) } : {}),
      ...(pagadorDe(r) !== (r.pagado_por === 'cliente' ? 'cliente' : 'cadinc') ? { pagado_por: pagadorDe(r) } : {}),
    })), {
      onSuccess: ({ total, fallidos }) => {
        if (fallidos > 0) {
          // No cerramos: el refetch repinta los que pasaron y lo tipeado queda para reintentar.
          toast(`Guardados ${total - fallidos}/${total} — ${fallidos} fallaron`, 'err')
          return
        }
        toast(`✓ ${total} precio${total !== 1 ? 's' : ''} guardado${total !== 1 ? 's' : ''}`, 'ok')
        cerrar()
      },
      onError: () => toast('Error al guardar precios', 'err'),
    })
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={`💲 Cargar precios — ${obraNom}`}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button variant="primary" loading={isPending} disabled={!puedeCargarPrecios || cambios.length === 0} title={puedeCargarPrecios ? undefined : 'Sin permiso para cargar precios (requiere actualización y resolver ítems)'} onClick={guardar}>
            ✓ Guardar cambios ({cambios.length})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-xs text-gris-dark">
            {isLoading ? 'Cargando…' : <>
              {editables.length} {editables.length === 1 ? 'renglón' : 'renglones'} ·{' '}
              <span className="font-bold text-naranja-dark">{sinPrecio} sin precio</span>. Precio unitario final (IVA incluido); el total se calcula solo.
              {cobrados > 0 && ` ${cobrados} ya cobrado${cobrados !== 1 ? 's' : ''} (en gris, congelados).`}
            </>}
          </div>
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            {sugeribles.length > 0 && (
              <Button variant="secondary" size="sm" disabled={!puedeCargarPrecios} onClick={usarSugeridos}
                title={puedeCargarPrecios ? 'Poner el precio de referencia del catálogo en los renglones sin precio cuya ficha lo tiene' : 'Sin permiso para cargar precios'}>
                💡 Usar sugeridos ({sugeribles.length})
              </Button>
            )}
            {sinPrecio > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer">
                <input type="checkbox" className="accent-naranja" checked={soloSinPrecio} onChange={e => setSoloSinPrecio(e.target.checked)} />
                Solo sin precio ({sinPrecio})
              </label>
            )}
          </div>
        </div>
        {conUnidadDistinta > 0 && !convertir && (
          <div className="text-[11px] text-gris-dark">
            ⚠ {conUnidadDistinta} renglón{conUnidadDistinta !== 1 ? 'es' : ''} sin precio {conUnidadDistinta !== 1 ? 'están' : 'está'} en otra unidad que su ficha: pasalos a la unidad de la ficha (botón en la columna Sugerido) y después se pueden tasar.
          </div>
        )}
        {convertir && (
          <div className="rounded-xl border-[1.5px] border-azul bg-azul-light/40 px-4 py-3 flex flex-col gap-2">
            <div className="text-sm">
              <b>{convertir.descripcion}</b>: el renglón dice <b>{Number(convertir.cantidad).toLocaleString('es-AR')} {unidadLabel(convertir.unidad)}</b> y la ficha va por <b>{unidadLabel(convertir.ficha_unidad)}</b>
              {Number(convertir.ficha_precio_ref ?? 0) > 0 && <> a {fmtM(Number(convertir.ficha_precio_ref))} cada {unidadLabel(convertir.ficha_unidad)}</>}.
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-xs font-bold text-gris-dark">
                ¿Cuánto es en {unidadLabel(convertir.ficha_unidad)}?
                <input type="text" inputMode="decimal" autoFocus value={cantNueva} onChange={e => setCantNueva(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarConversion() }}
                  className="block mt-1 w-32 px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm font-mono outline-none focus:border-azul bg-white" placeholder="0" />
              </label>
              {(() => { const n = Number(cantNueva.replace(',', '.')); const pr = Number(convertir.ficha_precio_ref ?? 0); return Number.isFinite(n) && n > 0 && pr > 0 ? <span className="text-xs text-gris-dark pb-2.5">= {fmtM(n * pr)}</span> : null })()}
              <Button variant="primary" size="sm" loading={convirtiendo} onClick={confirmarConversion}>Pasar a {unidadLabel(convertir.ficha_unidad)}</Button>
              <Button variant="secondary" size="sm" onClick={() => { setConvertir(null); setCantNueva('') }}>Cancelar</Button>
            </div>
            <div className="text-[11px] text-gris-dark">Se cambian la cantidad y la unidad del renglón en el pedido y en la cuenta; si salió del depósito, el stock descontado se corrige en la misma proporción.</div>
          </div>
        )}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gris-mid text-xs pointer-events-none">🔍</span>
          <input
            type="text" autoComplete="off" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar material..."
            className="w-full pl-8 pr-8 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gris-mid hover:text-rojo text-xs font-bold">✕</button>
          )}
        </div>
        <div className="border border-gris rounded-lg overflow-hidden">
          {/* overflow-auto en los dos ejes: en 390px las columnas de precio quedaban clipeadas. */}
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gris sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Material</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Estado</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Cant.</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider" title="Precio de referencia de la ficha del catálogo (final, IVA incluido)">Sugerido</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Precio unit.</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-gris-dark italic">
                      {isLoading ? 'Cargando…' : q ? `Sin resultados para "${busqueda.trim()}"` : 'Sin materiales para mostrar'}
                    </td>
                  </tr>
                )}
                {visibles.map(r => {
                  const congelado = r.cobro_id != null
                  const val = precioVal(r)
                  const total = Number(r.cantidad) * val
                  const sin = !congelado && Number(r.precio_unit) === 0
                  const m = ESTADO_META[r.estado]
                  if (congelado) {
                    return (
                      <tr key={r.id} className="border-t border-gris opacity-55" title="Imputado a un pago: el precio quedó congelado. Para tocarlo hay que eliminar el pago.">
                        <td className="px-3 py-2">
                          {r.descripcion}
                          <div className="text-[10px] text-gris-dark font-mono">#{r.solicitud_id} · {r.origen === 'deposito' ? 'Depósito' : (r.proveedor_nom ?? 'sin proveedor')}</div>
                        </td>
                        <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.badge}`}>{m.label} 🔒</span></td>
                        <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">{Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span></td>
                        <td className="px-3 py-2 text-right text-xs text-gris-mid">—</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{Number(r.precio_unit).toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-bold">${Math.round(Number(r.precio_total ?? 0)).toLocaleString('es-AR')}</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={r.id} className={`border-t border-gris ${sin ? 'bg-naranja-light/20' : ''}`}>
                      <td className="px-3 py-2">
                        {r.descripcion}
                        <div className="text-[10px] text-gris-dark font-mono">#{r.solicitud_id} · {r.origen === 'deposito' ? 'Depósito' : (r.proveedor_nom ?? 'sin proveedor')}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.badge}`}>{m.label}</span>
                        {/* Dos opciones explícitas, no un botón que alterna: la
                            primera versión (un chip que cambiaba al tocarlo) hizo
                            que el user revirtiera un pago directo sin darse
                            cuenta — parecía una etiqueta, no un control. */}
                        <div className="flex items-center justify-center gap-0.5 mt-1"
                          title="Quién le pagó al proveedor. 'Cliente' lo saca de la deuda: pasa a Pagó directo.">
                          <span className="text-[9px] text-gris-dark mr-0.5">pagó</span>
                          {(['cadinc', 'cliente'] as const).map(op => (
                            <button key={op} type="button"
                              onClick={() => setPagadores(p => ({ ...p, [r.item_id]: op }))}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap border transition-colors ${
                                pagadorDe(r) === op
                                  ? (op === 'cliente' ? 'bg-verde-light text-verde border-verde' : 'bg-azul-light text-azul border-azul')
                                  : 'bg-white text-gris-mid border-gris-mid hover:text-gris-dark'}`}>
                              {op === 'cliente' ? 'Cliente' : 'CADINC'}
                            </button>
                          ))}
                          {pagadorDe(r) !== (r.pagado_por === 'cliente' ? 'cliente' : 'cadinc') && (
                            <span className="text-[9px] font-bold text-naranja" title="Cambio sin guardar">*</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                        {Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                        {(() => {
                          const ref = Number(r.ficha_precio_ref ?? 0)
                          if (!r.material_id) return <span className="text-gris-mid" title="Sin ficha del catálogo">—</span>
                          if (r.ficha_unidad_ok === false) {
                            return (
                              <button type="button" disabled={!puedeCargarPrecios || convirtiendo} onClick={() => { setConvertir(r); setCantNueva('') }}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark hover:opacity-80 disabled:opacity-50"
                                title={`La ficha va por ${unidadLabel(r.ficha_unidad)}${ref > 0 ? ` a ${fmtM(ref)}` : ''}; este renglón está en ${unidadLabel(r.unidad)}. Pasarlo a la unidad de la ficha.`}>
                                ⚠ pasar a {unidadLabel(r.ficha_unidad)}
                              </button>
                            )
                          }
                          if (ref <= 0) return <span className="text-gris-mid" title="La ficha no tiene precio de referencia">sin ref.</span>
                          const yaEsta = precioVal(r) === ref
                          return (
                            <button type="button" disabled={!puedeCargarPrecios || yaEsta} onClick={() => setOverrides(p => ({ ...p, [r.item_id]: String(ref) }))}
                              className={`font-mono px-1.5 py-0.5 rounded ${yaEsta ? 'text-gris-mid' : 'text-azul hover:bg-azul-light'} disabled:cursor-default`}
                              title={yaEsta ? 'Ya tiene el precio de referencia' : 'Usar el precio de referencia del catálogo'}>
                              {fmtM(ref)}
                            </button>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="w-28 ml-auto">
                          <InputMonto value={valorDe(r)} onChange={raw => setOverrides(p => ({ ...p, [r.item_id]: raw }))} placeholder="0" className="text-right font-mono" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-bold">{total > 0 ? fmtM(total) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gris/50 sticky bottom-0">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-bold text-gris-dark uppercase tracking-wider">Total obra</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-sm text-azul">{fmtM(totalObra)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
