'use client'

import { useState } from 'react'
import {
  useContratistas,
  useContratistasObra,
  useCertificacionesObra,
  usePresupuestosObra,
  useAsignarContratista,
  useDesasignarContratista,
  useFinalizarAsig,
  useCreateContratista,
  useUpdateContratista,
  useUploadDniContratista,
  useDeleteDniContratista,
  fetchDniContratistaSignedUrl,
  validarArchivoDni,
  codigoErrorContrat,
} from '../hooks/useContratistas'
import { useTarjaStore } from '../store/tarja.store'
import { getViernes, toISO } from '@/lib/utils/dates'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { Contratista } from '@/types/domain.types'
import { ContratistaCard } from './contratistas/ContratistaCard'
import { ModalCertificarSemana } from './contratistas/ModalCertificarSemana'
import { ModalPresupuesto } from './contratistas/ModalPresupuesto'
import {
  mensajeError, motivoBloqueoMutacion, resumirContratista,
  type ContratistaResumen,
} from './contratistas/utils'

// Sugerencias de especialidad (free text + datalist: el operario puede escribir
// cualquier cosa, estas son sólo atajos).
const ESP_SUGERENCIAS = [
  'Electricista', 'Sanitarista', 'Durlock', 'Pintor',
  'Plomero', 'Herrero', 'Carpintero',
] as const

// ── Form tipado (sin useForm<any>) ──
const schema = z.object({
  nom:          z.string().trim().min(1, 'El nombre es requerido'),
  razon_social: z.string().trim().optional(),
  especialidad: z.string().trim().optional(),
  tel:          z.string().trim().optional(),
  cuit:         z.string().trim().optional(),
  cuil:         z.string().trim().optional(),
  dni:          z.string().trim().optional(),
  banco_cuenta:   z.string().trim().optional(),
  cbu:            z.string().trim()
    .refine(s => s === '' || /^\d{22}$/.test(s.replace(/[\s-]/g, '')), 'El CBU debe tener 22 dígitos')
    .optional(),
  alias_cbu:      z.string().trim().optional(),
  titular_cuenta: z.string().trim().optional(),
  obs:          z.string().trim().optional(),
})
type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  nom:          '',
  razon_social: '',
  especialidad: '',
  tel:          '',
  cuit:         '',
  cuil:         '',
  dni:          '',
  banco_cuenta:   '',
  cbu:            '',
  alias_cbu:      '',
  titular_cuenta: '',
  obs:          '',
}

interface Props {
  obraCod: string
  readonly?: boolean
}

