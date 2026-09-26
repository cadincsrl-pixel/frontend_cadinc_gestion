'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { LiquidacionDetalle } from '@/types/sueldos.types'
import { useAnularLiquidacion, useReabrirLiquidacion } from '../../hooks/useSueldos'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, inputCls } from '../Comun'

const schema = z.object({
  motivo: z.string().trim().min(3, 'Escribí el motivo (al menos 3 letras)').max(500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>

/** Reabrir o anular una liquidación: las dos piden motivo (queda en la auditoría). */
export function ModalMotivo({ liquidacion: l, accion, onClose }: {
  liquidacion: LiquidacionDetalle; accion: 'reabrir' | 'anular'; onClose: () => void
}) {
  const toast = useToast()
  const reabrir = useReabrirLiquidacion()
  const anular = useAnularLiquidacion()
  const pendiente = reabrir.isPending || anular.isPending
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { motivo: '' } })

  async function enviar(d: FormData) {
    setError(null)
    try {
      if (accion === 'reabrir') {
        const r = await reabrir.mutateAsync({ id: l.id, motivo: d.motivo.trim() })
        toast(r.asiento.accion === 'anulado' ? `✓ ${l.codigo} reabierta; se anuló su asiento` : `✓ ${l.codigo} reabierta`, 'ok')
      } else {
        const r = await anular.mutateAsync({ id: l.id, motivo: d.motivo.trim() })
        const extra = r.asiento.accion === 'contraasiento' ? ' y se generó el contraasiento' : r.asiento.accion === 'anulado' ? ' y su asiento' : ''
        toast(`✓ ${l.codigo} anulada${extra}`, 'ok')
      }
      onClose()
    } catch (e) {
      setError(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={pendiente ? () => {} : onClose} title={accion === 'reabrir' ? `Reabrir ${l.codigo}` : `Anular ${l.codigo}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pendiente}>Cancelar</Button>
        <Button size="sm" variant={accion === 'anular' ? 'danger' : 'primary'} loading={pendiente} onClick={handleSubmit(enviar)}>
          {accion === 'reabrir' ? 'Reabrir' : 'Anular'}
        </Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        {accion === 'reabrir' ? (
          <p>Vuelve a borrador para corregir recibos. Si tiene asiento y el período contable está abierto, el asiento se anula (al cerrar de nuevo se genera otro). Con el período cerrado no se puede reabrir.</p>
        ) : (
          <p>La liquidación queda anulada y no se puede volver atrás. Si tenía asiento se anula (o se genera un contraasiento si el período está cerrado).</p>
        )}
        <Campo label="Motivo" error={errors.motivo?.message}>
          <textarea rows={3} className={inputCls} {...register('motivo')} autoFocus />
        </Campo>
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
