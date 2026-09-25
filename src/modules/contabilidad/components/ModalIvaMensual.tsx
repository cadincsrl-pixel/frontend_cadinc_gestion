'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbIvaDiferencia, CtbIvaPosicion, CtbPeriodo } from '@/types/contabilidad.types'
import { useAnularIva, useConfigCtb, useGenerarIva, useIvaPosicion, useMapeos } from '../hooks/useContabilidad'
import { ROL_IVA, estadoIva, fmtFecha, fmtFechaHora, fmtM, fmtN, nombreMes, numeroAsiento, saldoDA } from '../utils/contabilidad.utils'
import { codigoErrorCtb, leerCuerpoError, mensajeAvisoIva, mensajeErrorCtb, mensajeMotivo } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, ErrorCarga, Th, inputCls } from './Comun'
import { TablaLineas } from './ModalPropuesta'

/**
 * El asiento mensual de IVA (DDJJ) de un período (tanda 5, 20260928o).
 *
 * El asiento cancela los saldos del MAYOR del mes en las cuentas de IVA
 * (débito, crédito, percepciones y retenciones) contra IVA a pagar o saldo a
 * favor. La posición FISCAL (la de los Libros IVA, la misma de Ventas ›
 * Impuestos) es el CONTROL: si no coinciden, generar rebota con 409
 * IVA_DIFIERE_DE_LIBROS y se puede «Generar igual» a sabiendas.
 *
 * El asiento es tipo ajuste y lo escribe el sistema: no se edita a mano. Se
 * regenera cuando queda desactualizado (se contabilizó algo después) y se
 * anula desde acá, con el período abierto.
 */

const anularSchema = z.object({
  motivo: z.string()
    .refine(v => v.trim().length >= 3, 'Escribí el motivo (al menos 3 caracteres)')
    .refine(v => v.length <= 500, 'Hasta 500 caracteres'),
})
type AnularForm = z.infer<typeof anularSchema>

const COMPONENTE: Record<CtbIvaDiferencia['componente'], string> = {
  debito:         'Débito fiscal',
  credito:        'Crédito fiscal',
  pagos_a_cuenta: 'Percepciones y retenciones',
  itc:            'Pago a cuenta ITC del mes',
  excluidos:      'Comprobantes excluidos de los libros',
}

function diferenciasDe(detail: unknown): CtbIvaDiferencia[] {
  if (!detail || typeof detail !== 'object') return []
  const d = (detail as { diferencias?: unknown }).diferencias
  return Array.isArray(d) ? d as CtbIvaDiferencia[] : []
}

