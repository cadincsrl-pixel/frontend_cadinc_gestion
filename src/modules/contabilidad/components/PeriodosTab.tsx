'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import type { CtbPeriodo } from '@/types/contabilidad.types'
import { useCerrarPeriodo, useEjercicios, usePeriodos } from '../hooks/useContabilidad'
import { bloqueoCerrarTxt, bloqueoReabrirTxt, fmtFecha, fmtFechaHora, fmtM, hoyAR, nombreMes } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Aviso, Campo, Cargando, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'
import { ModalReabrirPeriodo } from './ModalReabrirPeriodo'

/**
 * Los 12 períodos (meses) del ejercicio. Cerrar un período NUMERA sus
 * asientos confirmados (correlativos en el ejercicio, por fecha) y lo congela:
 * ya no se carga, edita ni borra nada con fecha en ese mes. Se cierran en
 * orden y sin borradores. Solo se reabre el último cerrado.
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
  const [aReabrir, setAReabrir] = useState<CtbPeriodo | null>(null)

  const sinPermiso = !cerrarPeriodos ? 'No tenés permiso (hace falta «Cerrar y reabrir períodos»)'
    : !puedeEditar ? 'No tenés permiso de Editar en Contabilidad' : null

  async function hacerCierre() {
    if (!aCerrar) return
    try {
      const r = await cerrar.mutateAsync(aCerrar.id)
      toast(r.numerados > 0
        ? `✓ ${nombreMes(aCerrar.desde)} cerrado · ${r.numerados} asiento${r.numerados === 1 ? '' : 's'} numerado${r.numerados === 1 ? '' : 's'} (N° ${r.desde_numero} a ${r.hasta_numero})`
        : `✓ ${nombreMes(aCerrar.desde)} cerrado (no tenía asientos)`, 'ok')
      setACerrar(null)
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }

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
      </Tarjeta>

      {ejerciciosQ.isError ? <ErrorCarga mensaje={mensajeErrorCtb(ejerciciosQ.error)} onReintentar={() => void ejerciciosQ.refetch()} />
        : isLoading || ejerciciosQ.isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : periodos.length === 0 ? <Vacio>No hay períodos cargados para este ejercicio.</Vacio>
        : (
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[980px]">
                <thead>
                  <tr>
                    <Th>Período</Th><Th>Estado</Th><Th derecha>Borradores</Th><Th derecha>Confirmados</Th><Th derecha>Anulados</Th>
                    <Th>Números</Th><Th derecha>Total Debe</Th><Th>Cierre</Th><Th />
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
        <Modal open onClose={cerrar.isPending ? () => {} : () => setACerrar(null)} width="max-w-md" title={`Cerrar ${nombreMes(aCerrar.desde)}`}
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => setACerrar(null)} disabled={cerrar.isPending}>Cancelar</Button>
            <Button size="sm" loading={cerrar.isPending} onClick={hacerCierre}>Cerrar el período</Button>
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
          </div>
        </Modal>
      )}
      {aReabrir && <ModalReabrirPeriodo periodo={aReabrir} onClose={() => setAReabrir(null)} />}
    </div>
  )
}
