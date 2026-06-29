'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useFlotaVehiculos, useCreateFlotaVehiculo } from '../hooks/useFlotaVehiculos'
import { useFlotaServiciosEstado } from '../hooks/useFlotaServicios'
import { useFlotaNotificacionesDocs } from '../hooks/useFlotaNotificaciones'
import { intInputProps } from '@/lib/utils/inputs'
import { useFlotaSyncTodos, mensajeAmigableErrorSync } from '../hooks/useFlotaGpsSync'
import { VehiculoDetalleModal } from './VehiculoDetalleModal'
import type { FlotaVehiculo, FlotaVehiculoTipo, FlotaVehiculoEstado, FlotaServicioEstadoRow } from '@/types/domain.types'

const TIPO_OPTIONS: { value: FlotaVehiculoTipo; label: string }[] = [
  { value: 'auto',       label: 'Auto' },
  { value: 'camioneta',  label: 'Camioneta' },
  { value: 'utilitario', label: 'Utilitario' },
  { value: 'pickup',     label: 'Pickup' },
  { value: 'moto',       label: 'Moto' },
  { value: 'otro',       label: 'Otro' },
]

const ESTADO_OPTIONS: { value: FlotaVehiculoEstado; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'taller', label: 'En taller' },
  { value: 'baja',   label: 'Baja' },
]

interface NuevoForm {
  patente:     string
  tipo:        FlotaVehiculoTipo
  marca:       string
  modelo:      string
  anio:        string
  km_actuales: string
  estado:      FlotaVehiculoEstado
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-AR') + ' km'
}

function fmtFechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y?.slice(2)}`
}

// Días entre hoy y la fecha objetivo (positivo = en el futuro, negativo = pasado).
function diasHasta(iso: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const target = new Date(iso + 'T00:00:00')
  return Math.round((target.getTime() - hoy.getTime()) / 86_400_000)
}

// Display de "km restantes para el próximo service" a partir del estado que
// devuelve la vista del backend (v_flota_servicio_estado). El umbral de
// "próximo" / "vencido" lo decide el server; acá sólo formateamos + coloreamos.
function infoProxService(e: FlotaServicioEstadoRow | undefined): {
  text: string; cls: string; chipCls: string; tooltip?: string
} | null {
  if (!e || e.estado === 'sin_service' || e.km_restantes == null) return null
  const km = Math.round(e.km_restantes)
  const tip: string[] = []
  if (e.km_proximo != null)        tip.push(`Próximo a los ${fmtKm(e.km_proximo)}`)
  if (e.km_ultimo_service != null) tip.push(`Último: ${fmtKm(e.km_ultimo_service)}${e.fecha_ultimo_service ? ` (${fmtFechaCorta(e.fecha_ultimo_service)})` : ''}`)
  const tooltip = tip.join(' · ') || undefined
  if (e.estado === 'vencido')
    return { text: `🔴 Pasado ${fmtKm(Math.abs(km))}`, cls: 'text-rojo font-bold', chipCls: 'bg-rojo-light text-rojo font-bold', tooltip }
  if (e.estado === 'proximo')
    return { text: `⚠ Faltan ${fmtKm(km)}`, cls: 'text-[#7A5000] font-bold', chipCls: 'bg-amarillo-light text-[#7A5000] font-bold', tooltip }
  return { text: `Faltan ${fmtKm(km)}`, cls: 'text-verde font-semibold', chipCls: 'text-verde', tooltip }
}

export function VehiculosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar } = usePermisos('flota')
  const { data: vehiculos = [], isLoading } = useFlotaVehiculos()
  const { data: estadoServicios = [] } = useFlotaServiciosEstado()
  const { data: docsVencimientos = [] } = useFlotaNotificacionesDocs()
  const { mutate: create, isPending: creating } = useCreateFlotaVehiculo()
  const { mutate: syncTodos, isPending: syncingAll } = useFlotaSyncTodos()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [detalleSeccion, setDetalleSeccion] = useState<'datos' | 'papeles' | 'servicios' | 'gastos'>('datos')
  const [busqueda, setBusqueda] = useState('')

  // Deep-link: ?vehiculo=N[&seccion=gastos|servicios|papeles] abre el modal
  // del vehículo correspondiente con la sección preseleccionada.
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const vehParam = searchParams.get('vehiculo')
    if (!vehParam) return
    const vid = Number(vehParam)
    if (!Number.isFinite(vid)) return
    const seccion = searchParams.get('seccion') as 'datos' | 'papeles' | 'servicios' | 'gastos' | null
    setDetalleId(vid)
    setDetalleSeccion(seccion && ['datos','papeles','servicios','gastos'].includes(seccion) ? seccion : 'datos')
    // Limpiar query params para no re-abrir.
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete('vehiculo')
    sp.delete('seccion')
    router.replace(`/flota?${sp.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Map vehiculo_id → estado de service (km restantes, próximo, etc.), para
  // mostrar "km restantes p/ próximo service" en la tabla y la card mobile.
  const estadoPorVehiculo = useMemo(() => {
    const m = new Map<number, FlotaServicioEstadoRow>()
    for (const e of estadoServicios) m.set(e.vehiculo_id, e)
    return m
  }, [estadoServicios])

  // Alertas de service: vehículos con service vencido o próximo, ordenados por
  // urgencia (los más pasados/cercanos primero). Se muestran en un banner.
  const alertasService = useMemo(() => {
    const vencidos = estadoServicios.filter(e => e.estado === 'vencido')
      .sort((a, b) => (a.km_restantes ?? 0) - (b.km_restantes ?? 0))
    const proximos = estadoServicios.filter(e => e.estado === 'proximo')
      .sort((a, b) => (a.km_restantes ?? 0) - (b.km_restantes ?? 0))
    return { vencidos, proximos }
  }, [estadoServicios])

  // Map vehiculo_id → fecha de vencimiento de su VTV (último doc tipo='vtv').
  // La vista v_vehiculo_documentos_vencimientos ya devuelve solo el más
  // reciente por (entidad, vehiculo_id, tipo), así que confiamos en ese
  // último resultado.
  const vtvPorVehiculo = useMemo(() => {
    const m = new Map<number, string>()
    for (const d of docsVencimientos) {
      if (d.tipo === 'vtv') m.set(d.entidad_id, d.vence_el)
    }
    return m
  }, [docsVencimientos])

  const formNuevo = useForm<NuevoForm>({
    defaultValues: { tipo: 'camioneta', estado: 'activo', km_actuales: '0' },
  })

  const detalle = useMemo(
    () => vehiculos.find(v => v.id === detalleId) ?? null,
    [vehiculos, detalleId],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return vehiculos
    return vehiculos.filter(v =>
      v.patente.toLowerCase().includes(q) ||
      (v.marca  ?? '').toLowerCase().includes(q) ||
      (v.modelo ?? '').toLowerCase().includes(q),
    )
  }, [vehiculos, busqueda])

  function handleSyncTodos() {
    syncTodos(undefined, {
      onSuccess: (r) => {
        // Resumen compacto. `ok` = actualizados, `sin_cambio` = ya estaban al día.
        // `no_match` = GPS de MobilQuest sin vincular a un vehículo cargado
        // (informativo, NO es un error). `error` = falló el guardado (sí es problema).
        const partes = [`${r.ok} actualizados`, `${r.sin_cambio} sin cambios`]
        if (r.no_match > 0) partes.push(`${r.no_match} GPS sin vincular`)
        if (r.error > 0)    partes.push(`${r.error} con error`)
        toast(`✓ Sync completo — ${partes.join(', ')}`, r.error > 0 ? 'warn' : 'ok')
      },
      onError: (err) => toast(mensajeAmigableErrorSync(err), 'err'),
    })
  }

  function handleCreate(data: NuevoForm) {
    create(
      {
        patente:     data.patente.trim(),
        tipo:        data.tipo,
        marca:       data.marca.trim() || null,
        modelo:      data.modelo.trim() || null,
        anio:        data.anio ? Number(data.anio) : null,
        km_actuales: Number(data.km_actuales) || 0,
        estado:      data.estado,
      },
      {
        onSuccess: (v) => {
          toast('✓ Vehículo agregado', 'ok')
          setModalNuevo(false)
          formNuevo.reset({ tipo: 'camioneta', estado: 'activo', km_actuales: '0' })
          // Abrir directo el detalle del nuevo para que el user suba papeles.
          if (v?.id) setDetalleId(v.id)
        },
        onError: (err: any) => {
          const msg = err?.message ?? 'Error al crear'
          toast(msg.includes('unique') || msg.includes('23505') ? 'Patente duplicada' : msg, 'err')
        },
      },
    )
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="🔍 Buscar por patente, marca o modelo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full sm:w-72"
          />
          {busqueda && (
            <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>✕ Limpiar</Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {puedeEditar && (
            <Button
              variant="secondary"
              size="sm"
              loading={syncingAll}
              onClick={handleSyncTodos}
            >
              🔄 Sincronizar flota
            </Button>
          )}
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
              ＋ Nuevo vehículo
            </Button>
          )}
        </div>
      </div>

      {/* Alertas de service: vencidos / próximos */}
      {(alertasService.vencidos.length > 0 || alertasService.proximos.length > 0) && (
        <div className="bg-white rounded-card shadow-card overflow-hidden border-l-[5px] border-amarillo">
          <div className="px-4 py-3 bg-amarillo-light/60 border-b border-amarillo/30">
            <h2 className="font-bold text-[#7A5500] text-base">🔧 Services a controlar</h2>
            <p className="text-[11px] text-[#7A5500]/80 mt-0.5">
              {alertasService.vencidos.length} vencido{alertasService.vencidos.length !== 1 ? 's' : ''} ·
              {' '}{alertasService.proximos.length} próximo{alertasService.proximos.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {[...alertasService.vencidos, ...alertasService.proximos].map(e => {
              const info = infoProxService(e)
              if (!info) return null
              const vencido = e.estado === 'vencido'
              return (
                <button
                  key={e.vehiculo_id}
                  onClick={() => setDetalleId(e.vehiculo_id)}
                  className={`bg-white rounded-lg shadow-sm border-l-4 ${vencido ? 'border-rojo' : 'border-naranja'} px-3 py-2 text-left flex items-center gap-3 flex-wrap hover:bg-gris/30 transition-colors w-full`}
                >
                  <span className="font-mono font-bold text-sm text-carbon shrink-0">{e.patente}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-azul">Próximo service</div>
                    <div className="text-[11px] text-gris-dark font-mono">
                      {fmtKm(e.km_actuales)} actuales{e.km_proximo != null ? ` · próx. a los ${fmtKm(e.km_proximo)}` : ''}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${vencido ? 'bg-rojo text-white' : 'bg-naranja text-white'}`}>
                    {vencido ? `Pasado ${fmtKm(Math.abs(Math.round(e.km_restantes ?? 0)))}` : `Faltan ${fmtKm(Math.round(e.km_restantes ?? 0))}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabla — desktop/tablet */}
      <div className="hidden md:block bg-white rounded-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr>
                {['Patente', 'Alias MQ', 'Marca / modelo', 'Año', 'Km actuales', 'Próx. service', 'VTV (vence)', 'Estado'].map(h => (
                  <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8">
                    <span className="inline-flex items-center gap-2 text-gris-dark text-sm">
                      <span className="w-4 h-4 border-2 border-naranja border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </span>
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gris-dark text-sm italic">
                    {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay vehículos cargados.'}
                  </td>
                </tr>
              ) : filtrados.map(v => (
                <tr
                  key={v.id}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                  onClick={() => setDetalleId(v.id)}
                >
                  <td className="px-4 py-3 font-mono font-bold text-sm text-carbon">{v.patente}</td>
                  <td className="px-4 py-3 text-xs">
                    {v.mobilquest_alias
                      ? <span className="font-bold text-azul">{v.mobilquest_alias}</span>
                      : <span className="text-gris-mid">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-carbon">
                    {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gris-dark">{v.anio ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gris-dark">{fmtKm(v.km_actuales)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(() => {
                      const info = infoProxService(estadoPorVehiculo.get(v.id))
                      if (!info) return <span className="text-gris-mid">—</span>
                      return (
                        <span className={`px-2 py-0.5 rounded ${info.chipCls}`} title={info.tooltip}>
                          {info.text}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(() => {
                      const vence = vtvPorVehiculo.get(v.id)
                      if (!vence) return <span className="text-gris-mid">—</span>
                      const d = diasHasta(vence)
                      const cls =
                        d < 0  ? 'bg-rojo-light text-rojo font-bold' :
                        d <= 30 ? 'bg-amarillo-light text-[#7A5000] font-bold' :
                                  'text-gris-dark'
                      const tooltip =
                        d < 0  ? `Vencida hace ${Math.abs(d)} días` :
                        d === 0 ? 'Vence hoy' :
                                  `Faltan ${d} días`
                      return (
                        <span className={`px-2 py-0.5 rounded ${cls}`} title={tooltip}>
                          {fmtFechaCorta(vence)}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        v.estado === 'activo' ? 'activo' :
                        v.estado === 'baja'   ? 'inactivo' :
                                                'pendiente'
                      }
                      label={v.estado === 'taller' ? 'En taller' : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden flex flex-col gap-2">
        {isLoading ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            Cargando...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
            {busqueda ? `Sin resultados para "${busqueda}".` : 'No hay vehículos cargados.'}
          </div>
        ) : filtrados.map(v => (
          <button
            key={v.id}
            onClick={() => setDetalleId(v.id)}
            className="bg-white rounded-card shadow-card p-3 text-left active:bg-gris/40 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm text-carbon flex items-center gap-2 flex-wrap">
                  {v.patente}
                  {v.mobilquest_alias && (
                    <span className="font-sans text-[11px] font-bold text-azul bg-azul-light px-1.5 py-0.5 rounded">
                      {v.mobilquest_alias}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gris-dark mt-0.5">
                  {[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}
                </div>
              </div>
              <Badge
                variant={
                  v.estado === 'activo' ? 'activo' :
                  v.estado === 'baja'   ? 'inactivo' :
                                          'pendiente'
                }
                label={v.estado === 'taller' ? 'En taller' : undefined}
              />
            </div>
            <div className="text-[11px] text-gris-dark mt-2 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{fmtKm(v.km_actuales)} actuales</span>
              {(() => {
                const info = infoProxService(estadoPorVehiculo.get(v.id))
                if (!info) return null
                return <span className={info.cls} title={info.tooltip}>🔧 {info.text} p/ service</span>
              })()}
              {(() => {
                const vence = vtvPorVehiculo.get(v.id)
                if (!vence) return null
                const d = diasHasta(vence)
                const cls =
                  d < 0  ? 'text-rojo font-bold' :
                  d <= 30 ? 'text-[#7A5000] font-bold' :
                            'text-gris-dark'
                return <span className={cls}>📋 VTV {fmtFechaCorta(vence)}</span>
              })()}
              {v.anio && <span>{v.anio}</span>}
            </div>
          </button>
        ))}
      </div>

      {/* Modal nuevo */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="🚙 NUEVO VEHÍCULO"
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formNuevo.handleSubmit(handleCreate)}>
              ✓ Crear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Patente" placeholder="AB123CD" {...formNuevo.register('patente', { required: true })} />
            <Select label="Tipo" options={TIPO_OPTIONS} {...formNuevo.register('tipo')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Marca"  placeholder="Toyota"   {...formNuevo.register('marca')} />
            <Input label="Modelo" placeholder="Hilux SR" {...formNuevo.register('modelo')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Año"         type="number" placeholder="2022" {...formNuevo.register('anio')} />
            <Input label="Km actuales" {...intInputProps} placeholder="0"    {...formNuevo.register('km_actuales')} />
            <Select label="Estado"     options={ESTADO_OPTIONS}         {...formNuevo.register('estado')} />
          </div>
          <p className="text-[11px] text-gris-dark italic">
            Después de crear, abrí el vehículo para cargar marca/color/VIN, papeles y vincular MobilQuest.
          </p>
        </div>
      </Modal>

      {/* Modal detalle */}
      <VehiculoDetalleModal
        vehiculo={detalle}
        onClose={() => { setDetalleId(null); setDetalleSeccion('datos') }}
        seccionInicial={detalleSeccion}
      />
    </>
  )
}
