'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useCreateCobro } from '../hooks/useAlquiler'
import { MEDIO_COBRO_OPTIONS, type MedioCobro } from '../types'

// ── Form tipado (sin useForm<any>) ──
// El monto entra como string (value de <input type="number">) y se coacciona
// con Number(): vacío/NaN/≤0 → error de validación. El backend revalida igual.
const MEDIOS = MEDIO_COBRO_OPTIONS.map(o => o.value) as [MedioCobro, ...MedioCobro[]]

const schema = z.object({
  fecha: z.string().min(1, 'La fecha es requerida'),
  monto: z.string()
    .min(1, 'El monto es requerido')
    .refine(v => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0
    }, 'Ingresá un monto mayor a 0'),
  medio: z.enum(MEDIOS),
  obs:   z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

function hoyISO(): string {
  return toISO(new Date())
}

interface Props {
  open:           boolean
  onClose:        () => void
  clienteId:      number
  clienteNombre:  string
}

export function RegistrarCobroModal({ open, onClose, clienteId, clienteNombre }: Props) {
  const toast = useToast()
  const { mutate: create, isPending } = useCreateCobro()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: hoyISO(), monto: '', medio: 'efectivo', obs: '' },
  })

  // Resetear a valores frescos cada vez que se (re)abre el modal para un
  // cliente. Sin esto, la fecha "hoy" quedaría congelada del primer montaje.
  useEffect(() => {
    if (open) reset({ fecha: hoyISO(), monto: '', medio: 'efectivo', obs: '' })
  }, [open, clienteId, reset])

  function onSubmit(data: FormData) {
    create(
      {
        cliente_id: clienteId,
        fecha:      data.fecha,
        monto:      Number(data.monto),
        medio:      data.medio,
        obs:        data.obs?.trim() || null,
      },
      {
        onSuccess: () => {
          toast('✓ Cobro registrado', 'ok')
          onClose()
        },
        onError: (err: unknown) =>
          toast(mensajeError(err, 'No se pudo registrar el cobro'), 'err'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`💵 REGISTRAR COBRO — ${clienteNombre}`}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit(onSubmit)}>
            ✓ Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Fecha" type="date" error={errors.fecha?.message} {...register('fecha')} />
          <Input
            label="Monto ($)"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="0"
            error={errors.monto?.message}
            {...register('monto')}
          />
        </div>
        <Select
          label="Medio"
          options={MEDIO_COBRO_OPTIONS}
          error={errors.medio?.message}
          {...register('medio')}
        />
        <Input label="Observaciones" placeholder="Opcional" {...register('obs')} />
      </div>
    </Modal>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
