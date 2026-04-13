'use client'

import { useState } from 'react'
import {
  useLiquidaciones, useAdelantos, useChoferes, useTramos, useRutas,
  useCreateLiquidacion, useCerrarLiquidacion, useDeleteLiquidacion,
  useCreateAdelanto,
} from '../hooks/useLogistica'
import { Modal }  from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Select }   from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { Badge }  from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm } from 'react-hook-form'
import type { Adelanto } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-AR')
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function LiquidacionesTab() {
  const toast = useToast()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: adelantos     = [] } = useAdelantos()
  const { data: choferes      = [] } = useChoferes()
  const { data: tramos        = [] } = useTramos()
  const { data: rutas         = [] } = useRutas()

  const { mutate: createLiq,  isPending: creating } = useCreateLiquidacion()
  const { mutate: cerrarLiq  } = useCerrarLiquidacion()
  const { mutate: deleteLiq  } = useDeleteLiquidacion()
  const { mutate: createAdel, isPending: creatingAdel } = useCreateAdelanto()

  const [modalLiq,   setModalLiq]   = useState(false)
  const [modalAdel,  setModalAdel]  = useState(false)
  const [choferId,   setChoferId]   = useState<number | null>(null)
  const [selTramos,  setSelTramos]  = useState<number[]>([])
  const [selAdelant, setSelAdelant] = useState<number[]>([])
  const [resumen,    setResumen]    = useState<any>(null)

  const formLiq  = useForm<any>()
  const formAdel = useForm<any>()

  // Tramos del chofer sin liquidar
  const tramosChofer = tramos.filter((t: any) => {
    if (!choferId || t.chofer_id !== choferId) return false
    const liqIds = new Set(liquidaciones.flatMap((l: any) => l._tramo_ids ?? []))
    return !liqIds.has(t.id)
  })

  const adelantosChofer = adelantos.filter(
    (a: Adelanto) => choferId && a.chofer_id === choferId && !a.liquidacion_id
  )

  function calcular(data: any) {
    const precioKm  = parseFloat(data.precio_km)  || 0
    const basicoDia = parseFloat(data.basico_dia)  || 0
    const dias      = parseInt(data.dias)          || 0
    const km = selTramos.reduce((sum: number, tid: number) => {
      const t = tramos.find((x: any) => x.id === tid)
      const r = t?.cantera_id && t?.deposito_id
        ? rutas.find(r => r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id)
        : null
      return sum + (r?.km_ida_vuelta ?? 0)
    }, 0)
    const adelTotal = selAdelant.reduce((sum, aid) => {
      return sum + (adelantos.find((a: Adelanto) => a.id === aid)?.monto ?? 0)
    }, 0)
    const subtKm     = km * precioKm
    const subtBasico = dias * basicoDia
    const total      = subtKm + subtBasico - adelTotal
    setResumen({ km, subtKm, dias, subtBasico, adelTotal, total })
    return { km, subtKm, subtBasico, adelTotal, total }
  }

  function handleCreateLiq(data: any) {
    if (!choferId) return
    const { km, subtKm, subtBasico, adelTotal, total } = calcular(data)
    createLiq({
      chofer_id:       choferId,
      fecha_desde:     data.desde,
      fecha_hasta:     data.hasta,
      dias_trabajados: parseInt(data.dias) || 0,
      km_totales:      km,
      precio_km:       parseFloat(data.precio_km) || 0,
      basico_dia:      parseFloat(data.basico_dia) || 0,
      subtotal_km:     subtKm,
      subtotal_basico: subtBasico,
      total_adelantos: adelTotal,
      total_neto:      total,
      obs:             data.obs,
      tramo_ids:       selTramos,
      adelanto_ids:    selAdelant,
    }, {
      onSuccess: () => {
        toast('✓ Liquidación guardada', 'ok')
        setModalLiq(false)
        formLiq.reset()
        setChoferId(null)
        setSelTramos([])
        setSelAdelant([])
        setResumen(null)
      },
      onError: () => toast('Error al guardar', 'err'),
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

  return (
    <>
      <div className="flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => { formAdel.setValue('fecha', new Date().toISOString().slice(0, 10)); setModalAdel(true) }}>
          💵 Registrar adelanto
        </Button>
        <Button variant="primary" size="sm" onClick={() => setModalLiq(true)}>
          💰 Nueva liquidación
        </Button>
      </div>

      {/* Lista liquidaciones */}
      {liquidaciones.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">
          No hay liquidaciones registradas.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {liquidaciones.map((liq: any) => {
            const chofer = choferes.find(c => c.id === liq.chofer_id)
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
                      {liq.km_totales.toLocaleString('es-AR')} km
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-lg text-verde">{fmtM(liq.total_neto)}</div>
                    <div className="text-xs text-gris-dark">Total neto</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {liq.estado === 'borrador' && (
                    <Button variant="primary" size="sm" onClick={() => cerrarLiq(liq.id, { onSuccess: () => toast('✓ Cerrada', 'ok') })}>
                      ✓ Cerrar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm('¿Eliminar?')) deleteLiq(liq.id, { onSuccess: () => toast('✓ Eliminada', 'ok') }) }}>
                    🗑 Eliminar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal liquidación */}
      <Modal open={modalLiq} onClose={() => setModalLiq(false)} title="💰 NUEVA LIQUIDACIÓN" width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalLiq(false)}>Cancelar</Button>
            <Button variant="ghost" size="sm" onClick={() => calcular(formLiq.getValues())}>🔄 Calcular</Button>
            <Button variant="primary" loading={creating} onClick={formLiq.handleSubmit(handleCreateLiq)}>✓ Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Combobox
              label="Chofer"
              placeholder="Buscar chofer..."
              options={choferes.map(c => ({ value: String(c.id), label: c.nombre }))}
              value={String(choferId ?? '')}
              onChange={v => setChoferId(v ? Number(v) : null)}
            />
            <Input label="Precio por km ($)" type="number" placeholder="0" {...formLiq.register('precio_km')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Básico por día ($)" type="number" placeholder="0" {...formLiq.register('basico_dia')} />
            <Input label="Días trabajados" type="number" placeholder="0" {...formLiq.register('dias')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Período desde" type="date" {...formLiq.register('desde')} />
            <Input label="Período hasta"  type="date" {...formLiq.register('hasta')} />
          </div>

          {/* Viajes */}
          {choferId && (
            <div>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                Tramos a incluir ({selTramos.length} seleccionados)
              </div>
              <div className="bg-gris rounded-xl p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                {tramosChofer.length === 0
                  ? <p className="text-xs text-gris-dark">No hay tramos disponibles para este chofer.</p>
                  : tramosChofer.map((t: any) => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 border-b border-gris-mid last:border-0">
                      <input
                        type="checkbox"
                        checked={selTramos.includes(t.id)}
                        onChange={e => setSelTramos((prev: number[]) => e.target.checked ? [...prev, t.id] : prev.filter((x: number) => x !== t.id))}
                        className="accent-azul"
                      />
                      <span>#{t.id} · {fmtFecha(t.fecha)} · {t.tipo === 'carga' ? '⛏' : '🏭'} {t.toneladas ? `${t.toneladas} tn` : '—'}</span>
                    </label>
                  ))
                }
              </div>
            </div>
          )}

          {/* Adelantos */}
          {choferId && adelantosChofer.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">
                Adelantos pendientes
              </div>
              <div className="bg-gris rounded-xl p-3 max-h-32 overflow-y-auto flex flex-col gap-1">
                {adelantosChofer.map((a: Adelanto) => (
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
          {resumen && (
            <div className="bg-azul-light rounded-xl p-4">
              <div className="font-display text-lg tracking-wider text-azul mb-3">RESUMEN</div>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-gris-dark">Km totales:</span>
                <span className="font-mono font-bold">{resumen.km.toLocaleString('es-AR')} km</span>
                <span className="text-gris-dark">Subtotal km:</span>
                <span className="font-mono font-bold text-azul-mid">{fmtM(resumen.subtKm)}</span>
                <span className="text-gris-dark">Subtotal básico:</span>
                <span className="font-mono font-bold text-azul-mid">{fmtM(resumen.subtBasico)}</span>
                <span className="text-gris-dark">Adelantos:</span>
                <span className="font-mono font-bold text-rojo">- {fmtM(resumen.adelTotal)}</span>
                <span className="font-bold text-azul">TOTAL NETO:</span>
                <span className="font-mono font-bold text-lg text-verde">{fmtM(resumen.total)}</span>
              </div>
            </div>
          )}

          <Input label="Observaciones" placeholder="Notas opcionales..." {...formLiq.register('obs')} />
        </div>
      </Modal>

      {/* Modal adelanto */}
      <Modal open={modalAdel} onClose={() => setModalAdel(false)} title="💵 REGISTRAR ADELANTO"
        footer={<><Button variant="secondary" onClick={() => setModalAdel(false)}>Cancelar</Button><Button variant="primary" loading={creatingAdel} onClick={formAdel.handleSubmit(handleCreateAdel)}>✓ Guardar</Button></>}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Chofer" placeholder="Elegí" options={choferes.map(c => ({ value: c.id, label: c.nombre }))} {...formAdel.register('chofer_id')} />
            <Input label="Fecha" type="date" {...formAdel.register('fecha')} />
          </div>
          <Input label="Monto ($)" type="number" step="100" placeholder="0" {...formAdel.register('monto')} />
          <Input label="Descripción" placeholder="Ej: Adelanto semana del 10/3" {...formAdel.register('descripcion')} />
        </div>
      </Modal>
    </>
  )
}