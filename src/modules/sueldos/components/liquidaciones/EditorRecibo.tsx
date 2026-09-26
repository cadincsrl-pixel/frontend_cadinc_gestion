'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useFieldArray, useForm, useWatch, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type {
  Destino, EntradasRecibo, LineaCalculada, LiquidacionDetalle, Recibo, SugerenciasRecibo, Unidad, ValoresAFecha,
} from '@/types/sueldos.types'
import {
  useCalcularRecibo, useGuardarRecibo, useLegajo, useRecibo, useSugerenciasRecibo, useValores,
} from '../../hooks/useSueldos'
import {
  CALCULO_LABEL, DESTINO_LABEL, FALTANTE_LABEL, TIPO_CONCEPTO_LABEL, UNIDAD_LABEL, fmtCant, fmtFecha, fmtM, fmtN,
  fmtPeriodoLiq, numONull,
} from '../../utils/sueldos.utils'
import { codigoError, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { descargarRecibosPdf, liqParaRecibo } from '../../utils/reciboPdf'
import { Aviso, Campo, Cargando, Check, ErrorCarga, EstadoRec, ListaAvisos, MarcaAConfirmar, inputCls } from '../Comun'

/**
 * Editor de un recibo: a la izquierda lo que carga el liquidador (horas,
 * días, km, préstamos, conceptos y líneas libres), a la derecha el recibo
 * calculado por el backend EN VIVO (`POST …/recibos/calcular`, con debounce;
 * no guarda). «Guardar» manda las entradas (`PUT`) y el backend recalcula y
 * persiste. Si el recibo no existe todavía, arranca con las sugerencias
 * (horas de tarja, préstamos, SAC, vacaciones…).
 */

interface Props {
  liquidacion: LiquidacionDetalle
  legajoId: number
  existe: boolean
  soloLectura: boolean
  motivoSoloLectura: string | null
  siguiente: number | null
  onIr: (legajoId: number) => void
  onClose: () => void
}

function finDeMes(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function EditorRecibo(p: Props) {
  const { liquidacion: l, legajoId, existe } = p
  const ficha = useLegajo(legajoId)
  const recibo = useRecibo(l.id, legajoId, existe)
  const sug = useSugerenciasRecibo(l.id, legajoId, true)
  const valores = useValores({ convenio_id: l.convenio_id, fecha: finDeMes(l.periodo), zona: ficha.data?.zona })

  const noExiste = !existe || codigoError(recibo.error) === 'RECIBO_NO_EXISTE'
  const cargando = (existe && recibo.isLoading) || sug.isLoading
  const errorCarga = existe && recibo.isError && !noExiste ? recibo.error : sug.isError && noExiste ? sug.error : null

  const inicial: EntradasRecibo | null = cargando || errorCarga
    ? null
    : !noExiste && recibo.data ? (recibo.data.entradas ?? {}) : (sug.data?.entradas ?? {})

  const nombre = ficha.data?.nombre_mostrar ?? l.recibos.find(r => r.legajo_id === legajoId)?.legajo.nombre ?? `Legajo #${legajoId}`

  if (!inicial) {
    return (
      <Modal open onClose={p.onClose} title={nombre} width="max-w-6xl">
        {errorCarga
          ? <ErrorCarga mensaje={mensajeErrorSueldos(errorCarga)} onReintentar={() => { recibo.refetch(); sug.refetch() }} />
          : <Cargando texto="Cargando el recibo…" />}
      </Modal>
    )
  }

  return (
    <FormRecibo
      key={`${legajoId}-${recibo.data?.updated_at ?? 'nuevo'}`}
      {...p}
      nombre={nombre}
      inicial={inicial}
      obsInicial={!noExiste ? recibo.data?.obs ?? '' : ''}
      recibo={!noExiste ? recibo.data ?? null : null}
      sugerencias={sug.data ?? null}
      valores={valores.data ?? null}
      faltantes={ficha.data?.faltantes ?? []}
    />
  )
}

// ── Formulario ───────────────────────────────────────────────────────

const NUM = /^\s*-?\d{0,12}([.,]\d{0,4})?\s*$/
const num = z.string().regex(NUM, 'Número inválido')
const numPos = num.refine(v => (numONull(v) ?? 0) >= 0, 'No puede ser negativo')

const TIPOS_CONCEPTO = ['remunerativo', 'no_remunerativo', 'descuento', 'contribucion'] as const
const DESTINOS = ['', 'f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros'] as const
const UNIDADES = ['', 'horas', 'dias', 'km', '%', '$', 'anios', 'unidades'] as const

const schema = z.object({
  horas_normales:   numPos,
  horas_extra_50:   numPos,
  horas_extra_100:  numPos,
  dias_trabajados:  numPos.refine(v => (numONull(v) ?? 0) <= 31, 'De 0 a 31'),
  asistencia:       z.boolean(),
  presentismo:      z.boolean(),
  km:               numPos,
  antiguedad_anios: z.string().regex(/^\s*\d{0,2}\s*$/, 'Años enteros'),
  prestamos:        numPos,
  conceptos: z.array(z.object({
    codigo:     z.string().min(1, 'Elegí el concepto'),
    cantidad:   numPos,
    importe:    num,
    porcentaje: num,
    nombre:     z.string().max(200),
  })).max(60),
  lineas_libres: z.array(z.object({
    nombre:      z.string().trim().min(1, 'Poné el nombre').max(200),
    tipo:        z.enum(TIPOS_CONCEPTO),
    importe:     num.refine(v => numONull(v) !== null, 'Poné el importe'),
    codigo_arca: z.string().regex(/^(\d{6})?$/, '6 dígitos'),
    destino:     z.enum(DESTINOS),
    cantidad:    numPos,
    unidad:      z.enum(UNIDADES),
  })).max(60),
  omitir: z.array(z.string()),
  obs:    z.string().max(1000, 'Hasta 1000 caracteres'),
})
type FormE = z.infer<typeof schema>

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

function deEntradas(e: EntradasRecibo): FormE {
  return {
    horas_normales: s(e.horas_normales),
    horas_extra_50: s(e.horas_extra_50),
    horas_extra_100: s(e.horas_extra_100),
    dias_trabajados: s(e.dias_trabajados),
    asistencia: e.asistencia !== false,
    presentismo: e.presentismo !== false,
    km: s(e.km),
    antiguedad_anios: s(e.antiguedad_anios),
    prestamos: s(e.prestamos),
    conceptos: (e.conceptos ?? []).map(c => ({
      codigo: c.codigo, cantidad: s(c.cantidad), importe: s(c.importe), porcentaje: s(c.porcentaje), nombre: c.nombre ?? '',
    })),
    lineas_libres: (e.lineas_libres ?? []).map(x => ({
      nombre: x.nombre, tipo: x.tipo, importe: s(x.importe), codigo_arca: x.codigo_arca ?? '',
      destino: x.destino ?? '', cantidad: s(x.cantidad), unidad: x.unidad ?? '',
    })),
    omitir: e.omitir ?? [],
    obs: '',
  }
}

/** Form → entradas del contrato. Solo viajan las claves con valor. */
function aEntradas(f: FormE): EntradasRecibo {
  const e: EntradasRecibo = {}
  const n = (v: string) => numONull(v)
  if (n(f.horas_normales) !== null) e.horas_normales = n(f.horas_normales)
  if (n(f.horas_extra_50) !== null) e.horas_extra_50 = n(f.horas_extra_50)
  if (n(f.horas_extra_100) !== null) e.horas_extra_100 = n(f.horas_extra_100)
  if (n(f.dias_trabajados) !== null) e.dias_trabajados = n(f.dias_trabajados)
  if (!f.asistencia) e.asistencia = false
  if (!f.presentismo) e.presentismo = false
  if (n(f.km) !== null) e.km = n(f.km)
  if (f.antiguedad_anios.trim()) e.antiguedad_anios = Math.trunc(Number(f.antiguedad_anios.trim()))
  if (n(f.prestamos) !== null && (n(f.prestamos) ?? 0) > 0) e.prestamos = n(f.prestamos)
  const conceptos = (f.conceptos ?? []).filter(c => c.codigo).map(c => ({
    codigo: c.codigo,
    ...(n(c.cantidad) !== null ? { cantidad: n(c.cantidad) } : {}),
    ...(n(c.importe) !== null ? { importe: n(c.importe) } : {}),
    ...(n(c.porcentaje) !== null ? { porcentaje: n(c.porcentaje) } : {}),
    ...(c.nombre.trim() ? { nombre: c.nombre.trim() } : {}),
  }))
  if (conceptos.length) e.conceptos = conceptos
  const libres = (f.lineas_libres ?? []).filter(x => x.nombre.trim() && n(x.importe) !== null).map(x => ({
    nombre: x.nombre.trim(),
    tipo: x.tipo,
    importe: n(x.importe) ?? 0,
    ...(x.codigo_arca ? { codigo_arca: x.codigo_arca } : {}),
    ...(x.destino ? { destino: x.destino as Destino } : {}),
    ...(n(x.cantidad) !== null ? { cantidad: n(x.cantidad) } : {}),
    ...(x.unidad ? { unidad: x.unidad as Unidad } : {}),
  }))
  if (libres.length) e.lineas_libres = libres
  if (f.omitir?.length) e.omitir = f.omitir
  return e
}

function FormRecibo(p: Props & {
  nombre: string
  inicial: EntradasRecibo
  obsInicial: string
  recibo: Recibo | null
  sugerencias: SugerenciasRecibo | null
  valores: ValoresAFecha | null
  faltantes: string[]
}) {
  const { liquidacion: l, legajoId, soloLectura, recibo, sugerencias: sg, valores } = p
  const toast = useToast()
  const guardar = useGuardarRecibo()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const form = useForm<FormE>({
    resolver: zodResolver(schema),
    defaultValues: { ...deEntradas(p.inicial), obs: p.obsInicial },
  })
  const { control, register, handleSubmit, setValue, getValues, formState: { errors, isDirty } } = form
  const conceptosFA = useFieldArray({ control, name: 'conceptos' })
  const libresFA = useFieldArray({ control, name: 'lineas_libres' })

  // Vista previa en vivo: entradas → debounce 400 ms → POST calcular.
  const todo = useWatch({ control })
  const entradasJson = JSON.stringify(aEntradas({ ...deEntradas({}), ...(todo as FormE) }))
  const [debounced, setDebounced] = useState(entradasJson)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(entradasJson), 400)
    return () => clearTimeout(t)
  }, [entradasJson])
  const entradasPreview = useMemo(() => JSON.parse(debounced) as EntradasRecibo, [debounced])
  const calc = useCalcularRecibo(l.id, legajoId, entradasPreview)
  const r = calc.data
  const calculando = calc.isFetching || debounced !== entradasJson

  const conceptosCat = useMemo(() => valores?.conceptos ?? [], [valores])
  const porCodigo = useMemo(() => new Map(conceptosCat.map(c => [c.codigo, c])), [conceptosCat])
  const tiene = (codigo: string) => porCodigo.has(codigo)
  const esHaberes = l.tipo === 'quincena' || l.tipo === 'mensual'
  const esPorHora = (r?.unidad_basico ?? l.convenio.unidad_basico) === 'hora'
  const omitir = useWatch({ control, name: 'omitir' }) ?? []

  function usarConcepto(codigo: string, importe: number | null, cantidad?: number | null) {
    const actuales = getValues('conceptos')
    const i = actuales.findIndex(c => c.codigo === codigo)
    const fila = { codigo, cantidad: s(cantidad ?? null), importe: s(importe), porcentaje: '', nombre: '' }
    if (i >= 0) conceptosFA.update(i, fila)
    else conceptosFA.append(fila)
  }

  function alternarOmitir(codigo: string) {
    const act = getValues('omitir') ?? []
    setValue('omitir', act.includes(codigo) ? act.filter(c => c !== codigo) : [...act, codigo], { shouldDirty: true })
  }

  async function enviar(f: FormE, ir: number | null) {
    setErrorServer(null)
    try {
      const res = await guardar.mutateAsync({ liqId: l.id, legajoId, entradas: aEntradas(f), obs: f.obs.trim() })
      toast(`✓ Recibo de ${p.nombre} guardado · neto ${fmtM(res.recibo.neto)}`, 'ok')
      if (ir) p.onIr(ir)
      else p.onClose()
    } catch (e) {
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  function cerrar() {
    if (isDirty && !soloLectura && !window.confirm('Hay cambios sin guardar. ¿Cerrar igual?')) return
    p.onClose()
  }

  const codigoCalcError = calc.isError ? codigoError(calc.error) : undefined
  // El backend rechaza guardar un recibo con neto negativo (409 NETO_NEGATIVO).
  const netoNegativo = !!r && r.totales.neto < 0 && !calculando
  const motivoNoGuardar = p.motivoSoloLectura ?? (netoNegativo ? 'El neto da negativo: bajá el préstamo o los descuentos' : null)

  return (
    <Modal open onClose={guardar.isPending ? () => {} : cerrar} width="max-w-6xl"
      title={`${p.nombre} · ${l.codigo}`}
      footer={<>
        {recibo && (
          <Button variant="ghost" size="sm" onClick={() => descargarRecibosPdf([recibo], liqParaRecibo(l))} title="El recibo guardado, en PDF">🖨 PDF</Button>
        )}
        <Button variant="ghost" size="sm" onClick={cerrar} disabled={guardar.isPending}>{soloLectura ? 'Cerrar' : 'Cancelar'}</Button>
        {p.siguiente && (
          <Button variant="secondary" size="sm" disabled={!!motivoNoGuardar} loading={guardar.isPending}
            title={motivoNoGuardar ?? 'Guardar y abrir el recibo del próximo empleado'}
            onClick={handleSubmit(f => enviar(f, p.siguiente))}>Guardar y siguiente →</Button>
        )}
        <Button size="sm" disabled={!!motivoNoGuardar} loading={guardar.isPending} title={motivoNoGuardar ?? 'Calcula y guarda el recibo'}
          onClick={handleSubmit(f => enviar(f, null))}>Guardar recibo</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gris-dark">
          <span>{fmtPeriodoLiq(l)}</span>
          {recibo && <EstadoRec estado={recibo.estado} />}
          {!recibo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-azul-light text-azul font-bold uppercase">Nuevo</span>}
          {isDirty && !soloLectura && <span className="text-naranja-dark font-bold">● cambios sin guardar</span>}
          {p.faltantes.length > 0 && (
            <span className="text-naranja-dark">
              Ficha incompleta ({p.faltantes.map(f => FALTANTE_LABEL[f as keyof typeof FALTANTE_LABEL] ?? f).join(', ')}) ·{' '}
              <Link className="underline" href={`/sueldos?tab=legajos&legajo=${legajoId}`}>completar</Link>
            </span>
          )}
        </div>
        {soloLectura && p.motivoSoloLectura && <Aviso tono="gris">Solo lectura: {p.motivoSoloLectura}.</Aviso>}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4">
          {/* ── Entradas ── */}
          <fieldset disabled={soloLectura} className="flex flex-col gap-3 min-w-0">
            {sg && <PanelSugerencias sg={sg} tipo={l.tipo} onUsarHoras={h => setValue('horas_normales', s(h), { shouldDirty: true })}
              onUsarPrestamo={v => setValue('prestamos', s(v), { shouldDirty: true })} onUsarConcepto={usarConcepto} soloLectura={soloLectura} />}

            {esHaberes && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {esPorHora ? (
                  <Campo label="Horas normales" error={errors.horas_normales?.message}>
                    <input className={inputCls} inputMode="decimal" {...register('horas_normales')} placeholder="0" />
                  </Campo>
                ) : (
                  <Campo label="Días trabajados" hint={l.tipo === 'quincena' ? '15 = completa' : '30 = mes completo'} error={errors.dias_trabajados?.message}>
                    <input className={inputCls} inputMode="decimal" {...register('dias_trabajados')} placeholder={l.tipo === 'quincena' ? '15' : '30'} />
                  </Campo>
                )}
                {tiene('horas_extra_50') && (
                  <Campo label="Extras 50 %" error={errors.horas_extra_50?.message}>
                    <input className={inputCls} inputMode="decimal" {...register('horas_extra_50')} placeholder="0" />
                  </Campo>
                )}
                {tiene('horas_extra_100') && (
                  <Campo label="Extras 100 %" error={errors.horas_extra_100?.message}>
                    <input className={inputCls} inputMode="decimal" {...register('horas_extra_100')} placeholder="0" />
                  </Campo>
                )}
                {(tiene('km_remunerativo') || tiene('viatico_km')) && (
                  <Campo label="Kilómetros" error={errors.km?.message}>
                    <input className={inputCls} inputMode="decimal" {...register('km')} placeholder="0" />
                  </Campo>
                )}
                {tiene('asistencia') && (
                  <div className="flex items-end pb-2">
                    <Controller control={control} name="asistencia" render={({ field }) => (
                      <Check label="Asistencia (20 %)" checked={field.value} onChange={field.onChange} disabled={soloLectura}
                        title="Destildá si faltó sin justificar: no se paga el adicional por asistencia" />
                    )} />
                  </div>
                )}
                {tiene('presentismo') && (
                  <div className="flex items-end pb-2">
                    <Controller control={control} name="presentismo" render={({ field }) => (
                      <Check label="Presentismo" checked={field.value} onChange={field.onChange} disabled={soloLectura} />
                    )} />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Campo label="Préstamos a descontar" hint={sg?.prestamos ? `saldo ${fmtM(sg.prestamos.saldo)}` : undefined} error={errors.prestamos?.message}>
                <input className={inputCls} inputMode="decimal" {...register('prestamos')} placeholder="0" />
              </Campo>
              <Campo label="Antigüedad (años)" hint={r ? `automática: ${r.antiguedad_anios}` : 'automática'} error={errors.antiguedad_anios?.message}>
                <input className={inputCls} inputMode="numeric" {...register('antiguedad_anios')} placeholder={r ? String(r.antiguedad_anios) : ''} />
              </Campo>
            </div>

            {/* Conceptos del catálogo */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Conceptos agregados</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => conceptosFA.append({ codigo: '', cantidad: '', importe: '', porcentaje: '', nombre: '' })}>+ Concepto</Button>
              </div>
              {conceptosFA.fields.length === 0 && <p className="text-[11px] text-gris-dark">Adicionales, viáticos, SAC, vacaciones, indemnización, otros descuentos… (los automáticos del convenio ya van solos).</p>}
              {conceptosFA.fields.map((f, i) => (
                <FilaConcepto key={f.id} i={i} control={control} register={register} conceptos={conceptosCat}
                  error={errors.conceptos?.[i]} onQuitar={() => conceptosFA.remove(i)} />
              ))}
            </div>

            {/* Líneas libres */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Líneas libres</span>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => libresFA.append({ nombre: '', tipo: 'remunerativo', importe: '', codigo_arca: '', destino: '', cantidad: '', unidad: '' })}>+ Línea libre</Button>
              </div>
              {libresFA.fields.length === 0 && <p className="text-[11px] text-gris-dark">Para algo que no está en el catálogo. El LSD necesita código ARCA.</p>}
              {libresFA.fields.map((f, i) => (
                <div key={f.id} className="border border-gris-mid rounded-lg p-2 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                  <Campo label="Nombre" className="col-span-2 sm:col-span-3" error={errors.lineas_libres?.[i]?.nombre?.message}>
                    <input className={inputCls} {...register(`lineas_libres.${i}.nombre`)} />
                  </Campo>
                  <Campo label="Tipo" className="sm:col-span-2">
                    <select className={inputCls} {...register(`lineas_libres.${i}.tipo`)}>
                      {TIPOS_CONCEPTO.map(t => <option key={t} value={t}>{TIPO_CONCEPTO_LABEL[t]}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Importe" error={errors.lineas_libres?.[i]?.importe?.message}>
                    <input className={inputCls} inputMode="decimal" {...register(`lineas_libres.${i}.importe`)} />
                  </Campo>
                  <Campo label="Cód. ARCA" className="sm:col-span-2" error={errors.lineas_libres?.[i]?.codigo_arca?.message}>
                    <input className={inputCls} inputMode="numeric" maxLength={6} {...register(`lineas_libres.${i}.codigo_arca`)} />
                  </Campo>
                  <Campo label="Destino" hint="desc./contrib." className="sm:col-span-2">
                    <select className={inputCls} {...register(`lineas_libres.${i}.destino`)}>
                      <option value="">—</option>
                      {DESTINOS.filter(Boolean).map(d => <option key={d} value={d}>{DESTINO_LABEL[d as Destino]}</option>)}
                    </select>
                  </Campo>
                  <div className="col-span-2 sm:col-span-2 flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => libresFA.remove(i)}>🗑 Quitar</Button>
                  </div>
                </div>
              ))}
            </div>

            <Campo label="Observación del recibo" hint="se imprime" error={errors.obs?.message}>
              <textarea rows={2} className={inputCls} {...register('obs')} />
            </Campo>
            {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
          </fieldset>

          {/* ── Vista previa ── */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Recibo calculado</span>
              <span className="text-[11px] text-gris-dark">{calculando ? 'calculando…' : r ? `valores al ${fmtFecha(r.fecha_valores)}` : ''}</span>
            </div>
            {calc.isError && (
              <Aviso tono="rojo">
                {mensajeErrorSueldos(calc.error)}
                {codigoCalcError === 'LEGAJO_SIN_CATEGORIA' && <> <Link className="underline font-bold" href={`/sueldos?tab=legajos&legajo=${legajoId}`}>Abrir la ficha</Link></>}
                {codigoCalcError === 'SIN_ESCALA' && <> <Link className="underline font-bold" href="/sueldos?tab=convenios">Ir a Convenios</Link></>}
              </Aviso>
            )}
            {!r && !calc.isError && <Cargando texto="Calculando…" />}
            {r && (
              <div className={`flex flex-col gap-2 transition-opacity ${calculando ? 'opacity-60' : ''}`}>
                <div className="text-[11px] text-gris-dark">
                  Escala {fmtM(r.valor_escala)} {r.unidad_basico === 'hora' ? 'por hora' : 'por mes'} · valor hora {fmtM(r.valor_hora)} · antigüedad {r.antiguedad_anios} años
                  {r.dias_trabajados != null && ` · ${fmtCant(r.dias_trabajados)} días`}{r.horas_trabajadas != null && ` · ${fmtCant(r.horas_trabajadas)} horas`}
                </div>
                <ListaAvisos avisos={r.avisos} />
                <TablaLineas titulo="Haberes remunerativos" lineas={r.lineas.filter(x => x.tipo === 'remunerativo')} total={r.totales.remunerativo}
                  omitibles={porCodigo} omitir={omitir} onOmitir={alternarOmitir} soloLectura={soloLectura} />
                <TablaLineas titulo="No remunerativos" lineas={r.lineas.filter(x => x.tipo === 'no_remunerativo')} total={r.totales.no_remunerativo}
                  omitibles={porCodigo} omitir={omitir} onOmitir={alternarOmitir} soloLectura={soloLectura} />
                <TablaLineas titulo="Descuentos" lineas={r.lineas.filter(x => x.tipo === 'descuento')} total={r.totales.descuentos}
                  omitibles={porCodigo} omitir={omitir} onOmitir={alternarOmitir} soloLectura={soloLectura} />
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${r.totales.neto < 0 ? 'bg-rojo-light text-rojo' : 'bg-verde-light text-verde'}`}>
                  <span className="font-bold uppercase text-xs tracking-wide">Neto a cobrar</span>
                  <span className="font-mono font-bold text-xl tabular-nums">{fmtM(r.totales.neto)}</span>
                </div>
                {r.totales.neto < 0 && <Aviso tono="rojo">El neto da negativo: bajá el préstamo o los descuentos. Así no se puede guardar.</Aviso>}
                <TablaLineas titulo="Contribuciones patronales (no se descuentan)" lineas={r.lineas.filter(x => x.tipo === 'contribucion')}
                  total={r.totales.contribuciones + r.totales.fondo_cese}
                  omitibles={porCodigo} omitir={omitir} onOmitir={alternarOmitir} soloLectura={soloLectura} />
                <div className="flex justify-between text-xs text-gris-dark px-1">
                  <span>Contribuciones {fmtM(r.totales.contribuciones)} · fondo de cese {fmtM(r.totales.fondo_cese)}</span>
                  <span className="font-bold text-naranja-dark">Costo total {fmtM(r.totales.costo_total)}</span>
                </div>
                {omitir.length > 0 && (
                  <Aviso tono="gris">
                    Sacados de este recibo: {omitir.map(c => (
                      <button key={c} type="button" disabled={soloLectura} onClick={() => alternarOmitir(c)} className="underline mr-2">
                        {porCodigo.get(c)?.nombre ?? c} (volver a poner)
                      </button>
                    ))}
                  </Aviso>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function FilaConcepto({ i, control, register, conceptos, error, onQuitar }: {
  i: number
  control: Control<FormE>
  register: ReturnType<typeof useForm<FormE>>['register']
  conceptos: ValoresAFecha['conceptos']
  error?: { codigo?: { message?: string }; cantidad?: { message?: string }; importe?: { message?: string }; porcentaje?: { message?: string } }
  onQuitar: () => void
}) {
  const codigo = useWatch({ control, name: `conceptos.${i}.codigo` })
  const c = conceptos.find(x => x.codigo === codigo)
  const unidad = c?.unidad ? UNIDAD_LABEL[c.unidad] : ''
  const ayuda = !c ? '' : c.calculo === 'manual' ? 'Se carga el importe.'
    : c.calculo === 'por_unidad' ? `Cantidad × ${c.valor?.monto != null ? fmtM(c.valor.monto) : 'valor del convenio'}${unidad ? ` por ${unidad}` : ''}.`
    : c.calculo === 'porcentaje' ? `Porcentaje${c.valor?.porcentaje != null ? ` (${fmtCant(c.valor.porcentaje)} % del convenio)` : ''}; se puede poner otro.`
    : `${CALCULO_LABEL[c.calculo]}. Un importe pisa el cálculo.`
  const grupos: [string, ValoresAFecha['conceptos']][] = [
    ['Remunerativos', conceptos.filter(x => x.tipo === 'remunerativo')],
    ['No remunerativos', conceptos.filter(x => x.tipo === 'no_remunerativo')],
    ['Descuentos', conceptos.filter(x => x.tipo === 'descuento')],
  ]
  return (
    <div className="border border-gris-mid rounded-lg p-2 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
      <Campo label="Concepto" className="col-span-2 sm:col-span-3" error={error?.codigo?.message}>
        <select className={inputCls} {...register(`conceptos.${i}.codigo`)}>
          <option value="">— Elegí —</option>
          {grupos.map(([g, lista]) => lista.length > 0 && (
            <optgroup key={g} label={g}>
              {lista.map(x => <option key={x.id} value={x.codigo}>{x.nombre}{x.automatico ? ' (automático)' : ''}</option>)}
            </optgroup>
          ))}
          {codigo && !c && <option value={codigo}>{codigo}</option>}
        </select>
      </Campo>
      <Campo label={`Cantidad${unidad ? ` (${unidad})` : ''}`} error={error?.cantidad?.message}>
        <input className={inputCls} inputMode="decimal" {...register(`conceptos.${i}.cantidad`)} />
      </Campo>
      <Campo label="%" error={error?.porcentaje?.message}>
        <input className={inputCls} inputMode="decimal" {...register(`conceptos.${i}.porcentaje`)} />
      </Campo>
      <Campo label="Importe" error={error?.importe?.message}>
        <input className={inputCls} inputMode="decimal" {...register(`conceptos.${i}.importe`)} placeholder={c?.calculo === 'manual' ? 'obligatorio' : ''} />
      </Campo>
      <div className="col-span-2 sm:col-span-5 text-[11px] text-gris-dark">
        {ayuda}{c?.valor?.a_confirmar && <> <MarcaAConfirmar /></>}{c && !c.valor && c.calculo !== 'manual' && <span className="text-rojo"> Sin valor vigente: no se aplica.</span>}
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onQuitar}>🗑</Button>
      </div>
    </div>
  )
}

function TablaLineas({ titulo, lineas, total, omitibles, omitir, onOmitir, soloLectura }: {
  titulo: string
  lineas: LineaCalculada[]
  total: number
  omitibles: Map<string, { automatico: boolean }>
  omitir: string[]
  onOmitir: (codigo: string) => void
  soloLectura: boolean
}) {
  if (lineas.length === 0) return null
  return (
    <div className="border border-gris-mid rounded-lg overflow-hidden">
      <div className="bg-gris px-2 py-1 text-[10px] font-bold text-gris-dark uppercase tracking-wide">{titulo}</div>
      <table className="w-full text-xs">
        <tbody>
          {lineas.map((x, i) => {
            const auto = !!x.codigo && !!omitibles.get(x.codigo)?.automatico && !x.manual
            const detalle = [
              x.cantidad != null && x.unidad !== '%' ? `${fmtCant(x.cantidad)}${x.unidad ? ` ${UNIDAD_LABEL[x.unidad]}` : ''}` : '',
              x.porcentaje != null ? `${fmtCant(x.porcentaje)} %` : '',
              x.base != null && x.base !== 0 ? `s/ ${fmtN(x.base)}` : '',
            ].filter(Boolean).join(' · ')
            return (
              <tr key={`${x.codigo ?? x.nombre}-${i}`} className="border-t border-gris">
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span>{x.nombre}</span>
                    {x.codigo_arca && <span className="text-[9px] text-gris-dark font-mono">{x.codigo_arca}</span>}
                    {x.a_confirmar && <MarcaAConfirmar />}
                    {x.manual && <span className="text-[9px] px-1 rounded bg-azul-light text-azul font-bold">manual</span>}
                    {!x.en_recibo && <span className="text-[9px] text-gris-dark">(no se imprime)</span>}
                  </div>
                  {detalle && <div className="text-[10px] text-gris-dark">{detalle}</div>}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap align-top">{fmtN(x.importe)}</td>
                <td className="px-1 py-1 w-6 align-top">
                  {auto && x.codigo && (
                    <button type="button" disabled={soloLectura} title="Sacar este concepto automático de este recibo"
                      className="text-gris-dark hover:text-rojo disabled:opacity-40" onClick={() => onOmitir(x.codigo!)}>
                      {omitir.includes(x.codigo) ? '↺' : '✕'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          <tr className="border-t border-gris-mid font-bold">
            <td className="px-2 py-1">Total</td>
            <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtN(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PanelSugerencias({ sg, tipo, onUsarHoras, onUsarPrestamo, onUsarConcepto, soloLectura }: {
  sg: SugerenciasRecibo
  tipo: LiquidacionDetalle['tipo']
  onUsarHoras: (h: number) => void
  onUsarPrestamo: (v: number) => void
  onUsarConcepto: (codigo: string, importe: number | null, cantidad?: number | null) => void
  soloLectura: boolean
}) {
  const [verDias, setVerDias] = useState(false)
  const items: ReactNode[] = []
  if (sg.horas_tarja) {
    items.push(
      <div key="tarja" className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span>Tarja del {fmtFecha(sg.horas_tarja.desde)} al {fmtFecha(sg.horas_tarja.hasta)}: <b>{fmtCant(sg.horas_tarja.horas)} hs</b>
            {sg.horas_tarja.dias.length > 0 && <button type="button" className="underline ml-1" onClick={() => setVerDias(v => !v)}>{verDias ? 'ocultar' : 'ver días'}</button>}
          </span>
          <Button type="button" size="sm" variant="secondary" disabled={soloLectura} onClick={() => onUsarHoras(sg.horas_tarja!.horas)}>Usar</Button>
        </div>
        {verDias && (
          <div className="text-[11px] text-gris-dark flex flex-wrap gap-x-3">
            {sg.horas_tarja.dias.map((d, i) => <span key={i}>{fmtFecha(d.fecha).slice(0, 5)} {d.obra_cod}: {fmtCant(d.horas)} h</span>)}
          </div>
        )}
      </div>,
    )
  }
  if (sg.prestamos && (sg.prestamos.saldo > 0 || !!sg.prestamos.en_borradores)) {
    items.push(
      <div key="prest" className="flex items-center justify-between gap-2">
        <span>Préstamos con saldo: <b>{fmtM(sg.prestamos.saldo)}</b> <span className="text-[11px]">(otorgado {fmtM(sg.prestamos.otorgado)}, descontado {fmtM(sg.prestamos.descontado)})</span>
          {!!sg.prestamos.en_borradores && <span className="block text-[11px] text-naranja-dark">Ya descontado en otra liquidación en borrador: {fmtM(sg.prestamos.en_borradores)}</span>}
        </span>
        <Button type="button" size="sm" variant="secondary" disabled={soloLectura} onClick={() => onUsarPrestamo(sg.prestamos!.saldo)}>Usar</Button>
      </div>,
    )
  }
  if (sg.sac && tipo === 'sac') {
    items.push(
      <div key="sac" className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span>SAC {sg.sac.semestre}º sem. {sg.sac.anio}: <b>{fmtM(sg.sac.importe)}</b> <span className="text-[11px]">(mejor remuneración {fmtM(sg.sac.mejor_remuneracion)}{sg.sac.proporcional ? `, proporcional ${sg.sac.dias_computados}/${sg.sac.dias_semestre} días` : ''})</span></span>
          <Button type="button" size="sm" variant="secondary" disabled={soloLectura} onClick={() => onUsarConcepto('sac', sg.sac!.importe)}>Usar</Button>
        </div>
        <ListaAvisos avisos={sg.sac.avisos} />
      </div>,
    )
  }
  if (sg.vacaciones && tipo === 'vacaciones') {
    items.push(
      <div key="vac" className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span>Vacaciones {sg.vacaciones.anio}: <b>{sg.vacaciones.dias} días × {fmtM(sg.vacaciones.valor_dia)} = {fmtM(sg.vacaciones.importe)}</b> <span className="text-[11px]">(antigüedad {sg.vacaciones.antiguedad_anios} años)</span></span>
          <Button type="button" size="sm" variant="secondary" disabled={soloLectura} onClick={() => onUsarConcepto('vacaciones', sg.vacaciones!.importe, sg.vacaciones!.dias)}>Usar</Button>
        </div>
        <ListaAvisos avisos={sg.vacaciones.avisos} />
      </div>,
    )
  }
  if (sg.final && tipo === 'final') {
    const f = sg.final
    items.push(
      <div key="final" className="flex flex-col gap-1">
        <div>Egreso {fmtFecha(f.fecha_egreso)}</div>
        <div className="flex items-center justify-between gap-2">
          <span>SAC proporcional: <b>{fmtM(f.sac_proporcional.importe)}</b></span>
          <Button type="button" size="sm" variant="secondary" disabled={soloLectura} onClick={() => onUsarConcepto('sac_proporcional', f.sac_proporcional.importe)}>Usar</Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Vacaciones no gozadas: <b>{fmtCant(f.vacaciones_no_gozadas.dias)} días × {fmtM(f.vacaciones_no_gozadas.valor_dia)} = {fmtM(f.vacaciones_no_gozadas.importe)}</b></span>
          <Button type="button" size="sm" variant="secondary" disabled={soloLectura}
            onClick={() => onUsarConcepto('vacaciones_no_gozadas', f.vacaciones_no_gozadas.importe, f.vacaciones_no_gozadas.dias)}>Usar</Button>
        </div>
        <div className="text-[11px]">La indemnización se agrega a mano con el concepto «Indemnización».</div>
        <ListaAvisos avisos={f.avisos} />
      </div>,
    )
  }
  if (items.length === 0) return null
  return (
    <div className="border border-azul/20 bg-azul-light/50 rounded-lg p-2 text-xs text-azul flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wide">Sugerencias</div>
      {items}
    </div>
  )
}
