'use client'

import { useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { CtbFuente, CtbPropuestaLinea } from '@/types/contabilidad.types'
import { useMapeos, usePropuesta } from '../hooks/useContabilidad'
import { estadoPendiente, fmtFecha, fmtM, fmtN, fuenteLabel, numeroAsiento } from '../utils/contabilidad.utils'
import { mensajeErrorCtb, mensajeMotivo } from '../utils/contabilidad.errores'
import { Aviso, Cargando, ErrorCarga, Th } from './Comun'

/**
 * El asiento que el motor generaría para un origen, al lado del que tiene hoy
 * (si tiene). No escribe nada: sirve para entender un «desactualizado» (qué
 * cambió) o un «pendiente» (qué falta mapear) antes de contabilizar.
 *
 * Las líneas se comparan por cuenta + auxiliar + obra + lado: las que están
 * en una sola de las dos, o con otro importe, se resaltan.
 */

export type LineaComun = Pick<CtbPropuestaLinea, 'cuenta_id' | 'cuenta_codigo' | 'cuenta_nombre' | 'debe' | 'haber' | 'aux_id' | 'aux_nombre' | 'obra_cod' | 'obra_nom' | 'glosa'>

const clave = (l: LineaComun) => `${l.cuenta_id}|${l.aux_id ?? ''}|${l.obra_cod ?? ''}|${Number(l.debe) > 0 ? 'D' : 'H'}`
const importe = (l: LineaComun) => Math.round((Number(l.debe) || Number(l.haber)) * 100)

/** Por clave, el importe en centavos (sumado, por si una misma clave se repite). */
function indice(lineas: LineaComun[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lineas) m.set(clave(l), (m.get(clave(l)) ?? 0) + importe(l))
  return m
}

export function ModalPropuesta({ tabla, id, onClose, onVerAsiento }: {
  tabla: CtbFuente
  id:    number
  onClose: () => void
  onVerAsiento?: (id: number) => void
}) {
  const q = usePropuesta(tabla, id)
  const mapeos = useMapeos()
  const p = q.data
  const actuales: LineaComun[] = useMemo(() => p?.asiento_actual?.lineas ?? [], [p])
  const propuestas: LineaComun[] = useMemo(() => p?.lineas ?? [], [p])
  const idxActual = useMemo(() => indice(actuales), [actuales])
  const idxProp = useMemo(() => indice(propuestas), [propuestas])
  const etiquetaClave = (c: string) => mapeos.data?.claves.find(k => k.clave === c)?.etiqueta

  const cambia = (l: LineaComun, otro: Map<string, number>) => otro.get(clave(l)) !== importe(l)
  const hayAsiento = !!p?.asiento_actual
  const est = p ? (p.estado === 'al_dia' ? { label: 'Al día', clase: 'bg-verde-light text-verde', hint: '' } : estadoPendiente(p.estado)) : null

  return (
    <Modal open onClose={onClose} width="max-w-5xl" title={`Propuesta · ${fuenteLabel(tabla)} #${id}`}
      footer={<>
        {p?.asiento_actual && onVerAsiento && (
          <Button variant="secondary" size="sm" onClick={() => onVerAsiento(p.asiento_actual!.id)}>Ver el asiento actual</Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
      </>}>
      {q.isLoading ? <Cargando texto="Calculando la propuesta…" />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : !p ? null : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {est && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${est.clase}`} title={est.hint}>{est.label}</span>}
              <span className="text-xs text-gris-dark">{fmtFecha(p.fecha)} · {p.glosa}</span>
              <span className="text-xs font-mono tabular-nums font-bold ml-auto">{fmtM(p.importe)}</span>
            </div>
            {!p.vigente && (
              <Aviso tono="gris">El origen está anulado: el asiento que tenga se anula (o se revierte si su período está cerrado).</Aviso>
            )}
            {p.motivos.length > 0 && (
              <Aviso tono="naranja">
                <b>No se puede contabilizar todavía:</b>
                <ul className="list-disc ml-4 mt-1">
                  {p.motivos.map((m, i) => <li key={i}>{mensajeMotivo(m, etiquetaClave)}</li>)}
                </ul>
              </Aviso>
            )}
            {hayAsiento && p.diferente && (
              <Aviso tono="amarillo">
                El asiento actual ({numeroAsiento(p.asiento_actual!.numero)}, {fmtFecha(p.asiento_actual!.fecha)}) no coincide con lo que se generaría hoy.
                Resaltado: lo que cambia.
                {p.asiento_actual!.periodo_estado === 'cerrado' && ' Su período está cerrado: se corrige con un contraasiento («Corregir también en períodos cerrados»).'}
              </Aviso>
            )}

            <div className={`grid gap-3 ${hayAsiento ? 'lg:grid-cols-2' : ''}`}>
              <TablaLineas titulo="Propuesta" lineas={propuestas} resaltar={hayAsiento ? l => cambia(l, idxActual) : undefined}
                vacio={p.motivos.length ? 'Sin líneas: faltan datos (ver arriba).' : 'Sin líneas.'} />
              {hayAsiento && (
                <TablaLineas titulo={`Asiento actual · ${numeroAsiento(p.asiento_actual!.numero)}`} lineas={actuales}
                  resaltar={l => cambia(l, idxProp)} vacio="Sin líneas." />
              )}
            </div>
          </div>
        )}
    </Modal>
  )
}

/** La tabla de líneas de una propuesta (también la usa el asiento de IVA mensual). */
export function TablaLineas({ titulo, lineas, resaltar, vacio }: {
  titulo: string
  lineas: LineaComun[]
  resaltar?: (l: LineaComun) => boolean
  vacio: string
}) {
  const debe = lineas.reduce((s, l) => s + Number(l.debe || 0), 0)
  const haber = lineas.reduce((s, l) => s + Number(l.haber || 0), 0)
  return (
    <div className="border border-gris-mid rounded overflow-hidden">
      <div className="bg-gris px-3 py-1.5 text-[11px] font-bold text-gris-dark uppercase tracking-wide">{titulo}</div>
      {lineas.length === 0 ? <div className="p-3 text-xs text-gris-dark italic">{vacio}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs min-w-[460px]">
            <thead>
              <tr><Th>Cuenta</Th><Th>Auxiliar / obra</Th><Th derecha>Debe</Th><Th derecha>Haber</Th></tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className={`border-t border-gris ${resaltar?.(l) ? 'bg-amarillo-light/60' : ''}`}>
                  <td className="px-3 py-1">
                    <span className="font-mono">{l.cuenta_codigo}</span> {l.cuenta_nombre}
                    {l.glosa && <span className="block text-[10px] text-gris-dark">{l.glosa}</span>}
                  </td>
                  <td className="px-3 py-1 text-gris-dark">
                    {[l.aux_nombre, l.obra_nom ?? l.obra_cod].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums whitespace-nowrap">{fmtN(l.debe)}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums whitespace-nowrap">{fmtN(l.haber)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gris-mid font-bold">
                <td className="px-3 py-1" colSpan={2}>Total</td>
                <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(debe, '0,00')}</td>
                <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(haber, '0,00')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
