'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, useWatch, Controller, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { ConceptoListado, ConceptoValor, Convenio } from '@/types/sueldos.types'
import { useBorrarConceptoValor, useConceptos, useGuardarConcepto, useGuardarConceptoValor } from '../../hooks/useSueldos'
import {
  BASE_LABEL, CALCULO_LABEL, CONDICION_LABEL, DESTINO_LABEL, GRUPO_LABEL, TIPO_CONCEPTO_LABEL, UNIDAD_LABEL,
  fmtCant, fmtFecha, fmtM, hoyAR, numONull,
} from '../../utils/sueldos.utils'
import { errorDeCampoSueldos, mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Campo, Check, MarcaAConfirmar, inputCls } from '../Comun'

const TIPOS = ['remunerativo', 'no_remunerativo', 'descuento', 'contribucion'] as const
const CALCULOS = ['manual', 'cantidad_x_escala', 'porcentaje', 'monto_fijo', 'por_unidad'] as const
const BASES = ['', 'basico', 'remunerativo', 'bruto_rem_no_rem', 'sereno_zona_a'] as const
const CONDICIONES = ['siempre', 'afiliado', 'no_afiliado', 'antiguedad_menor_1', 'antiguedad_mayor_igual_1', 'rifl', 'no_rifl'] as const
const GRUPOS = ['', 'sindical', 'seguridad_social', 'obra_social', 'inssjp', 'art', 'camaras', 'otros'] as const
const DESTINOS = ['', 'f931', 'sindicato', 'fondo_cese', 'prestamo', 'otros'] as const
const UNIDADES = ['', 'horas', 'dias', 'km', '%', '$', 'anios', 'unidades'] as const

const schema = z.object({
  comun:              z.boolean(),
  codigo:             z.string().trim().regex(/^[a-z0-9_]{1,40}$/, 'Minúsculas, números y guion bajo'),
  nombre:             z.string().trim().min(2, 'Poné el nombre').max(120),
  tipo:               z.enum(TIPOS),
  calculo:            z.enum(CALCULOS),
  base:               z.enum(BASES),
  condicion:          z.enum(CONDICIONES),
  codigo_arca:        z.string().trim().regex(/^(\d{6})?$/, '6 dígitos'),
  grupo_contribucion: z.enum(GRUPOS),
  destino:            z.enum(DESTINOS),
  parametro_clave:    z.string().trim().regex(/^([a-z0-9_]{2,60})?$/, 'Clave inválida'),
  unidad:             z.enum(UNIDADES),
  orden:              z.string().regex(/^\d{0,4}$/, 'Número entero'),
  en_recibo:          z.boolean(),
  automatico:         z.boolean(),
  activo:             z.boolean(),
  jubilados:          z.enum(['todos', 'excluye', 'solo']),
  obs:                z.string().max(1000),
}).superRefine((d, ctx) => {
  if (d.calculo === 'porcentaje' && !d.base) ctx.addIssue({ code: 'custom', path: ['base'], message: 'Elegí sobre qué base se aplica' })
  if ((d.tipo === 'descuento' || d.tipo === 'contribucion') && !d.destino) ctx.addIssue({ code: 'custom', path: ['destino'], message: 'Elegí adónde va' })
})
type FormData = z.infer<typeof schema>
const CAMPOS = new Set(Object.keys(schema.shape))

