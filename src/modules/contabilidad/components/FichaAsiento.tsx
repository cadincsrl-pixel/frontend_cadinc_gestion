'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbAsiento } from '@/types/contabilidad.types'
import { useAsiento, useBorrarAsiento } from '../hooks/useContabilidad'
import { auxiliarLabel, fmtFecha, fmtFechaHora, fmtM, fmtN, numeroAsiento, sumaCentavos, tipoAsientoLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, EstadoAsiento, ErrorCarga } from './Comun'
import { ModalAnularAsiento } from './ModalAnularAsiento'

/**
 * Ficha de un asiento: encabezado, líneas, totales y quién hizo qué.
 *
 * Acciones (las que no aplican quedan deshabilitadas con el motivo):
 *  - Editar: borrador o confirmado, en período abierto, manual (no un
 *    contraasiento ni uno automático).
 *  - Borrar: solo borradores.
 *  - Anular: confirmados. En período abierto queda anulado; en uno cerrado
 *    genera un contraasiento con fecha en un período abierto.
 */
export function FichaAsiento({ id, onClose, onEditar, onAbrir }: {
  id:       number
  onClose:  () => void
  onEditar: (a: CtbAsiento) => void
  /** Abrir otro asiento (el original o el contraasiento). */
  onAbrir:  (id: number) => void
}) {
  const toast = useToast()
  const { puedeEditar, asientosManuales } = usePermisos('contabilidad')
  const { data: a, isLoading, isError, refetch } = useAsiento(id)
  const borrar = useBorrarAsiento()
  const [anulando, setAnulando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  if (isLoading) {
    return <Modal open onClose={onClose} title="Asiento" width="max-w-4xl">
      <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
    </Modal>
  }
  if (isError || !a) {
    return <Modal open onClose={onClose} title="Asiento" width="max-w-lg">
      <ErrorCarga mensaje="No se pudo traer el asiento." onReintentar={() => void refetch()} />
    </Modal>
  }

  const permiso = puedeEditar && asientosManuales
  const sinPermiso = 'No tenés permiso (hace falta «Cargar asientos manuales» y Editar)'
  const cerrado = a.periodo_estado === 'cerrado'
  const noManual = a.origen_tabla ? 'Lo generó el sistema: no se toca a mano'
    : a.revierte_id ? 'Es un contraasiento: no se edita (si está mal, anulalo)'
    : a.revertido_por_id ? 'Ya tiene contraasiento' : null

  const bloqueoEditar = !permiso ? sinPermiso
    : a.estado === 'anulado' ? 'El asiento está anulado'
    : noManual ?? (cerrado ? 'El período está cerrado: anulalo (genera un contraasiento) o reabrí el período' : null)
  const bloqueoBorrar = !permiso ? sinPermiso
    : a.estado !== 'borrador' ? 'Solo se borran borradores: un confirmado se anula'
    : cerrado ? 'El período está cerrado' : null
  const bloqueoAnular = !permiso ? sinPermiso
    : a.estado === 'borrador' ? 'Un borrador no se anula: se borra'
    : a.estado === 'anulado' ? 'Ya está anulado'
    : a.origen_tabla ? 'Lo generó el sistema: no se anula a mano'
    : a.revertido_por_id ? 'Ya tiene contraasiento' : null

  async function hacerBorrado() {
    try {
      await borrar.mutateAsync(a!.id)
      toast('✓ Borrador eliminado', 'ok')
      onClose()
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  const debe = sumaCentavos(a.lineas.map(l => l.debe))
  const haber = sumaCentavos(a.lineas.map(l => l.haber))

  return (
    <>
      <Modal
        open onClose={onClose} width="max-w-4xl"
        title={`Asiento ${numeroAsiento(a.numero)} · ${fmtFecha(a.fecha)}`}
        footer={
          <div className="flex gap-2 flex-wrap justify-end items-center w-full">
            <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
            {confirmarBorrado ? (
              <>
                <span className="text-xs text-rojo font-semibold">¿Borrar el borrador? No se puede deshacer.</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmarBorrado(false)} disabled={borrar.isPending}>No</Button>
                <Button variant="danger" size="sm" loading={borrar.isPending} onClick={hacerBorrado}>Sí, borrar</Button>
              </>
            ) : (
              <>
                <Button variant="danger" size="sm" disabled={!!bloqueoBorrar} title={bloqueoBorrar ?? 'Borrar el borrador'}
                  onClick={() => setConfirmarBorrado(true)}>
                  Borrar
                </Button>
                <Button variant="secondary" size="sm" disabled={!!bloqueoAnular}
                  title={bloqueoAnular ?? (cerrado ? 'Anular: el período está cerrado, se genera un contraasiento' : 'Anular: queda en el historial, sin número y fuera de los reportes')}
                  onClick={() => setAnulando(true)}>
                  Anular
                </Button>
                <Button size="sm" disabled={!!bloqueoEditar} title={bloqueoEditar ?? 'Editar el asiento'} onClick={() => onEditar(a)}>
                  Editar
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <EstadoAsiento estado={a.estado} />
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-azul-light text-azul">{tipoAsientoLabel(a.tipo)}</span>
            {cerrado && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gris text-gris-dark">🔒 período cerrado</span>}
            {!a.numero && a.estado === 'confirmado' && <span className="text-[11px] text-gris-dark">Sin número: se numera al cerrar el período.</span>}
          </div>

          <div className="text-base font-semibold text-azul">{a.glosa}</div>

          {a.estado === 'anulado' && (
            <Aviso tono="gris">
              <b>Anulado:</b> {a.motivo_anulacion}
              {a.anulado_por_nombre && <> — {a.anulado_por_nombre}, {fmtFechaHora(a.anulado_at)}</>}
            </Aviso>
          )}
          <OrigenAsiento a={a} />
          {a.revierte_id && (
            <Aviso tono="amarillo">
              Contraasiento de{' '}
              <button type="button" className="underline font-bold" onClick={() => onAbrir(a.revierte_id!)}>
                asiento {a.revierte_numero ? `N° ${a.revierte_numero}` : `#${a.revierte_id}`}
              </button>.
            </Aviso>
          )}
          {a.revertido_por_id && (
            <Aviso tono="amarillo">
              Revertido por el{' '}
              <button type="button" className="underline font-bold" onClick={() => onAbrir(a.revertido_por_id!)}>
                asiento {a.revertido_por_numero ? `N° ${a.revertido_por_numero}` : `#${a.revertido_por_id}`}
              </button>.
            </Aviso>
          )}

          <div className="overflow-x-auto border border-gris-mid rounded-lg">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {['Cuenta', 'Auxiliar', 'Obra', 'Glosa', 'Debe', 'Haber'].map((h, i) => (
                    <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.lineas.map(l => (
                  <tr key={l.id} className="border-t border-gris">
                    <td className={`px-3 py-1.5 text-xs ${l.haber > 0 ? 'pl-8' : ''}`}>
                      <span className="font-mono">{l.cuenta_codigo}</span> {l.cuenta_nombre}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gris-dark">
                      {l.aux_nombre ? <span title={auxiliarLabel(l.aux_tipo)}>{l.aux_nombre}</span> : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gris-dark" title={l.obra_nom ?? undefined}>{l.obra_cod ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-gris-dark">{l.glosa || ''}</td>
                    <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(l.debe)}</td>
                    <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(l.haber)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gris-mid bg-blanco">
                  <td colSpan={4} className="px-3 py-2 text-xs font-bold text-gris-dark uppercase">Totales</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtM(debe)}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtM(haber)}</td>
                </tr>
                {debe !== haber && (
                  <tr>
                    <td colSpan={6} className="px-3 py-1.5 text-xs text-rojo font-bold text-right">
                      No cuadra: diferencia {fmtM(Math.abs(debe - haber))}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          <div className="text-[11px] text-gris-dark flex flex-col gap-0.5">
            <span>Cargó: {a.created_by_nombre ?? '—'}, {fmtFechaHora(a.created_at)}</span>
            {a.confirmado_at && <span>Confirmó: {a.confirmado_por_nombre ?? '—'}, {fmtFechaHora(a.confirmado_at)}</span>}
          </div>
        </div>
      </Modal>

      {anulando && (
        <ModalAnularAsiento
          asiento={a}
          onClose={() => setAnulando(false)}
          onVerAsiento={id2 => { setAnulando(false); onAbrir(id2) }}
        />
      )}
    </>
  )
}

/**
 * De dónde salió un asiento del sistema (tanda 5): el movimiento de fondos
 * tiene su pantalla; el de IVA y el de amortizaciones se regeneran o anulan
 * desde la suya, no a mano.
 */
function OrigenAsiento({ a }: { a: CtbAsiento }) {
  if (!a.origen_tabla || !a.origen_id) return null
  switch (a.origen_tabla) {
    case 'tesoreria_movimientos':
      return (
        <Aviso tono="gris">
          Movimiento de fondos:{' '}
          <Link href={`/contabilidad?tab=tesoreria&mov=${a.origen_id}`} className="underline font-bold">ver el movimiento</Link>.
          {' '}Se corrige editando o anulando el movimiento y volviendo a contabilizar.
        </Aviso>
      )
    case 'cont_iva_mensual':
      return <Aviso tono="gris">Asiento de IVA: se regenera o anula desde <Link href="/contabilidad?tab=periodos" className="underline font-bold">Períodos</Link>.</Aviso>
    case 'cont_amortizacion_corridas':
      return <Aviso tono="gris">Asiento de amortizaciones: se regenera o anula desde <Link href="/contabilidad?tab=bienes&vista=corridas" className="underline font-bold">Bienes de uso › Corridas</Link>.</Aviso>
    default:
      return null
  }
}
