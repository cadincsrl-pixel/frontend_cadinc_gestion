'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { ReciboResumen } from '@/types/sueldos.types'
import {
  traerLiquidacionConLineas, traerRecibo, useActualizarLiquidacion, useBorrarRecibo, useCerrarLiquidacion, useContabilizarLiquidacion,
  useConvenios, useLegajos, useLiquidacion,
} from '../../hooks/useSueldos'
import { fmtCant, fmtFecha, fmtFechaHora, fmtM, fmtPeriodoLiq, mensajeAvisoLiq, sumar } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { descargarRecibosPdf, liqParaRecibo } from '../../utils/reciboPdf'
import { Aviso, Cargando, Cifra, ErrorCarga, EstadoLiq, EstadoRec, Tarjeta, Td, Th, Vacio, inputCls } from '../Comun'
import { EditorRecibo } from './EditorRecibo'
import { ModalGenerar } from './ModalGenerar'
import { ModalMotivo } from './ModalMotivo'
import { ModalAsientoPropuesta } from './ModalAsientoPropuesta'
import { ModalAgregarEmpleado } from './ModalAgregarEmpleado'

export function LiquidacionDetalleView({ id, onVolver }: { id: number; onVolver: () => void }) {
  const toast = useToast()
  const { liquidar, cerrarLiquidaciones } = usePermisos('sueldos')
  const q = useLiquidacion(id)
  const { data: convenios = [] } = useConvenios()
  const cerrar = useCerrarLiquidacion()
  const contabilizar = useContabilizarLiquidacion()
  const actualizar = useActualizarLiquidacion()
  const borrarRecibo = useBorrarRecibo()
  // Fichas incompletas del convenio: para avisar ANTES de cerrar quién no tiene fecha de ingreso.
  const incompletosQ = useLegajos({ convenio_id: q.data?.convenio_id ?? null, activo: 'todos', incompleto: 'true' }, !!q.data)

  const [editor, setEditor] = useState<{ legajoId: number; existe: boolean } | null>(null)
  const [generar, setGenerar] = useState(false)
  const [agregar, setAgregar] = useState(false)
  const [motivo, setMotivo] = useState<'reabrir' | 'anular' | null>(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [verAsiento, setVerAsiento] = useState(false)
  const [borrar, setBorrar] = useState<ReciboResumen | null>(null)
  const [pdfCargando, setPdfCargando] = useState<number | 'todos' | null>(null)
  const [fechaPago, setFechaPago] = useState<string | null>(null)

  if (q.isLoading) return <Cargando />
  if (q.isError || !q.data) return <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />

  const l = q.data
  const cct = convenios.find(c => c.id === l.convenio_id)?.cct
  const borrador = l.estado === 'borrador'
  const t = l.totales
  const costo = sumar([t.remunerativo, t.no_remunerativo, t.contribuciones, t.fondo_cese])
  const recibos = l.recibos
  const incompletos = recibos.filter(r => r.legajo.incompleto).length
  const negativos = recibos.filter(r => r.neto < 0).length
  const faltaIngreso = new Set((incompletosQ.data ?? []).filter(x => x.faltantes.includes('fecha_ingreso')).map(x => x.id))
  const sinIngreso = recibos.filter(r => r.legajo.incompleto && faltaIngreso.has(r.legajo_id)).map(r => r.legajo.nombre)

  const motivoNoLiquidar = !liquidar ? 'Hace falta el permiso «Liquidar sueldos»' : !borrador ? `La liquidación está ${l.estado}: reabrila para modificarla` : null
  const motivoNoCerrar = !cerrarLiquidaciones ? 'Hace falta el permiso «Cerrar liquidaciones»' : null
  // La fecha de pago se puede corregir también con la liquidación cerrada.
  const motivoNoFecha = !liquidar ? 'Hace falta el permiso «Liquidar sueldos»' : l.estado === 'anulada' ? 'La liquidación está anulada' : null

  async function pdfUno(r: ReciboResumen) {
    setPdfCargando(r.legajo_id)
    try {
      const rec = await traerRecibo(l.id, r.legajo_id)
      descargarRecibosPdf([rec], liqParaRecibo(l, cct))
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setPdfCargando(null)
    }
  }

  async function pdfTodos() {
    setPdfCargando('todos')
    try {
      const full = await traerLiquidacionConLineas(l.id)
      if (full.recibos.length === 0) { toast('No hay recibos para imprimir', 'warn'); return }
      descargarRecibosPdf(full.recibos, liqParaRecibo(l, cct))
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    } finally {
      setPdfCargando(null)
    }
  }

  async function hacerCierre() {
    try {
      if (fechaPago !== null && fechaPago !== (l.fecha_pago ?? '')) {
        await actualizar.mutateAsync({ id: l.id, fecha_pago: fechaPago || null })
        setFechaPago(null)
      }
      const res = await cerrar.mutateAsync(l.id)
      setConfirmarCierre(false)
      if (res.asiento_id) toast(`✓ ${l.codigo} cerrada con su asiento contable`, 'ok')
      else toast(`${l.codigo} cerrada, pero sin asiento: revisá los avisos`, 'warn')
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  async function hacerContabilizar() {
    try {
      const res = await contabilizar.mutateAsync(l.id)
      if (res.asiento_id) toast('✓ Asiento generado', 'ok')
      else toast('Todavía no se pudo generar el asiento: revisá los avisos', 'warn')
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  async function guardarFechaPago() {
    if (fechaPago === null) return
    try {
      await actualizar.mutateAsync({ id: l.id, fecha_pago: fechaPago || null })
      toast('✓ Fecha de pago guardada', 'ok')
      setFechaPago(null)
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  async function hacerBorrar() {
    if (!borrar) return
    try {
      await borrarRecibo.mutateAsync({ liqId: l.id, legajoId: borrar.legajo_id })
      toast(`✓ Recibo de ${borrar.legajo.nombre} borrado`, 'ok')
      setBorrar(null)
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  const ordenLegajos = recibos.map(r => r.legajo_id)

  return (
    <>
      {/* Encabezado */}
      <Tarjeta className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <button type="button" onClick={onVolver} className="text-xs text-azul hover:underline mb-1">← Liquidaciones</button>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl text-azul tracking-wider">{l.codigo}</h2>
              <EstadoLiq estado={l.estado} />
            </div>
            <div className="text-sm text-carbon">{l.convenio.nombre} · {fmtPeriodoLiq(l)}</div>
            {l.obs && <div className="text-xs text-gris-dark mt-1 whitespace-pre-wrap">{l.obs}</div>}
            {l.estado === 'cerrada' && l.cerrada_at && <div className="text-[11px] text-gris-dark">Cerrada el {fmtFechaHora(l.cerrada_at)}</div>}
            {l.estado === 'anulada' && <div className="text-[11px] text-rojo">Anulada{l.anulada_at ? ` el ${fmtFechaHora(l.anulada_at)}` : ''}{l.motivo_anulacion ? `: ${l.motivo_anulacion}` : ''}</div>}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha de pago</label>
              <input type="date" className={`${inputCls} w-40`} disabled={!!motivoNoFecha} title={motivoNoFecha ?? undefined}
                value={fechaPago ?? l.fecha_pago ?? ''} onChange={e => setFechaPago(e.target.value)} />
            </div>
            {fechaPago !== null && fechaPago !== (l.fecha_pago ?? '') && (
              <Button size="sm" loading={actualizar.isPending} onClick={guardarFechaPago}>Guardar</Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!motivoNoLiquidar} title={motivoNoLiquidar ?? 'Crea los recibos en borrador para los legajos del convenio, con las horas de tarja y los préstamos como sugerencia'}
            onClick={() => setGenerar(true)}>⚙ Generar recibos</Button>
          <Button size="sm" variant="secondary" disabled={!!motivoNoLiquidar} title={motivoNoLiquidar ?? 'Agregar el recibo de un empleado puntual'}
            onClick={() => setAgregar(true)}>+ Agregar empleado</Button>
          <Button size="sm" variant="secondary" disabled={recibos.length === 0} loading={pdfCargando === 'todos'}
            title={recibos.length === 0 ? 'Todavía no hay recibos' : 'Todos los recibos en un PDF'} onClick={pdfTodos}>🖨 PDF de todos</Button>
          <Button size="sm" variant="secondary" onClick={() => setVerAsiento(true)} title="Qué asiento genera (o generó) esta liquidación">📒 Asiento</Button>
          <div className="flex-1" />
          {borrador && (
            <Button size="sm" disabled={!!motivoNoCerrar || recibos.length === 0}
              title={motivoNoCerrar ?? (recibos.length === 0 ? 'No hay recibos para cerrar' : 'Cerrar: congela los recibos y genera el asiento contable')}
              onClick={() => setConfirmarCierre(true)}>🔒 Cerrar liquidación</Button>
          )}
          {l.estado === 'cerrada' && (
            <Button size="sm" variant="secondary" disabled={!!motivoNoCerrar} title={motivoNoCerrar ?? 'Volver a borrador para corregir (anula el asiento si el período contable está abierto)'}
              onClick={() => setMotivo('reabrir')}>↩ Reabrir</Button>
          )}
          {l.estado !== 'anulada' && (
            <Button size="sm" variant="danger" disabled={!!motivoNoCerrar} title={motivoNoCerrar ?? 'Anular la liquidación (con motivo)'}
              onClick={() => setMotivo('anular')}>Anular</Button>
          )}
        </div>
      </Tarjeta>

      {/* Asiento y avisos */}
      {(l.avisos.length > 0 || (l.estado === 'cerrada' && !l.asiento_id) || l.asiento) && (
        <Tarjeta className="p-3 flex flex-col gap-2">
          {l.asiento && (
            <Aviso tono={l.asiento.estado === 'anulado' ? 'gris' : 'verde'}>
              Asiento contable {l.asiento.numero ? `N° ${l.asiento.numero}` : `#${l.asiento.id}`} del {fmtFecha(l.asiento.fecha)} por {fmtM(l.asiento.total)} ({l.asiento.estado}).{' '}
              <Link href="/contabilidad?tab=asientos" className="underline font-semibold">Ver en Contabilidad</Link>
            </Aviso>
          )}
          {l.avisos.map((a, i) => (
            <Aviso key={i} tono={a.codigo === 'SIN_MAPEO' || a.codigo === 'PRESTAMO_SIN_LEGAJO_TARJA' ? 'naranja' : a.codigo === 'ASIENTO_EN_OTRO_PERIODO' ? 'amarillo' : 'rojo'}>{mensajeAvisoLiq(a)}</Aviso>
          ))}
          {l.estado === 'cerrada' && !l.asiento_id && (
            <div className="flex flex-wrap gap-2 items-center">
              <Link href="/contabilidad?tab=mapeos" className="text-xs text-azul font-semibold underline">Ir a Contabilidad › Mapeos</Link>
              <Button size="sm" variant="secondary" disabled={!!motivoNoCerrar} loading={contabilizar.isPending}
                title={motivoNoCerrar ?? 'Reintentar el asiento (después de cargar los mapeos o abrir el período)'}
                onClick={hacerContabilizar}>Contabilizar</Button>
            </div>
          )}
        </Tarjeta>
      )}

      {/* Totales */}
      <div className="flex flex-wrap gap-2">
        <Cifra label="Recibos" valor={String(t.recibos)} sub={incompletos ? `${incompletos} con ficha incompleta` : undefined} tono={incompletos ? 'naranja' : 'normal'} />
        <Cifra label="Remunerativo" valor={fmtM(t.remunerativo)} />
        <Cifra label="No remunerativo" valor={fmtM(t.no_remunerativo)} />
        <Cifra label="Descuentos" valor={fmtM(t.descuentos)} />
        <Cifra label="Neto a pagar" valor={fmtM(t.neto)} tono="verde" sub={negativos ? `${negativos} recibo(s) con neto negativo` : undefined} />
        <Cifra label="Contribuciones" valor={fmtM(t.contribuciones)} sub={t.fondo_cese ? `+ fondo de cese ${fmtM(t.fondo_cese)}` : undefined} />
        <Cifra label="Costo total" valor={fmtM(costo)} tono="naranja" sub="haberes + contribuciones + FC" />
      </div>

      {/* Grilla de recibos */}
      {recibos.length === 0 ? (
        <Vacio>
          Todavía no hay recibos. {borrador ? 'Usá «Generar recibos» para crearlos para todos los legajos del convenio, o «Agregar empleado» para uno puntual.' : ''}
        </Vacio>
      ) : (
        <Tarjeta className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Empleado</Th>
                <Th derecha className="hidden md:table-cell">Días / horas</Th>
                <Th derecha className="hidden md:table-cell">Bruto</Th>
                <Th derecha className="hidden md:table-cell">Descuentos</Th>
                <Th derecha>Neto</Th>
                <Th derecha className="hidden lg:table-cell">Contrib. + FC</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {recibos.map(r => {
                const bruto = sumar([r.total_remunerativo, r.total_no_remunerativo])
                return (
                  <tr key={r.id} className="hover:bg-naranja-light/30">
                    <Td>
                      <button type="button" className="text-left" onClick={() => setEditor({ legajoId: r.legajo_id, existe: true })}>
                        <div className="font-semibold text-azul hover:underline">{r.legajo.nombre}</div>
                        <div className="text-[11px] text-gris-dark">
                          {r.legajo.leg ? `Leg. ${r.legajo.leg} · ` : ''}{r.legajo.categoria_nombre ?? 'sin categoría'}
                          {r.legajo.incompleto && <span className="text-naranja-dark font-bold"> · ficha incompleta</span>}
                        </div>
                      </button>
                    </Td>
                    <Td derecha className="hidden md:table-cell">
                      {[r.dias_trabajados != null ? `${fmtCant(r.dias_trabajados)} d` : '', r.horas_trabajadas != null ? `${fmtCant(r.horas_trabajadas)} h` : ''].filter(Boolean).join(' · ') || '—'}
                    </Td>
                    <Td derecha className="hidden md:table-cell">{fmtM(bruto)}</Td>
                    <Td derecha className="hidden md:table-cell">{fmtM(r.total_descuentos)}</Td>
                    <Td derecha className={`font-bold ${r.neto < 0 ? 'text-rojo' : ''}`}>{fmtM(r.neto)}</Td>
                    <Td derecha className="hidden lg:table-cell">{fmtM(sumar([r.total_contribuciones, r.fondo_cese]))}</Td>
                    <Td><EstadoRec estado={r.estado} /></Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditor({ legajoId: r.legajo_id, existe: true })}
                          title={motivoNoLiquidar ? 'Ver el recibo' : 'Editar el recibo'}>{motivoNoLiquidar ? '👁' : '✏'}</Button>
                        <Button size="sm" variant="ghost" loading={pdfCargando === r.legajo_id} onClick={() => pdfUno(r)} title="Recibo en PDF">🖨</Button>
                        <Button size="sm" variant="ghost" disabled={!!motivoNoLiquidar} title={motivoNoLiquidar ?? 'Sacar este recibo de la liquidación'}
                          onClick={() => setBorrar(r)}>🗑</Button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Tarjeta>
      )}

      {editor && (
        <EditorRecibo
          liquidacion={l}
          legajoId={editor.legajoId}
          existe={editor.existe}
          soloLectura={!!motivoNoLiquidar}
          motivoSoloLectura={motivoNoLiquidar}
          siguiente={(() => {
            const i = ordenLegajos.indexOf(editor.legajoId)
            return i >= 0 && i < ordenLegajos.length - 1 ? ordenLegajos[i + 1]! : null
          })()}
          onIr={legajoId => setEditor({ legajoId, existe: ordenLegajos.includes(legajoId) })}
          onClose={() => setEditor(null)}
        />
      )}
      {generar && <ModalGenerar liquidacion={l} onClose={() => setGenerar(false)} />}
      {agregar && (
        <ModalAgregarEmpleado liquidacion={l} onClose={() => setAgregar(false)}
          onElegir={legajoId => { setAgregar(false); setEditor({ legajoId, existe: false }) }} />
      )}
      {motivo && <ModalMotivo liquidacion={l} accion={motivo} onClose={() => setMotivo(null)} />}
      {verAsiento && <ModalAsientoPropuesta liquidacion={l} onClose={() => setVerAsiento(false)} />}

      {confirmarCierre && (
        <Modal open onClose={() => !cerrar.isPending && setConfirmarCierre(false)} title={`Cerrar ${l.codigo}`}
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => setConfirmarCierre(false)} disabled={cerrar.isPending}>Cancelar</Button>
            <Button size="sm" loading={cerrar.isPending || actualizar.isPending} disabled={!(fechaPago ?? l.fecha_pago) || negativos > 0}
              title={!(fechaPago ?? l.fecha_pago) ? 'Poné la fecha de pago' : negativos > 0 ? 'Hay recibos con neto negativo' : undefined}
              onClick={hacerCierre}>Cerrar liquidación</Button>
          </>}>
          <div className="flex flex-col gap-2 text-sm">
            <p>Se cierran los {recibos.length} recibos (neto total {fmtM(t.neto)}) y se genera el asiento contable. Los préstamos descontados quedan registrados en Tarja › Préstamos.</p>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gris-dark uppercase tracking-wider">Fecha de pago</label>
                <input type="date" className={`${inputCls} w-44`} value={fechaPago ?? l.fecha_pago ?? ''} onChange={e => setFechaPago(e.target.value)} />
              </div>
            </div>
            {!(fechaPago ?? l.fecha_pago) && <Aviso tono="rojo">Falta la fecha de pago: es obligatoria para cerrar (va en los recibos y en el LSD).</Aviso>}
            {sinIngreso.length > 0 && <Aviso tono="rojo">Sin fecha de ingreso en la ficha: {sinIngreso.join(', ')}. Completala en Legajos: sin ella no se puede cerrar.</Aviso>}
            {incompletos > 0 && <Aviso tono="naranja">{incompletos} empleado(s) tienen la ficha incompleta: el recibo, el banco y el LSD pueden salir sin CUIL o CBU.</Aviso>}
            {negativos > 0 && <Aviso tono="rojo">{negativos} recibo(s) tienen neto negativo: corregilos antes de cerrar (bajá el préstamo o los descuentos).</Aviso>}
            <p className="text-xs text-gris-dark">Si falta algún mapeo contable la liquidación se cierra igual y queda el aviso para contabilizarla después. Para corregir un recibo cerrado hay que reabrir.</p>
          </div>
        </Modal>
      )}

      {borrar && (
        <Modal open onClose={() => !borrarRecibo.isPending && setBorrar(null)} title="Borrar recibo"
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => setBorrar(null)} disabled={borrarRecibo.isPending}>Cancelar</Button>
            <Button variant="danger" size="sm" loading={borrarRecibo.isPending} onClick={hacerBorrar}>Borrar</Button>
          </>}>
          <p className="text-sm">¿Sacar el recibo de <b>{borrar.legajo.nombre}</b> ({fmtM(borrar.neto)}) de {l.codigo}? Lo cargado en ese recibo se pierde.</p>
        </Modal>
      )}
    </>
  )
}
