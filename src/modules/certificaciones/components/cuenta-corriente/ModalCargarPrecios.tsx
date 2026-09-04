'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { useGuardarPreciosMCC } from '../../hooks/useCuentaCliente'
import { fetchCuentaRenglonesTodos, CUENTA_CORRIENTE_KEY } from '../../hooks/useCuentaCorriente'
import type { CuentaRenglon } from '@/types/domain.types'
import { ESTADO_META, fmtM } from './cuentaCorriente.utils'

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
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...CUENTA_CORRIENTE_KEY, 'obra-todos', obraCod],
    queryFn:  () => fetchCuentaRenglonesTodos({ obra_cod: obraCod }),
    enabled:  open && !!obraCod,
  })
  const { mutate: guardarPrecios, isPending } = useGuardarPreciosMCC()

  const [overrides, setOverrides] = useState<Record<number, string>>({})
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

  const cambios       = editables.filter(r => precioVal(r) !== Number(r.precio_unit))
  const sinPrecio     = editables.filter(r => Number(r.precio_unit) === 0).length
  const totalObra     = editables.reduce((s, r) => s + Number(r.cantidad) * precioVal(r), 0)
  const q             = busqueda.trim().toLowerCase()
  const visibles      = editables
    .filter(r => !soloSinPrecio || Number(r.precio_unit) === 0)
    .filter(r => !q || r.descripcion.toLowerCase().includes(q))

  function cerrar() { setOverrides({}); setSoloSinPrecio(false); setBusqueda(''); onClose() }

  function guardar() {
    if (cambios.length === 0) { toast('No cambiaste ningún precio', 'err'); return }
    const aCero = cambios.filter(r => Number(r.precio_unit) > 0 && precioVal(r) === 0).length
    if (aCero > 0 && !confirm(`Vas a dejar en $0 ${aCero} material(es) que tenían precio cargado.\n¿Continuar?`)) return
    guardarPrecios(cambios.map(r => ({ itemId: r.item_id, precio_unit: precioVal(r) })), {
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
          <Button variant="primary" loading={isPending} disabled={cambios.length === 0} onClick={guardar}>
            ✓ Guardar precios ({cambios.length})
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
              {cobrados > 0 && ` ${cobrados} ya cobrado${cobrados !== 1 ? 's' : ''} no se pueden retasar.`}
            </>}
          </div>
          {sinPrecio > 0 && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark cursor-pointer shrink-0">
              <input type="checkbox" className="accent-naranja" checked={soloSinPrecio} onChange={e => setSoloSinPrecio(e.target.checked)} />
              Solo sin precio ({sinPrecio})
            </label>
          )}
        </div>
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
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gris sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Material</th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Estado</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Cant.</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Precio unit.</th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-gris-dark italic">
                      {isLoading ? 'Cargando…' : q ? `Sin resultados para "${busqueda.trim()}"` : 'Sin materiales para mostrar'}
                    </td>
                  </tr>
                )}
                {visibles.map(r => {
                  const val = precioVal(r)
                  const total = Number(r.cantidad) * val
                  const sin = Number(r.precio_unit) === 0
                  const m = ESTADO_META[r.estado]
                  return (
                    <tr key={r.id} className={`border-t border-gris ${sin ? 'bg-naranja-light/20' : ''}`}>
                      <td className="px-3 py-2">
                        {r.descripcion}
                        <div className="text-[10px] text-gris-dark font-mono">#{r.solicitud_id} · {r.origen === 'deposito' ? 'Depósito' : (r.proveedor_nom ?? 'sin proveedor')}</div>
                      </td>
                      <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.badge}`}>{m.label}</span></td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                        {Number(r.cantidad).toLocaleString('es-AR')} <span className="text-gris-dark">{r.unidad}</span>
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
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-gris-dark uppercase tracking-wider">Total obra</td>
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
