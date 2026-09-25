'use client'

/**
 * Avisar del pago por mail (2026-09-21).
 *
 * Pedido del dueño: «que cuando se genere una OP se mande un mail al contador
 * y al proveedor con los comprobantes de pago».
 *
 * VA CON UN CLIC, NO AUTOMÁTICO, y es una decisión: de 9 proveedores del
 * padrón 1 tiene mail cargado. Automático, en 8 de 9 casos no saldría nada y
 * el que emitió la orden creería que el proveedor se enteró. Peor que no
 * tenerlo.
 *
 * Y porque un mail con datos de pago NO SE DESMANDA. Este modal existe para
 * que antes de apretar se vea EXACTAMENTE a qué dirección va y qué se adjunta.
 * Si la dirección está mal, el dato salió y no hay vuelta atrás.
 *
 * Cada uno recibe lo suyo, que no es lo mismo: al proveedor el comprobante con
 * el que salió la plata (la factura ya es suya), al contador el par completo,
 * que es lo que necesita para cerrar el asiento.
 */

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAvisarPago, useAvisosDeOrden, useMailEstado } from '../hooks/usePagos'
import { useProveedorPagos } from '../hooks/useProveedoresPagos'
import { ETIQUETA_ROL } from '@/types/contactos'
import { FUENTE_CONTADOR, fmtFecha, fmtM } from '../utils/pagos.utils'
import { useConfigPagos } from '../hooks/useConfigPagos'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosOrdenDetalle } from '@/types/domain.types'

interface Props {
  orden:   PagosOrdenDetalle
  onClose: () => void
}

const inputCls = 'w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-blanco outline-none focus:border-naranja'

const ETIQUETA_ESTADO: Record<string, { txt: string; cls: string }> = {
  enviado: { txt: 'enviado',           cls: 'text-verde' },
  fallado: { txt: 'falló',             cls: 'text-rojo' },
  omitido: { txt: 'sin dirección',     cls: 'text-naranja' },
}