export function ModalIvaMensual({ periodo, onClose, onVerAsiento }: {
  periodo:      Pick<CtbPeriodo, 'id' | 'desde' | 'hasta' | 'estado'>
  onClose:      () => void
  onVerAsiento: (id: number) => void
}) {
  const toast = useToast()
  const { puedeEditar, contabilizar } = usePermisos('contabilidad')
  const q = useIvaPosicion(periodo.id)
  const config = useConfigCtb()
  const mapeos = useMapeos()
  const generar = useGenerarIva()
  const anular = useAnularIva()
  // 409 IVA_DIFIERE_DE_LIBROS: las diferencias que devolvió el server.
  const [difiere, setDifiere] = useState<CtbIvaDiferencia[] | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const etiquetaClave = (c: string) => mapeos.data?.claves.find(k => k.clave === c)?.etiqueta
  const mes = nombreMes(periodo.desde)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AnularForm>({
    resolver: zodResolver(anularSchema),
    defaultValues: { motivo: '' },
  })

  async function hacerGenerar(forzar = false) {
    setErrorServer(null)
    try {
      const r = await generar.mutateAsync({ periodoId: periodo.id, forzar })
      setDifiere(null)
      toast(r.accion === 'creado' ? `✓ Asiento de IVA de ${mes} generado`
        : r.accion === 'regenerado' ? `✓ Asiento de IVA de ${mes} regenerado`
        : `El asiento de IVA de ${mes} ya estaba al día`, r.accion === 'sin_cambios' ? 'warn' : 'ok')
    } catch (e) {
      if (codigoErrorCtb(e) === 'IVA_DIFIERE_DE_LIBROS') {
        setDifiere(diferenciasDe(leerCuerpoError(e).detail))
        return
      }
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  async function hacerAnular(d: AnularForm) {
    setErrorServer(null)
    try {
      await anular.mutateAsync({ periodoId: periodo.id, motivo: d.motivo.trim() })
      toast(`✓ Asiento de IVA de ${mes} anulado`, 'ok')
      setAnulando(false)
      reset({ motivo: '' })
    } catch (e) {
      setErrorServer(mensajeErrorCtb(e))
    }
  }

  const p = q.data
  const c = p?.contable
  const cerrado = (c?.periodo_estado ?? periodo.estado) === 'cerrado'
  const permiso = !contabilizar ? 'No tenés permiso (hace falta «Contabilizar automáticos»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad'
    : cerrado ? 'El período está cerrado: reabrilo para generar, regenerar o anular el asiento de IVA' : null
  const bloqueoGenerar = permiso ?? (!c ? 'Cargando…'
    : c.motivos.length > 0 ? 'Faltan cuentas en Mapeos (ver arriba)'
    : c.estado === 'al_dia' ? 'El asiento ya está al día'
    : c.estado === 'sin_movimientos' ? 'El mes no tiene IVA para liquidar' : null)
  const bloqueoAnular = permiso ?? (!c?.registro ? 'No hay asiento de IVA generado' : null)
  const ocupado = generar.isPending || anular.isPending

  return (
    <Modal open onClose={ocupado ? () => {} : onClose} width="max-w-5xl" title={`IVA de ${mes}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end items-center w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={ocupado}>Cerrar</Button>
          {c?.asiento && (
            <Button variant="secondary" size="sm" onClick={() => onVerAsiento(c.asiento!.id)}>
              Ver asiento {numeroAsiento(c.asiento.numero)}
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={!!bloqueoAnular || anulando || ocupado} onClick={() => setAnulando(true)}
            title={bloqueoAnular ?? 'Anular el asiento de IVA del mes'}>
            Anular
          </Button>
          {difiere ? (
            <Button variant="danger" size="sm" loading={generar.isPending} disabled={!!permiso} onClick={() => void hacerGenerar(true)}
              title={permiso ?? 'Generar el asiento aunque no coincida con los libros'}>
              Generar igual
            </Button>
          ) : (
            <Button size="sm" loading={generar.isPending} disabled={!!bloqueoGenerar || ocupado} onClick={() => void hacerGenerar(false)}
              title={bloqueoGenerar ?? 'Generar el asiento de IVA con los saldos del mayor'}>
              {c?.estado === 'desactualizado' ? 'Regenerar asiento' : 'Generar asiento de IVA'}
            </Button>
          )}
        </div>
      }>
      {q.isLoading ? <Cargando texto="Calculando la posición de IVA…" />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : !p || !c ? null : (
          <Contenido p={p} arrastre={config.data?.iva_ddjj_arrastre ?? false} etiquetaClave={etiquetaClave}
            difiere={difiere} onVerAsiento={onVerAsiento}>
            {anulando && (
              <div className="border border-rojo/30 rounded-lg p-3 flex flex-col gap-2 bg-rojo-light/30">
                <div className="text-xs">
                  Se anula el asiento de IVA de {mes}. Las cuentas de IVA vuelven a mostrar sus saldos del mes hasta que se genere de nuevo.
                </div>
                <Campo label="Motivo" error={errors.motivo?.message}>
                  <input {...register('motivo')} maxLength={500} autoFocus placeholder="Ej.: faltaba contabilizar una compra" className={inputCls} />
                </Campo>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAnulando(false)} disabled={anular.isPending}>No</Button>
                  <Button variant="danger" size="sm" loading={anular.isPending} onClick={handleSubmit(hacerAnular)}>Anular el asiento</Button>
                </div>
              </div>
            )}
            {errorServer && <Aviso tono="rojo">{errorServer}</Aviso>}
          </Contenido>
        )}
    </Modal>
  )
}

function Contenido({ p, arrastre, etiquetaClave, difiere, onVerAsiento, children }: {
  p:             CtbIvaPosicion
  arrastre:      boolean
  etiquetaClave: (c: string) => string | undefined
  difiere:       CtbIvaDiferencia[] | null
  onVerAsiento:  (id: number) => void
  children:      ReactNode
}) {
  const { contable: c, fiscal: f } = p
  const est = estadoIva(c.estado)
  const difs = difiere ?? p.diferencias
  const hayDif = (k: CtbIvaDiferencia['componente']) => difs.some(d => d.componente === k)
  const pcFiscal = Number(f.percepciones_iva || 0) + Number(f.retenciones_iva || 0)
  const filas: { label: string; cont: number; fisc: number; dif?: CtbIvaDiferencia['componente']; fuerte?: boolean }[] = [
    { label: 'Débito fiscal', cont: c.debito_fiscal, fisc: f.debito_fiscal, dif: 'debito' },
    { label: 'Crédito fiscal', cont: c.credito_fiscal, fisc: f.credito_fiscal, dif: 'credito' },
    { label: 'Impuesto determinado', cont: c.determinado, fisc: f.impuesto_determinado },
    ...(Number(c.itc_mes ?? 0) !== 0 || Number(f.pago_a_cuenta_itc ?? 0) !== 0
      ? [{ label: 'Pago a cuenta ITC del mes (45 % gasoil)', cont: Number(c.itc_mes ?? 0), fisc: Number(f.pago_a_cuenta_itc ?? 0), dif: 'itc' as const }]
      : []),
    { label: 'Percepciones y retenciones', cont: c.pagos_a_cuenta, fisc: pcFiscal, dif: 'pagos_a_cuenta' },
    { label: 'A pagar', cont: c.a_pagar, fisc: f.a_pagar, fuerte: true },
    { label: 'Saldo técnico a favor', cont: c.saldo_tecnico, fisc: f.saldo_tecnico_a_favor },
    { label: 'Saldo de libre disponibilidad', cont: c.libre_disponibilidad, fisc: f.libre_disponibilidad },
  ]
  const excluidos = Number(f.excluidos_ventas || 0) + Number(f.excluidos_compras || 0)
  const actual = c.asiento

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${est.clase}`} title={est.hint}>{est.label}</span>
        {c.periodo_estado === 'cerrado' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gris text-gris-dark">🔒 período cerrado</span>}
        <span className="text-gris-dark">Del {fmtFecha(c.desde)} al {fmtFecha(c.hasta)} · asiento con fecha {fmtFecha(c.fecha)}</span>
        {c.registro && (
          <span className="text-gris-dark ml-auto">
            Generado por {c.registro.created_by_nombre ?? '—'}, {fmtFechaHora(c.registro.created_at)}
            {c.registro.forzado && <b className="text-naranja-dark"> · generado igual con diferencias</b>}
          </span>
        )}
      </div>

      {c.estado === 'desactualizado' && (
        <Aviso tono="amarillo">Se contabilizó algo del mes después de generar el asiento de IVA: regeneralo para que las cuentas de IVA queden en cero. Cerrar el mes así pide confirmación.</Aviso>
      )}

      {c.motivos.length > 0 && (
        <Aviso tono="naranja">
          <b>No se puede generar todavía:</b>
          <ul className="list-disc ml-4 mt-1">
            {c.motivos.map((m, i) => {
              const clave = m.detalle && typeof m.detalle.clave === 'string' ? m.detalle.clave : null
              return (
                <li key={i}>
                  {mensajeMotivo(m, etiquetaClave)}
                  {m.codigo === 'SIN_MAPEO' && clave && (
                    <> <Link href={`/contabilidad?tab=mapeos&clave=${encodeURIComponent(clave)}`} className="underline font-semibold">Mapear</Link></>
                  )}
                </li>
              )
            })}
          </ul>
        </Aviso>
      )}

      {difiere && (
        <Aviso tono="rojo">
          <b>Lo contabilizado no coincide con los Libros IVA del mes.</b>
          {difiere.length > 0 && (
            <ul className="list-disc ml-4 mt-1">
              {difiere.map((d, i) => (
                <li key={i}>
                  {COMPONENTE[d.componente] ?? d.componente}: mayor {fmtM(d.contable)} · libros {fmtM(d.fiscal)} · diferencia <b className="tabular-nums">{fmtM(d.diferencia)}</b>
                </li>
              ))}
            </ul>
          )}
          Suele ser una compra con el período IVA corrido, un comprobante excluido del libro o una retención con fecha distinta.
          Si la diferencia está explicada, «Generar igual» genera el asiento con los saldos del mayor y queda marcado.
        </Aviso>
      )}

      {/* Mayor vs libros */}
      <div className="overflow-x-auto border border-gris-mid rounded-lg">
        <table className="w-full border-collapse min-w-[560px] text-xs">
          <thead>
            <tr><Th>Concepto</Th><Th derecha>Según el mayor</Th><Th derecha>Según los libros</Th><Th derecha>Diferencia</Th></tr>
          </thead>
          <tbody>
            {filas.map(r => {
              const d = Math.round((r.cont - r.fisc) * 100) / 100
              const roja = (r.dif && hayDif(r.dif)) || Math.abs(d) > 0.05
              return (
                <tr key={r.label} className={`border-t border-gris ${roja ? 'bg-rojo-light/40' : ''} ${r.fuerte ? 'font-bold' : ''}`}>
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtM(r.cont)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtM(r.fisc)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${roja ? 'text-rojo font-bold' : 'text-gris-dark'}`}>{Math.abs(d) > 0.005 ? fmtM(d) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {excluidos > 0 && (
        <Aviso tono={hayDif('excluidos') ? 'rojo' : 'amarillo'}>
          Los libros dejaron afuera {f.excluidos_ventas > 0 && <>{f.excluidos_ventas} comprobante{f.excluidos_ventas === 1 ? '' : 's'} de ventas</>}
          {f.excluidos_ventas > 0 && f.excluidos_compras > 0 && ' y '}
          {f.excluidos_compras > 0 && <>{f.excluidos_compras} de compras</>} por errores de datos: revisalos en{' '}
          <Link href="/facturacion?tab=impuestos" className="underline font-semibold">Ventas › Impuestos</Link>.
        </Aviso>
      )}
      {(f.avisos.length > 0 || c.avisos.length > 0) && (
        <Aviso tono="gris">
          <ul className="list-disc ml-4">
            {c.avisos.map((a, i) => <li key={`c${i}`}>{mensajeAvisoIva(a)}</li>)}
            {f.avisos.map((a, i) => <li key={`f${i}`}>Libros: {a}</li>)}
          </ul>
        </Aviso>
      )}

      {Number(c.itc_disponible ?? 0) > 0 && (
        <Aviso tono="gris">
          ITC computable: hay {fmtM(Number(c.itc_disponible))} disponibles (lo del mes más lo que quedó de meses anteriores).
          Este asiento usa {fmtM(Number(c.itc_computado ?? 0))} contra el impuesto
          {Number(c.itc_remanente ?? 0) > 0 && <> y quedan {fmtM(Number(c.itc_remanente))} en la cuenta para los meses siguientes</>}.
          El ITC nunca genera saldo a favor de libre disponibilidad.
        </Aviso>
      )}

      <Aviso tono="gris">
        Compensar los saldos a favor del mes anterior está <b>{arrastre ? 'prendido' : 'apagado'}</b>
        {arrastre && (c.arrastre_tecnico > 0 || c.arrastre_libre > 0) && (
          <> (este mes usa {fmtM(c.arrastre_tecnico)} de saldo técnico y {fmtM(c.arrastre_libre)} de libre disponibilidad)</>
        )}.
        {' '}Se cambia en <Link href="/contabilidad?tab=mapeos&clave=iva.ddjj" className="underline font-semibold">Mapeos › Configuración</Link>, junto con las cuentas de IVA a pagar y saldos a favor.
      </Aviso>

      {/* Cuentas por rol */}
      {c.cuentas.length > 0 && (
        <div className="overflow-x-auto border border-gris-mid rounded-lg">
          <table className="w-full border-collapse min-w-[620px] text-xs">
            <thead>
              <tr><Th>Rol</Th><Th>Cuenta</Th><Th derecha>Debe del mes</Th><Th derecha>Haber del mes</Th><Th derecha>Saldo</Th></tr>
            </thead>
            <tbody>
              {c.cuentas.map(k => (
                <tr key={`${k.rol}-${k.cuenta_id}`} className="border-t border-gris">
                  <td className="px-3 py-1.5 text-gris-dark whitespace-nowrap">{ROL_IVA[k.rol] ?? k.rol}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/contabilidad?tab=mayor&cuenta_id=${k.cuenta_id}&desde=${c.desde}&hasta=${c.hasta}`} className="text-azul hover:underline"
                      title="Ver el mayor de la cuenta en el mes">
                      <span className="font-mono">{k.codigo}</span> {k.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(k.debe)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(k.haber)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{saldoDA(k.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`grid gap-3 ${actual && c.estado === 'desactualizado' ? 'lg:grid-cols-2' : ''}`}>
        <TablaLineas titulo="Asiento propuesto" lineas={c.lineas}
          vacio={c.motivos.length ? 'Sin líneas: faltan cuentas (ver arriba).' : 'Sin líneas: el mes no tiene IVA.'} />
        {actual && c.estado === 'desactualizado' && (
          <TablaLineas titulo={`Asiento actual · ${numeroAsiento(actual.numero)}`} lineas={actual.lineas} vacio="Sin líneas." />
        )}
      </div>
      {actual && c.estado !== 'desactualizado' && (
        <div className="text-[11px] text-gris-dark">
          Asiento vigente: <button type="button" className="text-azul underline" onClick={() => onVerAsiento(actual.id)}>
            {numeroAsiento(actual.numero, true)} del {fmtFecha(actual.fecha)} por {fmtM(actual.total)}
          </button>
        </div>
      )}

      {children}
    </div>
  )
}
