'use client'

import { useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useDevolverAlDeposito } from '../hooks/useSolicitudes'

/**
 * Devolver al depósito material que sobró en la obra.
 *
 * Cubre dos situaciones que en el fondo son la misma: material que llegó a la
 * obra y vuelve (se mandaron 20 lts, vuelven 15), y material despachado que
 * nunca salió del galpón porque la obra avisó que ya no lo necesita. En los
 * dos casos hay que reponer stock y bajar lo que se le cobra al cliente.
 *
 * Lo que pasa con la plata lo decide el backend según el renglón:
 *  · todavía no cobrado → se descuenta de lo enviado
 *  · ya cobrado         → la cuenta no se toca y sale una nota de crédito
 * El modal lo anticipa para que quien devuelve sepa qué va a pasar ANTES de
 * confirmar, en vez de enterarse por el toast.
 */

interface ItemDevolver {
  id:          number
  descripcion: string
  cantidad:    number
  unidad:      string
  precio_unit?: number | null
  /** Viene de la fila de la cuenta: si está cobrada o certificada, es crédito. */
  congelada?:  boolean
  /** Cuánto salió por remito. */
  cantidad_enviada?: number | null
  /** Si el remito ya se emitió, no se cancela aunque no haya salido nada. */
  remito_envio_id?: number | null
}

interface Props {
  item:       ItemDevolver
  onClose:    () => void
  onSuccess?: () => void
}

export function DevolverDepositoModal({ item, onClose, onSuccess }: Props) {
  const toast = useToast()
  const { cargarPrecios, esAdmin } = usePermisos('certificaciones')
  const { mutate: devolver, isPending } = useDevolverAlDeposito()

  const [cantidad, setCantidad] = useState('')
  const [motivo,   setMotivo]   = useState('')

  const num       = Number(cantidad.replace(',', '.'))
  const valida    = cantidad.trim() !== '' && Number.isFinite(num) && num > 0 && num <= item.cantidad
  const seExcede  = cantidad.trim() !== '' && Number.isFinite(num) && num > item.cantidad
  const restante  = valida ? item.cantidad - num : null

  // Devolver un renglón ya cobrado emite un crédito, y eso pide `cargar_precios`.
  const esCredito   = !!item.congelada
  const puedeCredito = cargarPrecios || esAdmin
  const bloqueado    = esCredito && !puedeCredito

  // Vuelve TODO y nunca salió por remito: no es una devolución, es cancelar el
  // renglón. Conviene decirlo antes y no después (20260913p).
  const cancela = valida && restante === 0
    && Number(item.cantidad_enviada ?? 0) === 0
    && item.remito_envio_id == null

  const monto = valida && item.precio_unit ? num * Number(item.precio_unit) : null
  const plata = monto?.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

  function cerrar() { setCantidad(''); setMotivo(''); onClose() }

  function guardar() {
    if (!valida) {
      toast(seExcede
        ? `No se puede devolver más de lo que salió (${item.cantidad} ${item.unidad})`
        : 'Poné una cantidad mayor a 0', 'err')
      return
    }
    devolver({ itemId: item.id, cantidad: num, motivo: motivo.trim() || undefined }, {
      onSuccess: (r) => {
        toast(
          // "Quedan X en la obra" sería mentira si se canceló: no quedó nada
          // en la obra, el renglón nunca salió del depósito.
          r.cancelado     ? '✓ Renglón cancelado. Vuelve entero al depósito y queda rechazado en el pedido.' :
          r.saldo_a_favor ? `✓ Devuelto. Nota de crédito por ${Number(r.monto_credito ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`
                          : `✓ Devuelto. Quedan ${r.cantidad_restante} ${item.unidad} en la obra`, 'ok')
        cerrar()
        onSuccess?.()
      },
      onError: (err: unknown) => {
        const code = (err as { body?: { error?: string } })?.body?.error
        const msg =
          code === 'SIN_PERMISO_ACREDITAR'          ? 'Ese renglón ya está cobrado: devolverlo emite una nota de crédito y no tenés permiso para eso.' :
          code === 'CANTIDAD_MAYOR_A_LA_DESPACHADA' ? 'Estás devolviendo más de lo que salió.' :
          code === 'ES_HERRAMIENTA'                 ? 'Las herramientas vuelven por el pañol, no por acá.' :
          code === 'ITEM_NO_RESUELTO'               ? 'El renglón todavía no se compró ni se despachó: no hay nada que devolver.' :
          (err as Error).message || 'No se pudo registrar la devolución'
        toast(msg, 'err')
      },
    })
  }

  return (
    <Modal
      open
      onClose={cerrar}
      title="↩ Devolver al depósito"
      footer={
        <>
          <Button variant="secondary" onClick={cerrar} disabled={isPending}>Cancelar</Button>
          <Button
            onClick={guardar}
            loading={isPending}
            disabled={!valida || bloqueado}
            title={bloqueado ? 'Sin permiso para emitir notas de crédito' : undefined}
          >
            Confirmar devolución
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm">
          <div className="font-bold">{item.descripcion}</div>
          <div className="text-gris">Salieron {item.cantidad} {item.unidad}</div>
        </div>

        <div className="flex-1 min-w-0">
          <Input
            label={`¿Cuánto vuelve? (${item.unidad})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            placeholder={String(item.cantidad)}
            error={seExcede ? `No puede ser más de ${item.cantidad}` : undefined}
            hint={restante !== null ? `Quedan ${restante} ${item.unidad} en la obra` : 'Lo que vuelve al galpón, no lo que queda'}
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">Motivo <span className="text-gris font-normal">(opcional)</span></span>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Sobró en obra, la obra ya no lo necesita…"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </label>

        {/* Qué va a pasar con la plata, ANTES de confirmar. */}
        {cancela ? (
          <div className="text-xs rounded p-2 bg-azul-light text-azul">
            Vuelve <b>todo</b> y este renglón <b>todavía no tiene remito</b>, así que no es una
            devolución: se <b>cancela</b>. El material vuelve al depósito y el renglón queda
            rechazado en el pedido, conservando su cantidad para que se vea qué se había pedido.
          </div>
        ) : esCredito ? (
          <div className="text-xs rounded p-2 bg-amarillo-light text-amarillo-dark">
            Este renglón <b>ya está cobrado</b>, así que la cuenta no se toca: se emite una
            <b> nota de crédito</b> a favor del cliente{plata ? <> por <b>{plata}</b></> : null}.
            {bloqueado && <div className="mt-1 font-bold">No tenés permiso para emitir notas de crédito.</div>}
          </div>
        ) : (
          <div className="text-xs rounded p-2 bg-gris-light text-gris-dark">
            Todavía no está cobrado: se <b>descuenta de lo enviado</b>
            {plata ? <>, y la cuenta del cliente baja <b>{plata}</b></> : null}.
          </div>
        )}

        <div className="text-xs text-gris">El material vuelve al stock del depósito.</div>
      </div>
    </Modal>
  )
}
