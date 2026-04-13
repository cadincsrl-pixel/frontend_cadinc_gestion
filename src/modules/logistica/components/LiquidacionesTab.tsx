'use client'

import { useState } from 'react'
import {
  useLiquidaciones, useAdelantos, useChoferes, useTramos,
  useCreateLiquidacion, useCerrarLiquidacion, useDeleteLiquidacion,
  useCreateAdelanto,
} from '../hooks/useLogistica'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { Input }    from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Badge }    from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useForm }  from 'react-hook-form'
import type { Chofer, Tramo, Adelanto } from '@/types/domain.types'

function fmtM(n: number) {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

/** Fechas únicas de tramos completados */
function diasUnicos(tramos: Tramo[]): number {
  const fechas = new Set(tramos.map(t => t.fecha_carga ?? t.fecha_vacio ?? '').filter(Boolean))
  return fechas.size
}

export function LiquidacionesTab() {
  const toast = useToast()
  const { data: liquidaciones = [] } = useLiquidaciones()
  const { data: adelantos     = [] } = useAdelantos()
  const { data: choferes      = [] } = useChoferes()
  const { data: tramos        = [] } = useTramos()

  const { mutate: createLiq,  isPending: creating     } = useCreateLiquidacion()
  const { mutate: cerrarLiq  } = useCerrarLiquidacion()
  const { mutate: deleteLiq  } = useDeleteLiquidacion()
  const { mutate: createAdel, isPending: creatingAdel } = useCreateAdelanto()

  const [modalLiq,   setModalLiq]   = useState(false)
  const [choferLiq,  setChoferLiq]  = useState<Chofer | null>(null)
  const [selAdelant, setSelAdelant] = useState<number[]>([])
  const [modalAdel,  setModalAdel]  = useState(false)

  const formAdel = useForm<any>()
  const formLiq  = useForm<any>()

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
    const subtotal      = dias * (chofer.basico_dia ?? 0)
    const descuentos    = mis_adelantos.reduce((s, a) => s + a.monto, 0)
    const saldo         = subtotal - descuentos
    return { mis_tramos, mis_adelantos, dias, sinBasico, subtotal, descuentos, saldo }
  }

  function abrirLiquidar(chofer: Chofer) {
    setChoferLiq(chofer)
    // Pre-seleccionar todos los adelantos pendientes del chofer
    const as_ = adelantosPendientes.filter(a => a.chofer_id === chofer.id).map(a => a.id)
    setSelAdelant(as_)
    formLiq.reset({
      basico_dia: chofer.basico_dia ?? 0,
      desde:      '',
      hasta:      '',
      obs:        '',
    })
    setModalLiq(true)
  }

  function calcularPreview() {
    if (!choferLiq) return { dias: 0, subtotal: 0, descuentos: 0, neto: 0 }
    const basicoDia  = parseFloat(formLiq.getValues('basico_dia')) || 0
    const mis_tramos = tramosPendientes.filter(t => t.chofer_id === choferLiq.id)
    const dias       = diasUnicos(mis_tramos)
    const subtotal   = dias * basicoDia
    const descuentos = adelantosPendientes.filter(a => selAdelant.includes(a.id)).reduce((s, a) => s + a.monto, 0)
    return { dias, subtotal, descuentos, neto: subtotal - descuentos }
  }

  function handleCreateLiq(data: any) {
    if (!choferLiq) return
    const { dias, subtotal, descuentos, neto } = calcularPreview()
    const tramo_ids = tramosPendientes.filter(t => t.chofer_id === choferLiq.id).map(t => t.id)
    createLiq({
      chofer_id:       choferLiq.id,
      fecha_desde:     data.desde,
      fecha_hasta:     data.hasta,
      dias_trabajados: dias,
      basico_dia:      parseFloat(data.basico_dia) || 0,
      subtotal_basico: subtotal,
      total_adelantos: descuentos,
      total_neto:      neto,
      obs:             data.obs,
      tramo_ids,
      adelanto_ids:    selAdelant,
    }, {
      onSuccess: () => {
        toast('✓ Liquidación guardada', 'ok')
        setModalLiq(false)
        setChoferLiq(null)
        setSelAdelant([])
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
            const { mis_tramos, mis_adelantos, dias, sinBasico, subtotal, descuentos, saldo } = resumenChofer(chofer)
            const sinMovimientos = mis_tramos.length === 0 && mis_adelantos.length === 0

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
                            {mis_tramos.length} tramo{mis_tramos.length !== 1 ? 's' : ''} completado{mis_tramos.length !== 1 ? 's' : ''} ·{' '}
                            <span className="font-semibold text-carbon">{dias} día{dias !== 1 ? 's' : ''} trabajado{dias !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {mis_adelantos.length > 0 && (
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
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className={`font-mono font-bold text-xl ${saldo >= 0 ? 'text-verde' : 'text-rojo'}`}>
                            {fmtM(saldo)}
                          </div>
                          <div className="text-[11px] text-gris-dark">
                            {fmtM(subtotal)}
                            {descuentos > 0 ? ` − ${fmtM(descuentos)}` : ''}
                            {chofer.basico_dia ? ` · ${fmtM(chofer.basico_dia)}/día` : ''}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Botón liquidar — solo si hay tramos o adelantos */}
                {!sinMovimientos && (
                  <div className="mt-3 pt-3 border-t border-gris flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => abrirLiquidar(chofer)}>
                      💰 Liquidar
                    </Button>
                    {sinBasico && mis_tramos.length > 0 && (
                      <span className="text-xs text-gris-dark self-center">
                        Configurá el básico/día en Tarifas antes de liquidar
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Historial ── */}
      {liquidaciones.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gris-dark uppercase tracking-wider mb-2">Historial de liquidaciones</h2>
          <div className="flex flex-col gap-3">
            {(liquidaciones as any[]).map(liq => {
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

      {/* ── Modal liquidar ── */}
      <Modal open={modalLiq} onClose={() => setModalLiq(false)} title="💰 LIQUIDAR CHOFER" width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalLiq(false)}>Cancelar</Button>
            <Button variant="primary" loading={creating} onClick={formLiq.handleSubmit(handleCreateLiq)}>✓ Guardar liquidación</Button>
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

            <div className="grid grid-cols-3 gap-3">
              <Input label="Básico/día ($)" type="number" step="100" {...formLiq.register('basico_dia')} />
              <Input label="Período desde" type="date" {...formLiq.register('desde')} />
              <Input label="Período hasta"  type="date" {...formLiq.register('hasta')} />
            </div>

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
                <span className="text-gris-dark">Básico total:</span>
                <span className="font-mono font-bold text-azul-mid">{fmtM(preview.subtotal)}</span>
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
