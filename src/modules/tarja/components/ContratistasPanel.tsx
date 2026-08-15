'use client'

import { useState } from 'react'
import {
  useContratistas,
  useContratistasObra,
  useCertificacionesObra,
  useAsignarContratista,
  useDesasignarContratista,
  useUpsertCertificacion,
  useUpdateCotizacion,
  useCreateContratista,
  useUpdateContratista,
  useUploadDniContratista,
  useDeleteDniContratista,
  useUploadCotizacionDoc,
  useDeleteCotizacionDoc,
  fetchDniContratistaSignedUrl,
  fetchCotizacionDocSignedUrl,
  validarArchivoDni,
} from '../hooks/useContratistas'
import { useTarjaStore } from '../store/tarja.store'
import { toISO } from '@/lib/utils/dates'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Badge } from '@/components/ui/Badge'
import { AuditInfo } from '@/components/ui/AuditInfo'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { Contratista } from '@/types/domain.types'

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

// Formato de montos en pesos (es-AR, sin decimales).
function fmtMonto(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function ContratistasPanel({ obraCod, readonly = false }: Props) {
  const toast = useToast()
  const { puedeCrear: puedeCrearPerm, puedeEditar: puedeEditarPerm, puedeEliminar: puedeEliminarPerm, verCostos } = usePermisos('tarja')
  const puedeCrear   = puedeCrearPerm   && !readonly
  const puedeEditar  = puedeEditarPerm  && !readonly
  const puedeEliminar = puedeEliminarPerm && !readonly
  const { semActual } = useTarjaStore()
  const semKey = toISO(semActual)

  const { data: todos = [] } = useContratistas()
  const { data: asignados = [] } = useContratistasObra(obraCod)
  const { data: certificaciones = [] } = useCertificacionesObra(obraCod)

  const { mutate: asignar, isPending: asignando } = useAsignarContratista()
  const { mutate: desasignar } = useDesasignarContratista()
  const { mutate: upsertCert, isPending: guardandoCert } = useUpsertCertificacion()
  const { mutate: updateCotiz, isPending: guardandoCotiz } = useUpdateCotizacion()
  const { mutate: createContrat, isPending: creando } = useCreateContratista()
  const { mutate: updateContrat, isPending: actualizando } = useUpdateContratista()
  const { mutate: uploadDni, isPending: subiendoDni } = useUploadDniContratista()
  const { mutate: deleteDni, isPending: quitandoDni } = useDeleteDniContratista()
  const { mutate: uploadCotizDoc, isPending: subiendoCotizDoc } = useUploadCotizacionDoc()
  const { mutate: deleteCotizDoc, isPending: quitandoCotizDoc } = useDeleteCotizacionDoc()

  const [expanded, setExpanded] = useState(false)
  const [modalAsig, setModalAsig] = useState(false)
  const [modalContrat, setModalContrat] = useState(false)
  const [editId, setEditId] = useState<number | null>(null) // null = modo crear
  // Semana editable: desde el historial se pueden corregir semanas pasadas.
  const [modalCert, setModalCert] = useState<{ contratId: number; semKey: string } | null>(null)
  const [modalCotiz, setModalCotiz] = useState<number | null>(null) // contrat_id
  const [histId, setHistId] = useState<number | null>(null) // contrat_id con historial abierto
  const [selContrat, setSelContrat] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })
  const formCert = useForm<{ monto: number; desc: string; estado: 'pendiente' | 'cerrado' }>()
  const formCotiz = useForm<{ cotizacion: number; cotizacion_obs: string }>()

  // Contratista en edición. Se deriva del array `todos`, que se refresca al
  // invalidar CONTRAT_KEY tras subir/quitar el DNI → así el bloque de
  // adjunto refleja el estado actual sin estado local duplicado.
  const contratEnEdicion = editId == null ? null : todos.find(c => c.id === editId) ?? null

  // Contratistas no asignados aún
  const disponibles = todos.filter(
    c => !asignados.some(a => a.contrat_id === c.id)
  )

  function handleAsignar() {
    if (!selContrat) return
    asignar(
      { obra_cod: obraCod, contrat_id: Number(selContrat) },
      {
        onSuccess: () => { toast('✓ Contratista asignado', 'ok'); setModalAsig(false); setSelContrat('') },
        onError: () => toast('Error al asignar', 'err'),
      }
    )
  }

  function handleDesasignar(contratId: number, nom: string) {
    if (!confirm(`¿Quitar a ${nom} de esta obra?`)) return
    desasignar(
      { obraCod, contratId },
      {
        onSuccess: () => toast('✓ Contratista quitado', 'ok'),
        onError: () => toast('Error al quitar', 'err'),
      }
    )
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
        onError: () => toast('Error al crear', 'err'),
      })
    } else {
      updateContrat({ id: editId, dto }, {
        onSuccess: () => { toast('✓ Contratista actualizado', 'ok'); setModalContrat(false) },
        onError: () => toast('Error al actualizar', 'err'),
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

  function getCert(contratId: number, sem: string = semKey) {
    return certificaciones.find(
      c => c.contrat_id === contratId && c.sem_key === sem
    )
  }

  function handleOpenCert(contratId: number, sem: string = semKey) {
    const cert = getCert(contratId, sem)
    formCert.reset({
      monto: cert?.monto ?? 0,
      desc: cert?.desc ?? '',
      estado: cert?.estado ?? 'pendiente',
    })
    setModalCert({ contratId, semKey: sem })
  }

  function handleSaveCert(data: { monto: number; desc: string; estado: 'pendiente' | 'cerrado' }) {
    if (modalCert === null) return
    upsertCert(
      {
        obra_cod: obraCod,
        contrat_id: modalCert.contratId,
        sem_key: modalCert.semKey,
        monto: Number(data.monto),
        desc: data.desc,
        estado: data.estado,
      },
      {
        onSuccess: () => { toast('✓ Certificación guardada', 'ok'); setModalCert(null) },
        onError: () => toast('Error al guardar', 'err'),
      }
    )
  }

  // ── Cotización inicial por contratista×obra ──
  function handleOpenCotiz(contratId: number) {
    const asig = asignados.find(a => a.contrat_id === contratId)
    formCotiz.reset({
      cotizacion:     asig?.cotizacion ?? 0,
      cotizacion_obs: asig?.cotizacion_obs ?? '',
    })
    setModalCotiz(contratId)
  }

  function handleSaveCotiz(data: { cotizacion: number; cotizacion_obs: string }) {
    if (modalCotiz === null) return
    // valueAsNumber da NaN con input vacío; JSON serializa NaN como null y
    // eso borraría la cotización sin querer. Para borrar está el botón explícito.
    if (Number.isNaN(data.cotizacion) || data.cotizacion < 0) {
      toast('Ingresá un monto válido', 'err')
      return
    }
    updateCotiz(
      {
        obraCod,
        contratId: modalCotiz,
        dto: {
          cotizacion:     Number(data.cotizacion),
          cotizacion_obs: data.cotizacion_obs.trim() || null,
        },
      },
      {
        onSuccess: () => { toast('✓ Cotización guardada', 'ok'); setModalCotiz(null) },
        onError: () => toast('Error al guardar la cotización', 'err'),
      }
    )
  }

  // ── Adjunto de la cotización (presupuesto foto/PDF) ──
  function handleSubirCotizDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || modalCotiz == null) return
    try {
      validarArchivoDni(file)
    } catch (err: unknown) {
      toast(mensajeError(err, 'Archivo no válido'), 'err')
      return
    }
    uploadCotizDoc(
      { obraCod, contratId: modalCotiz, file },
      {
        onSuccess: () => toast('✓ Presupuesto adjuntado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'Error al subir el adjunto'), 'err'),
      },
    )
  }

  async function handleVerCotizDoc(contratId: number) {
    await abrirAdjuntoFirmado(
      () => fetchCotizacionDocSignedUrl(obraCod, contratId),
      (err) => toast(mensajeError(err, 'No se pudo abrir el adjunto'), 'err'),
    )
  }

  function handleQuitarCotizDoc() {
    if (modalCotiz == null) return
    if (!confirm('¿Quitar el presupuesto adjunto?')) return
    deleteCotizDoc(
      { obraCod, contratId: modalCotiz },
      {
        onSuccess: () => toast('✓ Adjunto quitado', 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'No se pudo quitar el adjunto'), 'err'),
      },
    )
  }

  function handleBorrarCotiz() {
    if (modalCotiz === null) return
    if (!confirm('¿Borrar la cotización cargada? El historial de certificaciones no se toca.')) return
    updateCotiz(
      { obraCod, contratId: modalCotiz, dto: { cotizacion: null, cotizacion_obs: null } },
      {
        onSuccess: () => { toast('✓ Cotización borrada', 'ok'); setModalCotiz(null) },
        onError: () => toast('Error al borrar la cotización', 'err'),
      }
    )
  }

  // Card por contratista con su resumen financiero: todas las certificaciones
  // de la obra (todas las semanas) descuentan de la cotización inicial.
  const contratistasConDatos = asignados.map(a => {
    const certs = certificaciones
      .filter(c => c.contrat_id === a.contrat_id)
      .sort((x, y) => y.sem_key.localeCompare(x.sem_key))
    const totalCertificado = certs.reduce((acc, c) => acc + Number(c.monto), 0)
    const totalPendiente   = certs.reduce((acc, c) => acc + (c.estado === 'pendiente' ? Number(c.monto) : 0), 0)
    const cotizacion = a.cotizacion == null ? null : Number(a.cotizacion)
    return {
      ...a.contratistas,
      cert: getCert(a.contrat_id),
      certs,
      totalCertificado,
      totalPendiente,
      cotizacion,
      cotizacionDocNombre: a.cotizacion_doc_nombre ?? null,
      saldo: cotizacion == null ? null : cotizacion - totalCertificado,
    }
  })

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
                {asignados.length} asignados a esta obra
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
            {contratistasConDatos.length === 0 ? (
              <p className="text-sm text-gris-dark text-center py-4">
                No hay contratistas asignados a esta obra.
              </p>
            ) : (
              contratistasConDatos.map(c => (
                <div
                  key={c.id}
                  className="border border-gris-mid rounded-xl p-3 flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#EEE8FF] flex items-center justify-center text-[#5A2D82] font-bold text-sm flex-shrink-0">
                        {c.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-carbon">{c.nom}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.especialidad && (
                            <span className="text-[10px] font-bold bg-[#EEE8FF] text-[#5A2D82] px-2 py-0.5 rounded">
                              {c.especialidad}
                            </span>
                          )}
                          {c.tel && (
                            <span className="text-xs text-gris-dark">{c.tel}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Certificación semana actual */}
                      {c.cert ? (
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={c.cert.estado === 'cerrado' ? 'cerrado' : 'pendiente'}
                          />
                          <span className="font-mono text-sm font-bold text-verde">
                            ${c.cert.monto.toLocaleString('es-AR')}
                          </span>
                          {puedeEditar && (
                            <button
                              onClick={() => handleOpenCert(c.id)}
                              className="text-xs font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      ) : puedeCrear ? (
                        <button
                          onClick={() => handleOpenCert(c.id)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde hover:bg-verde hover:text-white transition-colors"
                        >
                          ＋ Certificar semana
                        </button>
                      ) : null}
                      {puedeEditar && (
                        <button
                          onClick={() => abrirEditarContrat(c)}
                          title="Editar datos del contratista"
                          className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                        >
                          ✏️ Editar
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          onClick={() => handleDesasignar(c.id, c.nom)}
                          className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resumen financiero: cotización − certificado = saldo adeudado.
                      Oculto para usuarios sin ver_costos (el backend tampoco manda montos). */}
                  {verCostos && (
                    <div className="rounded-lg bg-gris/60 px-3 py-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-x-4 gap-y-1 flex-wrap text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gris-dark font-semibold">Cotización:</span>
                          {c.cotizacion != null ? (
                            <span className="font-mono font-bold text-carbon">{fmtMonto(c.cotizacion)}</span>
                          ) : (
                            <span className="text-gris-dark italic">sin cargar</span>
                          )}
                          {c.cotizacionDocNombre && (
                            <button
                              onClick={() => handleVerCotizDoc(c.id)}
                              title={`Ver presupuesto adjunto: ${c.cotizacionDocNombre}`}
                              className="text-[11px] px-1 rounded text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                            >
                              📎
                            </button>
                          )}
                          {puedeEditar && (
                            <button
                              onClick={() => handleOpenCotiz(c.id)}
                              title={c.cotizacion != null ? 'Editar cotización' : 'Cargar cotización inicial'}
                              className="text-[11px] font-bold px-1.5 py-0.5 rounded text-azul hover:bg-azul-light transition-colors"
                            >
                              {c.cotizacion != null ? '✏️' : '＋ Cargar'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gris-dark font-semibold">Certificado:</span>
                          <span className="font-mono font-bold text-carbon">{fmtMonto(c.totalCertificado)}</span>
                          {c.totalPendiente > 0 && (
                            <span
                              className="text-[10px] font-bold bg-naranja/15 text-naranja px-1.5 py-0.5 rounded"
                              title="Certificado con estado pendiente (todavía sin pagar)"
                            >
                              {fmtMonto(c.totalPendiente)} pend.
                            </span>
                          )}
                        </div>
                        {c.saldo != null && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-gris-dark font-semibold">Saldo:</span>
                            <span className={`font-mono font-bold ${c.saldo < 0 ? 'text-rojo' : c.saldo === 0 ? 'text-gris-dark' : 'text-verde'}`}>
                              {c.saldo < 0 ? `Excedido ${fmtMonto(-c.saldo)}` : fmtMonto(c.saldo)}
                            </span>
                          </div>
                        )}
                        {c.certs.length > 0 && (
                          <button
                            onClick={() => setHistId(p => (p === c.id ? null : c.id))}
                            className="text-[11px] font-bold text-azul hover:text-naranja transition-colors ml-auto"
                          >
                            {histId === c.id ? '▾ Ocultar historial' : `▸ Historial (${c.certs.length})`}
                          </button>
                        )}
                      </div>

                      {/* Barra de avance certificado/cotización */}
                      {c.cotizacion != null && c.cotizacion > 0 && (
                        <div className="h-1.5 rounded-full bg-gris-mid/60 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${c.totalCertificado > c.cotizacion ? 'bg-rojo' : 'bg-verde'}`}
                            style={{ width: `${Math.min(100, (c.totalCertificado / c.cotizacion) * 100)}%` }}
                          />
                        </div>
                      )}

                      {/* Historial de certificaciones semanales de esta obra */}
                      {histId === c.id && (
                        <div className="mt-1 flex flex-col divide-y divide-gris-mid/50">
                          {c.certs.map(cert => (
                            <div key={cert.sem_key} className="flex items-center gap-2 py-1.5 text-xs">
                              <span className="font-mono text-gris-dark w-[84px] shrink-0">{cert.sem_key}</span>
                              <Badge variant={cert.estado === 'cerrado' ? 'cerrado' : 'pendiente'} />
                              <span className="text-gris-dark truncate flex-1" title={cert.desc || undefined}>
                                {cert.desc || '—'}
                              </span>
                              <span className="font-mono font-bold text-carbon">{fmtMonto(Number(cert.monto))}</span>
                              {puedeEditar && (
                                <button
                                  onClick={() => handleOpenCert(c.id, cert.sem_key)}
                                  title="Corregir esta semana"
                                  className="text-[11px] px-1 rounded text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
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

      {/* Modal cotización inicial */}
      {(() => {
        const asigActual = modalCotiz !== null ? asignados.find(a => a.contrat_id === modalCotiz) : null
        const nomActual  = modalCotiz !== null ? todos.find(t => t.id === modalCotiz)?.nom : null
        return (
          <Modal
            open={modalCotiz !== null}
            onClose={() => setModalCotiz(null)}
            title="📋 COTIZACIÓN INICIAL"
            footer={
              <>
                {asigActual?.cotizacion != null && puedeEditar && (
                  <button
                    onClick={handleBorrarCotiz}
                    className="mr-auto text-xs font-bold text-rojo hover:underline"
                  >
                    Borrar cotización
                  </button>
                )}
                <Button variant="secondary" onClick={() => setModalCotiz(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  loading={guardandoCotiz}
                  onClick={formCotiz.handleSubmit(handleSaveCotiz)}
                >
                  ✓ Guardar
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="bg-gris rounded-lg px-3 py-2 text-sm">
                <span className="text-gris-dark font-semibold">Contratista: </span>
                <span className="font-bold text-azul">{nomActual ?? '—'}</span>
                <span className="text-gris-dark"> · obra </span>
                <span className="font-mono font-bold text-azul">{obraCod}</span>
              </div>
              <p className="text-xs text-gris-dark">
                Monto total acordado para el trabajo en esta obra. Cada certificación
                semanal se descuenta de este monto y el saldo restante se ve en el panel.
              </p>
              <Input
                label="Monto cotizado ($)"
                type="number"
                step="1000"
                min="0"
                placeholder="0"
                {...formCotiz.register('cotizacion', { valueAsNumber: true })}
              />
              <Input
                label="Observaciones"
                placeholder="Alcance, condiciones, adicionales (opcional)"
                {...formCotiz.register('cotizacion_obs')}
              />

              {/* Presupuesto adjunto (foto/PDF). Vive en la asignación, así que
                  se puede adjuntar aunque el monto todavía no esté guardado. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                  Presupuesto (foto / PDF)
                </label>
                {asigActual?.cotizacion_doc_nombre ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border-[1.5px] border-gris-mid px-3 py-2">
                    <span className="text-sm text-carbon truncate" title={asigActual.cotizacion_doc_nombre}>
                      📎 {asigActual.cotizacion_doc_nombre}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => modalCotiz != null && handleVerCotizDoc(modalCotiz)}
                      >
                        Ver
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!puedeEditar || quitandoCotizDoc}
                        onClick={handleQuitarCotizDoc}
                      >
                        {quitandoCotizDoc ? 'Quitando…' : 'Quitar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleSubirCotizDoc}
                      disabled={!puedeEditar || subiendoCotizDoc}
                      className="text-xs text-gris-dark file:mr-3 file:rounded-lg file:border-0 file:bg-gris file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-carbon hover:file:bg-gris-mid disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    {subiendoCotizDoc && (
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

              {asigActual && (
                <AuditInfo
                  createdBy={asigActual.created_by}
                  updatedBy={asigActual.updated_by}
                  createdAt={asigActual.created_at}
                  updatedAt={asigActual.updated_at}
                />
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Modal certificación */}
      {(() => {
        const certActual = modalCert !== null ? getCert(modalCert.contratId, modalCert.semKey) : null
        return (
          <Modal
            open={modalCert !== null}
            onClose={() => setModalCert(null)}
            title="💰 CERTIFICACIÓN DE SEMANA"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalCert(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  loading={guardandoCert}
                  onClick={formCert.handleSubmit(handleSaveCert)}
                >
                  ✓ Guardar
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="bg-gris rounded-lg px-3 py-2 text-sm">
                <span className="text-gris-dark font-semibold">Semana: </span>
                <span className="font-mono font-bold text-azul">{modalCert?.semKey ?? semKey}</span>
                {modalCert !== null && modalCert.semKey !== semKey && (
                  <span className="ml-2 text-[10px] font-bold bg-naranja/15 text-naranja px-1.5 py-0.5 rounded">
                    semana pasada
                  </span>
                )}
              </div>
              <Input
                label="Monto ($)"
                type="number"
                step="100"
                placeholder="0"
                {...formCert.register('monto')}
              />
              <Input
                label="Descripción"
                placeholder="Ej: Instalación eléctrica piso 2"
                {...formCert.register('desc')}
              />
              <Select
                label="Estado"
                options={[
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'cerrado', label: 'Cerrado' },
                ]}
                {...formCert.register('estado')}
              />
              {certActual && (
                <AuditInfo
                  createdBy={certActual.created_by}
                  updatedBy={certActual.updated_by}
                  createdAt={certActual.created_at}
                  updatedAt={certActual.updated_at}
                />
              )}
            </div>
          </Modal>
        )
      })()}
    </>
  )
}

function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message
  return m || fallback
}
