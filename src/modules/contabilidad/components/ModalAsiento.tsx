'use client'

import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbAsiento, CtbAsientoInput, CtbAuxiliarTipo, CtbCuenta } from '@/types/contabilidad.types'
import { useCuentas, useGuardarAsiento, useObrasCtb } from '../hooks/useContabilidad'
import { TIPOS_ASIENTO_MANUAL, aCentavos, fmtM, hoyAR, numeroAsiento, r2 } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, inputCls } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'
import { SelectorAuxiliar } from './SelectorAuxiliar'

/**
 * Cargar o editar un asiento manual.
 *
 * La grilla es lo central: una fila por línea con cuenta (por código o
 * nombre), debe, haber, auxiliar (solo si la cuenta lo pide), obra y glosa.
 * Los totales Debe / Haber y la diferencia están SIEMPRE a la vista, y
 * «Confirmar» no se habilita si el asiento no cuadra.
 *
 *  - «Guardar borrador» acepta un asiento a medias (1 línea, sin cuadrar):
 *    es para seguir después. No numera ni entra en los reportes.
 *  - «Confirmar» exige ≥ 2 líneas, Debe = Haber > 0 y el auxiliar de las
 *    cuentas que lo piden. La base lo vuelve a validar (partida doble diferida).
 *  - Las filas completamente vacías se ignoran al guardar.
 *  - Todas las sumas en centavos enteros: 0,10 + 0,20 cuadra con 0,30.
 *
 * Si el período está cerrado el asiento no se edita (se ve en la ficha).
 */

const lineaSchema = z.object({
  cuenta_id:  z.string(),
  debe:       z.string(),
  haber:      z.string(),
  aux_id:     z.string(),
  aux_nombre: z.string(),
  obra_cod:   z.string(),
  glosa:      z.string().max(300, 'Hasta 300 caracteres'),
})

type LineaForm = z.infer<typeof lineaSchema>

const vacia = (l: LineaForm) =>
  !l.cuenta_id && aCentavos(l.debe) === 0 && aCentavos(l.haber) === 0 && !l.glosa.trim() && !l.obra_cod && !l.aux_id

const schema = z.object({
  fecha:  z.string().min(1, 'Poné la fecha'),
  tipo:   z.enum(['manual', 'ajuste', 'apertura']),
  glosa:  z.string().refine(v => v.trim().length >= 3, 'Escribí la glosa (al menos 3 caracteres)').refine(v => v.length <= 500, 'Hasta 500 caracteres'),
  lineas: z.array(lineaSchema),
}).superRefine((d, ctx) => {
  let usadas = 0
  d.lineas.forEach((l, i) => {
    if (vacia(l)) return
    usadas++
    if (!l.cuenta_id) ctx.addIssue({ code: 'custom', path: ['lineas', i, 'cuenta_id'], message: 'Elegí la cuenta' })
    const deb = aCentavos(l.debe), hab = aCentavos(l.haber)
    if ((deb > 0) === (hab > 0)) {
      ctx.addIssue({ code: 'custom', path: ['lineas', i, 'debe'], message: deb > 0 ? 'Debe o Haber, no los dos' : 'Poné el importe en Debe o en Haber' })
    }
  })
  if (usadas === 0) ctx.addIssue({ code: 'custom', path: ['lineas'], message: 'Cargá al menos una línea' })
})

type FormData = z.infer<typeof schema>

const LINEA_VACIA: LineaForm = { cuenta_id: '', debe: '', haber: '', aux_id: '', aux_nombre: '', obra_cod: '', glosa: '' }

const CAMPOS_FORM = /^(fecha|tipo|glosa|lineas\.\d+\.(cuenta_id|debe|haber|aux_id|obra_cod|glosa))$/

