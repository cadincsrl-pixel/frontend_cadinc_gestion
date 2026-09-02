'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { abrirAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import type { Certificacion, Contratista } from '@/types/domain.types'
import {
  useDeleteCertificacion,
  useUpdateCertificacion,
  fetchPresupuestoDocSignedUrl,
} from '../../hooks/useContratistas'
import {
  fmtMonto, fmtDDMM, rangoSemana, fechaPago, mensajeError, parseISOLocal,
  type ContratistaResumen,
} from './utils'

interface Props {
  resumen:        ContratistaResumen
  semKey:         string
  esSemanaActual: boolean
  verCostos:      boolean
  /** puedeEditar && verPii && !readonly (el card suma !finalizado). */
  puedeMutar:     boolean
  motivoBloqueo:  string | null
  puedeEditarContrat: boolean
  puedeQuitar:    boolean
  onEditarContrat: (c: Contratista) => void
  onQuitar:        () => void
  onFinalizar:     () => void
  onReactivar:     () => void
  onCertificar:    (semKey: string) => void
  onPresupuesto:   (presupuestoId: number | null) => void
}

const BTN_ICONO = 'text-[11px] px-1 rounded text-gris-dark hover:bg-azul-light hover:text-azul transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gris-dark'

export function ContratistaCard({
  resumen: r, semKey, esSemanaActual, verCostos, puedeMutar, motivoBloqueo,
  puedeEditarContrat, puedeQuitar,
  onEditarContrat, onQuitar, onFinalizar, onReactivar, onCertificar, onPresupuesto,
}: Props) {
  const toast = useToast()
  const [histAbierto, setHistAbierto] = useState(false)
  const { mutate: borrarCert, isPending: borrando } = useDeleteCertificacion()
  const { mutate: moverCert,  isPending: moviendo } = useUpdateCertificacion()

  const c = r.contratista
  const finalizado = r.finalizado
  const puedeMutarCard = puedeMutar && !finalizado
  const motivo = finalizado ? 'Contratista finalizado en esta obra (reactivalo para editar)' : motivoBloqueo

  function handleBorrarCert(cert: Certificacion) {
    const ok = confirm(
      `¿Borrar la certificación de la semana ${cert.sem_key}` +
      `${cert.presupuesto_titulo ? ` (${cert.presupuesto_titulo})` : ''} por ${fmtMonto(Number(cert.monto))}?`,
    )
    if (!ok) return
    borrarCert(cert.id, {
      onSuccess: () => toast('✓ Certificación borrada', 'ok'),
      onError: (err: unknown) => toast(mensajeError(err, 'No se pudo borrar la certificación'), 'err'),
    })
  }

  function handleMoverCert(cert: Certificacion, presupuestoId: number) {
    const destino = r.presupuestosAbiertos.find(p => p.id === presupuestoId)
    if (!destino) return
    moverCert(
      { id: cert.id, dto: { presupuesto_id: presupuestoId } },
      {
        onSuccess: () => toast(`✓ Certificación movida a "${destino.titulo}"`, 'ok'),
        onError: (err: unknown) => toast(mensajeError(err, 'No se pudo mover la certificación'), 'err'),
      },
    )
  }

  async function handleVerDoc(presupuestoId: number) {
    await abrirAdjuntoFirmado(
      () => fetchPresupuestoDocSignedUrl(presupuestoId),
      (err) => toast(mensajeError(err, 'No se pudo abrir el adjunto'), 'err'),
    )
  }

  return (
    <div className={`border border-gris-mid rounded-xl p-3 flex flex-col gap-2.5 ${finalizado ? 'opacity-60 bg-gris/30' : ''}`}>
      {/* Fila superior: identidad + acciones del contratista */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#EEE8FF] flex items-center justify-center text-[#5A2D82] font-bold text-sm flex-shrink-0">
            {c.nom.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm text-carbon flex items-center gap-2 flex-wrap">
              {c.nom}
              {finalizado && r.asig.finalizado_en && (
                <span className="text-[10px] font-bold bg-gris-mid text-gris-dark px-1.5 py-0.5 rounded uppercase tracking-wide">
                  Finalizado {fmtDDMM(new Date(r.asig.finalizado_en))}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {c.especialidad && (
                <span className="text-[10px] font-bold bg-[#EEE8FF] text-[#5A2D82] px-2 py-0.5 rounded">
                  {c.especialidad}
                </span>
              )}
              {c.tel && (
                <span className="text-xs text-gris-dark">{c.tel}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onEditarContrat(c)}
            disabled={!puedeEditarContrat}
            title={puedeEditarContrat ? 'Editar datos del contratista' : 'Sin permiso de edición en tarja'}
            className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-azul-light hover:text-azul transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✏️ Editar
          </button>
          {finalizado ? (
            <button
              onClick={onReactivar}
              disabled={!puedeMutar}
              title={puedeMutar ? 'Vuelve a estar activo en esta obra' : (motivoBloqueo ?? undefined)}
              className="text-xs font-bold px-2 py-1.5 rounded-lg text-verde hover:bg-verde-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↻ Reactivar
            </button>
          ) : r.tieneHistorial ? (
            <button
              onClick={onFinalizar}
              disabled={!puedeMutar}
              title={puedeMutar ? 'Finalizar en esta obra: no borra nada, deja de certificar' : (motivoBloqueo ?? undefined)}
              className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Finalizar
            </button>
          ) : (
            <button
              onClick={onQuitar}
              disabled={!puedeQuitar}
              title={puedeQuitar ? 'Quitar de esta obra' : 'Sin permiso para quitar'}
              className="text-xs font-bold px-2 py-1.5 rounded-lg text-gris-dark hover:bg-rojo-light hover:text-rojo transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Semana visualizada: un chip por certificación (una por presupuesto).
          Solo con ver_costos: sin el flag el backend no manda montos. */}
      {verCostos && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gris-dark font-semibold">
            {esSemanaActual ? 'Esta semana' : 'Semana'} ({rangoSemana(semKey)} · se paga {fechaPago(semKey)}):
          </span>
          {r.certsSemana.map(cert => (
            <span
              key={cert.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-verde-light text-verde px-2 py-1"
              title={cert.desc || undefined}
            >
              <span className="font-semibold">{cert.presupuesto_titulo ?? 'Sin presupuesto'}</span>
              <span className="font-mono font-bold">{fmtMonto(Number(cert.monto))}</span>
              {!finalizado && (
                <button
                  onClick={() => onCertificar(semKey)}
                  disabled={!puedeMutarCard}
                  title={motivo ?? 'Editar la certificación de esta semana'}
                  className="text-[11px] rounded px-0.5 hover:bg-verde hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✏️
                </button>
              )}
            </span>
          ))}
          {r.certsSemana.length === 0 && (
            <span className="text-gris-dark italic">sin certificar</span>
          )}
          {!finalizado && (
            <button
              onClick={() => onCertificar(semKey)}
              disabled={!puedeMutarCard}
              title={motivo ?? 'Cargar el certificado de esta semana'}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-verde-light text-verde hover:bg-verde hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-verde-light disabled:hover:text-verde"
            >
              ＋ Certificar
            </button>
          )}
        </div>
      )}

      {/* Bloque financiero: presupuestos, certificado, saldo, historial. */}
      {verCostos && (
        <div className="rounded-lg bg-gris/60 px-3 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">Presupuestos</span>
            {!finalizado && (
              <button
                onClick={() => onPresupuesto(null)}
                disabled={!puedeMutarCard}
                title={motivo ?? 'Cargar un presupuesto (o un adicional)'}
                className="text-[11px] font-bold px-1.5 py-0.5 rounded text-azul hover:bg-azul-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ＋ Presupuesto
              </button>
            )}
          </div>

          {r.presupuestos.length === 0 && !r.tieneCertsSinPresup ? (
            <p className="text-xs text-gris-dark italic">
              Sin presupuestos cargados. Hasta que haya uno, las certificaciones se cargan sin presupuesto.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gris-dark">
                    <th className="text-left font-bold px-1 py-1">Presupuesto</th>
                    <th className="text-right font-bold px-1 py-1">Monto</th>
                    <th className="text-right font-bold px-1 py-1">Certificado</th>
                    <th className="text-right font-bold px-1 py-1">Saldo</th>
                    <th className="text-left font-bold px-1 py-1 w-[110px]">Avance</th>
                    <th className="px-1 py-1 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {r.presupuestos.map(pr => {
                    const p = pr.presupuesto
                    const cerrado = p.cerrado_en != null
                    return (
                      <tr key={p.id} className={`border-t border-gris-mid/40 ${cerrado ? 'opacity-60' : ''}`}>
                        <td className="px-1 py-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-carbon">{p.titulo}</span>
                            <span className="text-gris-dark">{fmtDDMM(parseISOLocal(p.fecha))}</span>
                            {p.doc_nombre && (
                              <button
                                onClick={() => handleVerDoc(p.id)}
                                title={`Ver adjunto: ${p.doc_nombre}`}
                                className={BTN_ICONO}
                              >
                                📎
                              </button>
                            )}
                            {cerrado && p.cerrado_en && (
                              <span className="text-[10px] font-bold bg-gris-mid text-gris-dark px-1.5 py-0.5 rounded">
                                cerrado {fmtDDMM(new Date(p.cerrado_en))}
                              </span>
                            )}
                          </div>
                          {p.obs && <div className="text-gris-dark truncate max-w-[260px]" title={p.obs}>{p.obs}</div>}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono font-bold text-carbon whitespace-nowrap">{fmtMonto(Number(p.monto))}</td>
                        <td className="px-1 py-1.5 text-right font-mono text-carbon whitespace-nowrap">{fmtMonto(pr.certificado)}</td>
                        <td className={`px-1 py-1.5 text-right font-mono font-bold whitespace-nowrap ${pr.saldo < 0 ? 'text-rojo' : pr.saldo === 0 ? 'text-gris-dark' : 'text-verde'}`}>
                          {pr.saldo < 0 ? `Excedido ${fmtMonto(-pr.saldo)}` : fmtMonto(pr.saldo)}
                        </td>
                        <td className="px-1 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 flex-1 rounded-full bg-gris-mid/60 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pr.saldo < 0 ? 'bg-rojo' : 'bg-verde'}`}
                                style={{ width: `${Math.min(100, pr.pct)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gris-dark w-8 text-right">{Math.round(pr.pct)}%</span>
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-right">
                          <button
                            onClick={() => onPresupuesto(p.id)}
                            title={puedeMutarCard ? 'Editar presupuesto' : 'Ver presupuesto'}
                            className={BTN_ICONO}
                          >
                            {puedeMutarCard ? '✏️' : '👁'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {r.tieneCertsSinPresup && (
                    <tr className="border-t border-gris-mid/40">
                      <td className="px-1 py-1.5 italic text-gris-dark">Sin presupuesto (histórico)</td>
                      <td className="px-1 py-1.5 text-right text-gris-dark">—</td>
                      <td className="px-1 py-1.5 text-right font-mono text-carbon whitespace-nowrap">{fmtMonto(r.certificadoSinPresup)}</td>
                      <td className="px-1 py-1.5 text-right text-gris-dark">—</td>
                      <td />
                      <td />
                    </tr>
                  )}
                  <tr className="border-t-2 border-gris-mid font-bold">
                    <td className="px-1 py-1.5 text-carbon">TOTAL</td>
                    <td className="px-1 py-1.5 text-right font-mono text-carbon whitespace-nowrap">
                      {r.presupuestos.length > 0 ? fmtMonto(r.totalPresupuestado) : '—'}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono text-carbon whitespace-nowrap">{fmtMonto(r.totalCertificado)}</td>
                    <td className={`px-1 py-1.5 text-right font-mono whitespace-nowrap ${r.totalSaldo < 0 ? 'text-rojo' : 'text-verde'}`}>
                      {r.presupuestos.length > 0
                        ? (r.totalSaldo < 0 ? `Excedido ${fmtMonto(-r.totalSaldo)}` : fmtMonto(r.totalSaldo))
                        : '—'}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {r.certs.length > 0 && (
            <button
              onClick={() => setHistAbierto(p => !p)}
              className="text-[11px] font-bold text-azul hover:text-naranja transition-colors self-end"
            >
              {histAbierto ? '▾ Ocultar historial' : `▸ Historial (${r.certs.length})`}
            </button>
          )}

          {/* Historial: todas las certificaciones del contratista en la obra. */}
          {histAbierto && (
            <div className="flex flex-col divide-y divide-gris-mid/50">
              {r.certs.map(cert => {
                const destinos = r.presupuestosAbiertos.filter(p => p.id !== cert.presupuesto_id)
                return (
                  <div key={cert.id} className="flex items-center gap-2 py-1.5 text-xs flex-wrap sm:flex-nowrap">
                    <span className="font-mono text-gris-dark w-[84px] shrink-0">{cert.sem_key}</span>
                    <span className="text-[10px] text-gris-dark whitespace-nowrap shrink-0">pago {fechaPago(cert.sem_key)}</span>
                    <span
                      className={`truncate max-w-[160px] shrink-0 ${cert.presupuesto_titulo ? 'font-semibold text-carbon' : 'text-gris-dark'}`}
                      title={cert.presupuesto_titulo ?? 'Sin presupuesto'}
                    >
                      {cert.presupuesto_titulo ?? '—'}
                    </span>
                    <span className="text-gris-dark truncate flex-1 min-w-[60px]" title={cert.desc || undefined}>
                      {cert.desc || '—'}
                    </span>
                    <span className="font-mono font-bold text-carbon whitespace-nowrap">{fmtMonto(Number(cert.monto))}</span>
                    {!finalizado && destinos.length > 0 && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) handleMoverCert(cert, Number(e.target.value)) }}
                        disabled={!puedeMutarCard || moviendo}
                        title={motivo ?? 'Imputar esta certificación a otro presupuesto'}
                        className="text-[11px] border border-gris-mid rounded px-1 py-0.5 bg-white text-gris-dark cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <option value="">Mover a…</option>
                        {destinos.map(p => (
                          <option key={p.id} value={p.id}>{p.titulo}</option>
                        ))}
                      </select>
                    )}
                    {!finalizado && (
                      <>
                        <button
                          onClick={() => onCertificar(cert.sem_key)}
                          disabled={!puedeMutarCard}
                          title={motivo ?? 'Corregir esta semana'}
                          className={BTN_ICONO}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleBorrarCert(cert)}
                          disabled={!puedeMutarCard || borrando}
                          title={motivo ?? 'Borrar esta certificación'}
                          className={`${BTN_ICONO} hover:bg-rojo-light hover:text-rojo`}
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
