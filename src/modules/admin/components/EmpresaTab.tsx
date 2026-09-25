'use client'

import { useEffect } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { HttpError } from '@/lib/api/client'
import { usePermisos } from '@/hooks/usePermisos'
import { useEmpresa, useGuardarEmpresa } from '@/hooks/useEmpresa'
import { useAuditLog } from '../hooks/useAudit'
import { derivarDomicilios, fechaDdMmYyyy } from '@/lib/config/empresa'
import type { EmpresaApi, EmpresaEditable } from '@/types/config.types'

/**
 * Admin › Datos de la empresa (tanda 6, 20260929a).
 *
 * Lo que se imprime en la factura de venta, la orden de pago y los demás
 * documentos. El CUIT NO se edita: va atado al certificado de ARCA. Guardar
 * pide el flag `admin.configurar` (el admin lo tiene por bypass).
 */

const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

const txt = (max: number, min = 0, msg?: string) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).min(min, msg ?? `Mínimo ${min} caracteres`)

const schema = z.object({
  razon_social:       txt(120, 3),
  nombre_fantasia:    txt(80, 2),
  condicion_iva:      txt(60, 3),
  iibb:               txt(30),
  inicio_actividades: z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= hoyIso()), 'Fecha inválida o futura'),
  domicilio_calle:    txt(120),
  calle_factura:      txt(120),
  localidad:          txt(80),
  provincia:          txt(60),
  codigo_postal:      txt(10),
  telefono:           txt(40),
  email:              z.union([z.literal(''), z.string().trim().email('No tiene forma de email').max(120)]),
})
type FormEmpresa = z.infer<typeof schema>
type Campo = keyof FormEmpresa

const CAMPOS: Campo[] = [
  'razon_social', 'nombre_fantasia', 'condicion_iva', 'iibb', 'inicio_actividades',
  'domicilio_calle', 'calle_factura', 'localidad', 'provincia', 'codigo_postal', 'telefono', 'email',
]

function aForm(d: EmpresaApi): FormEmpresa {
  return {
    razon_social: d.razon_social, nombre_fantasia: d.nombre_fantasia, condicion_iva: d.condicion_iva,
    iibb: d.iibb, inicio_actividades: d.inicio_actividades ?? '',
    domicilio_calle: d.domicilio_calle, calle_factura: d.calle_factura ?? '', localidad: d.localidad,
    provincia: d.provincia, codigo_postal: d.codigo_postal, telefono: d.telefono, email: d.email,
  }
}

