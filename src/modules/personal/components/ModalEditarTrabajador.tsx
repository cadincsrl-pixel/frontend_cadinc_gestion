'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useUpdatePersonal, useDeletePersonal } from '@/modules/tarja/hooks/usePersonal'
import { useCategorias } from '@/modules/tarja/hooks/useCategorias'
import { useToast } from '@/components/ui/Toast'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { PersonalDocumentosSection } from './PersonalDocumentosSection'
import { toISO, getViernes, esViernesISO, hoyArgentinaISO } from '@/lib/utils/dates'
import { normalizarDni, dniValido, fechaNacimientoValida, errorDeCampo } from '@/lib/utils/personal'
import { motivoAfectaCerradas } from '@/lib/utils/cierres'
import type { Personal, UpdatePersonalDto } from '@/types/domain.types'

const schema = z.object({
  nom:             z.string().trim().min(1, 'El nombre es requerido'),
  dni:             z.string().optional()
                     .refine(v => dniValido(normalizarDni(v)), 'DNI inválido: 7 u 8 dígitos'),
  condicion:       z.enum(['blanco', 'asegurado', '']).optional(),
  modalidad:       z.enum(['hora', 'mes']).optional(),
  cat_id:          z.coerce.number().min(1, 'Seleccioná una categoría'),
  // Viernes desde el que rige la categoría nueva (solo se manda si cambia).
  cat_desde:       z.string().optional()
                     .refine(v => !v || esViernesISO(v), 'Tiene que ser un viernes (inicio de semana)'),
  tel:             z.string().optional(),
  dir:             z.string().optional(),
  obs:             z.string().optional(),
  talle_pantalon:  z.string().optional(),
  talle_botines:   z.string().optional(),
  talle_camisa:    z.string().optional(),
  activo_override: z.enum(['auto', 'activo', 'inactivo']).optional(),
  fecha_nacimiento: z.string().optional()
                     .refine(v => !v || fechaNacimientoValida(v, hoyArgentinaISO()), 'Revisá el año de nacimiento'),
})

type FormInput  = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  trabajador: Personal | null
}

