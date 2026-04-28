'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useRentabilidadParametros,
  useRentabilidadViajes,
  useUpdateParametros,
  useCreateViajeRentabilidad,
  useUpdateViajeRentabilidad,
  useDeleteViajeRentabilidad,
  type ViajeRow,
  type ParametrosRow,
  type ViajeUpsertDto,
} from '../hooks/useRentabilidad'
import {
  calcularRentabilidad,
  diagnosticoLabel,
  type RentabilidadParametros,
  type RentabilidadViajeInput,
  type Diagnostico,
} from '@/lib/utils/rentabilidad'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge }  from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'

// Formato es-AR: miles con punto, decimales con coma. ARS y USD con 2 decimales,
// porcentaje con 1 decimal.
const fmtARS = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUSD = (n: number) =>
  'USD ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (n: number) =>
  (n * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const fmtNum = (n: number) =>
  n.toLocaleString('es-AR')

const MODALIDAD_OPTIONS = [
  { value: 'km_jornal',  label: 'Por km + jornal' },
  { value: 'pct_jornal', label: '% sobre tarifa + jornal' },
]

const diagnosticoVariant: Record<Diagnostico, 'activo' | 'inactivo' | 'pendiente'> = {
  sin_datos: 'inactivo',
  perdida:   'inactivo',
  muy_bajo:  'pendiente',
  bajo:      'pendiente',
  saludable: 'activo',
  alto:      'activo',
}

export function RentabilidadTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('logistica')

  const { data: paramsRow, isLoading: loadingP } = useRentabilidadParametros()
  const { data: viajes = [], isLoading: loadingV } = useRentabilidadViajes()

  const [modalNuevo,  setModalNuevo]   = useState(false)
  const [editando,    setEditando]     = useState<ViajeRow | null>(null)
  const [paramsOpen,  setParamsOpen]   = useState(false)

  if (loadingP || loadingV) {
    return <div className="p-6 text-sm text-gris-dark">Cargando…</div>
  }
  if (!paramsRow) {
    return (
      <div className="bg-white rounded-card shadow-card p-6 text-center text-gris-dark text-sm">
        No hay parámetros de empresa cargados. Pedile a un admin que configure los valores iniciales.
      </div>
    )
  }

  // Stripped: solo los campos del cálculo, sin metadata de la fila.
  const params: RentabilidadParametros = {
    alicuota_iva:                Number(paramsRow.alicuota_iva),
    tipo_cambio_usd_ars:         Number(paramsRow.tipo_cambio_usd_ars),
    valor_tractor_usd:           Number(paramsRow.valor_tractor_usd),
    valor_residual_tractor_usd:  Number(paramsRow.valor_residual_tractor_usd),
    vida_util_tractor_km:        Number(paramsRow.vida_util_tractor_km),
    valor_semirremolque_usd:     Number(paramsRow.valor_semirremolque_usd),
    vida_util_batea_anios:       Number(paramsRow.vida_util_batea_anios),
    costo_service:               Number(paramsRow.costo_service),
    frecuencia_service_km:       Number(paramsRow.frecuencia_service_km),
    costo_cubierta:              Number(paramsRow.costo_cubierta),
    cubiertas_por_equipo:        Number(paramsRow.cubiertas_por_equipo),
    vida_util_neumaticos_km:     Number(paramsRow.vida_util_neumaticos_km),
    cargas_sociales_mensual:     Number(paramsRow.cargas_sociales_mensual),
    seguros_mensual:             Number(paramsRow.seguros_mensual),
    patente_anual:               Number(paramsRow.patente_anual),
    gomeria_mensual:             Number(paramsRow.gomeria_mensual),
    lavadero_mensual:            Number(paramsRow.lavadero_mensual),
    overhead_pct:                Number(paramsRow.overhead_pct),
  }

  // Ranking ordenado por margen anual USD (igual que el Excel).
  const ranking = [...viajes]
    .map(v => ({ viaje: v, r: calcularRentabilidad(viajeToInput(v), params) }))
    .sort((a, b) => b.r.margen_anual_usd - a.r.margen_anual_usd)

  const mejor = ranking[0]

  return (
    <div className="no-spinner flex flex-col gap-4">

      {/* ── Banner mejor viaje ── */}
      {mejor && mejor.r.margen_anual_usd > 0 && (
        <div className="bg-azul-light rounded-card shadow-card p-4 border-l-[5px] border-verde">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider">Mejor viaje</div>
              <div className="font-display text-xl text-azul mt-1">{mejor.viaje.nombre}</div>
              <div className="text-xs text-gris-dark mt-0.5">
                {fmtNum(Number(mejor.viaje.viajes_por_mes))} viajes/mes · margen {fmtPct(mejor.r.margen_pct)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-verde">{fmtUSD(mejor.r.margen_anual_usd)}</div>
              <div className="text-[11px] text-gris-dark uppercase tracking-wider">por año</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Ranking ── */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        <div className="bg-azul text-white px-4 py-2.5 flex items-center justify-between">
          <h2 className="font-display text-base tracking-wider">RANKING</h2>
          {puedeCrear && (
            <Button variant="primary" size="sm" onClick={() => setModalNuevo(true)}>＋ Nuevo viaje</Button>
          )}
        </div>
        {ranking.length === 0 ? (
          <div className="p-6 text-center text-gris-dark text-sm">No hay viajes cargados.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['#', 'Viaje', 'Tarifa $/t', 'Viajes/mes', 'Chofer $/mes', 'Margen $/viaje', 'Margen %', 'Margen $/mes', 'Diagnóstico', ''].map(h => (
                  <th key={h} className="bg-gris/40 text-xs font-bold px-3 py-2 text-left uppercase tracking-wide text-gris-dark">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map(({ viaje, r }, idx) => (
                <tr
                  key={viaje.id}
                  className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors cursor-pointer"
                  onClick={() => setEditando(viaje)}
                >
                  <td className="px-3 py-2 font-mono font-bold text-sm">{idx + 1}</td>
                  <td className="px-3 py-2 font-bold text-sm text-carbon">{viaje.nombre}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtARS(Number(viaje.tarifa_neta_por_ton))}</td>
<td className="px-3 py-2 font-mono text-xs">{fmtNum(Number(viaje.viajes_por_mes))}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtARS((r.pago_chofer + r.jornal_chofer) * Number(viaje.viajes_por_mes))}</td>
                  <td className="px-3 py-2 font-mono text-xs font-bold">{fmtARS(r.margen)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtPct(r.margen_pct)}</td>
                  <td className="px-3 py-2 font-mono text-xs font-bold text-verde">{fmtARS(r.margen_mensual)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={diagnosticoVariant[r.diagnostico]} label={diagnosticoLabel(r.diagnostico)} />
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {puedeEliminar && (
                      <DeleteViajeBtn id={viaje.id} nombre={viaje.nombre} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Parámetros de empresa (colapsable) ── */}
      <ParametrosCard
        paramsRow={paramsRow}
        open={paramsOpen}
        onToggle={() => setParamsOpen(p => !p)}
        readOnly={!puedeEditar}
      />

      {modalNuevo && (
        <ModalViaje
          mode="create"
          params={params}
          onClose={() => setModalNuevo(false)}
        />
      )}
      {editando && (
        <ModalViaje
          mode="edit"
          viaje={editando}
          params={params}
          readOnly={!puedeEditar}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function viajeToInput(v: ViajeRow): RentabilidadViajeInput {
  return {
    km_ida:              Number(v.km_ida),
    km_vuelta:           Number(v.km_vuelta),
    toneladas:           Number(v.toneladas),
    dias_calendario:     Number(v.dias_calendario),
    viajes_por_mes:      Number(v.viajes_por_mes),
    tarifa_neta_por_ton: Number(v.tarifa_neta_por_ton),
    precio_gasoil:       Number(v.precio_gasoil),
    consumo_camion:      Number(v.consumo_camion),
    peajes_total:        Number(v.peajes_total),
    chofer_por_km:       Number(v.chofer_por_km),
    chofer_por_dia:      Number(v.chofer_por_dia),
    modalidad_pago:      v.modalidad_pago,
    pct_sobre_tarifa:    Number(v.pct_sobre_tarifa),
  }
}

function DeleteViajeBtn({ id, nombre }: { id: number; nombre: string }) {
  const toast = useToast()
  const { mutate: remove } = useDeleteViajeRentabilidad()
  return (
    <button
      onClick={() => {
        if (!confirm(`¿Eliminar el viaje "${nombre}"?`)) return
        remove(id, {
          onSuccess: () => toast('✓ Viaje eliminado', 'ok'),
          onError:   () => toast('Error al eliminar', 'err'),
        })
      }}
      className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
    >✕</button>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Modal de viaje (create/edit) con form a la izquierda + panel resultado en vivo a la derecha.
// ────────────────────────────────────────────────────────────────────────
interface ModalViajeProps {
  mode: 'create' | 'edit'
  viaje?: ViajeRow
  params: RentabilidadParametros
  readOnly?: boolean
  onClose: () => void
}

function ModalViaje({ mode, viaje, params, readOnly, onClose }: ModalViajeProps) {
  const toast = useToast()
  const { mutate: create, isPending: creating } = useCreateViajeRentabilidad()
  const { mutate: update, isPending: updating } = useUpdateViajeRentabilidad()

  // Sensibilidad: ajuste % de la tarifa (de -20% a +20%).
  const [sensibilidad, setSensibilidad] = useState(0)

  const form = useForm<ViajeUpsertDto>({
    defaultValues: viaje
      ? {
          nombre: viaje.nombre,
          km_ida: Number(viaje.km_ida),
          km_vuelta: Number(viaje.km_vuelta),
          toneladas: Number(viaje.toneladas),
          dias_calendario: Number(viaje.dias_calendario),
          viajes_por_mes: Number(viaje.viajes_por_mes),
          tarifa_neta_por_ton: Number(viaje.tarifa_neta_por_ton),
          precio_gasoil: Number(viaje.precio_gasoil),
          consumo_camion: Number(viaje.consumo_camion),
          peajes_total: Number(viaje.peajes_total),
          chofer_por_km: Number(viaje.chofer_por_km),
          chofer_por_dia: Number(viaje.chofer_por_dia),
          modalidad_pago: viaje.modalidad_pago,
          pct_sobre_tarifa: Number(viaje.pct_sobre_tarifa),
          obs: viaje.obs ?? '',
        }
      : {
          nombre: '',
          km_ida: 0, km_vuelta: 0, toneladas: 35, dias_calendario: 0, viajes_por_mes: 0,
          tarifa_neta_por_ton: 0, precio_gasoil: 2200, consumo_camion: 3, peajes_total: 0,
          chofer_por_km: 140, chofer_por_dia: 30000, modalidad_pago: 'km_jornal', pct_sobre_tarifa: 0,
          obs: '',
        },
  })

  const watched = form.watch()

  // Resultado en vivo (con sensibilidad aplicada a la tarifa).
  const resultado = useMemo(() => {
    const input: RentabilidadViajeInput = {
      km_ida:              Number(watched.km_ida) || 0,
      km_vuelta:           Number(watched.km_vuelta) || 0,
      toneladas:           Number(watched.toneladas) || 0,
      dias_calendario:     Number(watched.dias_calendario) || 0,
      viajes_por_mes:      Number(watched.viajes_por_mes) || 0,
      tarifa_neta_por_ton: (Number(watched.tarifa_neta_por_ton) || 0) * (1 + sensibilidad),
      precio_gasoil:       Number(watched.precio_gasoil) || 0,
      consumo_camion:      Number(watched.consumo_camion) || 0,
      peajes_total:        Number(watched.peajes_total) || 0,
      chofer_por_km:       Number(watched.chofer_por_km) || 0,
      chofer_por_dia:      Number(watched.chofer_por_dia) || 0,
      modalidad_pago:      watched.modalidad_pago || 'km_jornal',
      pct_sobre_tarifa:    Number(watched.pct_sobre_tarifa) || 0,
    }
    return calcularRentabilidad(input, params)
  }, [watched, params, sensibilidad])

  function onSubmit(data: ViajeUpsertDto) {
    if (!data.nombre?.trim()) { toast('Falta el nombre del viaje', 'err'); return }
    const dto: ViajeUpsertDto = {
      ...data,
      km_ida:              Number(data.km_ida),
      km_vuelta:           Number(data.km_vuelta),
      toneladas:           Number(data.toneladas),
      dias_calendario:     Number(data.dias_calendario),
      viajes_por_mes:      Number(data.viajes_por_mes),
      tarifa_neta_por_ton: Number(data.tarifa_neta_por_ton),
      precio_gasoil:       Number(data.precio_gasoil),
      consumo_camion:      Number(data.consumo_camion),
      peajes_total:        Number(data.peajes_total),
      chofer_por_km:       Number(data.chofer_por_km),
      chofer_por_dia:      Number(data.chofer_por_dia),
      pct_sobre_tarifa:    Number(data.pct_sobre_tarifa),
    }
    if (mode === 'create') {
      create(dto, {
        onSuccess: () => { toast('✓ Viaje creado', 'ok'); onClose() },
        onError:   () => toast('Error al crear', 'err'),
      })
    } else if (viaje) {
      update({ id: viaje.id, dto }, {
        onSuccess: () => { toast('✓ Viaje actualizado', 'ok'); onClose() },
        onError:   () => toast('Error al actualizar', 'err'),
      })
    }
  }

  const title = mode === 'create' ? '＋ NUEVO VIAJE' : (readOnly ? '📊 DETALLE VIAJE' : '✏️ EDITAR VIAJE')
  const isPctMode = watched.modalidad_pago === 'pct_jornal'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width="max-w-5xl"
      footer={
        readOnly
          ? <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          : (
            <>
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button variant="primary" loading={creating || updating} onClick={form.handleSubmit(onSubmit)}>✓ Guardar</Button>
            </>
          )
      }
    >
      <div className="no-spinner grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* ── Formulario ── */}
        <div className="flex flex-col gap-4">
          <Input label="Nombre del viaje" placeholder="Ej: cristamine 35t" disabled={readOnly} {...form.register('nombre')} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Km ida"    type="number" disabled={readOnly} {...form.register('km_ida',    { valueAsNumber: true })} />
            <Input label="Km vuelta" type="number" disabled={readOnly} {...form.register('km_vuelta', { valueAsNumber: true })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Toneladas"        type="number" step="0.1" disabled={readOnly} {...form.register('toneladas',       { valueAsNumber: true })} />
            <Input label="Días calendario"  type="number" disabled={readOnly} {...form.register('dias_calendario', { valueAsNumber: true })} />
            <Input label="Viajes / mes"     type="number" disabled={readOnly} {...form.register('viajes_por_mes',  { valueAsNumber: true })} />
          </div>
          <Input label="Tarifa por tonelada (NETA, sin IVA) ARS/t" type="number" disabled={readOnly} {...form.register('tarifa_neta_por_ton', { valueAsNumber: true })} />

          <div className="bg-gris/30 rounded-lg p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gris-dark mb-2">⛽ Combustible (zona)</div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Precio gasoil ARS/L (con IVA)" type="number" disabled={readOnly} {...form.register('precio_gasoil',  { valueAsNumber: true })} />
              <Input label="Consumo km/L"                  type="number" step="0.1" disabled={readOnly} {...form.register('consumo_camion', { valueAsNumber: true })} />
            </div>
          </div>

          <Input label="Peajes ida + vuelta (con IVA)" type="number" disabled={readOnly} {...form.register('peajes_total', { valueAsNumber: true })} />

          <div className="bg-gris/30 rounded-lg p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gris-dark mb-2">👷 Chofer</div>
            <Select label="Modalidad de pago" options={MODALIDAD_OPTIONS} disabled={readOnly} {...form.register('modalidad_pago')} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Input label="Pago por km (ARS/km)"   type="number" disabled={readOnly || isPctMode} {...form.register('chofer_por_km',  { valueAsNumber: true })} />
              <Input label="Jornal por día (ARS)"   type="number" disabled={readOnly} {...form.register('chofer_por_dia', { valueAsNumber: true })} />
            </div>
            {isPctMode && (
              <div className="mt-3">
                <Input label="% sobre tarifa (ej 0.15 = 15%)" type="number" step="0.01" disabled={readOnly} {...form.register('pct_sobre_tarifa', { valueAsNumber: true })} />
              </div>
            )}
          </div>

          <Input label="Observaciones" placeholder="Notas..." disabled={readOnly} {...form.register('obs')} />
        </div>

        {/* ── Panel resultado en vivo ── */}
        <div className="bg-azul-light rounded-card p-4 flex flex-col gap-3 self-start lg:sticky lg:top-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gris-dark">Resultado</div>

          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gris-dark">Ingreso</span>
              <span className="font-mono text-sm font-bold">{fmtARS(resultado.ingreso)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gris-dark">Costo total</span>
              <span className="font-mono text-sm font-bold text-rojo">− {fmtARS(resultado.costo_total)}</span>
            </div>
            <hr className="my-2 border-gris" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Margen</span>
              <span className={`font-mono text-base font-bold ${resultado.margen >= 0 ? 'text-verde' : 'text-rojo'}`}>
                {fmtARS(resultado.margen)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[11px] text-gris-dark">% sobre ingreso</span>
              <span className="font-mono text-xs">{fmtPct(resultado.margen_pct)}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gris-dark">Cobra el chofer / mes</span>
              <span className="font-mono text-sm font-bold text-azul">
                {fmtARS((resultado.pago_chofer + resultado.jornal_chofer) * (Number(watched.viajes_por_mes) || 0))}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gris-dark">Margen / mes</span>
              <span className="font-mono text-sm font-bold">{fmtARS(resultado.margen_mensual)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gris-dark">USD / año</span>
              <span className="font-mono text-base font-bold text-verde">{fmtUSD(resultado.margen_anual_usd)}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3">
            <Badge variant={diagnosticoVariant[resultado.diagnostico]} label={diagnosticoLabel(resultado.diagnostico)} />
            <details className="mt-2 text-[11px] text-gris-dark">
              <summary className="cursor-pointer hover:text-azul">Desglose de costos</summary>
              <table className="w-full mt-2 text-[11px]">
                <tbody>
                  <tr><td>Combustible</td><td className="text-right font-mono">{fmtARS(resultado.combustible_neto)}</td></tr>
                  <tr><td>Pago chofer</td><td className="text-right font-mono">{fmtARS(resultado.pago_chofer)}</td></tr>
                  <tr><td>Jornal chofer</td><td className="text-right font-mono">{fmtARS(resultado.jornal_chofer)}</td></tr>
                  <tr><td>Cargas sociales</td><td className="text-right font-mono">{fmtARS(resultado.cargas_sociales_prorr)}</td></tr>
                  <tr><td>Peajes</td><td className="text-right font-mono">{fmtARS(resultado.peajes_neto)}</td></tr>
                  <tr><td>Neumáticos</td><td className="text-right font-mono">{fmtARS(resultado.neumaticos_prorr)}</td></tr>
                  <tr><td>Gomería</td><td className="text-right font-mono">{fmtARS(resultado.gomeria_prorr)}</td></tr>
                  <tr><td>Lavadero</td><td className="text-right font-mono">{fmtARS(resultado.lavadero_prorr)}</td></tr>
                  <tr><td className="font-bold">Directos</td><td className="text-right font-mono font-bold">{fmtARS(resultado.costos_directos)}</td></tr>
                  <tr><td>Amort. tractor</td><td className="text-right font-mono">{fmtARS(resultado.amortizacion_tractor)}</td></tr>
                  <tr><td>Amort. batea</td><td className="text-right font-mono">{fmtARS(resultado.amortizacion_batea)}</td></tr>
                  <tr><td>Service</td><td className="text-right font-mono">{fmtARS(resultado.service)}</td></tr>
                  <tr><td>Seguros</td><td className="text-right font-mono">{fmtARS(resultado.seguros_prorr)}</td></tr>
                  <tr><td>Patente</td><td className="text-right font-mono">{fmtARS(resultado.patente_prorr)}</td></tr>
                  <tr><td className="font-bold">Fijos</td><td className="text-right font-mono font-bold">{fmtARS(resultado.costos_fijos)}</td></tr>
                  <tr><td>Overhead</td><td className="text-right font-mono">{fmtARS(resultado.overhead)}</td></tr>
                </tbody>
              </table>
            </details>
          </div>

          {/* Sensibilidad de tarifa */}
          <div className="bg-white rounded-lg p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gris-dark mb-1">
              Sensibilidad tarifa: {sensibilidad >= 0 ? '+' : ''}{fmtPct(sensibilidad)}
            </div>
            <input
              type="range"
              min={-0.2}
              max={0.2}
              step={0.01}
              value={sensibilidad}
              onChange={(e) => setSensibilidad(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-[10px] text-gris-mid mt-1">
              <span>−20%</span>
              <span>0</span>
              <span>+20%</span>
            </div>
            {sensibilidad !== 0 && (
              <button
                type="button"
                onClick={() => setSensibilidad(0)}
                className="text-[11px] text-azul hover:underline mt-1"
              >Resetear</button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Card de parámetros de empresa (colapsable, editable in-place).
// ────────────────────────────────────────────────────────────────────────
interface ParametrosCardProps {
  paramsRow: ParametrosRow
  open: boolean
  onToggle: () => void
  readOnly?: boolean
}

function ParametrosCard({ paramsRow, open, onToggle, readOnly }: ParametrosCardProps) {
  const toast = useToast()
  const { mutate: update, isPending } = useUpdateParametros()
  const form = useForm<RentabilidadParametros>({
    defaultValues: {
      alicuota_iva:                Number(paramsRow.alicuota_iva),
      tipo_cambio_usd_ars:         Number(paramsRow.tipo_cambio_usd_ars),
      valor_tractor_usd:           Number(paramsRow.valor_tractor_usd),
      valor_residual_tractor_usd:  Number(paramsRow.valor_residual_tractor_usd),
      vida_util_tractor_km:        Number(paramsRow.vida_util_tractor_km),
      valor_semirremolque_usd:     Number(paramsRow.valor_semirremolque_usd),
      vida_util_batea_anios:       Number(paramsRow.vida_util_batea_anios),
      costo_service:               Number(paramsRow.costo_service),
      frecuencia_service_km:       Number(paramsRow.frecuencia_service_km),
      costo_cubierta:              Number(paramsRow.costo_cubierta),
      cubiertas_por_equipo:        Number(paramsRow.cubiertas_por_equipo),
      vida_util_neumaticos_km:     Number(paramsRow.vida_util_neumaticos_km),
      cargas_sociales_mensual:     Number(paramsRow.cargas_sociales_mensual),
      seguros_mensual:             Number(paramsRow.seguros_mensual),
      patente_anual:               Number(paramsRow.patente_anual),
      gomeria_mensual:             Number(paramsRow.gomeria_mensual),
      lavadero_mensual:            Number(paramsRow.lavadero_mensual),
      overhead_pct:                Number(paramsRow.overhead_pct),
    },
  })

  function onSave(dto: RentabilidadParametros) {
    update(dto, {
      onSuccess: () => toast('✓ Parámetros actualizados', 'ok'),
      onError:   () => toast('Error al guardar', 'err'),
    })
  }

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full bg-azul text-white px-4 py-2.5 flex items-center justify-between hover:bg-azul-mid transition-colors"
      >
        <span className="font-display text-base tracking-wider">{open ? '▾' : '▸'} PARÁMETROS DE EMPRESA</span>
        <span className="text-xs opacity-80">Vigente desde {paramsRow.vigente_desde}</span>
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-4">
          <p className="text-xs text-gris-dark italic">
            Al guardar se cierra la versión actual y se crea una nueva (queda en histórico). Afecta a todos los viajes simulados.
          </p>

          <fieldset className="border border-gris rounded-lg p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gris-dark px-1">Generales</legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Alícuota IVA (ej 0.21)"     type="number" step="0.01" disabled={readOnly} {...form.register('alicuota_iva',         { valueAsNumber: true })} />
              <Input label="Tipo de cambio USD/ARS"     type="number" disabled={readOnly} {...form.register('tipo_cambio_usd_ars',  { valueAsNumber: true })} />
            </div>
          </fieldset>

          <fieldset className="border border-gris rounded-lg p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gris-dark px-1">Equipo</legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Valor tractor (USD)"           type="number" disabled={readOnly} {...form.register('valor_tractor_usd',          { valueAsNumber: true })} />
              <Input label="Valor residual tractor (USD)"  type="number" disabled={readOnly} {...form.register('valor_residual_tractor_usd', { valueAsNumber: true })} />
              <Input label="Vida útil tractor (km)"        type="number" disabled={readOnly} {...form.register('vida_util_tractor_km',       { valueAsNumber: true })} />
              <Input label="Valor batea (USD)"             type="number" disabled={readOnly} {...form.register('valor_semirremolque_usd',    { valueAsNumber: true })} />
              <Input label="Vida útil batea (años)"        type="number" disabled={readOnly} {...form.register('vida_util_batea_anios',      { valueAsNumber: true })} />
            </div>
          </fieldset>

          <fieldset className="border border-gris rounded-lg p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gris-dark px-1">Mantenimiento + neumáticos</legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Costo service (ARS)"         type="number" disabled={readOnly} {...form.register('costo_service',          { valueAsNumber: true })} />
              <Input label="Frecuencia service (km)"     type="number" disabled={readOnly} {...form.register('frecuencia_service_km',  { valueAsNumber: true })} />
              <Input label="Costo cubierta (ARS)"        type="number" disabled={readOnly} {...form.register('costo_cubierta',         { valueAsNumber: true })} />
              <Input label="Cubiertas por equipo"        type="number" disabled={readOnly} {...form.register('cubiertas_por_equipo',   { valueAsNumber: true })} />
              <Input label="Vida útil neumáticos (km)"   type="number" disabled={readOnly} {...form.register('vida_util_neumaticos_km',{ valueAsNumber: true })} />
            </div>
          </fieldset>

          <fieldset className="border border-gris rounded-lg p-3">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-gris-dark px-1">Personal y gastos fijos</legend>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Cargas sociales (ARS/mes)"   type="number" disabled={readOnly} {...form.register('cargas_sociales_mensual', { valueAsNumber: true })} />
              <Input label="Seguros (ARS/mes)"           type="number" disabled={readOnly} {...form.register('seguros_mensual',         { valueAsNumber: true })} />
              <Input label="Patente + tasas + VTV (ARS/año)" type="number" disabled={readOnly} {...form.register('patente_anual',     { valueAsNumber: true })} />
              <Input label="Gomería (ARS/mes)"           type="number" disabled={readOnly} {...form.register('gomeria_mensual',         { valueAsNumber: true })} />
              <Input label="Lavadero (ARS/mes)"          type="number" disabled={readOnly} {...form.register('lavadero_mensual',        { valueAsNumber: true })} />
              <Input label="Overhead (ej 0.01 = 1%)"     type="number" step="0.001" disabled={readOnly} {...form.register('overhead_pct',  { valueAsNumber: true })} />
            </div>
          </fieldset>

          {!readOnly && (
            <div className="flex justify-end">
              <Button variant="primary" loading={isPending} onClick={form.handleSubmit(onSave)}>✓ Guardar parámetros</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