export function ModalAvisarPago({ orden, onClose }: Props) {
  const toast = useToast()
  const mail = useMailEstado()
  // A quién le llega el del contador y de dónde salió (20260929i). Un backend
  // viejo no manda `aviso`: queda el texto de antes.
  const avisoCfg = useConfigPagos().config.aviso
  const avisos = useAvisosDeOrden(orden.id)
  const avisar = useAvisarPago()

  // Contactos del proveedor (20260925e): vienen tildados los que «reciben
  // avisos»; se pueden destildar o sumar otra dirección solo para este envío.
  const prov = useProveedorPagos(orden.proveedor_id)
  const contactos = (prov.data?.contactos ?? []).filter(k => !!k.email)
  const emailPadron = (orden.proveedor_email ?? '').trim().toLowerCase()
  const [aProveedor, setAProveedor] = useState(true)
  const [aContador, setAContador] = useState(true)
  /** null = todavía no tocó nada: los de «recibe avisos» (o el email viejo del padrón). */
  const [elegidos, setElegidos] = useState<Set<string> | null>(null)
  const [otro, setOtro] = useState('')
  const [guardar, setGuardar] = useState(true)
  const porDefecto = new Set(contactos.length
    ? contactos.filter(k => k.recibe_avisos).map(k => k.email!.toLowerCase())
    : emailPadron ? [emailPadron] : [])
  const marcados = elegidos ?? porDefecto
  const alternar = (e: string) => {
    const n = new Set(marcados)
    if (n.has(e)) n.delete(e); else n.add(e)
    setElegidos(n)
  }
  const otroTrim = otro.trim().toLowerCase()
  const emails = [...new Set([...marcados, ...(otroTrim ? [otroTrim] : [])])]

  // Los comprobantes del pago que se van a adjuntar. Si no hay ninguno, el
  // aviso pierde el sentido: se está avisando de un pago sin mostrarlo.
  const comprobantes = orden.adjuntos.filter(a => a.tipo === 'comprobante_pago' && !a.borrado)
  const facturasAdj = orden.lineas.flatMap(l => l.factura?.adjuntos ?? []).filter(a => a.tipo === 'factura')

  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/
  const otroMal = aProveedor && otroTrim !== '' && !EMAIL_RE.test(otroTrim)
  const sinDestino = aProveedor && emails.length === 0
  const demasiados = aProveedor && emails.length > 10 // el backend acepta hasta 10 por envío
  const emailMal = otroMal || sinDestino || demasiados
  const noConfigurado = mail.data && !mail.data.configurado
  const listo = (aProveedor || aContador) && !emailMal && !noConfigurado

  async function mandar() {
    try {
      const r = await avisar.mutateAsync({
        id: orden.id,
        a_proveedor: aProveedor,
        a_contador: aContador,
        emails_proveedor: aProveedor && emails.length ? emails : undefined,
        guardar_email: guardar,
      })
      const enviados = r.resultados.filter(x => x.estado === 'enviado')
      const problemas = r.resultados.filter(x => x.estado !== 'enviado')
      if (enviados.length > 0) {
        toast(`✓ Aviso enviado a ${enviados.map(x => x.email).join(' y ')}`, 'ok')
      }
      for (const p of problemas) {
        toast(`${p.destinatario}: ${p.error}`, 'err')
      }
      if (problemas.length === 0) onClose()
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <Modal open onClose={avisar.isPending ? () => undefined : onClose}
      title={`Avisar del pago · ${orden.numero_fmt}`} width="max-w-xl">
      <div className="flex flex-col gap-3 text-sm">

        <div className="bg-gris/40 border border-gris-mid rounded px-3 py-2 text-xs">
          <b>{orden.proveedor_nom}</b> · {fmtFecha(orden.fecha)} · <b className="font-mono">{fmtM(orden.monto_pagado)}</b>
          {orden.facturas && <span className="block text-gris-dark mt-0.5">Cubre: {orden.facturas}</span>}
        </div>

        {noConfigurado && (
          <div className="bg-rojo-light border border-rojo rounded px-3 py-2 text-xs">
            <b>El servidor todavía no puede mandar mails.</b> Falta configurar{' '}
            <span className="font-mono">{mail.data?.falta.join(', ')}</span> en el backend
            (las casillas de Hostinger: <span className="font-mono">smtp.hostinger.com</span>, puerto 465).
            Mientras tanto se pueden bajar los comprobantes y mandarlos a mano.
          </div>
        )}

        {comprobantes.length === 0 && (
          <div className="bg-rojo-light border border-rojo rounded px-3 py-2 text-xs">
            Esta orden <b>no tiene comprobante de pago adjunto</b>. Se puede avisar igual, pero el mail
            va a salir sin el papel que prueba el pago — que es justamente para lo que sirve.
          </div>
        )}

        {/* ── Proveedor ── */}
        <div className="border border-gris-mid rounded p-2.5 flex flex-col gap-2">
          <label className="flex items-center gap-2 font-semibold cursor-pointer">
            <input type="checkbox" checked={aProveedor} onChange={e => setAProveedor(e.target.checked)} />
            <span>Al proveedor</span>
            {orden.aviso_proveedor && <span className="text-[10px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold">ya se le avisó</span>}
          </label>
          {aProveedor && (
            <>
              <div className="flex flex-col gap-1">
                <label className="block text-[10px] font-semibold text-gris-dark uppercase tracking-wider">
                  A quién {contactos.length ? '· contactos del proveedor' : emailPadron ? '· del padrón' : '· el proveedor no tiene contactos con email'}
                </label>
                {prov.isLoading && <span className="text-xs text-gris-dark">Cargando contactos…</span>}
                {prov.error && <span className="text-xs text-rojo font-semibold">No se pudieron traer los contactos del proveedor: escribí la dirección a mano.</span>}
                {contactos.map(k => (
                  <label key={k.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={marcados.has(k.email!.toLowerCase())} onChange={() => alternar(k.email!.toLowerCase())} />
                    <span className="font-mono">{k.email}</span>
                    <span className="text-gris-dark">{k.nombre ? `${k.nombre} · ` : ''}{ETIQUETA_ROL[k.rol]}</span>
                  </label>
                ))}
                {!contactos.length && emailPadron && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={marcados.has(emailPadron)} onChange={() => alternar(emailPadron)} />
                    <span className="font-mono">{emailPadron}</span>
                  </label>
                )}
                <input value={otro} onChange={e => setOtro(e.target.value)} className={inputCls}
                  placeholder="Otra dirección (opcional)" inputMode="email" autoComplete="off" />
                {otroMal && <span className="text-xs text-rojo font-semibold">Esa dirección no tiene forma de dirección.</span>}
                {sinDestino && <span className="text-xs text-rojo font-semibold">Elegí al menos una dirección o escribí otra.</span>}
                {demasiados && <span className="text-xs text-rojo font-semibold">Hasta 10 direcciones por envío.</span>}
              </div>
              {otroTrim !== '' && !otroMal && !contactos.some(k => k.email!.toLowerCase() === otroTrim) && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={guardar} onChange={e => setGuardar(e.target.checked)} />
                  <span>Guardarla como contacto del proveedor — el próximo aviso ya la trae tildada</span>
                </label>
              )}
              {emails.length > 1 && <div className="text-[11px] text-gris-dark">Sale un mail a cada dirección ({emails.length}).</div>}
              <div className="text-[11px] text-gris-dark">
                Recibe el <b>comprobante del pago</b>
                {comprobantes.length > 0 ? `: ${comprobantes.map(a => a.nombre_archivo).join(', ')}` : ' (no hay ninguno adjunto)'}.
                La factura no se le manda: ya es suya.
              </div>
            </>
          )}
        </div>

        {/* ── Contador ── */}
        <div className="border border-gris-mid rounded p-2.5 flex flex-col gap-2">
          <label className="flex items-center gap-2 font-semibold cursor-pointer">
            <input type="checkbox" checked={aContador} onChange={e => setAContador(e.target.checked)} />
            <span>Al contador</span>
            {orden.aviso_contador && <span className="text-[10px] px-1.5 py-0.5 rounded bg-verde-light text-verde font-bold">ya se le avisó</span>}
          </label>
          {aContador && (
            <div className="text-[11px] text-gris-dark">
              {avisoCfg
                ? avisoCfg.contador_email_efectivo
                  ? <>Va a <b>{avisoCfg.contador_email_efectivo}</b>{avisoCfg.contador_fuente ? ` (${FUENTE_CONTADOR[avisoCfg.contador_fuente]})` : ''}. </>
                  : <span className="text-naranja-dark">No hay casilla del contador cargada: se registra como «sin dirección». Se carga en Compras › Configuración. </span>
                : 'Va a la casilla del estudio que está configurada en el servidor. '}
              Recibe el
              <b> comprobante y las facturas</b> que cubre
              {facturasAdj.length > 0 ? ` (${facturasAdj.length} archivo${facturasAdj.length === 1 ? '' : 's'})` : ''}
              : sin el comprobante ve la deuda pero no puede cerrar el asiento.
            </div>
          )}
        </div>

        {/* ── Lo que ya se mandó ── */}
        {(avisos.data?.length ?? 0) > 0 && (
          <div>
            <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Ya se mandó</div>
            <ul className="flex flex-col gap-0.5 text-[11px]">
              {avisos.data!.map(a => {
                const et = ETIQUETA_ESTADO[a.estado] ?? { txt: a.estado, cls: '' }
                return (
                  <li key={a.id} className="flex gap-1.5 flex-wrap">
                    <span className="text-gris-dark">{fmtFecha(a.enviado_at.slice(0, 10))}</span>
                    <span className="capitalize">{a.destinatario}</span>
                    <span className="font-mono">{a.email ?? '—'}</span>
                    <b className={et.cls}>{et.txt}</b>
                    {a.error && <span className="text-gris-dark italic">— {a.error}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="text-[11px] text-gris-dark border-t border-gris pt-2">
          Un mail no se puede desmandar: revisá la dirección antes de apretar. El cuerpo
          <b> no incluye el CBU</b> de nadie.
        </div>

        <div className="flex gap-2 justify-end flex-wrap border-t border-gris pt-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={avisar.isPending}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={mandar} loading={avisar.isPending} disabled={!listo}>
            ✉ Enviar aviso
          </Button>
        </div>
      </div>
    </Modal>
  )
}