function fmtFH(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function mensajeDeError(e: unknown): { texto: string; campo?: Campo } {
  if (e instanceof HttpError) {
    const b = (e.body ?? {}) as { error?: string; campo?: string }
    const campo = (CAMPOS as string[]).includes(b.campo ?? '') ? (b.campo as Campo) : undefined
    switch (b.error) {
      case 'SIN_PERMISO':      return { texto: 'No tenés el permiso «Configurar» de Admin.' }
      case 'SIN_TAB':          return { texto: 'No tenés la tab «Datos de la empresa» de Admin.' }
      case 'CUIT_NO_EDITABLE': return { texto: 'El CUIT no se puede cambiar desde acá.' }
      case 'EMPRESA_INVALIDA': return { texto: campo ? 'Revisá el dato marcado.' : 'Hay un dato inválido.', campo }
    }
    if (e.status === 404) return { texto: 'El servidor todavía no tiene esta función (falta desplegar el backend).' }
  }
  return { texto: e instanceof Error ? e.message : 'No se pudo guardar.' }
}

// ── Vista previa ────────────────────────────────────────────────────────────

function VistaPrevia({ control, cuitFmt }: { control: Control<FormEmpresa>; cuitFmt: string }) {
  const v = useWatch({ control }) as FormEmpresa
  const dom = derivarDomicilios({
    domicilio_calle: v.domicilio_calle ?? '', calle_factura: v.calle_factura ?? '',
    localidad: v.localidad ?? '', provincia: v.provincia ?? '', codigo_postal: v.codigo_postal ?? '',
  })
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Factura de venta</p>
        <div className="border border-gris-mid rounded-lg p-3 bg-white grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 font-sans">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-carbon break-words">{v.razon_social}</p>
            <p className="text-[11px] text-gris-dark mt-0.5 break-words">{dom.domicilioFactura1}</p>
            <p className="text-[11px] text-gris-dark break-words">{dom.domicilioFactura2}</p>
            <p className="text-[11px] text-gris-dark break-words">Tel. {v.telefono}</p>
            <p className="text-[11px] font-bold text-carbon mt-1 break-words">{v.condicion_iva}</p>
          </div>
          <div className="text-[11px] text-carbon grid grid-cols-[auto_1fr] gap-x-2 content-start">
            <span className="text-gris-dark">C.U.I.T.:</span><span>{cuitFmt}</span>
            <span className="text-gris-dark">Ing. Brutos:</span><span className="break-words">{v.iibb}</span>
            <span className="text-gris-dark">Inic. Act.:</span><span>{fechaDdMmYyyy(v.inicio_actividades)}</span>
          </div>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Orden de pago</p>
        <div className="border border-gris-mid rounded-lg p-3 bg-white">
          <p className="text-[15px] font-bold text-azul break-words">{v.nombre_fantasia}</p>
          {dom.domicilio && <p className="text-[11px] text-carbon break-words">{dom.domicilio}</p>}
          <p className="text-[11px] text-carbon break-words">{v.condicion_iva}&nbsp;&nbsp;&nbsp;CUIT {cuitFmt}</p>
        </div>
      </div>
    </div>
  )
}

// ── Historial ───────────────────────────────────────────────────────────────

