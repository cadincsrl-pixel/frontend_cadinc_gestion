'use client'

import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAplicarNc, useFacturasAcreditables } from '../hooks/usePagos'
import { comprobanteTxt, fmtM } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { AcreditaA, aplicaADe, validarAcredita, type MontosAcredita } from './AcreditaA'
import type { PagosFactura } from '@/types/domain.types'

/**
 * «Aplicar crédito» de una NC ya aprobada (20260925): el crédito sobrante NO
 * se aplica solo (decisión del dueño), se elige a mano a qué facturas del
 * proveedor baja deuda. Solo AGREGA: lo que ya estaba aplicado no se toca.
 */

interface Props {
  nc:      Pick<PagosFactura, 'id' | 'proveedor_id' | 'proveedor_nom' | 'tipo_comprobante' | 'numero' | 'nc_disponible'>
  onClose: () => void
}

interface FormAplicar { montos: MontosAcredita }

export function ModalAplicarNc({ nc, onClose }: Props) {
  const toast = useToast()
  const aplicar = useAplicarNc()
  const candidatas = useFacturasAcreditables(nc.proveedor_id)
  const facturas = useMemo(() => (candidatas.data?.items ?? []).filter(f => f.clase !== 'nota_credito'), [candidatas.data])
  const disponible = Number(nc.nc_disponible ?? 0)

  // El schema depende de las facturas (el tope de cada una), así que se arma acá.
  const schema = useMemo(() => z.object({
    montos: z.record(z.string(), z.string()),
  }).superRefine((v, ctx) => {
    const val = validarAcredita(v.montos, facturas, disponible)
    if (val.suma <= 0) ctx.addIssue({ code: 'custom', path: ['montos'], message: 'Elegí al menos una factura y el monto a acreditar.' })
    else if (val.excedeTotal) ctx.addIssue({ code: 'custom', path: ['montos'], message: `La NC tiene ${fmtM(disponible)} de crédito: no alcanza para tanto.` })
    else if (Object.keys(val.errores).length > 0) ctx.addIssue({ code: 'custom', path: ['montos'], message: 'Hay montos que superan lo que le queda a su factura.' })
  }), [facturas, disponible])

  const form = useForm<FormAplicar>({ resolver: zodResolver(schema), defaultValues: { montos: {} } })
  // En un campo Record, RHF tipa `message` como string | FieldError: se queda con el texto.
  const msg = form.formState.errors.montos?.message
  const error = typeof msg === 'string' ? msg : undefined

  async function onSubmit(data: FormAplicar) {
    try {
      const r = await aplicar.mutateAsync({ id: nc.id, aplica_a: aplicaADe(data.montos) })
      const queda = Number(r.nc.nc_disponible ?? 0)
      toast(`✓ Crédito aplicado a ${r.facturas.length} factura${r.facturas.length === 1 ? '' : 's'}${queda > 0 ? ` · le quedan ${fmtM(queda)}` : ''}`, 'ok')
      onClose()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <Modal
      open onClose={onClose} width="max-w-2xl"
      title={`Aplicar crédito · NC ${comprobanteTxt(nc.tipo_comprobante, nc.numero)}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={form.handleSubmit(onSubmit)} loading={aplicar.isPending}
            disabled={disponible <= 0 || facturas.length === 0}
            title={disponible <= 0 ? 'La NC no tiene crédito disponible'
              : facturas.length === 0 ? 'El proveedor no tiene facturas abiertas' : undefined}>
            Aplicar crédito
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          {nc.proveedor_nom} tiene <b className="font-mono text-[#5A2D82]">{fmtM(disponible)}</b> de crédito en esta nota de crédito.
          Lo que acredites acá baja la deuda de esas facturas sin que salga plata, y queda firme: no se deshace desde la pantalla.
        </div>
        <Controller
          name="montos"
          control={form.control}
          render={({ field }) => (
            <AcreditaA facturas={facturas} cargando={candidatas.isLoading}
              montos={field.value} onChange={field.onChange} totalMax={disponible}
              etiquetaResto="sigue como crédito a favor" />
          )}
        />
        {candidatas.error && <div className="text-xs text-rojo">{mensajeErrorPagos(candidatas.error)}</div>}
        {error && <div className="text-xs text-rojo">{error}</div>}
      </div>
    </Modal>
  )
}
