'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { TesMovimiento } from '@/types/contabilidad.types'
import { useAnularMovimiento } from '../hooks/useContabilidad'
import { fmtFecha, fmtM } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { cuentasMovimiento, numeroMovimiento } from '../utils/fondos'
import { Aviso, Campo, inputCls } from './Comun'

/**
 * Anular un movimiento de fondos. No hay borrado: queda en el historial con
 * el motivo. Si ya tenía asiento, el motor lo anula al contabilizar (período
 * abierto) o genera el contraasiento en el primer día abierto (período
 * cerrado). Se puede anular aunque el mes esté cerrado.
 */

const schema = z.object({
  motivo: z.string()
    .refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)')
    .refine(v => v.length <= 500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>

export function ModalAnularMovimiento({ mov, onClose, onAnulado }: {
  mov:       TesMovimiento
  onClose:   () => void
  onAnulado: () => void
}) {
  const toast = useToast()
  const anular = useAnularMovimiento()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { motivo: '' },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    try {
      await anular.mutateAsync({ id: mov.id, motivo: d.motivo.trim() })
      toast(`✓ ${numeroMovimiento(mov.numero)} anulado`, 'ok')
      onAnulado()
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={anular.isPending ? () => {} : onClose} width="max-w-lg" title={`Anular ${numeroMovimiento(mov.numero)}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={anular.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={anular.isPending} onClick={handleSubmit(enviar)}>Anular</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          {fmtFecha(mov.fecha)} · {mov.concepto_nombre ?? 'Transferencia'} · {cuentasMovimiento(mov)} · <span className="font-mono tabular-nums">{fmtM(mov.importe_ars)}</span>
        </div>
        <Aviso tono={mov.asiento_id ? 'amarillo' : 'gris'}>
          {mov.asiento_id
            ? <>Ya tiene asiento: al volver a contabilizar, el motor lo <b>anula</b> si su mes está abierto, o genera un <b>contraasiento</b> en el primer día abierto si está cerrado.</>
            : <>Todavía no tiene asiento: queda anulado y no se va a contabilizar.</>}
          {' '}El movimiento no se borra: queda en el historial con el motivo.
        </Aviso>
        <Campo label="Motivo" error={errors.motivo?.message}>
          <input {...register('motivo')} maxLength={500} autoFocus placeholder="Ej.: se cargó dos veces" className={inputCls} />
        </Campo>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
