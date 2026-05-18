'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { intInputProps } from '@/lib/utils/inputs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFlotaServicios,
  useFlotaTiposServicio,
  useCreateFlotaServicio,
  useDeleteFlotaServicio,
  fetchFlotaServicioComprobanteUrl,
} from '../hooks/useFlotaServicios'
import type { FlotaVehiculo, FlotaTipoServicio } from '@/types/domain.types'

interface Props {
  vehiculo: FlotaVehiculo
}

interface FormData {
  tipo_id:       string
  tipo_libre:    string
  fecha:         string
  km_service:    string
  km_proximo:    string
  fecha_proximo: string
  descripcion:   string
  costo:         string
  proveedor:     string
}

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('es-AR') + ' km'
}

function fmtMonto(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function tipoLabel(tipos: FlotaTipoServicio[], tipo_id: number | null, tipo_libre: string | null): string {
  if (tipo_id != null) {
    const t = tipos.find(x => x.id === tipo_id)
    return t?.nombre ?? `Tipo #${tipo_id}`
  }
  return tipo_libre || '—'
}

export function VehiculoServiciosSection({ vehiculo }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('flota')

  const { data: servicios = [], isLoading } = useFlotaServicios(vehiculo.id)
  const { data: tipos = [] } = useFlotaTiposServicio()
  const { mutate: create, isPending: creating } = useCreateFlotaServicio()
  const { mutate: remove } = useDeleteFlotaServicio()

  const [agregando, setAgregando] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormData>({
    defaultValues: {
      tipo_id:       '',
      tipo_libre:    '',
      fecha:         new Date().toISOString().slice(0, 10),
      km_service:    String(vehiculo.km_actuales || 0),
      km_proximo:    '',
      fecha_proximo: '',
      descripcion:   '',
      costo:         '',
      proveedor:     '',
    },
  })

  function abrirFormulario() {
    form.reset({
      tipo_id:       '',
      tipo_libre:    '',
      fecha:         new Date().toISOString().slice(0, 10),
      km_service:    String(vehiculo.km_actuales || 0),
      km_proximo:    '',
      fecha_proximo: '',
      descripcion:   '',
      costo:         '',
      proveedor:     '',
    })
    setComprobante(null)
    setAgregando(true)
  }

  function handleSubmit(data: FormData) {
    const tipo_id = data.tipo_id ? Number(data.tipo_id) : null
    const tipo_libre = data.tipo_libre.trim() || null
    if (!tipo_id && !tipo_libre) {
      toast('Elegí un tipo del catálogo o escribí uno libre', 'err')
      return
    }
    create(
      {
        vehiculo_id:   vehiculo.id,
        tipo_id,
        tipo_libre,
        fecha:         data.fecha,
        km_service:    Number(data.km_service) || 0,
        km_proximo:    data.km_proximo    ? Number(data.km_proximo)    : null,
        fecha_proximo: data.fecha_proximo || null,
        descripcion:   data.descripcion.trim() || null,
        costo:         data.costo ? Number(data.costo) : null,
        proveedor:     data.proveedor.trim() || null,
        comprobante,
      },
      {
        onSuccess: () => {
          toast('✓ Service registrado', 'ok')
          setAgregando(false)
          setComprobante(null)
        },
        onError: (err: any) => {
          const msg = err?.message ?? 'Error al registrar service'
          toast(msg.includes('COMPROBANTE_DUPLICADO') ? 'Ese comprobante ya está cargado' : msg, 'err')
        },
      },
    )
  }

  async function handleVerComprobante(id: number) {
    try {
      const url = await fetchFlotaServicioComprobanteUrl(id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast('No se pudo abrir el comprobante', 'err')
    }
  }

  function handleBorrar(id: number) {
    if (!confirm('¿Borrar este service del historial?')) return
    remove(id, {
      onSuccess: () => toast('✓ Service eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">🔧 Servicios</h3>
        {puedeCrear && !agregando && (
          <Button variant="primary" size="sm" onClick={abrirFormulario}>
            ＋ Registrar service
          </Button>
        )}
      </div>

      {agregando && (
        <div className="bg-gris/30 border border-gris-mid rounded-lg p-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Tipo (del catálogo)"
              options={[
                { value: '', label: '— libre / no listado —' },
                ...tipos.filter(t => t.activo).map(t => ({ value: String(t.id), label: t.nombre })),
              ]}
              {...form.register('tipo_id')}
            />
            <Input
              label="Tipo libre (si no está en el catálogo)"
              placeholder="Ej: reparación tapizado"
              {...form.register('tipo_libre')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Fecha"      type="date"   {...form.register('fecha', { required: true })} />
            <Input label="Km service" {...intInputProps} {...form.register('km_service', { required: true })} />
            <Input label="Costo ($)"  type="number" step="100" {...form.register('costo')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Km próximo (opcional)"    {...intInputProps} placeholder={form.watch('km_service') ? String(Number(form.watch('km_service')) + 10000) : ''} {...form.register('km_proximo')} />
            <Input label="Fecha próximo (opcional)" type="date"   {...form.register('fecha_proximo')} />
          </div>
          <Input label="Proveedor / taller" placeholder="Toyota Buenos Aires" {...form.register('proveedor')} />
          <Input label="Descripción" placeholder="Detalle del trabajo" {...form.register('descripcion')} />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] font-bold px-2.5 py-1 rounded bg-azul-light text-azul border border-azul/30 hover:bg-azul hover:text-white transition-colors"
            >
              📎 {comprobante ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
            </button>
            {comprobante && (
              <span className="text-[11px] text-gris-dark truncate max-w-[200px]">
                {comprobante.name}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              className="hidden"
              onChange={e => setComprobante(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setAgregando(false); setComprobante(null) }}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" loading={creating} onClick={form.handleSubmit(handleSubmit)}>
              ✓ Guardar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : servicios.length === 0 ? (
        <div className="text-xs text-gris-dark italic">Sin servicios registrados.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {servicios.map(s => (
            <li
              key={s.id}
              className="bg-white border border-gris-mid rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-carbon">
                  {tipoLabel(tipos, s.tipo_id, s.tipo_libre)}
                </div>
                <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{fmtFecha(s.fecha)}</span>
                  <span>·</span>
                  <span className="font-mono">{fmtKm(s.km_service)}</span>
                  {s.km_proximo && (<><span>·</span><span className="font-mono">próx. {fmtKm(s.km_proximo)}</span></>)}
                  {s.fecha_proximo && (<><span>·</span><span>próx. {fmtFecha(s.fecha_proximo)}</span></>)}
                  {s.costo != null && (<><span>·</span><span className="font-mono font-bold text-verde">{fmtMonto(s.costo)}</span></>)}
                  {s.proveedor && (<><span>·</span><span>{s.proveedor}</span></>)}
                </div>
                {s.descripcion && (
                  <div className="text-[11px] text-gris-dark italic mt-0.5 truncate">
                    {s.descripcion}
                  </div>
                )}
              </div>
              {s.comprobante_path && (
                <button
                  onClick={() => handleVerComprobante(s.id)}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                  title="Ver comprobante"
                >
                  📎
                </button>
              )}
              {puedeEliminar && (
                <button
                  onClick={() => handleBorrar(s.id)}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors"
                  title="Eliminar"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
