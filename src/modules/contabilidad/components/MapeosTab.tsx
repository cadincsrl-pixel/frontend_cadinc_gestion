'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbConfig, CtbMapeoClave, CtbMapeoInput } from '@/types/contabilidad.types'
import { useConfigCtb, useCuentas, useGuardarConfig, useGuardarMapeos, useMapeos } from '../hooks/useContabilidad'
import { auxiliarLabel, etiquetaSubclave, fmtFecha, rubroLabel } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, ErrorCarga, Tarjeta, Vacio, inputCls } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'

/**
 * Los mapeos del motor de asientos automáticos (fase 3): qué cuenta usa cada
 * concepto de compra, alícuota de IVA, tributo, medio de cobro, producto…
 *
 * Sin mapeo el motor NO inventa una cuenta: el comprobante queda «pendiente».
 * Cada clave acepta solo cuentas imputables y activas de ciertos rubros (y con
 * cierto auxiliar): el selector ya viene filtrado. «Guardar cambios» manda
 * solo lo que cambió. Acepta `?clave=` (el botón «Mapear» de Automáticos) y
 * lleva a esa sección.
 */

const k = (clave: string, sub: string) => `${clave}\u0000${sub}`

export function MapeosTab() {
  const toast = useToast()
  const sp = useSearchParams()
  const claveFoco = sp.get('clave')
  const { puedeEditar, editarMapeos, esAdmin } = usePermisos('contabilidad')
  const q = useMapeos()
  const cuentas = useCuentas({ incluirInactivas: true })
  const guardar = useGuardarMapeos()

  // clave+subclave → id de cuenta como string ('' = quitar el mapeo).
  const [cambios, setCambios] = useState<Map<string, string>>(new Map())
  const [errores, setErrores] = useState<Map<string, string>>(new Map())
  const [soloFaltan, setSoloFaltan] = useState(false)

  const bloqueo = !(editarMapeos || esAdmin) ? 'No tenés permiso (hace falta «Editar mapeos contables»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null

  // Llevar a la clave pedida desde «Mapear».
  useEffect(() => {
    if (!claveFoco || !q.data) return
    document.getElementById(`mapeo-${claveFoco}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [claveFoco, q.data])

  const pendientes: CtbMapeoInput[] = useMemo(() => {
    const out: CtbMapeoInput[] = []
    for (const c of q.data?.claves ?? []) {
      for (const s of c.subclaves) {
        const v = cambios.get(k(c.clave, s.subclave))
        if (v === undefined) continue
        const nuevo = v ? Number(v) : null
        if (nuevo !== s.cuenta_id) out.push({ clave: c.clave, subclave: s.subclave, cuenta_id: nuevo })
      }
    }
    return out
  }, [q.data, cambios])

  function cambiar(clave: string, sub: string, v: string) {
    setCambios(m => new Map(m).set(k(clave, sub), v))
    setErrores(m => { const n = new Map(m); n.delete(k(clave, sub)); return n })
  }

  async function enviar() {
    if (pendientes.length === 0) return
    try {
      await guardar.mutateAsync(pendientes)
      toast(`✓ ${pendientes.length} mapeo${pendientes.length === 1 ? '' : 's'} guardado${pendientes.length === 1 ? '' : 's'}`, 'ok')
      setCambios(new Map())
      setErrores(new Map())
    } catch (e) {
      // `mapeos.<i>.cuenta_id`: el índice es el del array que se mandó.
      const ce = errorDeCampoCtb(e)
      const m = ce?.campo.match(/^mapeos\.(\d+)\./)
      const fila = m ? pendientes[Number(m[1])] : undefined
      if (fila && ce) setErrores(new Map([[k(fila.clave, fila.subclave), ce.mensaje]]))
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  const planVacio = !cuentas.isLoading && (cuentas.data ?? []).length === 0
  const claves = q.data?.claves ?? []

  return (
    <div className="flex flex-col gap-3">
      {planVacio && (
        <Aviso tono="naranja">El plan de cuentas está vacío: importá el plan de Finnegans primero (Plan de cuentas › Importar).</Aviso>
      )}

      <PanelConfig bloqueo={bloqueo} />

      <Tarjeta className="p-3 flex flex-wrap gap-2 items-center sticky top-0 z-10">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-gris-dark">
          <input type="checkbox" className="accent-naranja" checked={soloFaltan} onChange={e => setSoloFaltan(e.target.checked)} />
          Solo las que faltan mapear
        </label>
        <span className="text-xs text-gris-dark ml-auto">
          {pendientes.length > 0 ? `${pendientes.length} cambio${pendientes.length === 1 ? '' : 's'} sin guardar` : 'Sin cambios'}
        </span>
        <Button variant="ghost" size="sm" disabled={pendientes.length === 0 || guardar.isPending}
          onClick={() => { setCambios(new Map()); setErrores(new Map()) }}>
          Descartar
        </Button>
        <Button size="sm" onClick={enviar} loading={guardar.isPending} disabled={!!bloqueo || pendientes.length === 0}
          title={bloqueo ?? (pendientes.length === 0 ? 'No hay cambios' : 'Guardar solo lo que cambió')}>
          Guardar cambios
        </Button>
      </Tarjeta>

      {q.isLoading ? <Cargando />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : claves.length === 0 ? <Vacio>No hay claves de mapeo.</Vacio>
        : claves.map(c => (
          <SeccionClave key={c.clave} c={c} foco={c.clave === claveFoco} soloFaltan={soloFaltan}
            valor={sub => cambios.get(k(c.clave, sub))} error={sub => errores.get(k(c.clave, sub))}
            onCambiar={(sub, v) => cambiar(c.clave, sub, v)} bloqueo={bloqueo} />
        ))}
    </div>
  )
}

function SeccionClave({ c, foco, soloFaltan, valor, error, onCambiar, bloqueo }: {
  c: CtbMapeoClave
  foco: boolean
  soloFaltan: boolean
  valor: (sub: string) => string | undefined
  error: (sub: string) => string | undefined
  onCambiar: (sub: string, v: string) => void
  bloqueo: string | null
}) {
  const subs = c.subclaves.filter(s => !soloFaltan || (valor(s.subclave) ?? (s.cuenta_id ? String(s.cuenta_id) : '')) === '')
  if (soloFaltan && subs.length === 0) return null
  const auxiliares = c.auxiliares.filter(a => a !== 'none')
  return (
    <Tarjeta className={`p-3 flex flex-col gap-2 scroll-mt-16 ${foco ? 'ring-2 ring-naranja' : ''}`}>
      <div id={`mapeo-${c.clave}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="font-bold text-azul">{c.etiqueta}</h3>
        <span className="text-[11px] text-gris-dark">
          Cuentas de {c.rubros.map(rubroLabel).join(' o ')}
          {auxiliares.length > 0 && ` · con auxiliar ${auxiliares.map(auxiliarLabel).join(' o ')}`}
          {c.auxiliares.includes('none') && auxiliares.length > 0 && ' (o sin auxiliar)'}
        </span>
      </div>
      {c.descripcion && <p className="text-xs text-gris-dark -mt-1">{c.descripcion}</p>}
      <div className="flex flex-col divide-y divide-gris">
        {subs.map(s => {
          const v = valor(s.subclave) ?? (s.cuenta_id ? String(s.cuenta_id) : '')
          const cambiado = valor(s.subclave) !== undefined && v !== (s.cuenta_id ? String(s.cuenta_id) : '')
          const err = error(s.subclave)
          const falta = !v && s.en_uso > 0
          return (
            <div key={s.subclave} className={`grid grid-cols-1 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] gap-2 items-center py-2 ${cambiado ? 'bg-amarillo-light/40' : ''}`}>
              <div className="text-sm">
                {s.etiqueta || etiquetaSubclave(c.clave, s.subclave) || 'General'}
                <span className={`block text-[10px] ${falta ? 'text-naranja-dark font-bold' : 'text-gris-dark'}`}>
                  {s.en_uso > 0 ? `${s.en_uso} comprobante${s.en_uso === 1 ? '' : 's'}` : 'sin uso'}{falta ? ' · falta la cuenta' : ''}
                </span>
              </div>
              <div>
                <SelectorCuenta value={v} rubros={c.rubros} auxiliares={c.auxiliares} disabled={!!bloqueo}
                  placeholder="Sin mapear" onChange={id => onCambiar(s.subclave, id)} />
                {err && <div className="text-xs text-rojo font-semibold mt-0.5">{err}</div>}
              </div>
              <Button variant="ghost" size="sm" disabled={!!bloqueo || !v} onClick={() => onCambiar(s.subclave, '')}
                title={bloqueo ?? (v ? 'Quitar el mapeo: el motor deja pendientes los comprobantes que lo usan' : 'No tiene mapeo')}>
                Quitar
              </Button>
            </div>
          )
        })}
      </div>
    </Tarjeta>
  )
}

// ── Configuración del motor ───────────────────────────────────────────

const configSchema = z.object({
  automaticos_desde:      z.string().min(1, 'Elegí la fecha').refine(v => v >= '2026-07-01', 'No puede ser anterior al 01/07/2026'),
  cvlp_modo:              z.enum(['neto_liquidado', 'bruto']),
  compras_fecha_contable: z.enum(['fecha', 'mes_iva']),
  // Tanda 5 (20260928n).
  iva_ddjj_arrastre:      z.boolean(),
  bu_frecuencia:          z.enum(['mensual', 'anual']),
  bu_criterio_alta:       z.enum(['completo', 'proporcional']),
  bu_corte_inicial:       z.string().min(1, 'Elegí la fecha'),
})
const CAMPOS_CONFIG = ['automaticos_desde', 'cvlp_modo', 'compras_fecha_contable', 'iva_ddjj_arrastre', 'bu_frecuencia', 'bu_criterio_alta', 'bu_corte_inicial'] as const
type ConfigForm = z.infer<typeof configSchema>

function PanelConfig({ bloqueo }: { bloqueo: string | null }) {
  const q = useConfigCtb()
  if (q.isLoading) return <Cargando texto="Cargando la configuración…" />
  if (q.isError || !q.data) return <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
  return <FormConfig key={JSON.stringify(q.data)} config={q.data} bloqueo={bloqueo} />
}

function FormConfig({ config, bloqueo }: { config: CtbConfig; bloqueo: string | null }) {
  const toast = useToast()
  const guardar = useGuardarConfig()
  const { register, handleSubmit, setError, formState: { errors, dirtyFields, isDirty } } = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      automaticos_desde: config.automaticos_desde, cvlp_modo: config.cvlp_modo, compras_fecha_contable: config.compras_fecha_contable,
      // Un backend sin la tanda 5 no las manda: los defaults de la semilla.
      iva_ddjj_arrastre: config.iva_ddjj_arrastre ?? false,
      bu_frecuencia:     config.bu_frecuencia ?? 'mensual',
      bu_criterio_alta:  config.bu_criterio_alta ?? 'proporcional',
      bu_corte_inicial:  config.bu_corte_inicial ?? '2026-06-30',
    },
  })

  async function enviar(d: ConfigForm) {
    const cambios: Partial<ConfigForm> = {}
    if (dirtyFields.automaticos_desde) cambios.automaticos_desde = d.automaticos_desde
    if (dirtyFields.cvlp_modo) cambios.cvlp_modo = d.cvlp_modo
    if (dirtyFields.compras_fecha_contable) cambios.compras_fecha_contable = d.compras_fecha_contable
    if (dirtyFields.iva_ddjj_arrastre) cambios.iva_ddjj_arrastre = d.iva_ddjj_arrastre
    if (dirtyFields.bu_frecuencia) cambios.bu_frecuencia = d.bu_frecuencia
    if (dirtyFields.bu_criterio_alta) cambios.bu_criterio_alta = d.bu_criterio_alta
    if (dirtyFields.bu_corte_inicial) cambios.bu_corte_inicial = d.bu_corte_inicial
    if (Object.keys(cambios).length === 0) return
    try {
      await guardar.mutateAsync(cambios)
      toast('✓ Configuración guardada. Los comprobantes afectados quedan desactualizados hasta volver a contabilizar.', 'ok')
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      const campo = CAMPOS_CONFIG.find(c => c === ce?.campo)
      if (ce && campo) setError(campo, { message: ce.mensaje })
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <Tarjeta className="p-3 flex flex-col gap-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">Configuración</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Automáticos desde" error={errors.automaticos_desde?.message}>
          <input type="date" min="2026-07-01" {...register('automaticos_desde')} disabled={!!bloqueo} className={inputCls} />
          <span className="text-[11px] text-gris-dark">Lo anterior no se contabiliza solo (hoy: {fmtFecha(config.automaticos_desde)}).</span>
        </Campo>
        <Campo label="CVLP (Casilda)" error={errors.cvlp_modo?.message}>
          <select {...register('cvlp_modo')} disabled={!!bloqueo} className={inputCls}>
            <option value="neto_liquidado">Por el neto liquidado</option>
            <option value="bruto">Por el bruto del papel</option>
          </select>
          <span className="text-[11px] text-gris-dark">Neto liquidado: Casilda al Debe por el líquido, IVA del papel, y la venta por la diferencia (la comisión no va a gasto).</span>
        </Campo>
        <Campo label="Fecha del asiento de una compra" error={errors.compras_fecha_contable?.message}>
          <select {...register('compras_fecha_contable')} disabled={!!bloqueo} className={inputCls}>
            <option value="mes_iva">Mes del período IVA</option>
            <option value="fecha">Fecha del comprobante</option>
          </select>
          <span className="text-[11px] text-gris-dark">Con el período IVA corrido, el asiento va el día 1 de ese mes: el IVA del mayor coincide con el Libro IVA.</span>
        </Campo>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-gris pt-2">
        <Campo label="Asiento de IVA del mes" error={errors.iva_ddjj_arrastre?.message}>
          <label className={`flex items-center gap-1.5 text-sm select-none py-2 ${bloqueo ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input type="checkbox" className="accent-naranja" {...register('iva_ddjj_arrastre')} disabled={!!bloqueo} />
            Compensar saldos a favor del mes anterior
          </label>
          <span className="text-[11px] text-gris-dark">Apagado: cada mes se liquida solo, como la posición de Impuestos. Prendido: el saldo técnico y el de libre disponibilidad del mes anterior bajan el IVA a pagar.</span>
        </Campo>
        <Campo label="Bienes de uso: amortizar" error={errors.bu_frecuencia?.message}>
          <select {...register('bu_frecuencia')} disabled={!!bloqueo} className={inputCls}>
            <option value="mensual">Por mes</option>
            <option value="anual">Por ejercicio</option>
          </select>
          <span className="text-[11px] text-gris-dark">No se cambia si ya hay amortizaciones en el ejercicio.</span>
        </Campo>
        <Campo label="Bienes de uso: año de alta" error={errors.bu_criterio_alta?.message}>
          <select {...register('bu_criterio_alta')} disabled={!!bloqueo} className={inputCls}>
            <option value="proporcional">Proporcional (desde el mes de alta)</option>
            <option value="completo">Completo (todo el ejercicio)</option>
          </select>
          <span className="text-[11px] text-gris-dark">Default de los bienes; cada bien puede tener el suyo.</span>
        </Campo>
        <Campo label="Bienes de uso: corte inicial" error={errors.bu_corte_inicial?.message}>
          <input type="date" {...register('bu_corte_inicial')} disabled={!!bloqueo} className={inputCls} />
          <span className="text-[11px] text-gris-dark">Fecha de la amortización acumulada que trae el inventario (hoy: {fmtFecha(config.bu_corte_inicial ?? '2026-06-30')}).</span>
        </Campo>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit(enviar)} loading={guardar.isPending} disabled={!!bloqueo || !isDirty}
          title={bloqueo ?? (!isDirty ? 'No hay cambios' : 'Guardar la configuración')}>
          Guardar configuración
        </Button>
      </div>
    </Tarjeta>
  )
}
