'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useBorrarFacturaVenta, useDescartarFacturaVenta, useFacturaVenta, useReconciliarFacturaVenta, useVolverABorrador,
} from '../hooks/useFacturacion'
import {
  ALICUOTA_LABEL, CONDICIONES_IVA, ESTADO_META, cortoTipo, fmtCant, fmtDoc, fmtFecha, fmtFechaHora, fmtM, fmtPrecio,
  mensajesArca, numeroTxt, resultadoReconciliacion, obraDeFactura,
} from '../utils/facturacion.utils'
import { codigoErrorFacturacion, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import { descargarFacturaPdf } from '../utils/facturaPdf'
import type { VentasEvento, VentasFacturaFJ } from '@/types/domain.types'
import { EstadoBadge } from './FacturasTabla'

/**
 * La ficha de un comprobante: todo lo que se sabe de él y lo que se le puede
 * hacer según quién mira y en qué estado está. Las acciones se DESHABILITAN
 * con el motivo en el tooltip, no se esconden (§6 del CLAUDE.md).
 */

interface Props {
  id:            number
  onClose:       () => void
  onEditar:      (id: number) => void
  onNotaCredito: (fj: VentasFacturaFJ) => void
  onEmitir:      (fj: VentasFacturaFJ) => void
}

const EVENTO_LABEL: Record<string, string> = {
  creada: 'Creada', editada: 'Editada', emision_iniciada: 'Emisión iniciada', intento: 'Enviada a ARCA',
  autorizada: 'Autorizada por ARCA', rechazada: 'Rechazada por ARCA', error_reconciliar: 'ARCA no respondió',
  vuelta_a_borrador: 'Volvió a borrador', descartada: 'Descartada', registrada_finnegans: 'Registrada en Finnegans',
  registro_deshecho: 'Registro de Finnegans deshecho',
}

export function FichaFactura({ id, onClose, onEditar, onNotaCredito, onEmitir }: Props) {
  const toast = useToast()
  const {
    puedeCrear, puedeEditar, puedeEliminar, emitirFacturas, emitirNotasCredito,
  } = usePermisos('facturacion')

  const { data, isLoading, error, refetch } = useFacturaVenta(id)
  const borrar     = useBorrarFacturaVenta()
  const descartar  = useDescartarFacturaVenta()
  const volver     = useVolverABorrador()
  const reconciliar = useReconciliarFacturaVenta()

  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmBorrar, setConfirmBorrar] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  if (isLoading || (!data && !error)) {
    return (
      <Modal open onClose={onClose} title="Comprobante" width="max-w-4xl">
        <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
      </Modal>
    )
  }
  if (error || !data) {
    return (
      <Modal open onClose={onClose} title="Comprobante" width="max-w-4xl">
        <div className="bg-rojo-light border border-rojo/30 rounded p-3 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(error)}</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>Reintentar</Button>
        </div>
      </Modal>
    )
  }

  const fj = data
  const f = data.factura
  const meta = ESTADO_META[f.estado]
  const esBorrador = f.estado === 'borrador'
  const nuncaFueAArca = esBorrador && !f.numero_intentado && Number(f.intento_n) === 0
  const puedeEmitirEste = f.es_nc ? emitirNotasCredito : emitirFacturas
  const saldo = f.saldo_nc !== null && f.saldo_nc !== undefined ? Number(f.saldo_nc) : null
  const errores = mensajesArca(f.errores_arca)
  const observaciones = mensajesArca(f.observaciones_arca)
  const facturaId = f.id

  async function accion(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      toast(ok, 'ok')
      setPidiendoMotivo(false); setMotivo('')
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  async function pdf() {
    setGenerandoPdf(true)
    try { await descargarFacturaPdf(fj) }
    catch { toast('No se pudo generar el PDF', 'err') }
    finally { setGenerandoPdf(false) }
  }

  async function verificar() {
    try {
      const r = await reconciliar.mutateAsync(facturaId)
      const res = resultadoReconciliacion(r.factura)
      toast(res.texto, res.tono)
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={`${numeroTxt(f)} · ${f.rec_razon_social}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>

          {esBorrador && (
            <Button variant="danger" size="sm" onClick={() => setConfirmBorrar(true)}
              disabled={!puedeEliminar || !nuncaFueAArca}
              title={!puedeEliminar ? 'No tenés permiso para borrar comprobantes'
                : !nuncaFueAArca ? 'Ya pasó por ARCA: no se borra, se descarta (queda en el historial)'
                : 'Borrar el borrador'}>
              Borrar
            </Button>
          )}

          {(esBorrador || f.estado === 'rechazada') && (
            <Button variant="secondary" size="sm" onClick={() => setPidiendoMotivo(true)}
              disabled={!puedeEliminar}
              title={puedeEliminar ? 'Descartar sin emitir: queda en el historial' : 'No tenés permiso para descartar comprobantes'}>
              Descartar
            </Button>
          )}

          {f.estado === 'rechazada' && (
            <Button variant="secondary" size="sm"
              onClick={() => accion(() => volver.mutateAsync(f.id), '✓ Volvió a borrador: corregila y emitila de nuevo')}
              loading={volver.isPending}
              disabled={!puedeEditar}
              title={puedeEditar ? 'Volver a borrador para corregir lo que ARCA rechazó' : 'No tenés permiso para editar comprobantes'}>
              Volver a borrador
            </Button>
          )}

          {esBorrador && (
            <Button variant="secondary" size="sm" onClick={() => onEditar(f.id)}
              disabled={!puedeEditar}
              title={puedeEditar ? 'Editar el borrador' : 'No tenés permiso para editar comprobantes'}>
              ✏️ Editar
            </Button>
          )}

          {(f.estado === 'error_reconciliar' || f.estado === 'emitiendo') && (
            <Button variant="danger" size="sm" onClick={verificar} loading={reconciliar.isPending}
              disabled={!puedeEmitirEste}
              title={puedeEmitirEste ? 'Preguntarle a ARCA si autorizó este número'
                : `Hace falta el permiso de emitir ${f.es_nc ? 'notas de crédito' : 'facturas'}`}>
              Verificar en ARCA
            </Button>
          )}

          {f.estado === 'autorizada' && !f.es_nc && (
            <Button variant="secondary" size="sm" onClick={() => onNotaCredito(fj)}
              disabled={!emitirNotasCredito || !puedeCrear || (saldo !== null && saldo <= 0)}
              title={!emitirNotasCredito ? 'Hace falta el permiso de emitir notas de crédito'
                : !puedeCrear ? 'No tenés permiso para cargar comprobantes'
                : saldo !== null && saldo <= 0 ? 'La factura ya está anulada por completo con notas de crédito'
                : 'Cargar una nota de crédito contra esta factura'}>
              ↩ Nota de crédito
            </Button>
          )}

          <Button variant="secondary" size="sm" onClick={pdf} loading={generandoPdf}
            disabled={!(f.estado === 'autorizada' || f.estado === 'borrador' || f.estado === 'rechazada')}
            title={f.estado === 'autorizada' ? 'Descargar el PDF con QR y CAE'
              : f.estado === 'borrador' || f.estado === 'rechazada'
                ? 'Vista previa en PDF (BORRADOR, sin validez fiscal) para que el cliente o el contador la revisen antes de pedir el CAE'
                : 'El PDF sale cuando ARCA confirma el comprobante'}>
            🖨 {f.estado === 'autorizada' ? 'PDF' : 'PDF borrador'}
          </Button>

          {esBorrador && (
            <Button size="sm" onClick={() => onEmitir(fj)}
              disabled={!puedeEmitirEste}
              title={puedeEmitirEste
                ? 'Mandarla a ARCA para que le dé número y CAE'
                : f.es_nc ? 'Hace falta el permiso de emitir notas de crédito' : 'Hace falta el permiso de emitir facturas'}>
              Emitir en ARCA
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {f.es_homologacion && (
          <Aviso tono="amarillo"><b>HOMOLOGACIÓN</b> — comprobante de prueba, sin validez fiscal.</Aviso>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <EstadoBadge f={f} />
          <span className="text-xs text-gris-dark">{meta.hint}</span>
        </div>

        {f.estado === 'error_reconciliar' && (
          <Aviso tono="rojo">
            ARCA no respondió cuando se mandó el N° <b className="font-mono">{f.numero_intentado_fmt ?? '—'}</b> y no se sabe si
            lo autorizó. Hasta verificarlo, <b>nadie puede emitir otro comprobante del mismo tipo</b>. Tocá «Verificar en ARCA».
          </Aviso>
        )}

        {(errores.length > 0 || observaciones.length > 0) && f.estado !== 'autorizada' && (
          <MensajesArca errores={errores} observaciones={observaciones} />
        )}

        {/* Importes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato label="Neto gravado" valor={fmtM(f.imp_neto)} fuerte />
          <Dato label="IVA" valor={fmtM(f.imp_iva)} fuerte />
          <Dato label="Total" valor={fmtM(f.imp_total)} fuerte />
          {!f.es_nc && f.estado === 'autorizada'
            ? <Dato label="Saldo para NC" valor={saldo !== null ? fmtM(saldo) : '—'} />
            : <Dato label="Fecha" valor={fmtFecha(f.fecha_cbte)} />}
        </div>

        {/* Autorización */}
        {f.estado === 'autorizada' && (
          <div className="bg-verde-light/50 border border-verde/30 rounded p-2 text-xs grid grid-cols-1 sm:grid-cols-3 gap-1">
            <span>N° <b className="font-mono">{f.numero_fmt}</b></span>
            <span>CAE <b className="font-mono">{f.cae}</b> · vence {fmtFecha(f.cae_vto)}</span>
            <span>Emitió {f.emitida_por_nombre ?? '—'}, {fmtFechaHora(f.emitida_at)}</span>
            {observaciones.length > 0 && (
              <span className="sm:col-span-3 text-[#7A5000]">Observaciones de ARCA: {observaciones.join(' · ')}</span>
            )}
          </div>
        )}

        {f.es_nc && (f.asociada_numero_fmt || fj.asociados.length > 0) && (
          <Aviso tono="gris">
            Corrige la factura <b className="font-mono">{cortoTipo(f.asociada_cbte_tipo)} {f.asociada_numero_fmt ?? fj.asociados[0]?.numero}</b>
            {fj.asociados[0] && <> del {fmtFecha(fj.asociados[0].fecha_cbte)}</>}.
          </Aviso>
        )}

        {/* Datos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Dato label="Tipo" valor={f.tipo_nombre} />
          <Dato label="Fecha" valor={fmtFecha(f.fecha_cbte)} />
          <Dato label="Cliente" valor={f.rec_razon_social} />
          <Dato label="Documento" valor={fmtDoc(f.rec_doc_tipo, f.rec_doc_nro)} />
          <Dato label="Condición IVA" valor={CONDICIONES_IVA[f.rec_condicion_iva_id] ?? String(f.rec_condicion_iva_id)} />
          <Dato label="Domicilio" valor={f.rec_domicilio || '—'} />
          <Dato label="Producto" valor={f.producto === 'TRANSPORTE' ? 'Transporte' : 'Avance de obra'} />
          <Dato label="Obra / centro de costo" valor={obraDeFactura(f) ?? '—'} />
          <Dato label="Provincias" valor={`${f.provincia_origen} → ${f.provincia_destino}`} />
          <Dato label="Condición de pago" valor={f.condicion_pago} />
          <Dato label="Remitos" valor={f.remitos || '—'} />
          {f.cbte_tipo === 201 && <>
            <Dato label="Vto. del pago" valor={fmtFecha(f.fch_vto_pago)} />
            <Dato label="Cuenta (CBU)" valor={[f.fce_banco, f.fce_cbu, f.fce_alias].filter(Boolean).join(' · ') || '—'} />
            <Dato label="Transferencia" valor={f.fce_transmision === 'ADC' ? 'Agente de Depósito Colectivo' : 'Sistema de Circulación Abierta'} />
            {f.fce_referencia && <Dato label="Referencia comercial" valor={f.fce_referencia} />}
          </>}
          {f.cbte_tipo === 203 && (
            <Dato label="Anulación (opc. 22)" valor={f.nc_anulacion === 'S' ? 'Sí: anula por rechazo del comprador' : 'No'} />
          )}
        </div>
        {f.observaciones && <div><Etiqueta>Observaciones</Etiqueta><div>{f.observaciones}</div></div>}
        {f.obs_interna && <div><Etiqueta>Nota interna</Etiqueta><div className="text-gris-dark">{f.obs_interna}</div></div>}

        {/* Renglones */}
        <Bloque titulo={`Renglones · ${fj.renglones.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-gris-dark text-[10px] uppercase">
                  <th className="text-left py-1">Descripción</th>
                  <th className="text-right py-1">Cant.</th>
                  <th className="text-left py-1 pl-2">Unidad</th>
                  <th className="text-right py-1">Precio neto</th>
                  <th className="text-right py-1">IVA</th>
                  <th className="text-right py-1">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {fj.renglones.map(r => (
                  <tr key={r.id} className="border-t border-gris align-top">
                    <td className="py-1 whitespace-pre-wrap">{r.descripcion}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtCant(r.cantidad)}</td>
                    <td className="py-1 pl-2">{r.unidad}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtPrecio(r.precio_unit)}</td>
                    <td className="py-1 text-right">{ALICUOTA_LABEL[r.alicuota_id] ?? ''}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtM(r.importe_neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fj.alicuotas.length > 0 && (
            <div className="text-[11px] text-gris-dark mt-1">
              {fj.alicuotas.map(a => `IVA ${ALICUOTA_LABEL[a.alicuota_id] ?? ''} s/ ${fmtM(a.base_imp)}: ${fmtM(a.importe)}`).join(' · ')}
            </div>
          )}
        </Bloque>

        {/* Finnegans */}
        {f.estado === 'autorizada' && (
          <Bloque titulo="Finnegans">
            {f.numero_finnegans
              ? <div className="text-xs">✓ Registrada con el N° <b className="font-mono">{f.numero_finnegans}</b>
                  {f.registrada_por_nombre && <> por {f.registrada_por_nombre}</>}{f.registrada_at && <>, {fmtFechaHora(f.registrada_at)}</>}.</div>
              : <div className="text-xs text-gris-dark">Todavía no se cargó en Finnegans (se registra desde el tab Finnegans).</div>}
          </Bloque>
        )}

        {/* Eventos */}
        <Bloque titulo="Historia">
          <Eventos eventos={data.eventos ?? []} />
          <div className="text-[10px] text-gris-dark mt-1">
            Cargó {f.created_by_nombre ?? '—'}, {fmtFechaHora(f.created_at)}
          </div>
        </Bloque>

        {/* Descartar */}
        {pidiendoMotivo && (
          <div className="border-t border-gris pt-3">
            <label className="block text-xs font-semibold text-gris-dark mb-1">Motivo (opcional)</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
              placeholder="Ej.: se cargó duplicada"
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm outline-none focus:border-naranja" />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setPidiendoMotivo(false); setMotivo('') }}>Cancelar</Button>
              <Button variant="danger" size="sm" loading={descartar.isPending}
                onClick={() => accion(() => descartar.mutateAsync({ id: f.id, motivo: motivo.trim() || undefined }), '✓ Descartada')}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {confirmBorrar && (
          <div className="border-t border-gris pt-3 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-rojo font-semibold">¿Borrar este borrador? No queda rastro.</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmBorrar(false)}>No</Button>
              <Button variant="danger" size="sm" loading={borrar.isPending}
                onClick={async () => {
                  try { await borrar.mutateAsync(facturaId); toast('✓ Borrador borrado', 'ok'); onClose() }
                  catch (e) {
                    toast(mensajeErrorFacturacion(e), 'err')
                    // Ya consultó ARCA: no se borra, se descarta (queda en el historial).
                    if (codigoErrorFacturacion(e) === 'FACTURA_NO_BORRABLE') { setConfirmBorrar(false); setPidiendoMotivo(true) }
                  }
                }}>
                Sí, borrar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function MensajesArca({ errores, observaciones }: { errores: string[]; observaciones: string[] }) {
  return (
    <div className="border border-rojo/30 bg-rojo-light rounded p-2.5 text-xs text-rojo flex flex-col gap-1">
      {errores.length > 0 && (
        <div>
          <b>Errores de ARCA</b>
          <ul className="list-disc pl-4">{errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {observaciones.length > 0 && (
        <div className="text-[#7A3000]">
          <b>Observaciones de ARCA</b>
          <ul className="list-disc pl-4">{observaciones.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function Eventos({ eventos }: { eventos: VentasEvento[] }) {
  if (eventos.length === 0) return <div className="text-xs text-gris-dark italic">Sin eventos.</div>
  return (
    <ul className="flex flex-col gap-1">
      {eventos.map(e => {
        const det = e.detalle ?? {}
        const extra = [
          typeof det.numero_finnegans === 'string' ? `N° ${det.numero_finnegans}` : null,
          typeof det.motivo === 'string' && det.motivo ? `«${det.motivo}»` : null,
          det.numero_intentado ? `N° intentado ${String(det.numero_intentado)}` : null,
          typeof det.cae === 'string' ? `CAE ${det.cae}` : null,
        ].filter(Boolean).join(' · ')
        return (
          <li key={e.id} className="text-xs flex gap-2">
            <span className="text-gris-dark whitespace-nowrap font-mono text-[11px]">{fmtFechaHora(e.created_at)}</span>
            <span>
              <b>{EVENTO_LABEL[e.tipo] ?? e.tipo}</b>
              {e.user_nombre && <span className="text-gris-dark"> — {e.user_nombre}</span>}
              {extra && <span className="text-gris-dark"> · {extra}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`${fuerte ? 'font-mono font-bold tabular-nums' : ''} break-words`}>{valor}</div>
    </div>
  )
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-bold text-gris-dark uppercase">{children}</span>
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-t border-gris pt-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">{titulo}</div>
      {children}
    </div>
  )
}

export function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris'; children: ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}