function defaultsDe(a: CtbAsiento | null): FormData {
  if (!a) return { fecha: hoyAR(), tipo: 'manual', glosa: '', lineas: [LINEA_VACIA, LINEA_VACIA] }
  return {
    fecha: a.fecha,
    tipo:  a.tipo === 'ajuste' || a.tipo === 'apertura' ? a.tipo : 'manual',
    glosa: a.glosa,
    lineas: a.lineas.map(l => ({
      cuenta_id:  String(l.cuenta_id),
      debe:       l.debe > 0 ? String(l.debe) : '',
      haber:      l.haber > 0 ? String(l.haber) : '',
      aux_id:     l.aux_id ? String(l.aux_id) : '',
      aux_nombre: l.aux_nombre ?? '',
      obra_cod:   l.obra_cod ?? '',
      glosa:      l.glosa ?? '',
    })),
  }
}

export function ModalAsiento({ asiento, onClose, onGuardado }: {
  /** null = nuevo. */
  asiento:    CtbAsiento | null
  onClose:    () => void
  onGuardado: (a: CtbAsiento) => void
}) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, asientosManuales } = usePermisos('contabilidad')
  const guardar = useGuardarAsiento()
  const cuentasQ = useCuentas({ incluirInactivas: true })
  const obrasQ = useObrasCtb()
  const [errorServer, setErrorServer] = useState<string | null>(null)

  const esEdicion = !!asiento
  const soloLectura = !!asiento && (
    asiento.periodo_estado === 'cerrado' || asiento.estado === 'anulado' || !!asiento.revierte_id
    || !!asiento.origen_tabla || !!asiento.revertido_por_id
  )
  const permitido = asientosManuales && (esEdicion ? puedeEditar : puedeCrear)

  const { register, control, handleSubmit, setValue, setError, getValues, clearErrors, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaultsDe(asiento),
  })
  const { fields, append, remove, insert } = useFieldArray({ control, name: 'lineas' })
  const lineas = useWatch({ control, name: 'lineas' })

  const cuentasPorId = useMemo(() => new Map((cuentasQ.data ?? []).map(c => [String(c.id), c])), [cuentasQ.data])

  // ── Totales en centavos ──
  const tot = useMemo(() => {
    const ls = (lineas ?? []).filter(l => !vacia(l))
    const debe = ls.reduce((s, l) => s + aCentavos(l.debe), 0)
    const haber = ls.reduce((s, l) => s + aCentavos(l.haber), 0)
    return { debe: debe / 100, haber: haber / 100, dif: (debe - haber) / 100, cuadra: debe === haber && debe > 0, usadas: ls.length }
  }, [lineas])

  const faltaAux = (lineas ?? []).some(l => {
    if (vacia(l) || !l.cuenta_id) return false
    const c = cuentasPorId.get(l.cuenta_id)
    return !!c && c.auxiliar !== 'none' && !l.aux_id
  })

  const bloqueoConfirmar = !permitido ? 'No tenés permiso para cargar asientos'
    : tot.usadas < 2 ? 'Faltan líneas: un asiento confirmado lleva al menos dos'
    : tot.debe === 0 && tot.haber === 0 ? 'El asiento no tiene importes'
    : !tot.cuadra ? `No cuadra: diferencia ${fmtM(Math.abs(tot.dif))}`
    : faltaAux ? 'Hay líneas sin el auxiliar que pide su cuenta'
    : null

  const opcionesObra = useMemo(() => (obrasQ.data ?? []).map(o => ({
    value: o.cod,
    label: `${o.cod} — ${o.nom}`,
    sub:   o.archivada ? 'archivada' : undefined,
    search: [o.cod, o.nom],
  })), [obrasQ.data])

  function elegirCuenta(i: number, id: string, c: CtbCuenta | null) {
    const antes = cuentasPorId.get(getValues(`lineas.${i}.cuenta_id`))
    setValue(`lineas.${i}.cuenta_id`, id, { shouldValidate: !!errors.lineas?.[i]?.cuenta_id })
    // Cambió el tipo de auxiliar: el elegido ya no corresponde.
    const tipoAntes: CtbAuxiliarTipo = antes?.auxiliar ?? 'none'
    if ((c?.auxiliar ?? 'none') !== tipoAntes) {
      setValue(`lineas.${i}.aux_id`, '')
      setValue(`lineas.${i}.aux_nombre`, '')
    }
  }

  /** Pone en la línea `i` lo que falta para cuadrar (del lado que corresponda). */
  function cuadrarEn(i: number) {
    const ls = getValues('lineas')
    const otras = ls.filter((l, j) => j !== i && !vacia(l))
    const deb = otras.reduce((s, l) => s + aCentavos(l.debe), 0)
    const hab = otras.reduce((s, l) => s + aCentavos(l.haber), 0)
    const dif = deb - hab
    if (dif === 0) return
    setValue(`lineas.${i}.debe`, dif < 0 ? String(-dif / 100) : '')
    setValue(`lineas.${i}.haber`, dif > 0 ? String(dif / 100) : '')
    clearErrors(`lineas.${i}.debe`)
  }

  async function enviar(d: FormData, estado: 'borrador' | 'confirmado') {
    setErrorServer(null)
    const conIndice = d.lineas.map((l, i) => ({ l, i })).filter(x => !vacia(x.l))

    if (estado === 'confirmado') {
      let hayError = false
      for (const { l, i } of conIndice) {
        const c = cuentasPorId.get(l.cuenta_id)
        if (c && c.auxiliar !== 'none' && !l.aux_id) {
          setError(`lineas.${i}.aux_id`, { message: 'Esta cuenta pide el auxiliar' })
          hayError = true
        }
      }
      if (hayError || bloqueoConfirmar) {
        setErrorServer(bloqueoConfirmar ?? 'Completá el auxiliar de las líneas marcadas.')
        return
      }
    }

    // Índices de la API → índices de la grilla, para marcar el campo que rebotó.
    const indiceGrilla = conIndice.map(x => x.i)
    const body: CtbAsientoInput = {
      fecha:  d.fecha,
      tipo:   d.tipo,
      glosa:  d.glosa.trim(),
      estado,
      lineas: conIndice.map(({ l }) => {
        const c = cuentasPorId.get(l.cuenta_id)
        return {
          cuenta_id: Number(l.cuenta_id),
          debe:      r2(aCentavos(l.debe) / 100),
          haber:     r2(aCentavos(l.haber) / 100),
          aux_id:    c && c.auxiliar !== 'none' && l.aux_id ? Number(l.aux_id) : null,
          obra_cod:  l.obra_cod || null,
          glosa:     l.glosa.trim(),
        }
      }),
    }
    try {
      const a = await guardar.mutateAsync({ id: asiento?.id ?? null, ...body })
      toast(estado === 'confirmado'
        ? `✓ Asiento confirmado${a.numero ? ` (${numeroAsiento(a.numero)})` : ': se numera al cerrar el período'}`
        : '✓ Borrador guardado', 'ok')
      onGuardado(a)
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce) {
        const m = /^lineas\.(\d+)\.(.+)$/.exec(ce.campo)
        const campo = m ? `lineas.${indiceGrilla[Number(m[1])] ?? Number(m[1])}.${m[2]}` : ce.campo
        if (CAMPOS_FORM.test(campo)) setError(campo as FieldPath<FormData>, { message: ce.mensaje })
      }
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  const titulo = !asiento ? 'Nuevo asiento'
    : `Asiento ${numeroAsiento(asiento.numero)}${asiento.estado === 'borrador' ? ' (borrador)' : ''}`

  if (soloLectura) {
    return (
      <Modal open onClose={onClose} title={titulo} width="max-w-lg">
        <Aviso tono="gris">
          {asiento?.periodo_estado === 'cerrado'
            ? 'El período de este asiento está cerrado: no se edita. Para corregirlo, anulalo (genera un contraasiento) o reabrí el período.'
            : 'Este asiento no se puede editar.'}
        </Aviso>
      </Modal>
    )
  }

  const guardando = guardar.isPending
  const errorLineas = errors.lineas?.message ?? errors.lineas?.root?.message
  const permisoTxt = 'No tenés permiso para cargar asientos (hace falta «Cargar asientos manuales»)'

  return (
    <Modal
      open
      onClose={guardando ? () => {} : onClose}
      width="max-w-6xl"
      title={titulo}
      footer={
        <div className="flex gap-2 flex-wrap justify-end items-center w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="secondary" size="sm" loading={guardando} disabled={!permitido}
            title={!permitido ? permisoTxt : 'Guardar para seguir después: no tiene que cuadrar y no entra en los reportes'}
            onClick={handleSubmit(d => enviar(d, 'borrador'))}>
            Guardar borrador
          </Button>
          <Button size="sm" loading={guardando} disabled={!!bloqueoConfirmar}
            title={bloqueoConfirmar ?? 'Confirmar: entra en el diario, el mayor y sumas y saldos'}
            onClick={handleSubmit(d => enviar(d, 'confirmado'))}>
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!permitido && <Aviso tono="amarillo">{permisoTxt}. Podés mirar, pero no guardar.</Aviso>}
        {asiento?.estado === 'confirmado' && (
          <Aviso tono="amarillo">
            Este asiento está confirmado. Si lo guardás como borrador vuelve a borrador y sale de los reportes hasta que lo confirmes de nuevo.
          </Aviso>
        )}

        {/* Encabezado */}
        <div className="grid grid-cols-1 sm:grid-cols-[160px_160px_1fr] gap-2">
          <Campo label="Fecha" error={errors.fecha?.message}>
            <input type="date" {...register('fecha')} className={inputCls} />
          </Campo>
          <Campo label="Tipo" error={errors.tipo?.message}>
            <select {...register('tipo')} className={inputCls}>
              {TIPOS_ASIENTO_MANUAL.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Glosa" hint="qué registra el asiento" error={errors.glosa?.message}>
            <input {...register('glosa')} placeholder="Ej.: Aporte de capital de los socios" maxLength={500} className={inputCls} />
          </Campo>
        </div>

        {/* Grilla de líneas */}
        <div className="border border-gris-mid rounded-lg">
          <div className="hidden md:grid grid-cols-[minmax(220px,2.2fr)_130px_130px_minmax(150px,1.3fr)_minmax(150px,1.3fr)_minmax(120px,1fr)_64px] gap-2 px-2 py-1.5 bg-gris rounded-t-lg text-[10px] font-bold text-gris-dark uppercase tracking-wide">
            <div>Cuenta</div>
            <div className="text-right">Debe</div>
            <div className="text-right">Haber</div>
            <div>Auxiliar</div>
            <div>Obra</div>
            <div>Glosa</div>
            <div />
          </div>

          {fields.map((f, i) => {
            const l = lineas?.[i]
            const c = l?.cuenta_id ? cuentasPorId.get(l.cuenta_id) : undefined
            const aux = c?.auxiliar ?? 'none'
            const errL = errors.lineas?.[i]
            return (
              <div key={f.id} className="grid grid-cols-2 md:grid-cols-[minmax(220px,2.2fr)_130px_130px_minmax(150px,1.3fr)_minmax(150px,1.3fr)_minmax(120px,1fr)_64px] gap-2 px-2 py-2 border-t border-gris first:border-t-0 md:first:border-t items-start">
                <div className="col-span-2 md:col-span-1">
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Línea {i + 1} · Cuenta</span>
                  <SelectorCuenta value={l?.cuenta_id ?? ''} onChange={(id, cta) => elegirCuenta(i, id, cta)} />
                  {errL?.cuenta_id?.message && <span className="text-xs text-rojo font-semibold">{errL.cuenta_id.message}</span>}
                </div>
                <div>
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Debe</span>
                  <Controller control={control} name={`lineas.${i}.debe`} render={({ field }) => (
                    <InputMonto value={field.value} className="text-right font-mono tabular-nums" error={errL?.debe?.message}
                      onChange={v => { field.onChange(v); if (aCentavos(v) > 0) setValue(`lineas.${i}.haber`, '') }} />
                  )} />
                </div>
                <div>
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Haber</span>
                  <Controller control={control} name={`lineas.${i}.haber`} render={({ field }) => (
                    <InputMonto value={field.value} className="text-right font-mono tabular-nums" error={errL?.haber?.message}
                      onChange={v => { field.onChange(v); if (aCentavos(v) > 0) setValue(`lineas.${i}.debe`, '') }} />
                  )} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Auxiliar</span>
                  {aux === 'none' ? (
                    <div className="px-2.5 py-2 text-xs text-gris-mid" title={c ? 'Esta cuenta no lleva auxiliar' : 'Primero elegí la cuenta'}>—</div>
                  ) : (
                    <SelectorAuxiliar tipo={aux} value={l?.aux_id ?? ''} nombre={l?.aux_nombre ?? ''} error={errL?.aux_id?.message}
                      onChange={(id, nombre) => { setValue(`lineas.${i}.aux_id`, id); setValue(`lineas.${i}.aux_nombre`, nombre); clearErrors(`lineas.${i}.aux_id`) }} />
                  )}
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Obra (opcional)</span>
                  <Combobox options={opcionesObra} value={l?.obra_cod ?? ''} placeholder="Obra…"
                    onChange={v => setValue(`lineas.${i}.obra_cod`, v)} />
                  {errL?.obra_cod?.message && <span className="text-xs text-rojo font-semibold">{errL.obra_cod.message}</span>}
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="md:hidden text-[10px] font-bold text-gris-dark uppercase">Glosa de la línea</span>
                  <input {...register(`lineas.${i}.glosa`)} maxLength={300} placeholder="Opcional" className={inputCls} />
                </div>
                <div className="col-span-2 md:col-span-1 flex gap-1 justify-end md:pt-1">
                  <button type="button" onClick={() => cuadrarEn(i)} disabled={tot.cuadra}
                    title={tot.cuadra ? 'Ya cuadra' : 'Poner acá lo que falta para cuadrar'}
                    className="w-7 h-7 rounded text-xs font-bold text-azul hover:bg-azul-light disabled:opacity-30 disabled:cursor-not-allowed">=</button>
                  <button type="button" onClick={() => remove(i)} disabled={fields.length <= 1}
                    title={fields.length <= 1 ? 'El asiento necesita al menos una línea' : 'Quitar la línea'}
                    className="w-7 h-7 rounded text-xs font-bold text-rojo hover:bg-rojo-light disabled:opacity-30 disabled:cursor-not-allowed">✕</button>
                </div>
              </div>
            )
          })}

          <div className="flex gap-2 px-2 py-2 border-t border-gris">
            <Button variant="secondary" size="sm" onClick={() => append(LINEA_VACIA)} disabled={fields.length >= 500}
              title={fields.length >= 500 ? 'Máximo 500 líneas' : 'Agregar una línea'}>
              + Línea
            </Button>
            <Button variant="ghost" size="sm" onClick={() => insert(0, LINEA_VACIA)} disabled={fields.length >= 500}>
              + Línea arriba
            </Button>
          </div>

          {/* Totales: siempre a la vista */}
          <div className="sticky bottom-0 grid grid-cols-3 gap-2 px-3 py-2.5 border-t-2 border-gris-mid bg-blanco rounded-b-lg">
            <div>
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">Total Debe</div>
              <div className="font-mono font-bold tabular-nums text-azul">{fmtM(tot.debe)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">Total Haber</div>
              <div className="font-mono font-bold tabular-nums text-azul">{fmtM(tot.haber)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">Diferencia</div>
              <div className={`font-mono font-bold tabular-nums ${tot.cuadra ? 'text-verde' : tot.dif === 0 ? 'text-gris-dark' : 'text-rojo'}`}>
                {tot.cuadra ? '✓ Cuadra' : tot.dif === 0 ? fmtM(0) : `${fmtM(Math.abs(tot.dif))} ${tot.dif > 0 ? '(falta Haber)' : '(falta Debe)'}`}
              </div>
            </div>
          </div>
        </div>

        {errorLineas && <span className="text-xs text-rojo font-semibold">{errorLineas}</span>}
        {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
      </div>
    </Modal>
  )
}
