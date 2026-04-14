'use client'

import { useState } from 'react'
import {
  useLiquidaciones, useAdelantos, useChoferes, useTramos, useRutas, useCanteras, useDepositos,
  useCreateLiquidacion, useUpdateLiquidacion, useCerrarLiquidacion, useDeleteLiquidacion,
  useCreateAdelanto, useUpdateAdelanto, useDeleteAdelanto, useUpdateChofer,
} from '../hooks/useLogistica'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import type { Chofer, Tramo, Adelanto, Ruta, Cantera, Deposito } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

/** Fechas únicas de tramos completados */
function diasUnicos(tramos: Tramo[]): number {
  const inicios = tramos.map(t => t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  const fines   = tramos.map(t => t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  if (!inicios.length) return 0
  const desde = inicios.reduce((a, b) => a < b ? a : b)
  const hasta = fines.length ? fines.reduce((a, b) => a > b ? a : b) : desde
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

function diasDelMes(fechaStr: string): number {
  if (!fechaStr) return 30
  const [y, m] = fechaStr.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function rangoTramos(tramos: Tramo[]): { desde: string; hasta: string } {
  const inicios = tramos.map(t => t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  const fines   = tramos.map(t => t.fecha_descarga ?? t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean)
  const desde   = inicios.length ? inicios.reduce((a, b) => a < b ? a : b) : ''
  const hasta   = fines.length   ? fines.reduce((a, b) => a > b ? a : b)   : ''
  return { desde, hasta }
}

/** Días calendario entre dos fechas (inclusive) */
function diasEntreFechas(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0
  return Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1
}

/** Km de un tramo según la tabla de rutas (busca por cantera+deposito en cualquier orden) */
function kmTramo(t: Tramo, rutas: Ruta[]): number {
  if (!t.cantera_id || !t.deposito_id) return 0
  const ruta = rutas.find(r =>
    (r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id) ||
    (r.cantera_id === t.deposito_id && r.deposito_id === t.cantera_id)
  )
  return ruta?.km_ida_vuelta ?? 0
}

export function LiquidacionesTab() {
  const toast = useToast()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: adelantos     = [] } = useAdelantos()
  const { data: choferes      = [] } = useChoferes()
  const { data: tramos        = [] } = useTramos()
  const { data: rutas         = [] } = useRutas()
  const { data: canteras      = [] } = useCanteras()
  const { data: depositos     = [] } = useDepositos()

  const { mutate: createLiq,   isPending: creating     } = useCreateLiquidacion()
  const { mutate: updateLiq,   isPending: updating     } = useUpdateLiquidacion()
  const { mutate: cerrarLiq   } = useCerrarLiquidacion()

  const { mutate: deleteLiq   } = useDeleteLiquidacion()
  const { mutate: createAdel,  isPending: creatingAdel } = useCreateAdelanto()
  const { mutate: updateAdel,  isPending: updatingAdel } = useUpdateAdelanto()
  const { mutate: deleteAdel  } = useDeleteAdelanto()
  const { mutate: updateChofer, isPending: savingTarifas } = useUpdateChofer()

  const [modalLiq,    setModalLiq]    = useState(false)
  const [choferLiq,   setChoferLiq]   = useState<Chofer | null>(null)
  const [selAdelant,  setSelAdelant]  = useState<number[]>([])
  const [selTramos,   setSelTramos]   = useState<number[]>([])
  const [modalAdel,   setModalAdel]   = useState(false)
  const [editandoAdel, setEditandoAdel] = useState<Adelanto | null>(null)
  const [detalleLiq,  setDetalleLiq]  = useState<any | null>(null)

  const formAdel    = useForm<any>()
  const formEditAdel = useForm<any>()
  const formLiq     = useForm<any>()
  const formDetalle = useForm<any>()

  // Reactive watch para que el preview se actualice al cambiar fechas/tarifas
  const watchDesde  = formLiq.watch('desde')
  const watchHasta  = formLiq.watch('hasta')
  const watchBasico = formLiq.watch('basico_mensual')
  const watchKm     = formLiq.watch('precio_km')

  // Tramos completados aún no liquidados
  const tramosPendientes    = (tramos as Tramo[]).filter(t => t.estado === 'completado' && !t.liquidacion_id)
  const adelantosPendientes = (adelantos as Adelanto[]).filter(a => !a.liquidacion_id)

  // Todos los choferes activos o de descanso
  const choferesPendientes = (choferes as Chofer[]).filter(c => c.estado !== 'inactivo')

  function resumenChofer(chofer: Chofer) {
    const mis_tramos    = tramosPendientes.filter(t => t.chofer_id === chofer.id)
    const mis_adelantos = adelantosPendientes.filter(a => a.chofer_id === chofer.id)
    const dias          = diasUnicos(mis_tramos)
    const sinBasico     = !chofer.basico_dia
    const subtotal_bas  = dias * (chofer.basico_dia ?? 0)
    const km_totales    = mis_tramos.reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
    const subtotal_km   = km_totales * (chofer.precio_km ?? 0)
    const subtotal      = subtotal_bas + subtotal_km
    const descuentos    = mis_adelantos.reduce((s, a) => s + a.monto, 0)
    const saldo         = subtotal - descuentos
    return { mis_tramos, mis_adelantos, dias, sinBasico, subtotal_bas, km_totales, subtotal_km, subtotal, descuentos, saldo }
  }

  function abrirLiquidar(chofer: Chofer) {
    setChoferLiq(chofer)
    const mis_tramos = tramosPendientes.filter(t => t.chofer_id === chofer.id)
    setSelTramos(mis_tramos.map(t => t.id))
    setSelAdelant(adelantosPendientes.filter(a => a.chofer_id === chofer.id).map(a => a.id))
    const { desde, hasta } = rangoTramos(mis_tramos)
    const dm = diasDelMes(desde)
    formLiq.reset({
      basico_mensual: Math.round((chofer.basico_dia ?? 0) * dm) || 0,
      precio_km:      chofer.precio_km ?? 0,
      desde,
      hasta,
      obs:            '',
    })
    setModalLiq(true)
  }

  function calcularPreview() {
    if (!choferLiq) return { dias: 0, basico_dia: 0, dias_mes: 30, subtotal_bas: 0, km_totales: 0, subtotal_km: 0, descuentos: 0, neto: 0 }
    const basicoMensual = parseFloat(watchBasico) || 0
    const precioKm      = parseFloat(watchKm)     || 0
    const desde         = watchDesde ?? ''
    const hasta         = watchHasta ?? ''
    const dias_mes      = diasDelMes(desde)
    const basico_dia    = basicoMensual / dias_mes
    const dias          = diasEntreFechas(desde, hasta)
    const tramosSelec   = tramosPendientes.filter(t => selTramos.includes(t.id))
    const subtotal_bas  = dias * basico_dia
    const km_totales    = tramosSelec.reduce((s, t) => s + kmTramo(t, rutas as Ruta[]), 0)
    const subtotal_km   = km_totales * precioKm
    const descuentos    = adelantosPendientes.filter(a => selAdelant.includes(a.id)).reduce((s, a) => s + a.monto, 0)
    return { dias, basico_dia, dias_mes, subtotal_bas, km_totales, subtotal_km, descuentos, neto: subtotal_bas + subtotal_km - descuentos }
  }

  function handleGuardarTarifas(data: any) {
    if (!choferLiq) return
    const { basico_dia } = calcularPreview()
    updateChofer({ id: choferLiq.id, dto: { basico_dia, precio_km: parseFloat(data.precio_km) || 0 } }, {
      onSuccess: () => { toast('✓ Tarifas guardadas', 'ok'); setModalLiq(false); setChoferLiq(null) },
      onError:   () => toast('Error al guardar', 'err'),
    })
  }

  function handleLiquidar(data: any) {
    if (!choferLiq) return
    const { dias, basico_dia, subtotal_bas, subtotal_km, descuentos, neto } = calcularPreview()
    const tramo_ids = selTramos
    createLiq({
      chofer_id:       choferLiq.id,
      fecha_desde:     data.desde,
      fecha_hasta:     data.hasta,
      dias_trabajados: dias,
      basico_dia,
      subtotal_basico: subtotal_bas + subtotal_km,
      total_adelantos: descuentos,
      total_neto:      neto,
      obs:             data.obs,
      tramo_ids,
      adelanto_ids:    selAdelant,
    }, {
      onSuccess: (nueva: any) => {
        cerrarLiq(nueva.id, { onSuccess: () => toast('✓ Liquidación cerrada', 'ok') })
        setModalLiq(false)
        setChoferLiq(null)
        setSelAdelant([])
        setSelTramos([])
      },
      onError: () => toast('Error al liquidar', 'err'),
    })
  }

  function handleCreateAdel(data: any) {
    createAdel({
      chofer_id:   Number(data.chofer_id),
      fecha:       data.fecha,
      monto:       Number(data.monto),
      descripcion: data.descripcion,
    }, {
      onSuccess: () => { toast('✓ Adelanto registrado', 'ok'); setModalAdel(false); formAdel.reset() },
      onError:   () => toast('Error al registrar', 'err'),
    })
  }

  const preview = calcularPreview()

  return (
    <>
      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => {
          formAdel.setValue('fecha', new Date().toISOString().slice(0, 10))
          setModalAdel(true)
        }}>
          💵 Registrar adelanto
        </Button>
      </div>

      {/* ── Saldo corriente por chofer ── */}
      <div>
        <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-3">
          Saldo corriente por chofer
        </h2>
        <div className="flex flex-col gap-3">
          {choferesPendientes.map(chofer => {
            const { mis_tramos, mis_adelantos, dias, sinBasico, subtotal_bas, km_totales, subtotal_km, subtotal, descuentos, saldo } = resumenChofer(chofer)
            const sinMovimientos = mis_tramos.length === 0 && mis_adelantos.length === 0
            const borrador = (liquidaciones as any[]).find(l => l.chofer_id === chofer.id && l.estado === 'borrador')

            return (
              <div key={chofer.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">

                  {/* Nombre + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-azul">{chofer.nombre}</span>
                      {chofer.estado === 'descanso' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-naranja-light text-naranja-dark px-2 py-0.5 rounded-full">
                          De descanso
                        </span>
                      )}
                    </div>

                    {sinMovimientos ? (
                      <p className="text-xs text-gris-mid mt-1 italic">Sin tramos ni adelantos pendientes</p>
                    ) : (
                      <div className="text-xs text-gris-dark mt-1 space-y-0.5">
                        {mis_tramos.length > 0 && (
                          <div>
                            {mis_tramos.length} tramo{mis_tramos.length !== 1 ? 's' : ''} ·{' '}
                            <span className="font-semibold text-carbon">{dias} día{dias !== 1 ? 's' : ''}</span>
                            {km_totales > 0 && (
                              <> · <span className="font-semibold text-carbon">{km_totales.toLocaleString('es-AR')} km</span></>
                            )}
                          </div>
                        )}
                        {mis_tramos.length > 0 && !sinBasico && (
                          <div className="text-gris-mid">
                            {fmtM(subtotal_bas)} básico
                            {subtotal_km > 0 && ` + ${fmtM(subtotal_km)} km`}
                            {descuentos > 0 && ` − ${fmtM(descuentos)} adelantos`}
                          </div>
                        )}
                        {mis_adelantos.length > 0 && sinBasico && (
                          <div>{mis_adelantos.length} adelanto{mis_adelantos.length !== 1 ? 's' : ''} · {fmtM(descuentos)}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Saldo */}
                  {!sinMovimientos && (
                    <div className="text-right shrink-0">
                      {sinBasico && mis_tramos.length > 0 ? (
                        <div>
                          <span className="text-xs font-bold bg-amarillo/20 text-amber-700 px-2 py-1 rounded-lg">
                            Básico pendiente — {dias} día{dias !== 1 ? 's' : ''}
                            {km_totales > 0 && ` · ${km_totales.toLocaleString('es-AR')} km`}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className={`font-mono font-bold text-xl ${saldo >= 0 ? 'text-verde' : 'text-rojo'}`}>
                            {fmtM(saldo)}
                          </div>
                          <div className="text-[11px] text-gris-dark">
                            {fmtM(subtotal)} haberes
                            {descuentos > 0 ? ` − ${fmtM(descuentos)}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Borrador pendiente */}
                {borrador && (
                  <div className="mt-3 pt-3 border-t border-gris flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-gris-dark">
                      <span className="font-bold text-amber-700">Borrador</span> ·{' '}
                      {fmtFecha(borrador.fecha_desde)} → {fmtFecha(borrador.fecha_hasta)} ·{' '}
                      <span className="font-bold text-carbon">{fmtM(borrador.total_neto)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => cerrarLiq(borrador.id, {
                        onSuccess: () => toast('✓ Liquidación cerrada', 'ok'),
                        onError:   (e: any) => toast(`Error al cerrar: ${e?.message ?? 'desconocido'}`, 'err'),
                      })}>
                        💰 Liquidar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('¿Eliminar borrador?')) deleteLiq(borrador.id, {
                          onSuccess: () => toast('✓ Eliminado', 'ok'),
                          onError:   (e: any) => toast(`Error al eliminar: ${e?.message ?? 'desconocido'}`, 'err'),
                        })
                      }}>
                        🗑
                      </Button>
                    </div>
                  </div>
                )}

                {/* Botón liquidar */}
                {!sinMovimientos && !borrador && (
                  <div className="mt-3 pt-3 border-t border-gris flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => abrirLiquidar(chofer)}>
                      💰 Liquidar
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Historial ── */}
      {(liquidaciones as any[]).filter(l => l.estado === 'cerrada').length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Historial de liquidaciones</h2>
          <div className="flex flex-col gap-3">
            {(liquidaciones as any[]).filter(l => l.estado === 'cerrada').map(liq => {
              const chofer = (choferes as Chofer[]).find(c => c.id === liq.chofer_id)
              return (
                <div key={liq.id} className={`bg-white rounded-card shadow-card p-4 border-l-4 ${liq.estado === 'cerrada' ? 'border-verde' : 'border-amarillo'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={liq.estado === 'cerrada' ? 'cerrado' : 'pendiente'} label={liq.estado === 'cerrada' ? 'Cerrada' : 'Borrador'} />
                      </div>
                      <div className="font-bold text-azul">{chofer?.nombre ?? '—'}</div>
                      <div className="text-xs text-gris-dark mt-1">
                        {fmtFecha(liq.fecha_desde)} → {fmtFecha(liq.fecha_hasta)} &nbsp;·&nbsp;
                        {liq.dias_trabajados} días &nbsp;·&nbsp;
                        {fmtM(liq.basico_dia)}/día
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-lg text-verde">{fmtM(liq.total_neto)}</div>
                      <div className="text-xs text-gris-dark">Total neto</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => {
                      setDetalleLiq(liq)
                      formDetalle.reset({
                        basico_dia:  liq.basico_dia,
                        fecha_desde: liq.fecha_desde,
                        fecha_hasta: liq.fecha_hasta,
                        obs:         liq.obs ?? '',
                      })
                    }}>
                      🔍 Ver detalle
                    </Button>
                    {liq.estado === 'borrador' && (
                      <Button variant="primary" size="sm" onClick={() => cerrarLiq(liq.id, { onSuccess: () => toast('✓ Cerrada', 'ok') })}>
                        ✓ Cerrar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm('¿Eliminar?')) deleteLiq(liq.id, { onSuccess: () => toast('✓ Eliminada', 'ok') })
                    }}>
                      🗑 Eliminar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Adelantos pendientes ── */}
      {(adelantos as Adelanto[]).filter(a => !a.liquidacion_id).length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Adelantos pendientes</h2>
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Chofer', 'Fecha', 'Descripción', 'Monto', ''].map(h => (
                    <th key={h} className="bg-azul text-white text-xs font-bold px-4 py-3 text-left uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(adelantos as Adelanto[]).filter(a => !a.liquidacion_id).map(a => {
                  const chofer = (choferes as Chofer[]).find(c => c.id === a.chofer_id)
                  return (
                    <tr key={a.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-sm text-carbon">{chofer?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gris-dark font-mono">{fmtFecha(a.fecha)}</td>
                      <td className="px-4 py-3 text-sm text-gris-dark">{a.descripcion || '—'}</td>
                      <td className="px-4 py-3 font-mono font-bold text-rojo">{fmtM(a.monto)}</td>
                      <td className="px-4 py-3 flex gap-1 justify-end">
                        <button
                          onClick={() => { setEditandoAdel(a); formEditAdel.reset({ fecha: a.fecha, monto: a.monto, descripcion: a.descripcion ?? '' }) }}
                          className="text-xs font-bold px-2 py-1 rounded hover:bg-gris transition-colors"
                        >✏️</button>
                        <button
                          onClick={() => { if (confirm('¿Eliminar adelanto?')) deleteAdel(a.id, { onSuccess: () => toast('✓ Adelanto eliminado', 'ok'), onError: () => toast('Error al eliminar', 'err') }) }}
                          className="text-xs font-bold px-2 py-1 rounded hover:bg-rojo-light text-gris-dark hover:text-rojo transition-colors"
                        >✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal liquidar ── */}
      <Modal open={modalLiq} onClose={() => setModalLiq(false)} title="💰 LIQUIDAR CHOFER" width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalLiq(false)}>Cancelar</Button>
            <Button variant="ghost" loading={savingTarifas} onClick={formLiq.handleSubmit(handleGuardarTarifas)}>
              Guardar
            </Button>
            <Button variant="primary" loading={creating} onClick={formLiq.handleSubmit(handleLiquidar)}>
              💰 Liquidar
            </Button>
          </>
        }
      >
        {choferLiq && (
          <div className="flex flex-col gap-4">
            {/* Info chofer */}
            <div className="bg-azul-light rounded-xl px-4 py-3">
              <div className="font-bold text-azul">{choferLiq.nombre}</div>
              <div className="text-xs text-azul-mid mt-0.5">
                {preview.dias} días trabajados · {tramosPendientes.filter(t => t.chofer_id === choferLiq.id).length} tramos completados
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input label="Básico mensual ($)" type="number" step="1000" {...formLiq.register('basico_mensual')} />
                {preview.dias_mes > 0 && (
                  <p className="text-[11px] text-gris-dark mt-1 px-1">
                    = {fmtM(preview.basico_dia)}/día · mes de {preview.dias_mes} días
                  </p>
                )}
              </div>
              <Input label="$/km adicional" type="number" step="1" {...formLiq.register('precio_km')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Período desde" type="date" {...formLiq.register('desde')} />
              <Input label="Período hasta"  type="date" {...formLiq.register('hasta')} />
            </div>

            {/* Tramos */}
            {tramosPendientes.filter(t => t.chofer_id === choferLiq.id).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  Tramos a liquidar
                </div>
                <div className="bg-gris rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                  {tramosPendientes.filter(t => t.chofer_id === choferLiq.id).map(t => {
                    const cantera  = (canteras as any[]).find(c => c.id === t.cantera_id)
                    const deposito = (depositos as any[]).find(d => d.id === t.deposito_id)
                    const fecha    = t.fecha_carga ?? t.fecha_vacio ?? ''
                    const km       = kmTramo(t, rutas as Ruta[])
                    return (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-gris-mid last:border-0">
                        <input
                          type="checkbox"
                          checked={selTramos.includes(t.id)}
                          onChange={e => setSelTramos(prev => e.target.checked ? [...prev, t.id] : prev.filter(x => x !== t.id))}
                          className="accent-azul"
                        />
                        <span className="flex-1 min-w-0">
                          {fecha ? fmtFecha(fecha) : '—'} ·{' '}
                          <b>{cantera?.nombre ?? `#${t.cantera_id}`}</b>
                          {deposito && <> → {deposito.nombre}</>}
                          {km > 0 && <> · {km} km</>}
                          {t.toneladas_carga && <> · {t.toneladas_carga} t</>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Adelantos */}
            {adelantosPendientes.filter(a => a.chofer_id === choferLiq.id).length > 0 && (
              <div>
                <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                  Adelantos a descontar
                </div>
                <div className="bg-gris rounded-xl p-3 max-h-32 overflow-y-auto flex flex-col gap-1">
                  {adelantosPendientes.filter(a => a.chofer_id === choferLiq.id).map(a => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-gris-mid last:border-0">
                      <input
                        type="checkbox"
                        checked={selAdelant.includes(a.id)}
                        onChange={e => setSelAdelant(prev => e.target.checked ? [...prev, a.id] : prev.filter(x => x !== a.id))}
                        className="accent-azul"
                      />
                      <span>{fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'} · <b>{fmtM(a.monto)}</b></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Resumen */}
            <div className="bg-azul-light rounded-xl p-4">
              <div className="font-display text-lg tracking-wider text-azul mb-3">RESUMEN</div>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                <span className="text-gris-dark">Días trabajados:</span>
                <span className="font-mono font-bold">{preview.dias} días</span>
                <span className="text-gris-dark">Básico ({preview.dias} días):</span>
                <span className="font-mono font-bold text-azul-mid">{fmtM(preview.subtotal_bas)}</span>
                {preview.km_totales > 0 && (
                  <>
                    <span className="text-gris-dark">Km recorridos:</span>
                    <span className="font-mono font-bold">{preview.km_totales.toLocaleString('es-AR')} km</span>
                    <span className="text-gris-dark">Adicional km:</span>
                    <span className="font-mono font-bold text-azul-mid">{fmtM(preview.subtotal_km)}</span>
                  </>
                )}
                {preview.descuentos > 0 && (
                  <>
                    <span className="text-gris-dark">Adelantos:</span>
                    <span className="font-mono font-bold text-rojo">− {fmtM(preview.descuentos)}</span>
                  </>
                )}
                <span className="font-bold text-azul border-t border-azul/20 pt-1.5">TOTAL NETO:</span>
                <span className={`font-mono font-bold text-lg border-t border-azul/20 pt-1.5 ${preview.neto >= 0 ? 'text-verde' : 'text-rojo'}`}>
                  {fmtM(preview.neto)}
                </span>
              </div>
            </div>

            <Input label="Observaciones" placeholder="Notas opcionales..." {...formLiq.register('obs')} />
          </div>
        )}
      </Modal>

      {/* ── Modal detalle / edición ── */}
      {detalleLiq && (() => {
        const chofer     = (choferes as Chofer[]).find(c => c.id === detalleLiq.chofer_id)
        const liqTramos  = (tramos as Tramo[]).filter(t => t.liquidacion_id === detalleLiq.id)
        const liqAdel    = (adelantos as Adelanto[]).filter(a => a.liquidacion_id === detalleLiq.id)
        const esBorrador = detalleLiq.estado === 'borrador'

        function guardarLiqDto(data: any, onSuccess: () => void) {
          const basicoDia = parseFloat(data.basico_dia) || 0
          const dias      = detalleLiq.dias_trabajados
          const subtotal  = dias * basicoDia
          const desc      = liqAdel.reduce((s: number, a: Adelanto) => s + a.monto, 0)
          updateLiq({
            id: detalleLiq.id,
            dto: {
              basico_dia:      basicoDia,
              fecha_desde:     data.fecha_desde,
              fecha_hasta:     data.fecha_hasta,
              subtotal_basico: subtotal,
              total_neto:      subtotal - desc,
              obs:             data.obs,
            },
          }, { onSuccess, onError: () => toast('Error al actualizar', 'err') })
        }

        function handleGuardar(data: any) {
          guardarLiqDto(data, () => { toast('✓ Liquidación actualizada', 'ok'); setDetalleLiq(null) })
        }

        const handleLiquidarDetalle = formDetalle.handleSubmit((data: any) =>
          guardarLiqDto(data, () => cerrarLiq(detalleLiq.id, {
            onSuccess: () => { toast('✓ Liquidación cerrada', 'ok'); setDetalleLiq(null) },
          }))
        )

        return (
          <Modal
            open={!!detalleLiq}
            onClose={() => setDetalleLiq(null)}
            title={`${esBorrador ? '✏️ EDITAR' : '🔍 DETALLE'} LIQUIDACIÓN #${detalleLiq.id}`}
            width="max-w-xl"
            footer={
              <>
                <Button variant="secondary" onClick={() => setDetalleLiq(null)}>Cerrar</Button>
                {!esBorrador && (
                  <Button variant="ghost" onClick={() => {
                    if (confirm('¿Reabrir esta liquidación? Se eliminará y los tramos/adelantos volverán al saldo corriente.'))
                      deleteLiq(detalleLiq.id, { onSuccess: () => { toast('✓ Liquidación eliminada — tramos liberados', 'ok'); setDetalleLiq(null) } })
                  }}>
                    🔓 Reabrir
                  </Button>
                )}
                {esBorrador && (
                  <Button variant="ghost" loading={updating} onClick={formDetalle.handleSubmit(handleGuardar)}>
                    Guardar
                  </Button>
                )}
                {esBorrador && (
                  <Button variant="primary" loading={updating} onClick={handleLiquidarDetalle}>
                    💰 Liquidar
                  </Button>
                )}
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {/* Info chofer */}
              <div className="bg-azul-light rounded-xl px-4 py-3">
                <div className="font-bold text-azul">{chofer?.nombre ?? '—'}</div>
                <div className="text-xs text-azul-mid mt-0.5">
                  {detalleLiq.dias_trabajados} días · {fmtM(detalleLiq.basico_dia)}/día
                </div>
              </div>

              {/* Fechas y básico — editables si borrador */}
              {esBorrador ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Básico/día ($)" type="number" step="100" {...formDetalle.register('basico_dia')} />
                    <div />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Período desde" type="date" {...formDetalle.register('fecha_desde')} />
                    <Input label="Período hasta"  type="date" {...formDetalle.register('fecha_hasta')} />
                  </div>
                </>
              ) : (
                <div className="text-sm text-gris-dark">
                  {fmtFecha(detalleLiq.fecha_desde)} → {fmtFecha(detalleLiq.fecha_hasta)}
                </div>
              )}

              {/* Tramos vinculados */}
              {liqTramos.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    Tramos incluidos ({liqTramos.length})
                  </div>
                  <div className="bg-gris rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                    {liqTramos.map(t => (
                      <div key={t.id} className="flex justify-between text-xs py-1 border-b border-gris-mid last:border-0">
                        <span className="text-gris-dark">
                          #{t.id} · {t.tipo === 'cargado' ? '🚛' : '🔲'} ·{' '}
                          {t.fecha_carga ? fmtFecha(t.fecha_carga) : t.fecha_vacio ? fmtFecha(t.fecha_vacio) : '—'}
                        </span>
                        <span className="font-mono font-semibold">
                          {t.toneladas_descarga ?? t.toneladas_carga ?? '—'} tn
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adelantos vinculados */}
              {liqAdel.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                    Adelantos descontados ({liqAdel.length})
                  </div>
                  <div className="bg-gris rounded-xl p-3 max-h-32 overflow-y-auto flex flex-col gap-1">
                    {liqAdel.map((a: Adelanto) => (
                      <div key={a.id} className="flex justify-between text-xs py-1 border-b border-gris-mid last:border-0">
                        <span className="text-gris-dark">{fmtFecha(a.fecha)} · {a.descripcion || 'Adelanto'}</span>
                        <span className="font-mono font-semibold text-rojo">− {fmtM(a.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen */}
              <div className="bg-azul-light rounded-xl p-4">
                <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <span className="text-gris-dark">Días trabajados:</span>
                  <span className="font-mono font-bold">{detalleLiq.dias_trabajados} días</span>
                  <span className="text-gris-dark">Subtotal haberes:</span>
                  <span className="font-mono font-bold text-azul-mid">{fmtM(detalleLiq.subtotal_basico)}</span>
                  {detalleLiq.total_adelantos > 0 && (
                    <>
                      <span className="text-gris-dark">Adelantos:</span>
                      <span className="font-mono font-bold text-rojo">− {fmtM(detalleLiq.total_adelantos)}</span>
                    </>
                  )}
                  <span className="font-bold text-azul border-t border-azul/20 pt-1.5">TOTAL NETO:</span>
                  <span className="font-mono font-bold text-lg text-verde border-t border-azul/20 pt-1.5">
                    {fmtM(detalleLiq.total_neto)}
                  </span>
                </div>
              </div>

              {esBorrador && (
                <Input label="Observaciones" {...formDetalle.register('obs')} />
              )}
              {!esBorrador && detalleLiq.obs && (
                <p className="text-xs text-gris-dark italic">{detalleLiq.obs}</p>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* ── Modal editar adelanto ── */}
      <Modal open={!!editandoAdel} onClose={() => setEditandoAdel(null)} title="✏️ EDITAR ADELANTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditandoAdel(null)}>Cancelar</Button>
            <Button variant="primary" loading={updatingAdel} onClick={formEditAdel.handleSubmit((data: any) => {
              if (!editandoAdel) return
              updateAdel({ id: editandoAdel.id, dto: { fecha: data.fecha, monto: Number(data.monto), descripcion: data.descripcion } }, {
                onSuccess: () => { toast('✓ Adelanto actualizado', 'ok'); setEditandoAdel(null) },
                onError:   () => toast('Error al actualizar', 'err'),
              })
            })}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Fecha" type="date" {...formEditAdel.register('fecha')} />
          <Input label="Monto ($)" type="number" step="100" {...formEditAdel.register('monto')} />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formEditAdel.register('descripcion')} />
        </div>
      </Modal>

      {/* ── Modal adelanto ── */}
      <Modal open={modalAdel} onClose={() => setModalAdel(false)} title="💵 REGISTRAR ADELANTO"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAdel(false)}>Cancelar</Button>
            <Button variant="primary" loading={creatingAdel} onClick={formAdel.handleSubmit(handleCreateAdel)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              label="Chofer"
              placeholder="Buscar chofer..."
              options={(choferes as Chofer[]).map(c => ({ value: String(c.id), label: c.nombre }))}
              value={String(formAdel.watch('chofer_id') ?? '')}
              onChange={(v: string) => formAdel.setValue('chofer_id', v)}
            />
            <Input label="Fecha" type="date" {...formAdel.register('fecha')} />
          </div>
          <Input label="Monto ($)" type="number" step="100" placeholder="0" {...formAdel.register('monto')} />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formAdel.register('descripcion')} />
        </div>
      </Modal>
    </>
  )
}
