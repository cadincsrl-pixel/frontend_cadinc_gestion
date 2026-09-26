'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import type { ParametroListado } from '@/types/sueldos.types'
import { useBorrarParametro, useGuardarParametro, useParametros } from '../../hooks/useSueldos'
import { fmtCant, fmtFecha, hoyAR, numONull } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, Cargando, Check, ErrorCarga, MarcaAConfirmar, Tarjeta, Td, Th, Vacio, inputCls } from '../Comun'

/** Qué es cada parámetro que usa el motor (para quien no lo cargó). */
const AYUDA_CLAVE: Record<string, string> = {
  detraccion_por_empleado: 'Detracción mensual por empleado que baja la base de la contribución patronal ($).',
  contrib_patronal_pct:    'Contribución patronal de seguridad social (%).',
  rifl_pct:                'Contribución reducida para legajos RIFL (%).',
  art_pct:                 'ART: porcentaje sobre el remunerativo (%).',
  art_fijo:                'ART: suma fija mensual por empleado ($).',
  scvo_monto:              'Seguro colectivo de vida obligatorio, mensual por empleado ($).',
  fal_pct:                 'Fondo de asistencia laboral (%).',
  horas_mes_uocra:         'Horas del mes para pasar del básico mensual al valor hora (UOCRA).',
  horas_mes:               'Horas del mes por defecto para el valor hora de los mensualizados.',
  horas_dia_uocra:         'Horas de la jornada (UOCRA): para el valor día de vacaciones.',
  divisor_vacaciones:      'Divisor del sueldo mensual para el valor día de vacaciones (25).',
  dias_mes:                'Días del mes para proporcionar el básico (30).',
}

const CLAVES_MAPEO = [
  ['sueldos.remunerativo', 'Sueldos y jornales (debe)'],
  ['sueldos.no_remunerativo', 'Sumas no remunerativas (debe)'],
  ['sueldos.contribuciones', 'Cargas sociales (debe)'],
  ['sueldos.fondo_cese', 'Fondo de cese laboral (debe)'],
  ['sueldos.a_pagar', 'Sueldos a pagar — neto (haber)'],
  ['sueldos.aportes_a_pagar', 'F.931 a pagar: aportes + contribuciones (haber)'],
  ['sueldos.sindicato_a_pagar', 'Sindicato a pagar (haber)'],
  ['sueldos.fondo_cese_a_pagar', 'Fondo de cese a depositar (haber)'],
  ['sueldos.otros_a_pagar', 'Otras retenciones a pagar (haber)'],
  ['sueldos.prestamos', 'Préstamos al personal que se cancelan (haber)'],
] as const

