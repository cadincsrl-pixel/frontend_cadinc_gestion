'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { CtbBienUso } from '@/types/contabilidad.types'
import { useBajaBien } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, hoyAR } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'

/**
 * Dar de baja un bien de uso (venta, rotura, robo, desuso). Se amortiza hasta
 * el mes ANTERIOR a la baja (P-B2). El asiento de baja (valor de origen,
 * acumulada y resultado) queda fuera de alcance por ahora: se carga a mano.
 * Se puede revertir desde la ficha.
 */

function crearSchema(fechaAlta: string) {
  return z.object({
    fecha:  z.string().min(1, 'Poné la fecha de baja'),
    motivo: z.string()
      .refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)')
      .refine(v => v.length <= 500, 'Hasta 500 caracteres'),
  }).superRefine((d, ctx) => {
    if (d.fecha && d.fecha < fechaAlta) ctx.addIssue({ code: 'custom', path: ['fecha'], message: `No puede ser anterior al alta (${fmtFecha(fechaAlta)})` })
    if (d.fecha && d.fecha > hoyAR()) ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'No puede ser posterior a hoy' })
  })
}
type FormData = z.infer<ReturnType<typeof crearSchema>>

export function ModalBajaBien({ bien, onClose }: { bien: CtbBienUso; onClose: () => void }) {
  const toast = useToast()
  const baja = useBajaBien()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(crearSchema(bien.fecha_alta)),
    defaultValues: { fecha: hoyAR(), motivo: '' },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    try {
      await baja.mutateAsync({ id: bien.id, fecha: d.fecha, motivo: d.motivo.trim() })
      toast(`✓ ${bien.codigo} dado de baja`, 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={baja.isPending ? () => {} : onClose} width="max-w-lg" title={`Dar de baja ${bien.codigo}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={baja.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={baja.isPending} onClick={handleSubmit(enviar)}>Dar de baja</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">
          {bien.descripcion} · alta {fmtFecha(bien.fecha_alta)} · valor de origen <span className="font-mono tabular-nums">{fmtM(bien.valor_origen)}</span>
        </div>
        <Aviso tono="gris">
          Se amortiza hasta el mes anterior a la baja. El asiento de la baja (sacar el valor de origen y la acumulada, y el resultado
          por la venta o la pérdida) no se genera solo: cargalo como asiento manual.
        </Aviso>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
          <Campo label="Fecha de baja" error={errors.fecha?.message}>
            <input type="date" min={bien.fecha_alta} max={hoyAR()} {...register('fecha')} className={inputCls} />
          </Campo>
          <Campo label="Motivo" error={errors.motivo?.message}>
            <input {...register('motivo')} maxLength={500} autoFocus placeholder="Ej.: vendido a …" className={inputCls} />
          </Campo>
        </div>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
