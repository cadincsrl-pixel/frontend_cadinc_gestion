'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { usePermisos } from '@/hooks/usePermisos'
import {
  esEmisionIncierta, invalidarFacturacion, reconciliarFacturaVenta, useEmitirFacturaVenta,
} from '../hooks/useFacturacion'
import { codigoErrorFacturacion, leerCuerpoError, mensajeErrorFacturacion } from '../utils/facturacion.errores'
import { cortoTipo, etiquetaProducto, fmtDoc, fmtFecha, fmtM, mensajesArca, nombreTipo, obraDeFactura } from '../utils/facturacion.utils'
import { descargarFacturaPdf } from '../utils/facturaPdf'
import { useConfigVentasValores } from '../hooks/useConfigVentas'
import type { VentasArcaEstado, VentasFacturaFJ } from '@/types/domain.types'
import { Aviso, MensajesArca } from './FichaFactura'

/**
 * Confirmar y mandar un borrador a ARCA.
 *
 * Las respuestas posibles del backend y qué hace cada una acá:
 *   200  autorizada → número + CAE, botón PDF.
 *   422  ARCA_RECHAZO → la factura quedó `rechazada`: se muestran Errores Y
 *        Observaciones (el 10016 de la fecha viene en Observaciones).
 *   202  EMISION_INCIERTA → ARCA no contestó y no se sabe si autorizó: se
 *        pregunta a /reconciliar cada 5 s hasta 1 minuto. Nunca se reintenta
 *        a ciegas: mandar de nuevo podría duplicar la factura.
 *   409  EMISION_EN_CURSO / 503 ARCA_* → no se mandó nada; se explica y se puede
 *        volver a probar.
 */

interface Props {
  fj:      VentasFacturaFJ
  arca:    VentasArcaEstado | undefined
  onClose: () => void
}

type Paso =
  | { tipo: 'confirmar' }
  | { tipo: 'autorizada'; fj: VentasFacturaFJ }
  | { tipo: 'rechazada'; errores: string[]; observaciones: string[] }
  | { tipo: 'verificando'; segundos: number }
  | { tipo: 'sin_confirmar' }
  | { tipo: 'error'; mensaje: string; codigo: string | null }

const INTERVALO_MS = 5_000
const LIMITE_MS    = 60_000