export function ConfiguracionTab() {
  const { configurar } = usePermisos('sueldos')
  const noConfig = configurar ? null : 'Hace falta el permiso «Configurar el módulo» en Sueldos'
  const hasModulo = useSessionStore(s => s.hasModulo)
  const q = useParametros()
  const borrar = useBorrarParametro()
  const toast = useToast()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [modal, setModal] = useState<{ clave: string | null; param: ParametroListado | null } | null>(null)

  const porClave = useMemo(() => {
    const m = new Map<string, ParametroListado[]>()
    for (const p of q.data ?? []) {
      const arr = m.get(p.clave) ?? []
      arr.push(p)
      m.set(p.clave, arr)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [q.data])

  async function quitar(p: ParametroListado) {
    if (!window.confirm(`¿Borrar ${p.clave} desde el ${fmtFecha(p.vigente_desde)} (${fmtCant(p.valor)})?`)) return
    try {
      await borrar.mutateAsync(p.id)
      toast('✓ Valor borrado', 'ok')
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  return (
    <>
      <Tarjeta className="p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg text-azul tracking-wider flex-1">Parámetros generales</h3>
          <Button size="sm" disabled={!!noConfig} title={noConfig ?? 'Cargar un parámetro nuevo o un valor nuevo con vigencia'}
            onClick={() => setModal({ clave: null, param: null })}>+ Parámetro</Button>
        </div>
        <p className="text-xs text-gris-dark">Cada valor rige desde su fecha: para cambiar uno, cargá un valor nuevo con la fecha desde la que vale (el anterior queda en el historial y los recibos viejos no cambian).</p>
        {q.isLoading ? <Cargando />
          : q.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />
          : porClave.length === 0 ? <Vacio>No hay parámetros cargados.</Vacio>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><Th>Parámetro</Th><Th derecha>Valor vigente</Th><Th className="hidden sm:table-cell">Desde</Th><Th /></tr></thead>
                <tbody>
                  {porClave.map(([clave, lista]) => {
                    const vig = lista.find(p => p.vigente)
                    return (
                      <Fragment key={clave}>
                        <tr className="cursor-pointer hover:bg-naranja-light/30" onClick={() => setAbierta(a => a === clave ? null : clave)}>
                          <Td>
                            <div className="font-mono text-xs font-bold">{abierta === clave ? '▾' : '▸'} {clave}</div>
                            <div className="text-[11px] text-gris-dark">{vig?.descripcion || AYUDA_CLAVE[clave] || lista[0]?.descripcion || ''}</div>
                          </Td>
                          <Td derecha>
                            {vig ? <div className="flex flex-col items-end gap-0.5"><span>{fmtCant(vig.valor)}</span>{vig.a_confirmar && <MarcaAConfirmar />}</div>
                              : <span className="text-gris-dark text-xs font-sans">todavía no rige</span>}
                          </Td>
                          <Td className="hidden sm:table-cell">{vig ? fmtFecha(vig.vigente_desde) : ''}</Td>
                          <Td className="text-right">
                            <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Valor nuevo desde una fecha'}
                              onClick={e => { e.stopPropagation(); setModal({ clave, param: null }) }}>+ Valor</Button>
                          </Td>
                        </tr>
                        {abierta === clave && lista.map(p => (
                          <tr key={p.id} className="bg-blanco text-xs">
                            <td className="px-3 py-1 border-t border-gris pl-8">desde {fmtFecha(p.vigente_desde)}{p.vigente && <span className="text-verde font-bold"> · vigente</span>}{p.fuente ? <span className="text-gris-dark"> · {p.fuente}</span> : ''}</td>
                            <td className="px-3 py-1 border-t border-gris text-right font-mono">{fmtCant(p.valor)} {p.a_confirmar && <MarcaAConfirmar />}</td>
                            <td className="px-3 py-1 border-t border-gris hidden sm:table-cell" />
                            <td className="px-3 py-1 border-t border-gris text-right whitespace-nowrap">
                              <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Corregir'} onClick={() => setModal({ clave, param: p })}>✏</Button>
                              <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Borrar'} onClick={() => quitar(p)}>🗑</Button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Tarjeta>

      <Tarjeta className="p-3 flex flex-col gap-2">
        <h3 className="font-display text-lg text-azul tracking-wider">Mapeo contable</h3>
        <p className="text-xs text-gris-dark">
          Al cerrar una liquidación se arma el asiento con las cuentas que se eligen en Contabilidad › Mapeos (claves «sueldos.*», una general y opcionalmente una por convenio: uocra, uecara, camioneros).
          Si falta alguna, la liquidación se cierra igual con el aviso «falta mapear» y se contabiliza después con el botón «Contabilizar».
        </p>
        <ul className="text-xs grid grid-cols-1 md:grid-cols-2 gap-x-4">
          {CLAVES_MAPEO.map(([k, d]) => <li key={k}><span className="font-mono">{k}</span> — {d}</li>)}
        </ul>
        <div>
          {hasModulo('contabilidad')
            ? <Link href="/contabilidad?tab=mapeos" className="inline-block text-sm font-bold text-azul underline">Ir a Contabilidad › Mapeos</Link>
            : <span className="text-xs text-gris-dark" title="Hace falta acceso al módulo Contabilidad">Contabilidad › Mapeos (sin acceso al módulo Contabilidad: pedíselo a quien lo administra)</span>}
        </div>
      </Tarjeta>

      {modal && <ModalParametro clave={modal.clave} param={modal.param} onClose={() => setModal(null)} />}
    </>
  )
}

const schema = z.object({
  clave:         z.string().trim().regex(/^[a-z0-9_]{2,60}$/, 'Minúsculas, números y guion bajo'),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha'),
  valor:         z.string().refine(v => numONull(v) !== null, 'Poné el valor'),
  a_confirmar:   z.boolean(),
  fuente:        z.string().max(300),
  descripcion:   z.string().max(300),
})
type FormData = z.infer<typeof schema>

function ModalParametro({ clave, param, onClose }: { clave: string | null; param: ParametroListado | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarParametro()
  const [error, setErrorServer] = useState<string | null>(null)
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: param
      ? { clave: param.clave, vigente_desde: param.vigente_desde, valor: String(param.valor), a_confirmar: param.a_confirmar, fuente: param.fuente ?? '', descripcion: param.descripcion ?? '' }
      : { clave: clave ?? '', vigente_desde: hoyAR(), valor: '', a_confirmar: false, fuente: '', descripcion: clave ? AYUDA_CLAVE[clave] ?? '' : '' },
  })

  async function enviar(d: FormData) {
    setErrorServer(null)
    const valor = numONull(d.valor) ?? 0
    try {
      if (param) await guardar.mutateAsync({ id: param.id, valor, a_confirmar: d.a_confirmar, fuente: d.fuente.trim(), descripcion: d.descripcion.trim() })
      else await guardar.mutateAsync({ id: null, clave: d.clave, vigente_desde: d.vigente_desde, valor, a_confirmar: d.a_confirmar, fuente: d.fuente.trim(), descripcion: d.descripcion.trim() })
      toast('✓ Parámetro guardado', 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} title={param ? `Corregir ${param.clave}` : clave ? `Valor nuevo · ${clave}` : 'Nuevo parámetro'}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>Guardar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Campo label="Clave" error={errors.clave?.message}>
          <input className={`${inputCls} font-mono`} {...register('clave')} disabled={!!clave || !!param} placeholder="p. ej. art_pct" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Vigente desde" error={errors.vigente_desde?.message}>
            <input type="date" className={inputCls} {...register('vigente_desde')} disabled={!!param} />
          </Campo>
          <Campo label="Valor" hint="% o $ según el parámetro" error={errors.valor?.message}>
            <input className={inputCls} inputMode="decimal" {...register('valor')} />
          </Campo>
        </div>
        <Campo label="Descripción">
          <input className={inputCls} {...register('descripcion')} />
        </Campo>
        <Campo label="Fuente">
          <input className={inputCls} {...register('fuente')} />
        </Campo>
        <Controller control={control} name="a_confirmar" render={({ field }) => (
          <Check label="A confirmar (se usa igual, con la marca amarilla)" checked={field.value} onChange={field.onChange} />
        )} />
        {param && <p className="text-[11px] text-gris-dark">La fecha no se cambia: para otra vigencia cargá un valor nuevo.</p>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  )
}
