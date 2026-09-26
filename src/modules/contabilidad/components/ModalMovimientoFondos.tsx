'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox'
import { InputMonto } from '@/components/ui/InputMonto'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { TesAdjuntoTipo, TesMoneda, TesMovimiento, TesMovimientoInput, TesMovTipo } from '@/types/contabilidad.types'
import {
  fetchAdjuntoMovimientoUrl, subirAdjuntoMovimiento, useBorrarAdjuntoMovimiento, useConceptosFondos, useGuardarMovimiento,
  useMovimientoFondos, useObrasCtb, useOpsMismoDia, usePeriodos, useSubirAdjuntoMovimiento, useTesoreria, validarArchivoFondos,
} from '../hooks/useContabilidad'
import { fmtFecha, fmtFechaHora, fmtM, hoyAR } from '../utils/contabilidad.utils'
import { errorDeCampoCtb, mensajeErrorCtb } from '../utils/contabilidad.errores'
import {
  TES_MOV_TIPOS, conceptoCompatible, equivalenteArs, esDepositoDeValores, fmtMoneda, numeroMovimiento, requisitosMoneda, sentidoLabel,
} from '../utils/fondos'
import { Aviso, Campo, ErrorCarga, inputCls } from './Comun'
import { ModalAnularMovimiento } from './ModalAnularMovimiento'

/**
 * Alta, detalle y edición de un movimiento de fondos (tanda 5).
 *
 * Un movimiento existente arranca en modo DETALLE (solo lectura) y «Editar»
 * habilita los campos, como en Choferes: evita ediciones accidentales en una
 * pantalla de consulta. Uno nuevo arranca editable.
 *
 * Monedas: si alguna cuenta es en dólares se pide la cotización; si las dos
 * cuentas de una transferencia son de monedas distintas, el importe que entra
 * en la de destino (la cotización sale de ahí). El equivalente en pesos que
 * se muestra es el mismo que calcula la base, que es la que manda.
 *
 * El adjunto opcional de un movimiento nuevo se sube DESPUÉS de crearlo: si
 * la subida falla, el movimiento ya quedó guardado y se avisa.
 */

const TIPOS_ADJUNTO: { key: TesAdjuntoTipo; label: string }[] = [
  { key: 'comprobante', label: 'Comprobante' },
  { key: 'vep',         label: 'VEP' },
  { key: 'extracto',    label: 'Extracto' },
  { key: 'otro',        label: 'Otro' },
]

const monto = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function crearSchema(monedaDe: (id: string) => TesMoneda | null) {
  return z.object({
    fecha:                z.string().min(1, 'Poné la fecha'),
    tipo:                 z.enum(['ingreso', 'egreso', 'transferencia']),
    tesoreria_id:         z.string().min(1, 'Elegí la cuenta'),
    tesoreria_destino_id: z.string(),
    concepto_id:          z.string(),
    importe:              z.string(),
    importe_destino:      z.string(),
    cotizacion:           z.string(),
    obra_cod:             z.string(),
    referencia:           z.string().max(120, 'Hasta 120 caracteres'),
    obs:                  z.string().max(1000, 'Hasta 1000 caracteres'),
  }).superRefine((d, ctx) => {
    if (d.fecha && d.fecha > hoyAR()) ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'No puede ser posterior a hoy' })
    if (!(monto(d.importe) > 0)) ctx.addIssue({ code: 'custom', path: ['importe'], message: 'Poné un importe mayor a cero' })
    if (d.tipo === 'transferencia') {
      if (!d.tesoreria_destino_id) ctx.addIssue({ code: 'custom', path: ['tesoreria_destino_id'], message: 'Elegí a qué cuenta va' })
      else if (d.tesoreria_destino_id === d.tesoreria_id) ctx.addIssue({ code: 'custom', path: ['tesoreria_destino_id'], message: 'Tiene que ser otra cuenta' })
    } else if (!d.concepto_id) {
      ctx.addIssue({ code: 'custom', path: ['concepto_id'], message: 'Elegí el concepto' })
    }
    const req = requisitosMoneda(d.tipo, monedaDe(d.tesoreria_id), d.tipo === 'transferencia' ? monedaDe(d.tesoreria_destino_id) : null)
    if (req.pideCotizacion && !(monto(d.cotizacion) > 0)) ctx.addIssue({ code: 'custom', path: ['cotizacion'], message: 'Poné la cotización del dólar' })
    if (req.pideImporteDestino && !(monto(d.importe_destino) > 0)) ctx.addIssue({ code: 'custom', path: ['importe_destino'], message: 'Poné cuánto entra en la cuenta de destino' })
  })
}
type FormData = z.infer<ReturnType<typeof crearSchema>>

