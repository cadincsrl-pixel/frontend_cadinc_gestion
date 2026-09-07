'use client'

import { useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useGastos, useCategoriasGasto, useCreateGastoArido, useDeleteGastoArido,
  useUnidades, subirComprobanteGasto, verComprobanteGasto,
} from '../hooks/useAridos'
import { ModalImportarGastosAridos } from './ModalImportarGastosAridos'
import type { GastoArido, CargaCombustible } from '../types'

interface GastoForm {
  fecha:            string
  categoria_id:     string
  unidad_id:        string
  monto:            string
  proveedor:        string
  metodo_pago:      string
  comprobante_nro:  string
  descripcion:      string
  obs:              string
  litros:           string
  odometro_km:      string
  tipo_combustible: string
  tanque_lleno:     string
}

const FORM_VACIO: GastoForm = {
  fecha: '', categoria_id: '', unidad_id: '', monto: '', proveedor: '',
  metodo_pago: '', comprobante_nro: '', descripcion: '', obs: '',
  litros: '', odometro_km: '', tipo_combustible: 'gasoil', tanque_lleno: 'si',
}

const METODOS = [
  { value: '',              label: 'Sin especificar' },
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta',       label: 'Tarjeta' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'cta_cte',       label: 'Cuenta corriente' },
  { value: 'otro',          label: 'Otro' },
]