export function ContratistasPanel({ obraCod, readonly = false }: Props) {
  const toast = useToast()
  const {
    puedeCrear: puedeCrearPerm,
    puedeEditar: puedeEditarPerm,
    puedeEliminar: puedeEliminarPerm,
    verCostos,
    verPii,
  } = usePermisos('tarja')
  const puedeCrear    = puedeCrearPerm    && !readonly
  const puedeEditar   = puedeEditarPerm   && !readonly
  const puedeEliminar = puedeEliminarPerm && !readonly
  // Mutar certificaciones/presupuestos/asignación: backend exige
  // tarja.actualizacion + ver_pii (+ scope de obra). Se deshabilita, no se oculta.
  const puedeMutar    = puedeEditar && verPii
  const motivoBloqueo = motivoBloqueoMutacion({ readonly, puedeEditar: puedeEditarPerm, verPii })

  const { semActual } = useTarjaStore()
  const semKey = toISO(semActual)
  const esSemanaActual = semKey === toISO(getViernes(new Date()))

  const { data: todos = [] }           = useContratistas()
  const { data: asignados = [] }       = useContratistasObra(obraCod)
  const { data: certificaciones = [] } = useCertificacionesObra(obraCod)
  const { data: presupuestos = [] }    = usePresupuestosObra(obraCod)

  const { mutate: asignar, isPending: asignando } = useAsignarContratista()
  const { mutate: desasignar } = useDesasignarContratista()
  const { mutate: finalizarAsig } = useFinalizarAsig()
  const { mutate: createContrat, isPending: creando } = useCreateContratista()
  const { mutate: updateContrat, isPending: actualizando } = useUpdateContratista()
  const { mutate: uploadDni, isPending: subiendoDni } = useUploadDniContratista()
  const { mutate: deleteDni, isPending: quitandoDni } = useDeleteDniContratista()

  const [expanded, setExpanded] = useState(false)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [modalAsig, setModalAsig] = useState(false)
  const [modalContrat, setModalContrat] = useState(false)
  const [editId, setEditId] = useState<number | null>(null) // null = modo crear
  // Semana editable: desde el historial se pueden corregir semanas pasadas.
  const [modalCert, setModalCert] = useState<{ contratId: number; semKey: string } | null>(null)
  // presupuestoId null = alta.
  const [modalPresup, setModalPresup] = useState<{ contratId: number; presupuestoId: number | null } | null>(null)
  const [selContrat, setSelContrat] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  // Contratista en edición. Se deriva del array `todos`, que se refresca al
  // invalidar CONTRAT_KEY tras subir/quitar el DNI → así el bloque de
  // adjunto refleja el estado actual sin estado local duplicado.
  const contratEnEdicion = editId == null ? null : todos.find(c => c.id === editId) ?? null

  // Contratistas no asignados aún (los finalizados siguen asignados: se reactivan).
  const disponibles = todos.filter(
    c => !asignados.some(a => a.contrat_id === c.id)
  )

  function handleAsignar() {
    if (!selContrat) return
    asignar(
      { obra_cod: obraCod, contrat_id: Number(selContrat) },
      {
        onSuccess: () => { toast('✓ Contratista asignado', 'ok'); setModalAsig(false); setSelContrat('') },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al asignar'), 'err'),
      }
    )
  }

  function finalizar(r: ContratistaResumen, finalizado: boolean) {
    const nom = r.contratista.nom
    finalizarAsig(
      { obraCod, contratId: r.contratista.id, finalizado },
      {
        onSuccess: () => toast(finalizado ? `✓ ${nom} finalizado en esta obra` : `✓ ${nom} reactivado`, 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, finalizado ? 'Error al finalizar' : 'Error al reactivar'), 'err'),
      },
    )
  }

  // Sin historial: borra la asignación como siempre. Si el backend igual
  // responde 409 ASIG_CON_HISTORIAL (ej. certs que este usuario no ve), se
  // ofrece finalizar en su lugar.
  function handleDesasignar(r: ContratistaResumen) {
    const nom = r.contratista.nom
    if (!confirm(`¿Quitar a ${nom} de esta obra?`)) return
    desasignar(
      { obraCod, contratId: r.contratista.id },
      {
        onSuccess: () => toast('✓ Contratista quitado', 'ok'),
        onError: (err: unknown) => {
          if (codigoErrorContrat(err) === 'ASIG_CON_HISTORIAL') {
            const b = (err as { body?: { certs?: number; presupuestos?: number } }).body
            const detalle = b ? ` (${b.certs ?? 0} certificaciones, ${b.presupuestos ?? 0} presupuestos)` : ''
            if (confirm(
              `${nom} tiene historial en esta obra${detalle} y no se puede quitar.\n\n` +
              '¿Finalizarlo en esta obra? No se borra nada: deja de certificar y se puede reactivar.',
            )) {
              finalizar(r, true)
            }
            return
          }
          toast(mensajeError(err, 'Error al quitar'), 'err')
        },
      }
    )
  }

  function handleFinalizar(r: ContratistaResumen) {
    const ok = confirm(
      `¿Finalizar a ${r.contratista.nom} en esta obra?\n\n` +
      'No se borra nada: deja de certificar y su card pasa a "finalizados". Se puede reactivar.',
    )
    if (!ok) return
    finalizar(r, true)
  }

  function abrirNuevoContrat() {
    setEditId(null)
    reset(DEFAULTS)
    setModalContrat(true)
  }

  function abrirEditarContrat(c: Contratista) {
    setEditId(c.id)
    reset({
      nom:          c.nom,
      razon_social: c.razon_social ?? '',
      especialidad: c.especialidad ?? '',
      tel:          c.tel ?? '',
      cuit:         c.cuit ?? '',
      cuil:         c.cuil ?? '',
      dni:          c.dni ?? '',
      banco_cuenta:   c.banco_cuenta ?? '',
      cbu:            c.cbu ?? '',
      alias_cbu:      c.alias_cbu ?? '',
      titular_cuenta: c.titular_cuenta ?? '',
      obs:          c.obs ?? '',
    })
    setModalContrat(true)
  }

  function onSubmitContrat(data: FormData) {
    const dto = {
      nom:          data.nom.trim(),
      razon_social: data.razon_social?.trim() || null,
      especialidad: data.especialidad?.trim() || null,
      tel:          data.tel?.trim() || null,
      cuit:         data.cuit?.trim() || null,
      cuil:         data.cuil?.trim() || null,
      dni:          data.dni?.trim() || null,
      banco_cuenta:   data.banco_cuenta?.trim() || null,
      cbu:            data.cbu?.replace(/[\s-]/g, '') || null,
      alias_cbu:      data.alias_cbu?.trim() || null,
      titular_cuenta: data.titular_cuenta?.trim() || null,
      obs:          data.obs?.trim() || null,
    }
    if (editId == null) {
      createContrat(dto as Omit<Contratista, 'id'>, {
        onSuccess: (creado) => {
          // No cerramos: transicionamos a modo edición para poder adjuntar el
          // DNI sin reabrir el modal.
          setEditId(creado.id)
          toast('✓ Contratista creado — ya podés adjuntar el DNI', 'ok')
        },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al crear'), 'err'),
      })
    } else {
      updateContrat({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Contratista actualizado', 'ok'); setModalContrat(false) },
        onError: (err: unknown) => toast(mensajeError(err, 'Error al actualizar'), 'err'),
      })
    }
  }

  // ── DNI documento adjunto (sólo en modo edición con contratista existente) ──
  function handleSubirDni(e: React.ChangeEvent<HTMLInputElement>) {
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
    uploadDni(
      { contratId: editId, file },
      {
        onSuccess: () => toast('✓ DNI adjuntado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'Error al subir el DNI'), 'err'),
      },
    )
  }

  async function handleVerDni() {
    if (editId == null) return
    await abrirAdjuntoFirmado(
      () => fetchDniContratistaSignedUrl(editId),
      (err) => toast(mensajeError(err, 'No se pudo abrir el DNI'), 'err'),
    )
  }

  function handleQuitarDni() {
    if (editId == null) return
    if (!confirm('¿Quitar el documento de DNI adjunto?')) return
    deleteDni(
      { contratId: editId },
      {
        onSuccess: () => toast('✓ DNI quitado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'No se pudo quitar el DNI'), 'err'),
      },
    )
  }

  // Resumen por card: certificaciones (todas las semanas) y presupuestos de la
  // obra, ya filtrados por contratista. Activos primero; los finalizados van a
  // una sección colapsada al final.
  const resumenes   = asignados.map(a => resumirContratista(a, certificaciones, presupuestos, semKey))
  const activos     = resumenes.filter(r => !r.finalizado)
  const finalizados = resumenes.filter(r => r.finalizado)
  const certificadosSemana = activos.filter(r => r.certsSemana.length > 0).length

  // El modal de presupuesto de un contratista finalizado es solo lectura.
  const presupFinalizado = modalPresup != null
    && (asignados.find(a => a.contrat_id === modalPresup.contratId)?.finalizado_en != null)

  function renderCard(r: ContratistaResumen) {
    return (
      <ContratistaCard
        key={r.contratista.id}
        resumen={r}
        semKey={semKey}
        esSemanaActual={esSemanaActual}
        verCostos={verCostos}
        puedeMutar={puedeMutar}
        motivoBloqueo={motivoBloqueo}
        puedeEditarContrat={puedeEditar}
        puedeQuitar={puedeEliminar}
        onEditarContrat={abrirEditarContrat}
        onQuitar={() => handleDesasignar(r)}
        onFinalizar={() => handleFinalizar(r)}
        onReactivar={() => finalizar(r, false)}
        onCertificar={(sem) => setModalCert({ contratId: r.contratista.id, semKey: sem })}
        onPresupuesto={(presupuestoId) => setModalPresup({ contratId: r.contratista.id, presupuestoId })}
      />
    )
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-card border-l-4 border-[#5A2D82]">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex items-center gap-3 text-left flex-1"
          >
            <span className="text-azul text-lg">{expanded ? '▾' : '▸'}</span>
            <div>
              <h3 className="font-display text-xl tracking-wider text-azul">
                CONTRATISTAS EXTERNOS
              </h3>
              <p className="text-xs text-gris-dark mt-0.5">
                {activos.length} asignados a esta obra
                {finalizados.length > 0 && ` · ${finalizados.length} finalizados`}
                {verCostos && activos.length > 0 && ` · ${certificadosSemana} de ${activos.length} certificados esta semana`}
              </p>
            </div>
          </button>
          {puedeCrear && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setModalAsig(true)}
            >
              ＋ Asignar
            </Button>
          )}
        </div>

        {expanded && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {resumenes.length === 0 ? (
              <p className="text-sm text-gris-dark text-center py-4">
                No hay contratistas asignados a esta obra.
              </p>
            ) : (
              <>
                {activos.length === 0 && (
                  <p className="text-sm text-gris-dark text-center py-2">
                    No hay contratistas activos en esta obra.
                  </p>
                )}
                {activos.map(renderCard)}

                {finalizados.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setVerFinalizados(p => !p)}
                      className="text-xs font-bold text-gris-dark hover:text-azul transition-colors text-left"
                    >
                      {verFinalizados ? '▾' : '▸'} {finalizados.length} finalizado{finalizados.length === 1 ? '' : 's'}
                    </button>
                    {verFinalizados && finalizados.map(renderCard)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal asignar contratista */}
      <Modal
        open={modalAsig}
        onClose={() => setModalAsig(false)}
        title="🔧 ASIGNAR CONTRATISTA"
        footer={
          <>
            <button
              onClick={() => { setModalAsig(false); abrirNuevoContrat() }}
              className="mr-auto text-xs font-bold text-azul hover:text-naranja transition-colors"
            >
              ＋ Crear nuevo
            </button>
            <Button variant="secondary" onClick={() => setModalAsig(false)}>Cancelar</Button>
            <Button variant="primary" loading={asignando} onClick={handleAsignar}>
              ✓ Asignar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 min-h-[16rem]">
          <Combobox
            label="Buscá y seleccioná contratista"
            placeholder="Escribí nombre o especialidad…"
            value={selContrat}
            onChange={setSelContrat}
            options={disponibles.map(c => ({
              value: String(c.id),
              label: c.nom,
              sub:   [c.especialidad, c.tel].filter(Boolean).join(' · ') || undefined,
            }))}
          />
          {disponibles.length === 0 && (
            <p className="text-sm text-gris-dark bg-gris rounded-lg p-3">
              Todos los contratistas ya están asignados.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal nuevo / editar contratista */}
      <Modal
        open={modalContrat}
        onClose={() => setModalContrat(false)}
        title={editId == null ? '🔧 NUEVO CONTRATISTA' : '🔧 EDITAR CONTRATISTA'}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalContrat(false)}>
              {editId == null ? 'Cancelar' : 'Cerrar'}
            </Button>
            <Button
              variant="primary"
              loading={creando || actualizando}
              disabled={editId == null ? !puedeCrear : !puedeEditar}
              onClick={handleSubmit(onSubmitContrat)}
            >
              ✓ {editId == null ? 'Crear' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Nombre completo"
            placeholder="Juan Pérez"
            error={errors.nom?.message}
            {...register('nom')}
          />
          <Input
            label="Razón social"
            placeholder="Electricidad del Norte SRL (opcional)"
            {...register('razon_social')}
          />
          <Input
            label="Especialidad"
            placeholder="Ej: Electricista (escribí o elegí)"
            list="contrat-especialidades"
            {...register('especialidad')}
          />
          <datalist id="contrat-especialidades">
            {ESP_SUGERENCIAS.map(e => (
              <option key={e} value={e} />
            ))}
          </datalist>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Teléfono" placeholder="351-XXX-XXXX" {...register('tel')} />
            <Input label="DNI" placeholder="Número de DNI" {...register('dni')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="CUIT" placeholder="XX-XXXXXXXX-X" {...register('cuit')} />
            <Input label="CUIL" placeholder="XX-XXXXXXXX-X" {...register('cuil')} />
          </div>

          {/* Datos bancarios (para transferirle los pagos) */}
          <div className="border-t border-gris-mid pt-3 flex flex-col gap-3">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              🏦 Datos bancarios
            </span>
            <Input
              label="Banco / cuenta"
              placeholder="Ej: Caja de ahorro en pesos 245-029026/3"
              {...register('banco_cuenta')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="CBU"
                placeholder="22 dígitos"
                error={errors.cbu?.message}
                {...register('cbu')}
              />
              <Input label="Alias" placeholder="ej: materializar.2026" {...register('alias_cbu')} />
            </div>
            <Input
              label="Titular de la cuenta"
              placeholder="Nombre completo del titular"
              {...register('titular_cuenta')}
            />
          </div>

          {/* DNI documento adjunto — sólo en edición de contratista existente */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              DNI (foto / PDF del documento)
            </label>
            {editId == null ? (
              <p className="text-xs text-gris-dark italic">
                Guardá primero para adjuntar el DNI.
              </p>
            ) : contratEnEdicion?.dni_doc_nombre ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border-[1.5px] border-gris-mid px-3 py-2">
                <span className="text-sm text-carbon truncate" title={contratEnEdicion.dni_doc_nombre}>
                  📎 {contratEnEdicion.dni_doc_nombre}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={handleVerDni}>Ver</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!puedeEditar || quitandoDni}
                    onClick={handleQuitarDni}
                  >
                    {quitandoDni ? 'Quitando…' : 'Quitar'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleSubirDni}
                  disabled={!puedeEditar || subiendoDni}
                  className="text-xs text-gris-dark file:mr-3 file:rounded-lg file:border-0 file:bg-gris file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-carbon hover:file:bg-gris-mid disabled:opacity-60 disabled:cursor-not-allowed"
                />
                {subiendoDni && (
                  <span className="text-xs text-gris-dark inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                    Subiendo…
                  </span>
                )}
                <span className="text-[11px] text-gris-mid">
                  JPG, PNG, WEBP, HEIC o PDF · máx. 10 MB
                </span>
              </div>
            )}
          </div>

          <Input label="Observaciones" placeholder="Notas adicionales" {...register('obs')} />

          {contratEnEdicion && (
            <AuditInfo
              createdBy={contratEnEdicion.created_by}
              updatedBy={contratEnEdicion.updated_by}
              createdAt={contratEnEdicion.created_at}
              updatedAt={contratEnEdicion.updated_at}
            />
          )}
        </div>
      </Modal>

      {/* Modal certificar semana: se monta al abrir → el form arranca con las
          filas precargadas de esa semana (sin reset manual). */}
      {modalCert && (
        <ModalCertificarSemana
          obraCod={obraCod}
          contratId={modalCert.contratId}
          semKey={modalCert.semKey}
          puedeMutar={puedeMutar}
          motivoBloqueo={motivoBloqueo}
          onClose={() => setModalCert(null)}
        />
      )}

      {/* Modal presupuesto (alta / edición) */}
      {modalPresup && (
        <ModalPresupuesto
          obraCod={obraCod}
          contratId={modalPresup.contratId}
          presupuestoId={modalPresup.presupuestoId}
          puedeMutar={puedeMutar && !presupFinalizado}
          motivoBloqueo={motivoBloqueoMutacion({
            readonly, puedeEditar: puedeEditarPerm, verPii, finalizado: presupFinalizado,
          })}
          onClose={() => setModalPresup(null)}
        />
      )}
    </>
  )
}