export function ModalEditarTrabajador({ open, onClose, trabajador }: Props) {
  const toast = useToast()
  const { data: categorias = [] } = useCategorias()
  const { mutate: updatePersonal, isPending: updating } = useUpdatePersonal()
  const { mutate: deletePersonal, isPending: deleting } = useDeletePersonal()

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (trabajador) {
      reset({
        nom:             trabajador.nom,
        dni:             trabajador.dni ?? '',
        condicion:       trabajador.condicion ?? '',
        modalidad:       trabajador.modalidad ?? 'hora',
        cat_id:          trabajador.cat_id,
        tel:             trabajador.tel ?? '',
        dir:             trabajador.dir ?? '',
        obs:             trabajador.obs ?? '',
        talle_pantalon:  trabajador.talle_pantalon ?? '',
        talle_botines:   trabajador.talle_botines  ?? '',
        talle_camisa:    trabajador.talle_camisa   ?? '',
        activo_override: trabajador.activo_override === true  ? 'activo'
                       : trabajador.activo_override === false ? 'inactivo'
                       : 'auto',
        fecha_nacimiento: trabajador.fecha_nacimiento ?? '',
        cat_desde:       toISO(getViernes(new Date())),
      })
    }
  }, [trabajador, reset])

  // La fecha "rige desde" solo importa si la categoría cambia.
  const catElegida = watch('cat_id')
  const catCambiada = trabajador != null && catElegida != null && catElegida !== ''
    && Number(catElegida) !== trabajador.cat_id

  function guardar(dto: UpdatePersonalDto) {
    if (!trabajador) return
    updatePersonal(
      { leg: trabajador.leg, dto },
      {
        onSuccess: () => {
          toast('✓ Trabajador actualizado', 'ok')
          onClose()
        },
        onError: (err) => {
          // Cambio de categoría con fecha vieja: recalcula semanas ya cerradas.
          const motivo = motivoAfectaCerradas(err)
          if (motivo) {
            if (confirm(`${motivo}\n\n¿Cambiar la categoría igual?`)) guardar({ ...dto, confirmar_historico: true })
            return
          }
          const deCampo = errorDeCampo(err)
          if (deCampo) setError(deCampo.campo as keyof FormInput, { message: deCampo.mensaje })
          else toast(err.message ?? 'Error al actualizar', 'err')
        },
      }
    )
  }

  function onSubmit(data: FormOutput) {
    if (!trabajador) return
    const { activo_override: ao, condicion, fecha_nacimiento, cat_desde, dni, ...rest } = data
    guardar({
      ...rest,
      dni:              normalizarDni(dni),
      condicion:        condicion || null,
      activo_override:  ao === 'activo' ? true : ao === 'inactivo' ? false : null,
      fecha_nacimiento: fecha_nacimiento && fecha_nacimiento.trim() !== '' ? fecha_nacimiento : null,
      ...(catCambiada && cat_desde ? { cat_desde } : {}),
    })
  }

  function handleDelete() {
    if (!trabajador) return
    if (!confirm(`¿Eliminar a ${trabajador.nom}? Esta acción no se puede deshacer.`)) return
    deletePersonal(trabajador.leg, {
      onSuccess: () => {
        toast('✓ Trabajador eliminado', 'ok')
        onClose()
      },
      onError: (err) => toast(err.message ?? 'Error al eliminar', 'err'),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✏️ EDITAR TRABAJADOR"
      width="max-w-3xl"
      footer={
        <>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={updating || deleting}
            loading={deleting}
            className="mr-auto"
          >
            🗑 Eliminar
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={updating || deleting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={updating}
            onClick={handleSubmit(onSubmit)}
          >
            ✓ Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-gris rounded-lg px-3 py-2 text-sm">
          <span className="text-gris-dark font-semibold">Legajo: </span>
          <span className="font-mono font-bold text-azul">{trabajador?.leg}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="DNI"
            placeholder="12.345.678"
            inputMode="numeric"
            error={errors.dni?.message}
            {...register('dni')}
          />
          <Select
            label="Condición"
            placeholder="Sin especificar"
            options={[
              { value: 'blanco', label: 'Blanco' },
              { value: 'asegurado', label: 'Asegurado' },
            ]}
            {...register('condicion')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Select
            label="Modalidad de liquidación"
            options={[
              { value: 'hora', label: 'Por hora' },
              { value: 'mes',  label: 'Mensualizado' },
            ]}
            {...register('modalidad')}
          />
          <p className="text-[11px] text-gris-dark">
            Mensualizados no cargan horas en tarja y quedan fuera de la alerta de inactivos.
          </p>
        </div>
        <Select
          label="Categoría"
          error={errors.cat_id?.message}
          options={categorias.map(c => ({ value: c.id, label: c.nom }))}
          {...register('cat_id')}
        />
        {catCambiada && (
          <Input
            label="La categoría nueva rige desde el viernes"
            type="date"
            hint="Por defecto, la semana en curso. Una fecha anterior recalcula semanas ya cerradas y pide confirmación."
            error={errors.cat_desde?.message}
            {...register('cat_desde')}
          />
        )}
        <Input
          label="Apellido y Nombre"
          placeholder="Apellido, Nombre"
          error={errors.nom?.message}
          {...register('nom')}
        />
        <Input
          label="Teléfono"
          placeholder="351-XXX-XXXX"
          {...register('tel')}
        />
        <Input
          label="Dirección"
          placeholder="Calle y número"
          {...register('dir')}
        />
        <Input
          label="Fecha de nacimiento"
          type="date"
          error={errors.fecha_nacimiento?.message}
          {...register('fecha_nacimiento')}
        />
        <Input
          label="Observaciones"
          placeholder="Notas adicionales"
          {...register('obs')}
        />

        {/* Estado activo */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            Estado en el sistema
          </div>
          <div className="flex gap-2">
            {(['auto', 'activo', 'inactivo'] as const).map(op => {
              const labels = { auto: '⚙ Auto', activo: '🟢 Forzar activo', inactivo: '⚫ Forzar inactivo' }
              const current = watch('activo_override') ?? 'auto'
              return (
                <button
                  key={op}
                  type="button"
                  onClick={() => setValue('activo_override', op)}
                  className={`
                    flex-1 text-xs font-bold px-2 py-2 rounded-lg border-[1.5px] transition-all
                    ${current === op
                      ? op === 'activo'   ? 'bg-verde-light border-verde text-verde'
                      : op === 'inactivo' ? 'bg-gris border-carbon text-carbon'
                      : 'bg-azul-light border-azul text-azul'
                      : 'bg-white border-gris-mid text-gris-dark hover:border-gris-dark'
                    }
                  `}
                >
                  {labels[op]}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-gris-dark mt-1">
            Auto = activo si tuvo horas las últimas 3 semanas. Los mensualizados cuentan siempre como activos.
          </p>
        </div>

        {/* Ropa de trabajo */}
        <div>
          <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-2">
            👕 Ropa de trabajo
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Pantalón"
              placeholder="Ej: 44"
              {...register('talle_pantalon')}
            />
            <Input
              label="Botines"
              placeholder="Ej: 42"
              {...register('talle_botines')}
            />
            <Input
              label="Camisa"
              placeholder="Ej: L"
              {...register('talle_camisa')}
            />
          </div>
        </div>

        {trabajador && (
          <div className="border-t border-gris-mid pt-4">
            <PersonalDocumentosSection leg={trabajador.leg} />
          </div>
        )}

        <AuditInfo
          createdBy={trabajador?.created_by}
          updatedBy={trabajador?.updated_by}
          createdAt={trabajador?.created_at}
          updatedAt={trabajador?.updated_at}
        />
      </div>
    </Modal>
  )
}