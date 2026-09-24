'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { CtbPeriodo } from '@/types/contabilidad.types'
import { useReabrirPeriodo } from '../hooks/useContabilidad'
import { nombreMes } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'

/**
 * Reabrir el último período cerrado. Los números de sus asientos se BORRAN y
 * se vuelven a asignar al cerrarlo: si el diario ya se imprimió o se mandó al
 * contador, los números de ese papel dejan de coincidir.
 */

const schema = z.object({
  motivo: z.string().refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)').refine(v => v.length <= 500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>

export function ModalReabrirPeriodo({ periodo, onClose }: { periodo: CtbPeriodo; onClose: () => void }) {
  const toast = useToast()
  const reabrir = useReabrirPeriodo()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema), defaultValues: { motivo: '' },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    try {
      const r = await reabrir.mutateAsync({ id: periodo.id, motivo: d.motivo.trim() })
      toast(`✓ ${nombreMes(periodo.desde)} reabierto${r.desnumerados ? ` · ${r.desnumerados} asiento${r.desnumerados === 1 ? '' : 's'} sin número` : ''}`, 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  return (
    <Modal open onClose={reabrir.isPending ? () => {} : onClose} width="max-w-md" title={`Reabrir ${nombreMes(periodo.desde)}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={reabrir.isPending}>Cancelar</Button>
        <Button variant="danger" size="sm" loading={reabrir.isPending} onClick={handleSubmit(enviar)}>Reabrir</Button>
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <Aviso tono="amarillo">
          Se van a <b>borrar los números</b> de los {periodo.cant_confirmados} asiento{periodo.cant_confirmados === 1 ? '' : 's'} del período
          {periodo.numero_desde ? ` (N° ${periodo.numero_desde} a ${periodo.numero_hasta})` : ''}. Se vuelven a numerar al cerrarlo.
          Si el libro diario ya se imprimió o se mandó al contador, esos números dejan de coincidir.
        </Aviso>
        <Campo label="Motivo" error={errors.motivo?.message}>
          <input {...register('motivo')} autoFocus maxLength={500} placeholder="Ej.: faltó cargar una factura de julio" className={inputCls} />
        </Campo>
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