function Historial() {
  const { data, isLoading, isError } = useAuditLog({ q: 'datos de la empresa', limit: 20 })
  if (isLoading) return <p className="text-xs text-gris-dark">Cargando…</p>
  if (isError) return <p className="text-xs text-gris-dark">No se pudo cargar el historial.</p>
  const items = (data?.items ?? []).filter(i => i.entidad === 'datos de la empresa')
  if (items.length === 0) return <p className="text-xs text-gris-dark">Todavía no hay cambios registrados.</p>
  return (
    <ul className="flex flex-col divide-y divide-gris">
      {items.map(i => (
        <li key={i.id} className="py-2 text-xs">
          <span className="font-bold text-carbon">{fmtFH(i.created_at)}</span>
          <span className="text-gris-dark"> · {i.user_nombre ?? 'sistema'} · {i.accion}</span>
          {i.detalle && <p className="text-gris-dark mt-0.5 break-words">{i.detalle}</p>}
        </li>
      ))}
    </ul>
  )
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export function EmpresaTab() {
  const { data, isLoading, isError } = useEmpresa()
  const guardar = useGuardarEmpresa()
  const toast = useToast()
  const { configurar, esAdmin } = usePermisos('admin')

  const form = useForm<FormEmpresa>({
    resolver: zodResolver(schema),
    defaultValues: data ? aForm(data) : undefined,
  })
  const { register, handleSubmit, reset, setError, formState: { errors, dirtyFields, isDirty } } = form

  // Al llegar (o volver a llegar tras guardar) los datos, el form arranca de ahí.
  useEffect(() => {
    if (data) reset(aForm(data))
  }, [data, reset])

  if (isLoading) return <div className="bg-white rounded-card shadow-card p-4 text-sm text-gris-dark">Cargando…</div>
  if (isError || data === undefined) {
    return <div className="bg-white rounded-card shadow-card p-4 text-sm text-rojo">No se pudieron leer los datos de la empresa.</div>
  }
  if (data === null) {
    return (
      <div className="bg-white rounded-card shadow-card p-4 text-sm text-gris-dark">
        El servidor todavía no tiene los Datos de la empresa (falta desplegar el backend). Los documentos siguen saliendo con los datos de siempre.
      </div>
    )
  }

  const onSubmit = handleSubmit(async (vals) => {
    const cambios: Partial<EmpresaEditable> = {}
    for (const k of CAMPOS) {
      if (!dirtyFields[k]) continue
      if (k === 'inicio_actividades') cambios.inicio_actividades = vals.inicio_actividades || null
      else (cambios as Record<string, string>)[k] = vals[k]
    }
    if (Object.keys(cambios).length === 0) return
    try {
      await guardar.mutateAsync(cambios)
      toast('Datos de la empresa guardados. En otras sesiones pueden tardar unos minutos en verse.', 'ok')
    } catch (e) {
      const m = mensajeDeError(e)
      if (m.campo) setError(m.campo, { message: 'Dato inválido' })
      toast(m.texto, 'err')
    }
  })

  const sinPermiso = !configurar
  const tooltip = sinPermiso ? 'Hace falta el permiso «Configurar» de Admin' : undefined

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-4 items-start">
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-4 min-w-0">
        <fieldset disabled={sinPermiso} className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <Input label="Razón social" {...register('razon_social')} error={errors.razon_social?.message}
            hint="Como se imprime en la factura" />
          <Input label="Nombre de fantasía" {...register('nombre_fantasia')} error={errors.nombre_fantasia?.message}
            hint="Encabezado de la OP, remitos, recibos y la app" />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">CUIT 🔒</label>
            <input value={data.cuit_fmt} readOnly disabled
              className="w-full px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm bg-gris text-carbon cursor-not-allowed"
              title="Lo define el certificado de ARCA; se cambia con soporte" />
            <span className="text-xs text-gris-dark">Lo define el certificado de ARCA; se cambia con soporte.</span>
            {!data.cuit_sistema.coincide && (
              <span className="text-xs text-rojo font-semibold">
                No coincide con el CUIT del sistema ({data.cuit_sistema.arca_cuit}). Avisá a soporte.
              </span>
            )}
          </div>
          <Input label="Condición IVA" {...register('condicion_iva')} error={errors.condicion_iva?.message} />
          <Input label="Ingresos Brutos" {...register('iibb')} error={errors.iibb?.message} />
          <Input label="Inicio de actividades" type="date" max={hoyIso()} {...register('inicio_actividades')}
            error={errors.inicio_actividades?.message} />
          <Input label="Calle y número" {...register('domicilio_calle')} error={errors.domicilio_calle?.message}
            hint="Ej.: Maipú 396, Dpto. 3" />
          <Input label="Calle en la factura" {...register('calle_factura')} error={errors.calle_factura?.message}
            hint="Solo si en la factura va distinto. Vacío = la de arriba" />
          <Input label="Localidad" {...register('localidad')} error={errors.localidad?.message} />
          <Input label="Provincia" {...register('provincia')} error={errors.provincia?.message} />
          <Input label="Código postal" {...register('codigo_postal')} error={errors.codigo_postal?.message} />
          <Input label="Teléfono" {...register('telefono')} error={errors.telefono?.message} />
          <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gris-dark">
            {data.updated_at ? `Última modificación: ${fmtFH(data.updated_at)}` : 'Sin modificaciones desde la carga inicial.'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!isDirty || guardar.isPending}
              onClick={() => reset(aForm(data))}>Descartar</Button>
            <span title={tooltip}>
              <Button type="submit" loading={guardar.isPending} disabled={sinPermiso || !isDirty}>Guardar</Button>
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <div className="bg-white rounded-card shadow-card p-4">
          <h2 className="font-bold text-azul text-sm mb-2">Vista previa</h2>
          <VistaPrevia control={form.control} cuitFmt={data.cuit_fmt} />
        </div>
        <div className="bg-white rounded-card shadow-card p-4">
          <h2 className="font-bold text-azul text-sm mb-2">Historial</h2>
          {esAdmin ? <Historial /> : <p className="text-xs text-gris-dark">El historial lo ve el admin (Admin › Auditoría).</p>}
        </div>
      </div>
    </form>
  )
}
