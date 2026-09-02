'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { hoyArgentinaISO } from '@/lib/utils/dates'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import {
  useContratistasObra,
  useCertificacionesObra,
  usePresupuestosObra,
  useCreatePresupuesto,
  useUpdatePresupuesto,
  useDeletePresupuesto,
  useUploadPresupuestoDoc,
  useDeletePresupuestoDoc,
  fetchPresupuestoDocSignedUrl,
  validarArchivoDni,
} from '../../hooks/useContratistas'
import { BloqueAdjunto } from './BloqueAdjunto'
import { fmtMonto, fmtDDMM, mensajeError } from './utils'

// ── Form tipado ──
const schema = z.object({
  titulo: z.string().trim().min(1, 'El título es requerido'),
  // Formato máquina de InputMonto ("1234567.89" | "").
  monto:  z.string().refine(s => Number(s) > 0, 'El monto debe ser mayor a 0'),
  fecha:  z.string().min(1, 'La fecha es requerida'),
  obs:    z.string().trim(),
})
type FormData = z.infer<typeof schema>

interface Props {
  obraCod:       string
  contratId:     number
  /** null = alta. Tras crear, el modal pasa a edición para poder adjuntar. */
  presupuestoId: number | null
  puedeMutar:    boolean
  motivoBloqueo: string | null
  onClose:       () => void
}

