'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useCamiones, useUpdateCamion } from '../hooks/useLogistica'
import {
  useCamionServices,
  useCamionServiceEstadoTodos,
  useCreateCamionService,
  useDeleteCamionService,
  uploadComprobanteService,
  fetchServiceComprobanteUrl,
  CAMION_SERVICES_ESTADO_KEY,
} from '../hooks/useCamionServices'
import type {
  CamionService,
  CamionServiceEstado,
  CamionServiceEstadoKey,
} from '@/types/domain.types'
import { toISO } from '@/lib/utils/dates'

interface Props {
  camionId: number
}

// ── Helpers de formato ─────────────────────────────────────────────────
function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Math.round(n).toLocaleString('es-AR')} km`
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`
}

// Color tokens del proyecto, tomados a propósito iguales que los del Badge
// para que la pantalla se sienta consistente con el resto de la app.
const ESTADO_STYLE: Record<CamionServiceEstadoKey, { cls: string; label: string }> = {
  sin_service: { cls: 'bg-gris text-gris-dark',         label: 'Sin services' },
  al_dia:      { cls: 'bg-verde-light text-verde',      label: 'Al día' },
  proximo:     { cls: 'bg-amarillo-light text-[#7A5500]', label: 'Próximo' },
  vencido:     { cls: 'bg-rojo-light text-rojo',         label: 'Vencido' },
}

