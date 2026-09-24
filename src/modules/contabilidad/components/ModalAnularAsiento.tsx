'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { CtbAnularRes, CtbAsiento } from '@/types/contabilidad.types'
import { useAnularAsiento } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, hoyAR, numeroAsiento } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'

/**
 * Anular un asiento confirmado. Depende del período:
 *  - abierto: el asiento queda anulado (sin número, fuera de los reportes);
 *  - cerrado: el período no se toca. Se genera un CONTRAASIENTO (debe y haber
 *    invertidos) con fecha en un período abierto, que por defecto es hoy.
 */

const schema = z.object({
  motivo: z.string().refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)').refine(v => v.length <= 500, 'Hasta 500 caracteres'),
  fecha:  z.string(),
})
type FormData = z.infer<typeof schema>

export function ModalAnularAsiento({ asiento, onClose, onVerAsiento }: {
  asiento:      CtbAsiento
  onClose:      () => void
  onVerAsiento: (id: number) => void
}) {
  const toast = useToast()
  const anular = useAnularAsiento()
  const cerrado = asiento.periodo_estado === 'cerrado'
  const [resultado, setResultado] = useState<CtbAnularRes | null>(null)
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { motivo: '', fecha: hoyAR() },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    if (cerrado && d.fecha && d.fecha < asiento.fecha) {
      setError('fecha', { message: 'No puede ser anterior a la fecha del asiento original' })
      return
    }
    try {
      const r = await anular.mutateAsync({ id: asiento.id, motivo: d.motivo.trim(), fecha: cerrado ? d.fecha || undefined : undefined })
      setResultado(r)
      toast(r.accion === 'contraasiento' ? '✓ Se generó el contraasiento' : '✓ Asiento anulado', 'ok')
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  if (resultado) {
    const c = resultado.contraasiento
    return (
      <Modal open onClose={onClose} title="Asiento anulado" width="max-w-lg"
        footer={<>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          {c && <Button size="sm" onClick={() => onVerAsiento(c.id)}>Ver el contraasiento</Button>}
        </>}>
        {c ? (
          <Aviso tono="verde">
            El período del asiento está cerrado, así que se generó un <b>contraasiento</b> del {fmtFecha(c.fecha)} por {fmtM(c.total)},
            con el debe y el haber invertidos. El original queda como estaba, marcado como revertido.
          </Aviso>
        ) : (
          <Aviso tono="verde">El asiento quedó anulado: sin número y fuera del diario, el mayor y sumas y saldos.</Aviso>
        )}
      </Modal>
    )
  }

  return (
    <Modal open onClose={anular.isPending ? () => {} : onClose} width="max-w-lg"
      title={`Anular asiento ${numeroAsiento(asiento.numero)}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={anular.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={anular.isPending} onClick={handleSubmit(enviar)}>
          {cerrado ? 'Generar contraasiento' : 'Anular'}
        </Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-gris-dark">{fmtFecha(asiento.fecha)} · {asiento.glosa} · {fmtM(asiento.total)}</div>
        {cerrado ? (
          <Aviso tono="amarillo">
            El período de este asiento está <b>cerrado</b>: no se modifica. Se va a generar un <b>contraasiento</b> (el mismo
            asiento con el debe y el haber invertidos) con la fecha que elijas, que tiene que caer en un período abierto.
          </Aviso>
        ) : (
          <Aviso tono="gris">
            El asiento queda anulado: sin número y fuera de los reportes. Queda en el historial con el motivo.
          </Aviso>
        )}
        <Campo label="Motivo" error={errors.motivo?.message}>
          <input {...register('motivo')} maxLength={500} autoFocus placeholder="Ej.: se imputó a la cuenta equivocada" className={inputCls} />
        </Campo>
        {cerrado && (
          <Campo label="Fecha del contraasiento" error={errors.fecha?.message}>
            <input type="date" {...register('fecha')} min={asiento.fecha} className={inputCls} />
          </Campo>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