export function ModalPresupuesto({
  obraCod, contratId, presupuestoId, puedeMutar, motivoBloqueo, onClose,
}: Props) {
  const toast = useToast()
  const [editId, setEditId] = useState<number | null>(presupuestoId)

  // Se deriva de las queries (no estado local duplicado): al subir/quitar el
  // adjunto o cerrar/reabrir, CONTRAT_KEY se invalida y el modal refleja el
  // estado actual.
  const { data: asignados = [] }       = useContratistasObra(obraCod)
  const { data: presupuestos = [] }    = usePresupuestosObra(obraCod)
  const { data: certificaciones = [] } = useCertificacionesObra(obraCod)

  const presup = editId == null ? null : presupuestos.find(p => p.id === editId) ?? null
  const nom    = asignados.find(a => a.contrat_id === contratId)?.contratistas.nom ?? '—'
  const certsDelPresup = editId == null ? [] : certificaciones.filter(c => c.presupuesto_id === editId)
  const nCerts      = certsDelPresup.length
  const certificado = certsDelPresup.reduce((acc, c) => acc + Number(c.monto), 0)
  const cerrado     = presup?.cerrado_en != null

  const { mutate: crear,      isPending: creando }     = useCreatePresupuesto()
  const { mutate: actualizar, isPending: actualizando } = useUpdatePresupuesto()
  const { mutate: borrar,     isPending: borrando }    = useDeletePresupuesto()
  const { mutate: subirDoc,   isPending: subiendo }    = useUploadPresupuestoDoc()
  const { mutate: quitarDoc,  isPending: quitando }    = useDeletePresupuestoDoc()

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: presup
      ? {
          titulo: presup.titulo,
          monto:  String(presup.monto),
          fecha:  presup.fecha.slice(0, 10),
          obs:    presup.obs ?? '',
        }
      : { titulo: '', monto: '', fecha: hoyArgentinaISO(), obs: '' },
  })

  function onSubmit(data: FormData) {
    const monto = Number(data.monto)
    const dto = {
      titulo: data.titulo,
      monto,
      fecha:  data.fecha,
      obs:    data.obs || null,
    }
    if (editId == null) {
      crear(
        { obra_cod: obraCod, contrat_id: contratId, ...dto },
        {
          onSuccess: (creado) => {
            // No cerramos: pasamos a edición para poder adjuntar el archivo.
            setEditId(creado.id)
            toast('✓ Presupuesto creado — ya podés adjuntar el archivo', 'ok')
          },
          onError: (err: unknown) => toast(mensajeError(err, 'Error al crear el presupuesto'), 'err'),
        },
      )
      return
    }
    // Editar el monto de un presupuesto con certificaciones es una corrección:
    // las ampliaciones van como presupuesto nuevo ("Adicional …").
    if (presup && nCerts > 0 && monto !== Number(presup.monto)) {
      const ok = confirm(
        `Este presupuesto ya tiene ${nCerts} ${nCerts === 1 ? 'certificación' : 'certificaciones'} por ${fmtMonto(certificado)}.\n\n` +
        '¿Es una corrección del monto? Si es una ampliación, cancelá y cargá un presupuesto nuevo.',
      )
      if (!ok) return
    }
    actualizar(
      { id: editId, dto },
      {
        onSuccess: () => { toast('✓ Presupuesto actualizado', 'ok'); onClose() },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al actualizar el presupuesto'), 'err'),
      },
    )
  }

  function handleCerrarReabrir() {
    if (editId == null || !presup) return
    const cerrar = !cerrado
    if (cerrar && !confirm('¿Cerrar este presupuesto? No se va a ofrecer más al certificar. Se puede reabrir.')) return
    actualizar(
      { id: editId, dto: { cerrado: cerrar } },
      {
        onSuccess: () => toast(cerrar ? '✓ Presupuesto cerrado' : '✓ Presupuesto reabierto', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'No se pudo cambiar el estado'), 'err'),
      },
    )
  }

  function handleEliminar() {
    if (editId == null || !presup) return
    if (!confirm(`¿Eliminar el presupuesto "${presup.titulo}"? Se borra también el adjunto.`)) return
    borrar(editId, {
      onSuccess: () => { toast('✓ Presupuesto eliminado', 'ok'); onClose() },
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar el presupuesto'), 'err'),
    })
  }

  // ── Adjunto (foto/PDF) ──
  function handleSubirDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reseteamos el input para permitir re-seleccionar el mismo archivo luego.
    e.target.value = ''
    if (!file || editId == null) return
    try {
      validarArchivoDni(file)
    } catch (err: unknown) {
      toast(mensajeError(err, 'Archivo no válido'), 'err')
      return
    }
    subirDoc(
      { presupuestoId: editId, file },
      {
        onSuccess: () => toast('✓ Presupuesto adjuntado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'Error al subir el adjunto'), 'err'),
      },
    )
  }

  async function handleVerDoc() {
    if (editId == null) return
    const id = editId
    await abrirAdjuntoFirmado(
      () => fetchPresupuestoDocSignedUrl(id),
      (err) => toast(mensajeError(err, 'No se pudo abrir el adjunto'), 'err'),
    )
  }

  function handleQuitarDoc() {
    if (editId == null) return
    if (!confirm('¿Quitar el archivo adjunto del presupuesto?')) return
    quitarDoc(
      { presupuestoId: editId },
      {
        onSuccess: () => toast('✓ Adjunto quitado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'No se pudo quitar el adjunto'), 'err'),
      },
    )
  }

  const bloqueado = !puedeMutar
  const motivoEliminar = bloqueado
    ? motivoBloqueo
    : nCerts > 0
      ? `Tiene ${nCerts} ${nCerts === 1 ? 'certificación' : 'certificaciones'}: movelas a otro presupuesto o cerralo`
      : null

  return (
    <Modal
      open
      onClose={onClose}
      title={editId == null ? '📋 NUEVO PRESUPUESTO' : '📋 PRESUPUESTO'}
      width="max-w-lg"
      footer={
        <>
          {editId != null && (
            <div className="mr-auto flex items-center gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                disabled={bloqueado || actualizando}
                title={motivoBloqueo ?? (cerrado ? 'Vuelve a ofrecerse al certificar' : 'Deja de ofrecerse al certificar')}
                onClick={handleCerrarReabrir}
              >
                {cerrado ? '↻ Reabrir presupuesto' : '✓ Cerrar presupuesto'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-rojo"
                disabled={bloqueado || nCerts > 0 || borrando}
                title={motivoEliminar ?? undefined}
                onClick={handleEliminar}
              >
                🗑 Eliminar
              </Button>
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            form="form-presupuesto"
            variant="primary"
            loading={creando || actualizando}
            disabled={bloqueado}
            title={motivoBloqueo ?? undefined}
          >
            ✓ {editId == null ? 'Crear' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="form-presupuesto" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="bg-gris rounded-lg px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
          <span className="text-gris-dark font-semibold">Contratista: </span>
          <span className="font-bold text-azul">{nom}</span>
          <span className="text-gris-dark"> · obra </span>
          <span className="font-mono font-bold text-azul">{obraCod}</span>
          {cerrado && presup?.cerrado_en && (
            <span className="ml-auto text-[10px] font-bold bg-gris-mid text-gris-dark px-1.5 py-0.5 rounded">
              cerrado {fmtDDMM(new Date(presup.cerrado_en))}
            </span>
          )}
        </div>

        <Input
          label="Título"
          placeholder='Ej: "Mampostería PB", "Adicional baño"'
          error={errors.titulo?.message}
          disabled={bloqueado}
          {...register('titulo')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Controller name="monto" control={control} render={({ field }) => (
            <InputMonto
              label="Monto ($)"
              placeholder="0"
              value={field.value}
              onChange={field.onChange}
              error={errors.monto?.message}
              disabled={bloqueado}
            />
          )} />
          <Input
            label="Fecha del presupuesto"
            type="date"
            error={errors.fecha?.message}
            disabled={bloqueado}
            {...register('fecha')}
          />
        </div>
        <Input
          label="Observaciones"
          placeholder="Alcance, condiciones (opcional)"
          disabled={bloqueado}
          {...register('obs')}
        />

        {editId != null && (
          <div className="text-xs text-gris-dark bg-gris/60 rounded-lg px-3 py-2 flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span>Certificado: <span className="font-mono font-bold text-carbon">{fmtMonto(certificado)}</span></span>
            {presup && (
              <span>
                Saldo:{' '}
                <span className={`font-mono font-bold ${Number(presup.monto) - certificado < 0 ? 'text-rojo' : 'text-verde'}`}>
                  {fmtMonto(Number(presup.monto) - certificado)}
                </span>
              </span>
            )}
            <span>{nCerts} {nCerts === 1 ? 'certificación' : 'certificaciones'}</span>
          </div>
        )}

        <BloqueAdjunto
          label="Presupuesto (foto / PDF)"
          docNombre={presup?.doc_nombre ?? null}
          sinId={editId == null}
          puedeMutar={puedeMutar}
          motivo={motivoBloqueo}
          subiendo={subiendo}
          quitando={quitando}
          onSubir={handleSubirDoc}
          onVer={handleVerDoc}
          onQuitar={handleQuitarDoc}
        />

        {presup && (
          <AuditInfo
            createdBy={presup.created_by}
            updatedBy={presup.updated_by}
            createdAt={presup.created_at}
            updatedAt={presup.updated_at}
          />
        )}
      </form>
    </Modal>
  )
}
