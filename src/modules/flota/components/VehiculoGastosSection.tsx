'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFlotaGastos,
  useFlotaGastosCategorias,
  useCreateFlotaGasto,
  useUpdateFlotaGasto,
  useDeleteFlotaGasto,
  fetchFlotaGastoComprobanteUrl,
} from '../hooks/useFlotaGastos'
import type { FlotaGasto, FlotaVehiculo } from '@/types/domain.types'
import { toISO } from '@/lib/utils/dates'

interface Props {
  vehiculo: FlotaVehiculo
}

interface FormData {
  categoria_id: string
  fecha:        string
  monto:        string
  proveedor:    string
  descripcion:  string
}

function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function fmtMonto(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function VehiculoGastosSection({ vehiculo }: Props) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('flota')

  const { data: gastos = [], isLoading } = useFlotaGastos({ vehiculo_id: vehiculo.id })
  const { data: categorias = [] } = useFlotaGastosCategorias()
  const { mutate: create, isPending: creating } = useCreateFlotaGasto()
  const { mutate: update, isPending: updating } = useUpdateFlotaGasto()
  const { mutate: remove } = useDeleteFlotaGasto()

  const [agregando, setAgregando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormData>({
    defaultValues: {
      categoria_id: '',
      fecha:        toISO(new Date()),
      monto:        '',
      proveedor:    '',
      descripcion:  '',
    },
  })

  function abrirNuevo() {
    form.reset({
      categoria_id: '',
      fecha:        toISO(new Date()),
      monto:        '',
      proveedor:    '',
      descripcion:  '',
    })
    setComprobante(null)
    setEditandoId(null)
    setAgregando(true)
  }

  function abrirEdicion(g: FlotaGasto) {
    form.reset({
      categoria_id: g.categoria_id != null ? String(g.categoria_id) : '',
      fecha:        g.fecha,
      monto:        String(g.monto),
      proveedor:    g.proveedor ?? '',
      descripcion:  g.descripcion ?? '',
    })
    setComprobante(null)
    setEditandoId(g.id)
    setAgregando(true)
  }

  function cerrar() {
    setAgregando(false)
    setEditandoId(null)
    setComprobante(null)
  }

  function handleSubmit(data: FormData) {
    const monto = Number(data.monto)
    if (!Number.isFinite(monto) || monto < 0) {
      toast('Cargá un monto válido', 'err'); return
    }
    const dto = {
      categoria_id: data.categoria_id ? Number(data.categoria_id) : null,
      fecha:        data.fecha,
      monto,
      proveedor:    data.proveedor.trim() || null,
      descripcion:  data.descripcion.trim() || null,
    }
    if (editandoId != null) {
      if (comprobante) {
        toast('El comprobante no se cambia al editar — borrá el gasto y volvé a cargar.', 'warn'); return
      }
      update(
        { id: editandoId, dto: dto as Partial<FlotaGasto> },
        {
          onSuccess: () => { toast('✓ Gasto actualizado', 'ok'); cerrar() },
          onError:   (e: any) => toast(e?.message ?? 'Error al actualizar', 'err'),
        },
      )
      return
    }
    create(
      { vehiculo_id: vehiculo.id, ...dto, comprobante },
      {
        onSuccess: () => { toast('✓ Gasto registrado', 'ok'); cerrar() },
        onError:   (e: any) => {
          const msg = e?.message ?? 'Error al registrar gasto'
          toast(msg.includes('COMPROBANTE_DUPLICADO') ? 'Ese comprobante ya está cargado' : msg, 'err')
        },
      },
    )
  }

  async function handleVerComprobante(id: number) {
    try {
      const url = await fetchFlotaGastoComprobanteUrl(id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast('No se pudo abrir el comprobante', 'err')
    }
  }

  function handleBorrar(id: number) {
    if (!confirm('¿Borrar este gasto del historial?')) return
    remove(id, {
      onSuccess: () => toast('✓ Gasto eliminado', 'ok'),
      onError:   () => toast('Error al eliminar', 'err'),
    })
  }

  const total = gastos.reduce((s, g) => s + Number(g.monto || 0), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-azul uppercase tracking-wider">💸 Gastos</h3>
        <div className="flex items-center gap-3">
          {gastos.length > 0 && (
            <span className="text-[11px] text-gris-dark">
              Total: <span className="font-mono font-bold text-verde">{fmtMonto(total)}</span>
            </span>
          )}
          {puedeCrear && !agregando && (
            <Button variant="primary" size="sm" onClick={abrirNuevo}>＋ Registrar gasto</Button>
          )}
        </div>
      </div>

      {agregando && (
        <div className="bg-gris/30 border border-gris-mid rounded-lg p-3 flex flex-col gap-3">
          {editandoId != null && (
            <div className="text-xs font-bold text-azul uppercase tracking-wider">✏️ Editando gasto</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Categoría"
              options={[
                { value: '', label: '— sin categoría —' },
                ...categorias.filter(c => c.activo).map(c => ({
                  value: String(c.id),
                  label: `${c.icono ?? ''} ${c.nombre}`.trim(),
                })),
              ]}
              {...form.register('categoria_id')}
            />
            <Input label="Fecha" type="date" {...form.register('fecha', { required: true })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Monto ($)" type="number" step="0.01" min="0" {...form.register('monto', { required: true })} />
            <Input label="Proveedor (opcional)" placeholder="YPF, Renault, etc." {...form.register('proveedor')} />
          </div>
          <Input label="Descripción (opcional)" placeholder="Detalle del gasto" {...form.register('descripcion')} />

          {editandoId == null && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold px-2.5 py-1 rounded bg-azul-light text-azul border border-azul/30 hover:bg-azul hover:text-white transition-colors"
              >
                📎 {comprobante ? 'Cambiar comprobante' : 'Adjuntar comprobante (opcional)'}
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
          )}
          {editandoId != null && (
            <div className="text-[11px] text-gris-dark italic">
              El comprobante adjunto no se modifica desde acá.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={cerrar}>Cancelar</Button>
            <Button variant="primary" size="sm" loading={creating || updating} onClick={form.handleSubmit(handleSubmit)}>
              {editandoId != null ? '✓ Guardar cambios' : '✓ Guardar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-gris-dark italic">Cargando…</div>
      ) : gastos.length === 0 ? (
        <div className="text-xs text-gris-dark italic">Sin gastos registrados.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {gastos.map(g => (
            <li key={g.id} className="bg-white border border-gris-mid rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-carbon flex items-center gap-1.5">
                  {g.categoria?.icono && <span>{g.categoria.icono}</span>}
                  <span>{g.categoria?.nombre ?? 'Sin categoría'}</span>
                </div>
                <div className="text-[11px] text-gris-dark mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{fmtFecha(g.fecha)}</span>
                  <span>·</span>
                  <span className="font-mono font-bold text-verde">{fmtMonto(g.monto)}</span>
                  {g.proveedor && (<><span>·</span><span>{g.proveedor}</span></>)}
                </div>
                {g.descripcion && (
                  <div className="text-[11px] text-gris-dark italic mt-0.5 truncate">
                    {g.descripcion}
                  </div>
                )}
              </div>
              {g.comprobante_path && (
                <button
                  onClick={() => handleVerComprobante(g.id)}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-azul-light text-azul hover:bg-azul hover:text-white transition-colors"
                  title="Ver comprobante"
                >
                  📎
                </button>
              )}
              {puedeEditar && (
                <button
                  onClick={() => abrirEdicion(g)}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-gris text-gris-dark hover:bg-azul-light hover:text-azul transition-colors"
                  title="Editar"
                >
                  ✏️
                </button>
              )}
              {puedeEliminar && (
                <button
                  onClick={() => handleBorrar(g.id)}
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
