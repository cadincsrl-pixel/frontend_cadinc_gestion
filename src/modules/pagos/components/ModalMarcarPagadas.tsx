'use client'

import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useCuentasOrigen, useMarcarPagadas } from '../hooks/usePagos'
import { esNC, fmtM, hoyAR, topePagable } from '../utils/pagos.utils'
import { detalleErrorPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import { TIPO_CUENTA_ORIGEN_LABEL } from './SelectCuentaOrigen'
import type { PagosFactura } from '@/types/domain.types'

/**
 * «Marcar pagadas (tarjeta / Mercado Pago)» (20260927h).
 *
 * Las compras de Mercado Libre y similares son facturas de VENDEDORES
 * DISTINTOS que ya se pagaron en el momento con la tarjeta de la empresa o con
 * saldo de Mercado Pago. Esto crea UNA orden de pago POR FACTURA, cada una a
 * su proveedor, por lo que le queda pagable. Todo o nada.
 *
 * Es un hecho consumado, igual que «ya está pagada» al cargar con tarjeta: no
 * pide aprobación previa y admite importadas sin imputar. La forma de pago no
 * se elige: sale del tipo de la cuenta (tarjeta → tarjeta; billetera → otro).
 */

/** Las que se pueden marcar: facturas (no NC) vigentes, que paga CADINC y con algo pagable. */
export function marcablesComoPagadas(facturas: PagosFactura[]): PagosFactura[] {
  return facturas.filter(f => !esNC(f) && ['pendiente', 'observada'].includes(f.estado)
    && !f.paga_cliente && topePagable(f) > 0)
}

const schema = z.object({
  cuenta_origen_id: z.string().min(1, 'Elegí la tarjeta o la billetera'),
  fecha: z.string().refine(v => v === '' || v <= hoyAR(), 'No puede ser futura'),
})
type FormData = z.infer<typeof schema>

const MAX = 200

export function ModalMarcarPagadas({ facturas, onClose, onHecho }: {
  facturas: PagosFactura[]
  onClose:  () => void
  onHecho?: () => void
}) {
  const toast = useToast()
  const { puedeCrear, esAdmin } = usePermisos('pagos')
  const puede = !!(puedeCrear || esAdmin)
  const cuentas = useCuentasOrigen()
  const marcar = useMarcarPagadas()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const aptas = useMemo(() => marcablesComoPagadas(facturas), [facturas])
  const afuera = facturas.length - aptas.length
  const total = aptas.reduce((s, f) => s + topePagable(f), 0)
  const proveedores = new Set(aptas.map(f => f.proveedor_id)).size
  // La fecha elegida no puede ser anterior a ninguna factura.
  const fechaMin = aptas.reduce((m, f) => (f.fecha > m ? f.fecha : m), '')

  const opciones = useMemo(() => (cuentas.data ?? []).filter(c => c.tipo === 'tarjeta' || c.tipo === 'billetera'), [cuentas.data])

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { cuenta_origen_id: '', fecha: '' },
  })
  const cuentaSel = useWatch({ control, name: 'cuenta_origen_id' })
  const cuenta = opciones.find(c => String(c.id) === cuentaSel) ?? null

  const bloqueo = !puede ? 'No tenés permiso para cargar facturas en Compras'
    : aptas.length === 0 ? 'De lo seleccionado no hay facturas con saldo para marcar'
    : aptas.length > MAX ? `Son ${aptas.length}: el máximo es ${MAX} por vez`
    : !cuentas.isLoading && opciones.length === 0 ? 'No hay tarjetas ni billeteras cargadas (Contabilidad › Plan › Cuentas de tesorería)'
    : null

  async function guardar(d: FormData) {
    setErrorServer(null)
    if (!cuenta) return
    if (d.fecha && fechaMin && d.fecha < fechaMin) {
      setErrorServer(`La fecha no puede ser anterior a la de alguna factura (la más nueva es del ${fechaMin.split('-').reverse().join('/')}).`)
      return
    }
    try {
      const r = await marcar.mutateAsync({
        factura_ids: aptas.map(f => f.id),
        cuenta_origen_id: cuenta.id,
        forma_pago: cuenta.tipo === 'tarjeta' ? 'tarjeta' : 'otro',
        ...(d.fecha ? { fecha: d.fecha } : {}),
      })
      toast(`✓ ${r.ordenes.length} factura${r.ordenes.length === 1 ? '' : 's'} marcada${r.ordenes.length === 1 ? '' : 's'} como pagada${r.ordenes.length === 1 ? '' : 's'} (${fmtM(r.total)})`, 'ok')
      onHecho?.()
      onClose()
    } catch (e) {
      const idFallo = Number(detalleErrorPagos(e)?.factura_id)
      const cual = Number.isInteger(idFallo) ? aptas.find(f => f.id === idFallo) : undefined
      setErrorServer(`${mensajeErrorPagos(e)}${cual ? ` (factura de ${cual.proveedor_nom}, ${cual.numero ?? 's/n'})` : ''} No se marcó ninguna.`)
    }
  }

  return (
    <Modal open onClose={marcar.isPending ? () => {} : onClose} width="max-w-lg" title="Marcar pagadas (tarjeta / Mercado Pago)"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={marcar.isPending}>Cancelar</Button>
        <Button size="sm" onClick={handleSubmit(guardar)} loading={marcar.isPending} disabled={!!bloqueo}
          title={bloqueo ?? `Registrar ${aptas.length} pago(s), uno por factura`}>
          Marcar {aptas.length} pagada{aptas.length === 1 ? '' : 's'}
        </Button>
      </>}>
      <form className="flex flex-col gap-3 text-sm" onSubmit={e => e.preventDefault()}>
        <div className="grid grid-cols-3 gap-2">
          <Dato label="Facturas" valor={String(aptas.length)} />
          <Dato label="Proveedores" valor={String(proveedores)} />
          <Dato label="Total" valor={fmtM(total)} />
        </div>
        {afuera > 0 && (
          <div className="border rounded p-2 text-xs bg-amarillo-light border-amarillo/40 text-[#7A5000]">
            Quedan afuera {afuera}: notas de crédito, anuladas, pagadas, ya aprobadas (esas se pagan con una orden de pago normal), las que paga el cliente o sin saldo.
          </div>
        )}
        <p className="text-xs text-gris-dark">
          Se registra <b>una orden de pago por factura</b>, cada una a su proveedor y por lo que le queda. Es para compras que ya se
          pagaron con la tarjeta de la empresa o con saldo de Mercado Pago: no hace falta aprobarlas antes.
        </p>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">Se pagó con</label>
          <select {...register('cuenta_origen_id')} disabled={cuentas.isLoading || opciones.length === 0}
            className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja disabled:bg-gris">
            <option value="">{cuentas.isLoading ? 'Cargando…' : cuentas.isError ? 'No se pudieron traer las cuentas' : opciones.length === 0 ? 'No hay tarjetas ni billeteras' : 'Elegí la tarjeta o la billetera…'}</option>
            {(['tarjeta', 'billetera'] as const).map(t => {
              const items = opciones.filter(c => c.tipo === t)
              return items.length === 0 ? null : (
                <optgroup key={t} label={TIPO_CUENTA_ORIGEN_LABEL[t]}>
                  {items.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}{c.banco ? ` · ${c.banco}` : ''}{c.moneda !== 'ARS' ? ` (${c.moneda})` : ''}</option>)}
                </optgroup>
              )
            })}
          </select>
          {errors.cuenta_origen_id && <div className="text-xs text-rojo mt-0.5">{errors.cuenta_origen_id.message}</div>}
          {cuenta && <div className="text-[11px] text-gris-dark mt-0.5">Forma de pago: {cuenta.tipo === 'tarjeta' ? 'tarjeta' : 'otro (saldo de billetera)'}</div>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gris-dark mb-1">Fecha del pago <span className="font-normal">· opcional</span></label>
          <input type="date" {...register('fecha')} min={fechaMin || undefined} max={hoyAR()}
            className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja" />
          <div className="text-[11px] text-gris-dark mt-0.5">Si la dejás vacía, cada una se paga en la fecha de su factura.</div>
          {errors.fecha && <div className="text-xs text-rojo mt-0.5">{errors.fecha.message}</div>}
        </div>
        {errorServer && <div className="border rounded p-2 text-xs bg-rojo-light border-rojo/30 text-rojo">{errorServer}</div>}
      </form>
    </Modal>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="px-2 py-1.5 rounded border border-gris-mid">
      <div className="text-[10px] font-bold text-gris-dark uppercase">{label}</div>
      <div className="font-mono font-bold tabular-nums">{valor}</div>
    </div>
  )
}
