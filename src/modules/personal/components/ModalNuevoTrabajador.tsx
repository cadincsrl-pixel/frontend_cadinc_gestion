'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useCreatePersonal, usePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'
import { hoyArgentinaISO } from '@/lib/utils/dates'
import {
  LEGAJO_RE, MSG_PERSONAL as M, errorDeCampo, fechaNacimientoValida,
  normalizarDni, dniValido, normalizarTelefono, telefonoValido,
  normalizarNombre, nombreValido, normalizarTalle, talleValido,
} from '@/lib/utils/personal'

// Mismas reglas que el backend (personal.schema.ts): acá para que el error
// aparezca debajo del campo antes de mandar nada.
const talle = z.string().optional().transform(normalizarTalle).refine(talleValido, M.talle)
const schema = z.object({
  leg:              z.string().trim().regex(LEGAJO_RE, M.legajo),
  nom:              z.string().transform(normalizarNombre).refine(nombreValido, M.nombre),
  dni:              z.string().optional()
                      .refine(dniValido, M.dni)
                      .transform(normalizarDni)
                      .refine(d => d !== '', M.dniFalta),
  // '' = "Sin especificar": se guarda como null (antes hacía fallar el enum
  // en silencio y el trabajador no se creaba).
  condicion:        z.enum(['blanco', 'asegurado', '']).optional(),
  modalidad:        z.enum(['hora', 'mes']),
  cat_id:           z.coerce.number({ error: 'La categoría es requerida' }).min(1, 'Seleccioná una categoría'),
  fecha_nacimiento: z.string().optional()
                      .refine(v => !v || fechaNacimientoValida(v, hoyArgentinaISO()), M.nacimiento),
  tel:              z.string().optional().refine(telefonoValido, M.telefono).transform(normalizarTelefono),
  dir:              z.string().trim().max(200).optional(),
  obs:              z.string().trim().max(1000).optional(),
  talle_pantalon:   talle,
  talle_botines:    talle,
  talle_camisa:     talle,
})

type FormInput  = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
}

// Próximo legajo libre: el mayor legajo numérico + 1, respetando el padding
// de la casa ("099", "100"…). Los legajos no numéricos no cuentan.
export function proximoLegajo(legs: string[]): string {
  const max = legs.reduce((m, l) => /^\d+$/.test(l) ? Math.max(m, parseInt(l, 10)) : m, 0)
  return max === 0 ? '' : String(max + 1).padStart(3, '0')
}

export function ModalNuevoTrabajador({ open, onClose }: Props) {
  const toast = useToast()
  const { data: categorias = [] } = useCategorias()
  const { data: personal = [] } = usePersonal()
  const { mutate: createPersonal, isPending } = useCreatePersonal()

  const { register, handleSubmit, reset, setValue, getValues, setError, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { modalidad: 'hora' },
  })

  // Al abrir, sugerir el próximo legajo (editable por si hace falta otro número).
  useEffect(() => {
    if (!open || personal.length === 0) return
    if (getValues('leg')) return
    setValue('leg', proximoLegajo(personal.map(p => p.leg)))
  }, [open, personal, setValue, getValues])

  function onSubmit(data: FormOutput) {
    // Duplicados que ya se pueden ver desde acá (el backend los vuelve a controlar).
    const repetido = personal.find(p => p.leg === data.leg)
    if (repetido) {
      setError('leg', { message: `Ya existe: ${repetido.nom}` })
      return
    }
    const dni = data.dni
    const mismoDni = personal.find(p => normalizarDni(p.dni) === dni)
    if (mismoDni) {
      setError('dni', { message: `Ya lo tiene el legajo ${mismoDni.leg} (${mismoDni.nom})` })
      return
    }

    createPersonal({
      leg:              data.leg,
      nom:              data.nom,
      dni,
      condicion:        data.condicion || null,
      modalidad:        data.modalidad,
      cat_id:           data.cat_id,
      fecha_nacimiento: data.fecha_nacimiento || null,
      tel:              data.tel,
      dir:              data.dir,
      obs:              data.obs,
      talle_pantalon:   data.talle_pantalon || undefined,
      talle_botines:    data.talle_botines  || undefined,
      talle_camisa:     data.talle_camisa   || undefined,
    }, {
      onSuccess: () => {
        toast('✓ Trabajador agregado', 'ok')
        reset()
        onClose()
      },
      onError: (err) => {
        const deCampo = errorDeCampo(err)
        if (deCampo) setError(deCampo.campo as keyof FormInput, { message: deCampo.mensaje })
        else toast(err.message ?? 'Error al crear trabajador', 'err')
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👷 NUEVO TRABAJADOR"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Legajo"
            placeholder="001"
            hint="Sugerido automático (el que sigue). Se puede cambiar."
            error={errors.leg?.message}
            {...register('leg')}
          />
          <Input
            label="DNI *"
            placeholder="12345678"
            inputMode="numeric"
            hint="Obligatorio: es lo que evita cargar dos veces a la misma persona."
            error={errors.dni?.message}
            {...register('dni')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Condición"
            placeholder="Sin especificar"
            error={errors.condicion?.message}
            options={[
              { value: 'blanco', label: 'Blanco' },
              { value: 'asegurado', label: 'Asegurado' },
            ]}
            {...register('condicion')}
          />
          <Select
            label="Modalidad de liquidación"
            error={errors.modalidad?.message}
            options={[
              { value: 'hora', label: 'Por hora' },
              { value: 'mes',  label: 'Mensualizado' },
            ]}
            {...register('modalidad')}
          />
        </div>
        <Input
          label="Apellido y Nombre"
          placeholder="Apellido, Nombre"
          error={errors.nom?.message}
          {...register('nom')}
        />
        <Select
          label="Categoría"
          placeholder="Elegí una categoría"
          error={errors.cat_id?.message}
          options={categorias.map(c => ({ value: c.id, label: `${c.nom} — $${c.vh}/h` }))}
          {...register('cat_id')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de nacimiento"
            type="date"
            error={errors.fecha_nacimiento?.message}
            {...register('fecha_nacimiento')}
          />
          <Input
            label="Teléfono"
            placeholder="3815551234"
            inputMode="tel"
            error={errors.tel?.message}
            {...register('tel')}
          />
        </div>
        <Input
          label="Dirección"
          placeholder="Calle y número"
          error={errors.dir?.message}
          {...register('dir')}
        />
        <Input
          label="Observaciones"
          placeholder="Notas adicionales"
          error={errors.obs?.message}
          {...register('obs')}
        />

        {/* Ropa de trabajo */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            👕 Ropa de trabajo
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Pantalón"
              placeholder="Ej: 44"
              error={errors.talle_pantalon?.message}
              {...register('talle_pantalon')}
            />
            <Input
              label="Botines"
              placeholder="Ej: 42"
              error={errors.talle_botines?.message}
              {...register('talle_botines')}
            />
            <Input
              label="Camisa"
              placeholder="Ej: L"
              error={errors.talle_camisa?.message}
              {...register('talle_camisa')}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