export function ModalConfirmarEmision({ fj, arca, onClose }: Props) {
  const qc = useQueryClient()
  const { esAdmin } = usePermisos('facturacion')
  const emitir = useEmitirFacturaVenta()
  const [paso, setPaso] = useState<Paso>({ tipo: 'confirmar' })
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const leyendaFce = useConfigVentasValores().valores.leyenda_fce
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  const f = fj.factura
  const ambiente = arca?.ambiente ?? f.ambiente
  const titulo = nombreTipo(f.cbte_tipo)

  /** Pregunta a ARCA cada 5 s hasta 1 minuto. */
  async function verificarHastaSaber() {
    const inicio = Date.now()
    setPaso({ tipo: 'verificando', segundos: 0 })
    while (vivo.current && Date.now() - inicio < LIMITE_MS) {
      await new Promise(r => setTimeout(r, INTERVALO_MS))
      if (!vivo.current) return
      setPaso({ tipo: 'verificando', segundos: Math.round((Date.now() - inicio) / 1000) })
      try {
        const r = await reconciliarFacturaVenta(f.id)
        if (r.factura.estado === 'autorizada') {
          await invalidarFacturacion(qc)
          if (vivo.current) setPaso({ tipo: 'autorizada', fj: r })
          return
        }
        if (r.factura.estado === 'rechazada') {
          await invalidarFacturacion(qc)
          if (vivo.current) setPaso({
            tipo: 'rechazada',
            errores: mensajesArca(r.factura.errores_arca), observaciones: mensajesArca(r.factura.observaciones_arca),
          })
          return
        }
        if (r.factura.estado === 'borrador') {
          await invalidarFacturacion(qc)
          if (vivo.current) setPaso({
            tipo: 'error', codigo: 'NO_LLEGO',
            mensaje: 'ARCA confirmó que NO recibió el comprobante: volvió a borrador. Podés emitirlo de nuevo.',
          })
          return
        }
      } catch (e) {
        const codigo = codigoErrorFacturacion(e)
        // Un error de red en el medio no corta la espera; un conflicto sí.
        if (codigo === 'CONFLICTO_NUMERACION' || codigo === 'SIN_PERMISO' || codigo === 'FACTURA_NO_EXISTE') {
          await invalidarFacturacion(qc)
          if (vivo.current) setPaso({ tipo: 'error', codigo, mensaje: mensajeErrorFacturacion(e) })
          return
        }
      }
    }
    await invalidarFacturacion(qc)
    if (vivo.current) setPaso({ tipo: 'sin_confirmar' })
  }

  async function mandar(forzar = false) {
    try {
      const r = await emitir.mutateAsync({ id: f.id, forzar })
      if (esEmisionIncierta(r)) {
        await verificarHastaSaber()
        return
      }
      setPaso({ tipo: 'autorizada', fj: r })
    } catch (e) {
      const { error, detail } = leerCuerpoError(e)
      if (error === 'ARCA_RECHAZO') {
        const d = (detail ?? {}) as { errores?: unknown; observaciones?: unknown }
        setPaso({ tipo: 'rechazada', errores: mensajesArca(d.errores), observaciones: mensajesArca(d.observaciones) })
        return
      }
      if (error === 'EMISION_INCIERTA') {   // por si algún proxy lo convierte en error
        await verificarHastaSaber()
        return
      }
      setPaso({ tipo: 'error', codigo: error ?? null, mensaje: mensajeErrorFacturacion(e) })
    }
  }

  async function pdf(x: VentasFacturaFJ) {
    setGenerandoPdf(true)
    try { await descargarFacturaPdf(x, { leyenda: leyendaFce }) } finally { setGenerandoPdf(false) }
  }

  const verificando = paso.tipo === 'verificando'
  const enviando = emitir.isPending

  return (
    <Modal
      open
      // Mientras se espera la respuesta de ARCA no se cierra: la persona tiene
      // que ver en qué terminó antes de irse.
      onClose={enviando || verificando ? () => {} : onClose}
      width="max-w-xl"
      title={paso.tipo === 'autorizada' ? `${titulo} autorizada` : `Emitir ${titulo}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end">
          {paso.tipo === 'confirmar' && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={enviando}>Cancelar</Button>
              <Button size="sm" onClick={() => mandar(false)} loading={enviando}>
                Emitir en ARCA
              </Button>
            </>
          )}
          {paso.tipo === 'autorizada' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => pdf(paso.fj)} loading={generandoPdf}>🖨 PDF</Button>
              <Button size="sm" onClick={onClose}>Listo</Button>
            </>
          )}
          {(paso.tipo === 'rechazada' || paso.tipo === 'sin_confirmar') && (
            <Button size="sm" onClick={onClose}>Cerrar</Button>
          )}
          {paso.tipo === 'error' && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
              {(paso.codigo === 'NC_SUPERA_FACTURA' || paso.codigo === 'CORRESPONDE_FCE' || paso.codigo === 'NO_CORRESPONDE_FCE') && esAdmin && (
                <Button variant="danger" size="sm" onClick={() => mandar(true)} loading={enviando}
                  title={paso.codigo === 'NC_SUPERA_FACTURA'
                    ? 'Solo admin: emitir aunque la nota de crédito supere el saldo de la factura'
                    : 'Solo admin: emitir con este tipo aunque ARCA diga otra cosa'}>
                  Emitir igual (forzar)
                </Button>
              )}
              {['ARCA_NO_DISPONIBLE', 'ARCA_TA_PERDIDO', 'EMISION_EN_CURSO', 'NO_LLEGO'].includes(paso.codigo ?? '') && (
                <Button size="sm" onClick={() => { setPaso({ tipo: 'confirmar' }) }}>Probar de nuevo</Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {paso.tipo === 'confirmar' && (
          <>
            {ambiente === 'homo'
              ? <Aviso tono="amarillo"><b>HOMOLOGACIÓN</b> — se emite contra el ambiente de prueba de ARCA: no tiene validez fiscal.</Aviso>
              : <Aviso tono="rojo"><b>PRODUCCIÓN</b> — este comprobante va a tener validez fiscal.</Aviso>}

            <div className="bg-gris rounded p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-gris-dark">Comprobante</span><span className="font-semibold">{titulo} · PV {String(f.pto_vta).padStart(5, '0')}</span>
              <span className="text-gris-dark">Cliente</span><span className="font-semibold">{f.rec_razon_social}</span>
              <span className="text-gris-dark">Documento</span><span className="font-mono">{fmtDoc(f.rec_doc_tipo, f.rec_doc_nro)}</span>
              <span className="text-gris-dark">Fecha</span><span>{fmtFecha(f.fecha_cbte)}</span>
              <span className="text-gris-dark">Producto</span><span>{etiquetaProducto(f.producto)} · {obraDeFactura(f) ?? 'sin obra'}</span>
              {f.es_nc && f.asociada_numero_fmt && (<><span className="text-gris-dark">Corrige</span><span className="font-mono">{cortoTipo(f.asociada_cbte_tipo)} {f.asociada_numero_fmt}</span></>)}
              {f.cbte_tipo === 201 && (<>
                <span className="text-gris-dark">Vto. del pago</span><span>{fmtFecha(f.fch_vto_pago)}</span>
                <span className="text-gris-dark">CBU</span><span className="font-mono">{f.fce_cbu}{f.fce_alias ? ` · ${f.fce_alias}` : ''}</span>
                <span className="text-gris-dark">Transferencia</span><span>{f.fce_transmision}</span>
              </>)}
              {f.cbte_tipo === 203 && (<><span className="text-gris-dark">Anula (opc. 22)</span><span>{f.nc_anulacion === 'S' ? 'Sí (rechazo del comprador)' : 'No'}</span></>)}
              <span className="text-gris-dark">Neto</span><span className="font-mono tabular-nums">{fmtM(f.imp_neto)}</span>
              <span className="text-gris-dark">IVA</span><span className="font-mono tabular-nums">{fmtM(f.imp_iva)}</span>
              <span className="text-gris-dark font-bold">Total</span><span className="font-mono tabular-nums font-bold">{fmtM(f.imp_total)}</span>
            </div>

            <p className="text-xs text-carbon">
              <b>Una vez emitida no se puede modificar: solo se anula con nota de crédito.</b> Revisá cliente, importes y fecha antes de seguir.
            </p>
            {arca && !arca.configurado && (
              <Aviso tono="rojo">ARCA no está configurado en el servidor{arca.falta.length ? ` (falta: ${arca.falta.join(', ')})` : ''}. La emisión va a fallar.</Aviso>
            )}
            {arca && arca.configurado && !arca.dummy && (
              <Aviso tono="naranja">ARCA no respondió la última consulta de estado. Podés intentar igual; si no contesta, no se manda nada.</Aviso>
            )}
            {enviando && <div className="text-xs text-gris-dark">Mandando a ARCA… no cierres esta ventana.</div>}
          </>
        )}

        {paso.tipo === 'verificando' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="w-8 h-8 border-4 border-naranja border-t-transparent rounded-full animate-spin" />
            <div className="font-semibold">ARCA no respondió, verificando…</div>
            <div className="text-xs text-gris-dark max-w-sm">
              Le estamos preguntando a ARCA si autorizó el comprobante ({paso.segundos} s de 60). No lo mandes de nuevo:
              podría quedar duplicado.
            </div>
          </div>
        )}

        {paso.tipo === 'autorizada' && (
          <div className="bg-verde-light border border-verde/30 rounded p-3 text-sm text-verde flex flex-col gap-1">
            <div className="font-bold">✓ ARCA autorizó el comprobante</div>
            <div>N° <b className="font-mono">{paso.fj.factura.numero_fmt}</b></div>
            <div>CAE <b className="font-mono">{paso.fj.factura.cae}</b> · vence {fmtFecha(paso.fj.factura.cae_vto)}</div>
            <div className="font-mono">Total {fmtM(paso.fj.factura.imp_total)}</div>
            {mensajesArca(paso.fj.factura.observaciones_arca).length > 0 && (
              <div className="text-[#7A5000] text-xs mt-1">Observaciones: {mensajesArca(paso.fj.factura.observaciones_arca).join(' · ')}</div>
            )}
          </div>
        )}

        {paso.tipo === 'rechazada' && (
          <>
            <Aviso tono="naranja">
              <b>ARCA rechazó el comprobante.</b> Quedó como «rechazada»: volvela a borrador desde la ficha, corregí lo que
              dicen los mensajes y emitila de nuevo.
            </Aviso>
            {(paso.errores.length > 0 || paso.observaciones.length > 0)
              ? <MensajesArca errores={paso.errores} observaciones={paso.observaciones} />
              : <div className="text-xs text-gris-dark">ARCA no mandó detalle del rechazo.</div>}
          </>
        )}

        {paso.tipo === 'sin_confirmar' && (
          <Aviso tono="rojo">
            <b>Después de un minuto ARCA todavía no confirma nada.</b> El comprobante quedó «sin confirmar» y el talonario
            trabado hasta saberlo. El sistema lo vuelve a verificar solo; también podés tocar «Verificar en ARCA» desde la
            bandeja en un rato. <b>No lo cargues de nuevo.</b>
          </Aviso>
        )}

        {paso.tipo === 'error' && (
          <Aviso tono={paso.codigo === 'NO_LLEGO' ? 'amarillo' : 'rojo'}>{paso.mensaje}</Aviso>
        )}
      </div>
    </Modal>
  )
}
