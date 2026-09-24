'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { TesoreriaCuenta } from '@/types/contabilidad.types'
import { useAltaTesoreria, useBajaTesoreria, useTesoreria } from '../hooks/useContabilidad'
import { tesoreriaTipoLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { ErrorCarga, Tarjeta, Th } from './Comun'
import { ModalTesoreria } from './ModalTesoreria'

/**
 * Cuentas de tesorería: los bancos, la caja y la cartera de valores de CADINC.
 * Son el «Sale de la cuenta» de las órdenes de pago de Compras y el auxiliar
 * «tesorería» de los asientos. Cada una se vincula a su cuenta contable.
 */
export function TesoreriaPanel() {
  const toast = useToast()
  const { puedeEditar, editarPlan } = usePermisos('contabilidad')
  const [inactivas, setInactivas] = useState(false)
  const { data, isLoading, isError, refetch } = useTesoreria(inactivas)
  const baja = useBajaTesoreria()
  const alta = useAltaTesoreria()
  const [editando, setEditando] = useState<TesoreriaCuenta | null | undefined>(undefined)

  const bloqueo = !editarPlan ? 'No tenés permiso (hace falta «Editar plan de cuentas»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null

  async function cambiarActivo(t: TesoreriaCuenta) {
    try {
      if (t.activo) await baja.mutateAsync(t.id)
      else await alta.mutateAsync(t.id)
      toast(t.activo ? `✓ ${t.nombre} dada de baja` : `✓ ${t.nombre} reactivada`, 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  const items = data ?? []

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-gris">
        <div>
          <div className="font-bold text-azul">🏦 Cuentas de tesorería</div>
          <div className="text-[11px] text-gris-dark">Bancos, caja y valores de CADINC: de dónde sale la plata de las órdenes de pago.</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivas} onChange={e => setInactivas(e.target.checked)} />
            Mostrar dadas de baja
          </label>
          <Button size="sm" onClick={() => setEditando(null)} disabled={!!bloqueo} title={bloqueo ?? 'Agregar una cuenta de tesorería'}>
            + Nueva
          </Button>
        </div>
      </div>

      {isLoading ? <div className="p-6 text-center text-sm text-gris-dark">Cargando…</div>
        : isError ? <div className="p-3"><ErrorCarga mensaje="No se pudieron traer las cuentas de tesorería." onReintentar={() => void refetch()} /></div>
        : items.length === 0 ? <div className="p-6 text-center text-sm text-gris-dark italic">No hay cuentas de tesorería cargadas.</div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr><Th>Tipo</Th><Th>Nombre</Th><Th>CBU / alias</Th><Th>Cuenta contable</Th><Th>Moneda</Th><Th /></tr>
              </thead>
              <tbody>
                {items.map(t => (
                  <tr key={t.id} className={`border-t border-gris ${t.activo ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 text-xs">{tesoreriaTipoLabel(t.tipo)}</td>
                    <td className="px-3 py-2 text-sm">
                      {t.nombre}
                      {t.banco && t.banco !== t.nombre && <span className="text-xs text-gris-dark"> · {t.banco}</span>}
                      {t.ventas_cuenta_id && <span className="ml-1 text-[10px] px-1 rounded bg-azul-light text-azul font-bold" title="Vinculada a la cuenta bancaria de Ventas (FCE)">Ventas</span>}
                      {!t.activo && <span className="ml-1 text-[10px] px-1 rounded bg-gris text-gris-dark font-bold uppercase">baja</span>}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">{[t.cbu, t.alias].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {t.cuenta_id
                        ? <><span className="font-mono">{t.cuenta_codigo}</span> {t.cuenta_nombre}</>
                        : <span className="text-naranja-dark font-semibold">sin vincular</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{t.moneda}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" disabled={!!bloqueo} title={bloqueo ?? 'Editar'} onClick={() => setEditando(t)}
                        className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Editar</button>
                      <button type="button" disabled={!!bloqueo || baja.isPending || alta.isPending}
                        title={bloqueo ?? (t.activo ? 'Dar de baja: deja de ofrecerse en Compras' : 'Reactivar')}
                        onClick={() => void cambiarActivo(t)}
                        className="text-xs px-2 py-1 rounded text-gris-dark hover:bg-gris font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                        {t.activo ? 'Baja' : 'Alta'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {editando !== undefined && <ModalTesoreria key={editando?.id ?? 'nueva'} cuenta={editando} onClose={() => setEditando(undefined)} />}
    </Tarjeta>
  )
}
