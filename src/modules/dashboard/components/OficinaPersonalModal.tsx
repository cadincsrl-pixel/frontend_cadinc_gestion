'use client'

/**
 * Alta / edición de una persona de oficina.
 *
 * - Alta (persona === null): nombre + sueldo inicial (+ vigencia opcional).
 * - Edición: nombre + activo (PATCH), historial de sueldos con form de
 *   "nueva versión" (POST /sueldos — el sueldo NUNCA se edita in-place,
 *   se versiona por `desde`, espejo de categoria_tarifas §5.11), y la
 *   sección de asignaciones con su editor de snapshots.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { toISO } from '@/lib/utils/dates'
import {
  useCreateOficinaPersona, useUpdateOficinaPersona, useCreateOficinaSueldo,
  useOficinaAsignaciones, sueldoVigente, mensajeErrorOficina,
} from '../hooks/useOficina'
import { OficinaAsignacionesEditor } from './OficinaAsignacionesEditor'
import type { OficinaPersona, OficinaAsignacion } from '@/types/domain.types'

// ── Schemas tipados (montos como string de <input type="number">) ──

const montoValido = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

const altaSchema = z.object({
  nombre:        z.string().trim().min(1, 'El nombre es requerido'),
  costo_mensual: z.string().min(1, 'El sueldo es requerido').refine(montoValido, 'Ingresá un monto mayor a 0'),
  desde:         z.string(),   // opcional: vacío = el backend usa su default
})
type AltaForm = z.infer<typeof altaSchema>

const datosSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido'),
  activo: z.boolean(),
})
type DatosForm = z.infer<typeof datosSchema>

const sueldoSchema = z.object({
  costo_mensual: z.string().min(1, 'El sueldo es requerido').refine(montoValido, 'Ingresá un monto mayor a 0'),
  desde:         z.string().min(1, 'La vigencia es requerida'),
})
type SueldoForm = z.infer<typeof sueldoSchema>

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtFecha(iso: string): string {
  return iso.split('-').reverse().join('/')
}

function labelAsignacion(a: OficinaAsignacion): string {
  if (a.destino === 'logistica') return '🚚 Logística'
  if (a.destino === 'general')   return '🏢 General'
  return `🏗 ${a.obra_cod ?? '?'}`
}

interface Props {
  open:    boolean
  onClose: () => void
  /** null = alta de persona nueva. */
  persona: OficinaPersona | null
}

export function OficinaPersonalModal({ open, onClose, persona }: Props) {
  const esAlta = persona === null
  return esAlta
    ? <ModalAlta open={open} onClose={onClose} />
    : <ModalEdicion open={open} onClose={onClose} persona={persona} />
}

// ── Alta ──────────────────────────────────────────────────────────────

