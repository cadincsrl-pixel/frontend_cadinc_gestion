'use client'

/**
 * Editor de UN snapshot de asignaciones de una persona de oficina.
 *
 * Un snapshot es "desde tal fecha, el costo de esta persona se reparte
 * así": filas dinámicas destino (obra / logística / general) + porcentaje.
 * La suma debe dar exactamente 100. El PUT del backend valida lo mismo
 * (SUMA_NO_100 / OBRA_COD_REQUERIDO / OBRA_NO_EXISTE / DESTINO_DUPLICADO);
 * acá validamos con zod para feedback inmediato y traducimos los códigos
 * del backend a toasts legibles si igual rebota.
 */

import { useEffect, useMemo } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import { useObras } from '@/modules/tarja/hooks/useObras'
import {
  useGuardarOficinaAsignaciones, mensajeErrorOficina,
} from '../hooks/useOficina'
import type { OficinaAsignacionSnapshot, OficinaDestino } from '@/types/domain.types'

const DESTINOS: Array<{ value: OficinaDestino; label: string }> = [
  { value: 'obra',      label: '🏗 Obra' },
  { value: 'logistica', label: '🚚 Logística' },
  { value: 'general',   label: '🏢 General (se prorratea)' },
]

// El porcentaje entra como string (value del <input type="number">) y se
// coacciona con Number() — mismo patrón que RegistrarCobroModal.
const itemSchema = z.object({
  destino:    z.enum(['obra', 'logistica', 'general']),
  obra_cod:   z.string(),
  porcentaje: z.string()
    .min(1, 'Requerido')
    .refine(v => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 && n <= 100
    }, 'Entre 0 y 100'),
})

const schema = z.object({
  desde: z.string().min(1, 'La fecha es requerida'),
  items: z.array(itemSchema).min(1, 'Agregá al menos una fila'),
}).superRefine((data, ctx) => {
  // Obra requerida cuando el destino es 'obra'.
  data.items.forEach((it, i) => {
    if (it.destino === 'obra' && !it.obra_cod) {
      ctx.addIssue({ code: 'custom', path: ['items', i, 'obra_cod'], message: 'Elegí la obra' })
    }
  })
  // Destinos duplicados (misma obra, o dos logística / dos general).
  const seen = new Set<string>()
  data.items.forEach((it, i) => {
    const key = it.destino === 'obra' ? `obra:${it.obra_cod}` : it.destino
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['items', i, 'destino'], message: 'Destino repetido' })
    }
    seen.add(key)
  })
  // Suma exacta 100 (tolerancia de redondeo de centésimas).
  const suma = data.items.reduce((s, it) => s + (Number(it.porcentaje) || 0), 0)
  if (Math.abs(suma - 100) > 0.01) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: `Los porcentajes deben sumar 100% (ahora: ${suma}%)` })
  }
})

type FormData = z.infer<typeof schema>

type ItemForm = FormData['items'][number]

const FILA_VACIA: ItemForm = { destino: 'obra', obra_cod: '', porcentaje: '' }

function snapshotAItems(snap: OficinaAsignacionSnapshot): ItemForm[] {
  return snap.items.map(it => ({
    destino:    it.destino,
    obra_cod:   it.obra_cod ?? '',
    porcentaje: String(it.porcentaje),
  }))
}

interface Props {
  open:          boolean
  onClose:       () => void
  personaId:     number
  personaNombre: string
  /** Snapshots existentes (más reciente primero). Para prefill y "copiar anterior". */
  snapshots:     OficinaAsignacionSnapshot[]
}