// ── Componente principal ───────────────────────────────────────────────
export function CamionServicesSection({ camionId }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const { puedeEditar, puedeEliminar } = usePermisos('logistica')

  const { data: camiones = [] } = useCamiones()
  const camion = camiones.find(c => c.id === camionId)

  const { data: estadoTodos = [], isLoading: loadingEstado } = useCamionServiceEstadoTodos()
  const estado: CamionServiceEstado | undefined = useMemo(
    () => estadoTodos.find(e => e.camion_id === camionId),
    [estadoTodos, camionId],
  )

  const { data: historial = [], isLoading: loadingHist } = useCamionServices(camionId)

  const { mutate: updateCamion, isPending: savingKm } = useUpdateCamion()
  const { mutate: deleteService } = useDeleteCamionService()

  const [editandoKm, setEditandoKm] = useState(false)
  const [kmDraft, setKmDraft] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [modalRegistrar, setModalRegistrar] = useState(false)

  function startEditKm() {
    setKmDraft(String(camion?.km_actuales ?? estado?.km_actuales ?? 0))
    setEditandoKm(true)
  }

  function cancelarKm() {
    setEditandoKm(false)
    setKmDraft('')
  }

  function guardarKm() {
    const n = Number(kmDraft)
    if (!Number.isFinite(n) || n < 0) {
      toast('Ingresá un número válido', 'err')
      return
    }
    updateCamion({ id: camionId, dto: { km_actuales: n } }, {
      onSuccess: () => {
        toast('✓ Km actualizados', 'ok')
        // El estado depende de km_actuales — refrescar la vista.
        qc.invalidateQueries({ queryKey: CAMION_SERVICES_ESTADO_KEY })
        setEditandoKm(false)
        setKmDraft('')
      },
      onError: () => toast('Error al actualizar km', 'err'),
    })
  }

  async function handleVerComprobante(serviceId: number) {
    try {
      const url = await fetchServiceComprobanteUrl(serviceId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast('No se pudo abrir el comprobante', 'err')
    }
  }

  function handleDeleteService(s: CamionService) {
    if (!confirm(`¿Eliminar el service del ${fmtFecha(s.fecha)}?`)) return
    deleteService(s.id, {
      onSuccess: () => toast('✓ Service eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  // ── Texto contextual debajo del bloque de km ──
  function textoContextual(): { text: string; cls: string } {
    if (!estado || estado.estado === 'sin_service') {
      return { text: 'Sin services registrados', cls: 'text-gris-dark italic' }
    }
    if (estado.estado === 'vencido') {
      const km = Math.abs(estado.km_restantes ?? 0)
      return { text: `🔴 Vencido hace ${km.toLocaleString('es-AR')} km`, cls: 'text-rojo font-bold' }
    }
    if (estado.estado === 'proximo') {
      const km = estado.km_restantes ?? 0
      return { text: `⚠ Próximo en ${km.toLocaleString('es-AR')} km`, cls: 'text-[#7A5500] font-bold' }
    }
    // al_dia
    const km = estado.km_restantes ?? 0
    return { text: `Faltan ${km.toLocaleString('es-AR')} km`, cls: 'text-verde font-semibold' }
  }

  const ctx = textoContextual()
  const estadoCfg = estado ? ESTADO_STYLE[estado.estado] : ESTADO_STYLE.sin_service

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">🔧 Service</h3>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${estadoCfg.cls}`}
        >
          {estadoCfg.label}
        </span>
      </div>

      {loadingEstado || loadingHist ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : (
        <div className="border border-gris-mid rounded-lg p-3 flex flex-col gap-2 bg-gris/20">
          {/* Km actuales */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Km actuales:
            </span>
            {editandoKm ? (
              <>
                <input
                  type="number"
                  value={kmDraft}
                  onChange={e => setKmDraft(e.target.value)}
                  className="w-32 px-2 py-1 text-sm font-mono border-[1.5px] border-gris-mid rounded outline-none focus:border-naranja"
                  autoFocus
                />
                <Button variant="primary" size="sm" loading={savingKm} onClick={guardarKm}>
                  Guardar
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelarKm}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="font-mono font-bold text-sm text-carbon">
                  {fmtKm(camion?.km_actuales ?? estado?.km_actuales ?? 0)}
                </span>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={startEditKm}
                    title="Editar km actuales"
                    className="text-[11px] font-bold px-2 py-1 rounded bg-naranja-light text-naranja-dark hover:bg-naranja hover:text-white transition-colors"
                  >
                    ✏️
                  </button>
                )}
              </>
            )}
          </div>

          {/* Último service */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
              Último service:
            </span>
            {estado?.fecha_ultimo_service ? (
              <>
                <span className="text-carbon">
                  {fmtFecha(estado.fecha_ultimo_service)} · {fmtKm(estado.km_ultimo_service)}
                </span>
                {historial[0]?.comprobante_url && (
                  <button
                    type="button"
                    onClick={() => handleVerComprobante(historial[0].id)}
                    title="Ver comprobante"
                    className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                  >
                    👁
                  </button>
                )}
              </>
            ) : (
              <span className="text-gris-dark italic text-xs">—</span>
            )}
          </div>

          {/* Próximo */}
          {estado?.km_proximo_service != null && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
                Próximo:
              </span>
              <span className="font-mono text-carbon">{fmtKm(estado.km_proximo_service)}</span>
            </div>
          )}

          {/* Texto contextual */}
          <div className={`text-sm ${ctx.cls}`}>{ctx.text}</div>

          {/* Acciones */}
          <div className="flex gap-2 mt-1 flex-wrap">
            {puedeEditar && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setModalRegistrar(true)}
              >
                ＋ Registrar service
              </Button>
            )}
            {historial.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setVerHistorial(v => !v)}
              >
                {verHistorial ? '▲ Ocultar historial' : `▼ Historial (${historial.length})`}
              </Button>
            )}
          </div>

          {/* Historial */}
          {verHistorial && historial.length > 0 && (
            <ul className="flex flex-col gap-1.5 mt-2">
              {historial.map(s => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 bg-white border border-gris-mid rounded px-2 py-1.5 flex-wrap text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-carbon">
                      {fmtFecha(s.fecha)} — {fmtKm(s.km_service)}
                    </div>
                    <div className="text-[11px] text-gris-dark">
                      próx. {fmtKm(s.km_proximo)}
                      {s.obs ? ` · ${s.obs}` : ''}
                    </div>
                  </div>
                  {s.comprobante_url && (
                    <button
                      type="button"
                      onClick={() => handleVerComprobante(s.id)}
                      title="Ver comprobante"
                      className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                    >
                      👁
                    </button>
                  )}
                  {puedeEliminar && (
                    <button
                      type="button"
                      onClick={() => handleDeleteService(s)}
                      title="Eliminar"
                      className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modalRegistrar && (
        <RegistrarServiceModal
          camionId={camionId}
          kmActuales={camion?.km_actuales ?? estado?.km_actuales ?? 0}
          onClose={() => setModalRegistrar(false)}
        />
      )}
    </div>
  )
}

// ── Modal: registrar nuevo service ─────────────────────────────────────
interface ModalProps {
  camionId:    number
  kmActuales:  number
  onClose:     () => void
}

interface ServiceFormValues {
  fecha:      string
  km_service: number | string
  km_proximo: number | string
  obs:        string
}

function RegistrarServiceModal({ camionId, kmActuales, onClose }: ModalProps) {
  const toast = useToast()
  const { mutate: createService, isPending: creating } = useCreateCamionService()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const form = useForm<ServiceFormValues>({
    defaultValues: {
      fecha:      toISO(new Date()),
      km_service: kmActuales,
      km_proximo: '',
      obs:        '',
    },
  })

  async function onSubmit(values: ServiceFormValues) {
    const km_service = Number(values.km_service)
    const km_proximo = Number(values.km_proximo)

    if (!Number.isFinite(km_service) || km_service < 0) {
      toast('Km del service inválido', 'err')
      return
    }
    if (!Number.isFinite(km_proximo) || km_proximo <= km_service) {
      toast('El próximo service debe ser mayor que el actual', 'err')
      return
    }

    let comprobante_path: string | null = null
    try {
      if (archivo) {
        setSubiendo(true)
        comprobante_path = await uploadComprobanteService(camionId, archivo)
      }
    } catch (e: any) {
      toast(e?.message || 'Error al subir el comprobante', 'err')
      setSubiendo(false)
      return
    } finally {
      setSubiendo(false)
    }

    createService(
      {
        camion_id:  camionId,
        fecha:      values.fecha || undefined,
        km_service,
        km_proximo,
        obs:        values.obs?.trim() || null,
        ...(comprobante_path ? { comprobante_path } : {}),
      },
      {
        onSuccess: () => {
          toast('✓ Service registrado', 'ok')
          onClose()
        },
        onError: (err: any) => {
          const code = err?.body?.error
          if (code === 'COMPROBANTE_DUPLICADO') {
            toast('Ese comprobante ya está cargado en otro service', 'err')
          } else {
            toast(err?.message || 'Error al registrar el service', 'err')
          }
        },
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="🔧 REGISTRAR SERVICE"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={creating || subiendo}
            onClick={form.handleSubmit(onSubmit)}
          >
            {subiendo ? '⬆ Subiendo…' : '✓ Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="📅 Fecha" type="date" {...form.register('fecha')} />
          <Input
            label="🛣️ Km al hacer el service"
            type="number"
            placeholder="0"
            {...form.register('km_service')}
          />
        </div>
        <Input
          label="🎯 Próximo service a los km"
          type="number"
          placeholder={`${kmActuales + 10000}`}
          hint="Debe ser mayor que los km del service"
          {...form.register('km_proximo')}
        />
        <Input
          label="📝 Observaciones"
          placeholder="Cambio de aceite, filtros…"
          {...form.register('obs')}
        />

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">
            📎 Comprobante (opcional)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-azul-light file:text-azul file:font-bold hover:file:bg-azul hover:file:text-white file:cursor-pointer"
          />
          {archivo && (
            <div className="flex items-center gap-2 text-xs text-gris-dark mt-1">
              <span>📎 {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => setArchivo(null)}
                className="text-rojo hover:underline"
              >
                Quitar
              </button>
            </div>
          )}
          <p className="text-[11px] text-gris-mid italic">
            Foto o PDF de la factura del service. Máx 10 MB.
          </p>
        </div>
      </div>
    </Modal>
  )
}