function ModalAlta({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { mutate: crear, isPending } = useCreateOficinaPersona()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AltaForm>({
    resolver: zodResolver(altaSchema),
    defaultValues: { nombre: '', costo_mensual: '', desde: '' },
  })

  useEffect(() => {
    if (open) reset({ nombre: '', costo_mensual: '', desde: '' })
  }, [open, reset])

  function onSubmit(data: AltaForm) {
    crear(
      {
        nombre:        data.nombre.trim(),
        costo_mensual: Number(data.costo_mensual),
        ...(data.desde ? { desde: data.desde } : {}),
      },
      {
        onSuccess: () => {
          toast('✓ Persona agregada', 'ok')
          onClose()
        },
        onError: (err: unknown) =>
          toast(mensajeErrorOficina(err, 'No se pudo agregar la persona'), 'err'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏢 NUEVA PERSONA DE OFICINA"
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={isPending} onClick={handleSubmit(onSubmit)}>
            ✓ Agregar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nombre" placeholder="Ej: María González" error={errors.nombre?.message} {...register('nombre')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Sueldo mensual ($)"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="0"
            error={errors.costo_mensual?.message}
            {...register('costo_mensual')}
          />
          <Input
            label="Vigente desde"
            type="date"
            hint="Opcional — vacío: desde hoy"
            error={errors.desde?.message}
            {...register('desde')}
          />
        </div>
        <p className="text-xs text-gris-dark">
          Después de crearla vas a poder definir cómo se reparte su costo
          entre obras, logística y estructura general.
        </p>
      </div>
    </Modal>
  )
}

// ── Edición ───────────────────────────────────────────────────────────

function ModalEdicion({ open, onClose, persona }: {
  open: boolean
  onClose: () => void
  persona: OficinaPersona
}) {
  const toast = useToast()
  const { mutate: actualizar, isPending: guardandoDatos } = useUpdateOficinaPersona()
  const { mutate: nuevoSueldo, isPending: guardandoSueldo } = useCreateOficinaSueldo()
  const {
    data: snapshots = [],
    isLoading: loadingAsig,
    isError: errorAsig,
  } = useOficinaAsignaciones(open ? persona.id : null)

  const [editorAbierto, setEditorAbierto] = useState(false)

  // Form datos básicos (nombre + activo)
  const datosForm = useForm<DatosForm>({
    resolver: zodResolver(datosSchema),
    defaultValues: { nombre: persona.nombre, activo: persona.activo },
  })

  // Form nueva versión de sueldo
  const sueldoForm = useForm<SueldoForm>({
    resolver: zodResolver(sueldoSchema),
    defaultValues: { costo_mensual: '', desde: toISO(new Date()) },
  })

  useEffect(() => {
    if (!open) return
    datosForm.reset({ nombre: persona.nombre, activo: persona.activo })
    sueldoForm.reset({ costo_mensual: '', desde: toISO(new Date()) })
    setEditorAbierto(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, persona.id])

  const sueldosDesc = [...persona.sueldos].sort((a, b) => b.desde.localeCompare(a.desde))
  const vigente = sueldoVigente(persona.sueldos)
  const snapshotVigente = snapshots[0] ?? null

  function onGuardarDatos(data: DatosForm) {
    actualizar(
      { id: persona.id, dto: { nombre: data.nombre.trim(), activo: data.activo } },
      {
        onSuccess: () => toast('✓ Datos guardados', 'ok'),
        onError:   (err: unknown) => toast(mensajeErrorOficina(err, 'No se pudieron guardar los datos'), 'err'),
      },
    )
  }

  function onNuevoSueldo(data: SueldoForm) {
    nuevoSueldo(
      {
        personaId: persona.id,
        dto: { costo_mensual: Number(data.costo_mensual), desde: data.desde },
      },
      {
        onSuccess: () => {
          toast('✓ Nueva versión de sueldo cargada', 'ok')
          sueldoForm.reset({ costo_mensual: '', desde: toISO(new Date()) })
        },
        onError: (err: unknown) =>
          toast(mensajeErrorOficina(err, 'No se pudo cargar el sueldo'), 'err'),
      },
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`🏢 ${persona.nombre.toUpperCase()}`}
        width="max-w-lg"
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-4">

          {/* ── Datos básicos ── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Input
                  label="Nombre"
                  error={datosForm.formState.errors.nombre?.message}
                  {...datosForm.register('nombre')}
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-carbon pb-2 cursor-pointer">
                <input type="checkbox" className="accent-verde" {...datosForm.register('activo')} />
                Activo
              </label>
              <Button
                size="sm"
                variant="secondary"
                loading={guardandoDatos}
                onClick={datosForm.handleSubmit(onGuardarDatos)}
              >
                Guardar
              </Button>
            </div>
            {!persona.activo && (
              <p className="text-xs text-gris-dark">
                Inactiva: al desactivarla se cerró su sueldo con una versión en $0 desde ese día — los meses anteriores conservan su costo. Para reactivarla, cargá una versión nueva de sueldo.
              </p>
            )}
          </section>

          {/* ── Sueldos (historial versionado) ── */}
          <section className="border border-gris rounded-card overflow-hidden">
            <div className="bg-gris/40 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                💵 Historial de sueldos
              </span>
              {vigente && (
                <span className="text-xs font-mono font-bold text-verde">
                  Vigente: {fmtPesos(vigente.costo_mensual)}/mes
                </span>
              )}
            </div>

            {sueldosDesc.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gris-dark italic">Sin sueldos cargados.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto divide-y divide-gris">
                {sueldosDesc.map(s => (
                  <div key={s.id} className="px-3 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-gris-dark">
                      desde <span className="font-mono font-semibold text-carbon">{fmtFecha(s.desde)}</span>
                    </span>
                    <span className={`font-mono font-bold ${s.id === vigente?.id ? 'text-verde' : 'text-carbon'}`}>
                      {fmtPesos(s.costo_mensual)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Nueva versión */}
            <div className="border-t border-gris bg-gris/20 px-3 py-2">
              <p className="text-[10px] font-bold text-gris-dark uppercase tracking-wider mb-1.5">
                Nueva versión (no pisa el historial)
              </p>
              <div className="flex items-start gap-2 flex-wrap">
                <div className="w-36">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder="Sueldo $"
                    error={sueldoForm.formState.errors.costo_mensual?.message}
                    {...sueldoForm.register('costo_mensual')}
                  />
                </div>
                <div className="w-40">
                  <Input
                    type="date"
                    error={sueldoForm.formState.errors.desde?.message}
                    {...sueldoForm.register('desde')}
                  />
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={guardandoSueldo}
                  onClick={sueldoForm.handleSubmit(onNuevoSueldo)}
                >
                  ＋ Cargar
                </Button>
              </div>
            </div>
          </section>

          {/* ── Asignaciones ── */}
          <section className="border border-gris rounded-card overflow-hidden">
            <div className="bg-gris/40 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                📊 Asignación del costo
              </span>
              <Button size="sm" variant="secondary" onClick={() => setEditorAbierto(true)}>
                ✎ Editar
              </Button>
            </div>

            {loadingAsig ? (
              <div className="px-3 py-3 flex items-center gap-2 text-xs text-gris-dark">
                <span className="w-3.5 h-3.5 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                Cargando asignaciones...
              </div>
            ) : errorAsig ? (
              <p className="px-3 py-3 text-xs text-rojo font-semibold">
                No se pudieron cargar las asignaciones.
              </p>
            ) : !snapshotVigente ? (
              <p className="px-3 py-3 text-xs text-gris-dark italic">
                Sin asignaciones: el costo de esta persona no se distribuye a
                ninguna obra todavía.
              </p>
            ) : (
              <div className="px-3 py-2 flex flex-col gap-1.5">
                <p className="text-[11px] text-gris-dark">
                  Snapshot vigente desde{' '}
                  <span className="font-mono font-semibold text-carbon">{fmtFecha(snapshotVigente.desde)}</span>
                  {snapshots.length > 1 && (
                    <span className="ml-1 opacity-70">({snapshots.length - 1} anterior{snapshots.length > 2 ? 'es' : ''})</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {snapshotVigente.items.map((a, i) => (
                    <span key={i} className="text-xs font-bold bg-azul-light text-azul px-2 py-0.5 rounded">
                      {labelAsignacion(a)} · {a.porcentaje}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <Badge variant={persona.activo ? 'activo' : 'inactivo'} />
          </div>
        </div>
      </Modal>

      <OficinaAsignacionesEditor
        open={editorAbierto}
        onClose={() => setEditorAbierto(false)}
        personaId={persona.id}
        personaNombre={persona.nombre}
        snapshots={snapshots}
      />
    </>
  )
}