export function OficinaAsignacionesEditor({ open, onClose, personaId, personaNombre, snapshots }: Props) {
  const toast = useToast()
  const { data: obras = [] } = useObras()
  const { mutate: guardar, isPending } = useGuardarOficinaAsignaciones()

  const snapshotAnterior = snapshots[0] ?? null

  const {
    register, control, handleSubmit, reset, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { desde: toISO(new Date()), items: [FILA_VACIA] },
  })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' })

  // Al (re)abrir: fecha hoy + prefill con el snapshot vigente si existe
  // (el flujo típico es retocar la distribución actual, no arrancar de cero).
  useEffect(() => {
    if (!open) return
    reset({
      desde: toISO(new Date()),
      items: snapshotAnterior ? snapshotAItems(snapshotAnterior) : [FILA_VACIA],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personaId, reset])

  // Suma en vivo para el indicador verde/rojo.
  const itemsWatch = watch('items')
  const sumaViva = useMemo(
    () => itemsWatch.reduce((s, it) => s + (Number(it.porcentaje) || 0), 0),
    [itemsWatch],
  )
  const sumaOk = Math.abs(sumaViva - 100) <= 0.01

  const obraOptions = useMemo(
    () => obras.map(o => ({ value: o.cod, label: o.nom, sub: o.cod })),
    [obras],
  )

  function copiarAnterior() {
    if (!snapshotAnterior) return
    replace(snapshotAItems(snapshotAnterior))
  }

  function onSubmit(data: FormData) {
    guardar(
      {
        personaId,
        dto: {
          desde: data.desde,
          items: data.items.map(it => ({
            destino:    it.destino,
            ...(it.destino === 'obra' ? { obra_cod: it.obra_cod } : {}),
            // A 2 decimales: la columna es numeric(5,2) y sin esto un 16.6667
            // se persiste recortado y el snapshot re-guardado puede no sumar 100.
            porcentaje: Math.round(Number(it.porcentaje) * 100) / 100,
          })),
        },
      },
      {
        onSuccess: () => {
          toast('✓ Asignaciones guardadas', 'ok')
          onClose()
        },
        onError: (err: unknown) =>
          toast(mensajeErrorOficina(err, 'No se pudieron guardar las asignaciones'), 'err'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📊 ASIGNACIONES — ${personaNombre}`}
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} disabled={!sumaOk} onClick={handleSubmit(onSubmit)}>
            ✓ Guardar snapshot
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gris-dark">
          Definí cómo se reparte el costo mensual de esta persona a partir de
          una fecha. Lo que va a <strong>General</strong> se prorratea entre
          las obras según su costo directo del mes.
        </p>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-44">
            <Input label="Vigente desde" type="date" error={errors.desde?.message} {...register('desde')} />
          </div>
          {snapshotAnterior && (
            <Button type="button" variant="secondary" size="sm" onClick={copiarAnterior}>
              ⧉ Copiar snapshot anterior ({snapshotAnterior.desde.split('-').reverse().join('/')})
            </Button>
          )}
        </div>

        {/* Filas dinámicas */}
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => {
            const destino = itemsWatch[i]?.destino
            const itemErr = errors.items?.[i]
            return (
              <div key={field.id} className="border border-gris rounded-lg p-2 bg-gris/20 flex flex-col sm:flex-row gap-2 sm:items-start">
                <div className="sm:w-48 shrink-0">
                  <Select
                    label="Destino"
                    options={DESTINOS}
                    error={itemErr?.destino?.message}
                    {...register(`items.${i}.destino`)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {destino === 'obra' ? (
                    <Controller
                      control={control}
                      name={`items.${i}.obra_cod`}
                      render={({ field: f }) => (
                        <>
                          <Combobox
                            label="Obra"
                            placeholder="Buscar obra..."
                            options={obraOptions}
                            value={f.value}
                            onChange={f.onChange}
                          />
                          {itemErr?.obra_cod?.message && (
                            <span className="text-xs text-rojo font-semibold">{itemErr.obra_cod.message}</span>
                          )}
                        </>
                      )}
                    />
                  ) : (
                    <div className="text-xs text-gris-dark pt-6 hidden sm:block">
                      {destino === 'general'
                        ? 'Se prorratea entre obras por costo directo.'
                        : 'Va a la línea Logística (no se prorratea).'}
                    </div>
                  )}
                </div>
                <div className="w-24 shrink-0">
                  <Input
                    label="%"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    placeholder="0"
                    error={itemErr?.porcentaje?.message}
                    {...register(`items.${i}.porcentaje`)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={fields.length <= 1}
                  className="self-start sm:mt-6 text-gris-mid hover:text-rojo transition-colors text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rojo-light disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Quitar fila"
                  title="Quitar fila"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>

        {/* Error de nivel array (suma ≠ 100 / mínimo de filas) */}
        {errors.items?.message && (
          <span className="text-xs text-rojo font-semibold">{errors.items.message}</span>
        )}
        {errors.items?.root?.message && (
          <span className="text-xs text-rojo font-semibold">{errors.items.root.message}</span>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button type="button" variant="ghost" size="sm" onClick={() => append(FILA_VACIA)}>
            ＋ Agregar fila
          </Button>
          <span className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${
            sumaOk ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'
          }`}>
            Σ {Math.round(sumaViva * 100) / 100}% {sumaOk ? '✓' : '(debe dar 100%)'}
          </span>
        </div>
      </div>
    </Modal>
  )
}
