'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { ClaveParametroVenta, ParametroVenta } from '@/types/config.types'
import { useBorrarParametroVenta, useCrearParametroVenta, useParametrosVenta } from '../../hooks/useConfigVentas'
import {
  MONTO_MINIMO_FCE, PARAMETROS_VENTA, TOPE_CF_IDENTIFICACION, fmtFecha, fmtM, hoyAR,
} from '../../utils/facturacion.utils'
import { codigoErrorFacturacion, errorDeCampoFacturacion, mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { Aviso } from '../FichaFactura'

const CLAVES: ClaveParametroVenta[] = ['monto_minimo_fce', 'tope_cf_identificacion']
const RESPALDO: Record<ClaveParametroVenta, number> = {
  monto_minimo_fce: MONTO_MINIMO_FCE,
  tope_cf_identificacion: TOPE_CF_IDENTIFICACION,
}

/**
 * Ventas › Configuración › Montos de ARCA (20260929e). El monto mínimo de la
 * FCE MiPyME y el tope para identificar al consumidor final, cada uno con su
 * fecha de vigencia: rige el valor vigente a la FECHA DE LA FACTURA. No se
 * editan: un valor nuevo es una vigencia nueva; solo se borra una que todavía
 * no empezó. Escribir pide el flag `configurar`.
 */
export function ParametrosCard() {
  const { configurar } = usePermisos('facturacion')
  const lista = useParametrosVenta()
  const [nuevo, setNuevo] = useState<ClaveParametroVenta | null>(null)
  const tip = configurar ? undefined : 'Necesitás el permiso «Configurar» de Ventas'
  const bloqueado = !configurar || lista.respaldo

  return (
    <div className="bg-white rounded-card shadow-card p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-bold">Montos de ARCA</div>
        <div className="text-[11px] text-gris-dark">
          Cada factura usa el valor vigente a su fecha. Cuando ARCA publica un monto nuevo, cargalo desde el día en que rige:
          el anterior queda en el historial.
        </div>
      </div>

      {lista.respaldo && (
        <Aviso tono="naranja">
          El servidor todavía no tiene los montos editables: se usan {fmtM(MONTO_MINIMO_FCE)} (FCE) y {fmtM(TOPE_CF_IDENTIFICACION)} (consumidor final).
        </Aviso>
      )}
      {lista.isLoading && <div className="py-3 text-sm text-gris-dark">Cargando…</div>}
      {lista.error && <Aviso tono="rojo">{mensajeErrorFacturacion(lista.error)}</Aviso>}

      {!lista.isLoading && !lista.error && (
        <div className="grid gap-3 md:grid-cols-2">
          {CLAVES.map(clave => (
            <ParametroBloque key={clave} clave={clave} filas={lista.parametros.filter(p => p.clave === clave)}
              bloqueado={bloqueado} tip={tip} respaldo={lista.respaldo} onNuevo={() => setNuevo(clave)} />
          ))}
        </div>
      )}
      {nuevo && <ModalParametro clave={nuevo} onClose={() => setNuevo(null)} />}
    </div>
  )
}

function ParametroBloque({ clave, filas, bloqueado, tip, respaldo, onNuevo }: {
  clave: ClaveParametroVenta
  filas: ParametroVenta[]
  bloqueado: boolean
  tip?: string
  respaldo: boolean
  onNuevo: () => void
}) {
  const toast = useToast()
  const borrar = useBorrarParametroVenta()
  const [historial, setHistorial] = useState(false)
  const [confirmar, setConfirmar] = useState<number | null>(null)
  const meta = PARAMETROS_VENTA[clave]
  const vigente = filas.find(f => f.estado === 'vigente')
  const futuros = filas.filter(f => f.estado === 'futuro').sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
  const historicos = filas.filter(f => f.estado === 'historico')

  async function borrarFila(f: ParametroVenta) {
    if (confirmar !== f.id) { setConfirmar(f.id); return }
    try {
      await borrar.mutateAsync(f.id)
      toast('Vigencia borrada', 'ok')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    } finally {
      setConfirmar(null)
    }
  }

  return (
    <div className="border border-gris rounded p-3 flex flex-col gap-2">
      <div>
        <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">{meta.label}</div>
        <div className="text-2xl font-bold font-mono mt-0.5">{fmtM(vigente?.valor ?? RESPALDO[clave])}</div>
        <div className="text-[11px] text-gris-dark">
          {vigente
            ? <>Vigente desde el {fmtFecha(vigente.vigente_desde)}{vigente.fuente ? ` · ${vigente.fuente}` : ''}</>
            : respaldo ? 'Valor fijo del servidor' : 'Sin valor cargado'}
        </div>
        <div className="text-[11px] text-gris-dark mt-1">{meta.ayuda}</div>
      </div>

      {futuros.map(f => (
        <div key={f.id} className="flex items-center justify-between gap-2 bg-naranja-light rounded px-2 py-1.5 text-xs text-naranja-dark">
          <span>
            Desde el <b>{fmtFecha(f.vigente_desde)}</b> pasa a <b className="font-mono">{fmtM(f.valor)}</b>
            {f.fuente ? ` · ${f.fuente}` : ''}
          </span>
          <Button variant="ghost" size="sm" disabled={bloqueado} title={tip ?? 'Todavía no rige: se puede borrar'}
            loading={borrar.isPending && borrar.variables === f.id}
            onClick={() => borrarFila(f)} onBlur={() => setConfirmar(null)}>
            {confirmar === f.id ? '¿Borrar?' : 'Borrar'}
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button size="sm" variant="secondary" disabled={bloqueado} title={tip ?? 'Cargar el valor que rige desde una fecha'}
          onClick={onNuevo}>Nuevo valor desde…</Button>
        {historicos.length > 0 && (
          <button type="button" className="text-[11px] text-azul hover:underline" onClick={() => setHistorial(h => !h)}>
            {historial ? 'Ocultar historial' : `Ver historial (${historicos.length})`}
          </button>
        )}
      </div>

      {historial && historicos.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gris-dark border-b border-gris">
              <th className="py-1 pr-2">Desde</th>
              <th className="py-1 pr-2 text-right">Valor</th>
              <th className="py-1">Fuente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gris">
            {historicos.map(f => (
              <tr key={f.id} title={f.obs || undefined}>
                <td className="py-1 pr-2 whitespace-nowrap">{fmtFecha(f.vigente_desde)}</td>
                <td className="py-1 pr-2 text-right font-mono">{fmtM(f.valor)}</td>
                <td className="py-1">{f.fuente || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const schema = z.object({
  valor:         z.string().refine(v => Number(v) > 0, 'Poné un monto mayor que cero'),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha'),
  fuente:        z.string().max(120, 'Hasta 120 caracteres'),
  obs:           z.string().max(500, 'Hasta 500 caracteres'),
})
type FormData = z.infer<typeof schema>
const CAMPOS: ReadonlyArray<keyof FormData> = ['valor', 'vigente_desde', 'fuente', 'obs']

function ModalParametro({ clave, onClose }: { clave: ClaveParametroVenta; onClose: () => void }) {
  const toast = useToast()
  const crear = useCrearParametroVenta()
  const [errorServer, setErrorServer] = useState<string | null>(null)
  /** Hay facturas autorizadas desde esa fecha: se pide confirmar. */
  const [retroactivo, setRetroactivo] = useState<string | null>(null)
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { valor: '', vigente_desde: hoyAR(), fuente: '', obs: '' },
  })
  const desde = useWatch({ control, name: 'vigente_desde' })
  const pasada = !!desde && desde < hoyAR()
  const meta = PARAMETROS_VENTA[clave]

  async function guardar(d: FormData, forzar = false) {
    setErrorServer(null)
    try {
      await crear.mutateAsync({
        clave,
        valor: Number(d.valor),
        vigente_desde: d.vigente_desde,
        fuente: d.fuente.trim(),
        obs: d.obs.trim(),
        ...(forzar ? { forzar: true } : {}),
      })
      toast('✓ Valor cargado', 'ok')
      onClose()
    } catch (e) {
      if (codigoErrorFacturacion(e) === 'PARAMETRO_RETROACTIVO') {
        setRetroactivo(mensajeErrorFacturacion(e))
        return
      }
      const ce = errorDeCampoFacturacion(e)
      const campo = CAMPOS.find(c => c === ce?.campo)
      if (ce && campo) {
        setError(campo, { message: ce.mensaje })
        return
      }
      setErrorServer(mensajeErrorFacturacion(e))
    }
  }

  return (
    <Modal open onClose={crear.isPending ? () => {} : onClose} width="max-w-lg" title={`Nuevo valor: ${meta.label.toLowerCase()}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
          {retroactivo
            ? <Button size="sm" loading={crear.isPending} onClick={handleSubmit(d => guardar(d, true))}>Guardar igual</Button>
            : <Button size="sm" loading={crear.isPending} onClick={handleSubmit(d => guardar(d))}>Guardar</Button>}
        </div>
      }>
      <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
        <Controller name="valor" control={control} render={({ field }) => (
          <InputMonto label="Monto ($)" value={field.value} onChange={v => { setRetroactivo(null); field.onChange(v) }}
            onBlur={field.onBlur} error={errors.valor?.message} autoFocus />
        )} />
        <Input label="Vigente desde" type="date" {...register('vigente_desde', { onChange: () => setRetroactivo(null) })}
          error={errors.vigente_desde?.message} hint="Las facturas con fecha desde ese día usan este valor." />
        <Input label="Fuente (opcional)" {...register('fuente')} error={errors.fuente?.message}
          placeholder="RG ARCA 5700/2025" hint="La norma o la publicación de ARCA, para saber de dónde salió." />
        <Input label="Observación (opcional)" {...register('obs')} error={errors.obs?.message} />
        {pasada && !retroactivo && (
          <Aviso tono="amarillo">
            Es una fecha pasada: el valor nuevo rige para los borradores con fecha desde ese día.
            Las facturas ya autorizadas no cambian.
          </Aviso>
        )}
        {retroactivo && (
          <Aviso tono="naranja">
            {retroactivo} ¿Guardarlo igual?
          </Aviso>
        )}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </form>
    </Modal>
  )
}
