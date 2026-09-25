'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { JurisdiccionSelect } from '@/components/JurisdiccionSelect'
import { usePermisos } from '@/hooks/usePermisos'
import type { ImpuestoRetencion, RetencionTipoVenta, RetencionTipoVentaInput } from '@/types/config.types'
import {
  useConfigVentasValores, useCrearRetencionTipo, useEditarRetencionTipo, useGuardarConfigVentas, useRetencionTipos,
} from '../../hooks/useConfigVentas'
import { errorDeCampoFacturacion, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'

const IMPUESTO_LABEL: Record<ImpuestoRetencion, string> = {
  iva: 'IVA', ganancias: 'Ganancias', iibb: 'Ingresos Brutos', suss: 'SUSS', municipal: 'Municipal', otro: 'Otro',
}
const IMPUESTOS: ImpuestoRetencion[] = ['iibb', 'municipal', 'ganancias', 'suss', 'otro', 'iva']

/**
 * Ventas › Configuración › Retenciones sufridas (20260929g). Los tipos que se
 * eligen al cargar un cobro, con su jurisdicción por defecto, y cuál propone
 * el cobro. Los 6 de siempre son «del sistema»: no cambian clave ni impuesto.
 * La retención de IVA es una sola (la leen el Libro IVA y el asiento mensual).
 * No se borran: se dan de baja. Escribir pide el flag `configurar`.
 */
export function RetencionTiposCard() {
  const toast = useToast()
  const { configurar } = usePermisos('facturacion')
  const [inactivos, setInactivos] = useState(false)
  const [editando, setEditando] = useState<{ open: boolean; tipo?: RetencionTipoVenta }>({ open: false })
  const lista = useRetencionTipos(true)
  const cfg = useConfigVentasValores()
  const guardarCfg = useGuardarConfigVentas()
  const editar = useEditarRetencionTipo()
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const bloqueado = !configurar || lista.respaldo

  const visibles = lista.tipos.filter(t => inactivos || t.activo)
  const porDefecto = cfg.valores.retencion_tipo_default

  async function cambiarActivo(t: RetencionTipoVenta) {
    try {
      await editar.mutateAsync({ clave: t.clave, activo: !t.activo })
      toast(t.activo ? `${t.corto} dado de baja` : `✓ ${t.corto} reactivado`, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  async function cambiarDefault(clave: string) {
    try {
      await guardarCfg.mutateAsync({ retencion_tipo_default: clave })
      toast(`✓ El cobro propone ${lista.tipos.find(t => t.clave === clave)?.corto ?? clave}`, 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Retenciones sufridas</div>
          <div className="text-[11px] text-gris-dark">
            Los tipos que se eligen al cargar un cobro (el certificado que manda el cliente) y su jurisdicción por defecto.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gris-dark cursor-pointer select-none">
            <input type="checkbox" className="accent-naranja" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
            Dados de baja
          </label>
          <Button size="sm" variant="secondary" disabled={bloqueado} title={tip ?? 'Cargar un tipo de retención nuevo'}
            onClick={() => setEditando({ open: true })}>+ Tipo</Button>
        </div>
      </div>

      {lista.respaldo && (
        <Aviso tono="naranja">
          El servidor todavía no tiene el catálogo de retenciones: se muestran las de siempre y no se pueden editar.
        </Aviso>
      )}
      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}

      {!lista.respaldo && !cfg.respaldo && (
        <div className="flex items-center gap-2 text-xs flex-wrap" title={tip}>
          <span className="text-gris-dark">El cobro propone:</span>
          <select value={porDefecto} disabled={!configurar || guardarCfg.isPending}
            className="px-2 py-1 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja disabled:bg-gris"
            onChange={e => void cambiarDefault(e.target.value)}>
            {lista.tipos.filter(t => t.activo || t.clave === porDefecto).map(t => (
              <option key={t.clave} value={t.clave}>{t.corto} · {t.nombre}</option>
            ))}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gris-dark border-b border-gris">
              <th className="py-1.5 pr-2">Tipo</th>
              <th className="py-1.5 pr-2">Impuesto</th>
              <th className="py-1.5 pr-2">Jurisdicción por defecto</th>
              <th className="py-1.5 pr-2 text-right">Retenciones</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gris">
            {visibles.map(t => (
              <tr key={t.clave} className={t.activo ? '' : 'opacity-60'}>
                <td className="py-2 pr-2 align-top">
                  <div className="font-semibold">
                    {t.corto}
                    {t.clave === porDefecto && !lista.respaldo && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-azul-light text-azul font-bold">por defecto</span>
                    )}
                    {t.sistema && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold" title="Uno de los de siempre: la clave y el impuesto no cambian">sistema</span>}
                    {!t.activo && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gris text-gris-dark font-bold">dado de baja</span>}
                    {!t.mapeado && !lista.respaldo && (
                      <Link href="/contabilidad?tab=mapeos"
                        title="Sin cuenta contable: sus cobros quedan pendientes de contabilizar. Mapealo en Contabilidad › Mapeos (Retenciones sufridas)."
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-naranja-light text-naranja-dark font-bold hover:underline">
                        sin mapeo contable
                      </Link>
                    )}
                  </div>
                  <div className="text-[11px] text-gris-dark">{t.nombre} · clave <span className="font-mono">{t.clave}</span></div>
                </td>
                <td className="py-2 pr-2 align-top text-xs">{IMPUESTO_LABEL[t.impuesto]}</td>
                <td className="py-2 pr-2 align-top text-xs">
                  {t.pide_jurisdiccion ? (t.jurisdiccion_default_nombre ?? 'la eligen al cargar') : <span className="text-gris-dark">no lleva</span>}
                </td>
                <td className="py-2 pr-2 align-top text-right font-mono">{lista.respaldo ? '—' : t.retenciones}</td>
                <td className="py-2 align-top">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Editar'}
                      onClick={() => setEditando({ open: true, tipo: t })}>✏️ Editar</Button>
                    <Button variant="ghost" size="sm"
                      disabled={bloqueado || (t.activo && t.clave === porDefecto)}
                      title={tip ?? (t.activo && t.clave === porDefecto
                        ? 'Es el que propone el cobro: elegí otro por defecto primero'
                        : t.activo ? 'Dar de baja: no se ofrece más en cobros nuevos' : 'Reactivar')}
                      loading={editar.isPending && editar.variables?.clave === t.clave && editar.variables?.activo !== undefined}
                      onClick={() => cambiarActivo(t)}>
                      {t.activo ? 'Dar de baja' : 'Reactivar'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!lista.isLoading && visibles.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-sm text-gris-dark italic">No hay tipos de retención.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lista.error && !lista.respaldo && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}
      {editando.open && <ModalRetencionTipo tipo={editando.tipo} onClose={() => setEditando({ open: false })} />}
    </div>
  )
}

const schema = z.object({
  clave:             z.string().refine(v => v.trim() === '' || /^[a-z][a-z0-9_]{1,29}$/.test(v.trim()), 'Minúsculas, números y _, de 2 a 30 (empieza con letra)'),
  nombre:            z.string().refine(v => v.trim().length >= 2 && v.trim().length <= 80, 'Entre 2 y 80 caracteres'),
  corto:             z.string().refine(v => v.trim().length >= 1 && v.trim().length <= 20, 'Hasta 20 caracteres'),
  impuesto:          z.enum(['iva', 'ganancias', 'iibb', 'suss', 'municipal', 'otro']),
  pide_jurisdiccion: z.boolean(),
  jurisdiccion_default_id: z.number().nullable(),
  orden:             z.string().refine(v => v === '' || /^\d{1,4}$/.test(v), 'Número de 0 a 9999'),
})
type FormData = z.infer<typeof schema>
const CAMPOS: Array<keyof FormData> = ['clave', 'nombre', 'corto', 'impuesto', 'pide_jurisdiccion', 'jurisdiccion_default_id', 'orden']

function ModalRetencionTipo({ tipo, onClose }: { tipo?: RetencionTipoVenta; onClose: () => void }) {
  const toast = useToast()
  const crear = useCrearRetencionTipo()
  const editar = useEditarRetencionTipo()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [jurNombre, setJurNombre] = useState(tipo?.jurisdiccion_default_nombre ?? '')
  const { register, handleSubmit, setError, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clave:             tipo?.clave ?? '',
      nombre:            tipo?.nombre ?? '',
      corto:             tipo?.corto ?? '',
      impuesto:          tipo?.impuesto ?? 'otro',
      pide_jurisdiccion: tipo?.pide_jurisdiccion ?? false,
      jurisdiccion_default_id: tipo?.jurisdiccion_default_id ?? null,
      orden:             tipo ? String(tipo.orden) : '',
    },
  })
  const pide = useWatch({ control, name: 'pide_jurisdiccion' })
  const guardando = crear.isPending || editar.isPending
  const esIva = tipo?.impuesto === 'iva'
  const impuestoFijo = !!tipo?.sistema

  async function guardar(d: FormData) {
    setErrorServer(null)
    const body: RetencionTipoVentaInput = {
      nombre:            d.nombre.trim().replace(/\s+/g, ' '),
      corto:             d.corto.trim().replace(/\s+/g, ' '),
      pide_jurisdiccion: d.pide_jurisdiccion,
      jurisdiccion_default_id: d.pide_jurisdiccion ? d.jurisdiccion_default_id : null,
      ...(impuestoFijo ? {} : { impuesto: d.impuesto }),
      ...(d.orden !== '' ? { orden: Number(d.orden) } : {}),
    }
    try {
      if (tipo) await editar.mutateAsync({ clave: tipo.clave, ...body })
      else await crear.mutateAsync({ ...body, ...(d.clave.trim() ? { clave: d.clave.trim() } : {}) })
      toast(tipo ? '✓ Tipo de retención actualizado' : '✓ Tipo de retención cargado', 'ok')
      onClose()
    } catch (e) {
      const ce = errorDeCampoFacturacion(e)
      if (ce && (CAMPOS as string[]).includes(ce.campo)) {
        setError(ce.campo as keyof FormData, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={guardando ? () => {} : onClose} width="max-w-lg"
      title={tipo ? `Editar ${tipo.corto}` : 'Nuevo tipo de retención'}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" loading={guardando} onClick={handleSubmit(guardar)}>{tipo ? 'Guardar' : 'Cargar tipo'}</Button>
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Nombre corto" {...register('corto')} error={errors.corto?.message} placeholder="Sellos" autoFocus
            hint="Así sale en el cobro y en el recibo." />
          <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Impuesto de Sellos" />
        </div>
        {!tipo && (
          <Input label="Clave (opcional)" {...register('clave')} error={errors.clave?.message} placeholder="sellos"
            hint="La que guarda cada retención y usan los mapeos contables. Vacía = sale del nombre corto. No se cambia después." />
        )}
        <Select label="Impuesto" {...register('impuesto')} error={errors.impuesto?.message} disabled={impuestoFijo}
          title={impuestoFijo ? 'Es uno de los de siempre: el impuesto no cambia' : undefined}
          options={IMPUESTOS.filter(i => i !== 'iva' || esIva).map(i => ({ value: i, label: IMPUESTO_LABEL[i] }))} />
        {!esIva && (
          <div className="text-[11px] text-gris-dark -mt-2">La retención de IVA es una sola (la leen el Libro IVA y el asiento mensual): no se ofrece para tipos nuevos.</div>
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="accent-naranja" {...register('pide_jurisdiccion')} />
          Lleva jurisdicción (provincia o municipio)
        </label>
        {pide && (
          <Controller control={control} name="jurisdiccion_default_id" render={({ field }) => (
            <JurisdiccionSelect label="Jurisdicción por defecto" placeholder="Opcional"
              value={{ id: field.value, nombre: jurNombre }}
              onChange={v => { field.onChange(v.id); setJurNombre(v.nombre) }} />
          )} />
        )}
        <Input label="Orden (opcional)" {...register('orden')} error={errors.orden?.message} inputMode="numeric"
          hint="Más chico = más arriba en la lista del cobro." />
        {!tipo && (
          <Aviso tono="gris">
            Un tipo nuevo necesita su cuenta en Contabilidad › Mapeos (Retenciones sufridas): hasta entonces sus cobros quedan pendientes de contabilizar.
          </Aviso>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