// Los códigos que el backend guarda en la carga. El texto explica qué mirar,
// no repite el código: el que lee la tabla no sabe qué es ODOMETRO_ESTANCADO.
const TEXTO_WARNING: Record<string, string> = {
  ODOMETRO_RETROCEDE:       'El odómetro es menor que el de la carga anterior',
  ODOMETRO_ESTANCADO:       'El odómetro no se movió desde la carga anterior',
  CONSUMO_IMPROBABLE_ALTO:  'Muchos litros para los km recorridos',
  CONSUMO_IMPROBABLE_BAJO:  'Muy pocos litros para los km recorridos',
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtPlata(n: number) {
  return `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
function mensajeError(err: unknown, fallback: string): string {
  return (err as { message?: string })?.message || fallback
}

/** PostgREST devuelve la relación 1-1 como array; el alta la devuelve pelada. */
function cargaDe(g: GastoArido): CargaCombustible | null {
  const c = g.carga
  if (!c) return null
  return Array.isArray(c) ? (c[0] ?? null) : c
}

function mesActual(): string {
  return toISO(new Date()).slice(0, 7)
}

/** Los últimos 12 meses, que es todo lo que se mira en la práctica. */
function mesesRecientes(): Array<{ value: string; label: string }> {
  const hoy = new Date()
  const out: Array<{ value: string; label: string }> = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    const value = d.toISOString().slice(0, 7)
    out.push({
      value,
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    })
  }
  return out
}

export function GastosAridosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEliminar } = usePermisos('aridos')
  // El input de archivo se limpia a mano después de guardar; por eso el ref.
  const fileRef = useRef<HTMLInputElement>(null)

  const [mes, setMes]             = useState(mesActual)
  const [filtroUnidad, setFiltroUnidad]       = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [modalAlta, setModalAlta]   = useState(false)
  const [modalExcel, setModalExcel] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [subiendo, setSubiendo]     = useState(false)

  const { data: categorias = [] } = useCategoriasGasto()
  const { data: unidades = [] }   = useUnidades()
  const { data: pagina, isLoading } = useGastos({
    mes,
    unidad_id:    filtroUnidad && filtroUnidad !== 'area' ? Number(filtroUnidad) : undefined,
    sin_unidad:   filtroUnidad === 'area',
    categoria_id: filtroCategoria ? Number(filtroCategoria) : undefined,
  })
  const { mutateAsync: crear, isPending: creando } = useCreateGastoArido()
  const { mutate: borrar } = useDeleteGastoArido()

  const gastos = pagina?.data ?? []
  const total  = gastos.reduce((s, g) => s + Number(g.monto), 0)
  // El backend corta en 500 filas. Con dos camiones no debería pasar nunca,
  // pero si pasa el total de abajo deja de ser el del mes: hay que decirlo.
  const hayMas = pagina != null && pagina.total > gastos.length

  const form = useForm<GastoForm>({ defaultValues: { ...FORM_VACIO, fecha: toISO(new Date()) } })
  // useWatch y no form.watch: watch() devuelve una función que el React
  // Compiler no puede memoizar, y desactiva la memoización de todo el tab.
  const categoriaElegida = useWatch({ control: form.control, name: 'categoria_id' })
  const codigoElegido = categorias.find(c => String(c.id) === categoriaElegida)?.codigo
  const esCombustible = codigoElegido === 'combustible'

  const opcionesCategoria = useMemo(
    () => [{ value: '', label: 'Elegí la categoría…' },
           ...categorias.map(c => ({ value: c.id, label: c.nombre }))],
    [categorias])

  // "Del área" es una opción explícita, no el vacío: un gasto sin camión es un
  // caso real (un seguro anual del área) y tiene que poder elegirse a propósito.
  const opcionesUnidad = useMemo(
    () => [{ value: '', label: 'Sin asignar (del área)' },
           ...unidades.filter(u => u.activo).map(u => ({ value: u.id, label: `${u.nombre} · ${u.patente}` }))],
    [unidades])

  async function onSubmit(data: GastoForm) {
    let comprobante_path: string | null = null
    if (comprobante) {
      setSubiendo(true)
      try {
        comprobante_path = await subirComprobanteGasto(comprobante)
      } catch (err) {
        setSubiendo(false)
        toast(mensajeError(err, 'No se pudo subir el comprobante'), 'err')
        return
      }
      setSubiendo(false)
    }

    try {
      await crear({
        fecha:            data.fecha,
        categoria_id:     Number(data.categoria_id),
        unidad_id:        data.unidad_id ? Number(data.unidad_id) : null,
        monto:            Number(data.monto),
        proveedor:        data.proveedor.trim() || null,
        metodo_pago:      data.metodo_pago || null,
        comprobante_nro:  data.comprobante_nro.trim() || null,
        descripcion:      data.descripcion.trim() || null,
        obs:              data.obs.trim() || null,
        comprobante_path,
        carga: esCombustible ? {
          litros:            Number(data.litros),
          odometro_km:       data.odometro_km ? Number(data.odometro_km) : null,
          tipo_combustible:  data.tipo_combustible === 'nafta' ? 'nafta' : 'gasoil',
          tanque_lleno:      data.tanque_lleno === 'si',
        } : null,
      })
      toast('✓ Gasto registrado', 'ok')
      setModalAlta(false)
      setComprobante(null)
      if (fileRef.current) fileRef.current.value = ''
      form.reset({ ...FORM_VACIO, fecha: toISO(new Date()) })
    } catch (err) {
      toast(traducirAlta(err), 'err')
    }
  }

  function traducirAlta(err: unknown): string {
    const code = (err as { message?: string })?.message ?? ''
    if (code.includes('COMPROBANTE_DUPLICADO')) return 'Ese comprobante ya está cargado en otro gasto'
    if (code.includes('FECHA_FUTURA'))          return 'Esta categoría no admite fechas futuras'
    if (code.includes('CARGA_REQUERIDA'))       return 'Un gasto de combustible necesita los litros'
    return mensajeError(err, 'No se pudo registrar el gasto')
  }

  function eliminar(g: GastoArido) {
    if (!confirm(`¿Eliminar el gasto de ${fmtPlata(Number(g.monto))} del ${fmtDate(g.fecha)}? El resultado del mes se recalcula.`)) return
    borrar(g.id, {
      onSuccess: () => toast('✓ Eliminado', 'ok'),
      onError:   (err: unknown) => toast(mensajeError(err, 'No se pudo eliminar'), 'err'),
    })
  }

  async function abrirComprobante(id: number) {
    try {
      window.open(await verComprobanteGasto(id), '_blank', 'noopener')
    } catch {
      toast('No se pudo abrir el comprobante', 'err')
    }
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-3">
        <Select label="Mes" options={mesesRecientes()} value={mes}
          onChange={e => setMes(e.target.value)} className="min-w-[170px]" />
        <Select label="Camión"
          options={[{ value: '', label: 'Todos' }, { value: 'area', label: 'Solo del área' },
                    ...unidades.map(u => ({ value: u.id, label: u.nombre }))]}
          value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)} className="min-w-[170px]" />
        <Select label="Categoría"
          options={[{ value: '', label: 'Todas' }, ...categorias.map(c => ({ value: c.id, label: c.nombre }))]}
          value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="min-w-[170px]" />

        <div className="ml-auto flex items-end gap-2">
          <Button variant="secondary" size="sm" disabled={!puedeCrear} onClick={() => setModalExcel(true)}>
            📥 Importar Excel
          </Button>
          <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={() => setModalAlta(true)}>
            ＋ Nuevo gasto
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando gastos…</div>
      ) : gastos.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          No hay gastos cargados en este mes. Cargá acá el gasoil, la gomería, el taller y los papeles de los camiones:
          es lo que el tab Resultado descuenta de lo facturado.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  {['Fecha', 'Categoría', 'Camión', 'Detalle', 'Proveedor', 'Monto', ''].map((h, i) => (
                    <th key={i} className={`bg-azul text-white text-xs font-bold px-3 py-3 uppercase tracking-wide ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.map(g => {
                  const carga = cargaDe(g)
                  const warnings = carga?.warnings ?? []
                  return (
                    <tr key={g.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-carbon whitespace-nowrap">{fmtDate(g.fecha)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-gris text-carbon">
                          {g.categoria?.nombre ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-carbon">
                        {g.unidad?.nombre ?? <span className="text-gris-dark italic">Del área</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gris-dark max-w-[280px]">
                        {carga ? (
                          <span className="font-mono">
                            {Number(carga.litros).toLocaleString('es-AR')} L
                            {carga.odometro_km != null && ` · ${Number(carga.odometro_km).toLocaleString('es-AR')} km`}
                            {' · '}${(Number(g.monto) / Number(carga.litros)).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/L
                          </span>
                        ) : (g.descripcion || '—')}
                        {warnings.length > 0 && (
                          <span className="ml-2 text-amber-600" title={warnings.map(w => TEXTO_WARNING[w.code] ?? w.code).join(' · ')}>
                            ⚠ {warnings.length}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gris-dark">{g.proveedor || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-carbon whitespace-nowrap">
                        {fmtPlata(Number(g.monto))}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {g.comprobante_path && (
                          <Button variant="ghost" size="sm" onClick={() => abrirComprobante(g.id)} title="Ver comprobante">📎</Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={!puedeEliminar} onClick={() => eliminar(g)}>🗑</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gris/60 border-t-2 border-azul">
                  <td colSpan={5} className="px-3 py-2.5 text-sm font-bold text-carbon text-right">
                    {hayMas
                      ? `Suma de los ${gastos.length} que se ven, de ${pagina!.total} en total`
                      : `Total del mes (${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'})`}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-rojo whitespace-nowrap">{fmtPlata(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {hayMas && (
            <p className="text-[11px] text-amber-700 bg-amber-50 px-4 py-2 border-t border-gris">
              Se muestran {gastos.length} de {pagina!.total} gastos del mes. Filtrá por camión o categoría
              para ver el resto.
            </p>
          )}
        </div>
      )}

      <Modal
        open={modalAlta}
        onClose={() => setModalAlta(false)}
        title="💸 NUEVO GASTO"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAlta(false)}>Cancelar</Button>
            <Button variant="primary" loading={creando || subiendo} onClick={() => void form.handleSubmit(onSubmit)()}>
              ✓ Registrar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Fecha" type="date" {...form.register('fecha', { required: true })} />
            <Select label="Categoría" options={opcionesCategoria}
              error={form.formState.errors.categoria_id?.message}
              {...form.register('categoria_id', { required: 'Elegí una categoría' })} />
            <Controller name="monto" control={form.control}
              rules={{ required: 'Poné el monto' }}
              render={({ field }) => (
                <InputMonto label="Monto (IVA incluido)" placeholder="Total del comprobante"
                  value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Camión" options={opcionesUnidad} {...form.register('unidad_id')} />
            <Input label="Proveedor" placeholder="YPF, Gomería López…" {...form.register('proveedor')} />
            <Select label="Método de pago" options={METODOS} {...form.register('metodo_pago')} />
          </div>

          {esCombustible && (
            <div className="border border-verde/40 bg-verde-light/30 rounded-card p-3 flex flex-col gap-3">
              <p className="text-xs font-bold text-verde uppercase tracking-wide">⛽ Datos de la carga</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="Litros" type="number" step="0.01" placeholder="150"
                  error={form.formState.errors.litros?.message}
                  {...form.register('litros', { required: esCombustible ? 'Los litros son obligatorios' : false })} />
                <Input label="Odómetro (km)" type="number" placeholder="310500" {...form.register('odometro_km')} />
                <Select label="Combustible"
                  options={[{ value: 'gasoil', label: 'Gasoil' }, { value: 'nafta', label: 'Nafta' }]}
                  {...form.register('tipo_combustible')} />
                <Select label="¿Tanque lleno?"
                  options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No, carga parcial' }]}
                  {...form.register('tanque_lleno')} />
              </div>
              <p className="text-[11px] text-gris-dark">
                El odómetro es opcional, pero sin él no se puede calcular el consumo ni avisar si un número viene mal.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nº de comprobante" placeholder="0001-00012345" {...form.register('comprobante_nro')} />
            <Input label="Descripción" placeholder="Cambio de embrague…" {...form.register('descripcion')} />
          </div>

          <div>
            <label className="block text-xs font-bold text-carbon uppercase tracking-wide mb-1">Comprobante (foto o PDF)</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setComprobante(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gris-dark file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-azul file:text-white hover:file:bg-azul/90" />
            <p className="text-[11px] text-gris-dark mt-1">
              Si la misma foto ya está cargada en otro gasto, el sistema la rechaza en vez de duplicar el gasto.
            </p>
          </div>

          <Input label="Observaciones" placeholder="Notas…" {...form.register('obs')} />
        </div>
      </Modal>

      <ModalImportarGastosAridos
        open={modalExcel}
        onClose={() => setModalExcel(false)}
        unidades={unidades.map(u => ({ id: u.id, nombre: u.nombre, patente: u.patente }))}
      />
    </>
  )
}
