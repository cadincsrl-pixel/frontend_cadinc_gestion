'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useCreateCobro, useRemitosCliente } from '../hooks/useAlquiler'
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

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtFecha(iso: string): string {
  return iso.split('-').reverse().join('/')
}

export function RegistrarCobroModal({ open, onClose, clienteId, clienteNombre }: Props) {
  const toast = useToast()
  const { mutate: create, isPending } = useCreateCobro()

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: hoyISO(), monto: '', medio: 'efectivo', obs: '' },
  })

  // Remitos adeudados del cliente para imputar el cobro (opcional).
  const { data: remitos = [] } = useRemitosCliente(clienteId, open)
  const adeudados = remitos.filter(r => r.cobro_id == null)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())

  // Resetear a valores frescos cada vez que se (re)abre el modal para un
  // cliente. Sin esto, la fecha "hoy" quedaría congelada del primer montaje.
  useEffect(() => {
    if (open) {
      reset({ fecha: hoyISO(), monto: '', medio: 'efectivo', obs: '' })
      setSeleccion(new Set())
    }
  }, [open, clienteId, reset])

  // Al tildar remitos, el monto se autocompleta con la suma (editable).
  function toggleRemito(id: number) {
    const next = new Set(seleccion)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSeleccion(next)
    const suma = adeudados.filter(r => next.has(r.id)).reduce((s, r) => s + Number(r.importe ?? 0), 0)
    if (suma > 0) setValue('monto', String(suma))
  }

  function onSubmit(data: FormData) {
    create(
      {
        cliente_id: clienteId,
        fecha:      data.fecha,
        monto:      Number(data.monto),
        medio:      data.medio,
        obs:        data.obs?.trim() || null,
        remito_ids: Array.from(seleccion),
      },
      {
        onSuccess: () => {
          toast(
            seleccion.size > 0
              ? `✓ Cobro registrado · ${seleccion.size} remito${seleccion.size !== 1 ? 's' : ''} cancelado${seleccion.size !== 1 ? 's' : ''}`
              : '✓ Cobro registrado',
            'ok',
          )
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
        {/* Imputación opcional: qué remitos cancela este pago */}
        {adeudados.length > 0 && (
          <div className="border border-gris rounded-card overflow-hidden">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gris-dark px-3 py-2 bg-gris/30">
              ¿Qué remitos paga? (opcional — sin tildar es pago a cuenta)
            </p>
            <div className="max-h-44 overflow-y-auto divide-y divide-gris">
              {adeudados.map(r => (
                <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gris/20">
                  <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => toggleRemito(r.id)} className="accent-azul" />
                  <span className="flex-1 text-carbon">
                    <span className="font-mono text-naranja mr-1">{r.numero}</span>
                    {fmtFecha(r.fecha_trabajo)} · {r.maquina_nombre ?? '—'} · {Number(r.horas).toLocaleString('es-AR')} hs
                  </span>
                  <span className="font-mono font-bold text-carbon">
                    {r.importe != null ? fmtPesos(Number(r.importe)) : '—'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

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