/** Ficha de un concepto: su definición y el historial de valores con vigencia. */
export function ModalConcepto({ convenio, concepto, noConfig, onClose }: {
  convenio: Convenio; concepto: ConceptoListado | null; noConfig: string | null; onClose: () => void
}) {
  const toast = useToast()
  const guardar = useGuardarConcepto()
  // Siempre la versión fresca (después de guardar un valor, la lista se invalida).
  const conceptos = useConceptos({ convenio_id: convenio.id, incluir_inactivos: true }, !!concepto)
  const c = concepto ? (conceptos.data?.find(x => x.id === concepto.id) ?? concepto) : null
  const [error, setErrorServer] = useState<string | null>(null)
  const soloLectura = !!noConfig

  const { register, control, handleSubmit, setError, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: c ? {
      comun: c.convenio_id === null, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, calculo: c.calculo, base: c.base ?? '',
      condicion: c.condicion, codigo_arca: c.codigo_arca ?? '', grupo_contribucion: c.grupo_contribucion ?? '', destino: c.destino ?? '',
      parametro_clave: c.parametro_clave ?? '', unidad: c.unidad ?? '', orden: String(c.orden ?? ''), en_recibo: c.en_recibo,
      automatico: c.automatico, activo: c.activo, obs: c.obs ?? '',
      jubilados: c.solo_jubilados ? 'solo' : c.excluye_jubilados ? 'excluye' : 'todos',
    } : {
      comun: false, codigo: '', nombre: '', tipo: 'remunerativo', calculo: 'manual', base: '', condicion: 'siempre', codigo_arca: '',
      grupo_contribucion: '', destino: '', parametro_clave: '', unidad: '', orden: '', en_recibo: true, automatico: false, activo: true, obs: '', jubilados: 'todos',
    },
  })
  const tipo = useWatch({ control, name: 'tipo' })
  const calculo = useWatch({ control, name: 'calculo' })

  async function enviar(d: FormData) {
    setErrorServer(null)
    const comun = {
      nombre: d.nombre.trim(), tipo: d.tipo, calculo: d.calculo, base: d.base || null, condicion: d.condicion,
      codigo_arca: d.codigo_arca || null, grupo_contribucion: d.tipo === 'contribucion' ? (d.grupo_contribucion || null) : null,
      destino: d.tipo === 'descuento' || d.tipo === 'contribucion' ? (d.destino || null) : null,
      parametro_clave: d.parametro_clave || null, unidad: d.unidad || null,
      ...(d.orden ? { orden: Number(d.orden) } : {}),
      en_recibo: d.en_recibo, automatico: d.automatico, activo: d.activo, obs: d.obs,
      excluye_jubilados: d.jubilados === 'excluye', solo_jubilados: d.jubilados === 'solo',
    }
    try {
      const r = c
        ? await guardar.mutateAsync({ id: c.id, ...comun })
        : await guardar.mutateAsync({ id: null, convenio_id: d.comun ? null : convenio.id, codigo: d.codigo, ...comun })
      toast(`✓ Concepto ${r.nombre} guardado`, 'ok')
      if (!c) onClose()
    } catch (e) {
      const ce = errorDeCampoSueldos(e)
      if (ce && CAMPOS.has(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-3xl"
      title={c ? c.nombre : `Nuevo concepto · ${convenio.nombre}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardar.isPending}>Cerrar</Button>
        <Button size="sm" disabled={soloLectura || (!!c && !isDirty)} title={noConfig ?? undefined} loading={guardar.isPending} onClick={handleSubmit(enviar)}>
          {c ? 'Guardar cambios' : 'Crear concepto'}
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {c?.pisado_por && <Aviso tono="gris">Este concepto común está reemplazado en {convenio.nombre} por uno propio del convenio: acá no se aplica.</Aviso>}
        {c && c.convenio_id === null && <Aviso tono="azul">Concepto común a todos los convenios: los cambios valen para todos.</Aviso>}

        <fieldset disabled={soloLectura} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Campo label="Nombre" className="col-span-2" error={errors.nombre?.message}>
            <input className={inputCls} {...register('nombre')} />
          </Campo>
          <Campo label="Código interno" hint={c ? 'no se cambia' : undefined} error={errors.codigo?.message}>
            <input className={`${inputCls} font-mono`} {...register('codigo')} disabled={!!c} />
          </Campo>
          <Campo label="Código ARCA" hint="LSD" error={errors.codigo_arca?.message}>
            <input className={`${inputCls} font-mono`} {...register('codigo_arca')} maxLength={6} inputMode="numeric" />
          </Campo>
          <Campo label="Tipo">
            <select className={inputCls} {...register('tipo')}>{TIPOS.map(t => <option key={t} value={t}>{TIPO_CONCEPTO_LABEL[t]}</option>)}</select>
          </Campo>
          <Campo label="Cálculo">
            <select className={inputCls} {...register('calculo')}>{CALCULOS.map(t => <option key={t} value={t}>{CALCULO_LABEL[t]}</option>)}</select>
          </Campo>
          <Campo label="Base del %" error={errors.base?.message}>
            <select className={inputCls} {...register('base')} disabled={soloLectura || calculo !== 'porcentaje'}>
              <option value="">—</option>
              {BASES.filter(Boolean).map(b => <option key={b} value={b}>{BASE_LABEL[b as Exclude<typeof b, ''>]}</option>)}
            </select>
          </Campo>
          <Campo label="Unidad">
            <select className={inputCls} {...register('unidad')}>
              <option value="">—</option>
              {UNIDADES.filter(Boolean).map(u => <option key={u} value={u}>{UNIDAD_LABEL[u as Exclude<typeof u, ''>]}</option>)}
            </select>
          </Campo>
          <Campo label="Se aplica" className="col-span-2">
            <select className={inputCls} {...register('condicion')}>{CONDICIONES.map(t => <option key={t} value={t}>{CONDICION_LABEL[t]}</option>)}</select>
          </Campo>
          {(tipo === 'descuento' || tipo === 'contribucion') && (
            <Campo label="Destino (pasivo)" error={errors.destino?.message}>
              <select className={inputCls} {...register('destino')}>
                <option value="">—</option>
                {DESTINOS.filter(Boolean).map(t => <option key={t} value={t}>{DESTINO_LABEL[t as Exclude<typeof t, ''>]}</option>)}
              </select>
            </Campo>
          )}
          {tipo === 'contribucion' && (
            <Campo label="Grupo en el recibo">
              <select className={inputCls} {...register('grupo_contribucion')}>
                <option value="">—</option>
                {GRUPOS.filter(Boolean).map(t => <option key={t} value={t}>{GRUPO_LABEL[t as Exclude<typeof t, ''>]}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Valor desde parámetro" hint="opcional" error={errors.parametro_clave?.message}>
            <input className={`${inputCls} font-mono`} {...register('parametro_clave')} placeholder="p. ej. art_pct" />
          </Campo>
          <Campo label="Orden" error={errors.orden?.message}>
            <input className={inputCls} inputMode="numeric" {...register('orden')} />
          </Campo>
          <Campo label="Jubilados" hint="quien tiene «Jubilado» en la ficha" className="col-span-2">
            <select className={inputCls} {...register('jubilados')}>
              <option value="todos">Se aplica igual a todos</option>
              <option value="excluye">No se aplica a jubilados (INSSJP, obra social…)</option>
              <option value="solo">Solo a jubilados</option>
            </select>
          </Campo>
          <div className="col-span-2 md:col-span-4 flex flex-wrap gap-4">
            <Controller control={control} name="automatico" render={({ field }) => (
              <Check label="Automático (entra solo si cumple la condición)" checked={field.value} onChange={field.onChange} disabled={soloLectura} />
            )} />
            <Controller control={control} name="en_recibo" render={({ field }) => <Check label="Se imprime en el recibo" checked={field.value} onChange={field.onChange} disabled={soloLectura} />} />
            <Controller control={control} name="activo" render={({ field }) => <Check label="Activo" checked={field.value} onChange={field.onChange} disabled={soloLectura} />} />
            {!c && <Controller control={control} name="comun" render={({ field }) => (
              <Check label="Común a todos los convenios" checked={field.value} onChange={field.onChange} disabled={soloLectura} />
            )} />}
          </div>
          <Campo label="Observaciones" className="col-span-2 md:col-span-4">
            <textarea rows={2} className={inputCls} {...register('obs')} />
          </Campo>
        </fieldset>
        {error && <Aviso tono="rojo">{error}</Aviso>}

        {c && <ValoresConcepto concepto={c} noConfig={noConfig} />}
      </div>
    </Modal>
  )
}

// ── Valores con vigencia ─────────────────────────────────────────────

const valorSchema = z.object({
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha'),
  porcentaje:    z.string().regex(/^\s*-?\d{0,6}([.,]\d{0,4})?\s*$/, 'Número inválido'),
  monto:         z.string().regex(/^\s*-?\d{0,12}([.,]\d{0,2})?\s*$/, 'Número inválido'),
  a_confirmar:   z.boolean(),
  fuente:        z.string().max(300),
}).refine(v => numONull(v.porcentaje) !== null || numONull(v.monto) !== null, { path: ['monto'], message: 'Poné un porcentaje o un monto' })
type ValorForm = z.infer<typeof valorSchema>

function ValoresConcepto({ concepto: c, noConfig }: { concepto: ConceptoListado; noConfig: string | null }) {
  const [editando, setEditando] = useState<ConceptoValor | 'nuevo' | null>(null)
  const borrar = useBorrarConceptoValor()
  const toast = useToast()

  if (c.parametro_clave) {
    return (
      <Aviso tono="azul">
        El valor de este concepto sale del parámetro <b className="font-mono">{c.parametro_clave}</b>
        {c.valor_vigente ? ` (hoy ${c.valor_vigente.porcentaje != null ? `${fmtCant(c.valor_vigente.porcentaje)} %` : fmtM(c.valor_vigente.monto)})` : ''}.{' '}
        <Link href="/sueldos?tab=configuracion" className="underline font-semibold">Editarlo en Configuración</Link>
      </Aviso>
    )
  }
  if (c.calculo === 'manual' || c.calculo === 'cantidad_x_escala') {
    return <p className="text-xs text-gris-dark">{c.calculo === 'manual' ? 'Se carga el importe en cada recibo: no lleva valor.' : 'Toma el valor de la escala de la categoría.'}</p>
  }

  async function quitar(v: ConceptoValor) {
    if (!window.confirm(`¿Borrar el valor vigente desde el ${fmtFecha(v.vigente_desde)}?`)) return
    try {
      await borrar.mutateAsync(v.id)
      toast('✓ Valor borrado', 'ok')
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-azul uppercase tracking-wider">Valores con vigencia</h4>
        <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Cargar un valor desde una fecha'} onClick={() => setEditando('nuevo')}>+ Valor</Button>
      </div>
      {!c.valor_vigente && <Aviso tono="rojo">Sin valor vigente hoy: el concepto no se aplica.</Aviso>}
      {editando && <FormValor concepto={c} valor={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />}
      {c.valores.length === 0 ? <p className="text-xs text-gris-dark italic">Sin valores cargados.</p> : (
        <table className="w-full text-xs">
          <tbody>
            {c.valores.map(v => (
              <tr key={v.id} className="border-t border-gris">
                <td className="py-1 pr-2">desde {fmtFecha(v.vigente_desde)}{c.valor_vigente?.vigente_desde === v.vigente_desde && <span className="text-verde font-bold"> · vigente</span>}</td>
                <td className="py-1 pr-2 text-right font-mono">{v.porcentaje != null ? `${fmtCant(v.porcentaje)} %` : ''}{v.porcentaje != null && v.monto != null ? ' + ' : ''}{v.monto != null ? fmtM(v.monto) : ''}</td>
                <td className="py-1 pr-2">{v.a_confirmar && <MarcaAConfirmar />}</td>
                <td className="py-1 pr-2 text-gris-dark hidden md:table-cell">{v.fuente}</td>
                <td className="py-1 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Corregir'} onClick={() => setEditando(v)}>✏</Button>
                  <Button size="sm" variant="ghost" disabled={!!noConfig} title={noConfig ?? 'Borrar'} onClick={() => quitar(v)}>🗑</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FormValor({ concepto: c, valor, onClose }: { concepto: ConceptoListado; valor: ConceptoValor | null; onClose: () => void }) {
  const toast = useToast()
  const guardar = useGuardarConceptoValor()
  const [error, setErrorServer] = useState<string | null>(null)
  const { register, control, handleSubmit, formState: { errors } } = useForm<ValorForm>({
    resolver: zodResolver(valorSchema),
    defaultValues: valor
      ? { vigente_desde: valor.vigente_desde, porcentaje: valor.porcentaje != null ? String(valor.porcentaje) : '', monto: valor.monto != null ? String(valor.monto) : '', a_confirmar: valor.a_confirmar, fuente: valor.fuente ?? '' }
      : { vigente_desde: hoyAR(), porcentaje: '', monto: '', a_confirmar: false, fuente: '' },
  })
  const esPct = c.calculo === 'porcentaje'

  async function enviar(d: ValorForm) {
    setErrorServer(null)
    const cuerpo = { porcentaje: numONull(d.porcentaje), monto: numONull(d.monto), a_confirmar: d.a_confirmar, fuente: d.fuente.trim() }
    try {
      if (valor) await guardar.mutateAsync({ id: valor.id, ...cuerpo })
      else await guardar.mutateAsync({ id: null, concepto_id: c.id, vigente_desde: d.vigente_desde, ...cuerpo })
      toast('✓ Valor guardado', 'ok')
      onClose()
    } catch (e) {
      setErrorServer(mensajeErrorSueldos(e))
    }
  }

  return (
    <div className="border border-naranja/40 bg-naranja-light/30 rounded-lg p-2 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
      <Campo label="Desde" error={errors.vigente_desde?.message}>
        <input type="date" className={inputCls} {...register('vigente_desde')} disabled={!!valor} />
      </Campo>
      <Campo label="Porcentaje" hint={esPct ? undefined : 'opcional'} error={errors.porcentaje?.message}>
        <input className={inputCls} inputMode="decimal" {...register('porcentaje')} />
      </Campo>
      <Campo label="Monto" hint={esPct ? 'opcional' : undefined} error={errors.monto?.message}>
        <input className={inputCls} inputMode="decimal" {...register('monto')} />
      </Campo>
      <Campo label="Fuente" className="col-span-2">
        <input className={inputCls} {...register('fuente')} />
      </Campo>
      <div className="col-span-2 md:col-span-3">
        <Controller control={control} name="a_confirmar" render={({ field }) => <Check label="A confirmar" checked={field.value} onChange={field.onChange} />} />
      </div>
      <div className="col-span-2 flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={guardar.isPending}>Cancelar</Button>
        <Button size="sm" loading={guardar.isPending} onClick={handleSubmit(enviar)}>Guardar valor</Button>
      </div>
      {error && <div className="col-span-2 md:col-span-5"><Aviso tono="rojo">{error}</Aviso></div>}
    </div>
  )
}
