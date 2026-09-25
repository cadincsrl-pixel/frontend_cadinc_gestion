'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { TesConcepto } from '@/types/contabilidad.types'
import { useConceptosFondos, useGuardarConceptoFondos } from '../hooks/useContabilidad'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { SENTIDOS_CONCEPTO, esDepositoDeValores, sentidoLabel } from '../utils/fondos'
import { Aviso, Cargando, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'

/**
 * Los conceptos de los movimientos de fondos (comisiones, impuesto al cheque,
 * VEP, sueldos…). ABM en línea: cada fila se edita en su lugar. No se borran:
 * se dan de baja (siguen en los movimientos viejos). La cuenta contable de
 * cada concepto se elige en Mapeos › «Movimientos de fondos por concepto».
 */

const schema = z.object({
  nombre:  z.string().trim().min(2, 'Al menos 2 caracteres').max(80, 'Hasta 80 caracteres'),
  sentido: z.enum(['ingreso', 'egreso', 'ambos']),
  orden:   z.string().refine(v => v.trim() === '' || /^\d{1,4}$/.test(v.trim()), 'Un número de 0 a 9999'),
  obs:     z.string().max(500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>

const CAMPOS: ReadonlySet<string> = new Set(['nombre', 'sentido', 'orden', 'obs'])
const MAPEAR = '/contabilidad?tab=mapeos&clave=fondos.concepto'

export function ConceptosFondosView() {
  const { puedeCrear, puedeEditar, movimientosFondos } = usePermisos('contabilidad')
  const [inactivos, setInactivos] = useState(false)
  const q = useConceptosFondos(true)
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)

  const sinFlag = !movimientosFondos ? 'No tenés permiso (hace falta «Movimientos de fondos»)' : null
  const bloqueoCrear = sinFlag ?? (!puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null)
  const bloqueoEditar = sinFlag ?? (!puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null)

  const todos = q.data ?? []
  const items = [...todos]
    .filter(c => inactivos || c.activo)
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  const sinMapear = todos.filter(c => c.activo && !c.cuenta_id).length

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-wrap gap-3 items-center">
        <p className="text-xs text-gris-dark flex-1 min-w-[260px]">
          Cada concepto va con una cuenta contable, que se elige en{' '}
          <Link href={MAPEAR} className="text-azul underline font-semibold">Mapeos › Movimientos de fondos por concepto</Link>.
          Sin cuenta, el movimiento se guarda igual pero queda pendiente al contabilizar.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
          <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
          Mostrar dados de baja
        </label>
        <Button size="sm" onClick={() => { setNuevo(true); setEditando(null) }} disabled={!!bloqueoCrear || nuevo}
          title={bloqueoCrear ?? 'Agregar un concepto'}>
          + Nuevo concepto
        </Button>
      </Tarjeta>

      {sinMapear > 0 && (
        <Aviso tono="naranja">
          {sinMapear} concepto{sinMapear === 1 ? '' : 's'} activo{sinMapear === 1 ? '' : 's'} sin cuenta contable.{' '}
          <Link href={MAPEAR} className="underline font-semibold">Mapear</Link>
        </Aviso>
      )}

      {q.isLoading ? <Cargando />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : (
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr><Th>Orden</Th><Th>Concepto</Th><Th>Sentido</Th><Th>Cuenta contable</Th><Th derecha>En uso</Th><Th>Observación</Th><Th /></tr>
                </thead>
                <tbody>
                  {nuevo && <FilaEdicion concepto={null} onListo={() => setNuevo(false)} />}
                  {items.map(c => editando === c.id
                    ? <FilaEdicion key={c.id} concepto={c} onListo={() => setEditando(null)} />
                    : <FilaLectura key={c.id} c={c} bloqueo={bloqueoEditar} onEditar={() => { setEditando(c.id); setNuevo(false) }} />)}
                </tbody>
              </table>
            </div>
            {items.length === 0 && !nuevo && (
              <div className="p-3"><Vacio>{todos.length === 0 ? 'No hay conceptos cargados.' : 'No hay conceptos activos.'}</Vacio></div>
            )}
          </Tarjeta>
        )}
    </div>
  )
}

function FilaLectura({ c, bloqueo, onEditar }: { c: TesConcepto; bloqueo: string | null; onEditar: () => void }) {
  const toast = useToast()
  const guardar = useGuardarConceptoFondos()

  async function alternarActivo() {
    try {
      await guardar.mutateAsync({ id: c.id, nombre: c.nombre, sentido: c.sentido, orden: c.orden, obs: c.obs, activo: !c.activo })
      toast(c.activo ? `✓ «${c.nombre}» dado de baja` : `✓ «${c.nombre}» reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <tr className={`border-t border-gris ${c.activo ? '' : 'opacity-60'}`}>
      <td className="px-3 py-2 text-xs tabular-nums text-gris-dark">{c.orden}</td>
      <td className="px-3 py-2 text-sm">
        {c.nombre}
        {!c.activo && <span className="ml-1 text-[10px] px-1 rounded bg-gris text-gris-dark font-bold uppercase">baja</span>}
        {esDepositoDeValores(c.nombre) && (
          <span className="block text-[10px] text-gris-dark">Mejor como transferencia desde «Valores a depositar»; como ingreso, mapealo a 1.1.1.01.06.</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">{sentidoLabel(c.sentido)}</td>
      <td className="px-3 py-2 text-xs">
        {c.cuenta_id
          ? <><span className="font-mono">{c.cuenta_codigo}</span> {c.cuenta_nombre}</>
          : <Link href={MAPEAR} className="text-naranja-dark font-semibold underline">sin cuenta · Mapear</Link>}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums">{c.en_uso}</td>
      <td className="px-3 py-2 text-xs text-gris-dark max-w-[220px] truncate" title={c.obs}>{c.obs || '—'}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button type="button" disabled={!!bloqueo} title={bloqueo ?? 'Editar'} onClick={onEditar}
          className="text-xs px-2 py-1 rounded text-azul hover:bg-azul-light font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Editar</button>
        <button type="button" disabled={!!bloqueo || guardar.isPending} onClick={() => void alternarActivo()}
          title={bloqueo ?? (c.activo ? 'Dar de baja: deja de ofrecerse al cargar movimientos (los viejos no cambian)' : 'Reactivar')}
          className="text-xs px-2 py-1 rounded text-gris-dark hover:bg-gris font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          {c.activo ? 'Baja' : 'Alta'}
        </button>
      </td>
    </tr>
  )
}

function FilaEdicion({ concepto, onListo }: { concepto: TesConcepto | null; onListo: () => void }) {
  const toast = useToast()
  const guardar = useGuardarConceptoFondos()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: concepto
      ? { nombre: concepto.nombre, sentido: concepto.sentido, orden: String(concepto.orden), obs: concepto.obs ?? '' }
      : { nombre: '', sentido: 'egreso', orden: '', obs: '' },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    try {
      await guardar.mutateAsync({
        id: concepto?.id ?? null, nombre: d.nombre.trim(), sentido: d.sentido, obs: d.obs.trim(),
        ...(d.orden.trim() ? { orden: Number(d.orden) } : {}),
        ...(concepto ? { activo: concepto.activo } : {}),
      })
      toast(concepto ? '✓ Concepto guardado' : '✓ Concepto creado: elegile la cuenta en Mapeos', 'ok')
      onListo()
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce && CAMPOS.has(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  const err = errors.nombre?.message ?? errors.orden?.message ?? errors.obs?.message ?? errorServer
  return (
    <tr className="border-t border-gris bg-amarillo-light/40 align-top">
      <td className="px-3 py-2"><input {...register('orden')} inputMode="numeric" maxLength={4} className={`${inputCls} w-16`} /></td>
      <td className="px-3 py-2">
        <input {...register('nombre')} maxLength={80} autoFocus placeholder="Ej.: Comisiones bancarias" className={inputCls} />
        {err && <span className="block text-xs text-rojo font-semibold mt-0.5">{err}</span>}
      </td>
      <td className="px-3 py-2">
        <select {...register('sentido')} className={inputCls}>
          {SENTIDOS_CONCEPTO.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-gris-dark">{concepto?.cuenta_codigo ? <span className="font-mono">{concepto.cuenta_codigo}</span> : 'se elige en Mapeos'}</td>
      <td className="px-3 py-2 text-xs text-right tabular-nums">{concepto?.en_uso ?? 0}</td>
      <td className="px-3 py-2"><input {...register('obs')} maxLength={500} className={inputCls} /></td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={onListo} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>{concepto ? 'Guardar' : 'Crear'}</Button>
      </td>
    </tr>
  )
}
