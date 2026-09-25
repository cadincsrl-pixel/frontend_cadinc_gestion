'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbIvaEstadoMes, CtbPeriodo } from '@/types/contabilidad.types'
import { useAbrirEjercicioSiguiente, useCerrarPeriodo, useEjercicios, useIvaEstados, usePeriodos } from '../hooks/useContabilidad'
import { bloqueoCerrarTxt, bloqueoReabrirTxt, estadoIva, estadoPendiente, fmtFecha, fmtFechaHora, fmtM, hoyAR, nombreMes } from '../utils/contabilidad.utils'
import { codigoErrorCtb, leerCuerpoError, mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { ModalReabrirPeriodo } from './ModalReabrirPeriodo'
import { ModalIvaMensual } from './ModalIvaMensual'
import { useVisorAsiento } from './VisorAsiento'

/**
 * Los 12 períodos (meses) del ejercicio. Cerrar un período NUMERA sus
 * asientos confirmados (correlativos en el ejercicio, por fecha) y lo congela:
 * ya no se carga, edita ni borra nada con fecha en ese mes. Se cierran en
 * orden y sin borradores. Solo se reabre el último cerrado.
 *
 * «Abrir ejercicio siguiente» (20260928e) crea el ejercicio de julio a junio
 * que sigue al último, con sus 12 meses abiertos. Solo se puede cuando el
 * último ya empezó (espejo de EJERCICIO_SIGUIENTE_YA_EXISTE de la RPC).
 *
 * Columna «IVA» (tanda 5, 20260928o): el asiento mensual de IVA es un paso
 * del cierre, por eso vive al lado de «Cerrar». Cerrar un mes con el asiento
 * de IVA desactualizado rebota con 409 IVA_DDJJ_DESACTUALIZADA (se puede
 * cerrar igual); sin generar solo avisa. Si además hay pendientes, el 409 de
 * pendientes trae `iva_ddjj_desactualizada` y el confirm lista las dos
 * advertencias: el contador cierra con advertencias (25/09).
 */
export function PeriodosTab() {
  const toast = useToast()
  const { puedeEditar, cerrarPeriodos } = usePermisos('contabilidad')
  const ejerciciosQ = useEjercicios()
  const [ejercicioElegido, setEjercicioElegido] = useState<number | null>(null)

  // Por defecto, el ejercicio de hoy (o el último).
  const ejercicioId = useMemo(() => {
    if (ejercicioElegido) return ejercicioElegido
    const lista = ejerciciosQ.data ?? []
    const hoy = hoyAR()
    return (lista.find(e => e.desde <= hoy && hoy <= e.hasta) ?? lista[0])?.id ?? null
  }, [ejercicioElegido, ejerciciosQ.data])

  const { data, isLoading, isError, error, refetch } = usePeriodos(ejercicioId)
  const cerrar = useCerrarPeriodo()
  const [aCerrar, setACerrar] = useState<CtbPeriodo | null>(null)
  // 409 HAY_PENDIENTES_AUTOMATICOS (fase 3): cuántos quedan y por estado.
  const [pendientesAuto, setPendientesAuto] = useState<{ cantidad: number; por_estado: Record<string, number> } | null>(null)
  const [aReabrir, setAReabrir] = useState<CtbPeriodo | null>(null)
  // 409 IVA_DDJJ_DESACTUALIZADA al cerrar.
  const [ivaDesact, setIvaDesact] = useState(false)
  const [ivaDe, setIvaDe] = useState<CtbPeriodo | null>(null)
  const visor = useVisorAsiento()
  // Un backend sin la tanda 5 responde error: la columna muestra «—».
  const ivaQ = useIvaEstados(ejercicioId)
  const ivaPorPeriodo = useMemo(() => new Map<number, CtbIvaEstadoMes>((ivaQ.data ?? []).map(e => [e.periodo_id, e])), [ivaQ.data])
  const abrirSiguiente = useAbrirEjercicioSiguiente()
  const [confirmarSiguiente, setConfirmarSiguiente] = useState(false)

  const sinPermiso = !cerrarPeriodos ? 'No tenés permiso (hace falta «Cerrar y reabrir períodos»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null

  async function hacerCierre(forzar = false) {
    if (!aCerrar) return
    try {
      const r = await cerrar.mutateAsync({ id: aCerrar.id, forzar })
      toast(r.numerados > 0
        ? `✓ ${nombreMes(aCerrar.desde)} cerrado · ${r.numerados} asiento${r.numerados === 1 ? '' : 's'} numerado${r.numerados === 1 ? '' : 's'} (N° ${r.desde_numero} a ${r.hasta_numero})`
        : `✓ ${nombreMes(aCerrar.desde)} cerrado (no tenía asientos)`, 'ok')
      setACerrar(null)
      setPendientesAuto(null)
      setIvaDesact(false)
    } catch (e) {
      if (codigoErrorCtb(e) === 'IVA_DDJJ_DESACTUALIZADA') {
        setIvaDesact(true)
        return
      }
      if (codigoErrorCtb(e) === 'HAY_PENDIENTES_AUTOMATICOS') {
        const d = leerCuerpoError(e).detail
        const obj = d && typeof d === 'object' ? d as Record<string, unknown> : {}
        const porEstado = obj.por_estado && typeof obj.por_estado === 'object' ? obj.por_estado as Record<string, number> : {}
        setPendientesAuto({ cantidad: Number(obj.cantidad) || 0, por_estado: porEstado })
        // El mismo 409 avisa si además el asiento de IVA quedó desactualizado
        // (20260929q): «Cerrar igual» saltea las dos advertencias.
        setIvaDesact(obj.iva_ddjj_desactualizada === true)
        return
      }
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  // El siguiente al último: desde = hasta + 1 día, 12 meses.
  const ultimo = useMemo(() => [...(ejerciciosQ.data ?? [])].sort((a, b) => (a.hasta < b.hasta ? 1 : a.hasta > b.hasta ? -1 : 0))[0] ?? null,
    [ejerciciosQ.data])
  const siguiente = useMemo(() => {
    if (!ultimo) return null
    const d = new Date(`${ultimo.hasta}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    const desde = d.toISOString().slice(0, 10)
    const h = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate() - 1, 12))
    const hasta = h.toISOString().slice(0, 10)
    return { desde, hasta, nombre: `${desde.slice(0, 4)}/${hasta.slice(2, 4)}` }
  }, [ultimo])
  const bloqueoSiguiente = sinPermiso
    ?? (ejerciciosQ.isLoading ? 'Cargando los ejercicios…'
    : !ultimo ? 'No hay un ejercicio cargado del cual seguir'
    : ultimo.desde > hoyAR() ? `El ejercicio siguiente ya está abierto (${ultimo.nombre}): el próximo se abre cuando ese empiece`
    : null)

  async function hacerAbrirSiguiente() {
    try {
      const r = await abrirSiguiente.mutateAsync()
      toast(`✓ Ejercicio ${r.ejercicio.nombre} abierto (${fmtFecha(r.ejercicio.desde)} – ${fmtFecha(r.ejercicio.hasta)}, ${r.periodos} períodos)`, 'ok')
      setConfirmarSiguiente(false)
      setEjercicioElegido(r.ejercicio.id)
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

  function cerrarModal() {
    setACerrar(null)
    setPendientesAuto(null)
    setIvaDesact(false)
  }

  const ivaACerrar = aCerrar ? ivaPorPeriodo.get(aCerrar.id) ?? null : null
  const forzable = !!pendientesAuto || ivaDesact

  const periodos = data ?? []

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-wrap gap-2 items-end">
        <Campo label="Ejercicio" className="min-w-[200px]">
          <select value={ejercicioId ?? ''} onChange={e => setEjercicioElegido(Number(e.target.value) || null)} className={inputCls}
            disabled={ejerciciosQ.isLoading || (ejerciciosQ.data ?? []).length === 0}>
            {(ejerciciosQ.data ?? []).map(e => (
              <option key={e.id} value={e.id}>{e.nombre} ({fmtFecha(e.desde)} – {fmtFecha(e.hasta)}){e.estado === 'cerrado' ? ' · cerrado' : ''}</option>
            ))}
          </select>
        </Campo>
        <p className="text-xs text-gris-dark flex-1 min-w-[240px]">
          Cerrar un mes numera sus asientos y lo congela. Se cierran en orden y sin borradores; solo se reabre el último cerrado.
        </p>
        <Button size="sm" variant="secondary" disabled={!!bloqueoSiguiente} onClick={() => setConfirmarSiguiente(true)}
          title={bloqueoSiguiente ?? `Abrir el ejercicio ${siguiente?.nombre ?? 'siguiente'} con sus 12 meses`}>
          Abrir ejercicio siguiente{siguiente && !bloqueoSiguiente ? ` (${siguiente.nombre})` : ''}
        </Button>
      </Tarjeta>

      {ejerciciosQ.isError ? <ErrorCarga mensaje={mensajeErrorCtb(ejerciciosQ.error)} onReintentar={() => void ejerciciosQ.refetch()} />
        : isLoading || ejerciciosQ.isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : periodos.length === 0 ? <Vacio>No hay períodos cargados para este ejercicio.</Vacio>
        : (
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1080px]">
                <thead>
                  <tr>
                    <Th>Período</Th><Th>Estado</Th><Th derecha>Borradores</Th><Th derecha>Confirmados</Th><Th derecha>Anulados</Th>
                    <Th>Números</Th><Th derecha>Total Debe</Th><Th>IVA</Th><Th>Cierre</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {periodos.map(p => {
                    const bloqueoC = sinPermiso ?? (p.puede_cerrar ? null : bloqueoCerrarTxt(p.bloqueo_cerrar, p.cant_borradores) ?? 'No se puede cerrar')
                    const bloqueoR = sinPermiso ?? (p.puede_reabrir ? null : bloqueoReabrirTxt(p.bloqueo_reabrir) ?? 'No se puede reabrir')
                    const cerrado = p.estado === 'cerrado'
                    return (
                      <tr key={p.id} className="border-t border-gris">
                        <td className="px-3 py-2 text-sm whitespace-nowrap">
                          <span className="font-mono text-xs text-gris-dark mr-1">{String(p.numero).padStart(2, '0')}</span>
                          {nombreMes(p.desde)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${cerrado ? 'bg-gris text-gris-dark' : 'bg-verde-light text-verde'}`}>
                            {cerrado ? '🔒 Cerrado' : 'Abierto'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">
                          {p.cant_borradores > 0
                            ? <Link href={`/contabilidad?tab=asientos&estado=borrador&desde=${p.desde}&hasta=${p.hasta}`} className="text-naranja-dark font-bold underline">{p.cant_borradores}</Link>
                            : <span className="text-gris-mid">0</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{p.cant_confirmados}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-gris-dark">{p.cant_anulados}</td>
                        <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                          {p.numero_desde ? `${p.numero_desde} – ${p.numero_hasta}` : <span className="text-gris-mid font-sans">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-mono tabular-nums whitespace-nowrap">{fmtM(p.total_debe)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <CeldaIva e={ivaPorPeriodo.get(p.id) ?? null} cargando={ivaQ.isLoading} sinDatos={ivaQ.isError}
                            onAbrir={() => setIvaDe(p)} />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gris-dark">
                          {cerrado && <span className="block">{p.cerrado_por_nombre ?? '—'}, {fmtFechaHora(p.cerrado_at)}</span>}
                          {p.reabierto_at && <span className="block" title={p.motivo_reapertura ?? undefined}>Reabierto {fmtFechaHora(p.reabierto_at)}{p.motivo_reapertura ? `: ${p.motivo_reapertura}` : ''}</span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {cerrado ? (
                            <Button size="sm" variant="secondary" disabled={!!bloqueoR} title={bloqueoR ?? 'Reabrir el período (borra sus números)'}
                              onClick={() => setAReabrir(p)}>
                              Reabrir
                            </Button>
                          ) : (
                            <Button size="sm" disabled={!!bloqueoC} title={bloqueoC ?? 'Cerrar el período: numera y congela'}
                              onClick={() => setACerrar(p)}>
                              Cerrar
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

      {aCerrar && (
        <Modal open onClose={cerrar.isPending ? () => {} : cerrarModal} width="max-w-md" title={`Cerrar ${nombreMes(aCerrar.desde)}`}
          footer={forzable ? <>
            <Button variant="ghost" size="sm" onClick={cerrarModal} disabled={cerrar.isPending}>Cancelar</Button>
            {pendientesAuto && (
              <Link href="/contabilidad?tab=automaticos" className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white text-azul font-semibold hover:bg-gris">
                Ver pendientes
              </Link>
            )}
            {ivaDesact && (
              <Button size="sm" variant="secondary" onClick={() => { const p = aCerrar; cerrarModal(); setIvaDe(p) }}>Ver IVA</Button>
            )}
            <Button size="sm" variant="danger" loading={cerrar.isPending} onClick={() => void hacerCierre(true)}>Cerrar igual</Button>
          </> : <>
            <Button variant="ghost" size="sm" onClick={cerrarModal} disabled={cerrar.isPending}>Cancelar</Button>
            <Button size="sm" loading={cerrar.isPending} onClick={() => void hacerCierre()}>Cerrar el período</Button>
          </>}>
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Se van a <b>numerar</b> los {aCerrar.cant_confirmados} asiento{aCerrar.cant_confirmados === 1 ? '' : 's'} confirmado{aCerrar.cant_confirmados === 1 ? '' : 's'} del
              {' '}{fmtFecha(aCerrar.desde)} al {fmtFecha(aCerrar.hasta)}, correlativos por fecha, y el período queda <b>congelado</b>:
              no se carga, edita ni borra nada con fecha en ese mes.
            </p>
            <Aviso tono="gris">
              Para corregir algo después: anular el asiento (se genera un contraasiento en un mes abierto) o reabrir el período,
              que borra los números y se vuelven a asignar al cerrarlo de nuevo.
            </Aviso>
            {ivaDesact && (
              <Aviso tono="naranja">
                <b>El asiento de IVA del mes quedó desactualizado</b> (se contabilizó algo después de generarlo). Lo correcto es regenerarlo
                antes de cerrar; si lo cerrás igual, las cuentas de IVA del mes no quedan en cero.
              </Aviso>
            )}
            {!ivaDesact && ivaACerrar?.estado === 'sin_generar' && (
              <Aviso tono="amarillo">
                Todavía no se generó el <b>asiento de IVA</b> de este mes. No bloquea el cierre, pero después solo se genera reabriendo el período.{' '}
                <button type="button" className="underline font-semibold" onClick={() => { const p = aCerrar; cerrarModal(); setIvaDe(p) }}>Generarlo ahora</button>
              </Aviso>
            )}
            {pendientesAuto && (
              <Aviso tono="naranja">
                <b>Quedan {pendientesAuto.cantidad} comprobante{pendientesAuto.cantidad === 1 ? '' : 's'} de Ventas o Compras sin contabilizar o desactualizado{pendientesAuto.cantidad === 1 ? '' : 's'} en el mes</b>
                {Object.keys(pendientesAuto.por_estado).length > 0 && (
                  <> ({Object.entries(pendientesAuto.por_estado).map(([k, v]) => `${estadoPendiente(k).label.toLowerCase()}: ${v}`).join(' · ')})</>
                )}.
                Si lo cerrás igual, después se corrigen con contraasientos en un mes abierto.
              </Aviso>
            )}
          </div>
        </Modal>
      )}
      {confirmarSiguiente && siguiente && (
        <Modal open onClose={abrirSiguiente.isPending ? () => {} : () => setConfirmarSiguiente(false)} width="max-w-md"
          title={`Abrir el ejercicio ${siguiente.nombre}`}
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => setConfirmarSiguiente(false)} disabled={abrirSiguiente.isPending}>Cancelar</Button>
            <Button size="sm" loading={abrirSiguiente.isPending} onClick={() => void hacerAbrirSiguiente()}>Abrir el ejercicio</Button>
          </>}>
          <div className="flex flex-col gap-3 text-sm">
            <p>
              Se crea el ejercicio <b>{siguiente.nombre}</b>, del {fmtFecha(siguiente.desde)} al {fmtFecha(siguiente.hasta)}, con sus
              {' '}<b>12 períodos abiertos</b>. Desde ahí se pueden cargar asientos y contabilizar comprobantes con fecha en esos meses.
            </p>
            <Aviso tono="gris">No hace falta cerrar el ejercicio actual: los dos quedan abiertos a la vez.</Aviso>
          </div>
        </Modal>
      )}
      {aReabrir && <ModalReabrirPeriodo periodo={aReabrir} onClose={() => setAReabrir(null)} />}
      {ivaDe && (
        <ModalIvaMensual periodo={ivaDe} onClose={() => setIvaDe(null)}
          onVerAsiento={id => { setIvaDe(null); visor.abrir(id) }} />
      )}
      {visor.modales}
    </div>
  )
}

/** La celda «IVA» de un mes: chip de estado + a pagar / saldo a favor, y el botón para abrir el modal. */
function CeldaIva({ e, cargando, sinDatos, onAbrir }: {
  e:        CtbIvaEstadoMes | null
  cargando: boolean
  sinDatos: boolean
  onAbrir:  () => void
}) {
  if (cargando) return <span className="text-[11px] text-gris-mid">…</span>
  if (sinDatos || !e) return <Button size="sm" variant="ghost" onClick={onAbrir} title="Ver la posición de IVA del mes">IVA</Button>
  const est = estadoIva(e.estado)
  const monto = e.a_pagar > 0 ? `a pagar ${fmtM(e.a_pagar)}`
    : e.saldo_tecnico > 0 || e.libre_disponibilidad > 0 ? `a favor ${fmtM(e.saldo_tecnico + e.libre_disponibilidad)}` : null
  return (
    <button type="button" onClick={onAbrir} className="flex flex-col items-start gap-0.5 text-left hover:underline"
      title={`${est.hint}. Click para ver la posición y ${e.estado === 'sin_generar' ? 'generar' : e.estado === 'desactualizado' ? 'regenerar' : 'ver'} el asiento de IVA`}>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${est.clase}`}>{est.corto}</span>
      {monto && e.estado !== 'sin_generar' && <span className="text-[10px] text-gris-dark font-mono tabular-nums">{monto}</span>}
    </button>
  )
}
