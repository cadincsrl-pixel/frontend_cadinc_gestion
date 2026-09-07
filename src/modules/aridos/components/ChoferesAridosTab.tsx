'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { toISO } from '@/lib/utils/dates'
import {
  useChoferesAridos, useCreateChoferArido, useUpdateChoferArido,
  useJornalesChofer, useSetJornalChofer,
  useDiasChofer, useMarcarDiaChofer, useBorrarDiaChofer, usePagoMesChoferes,
  useUnidades,
} from '../hooks/useAridos'
import type { ChoferArido } from '../types'

interface ChoferForm {
  nombre: string; dni: string; tel: string; obs: string
  jornal: string; jornal_desde: string
}
interface JornalForm  { jornal: string; vigente_desde: string; obs: string }
interface DiaForm     { chofer_id: string; fecha: string; unidad_id: string; obs: string }

function fmtPlata(n: number) {
  return `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function mensajeError(err: unknown, fallback: string): string {
  const m = (err as { message?: string })?.message ?? ''
  if (m.includes('CHOFER_DUPLICADO')) return 'Ya hay un chofer con ese nombre'
  if (m.includes('DIA_YA_CARGADO'))   return 'Ese día ya está cargado para este chofer'
  return m || fallback
}
function mesesRecientes(): Array<{ value: string; label: string }> {
  const hoy = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))
    return {
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    }
  })
}
function finDeMes(mes: string): string {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)
}

export function ChoferesAridosTab() {
  const toast = useToast()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos('aridos')

  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [modalAlta, setModalAlta]     = useState(false)
  const [modalDia, setModalDia]       = useState(false)
  const [jornalDe, setJornalDe]       = useState<ChoferArido | null>(null)

  const { data: choferes = [], isLoading } = useChoferesAridos()
  const { data: unidades = [] }            = useUnidades()
  const { data: dias = [] }  = useDiasChofer({ desde: `${mes}-01`, hasta: finDeMes(mes) })
  const { data: pagos = [] } = usePagoMesChoferes(mes)

  const { mutate: crear, isPending: creando }   = useCreateChoferArido()
  const { mutate: editar }                      = useUpdateChoferArido()
  const { mutate: setJornal, isPending: guardandoJornal } = useSetJornalChofer()
  const { mutate: marcarDia, isPending: marcando } = useMarcarDiaChofer()
  const { mutate: borrarDia }                   = useBorrarDiaChofer()
  const { data: jornales = [] } = useJornalesChofer(jornalDe?.id)

  const formAlta   = useForm<ChoferForm>({ defaultValues: { nombre: '', dni: '', tel: '', obs: '', jornal: '', jornal_desde: toISO(new Date()) } })
  const formJornal = useForm<JornalForm>({ defaultValues: { jornal: '', vigente_desde: toISO(new Date()), obs: '' } })
  const formDia    = useForm<DiaForm>({ defaultValues: { chofer_id: '', fecha: toISO(new Date()), unidad_id: '', obs: '' } })

  const opcionesUnidad = useMemo(
    () => [{ value: '', label: 'Sin especificar' },
           ...unidades.filter(u => u.activo).map(u => ({ value: u.id, label: `${u.nombre} · ${u.patente}` }))],
    [unidades])
  const opcionesChofer = useMemo(
    () => [{ value: '', label: 'Elegí el chofer…' },
           ...choferes.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre }))],
    [choferes])

  const totalMes = pagos.reduce((s, p) => s + Number(p.a_pagar), 0)
  const diasSinJornal = pagos.reduce((s, p) => s + Number(p.dias_sin_jornal), 0)

  function onAlta(d: ChoferForm) {
    crear({
      nombre: d.nombre.trim(),
      dni:    d.dni.trim() || null,
      tel:    d.tel.trim() || null,
      obs:    d.obs.trim() || null,
      jornal: d.jornal ? Number(d.jornal) : null,
      jornal_desde: d.jornal ? d.jornal_desde : null,
    }, {
      onSuccess: () => {
        toast('✓ Chofer dado de alta', 'ok')
        setModalAlta(false)
        formAlta.reset({ nombre: '', dni: '', tel: '', obs: '', jornal: '', jornal_desde: toISO(new Date()) })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo dar de alta'), 'err'),
    })
  }

  function onJornal(d: JornalForm) {
    if (!jornalDe) return
    setJornal({ chofer_id: jornalDe.id, jornal: Number(d.jornal), vigente_desde: d.vigente_desde, obs: d.obs.trim() || null }, {
      onSuccess: () => {
        toast('✓ Jornal actualizado desde esa fecha', 'ok')
        formJornal.reset({ jornal: '', vigente_desde: toISO(new Date()), obs: '' })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo guardar el jornal'), 'err'),
    })
  }

  function onDia(d: DiaForm) {
    marcarDia({
      chofer_id: Number(d.chofer_id),
      fecha:     d.fecha,
      unidad_id: d.unidad_id ? Number(d.unidad_id) : null,
      obs:       d.obs.trim() || null,
    }, {
      onSuccess: () => {
        toast('✓ Día cargado', 'ok')
        formDia.reset({ chofer_id: d.chofer_id, fecha: d.fecha, unidad_id: d.unidad_id, obs: '' })
      },
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo cargar el día'), 'err'),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 flex flex-wrap items-end gap-3">
        <Select label="Mes" options={mesesRecientes()} value={mes}
          onChange={e => setMes(e.target.value)} className="min-w-[190px]" />
        <div className="ml-auto flex items-end gap-2">
          <Button variant="secondary" size="sm" disabled={!puedeCrear || choferes.length === 0}
            onClick={() => setModalDia(true)}
            title={choferes.length === 0 ? 'Primero dá de alta un chofer' : undefined}>
            📅 Cargar días
          </Button>
          <Button variant="primary" size="sm" disabled={!puedeCrear} onClick={() => setModalAlta(true)}>
            ＋ Nuevo chofer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm">Cargando…</div>
      ) : choferes.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-gris-dark text-sm italic">
          Todavía no hay choferes de áridos. Son un padrón aparte: no los de logística ni el personal de tarja.
          Cobran por día trabajado, así que hay que darles de alta un jornal y después marcarles los días.
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <h3 className="bg-azul text-white text-xs font-bold px-4 py-2.5 uppercase tracking-wide">
            A pagar en {mesesRecientes().find(m => m.value === mes)?.label}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {['Chofer', 'Jornal de hoy', 'Días del mes', 'A pagar', ''].map((h, i) => (
                    <th key={i} className={`bg-gris text-carbon text-xs font-bold px-3 py-2.5 uppercase tracking-wide ${i === 0 ? 'text-left' : i === 4 ? 'text-right' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {choferes.map(c => {
                  const pago = pagos.filter(p => p.chofer_id === c.id)
                  const dias = pago.reduce((s, p) => s + Number(p.dias), 0)
                  const plata = pago.reduce((s, p) => s + Number(p.a_pagar), 0)
                  const incompleto = pago.reduce((s, p) => s + Number(p.dias_sin_jornal), 0) > 0
                  return (
                    <tr key={c.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-bold text-carbon">
                        {c.nombre}
                        {!c.activo && <span className="text-[10px] text-gris-dark font-normal ml-2">(inactivo)</span>}
                        {c.dni && <span className="block text-[11px] text-gris-dark font-normal font-mono">DNI {c.dni}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono whitespace-nowrap">
                        {c.jornal_vigente == null
                          ? <span className="text-rojo text-xs">sin cargar</span>
                          : <>{fmtPlata(c.jornal_vigente)}
                              <span className="block text-[11px] text-gris-dark">desde {fmtDate(c.jornal_desde!)}</span></>}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-carbon">{dias || '—'}</td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono font-bold whitespace-nowrap ${incompleto ? 'text-amber-600' : 'text-carbon'}`}>
                        {plata > 0 ? fmtPlata(plata) : '—'}
                        {incompleto && <span className="block text-[10px] font-normal">incompleto</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" disabled={!puedeEditar}
                          onClick={() => { setJornalDe(c); formJornal.reset({ jornal: '', vigente_desde: toISO(new Date()), obs: '' }) }}
                          title="Ver y cambiar el jornal">💲</Button>
                        <Button variant="ghost" size="sm" disabled={!puedeEditar}
                          onClick={() => editar({ id: c.id, activo: !c.activo }, {
                            onSuccess: () => toast(c.activo ? '✓ Chofer dado de baja' : '✓ Chofer reactivado', 'ok'),
                            onError: (err: unknown) => toast(mensajeError(err, 'No se pudo cambiar'), 'err'),
                          })}
                          title={c.activo ? 'Dar de baja' : 'Reactivar'}>{c.activo ? '🚫' : '↩'}</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gris/60 border-t-2 border-azul">
                  <td colSpan={3} className="px-3 py-2.5 text-sm font-bold text-carbon text-right">Total del mes</td>
                  <td className="px-3 py-2.5 text-sm text-right font-mono font-bold text-carbon">{fmtPlata(totalMes)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {diasSinJornal > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 px-4 py-2 border-t border-gris">
              Hay {diasSinJornal} {diasSinJornal === 1 ? 'día' : 'días'} sin jornal cargado. Esos días cuentan como
              trabajados pero suman $0, así que el total está por debajo de lo real.
            </p>
          )}
        </div>
      )}

      {dias.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <h3 className="bg-gris text-carbon text-xs font-bold px-4 py-2.5 uppercase tracking-wide">
            Días cargados en el mes ({dias.length})
          </h3>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <tbody>
                {dias.map(d => (
                  <tr key={d.id} className="border-b border-gris last:border-0 hover:bg-gris/40 transition-colors">
                    <td className="px-4 py-2 text-sm text-carbon whitespace-nowrap">{fmtDate(d.fecha)}</td>
                    <td className="px-4 py-2 text-sm font-bold text-carbon">{d.aridos_choferes?.nombre ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-gris-dark">{d.aridos_unidades?.nombre ?? 'sin camión'}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-carbon whitespace-nowrap">
                      {d.jornal_aplicado == null
                        ? <span className="text-rojo text-xs">sin jornal</span>
                        : fmtPlata(d.jornal_aplicado)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" disabled={!puedeEliminar}
                        onClick={() => {
                          if (!confirm(`¿Borrar el día ${fmtDate(d.fecha)} de ${d.aridos_choferes?.nombre ?? 'este chofer'}?`)) return
                          borrarDia(d.id, {
                            onSuccess: () => toast('✓ Día borrado', 'ok'),
                            onError: (err: unknown) => toast(mensajeError(err, 'No se pudo borrar'), 'err'),
                          })
                        }}>🗑</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alta de chofer */}
      <Modal open={modalAlta} onClose={() => setModalAlta(false)} title="👷 NUEVO CHOFER DE ÁRIDOS" width="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={() => setModalAlta(false)}>Cancelar</Button>
          <Button variant="primary" loading={creando} onClick={formAlta.handleSubmit(onAlta)}>✓ Dar de alta</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Input label="Nombre y apellido" placeholder="Naranjo, José"
            error={formAlta.formState.errors.nombre?.message}
            {...formAlta.register('nombre', { required: 'Poné el nombre' })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="DNI" placeholder="Opcional" {...formAlta.register('dni')} />
            <Input label="Teléfono" placeholder="Opcional" {...formAlta.register('tel')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Controller name="jornal" control={formAlta.control} render={({ field }) => (
              <InputMonto label="Jornal (por día)" placeholder="Se puede cargar después"
                value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            )} />
            <Input label="Rige desde" type="date" {...formAlta.register('jornal_desde')} />
          </div>
          <Input label="Observaciones" placeholder="Notas…" {...formAlta.register('obs')} />
        </div>
      </Modal>

      {/* Jornal: historial + versión nueva */}
      <Modal open={jornalDe != null} onClose={() => setJornalDe(null)}
        title={`💲 JORNAL DE ${(jornalDe?.nombre ?? '').toUpperCase()}`} width="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={() => setJornalDe(null)}>Cerrar</Button>
          <Button variant="primary" loading={guardandoJornal} onClick={formJornal.handleSubmit(onJornal)}>
            ✓ Guardar jornal nuevo
          </Button>
        </>}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Controller name="jornal" control={formJornal.control} rules={{ required: true }} render={({ field }) => (
              <InputMonto label="Jornal nuevo" placeholder="Lo que vale el día"
                value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            )} />
            <Input label="Rige desde" type="date" {...formJornal.register('vigente_desde', { required: true })} />
          </div>
          <Input label="Motivo" placeholder="Aumento de marzo…" {...formJornal.register('obs')} />
          <p className="text-[11px] text-gris-dark">
            El jornal nuevo no toca los días ya cargados: cada día guarda el valor que regía cuando se marcó,
            así que subirlo no recalcula meses ya pagados.
          </p>

          {jornales.length > 0 && (
            <div>
              <p className="text-xs font-bold text-carbon uppercase tracking-wide mb-1">Historial</p>
              <table className="w-full border-collapse">
                <tbody>
                  {jornales.map(j => (
                    <tr key={j.id} className="border-b border-gris last:border-0">
                      <td className="py-1.5 text-sm text-carbon">Desde {fmtDate(j.vigente_desde)}</td>
                      <td className="py-1.5 text-sm text-right font-mono text-carbon">{fmtPlata(j.jornal)}</td>
                      <td className="py-1.5 text-xs text-gris-dark text-right pl-3">{j.obs || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Carga de días */}
      <Modal open={modalDia} onClose={() => setModalDia(false)} title="📅 CARGAR DÍA TRABAJADO" width="max-w-lg"
        footer={<>
          <Button variant="secondary" onClick={() => setModalDia(false)}>Cerrar</Button>
          <Button variant="primary" loading={marcando} onClick={formDia.handleSubmit(onDia)}>✓ Cargar día</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Select label="Chofer" options={opcionesChofer}
            error={formDia.formState.errors.chofer_id?.message}
            {...formDia.register('chofer_id', { required: 'Elegí el chofer' })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Fecha" type="date" {...formDia.register('fecha', { required: true })} />
            <Select label="Camión" options={opcionesUnidad} {...formDia.register('unidad_id')} />
          </div>
          <Input label="Observaciones" placeholder="Notas…" {...formDia.register('obs')} />
          <p className="text-[11px] text-gris-dark">
            El modal queda abierto después de guardar, con el chofer y el camión puestos: se cargan varios
            días seguidos cambiando solo la fecha.
          </p>
        </div>
      </Modal>
    </div>
  )
}