const CAMPOS: ReadonlySet<string> = new Set([
  'fecha', 'tipo', 'tesoreria_id', 'tesoreria_destino_id', 'concepto_id', 'importe', 'importe_destino', 'cotizacion', 'obra_cod', 'referencia', 'obs',
])

function defaults(m: TesMovimiento | null): FormData {
  if (!m) {
    return {
      fecha: hoyAR(), tipo: 'egreso', tesoreria_id: '', tesoreria_destino_id: '', concepto_id: '', importe: '',
      importe_destino: '', cotizacion: '', obra_cod: '', referencia: '', obs: '',
    }
  }
  return {
    fecha: m.fecha, tipo: m.tipo, tesoreria_id: String(m.tesoreria_id),
    tesoreria_destino_id: m.tesoreria_destino_id ? String(m.tesoreria_destino_id) : '',
    concepto_id: m.concepto_id ? String(m.concepto_id) : '', importe: String(m.importe),
    importe_destino: m.importe_destino != null ? String(m.importe_destino) : '',
    cotizacion: m.cotizacion != null ? String(m.cotizacion) : '', obra_cod: m.obra_cod ?? '',
    referencia: m.referencia ?? '', obs: m.obs ?? '',
  }
}

export function ModalMovimientoFondos({ id, onClose, onCreado, onVerAsiento }: {
  /** null = nuevo. */
  id:           number | null
  onClose:      () => void
  /** Recién creado: la pantalla lo reabre en modo detalle. */
  onCreado:     (id: number) => void
  onVerAsiento: (asientoId: number) => void
}) {
  const q = useMovimientoFondos(id)
  if (id && q.isLoading) {
    return <Modal open onClose={onClose} title="Movimiento de fondos" width="max-w-2xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }
  if (id && (q.isError || !q.data)) {
    return <Modal open onClose={onClose} title="Movimiento de fondos" width="max-w-lg">
      <ErrorCarga mensaje={q.error ? mensajeErrorCtb(q.error) : 'No se pudo traer el movimiento.'} onReintentar={() => void q.refetch()} />
    </Modal>
  }
  return <Contenido mov={q.data ?? null} onClose={onClose} onCreado={onCreado} onVerAsiento={onVerAsiento} />
}

function Contenido({ mov, onClose, onCreado, onVerAsiento }: {
  mov:          TesMovimiento | null
  onClose:      () => void
  onCreado:     (id: number) => void
  onVerAsiento: (asientoId: number) => void
}) {
  const toast = useToast()
  const { puedeCrear, puedeEditar, movimientosFondos } = usePermisos('contabilidad')
  const guardar = useGuardarMovimiento()
  const tesorerias = useTesoreria(true)
  const conceptos = useConceptosFondos(true)
  const obras = useObrasCtb()
  const [editando, setEditando] = useState(!mov)
  const [anulando, setAnulando] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  // Adjunto opcional del alta (se sube después de crear).
  const [archivo, setArchivo] = useState<File | null>(null)
  const [tipoAdj, setTipoAdj] = useState<TesAdjuntoTipo>('comprobante')
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const monedaDe = useMemo(() => {
    const m = new Map((tesorerias.data ?? []).map(t => [String(t.id), t.moneda]))
    return (tid: string): TesMoneda | null => m.get(tid) ?? null
  }, [tesorerias.data])
  const schema = useMemo(() => crearSchema(monedaDe), [monedaDe])

  const { register, control, handleSubmit, setValue, setError, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults(mov),
  })
  const tipo = useWatch({ control, name: 'tipo' })
  const tesoreriaId = useWatch({ control, name: 'tesoreria_id' })
  const destinoId = useWatch({ control, name: 'tesoreria_destino_id' })
  const conceptoId = useWatch({ control, name: 'concepto_id' })
  const importe = useWatch({ control, name: 'importe' })
  const importeDestino = useWatch({ control, name: 'importe_destino' })
  const cotizacion = useWatch({ control, name: 'cotizacion' })
  const obraCod = useWatch({ control, name: 'obra_cod' })
  const fecha = useWatch({ control, name: 'fecha' })

  const esTransf = tipo === 'transferencia'
  const origenMon = monedaDe(tesoreriaId)
  const destinoMon = esTransf ? monedaDe(destinoId) : null
  const req = requisitosMoneda(tipo, origenMon, destinoMon)
  const equiv = equivalenteArs({
    tipo, origen: origenMon, destino: destinoMon, importe: monto(importe),
    importeDestino: monto(importeDestino), cotizacion: monto(cotizacion),
  })

  const anulado = mov?.estado === 'anulado'
  const deConciliacion = mov?.origen === 'conciliacion'
  // En conciliación no se tocan fecha, cuentas ni importes (MOVIMIENTO_DE_CONCILIACION).
  const bloqueadoConc = editando && deConciliacion

  const permisoCrear = puedeCrear && movimientosFondos
  const permisoEditar = puedeEditar && movimientosFondos
  const sinPermiso = !movimientosFondos ? 'No tenés permiso (hace falta «Movimientos de fondos»)' : null
  // Un movimiento de un mes cerrado no se edita (la base responde
  // PERIODO_CERRADO): se anula y se carga de nuevo; anular genera el
  // contraasiento en el mes abierto.
  const periodos = usePeriodos()
  const mesCerrado = !!mov && (periodos.data ?? []).some(p => p.desde <= mov.fecha && mov.fecha <= p.hasta && p.estado === 'cerrado')
  const bloqueoAnular = sinPermiso ?? (!puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : anulado ? 'El movimiento está anulado' : null)
  const bloqueoEditar = bloqueoAnular ?? (mesCerrado ? 'El mes está cerrado: para corregirlo, anulalo (el contraasiento va al mes abierto) y cargalo de nuevo' : null)
  const bloqueoGuardar = mov ? bloqueoEditar : (sinPermiso ?? (!puedeCrear ? 'No tenés permiso de Crear en Contabilidad' : null))

  // Opciones: activas + la que ya estaba elegida (aunque esté dada de baja).
  const cuentasOpc = useMemo(() => (tesorerias.data ?? []).filter(t => t.activo
    || String(t.id) === String(mov?.tesoreria_id ?? '') || String(t.id) === String(mov?.tesoreria_destino_id ?? '')), [tesorerias.data, mov])
  const conceptosOpc = useMemo(() => (conceptos.data ?? [])
    .filter(c => (c.activo && conceptoCompatible(c, tipo)) || String(c.id) === String(mov?.concepto_id ?? ''))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)), [conceptos.data, tipo, mov])
  const conceptoSel = (conceptos.data ?? []).find(c => String(c.id) === conceptoId) ?? null
  const cuentaSel = (tesorerias.data ?? []).find(t => String(t.id) === tesoreriaId) ?? null
  const destinoSel = (tesorerias.data ?? []).find(t => String(t.id) === destinoId) ?? null

  const opcionesObra = useMemo<ComboboxOption[]>(() => [
    { value: '', label: 'Sin obra (gasto general)' },
    // Las archivadas también: siguen siendo centro de costo (dueño, 27/09/2026).
    ...(obras.data ?? [])
      .map(o => ({ value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.archivada ? 'archivada' : undefined, group: o.archivada ? 'Archivadas' : undefined, search: [o.cod, o.nom] })),
  ], [obras.data])

  // R1: una OP de Compras del mismo día y por el mismo importe (aviso).
  const importeArs = equiv.ars ?? monto(importe)
  const ops = useOpsMismoDia(fecha, importeArs, editando && tipo === 'egreso')

  function cambiarTipo(t: TesMovTipo) {
    setValue('tipo', t, { shouldDirty: true })
    if (t === 'transferencia') {
      setValue('concepto_id', '')
      setValue('obra_cod', '')
    } else {
      setValue('tesoreria_destino_id', '')
      setValue('importe_destino', '')
      const c = (conceptos.data ?? []).find(x => String(x.id) === conceptoId)
      if (c && !conceptoCompatible(c, t)) setValue('concepto_id', '')
    }
  }

  async function enviar(d: FormData) {
    setErrorServer(null)
    const r = requisitosMoneda(d.tipo, monedaDe(d.tesoreria_id), d.tipo === 'transferencia' ? monedaDe(d.tesoreria_destino_id) : null)
    const body: TesMovimientoInput = {
      fecha:                d.fecha,
      tipo:                 d.tipo,
      tesoreria_id:         Number(d.tesoreria_id),
      tesoreria_destino_id: d.tipo === 'transferencia' ? Number(d.tesoreria_destino_id) : null,
      concepto_id:          d.tipo === 'transferencia' ? null : Number(d.concepto_id),
      importe:              monto(d.importe),
      importe_destino:      r.pideImporteDestino ? monto(d.importe_destino) : null,
      cotizacion:           r.pideCotizacion ? monto(d.cotizacion) : null,
      obra_cod:             d.tipo === 'transferencia' ? null : (d.obra_cod || null),
      referencia:           d.referencia.trim(),
      obs:                  d.obs.trim(),
    }
    try {
      const guardado = await guardar.mutateAsync({ id: mov?.id ?? null, ...body })
      if (!mov) {
        if (archivo) {
          try {
            await subirAdjuntoMovimiento(guardado.id, archivo, tipoAdj)
            toast(`✓ ${numeroMovimiento(guardado.numero)} creado con su adjunto`, 'ok')
          } catch (e) {
            toast(`${numeroMovimiento(guardado.numero)} se creó, pero el adjunto no se pudo subir: ${mensajeErrorCtb(e)}. Subilo desde el detalle.`, 'warn')
          }
        } else {
          toast(`✓ ${numeroMovimiento(guardado.numero)} creado`, 'ok')
        }
        onCreado(guardado.id)
      } else {
        toast(`✓ ${numeroMovimiento(guardado.numero)} guardado`, 'ok')
        setEditando(false)
      }
    } catch (e) {
      const ce = errorDeCampoCtb(e)
      if (ce && CAMPOS.has(ce.campo)) setError(ce.campo as FieldPath<FormData>, { message: ce.mensaje })
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  function elegirArchivo(f: File | null) {
    setErrorArchivo(null)
    if (!f) { setArchivo(null); return }
    const err = validarArchivoFondos(f)
    if (err) { setErrorArchivo(err); setArchivo(null); return }
    setArchivo(f)
  }

  const titulo = mov ? `${numeroMovimiento(mov.numero)} · ${fmtFecha(mov.fecha)}` : 'Nuevo movimiento de fondos'
  const soloLectura = !editando

  return (
    <>
      <Modal open onClose={guardar.isPending ? () => {} : onClose} width="max-w-2xl" title={titulo}
        footer={
          <div className="flex gap-2 flex-wrap justify-end items-center w-full">
            {soloLectura && mov ? (
              <>
                <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
                {mov.asiento_id && (
                  <Button variant="secondary" size="sm" onClick={() => onVerAsiento(mov.asiento_id!)}>
                    Ver asiento {mov.asiento_numero ? `N° ${mov.asiento_numero}` : 's/n'}
                  </Button>
                )}
                <Button variant="danger" size="sm" disabled={!!bloqueoAnular} onClick={() => setAnulando(true)}
                  title={bloqueoAnular ?? 'Anular: si ya tiene asiento, se anula o se revierte'}>
                  Anular
                </Button>
                <Button size="sm" disabled={!!bloqueoEditar} onClick={() => setEditando(true)} title={bloqueoEditar ?? 'Habilitar la edición'}>
                  Editar
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" disabled={guardar.isPending}
                  onClick={() => { if (mov) { reset(defaults(mov)); setEditando(false); setErrorServer(null) } else onClose() }}>
                  Cancelar
                </Button>
                <Button size="sm" loading={guardar.isPending} disabled={!!bloqueoGuardar} onClick={handleSubmit(enviar)}
                  title={bloqueoGuardar ?? (mov ? 'Guardar los cambios' : 'Crear el movimiento')}>
                  {mov ? 'Guardar' : 'Crear'}
                </Button>
              </>
            )}
          </div>
        }>
        <div className="flex flex-col gap-3 text-sm">
          {mov && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {anulado
                ? <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gris text-gris-dark">Anulado</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-verde-light text-verde">Vigente</span>}
              {mov.asiento_id
                ? <span className="text-gris-dark">Asiento {mov.asiento_numero ? `N° ${mov.asiento_numero}` : 's/n (período abierto)'}</span>
                : !anulado && <span className="text-naranja-dark font-semibold">Sin asiento: se genera al contabilizar (Automáticos › Fondos)</span>}
              {deConciliacion && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-azul-light text-azul">Conciliación</span>}
            </div>
          )}
          {anulado && mov && (
            <Aviso tono="gris">
              <b>Anulado:</b> {mov.motivo_anulacion}
              {mov.anulado_por_nombre && <> — {mov.anulado_por_nombre}, {fmtFechaHora(mov.anulado_at)}</>}
            </Aviso>
          )}
          {bloqueadoConc && (
            <Aviso tono="gris">Viene de la conciliación bancaria: solo se editan la obra, la referencia y la observación.</Aviso>
          )}

          <fieldset disabled={soloLectura} className="flex flex-col gap-3 min-w-0">
            {/* Tipo */}
            <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Tipo de movimiento">
              {TES_MOV_TIPOS.map(t => (
                <button key={t.key} type="button" role="radio" aria-checked={tipo === t.key}
                  disabled={soloLectura || bloqueadoConc}
                  onClick={() => cambiarTipo(t.key)}
                  className={`flex-1 min-w-[110px] text-sm px-3 py-2 rounded-lg border-[1.5px] font-semibold disabled:cursor-not-allowed ${tipo === t.key ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul disabled:opacity-60'}`}>
                  {t.icono} {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2">
              <Campo label="Fecha" error={errors.fecha?.message}>
                <input type="date" max={hoyAR()} {...register('fecha')} disabled={soloLectura || bloqueadoConc} className={inputCls} />
              </Campo>
              <Campo label={esTransf ? 'Sale de' : tipo === 'ingreso' ? 'Entra en' : 'Sale de'} error={errors.tesoreria_id?.message}>
                <select {...register('tesoreria_id')} disabled={soloLectura || bloqueadoConc || tesorerias.isLoading} className={inputCls}>
                  <option value="">{tesorerias.isLoading ? 'Cargando…' : 'Elegí la cuenta'}</option>
                  {cuentasOpc.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}{t.moneda === 'USD' ? ' (USD)' : ''}{t.activo ? '' : ' · baja'}</option>
                  ))}
                </select>
              </Campo>
            </div>

            {esTransf ? (
              <Campo label="Va a" error={errors.tesoreria_destino_id?.message}>
                <select {...register('tesoreria_destino_id')} disabled={soloLectura || bloqueadoConc} className={inputCls}>
                  <option value="">Elegí la cuenta de destino</option>
                  {cuentasOpc.filter(t => String(t.id) !== tesoreriaId).map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}{t.moneda === 'USD' ? ' (USD)' : ''}{t.activo ? '' : ' · baja'}</option>
                  ))}
                </select>
              </Campo>
            ) : (
              <Campo label="Concepto" error={errors.concepto_id?.message}
                hint={tipo === 'ingreso' ? 'de ingreso' : 'de egreso'}>
                <select {...register('concepto_id')} disabled={soloLectura || conceptos.isLoading} className={inputCls}>
                  <option value="">{conceptos.isLoading ? 'Cargando…' : 'Elegí el concepto'}</option>
                  {conceptosOpc.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' · baja'}</option>
                  ))}
                </select>
              </Campo>
            )}

            {cuentaSel && !cuentaSel.cuenta_id && (
              <Aviso tono="naranja">«{cuentaSel.nombre}» no tiene cuenta contable vinculada: el movimiento se guarda pero no se contabiliza hasta vincularla (Plan de cuentas › Cuentas de tesorería).</Aviso>
            )}
            {esTransf && destinoSel && !destinoSel.cuenta_id && (
              <Aviso tono="naranja">«{destinoSel.nombre}» no tiene cuenta contable vinculada: la transferencia no se contabiliza hasta vincularla.</Aviso>
            )}
            {!esTransf && conceptoSel && !conceptoSel.cuenta_id && (
              <Aviso tono="naranja">
                El concepto «{conceptoSel.nombre}» todavía no tiene cuenta contable: el movimiento se guarda y queda pendiente al contabilizar.{' '}
                <Link href="/contabilidad?tab=mapeos&clave=fondos.concepto" className="underline font-semibold">Mapear</Link>
              </Aviso>
            )}
            {!esTransf && conceptoSel && esDepositoDeValores(conceptoSel.nombre) && (
              <Aviso tono="amarillo">
                Si son cheques que estaban en cartera, lo correcto es una <b>transferencia</b> desde «Valores a depositar» al banco,
                no un ingreso: así sale de la cartera y entra al banco en el mismo movimiento.
              </Aviso>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Controller name="importe" control={control} render={({ field }) => (
                <InputMonto label={`Importe${origenMon ? ` (${origenMon})` : ''}`} value={field.value} onChange={field.onChange}
                  onBlur={field.onBlur} error={errors.importe?.message} disabled={soloLectura || bloqueadoConc} />
              )} />
              {req.pideImporteDestino && (
                <Controller name="importe_destino" control={control} render={({ field }) => (
                  <InputMonto label={`Entra en destino (${destinoMon})`} value={field.value} onChange={field.onChange}
                    onBlur={field.onBlur} error={errors.importe_destino?.message} disabled={soloLectura || bloqueadoConc} />
                )} />
              )}
              {req.pideCotizacion && (
                <Controller name="cotizacion" control={control} render={({ field }) => (
                  <InputMonto label="Cotización ($ por US$)" value={field.value} onChange={field.onChange} decimales={6}
                    onBlur={field.onBlur} error={errors.cotizacion?.message} disabled={soloLectura || bloqueadoConc} />
                )} />
              )}
              {(req.pideCotizacion || req.pideImporteDestino) && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">En pesos</span>
                  <span className="font-mono tabular-nums font-bold text-azul py-2">{equiv.ars !== null ? fmtM(equiv.ars) : '—'}</span>
                  {equiv.cotizacion !== null && <span className="text-[11px] text-gris-dark tabular-nums">cotización {equiv.cotizacion.toLocaleString('es-AR', { maximumFractionDigits: 6 })}</span>}
                </div>
              )}
            </div>

            {!esTransf && (
              <Campo label="Obra" hint="opcional: centro de costo" error={errors.obra_cod?.message}>
                <Combobox options={opcionesObra} value={obraCod} disabled={soloLectura}
                  onChange={v => setValue('obra_cod', v, { shouldDirty: true })}
                  placeholder={obras.isLoading ? 'Cargando obras…' : 'Sin obra (gasto general)'} />
              </Campo>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
              <Campo label="Referencia" hint="n° de VEP, operación, cheque…" error={errors.referencia?.message}>
                <input {...register('referencia')} maxLength={120} className={inputCls} />
              </Campo>
              <Campo label="Observación" hint="opcional" error={errors.obs?.message}>
                <input {...register('obs')} maxLength={1000} className={inputCls} />
              </Campo>
            </div>
          </fieldset>

          {editando && tipo === 'egreso' && (ops.data ?? []).length > 0 && (
            <Aviso tono="amarillo">
              <b>¿Ya está pagado por Compras?</b> Hay {ops.data!.length === 1 ? 'una orden de pago' : `${ops.data!.length} órdenes de pago`} del
              {' '}{fmtFecha(fecha)} por {fmtM(importeArs)}: {ops.data!.map(o => `${o.numero_fmt} (${o.proveedor_nom})`).join(', ')}.
              Si es el mismo pago, no lo cargues acá también: la plata saldría dos veces.
            </Aviso>
          )}

          {!mov && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Adjunto · <span className="font-normal normal-case tracking-normal">opcional (VEP, comprobante, extracto)</span></span>
              <div className="flex gap-2 flex-wrap items-center">
                <select value={tipoAdj} onChange={e => setTipoAdj(e.target.value as TesAdjuntoTipo)} className={`${inputCls} w-auto`}>
                  {TIPOS_ADJUNTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <label className="text-xs px-3 py-2 rounded-lg border-[1.5px] border-dashed border-gris-mid hover:border-naranja cursor-pointer text-azul font-semibold">
                  <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    onChange={e => { elegirArchivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
                  {archivo ? `📎 ${archivo.name}` : 'Elegir archivo'}
                </label>
                {archivo && <button type="button" className="text-xs text-gris-dark underline" onClick={() => setArchivo(null)}>quitar</button>}
              </div>
              {errorArchivo && <span className="text-xs text-rojo font-semibold">{errorArchivo}</span>}
            </div>
          )}

          {mov && <Adjuntos mov={mov} puede={(permisoCrear || permisoEditar) && !anulado} motivoNo={sinPermiso ?? (anulado ? 'El movimiento está anulado' : 'No tenés permiso de Crear ni Editar en Contabilidad')}
            puedeQuitar={permisoEditar && !anulado} motivoNoQuitar={sinPermiso ?? (anulado ? 'El movimiento está anulado' : 'No tenés permiso de Editar en Contabilidad')} />}

          {mov && (
            <div className="text-[11px] text-gris-dark">
              Cargó: {mov.created_by_nombre ?? '—'}, {fmtFechaHora(mov.created_at)}
              {conceptoSel && <> · Concepto de {sentidoLabel(conceptoSel.sentido).toLowerCase()}</>}
              {mov.tesoreria_moneda === 'USD' && <> · Equivalente registrado {fmtMoneda(mov.importe_ars, 'ARS')}</>}
            </div>
          )}

          {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
        </div>
      </Modal>

      {anulando && mov && (
        <ModalAnularMovimiento mov={mov} onClose={() => setAnulando(false)} onAnulado={() => { setAnulando(false); onClose() }} />
      )}
    </>
  )
}

function Adjuntos({ mov, puede, motivoNo, puedeQuitar, motivoNoQuitar }: {
  mov: TesMovimiento; puede: boolean; motivoNo: string
  /** Quitar pide Editar (el backend lo exige así); subir, Crear o Editar. */
  puedeQuitar: boolean; motivoNoQuitar: string
}) {
  const toast = useToast()
  const subir = useSubirAdjuntoMovimiento()
  const borrar = useBorrarAdjuntoMovimiento()
  const [tipo, setTipo] = useState<TesAdjuntoTipo>('comprobante')
  const [aBorrar, setABorrar] = useState<number | null>(null)
  const lista = mov.adjuntos ?? []

  async function elegir(f: File | null) {
    if (!f) return
    const err = validarArchivoFondos(f)
    if (err) { toast(err, 'err'); return }
    try {
      await subir.mutateAsync({ id: mov.id, file: f, tipo })
      toast('✓ Adjunto subido', 'ok')
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  async function hacerBorrado(adjId: number) {
    try {
      await borrar.mutateAsync({ id: mov.id, adjId })
      toast('✓ Adjunto quitado', 'ok')
      setABorrar(null)
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-gris pt-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Adjuntos ({lista.length})</span>
        <div className="flex gap-2 items-center">
          <select value={tipo} onChange={e => setTipo(e.target.value as TesAdjuntoTipo)} disabled={!puede} className={`${inputCls} w-auto py-1 text-xs`}>
            {TIPOS_ADJUNTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <label title={puede ? 'Adjuntar un archivo (JPG, PNG, WEBP, HEIC o PDF, hasta 10 MB)' : motivoNo}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${puede && !subir.isPending ? 'border-gris-mid bg-white text-azul hover:bg-gris cursor-pointer' : 'border-gris bg-gris text-gris-dark opacity-60 cursor-not-allowed'}`}>
            <input type="file" className="hidden" disabled={!puede || subir.isPending}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              onChange={e => { void elegir(e.target.files?.[0] ?? null); e.target.value = '' }} />
            {subir.isPending ? 'Subiendo…' : '+ Adjuntar'}
          </label>
        </div>
      </div>
      {lista.length === 0 ? <span className="text-xs text-gris-dark italic">Sin adjuntos.</span> : (
        <ul className="flex flex-col gap-1">
          {lista.map(a => (
            <li key={a.id} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] px-1 rounded bg-gris text-gris-dark font-bold uppercase">{TIPOS_ADJUNTO.find(t => t.key === a.tipo)?.label ?? a.tipo}</span>
              <button type="button" className="text-azul underline truncate max-w-[280px] text-left"
                onClick={() => void abrirAdjuntoFirmado(() => fetchAdjuntoMovimientoUrl(mov.id, a.id), e => toast(mensajeErrorCtb(e), 'err'))}>
                {a.nombre_archivo}
              </button>
              <span className="text-gris-dark tabular-nums">{Math.max(1, Math.round(a.size_bytes / 1024)).toLocaleString('es-AR')} KB</span>
              <span className="ml-auto" />
              {aBorrar === a.id ? (
                <>
                  <span className="text-rojo font-semibold">¿Quitar?</span>
                  <button type="button" className="text-gris-dark underline" onClick={() => setABorrar(null)}>No</button>
                  <button type="button" className="text-rojo font-bold underline" disabled={borrar.isPending} onClick={() => void hacerBorrado(a.id)}>Sí</button>
                </>
              ) : (
                <button type="button" disabled={!puedeQuitar} title={puedeQuitar ? 'Quitar el adjunto' : motivoNoQuitar} onClick={() => setABorrar(a.id)}
                  className="text-gris-dark hover:text-rojo disabled:opacity-40 disabled:cursor-not-allowed">✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
