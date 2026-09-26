'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import { useSessionStore } from '@/store/session.store'
import { abrirAdjuntoFirmado, bajarAdjuntoFirmado } from '@/lib/utils/abrir-adjunto'
import {
  useFactura, useAprobarFactura, useObservarFactura, useMarcarCorregida, useAnularFactura,
  useSubirAdjuntoPagos, useBorrarAdjuntoPagos, fetchPagosAdjuntoSignedUrl, useEditarFactura, usePasarADeuda,
} from '../hooks/usePagos'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import {
  ESTADO_FACTURA_META, FORMAS_PREVISTAS, MAX_ADJUNTO_BYTES, MIME_ADJUNTOS, TIPOS_ADJ_FACTURA,
  aplicacionFirme, comprobanteTxt, contraparteAplicacion, esNC, estadoHint, estadoLabel, facturaAnulada, fmtFecha, fmtM, formaPagoLabel, topePagable,
  fmtMesLargo, mesesDesde,
} from '../utils/pagos.utils'
import { mensajeAvisoPagos, mensajeErrorPagos } from '../utils/pagos.errores'
import type { PagosAplicacionNc, PagosControlFactura, PagosFacturaDetalle, PagosTipoAdjFactura } from '@/types/domain.types'
import { ALICUOTAS, NOMBRE_CBTE_ARCA, labelTributo, sinDesglose } from '../utils/desglose'
import { ModalCompletarDesglose } from './ModalCompletarDesglose'
import { ModalAplicarNc } from './ModalAplicarNc'
import { ModalImputarFactura } from './ModalImputarFactura'

/**
 * La ficha de una factura: todo lo que se sabe de ella y lo que se puede
 * hacerle, según quién mira y en qué estado está.
 *
 * Las acciones se DESHABILITAN con el motivo en el tooltip, no se esconden
 * (§6 del CLAUDE.md): quien no puede aprobar tiene que entender por qué, y las
 * tres separaciones de funciones son justamente lo que hay que explicar.
 *
 * Una NOTA DE CRÉDITO (20260925) usa la misma ficha: se aprueba igual (doble
 * firma), no se paga, y muestra a qué facturas acredita y el crédito que le
 * queda, con «Aplicar crédito» para usarlo a mano.
 */

interface Props {
  id:       number
  onClose:  () => void
  onEditar: (id: number) => void
  onPagar:  (id: number) => void
}

export function FichaFactura({ id, onClose, onEditar, onPagar }: Props) {
  const toast = useToast()
  const { puedeEditar, puedeEliminar, registrarPagos, aprobarFacturas, esAdmin, verPii } = usePermisos('pagos')
  const miId = useSessionStore(st => st.profile?.id) ?? null

  const { data: f, isLoading } = useFactura(id)
  const aprobar   = useAprobarFactura()
  const observar  = useObservarFactura()
  const corregida = useMarcarCorregida()
  const anular    = useAnularFactura()
  const subir     = useSubirAdjuntoPagos()
  const borrar    = useBorrarAdjuntoPagos()
  const aDeuda    = usePasarADeuda()

  const [pidiendo, setPidiendo] = useState<null | 'observar' | 'anular'>(null)
  const [motivo, setMotivo] = useState('')
  const [tipoAdj, setTipoAdj] = useState<PagosTipoAdjFactura>('factura')
  const [completando, setCompletando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [imputando, setImputando] = useState(false)
  const [confirmandoDeuda, setConfirmandoDeuda] = useState(false)

  if (isLoading || !f) {
    return (
      <Modal open onClose={onClose} title="Factura" width="max-w-3xl">
        <div className="p-8 text-center text-sm text-gris-dark">Cargando…</div>
      </Modal>
    )
  }

  const meta = ESTADO_FACTURA_META[f.estado]
  const nc = esNC(f)
  const nombre = nc ? 'nota de crédito' : 'factura'
  const esMia = !!miId && f.created_by === miId
  const puedeAprobar = !!(aprobarFacturas || esAdmin)
  const puedePagar   = !!(registrarPagos || esAdmin)

  // Las tres separaciones de funciones, con el bypass de admin. Se calculan acá
  // para poder explicarlas en el tooltip en vez de dejar que el backend
  // devuelva un 403 sin contexto.
  const noApruebaPropia = esMia && !esAdmin
  const noPagaPropia    = esMia && !esAdmin
  const noPagaLoQueAprobo = !!f.aprobada_por && f.aprobada_por === miId && !esAdmin

  const aprobable = f.estado === 'pendiente' && !f.paga_cliente
  const sellable  = f.sin_revisar                       // pagada al cargar, sin revisar
  const pagable   = !nc && ['aprobada', 'pagada_parcial'].includes(f.estado) && !f.paga_cliente && topePagable(f) > 0
  const editable  = !['anulada'].includes(f.estado)
  // Una NC se puede anular en cualquier estado vigente: la deuda vuelve a las
  // facturas que acreditaba (la base lo permite; una factura con NC aplicadas
  // rebota con FACTURA_CON_NC).
  const anulable  = nc ? f.estado !== 'anulada' : (['pendiente', 'observada'].includes(f.estado) || f.sin_revisar)
  // Aplicar el crédito sobrante: aprobar_facturas O registrar_pagos.
  const puedeAplicarNc = !!(aprobarFacturas || registrarPagos || esAdmin)
  const ncDisponible   = Number(f.nc_disponible ?? 0)
  const aplicable      = nc && !!f.aprobada_at && f.estado !== 'anulada' && ncDisponible > 0
  const aplicaciones: PagosAplicacionNc[] = f.aplicaciones ?? []
  // Pasar a deuda (20260929y): sin pagos pasa toda la factura; con pagos o NC
  // ya reconstruidos pasa el SALDO que queda. Sin saldo no hay nada que pasar.
  const sinPagosReconstruir = Number(f.pagado ?? 0) === 0 && Number(f.acreditado ?? 0) === 0 && Number(f.nc_aplicado ?? 0) === 0
  const saldoADeuda = Number(f.saldo ?? 0)

  async function accion(fn: () => Promise<unknown>, ok: string) {
    try {
      const r = await fn() as { avisos?: { code: string }[] } | undefined
      toast(ok, 'ok')
      for (const a of r?.avisos ?? []) toast(mensajeAvisoPagos(a), 'warn')
      setPidiendo(null); setMotivo('')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  // El id se captura acá: adentro de la función anidada TypeScript ya no sabe
  // que `f` pasó el early return de arriba.
  const facturaId = f.id

  async function subirArchivo(file: File) {
    if (file.size > MAX_ADJUNTO_BYTES) { toast('El archivo supera los 10 MB', 'err'); return }
    try {
      await subir.mutateAsync({ entidad: 'facturas', id: facturaId, file, tipo: tipoAdj })
      toast('✓ Adjunto subido', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={`${comprobanteTxt(f.tipo_comprobante, f.numero, f.clase)} · ${f.proveedor_nom}`}
      footer={
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>

          {anulable && (
            <Button variant="danger" size="sm" onClick={() => setPidiendo('anular')}
              disabled={!(puedeEliminar || (puedeEditar && esMia))}
              title={puedeEliminar || (puedeEditar && esMia)
                ? (nc ? 'Anular la nota de crédito: lo que acreditaba vuelve a ser deuda de esas facturas' : 'Anular la factura con un motivo')
                : `Solo podés anular ${nc ? 'notas de crédito' : 'facturas'} que cargaste vos`}>
              Anular
            </Button>
          )}

          {editable && (
            <Button variant="secondary" size="sm" onClick={() => onEditar(f.id)}
              disabled={!puedeEditar}
              title={puedeEditar ? `Editar la ${nombre}` : 'No tenés permiso para editar facturas'}>
              ✏️ Editar
            </Button>
          )}

          {f.estado === 'observada' && (
            <Button variant="secondary" size="sm"
              onClick={() => accion(() => corregida.mutateAsync({ id: f.id }), '✓ Marcada como corregida: vuelve a pendiente')}
              loading={corregida.isPending}
              disabled={!puedeEditar}
              title={puedeEditar ? 'Ya la corregiste: vuelve a pendiente de aprobación' : 'No tenés permiso'}>
              Marcar corregida
            </Button>
          )}

          {(aprobable || sellable) && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setPidiendo('observar')}
                disabled={!puedeAprobar}
                title={puedeAprobar ? 'Rechazar con un motivo: vuelve a compras' : 'No tenés permiso para aprobar ni rechazar'}>
                Rechazar
              </Button>
              <Button size="sm"
                onClick={() => accion(() => aprobar.mutateAsync(f.id), sellable ? '✓ Revisada' : '✓ Aprobada')}
                loading={aprobar.isPending}
                disabled={!puedeAprobar || noApruebaPropia || f.sin_imputar || f.pago_a_reconstruir}
                title={
                  !puedeAprobar ? 'No tenés permiso para aprobar'
                  : f.pago_a_reconstruir ? 'Importada de un mes ya pagado: no se aprueba. El pago se reconstruye con los extractos bancarios'
                  : f.sin_imputar ? 'Falta imputar: primero el concepto y el reparto por obra'
                  : noApruebaPropia ? `No podés aprobar una ${nombre} que cargaste vos: la tiene que aprobar otra persona`
                  : sellable ? 'Revisada: sale de «pagadas sin revisar»'
                  : nc ? 'Aprobar: baja la deuda de las facturas que acredita (o queda como crédito a favor)'
                  : 'Aprobar: queda lista para pagar'
                }>
                ✓ {sellable ? 'Marcar revisada' : 'Aprobar'}
              </Button>
            </>
          )}

          {aplicable && (
            <Button size="sm" onClick={() => setAplicando(true)}
              disabled={!puedeAplicarNc}
              title={puedeAplicarNc
                ? `Acreditar los ${fmtM(ncDisponible)} que le quedan a facturas del proveedor`
                : 'Aplicar crédito lo hace quien aprueba facturas o registra pagos'}>
              Aplicar crédito
            </Button>
          )}

          {pagable && (
            <Button size="sm" onClick={() => onPagar(f.id)}
              disabled={!puedePagar || noPagaPropia || noPagaLoQueAprobo}
              title={
                !puedePagar ? 'No tenés permiso para registrar pagos'
                : noPagaPropia ? 'No podés pagar una factura que cargaste vos'
                : noPagaLoQueAprobo ? 'No podés pagar una factura que aprobaste vos'
                : 'Registrar el pago'
              }>
              💸 Pagar
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">

        {/* Estado y avisos */}
        <div className="flex items-center gap-2 flex-wrap">
          {nc && <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]">Nota de crédito</span>}
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${meta.badge}`}>{estadoLabel(f.estado, f.clase)}</span>
          <span className="text-xs text-gris-dark">{estadoHint(f.estado, f.clase)}</span>
          {f.origen_carga === 'arca_recibidos' && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-azul-light text-azul" title="Importada de «Mis Comprobantes Recibidos» de ARCA">ARCA</span>
          )}
          {f.tributos_a_revisar && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-naranja-light text-naranja-dark"
              title="ARCA informa «otros tributos» sin decir cuáles: hasta clasificarlos, una percepción de IVA no se computa">
              Otros tributos sin clasificar
            </span>
          )}
          {f.periodo_iva_distinto && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-gris text-gris-dark"
              title="Se informa en el Libro IVA de ese mes, no en el de la fecha del comprobante">
              IVA: {fmtMesLargo(f.periodo_iva)}
            </span>
          )}
          {!nc && Number(f.nc_pendiente ?? 0) > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EEE8FF] text-[#5A2D82]"
              title="Una nota de crédito sin aprobar reserva esta parte: no se puede pagar con plata hasta que se apruebe o se anule">
              NC pendiente de aprobar {fmtM(f.nc_pendiente)}
            </span>
          )}
        </div>

        {/* Compra de un mes ya pagado (20260928): no es deuda ni se aprueba. */}
        {/* «Es deuda: no se pagó» (20260929n): el importador marca TODO el archivo
            como pagado; lo que en realidad se debe vuelve al circuito normal. */}
        {f.pago_a_reconstruir && f.estado !== 'anulada' && (
          <div className="flex flex-col gap-2 border rounded p-2 text-xs bg-gris border-gris-mid text-carbon">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex-1 min-w-[200px]">
                <b>Importada de un mes ya pagado:</b> el pago se reconstruye con los extractos bancarios.
                {' '}No cuenta como deuda ni se aprueba; sí va al Libro IVA y a la contabilidad.
              </span>
              {!confirmandoDeuda && (
                <Button variant="secondary" size="sm" onClick={() => setConfirmandoDeuda(true)}
                  disabled={!puedeAprobar || saldoADeuda <= 0}
                  title={
                    !puedeAprobar ? 'Pasar a deuda lo hace quien aprueba facturas'
                    : saldoADeuda <= 0 ? 'No le queda saldo: no hay nada que pasar a deuda'
                    : sinPagosReconstruir ? `No se pagó: la ${nombre} pasa a ser deuda y sigue el circuito normal (aprobar y pagar)`
                    : `Ya tiene pagos reconstruidos: los ${fmtM(saldoADeuda)} que quedan pasan a ser deuda`
                  }>
                  {sinPagosReconstruir ? 'Es deuda: no se pagó' : 'El saldo es deuda'}
                </Button>
              )}
            </div>
            {confirmandoDeuda && (
              <div className="flex items-center gap-2 flex-wrap border-t border-gris-mid pt-2">
                <span className="flex-1 min-w-[200px]">
                  {sinPagosReconstruir
                    ? <>¿Confirmás que esta {nombre} <b>no se pagó</b>? Pasa a contar como deuda{nc ? '' : ', hay que aprobarla y pagarla'}.</>
                    : <>¿Confirmás que los <b>{fmtM(saldoADeuda)}</b> que le quedan <b>no se pagaron</b>? Ese saldo pasa a contar como deuda{nc ? '' : ', hay que aprobarla y pagarlo'}.</>}
                  {' '}No se puede volver atrás.
                </span>
                <Button variant="secondary" size="sm" onClick={() => setConfirmandoDeuda(false)}>Cancelar</Button>
                <Button size="sm" loading={aDeuda.isPending}
                  onClick={() => accion(() => aDeuda.mutateAsync(f.id), '✓ Pasó a deuda').then(() => setConfirmandoDeuda(false))}>
                  Sí, es deuda
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Importada de ARCA sin imputar (20260927b): primero los tributos, después el reparto. */}
        {f.sin_imputar && f.estado !== 'anulada' && (
          f.tributos_a_revisar ? (
            <div className="flex items-center gap-2 flex-wrap border rounded p-2 text-xs bg-naranja-light border-naranja/30 text-naranja-dark">
              <span className="flex-1 min-w-[200px]">
                <b>Importada de ARCA.</b> Primero clasificá los otros tributos (si alguno es percepción, no se reparte a las obras); después se imputa.
              </span>
              <Button variant="secondary" size="sm" onClick={() => setCompletando(true)} disabled={!puedeEditar}
                title={puedeEditar ? 'Clasificar los otros tributos de ARCA' : 'No tenés permiso para editar facturas'}>
                Completar desglose
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap border rounded p-2 text-xs bg-amarillo-light border-amarillo/40 text-[#7A5000]">
              <span className="flex-1 min-w-[200px]">
                <b>Importada de ARCA: falta concepto y reparto por obra.</b> Hasta imputarla no se aprueba ni se paga.
              </span>
              <Button size="sm" onClick={() => setImputando(true)} disabled={!puedeEditar}
                title={puedeEditar ? 'Elegir el concepto y repartirla por obra' : 'No tenés permiso para editar facturas'}>
                Imputar
              </Button>
            </div>
          )
        )}
        {f.cuenta_cambio_tras_aprobar && (
          <Aviso tono="rojo">
            ⚠ El CBU o alias del proveedor cambió <b>después</b> de que se aprobó esta factura
            {f.datos_pago_actualizados_at && <> (el {fmtFecha(f.datos_pago_actualizados_at)})</>}.
            Verificá la cuenta antes de pagar.
          </Aviso>
        )}
        {f.sin_revisar && (
          <Aviso tono="amarillo">
            Se cargó ya pagada y todavía no la revisó ningún aprobador.
          </Aviso>
        )}
        {f.estado === 'observada' && f.motivo_observacion && (
          <Aviso tono="naranja">
            <b>Rechazada:</b> {f.motivo_observacion}
            {f.observada_por_nombre && <span className="text-xs"> — {f.observada_por_nombre}, {fmtFecha(f.observada_at)}</span>}
          </Aviso>
        )}
        {f.estado === 'anulada' && f.motivo_anulacion && (
          <Aviso tono="gris">
            <b>Anulada:</b> {f.motivo_anulacion}
            {f.anulado_por_nombre && <span className="text-xs"> — {f.anulado_por_nombre}, {fmtFecha(f.anulado_at)}</span>}
          </Aviso>
        )}
        {f.paga_cliente && (
          <Aviso tono="gris">La paga el cliente directo al proveedor: no es deuda de CADINC y no entra en la bandeja.</Aviso>
        )}

        {/* Importes */}
        {nc ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Dato label="Total de la NC" valor={`−${fmtM(f.total)}`} fuerte />
            <Dato label={f.aprobada_at ? 'Aplicado' : 'Declara acreditar'} valor={Number(f.nc_aplicado ?? 0) > 0 ? fmtM(f.nc_aplicado) : '—'} />
            <Dato label="Crédito disponible" valor={f.aprobada_at ? (ncDisponible > 0 ? fmtM(ncDisponible) : '—') : 'al aprobarla'} fuerte />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Dato label="Total" valor={fmtM(f.total)} fuerte />
            <Dato label="Pagado" valor={f.pagado > 0 ? fmtM(f.pagado) : '—'} />
            <Dato label="Notas de crédito" valor={f.acreditado > 0 ? fmtM(f.acreditado) : '—'} />
            <Dato label="Saldo" valor={f.saldo > 0 ? fmtM(f.saldo) : '—'} fuerte />
          </div>
        )}
        <DesgloseFicha f={f} />
        {/* Completar el desglose (20260924v): también en una PAGADA, porque no
            cambia la plata (total y percepciones quedan iguales; lo valida la base). */}
        {sinDesglose(f) && !(f.sin_imputar && f.tributos_a_revisar) && (
          <div className="flex items-center gap-2 flex-wrap border rounded p-2 text-xs bg-naranja-light border-naranja/30 text-naranja-dark">
            <span className="flex-1 min-w-[200px]">
              {f.desglose_a_revisar ? 'El desglose de impuestos está marcado a revisar.' : 'Falta el IVA discriminado: lo necesita el Libro IVA de compras.'}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setCompletando(true)}
              disabled={!puedeEditar}
              title={puedeEditar
                ? 'Cargar IVA por alícuota, percepciones y CAE sin cambiar el total ni lo pagado'
                : 'No tenés permiso para editar facturas'}>
              Completar desglose
            </Button>
          </div>
        )}

        {/* Datos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Dato label="Emitida" valor={fmtFecha(f.fecha)} />
          {!nc && <Dato label="Vence" valor={f.vence_el ? fmtFecha(f.vence_el) : 'sin vencimiento'} alerta={f.vencida} />}
          {!nc && <Dato label="Forma prevista" valor={FORMAS_PREVISTAS.find(x => x.key === f.forma_pago_prevista)?.label ?? f.forma_pago_prevista} />}
          <Dato label="Proveedor" valor={f.proveedor_codigo ? `${f.proveedor_codigo} · ${f.proveedor_nom}` : f.proveedor_nom} />
          <Dato label="CUIT" valor={f.proveedor_cuit ?? '—'} />
          <Dato label="Cuenta del proveedor" valor={verPii ? (f.proveedor_cbu ?? f.proveedor_alias ?? '—') : (f.proveedor_cbu_ultimos4 ? `***${f.proveedor_cbu_ultimos4}` : '—')} />
          <Dato label="Cargó" valor={`${f.created_by_nombre ?? '—'}, ${fmtFecha(f.created_at)}`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ConceptoFicha f={f} puedeEditar={puedeEditar} />
          <PeriodoIvaEnLugar f={f} puedeEditar={puedeEditar} />
        </div>
        {f.descripcion && <div><span className="text-[11px] font-bold text-gris-dark uppercase">Descripción</span><div>{f.descripcion}</div></div>}
        {f.obs && <div><span className="text-[11px] font-bold text-gris-dark uppercase">Observaciones</span><div className="text-gris-dark">{f.obs}</div></div>}

        {/* Aprobación */}
        {f.aprobada_at && (
          <div className="bg-verde-light/50 border border-verde/30 rounded p-2 text-xs">
            Aprobada por <b>{f.aprobada_por_nombre ?? '—'}</b> el {fmtFecha(f.aprobada_at)}.
          </div>
        )}

        {/* Reparto por obra */}
        <Bloque titulo={`Centro de costo${f.imputaciones.length > 1 ? ` · ${f.imputaciones.length} obras` : ''}`}>
          {f.imputaciones.length === 0
            ? <div className="text-xs text-gris-dark italic">Sin imputar.</div>
            : (
              <table className="w-full text-xs">
                <tbody>
                  {f.imputaciones.map(im => (
                    <tr key={im.id} className="border-b border-gris last:border-0">
                      <td className="py-1">
                        {im.obra?.nom ?? im.obra_cod}
                        {(im.obra?.es_interna || im.obra?.es_deposito) && <span className="ml-1 text-[10px] text-gris-dark uppercase">interna</span>}
                        {im.obra?.archivada && <span className="ml-1 text-[10px] text-gris-dark uppercase">archivada</span>}
                        {im.obs && <span className="block text-[10px] text-gris-dark">{im.obs}</span>}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">{fmtM(im.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Bloque>

        {/* NC ↔ facturas (20260925). En la NC: a qué facturas acredita; en la
            factura: qué NC la acreditan. La forma de `aplicaciones` la confirma
            el backend: se muestra lo que venga, tolerando faltantes. */}
        {(nc || aplicaciones.length > 0) && (
          <Bloque titulo={nc ? 'Acredita a' : 'Notas de crédito aplicadas'}>
            {aplicaciones.length === 0 ? (
              <div className="text-xs text-gris-dark italic">
                {nc
                  ? (f.nc_txt ? f.nc_txt : 'No acredita ninguna factura: queda como crédito a favor del proveedor.')
                  : '—'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {aplicaciones.map((a, i) => {
                    const c = contraparteAplicacion(a, nc ? 'nc' : 'factura')
                    const anulada = a.vigente === false || (!nc && c.estado === 'anulada')
                    // En la factura: la NC que la acredita todavía no está aprobada (es reserva).
                    const sinAprobar = !nc && !anulada && !aplicacionFirme(a)
                    return (
                      <tr key={a.id ?? `${a.nc_id}-${a.factura_id}-${i}`}
                        className={`border-b border-gris last:border-0 ${anulada ? 'opacity-50 line-through' : ''}`}>
                        <td className="py-1">
                          <span className="font-mono">
                            {nc ? '' : 'NC '}
                            {c.tipo_comprobante ? comprobanteTxt(c.tipo_comprobante, c.numero) : `#${c.id}`}
                          </span>
                          {sinAprobar && <span className="ml-1 text-[10px] px-1 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold">sin aprobar</span>}
                          <span className="block text-[10px] text-gris-dark">
                            {c.fecha ? fmtFecha(c.fecha) : ''}
                            {c.estado ? `${c.fecha ? ' · ' : ''}${estadoLabel(c.estado, nc ? 'factura' : 'nota_credito')}` : ''}
                          </span>
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-[#5A2D82]">{fmtM(a.monto)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {nc && !f.aprobada_at && aplicaciones.length > 0 && (
              <div className="text-[11px] text-gris-dark mt-1">
                Mientras no se apruebe, esa parte queda <b>reservada</b>: no se puede pagar con plata. Baja la deuda recién al aprobarla.
              </div>
            )}
          </Bloque>
        )}

        {/* Pagos aplicados */}
        {f.pagos.length > 0 && (
          <Bloque titulo="Pagos y notas de crédito">
            <table className="w-full text-xs">
              <tbody>
                {f.pagos.map(p => (
                  <tr key={p.id} className={`border-b border-gris last:border-0 ${p.orden.anulada ? 'opacity-50 line-through' : ''}`}>
                    <td className="py-1">
                      <span className="font-mono">{p.orden.numero_fmt ?? `OP-${p.orden.numero}`}</span>
                      {p.tipo === 'nota_credito' && <span className="ml-1 text-[10px] px-1 rounded bg-[#EEE8FF] text-[#5A2D82] font-bold">NC {p.nc_numero}</span>}
                      <span className="block text-[10px] text-gris-dark">
                        {fmtFecha(p.orden.fecha)} · {formaPagoLabel(p.orden.forma_pago)}
                        {p.orden.anulada && ' · ANULADA'}
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmtM(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloque>
        )}

        {/* Control automático del comprobante (20260921j). Va ANTES de los
            adjuntos y con color fuerte cuando difiere: quien aprueba tiene que
            tropezarse con esto, no encontrarlo si lo busca. */}
        {f.control && <ControlComprobante c={f.control} />}

        {/* Adjuntos */}
        <Bloque titulo="Adjuntos">
          {f.adjuntos.length === 0 && <div className="text-xs text-gris-dark italic mb-2">Todavía no hay archivos.</div>}
          <ul className="flex flex-col gap-1 mb-2">
            {f.adjuntos.map(a => (
              <li key={a.id} className={`flex items-center gap-2 text-xs ${a.borrado ? 'opacity-50 line-through' : ''}`}>
                <button type="button"
                  className="text-azul hover:underline truncate flex-1 text-left"
                  onClick={() => abrirAdjuntoFirmado(
                    () => fetchPagosAdjuntoSignedUrl('facturas', f.id, a.id),
                    () => toast('No se pudo abrir el archivo', 'err'),
                  )}>
                  📎 {a.nombre_archivo}
                </button>
                <button type="button" className="text-gris-dark hover:text-azul px-1 rounded" title="Descargar"
                  onClick={() => bajarAdjuntoFirmado(
                    () => fetchPagosAdjuntoSignedUrl('facturas', f.id, a.id, true),
                    () => toast('No se pudo bajar el archivo', 'err'),
                  )}>⬇</button>
                <span className="text-gris-dark">{TIPOS_ADJ_FACTURA.find(t => t.key === a.tipo)?.label ?? a.tipo}</span>
                {!a.borrado && puedeEditar && (
                  <button type="button" className="text-rojo hover:bg-rojo-light px-1.5 rounded"
                    onClick={async () => {
                      try { await borrar.mutateAsync({ entidad: 'facturas', id: f.id, adjId: a.id }); toast('Adjunto borrado', 'ok') }
                      catch (e) { toast(mensajeErrorPagos(e), 'err') }
                    }}>✕</button>
                )}
              </li>
            ))}
          </ul>
          {puedeEditar && (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={tipoAdj} onChange={e => setTipoAdj(e.target.value as PagosTipoAdjFactura)}
                className="px-2 py-1 border-[1.5px] border-gris-mid rounded text-xs bg-white outline-none focus:border-naranja">
                {TIPOS_ADJ_FACTURA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <label className="text-xs px-3 py-1.5 rounded border border-gris-mid bg-white hover:bg-gris cursor-pointer font-semibold">
                {subir.isPending ? 'Subiendo…' : '📎 Adjuntar archivo'}
                <input type="file" className="hidden" accept={MIME_ADJUNTOS} disabled={subir.isPending}
                  onChange={e => { const file = e.target.files?.[0]; if (file) subirArchivo(file); e.target.value = '' }} />
              </label>
            </div>
          )}
        </Bloque>

        {completando && <ModalCompletarDesglose factura={f} onClose={() => setCompletando(false)} />}
        {aplicando && <ModalAplicarNc nc={f} onClose={() => setAplicando(false)} />}
        {imputando && <ModalImputarFactura factura={f} onClose={() => setImputando(false)} />}

        {/* Pedir motivo */}
        {pidiendo && (
          <div className="border-t border-gris pt-3">
            <label className="block text-xs font-semibold text-gris-dark mb-1">
              {pidiendo === 'observar' ? 'Motivo del rechazo (lo ve quien la cargó)' : 'Motivo de la anulación'}
            </label>
            <textarea
              value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
              placeholder={pidiendo === 'observar' ? 'Ej.: el total no coincide con el PDF' : 'Ej.: se cargó duplicada'}
              className="w-full px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm outline-none focus:border-naranja"
            />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setPidiendo(null); setMotivo('') }}>Cancelar</Button>
              <Button
                variant={pidiendo === 'anular' ? 'danger' : 'primary'} size="sm"
                disabled={motivo.trim().length < 3}
                loading={observar.isPending || anular.isPending}
                title={motivo.trim().length < 3 ? 'Escribí el motivo' : undefined}
                onClick={() => {
                  if (pidiendo === 'observar') {
                    accion(() => observar.mutateAsync({ id: f.id, motivo: motivo.trim() }), '✓ Rechazada: vuelve a compras')
                  } else {
                    accion(async () => {
                      const r = await anular.mutateAsync({ id: f.id, motivo: motivo.trim() })
                      return facturaAnulada(r)
                    }, nc ? '✓ Nota de crédito anulada' : '✓ Factura anulada')
                    onClose()
                  }
                }}>
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * El concepto de compra (20260925), editable en el lugar. Es clasificación, no
 * plata: se cambia aunque la factura esté aprobada o pagada y no le saca la
 * aprobación. Una anulada no se edita (FACTURA_CERRADA). No se puede vaciar.
 */
function ConceptoFicha({ f, puedeEditar }: { f: PagosFacturaDetalle; puedeEditar: boolean }) {
  const toast = useToast()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const conceptos = useConceptosPagos(false, editando)
  const editar = useEditarFactura()
  const anulada = f.estado === 'anulada'

  function empezar() {
    setValor(f.concepto_id ? String(f.concepto_id) : '')
    setEditando(true)
  }

  async function guardar() {
    if (!valor) return
    if (Number(valor) === f.concepto_id) { setEditando(false); return }
    try {
      await editar.mutateAsync({ id: f.id, concepto_id: Number(valor) })
      toast('✓ Concepto actualizado', 'ok')
      setEditando(false)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  const activos = (conceptos.data ?? []).filter(c => c.activo)

  return (
    <div>
      <span className="text-[11px] font-bold text-gris-dark uppercase">Concepto</span>
      {!editando ? (
        <div className="flex items-center gap-2 flex-wrap">
          {f.concepto
            ? <span className="text-xs font-semibold px-2 py-0.5 rounded bg-azul/10 text-azul">{f.concepto}</span>
            : <span className="text-xs text-naranja-dark">Sin concepto</span>}
          {!anulada && (
            <button type="button" onClick={empezar} disabled={!puedeEditar}
              title={puedeEditar ? 'Cambiar el concepto: no le saca la aprobación' : 'No tenés permiso para editar facturas'}
              className="text-[11px] text-azul hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline">
              {f.concepto ? 'Cambiar' : 'Elegir'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <select value={valor} onChange={e => setValor(e.target.value)} disabled={conceptos.isLoading}
            aria-label="Concepto de compra"
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja">
            <option value="">{conceptos.isLoading ? 'Cargando…' : 'Elegí el concepto…'}</option>
            {activos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Button size="sm" onClick={guardar} loading={editar.isPending} disabled={!valor}
            title={!valor ? 'Elegí un concepto: no se puede dejar vacío' : undefined}>
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
          {conceptos.isError && <span className="text-[11px] text-rojo">No se pudo traer la lista.</span>}
        </div>
      )}
    </div>
  )
}

/**
 * El período IVA (20260927a), editable en el lugar como el concepto: es
 * clasificación fiscal, se cambia aunque esté aprobada o pagada y NO le saca
 * la aprobación. Del mes de la fecha a 12 meses después (nunca antes). Si el
 * mes de origen o el de destino están cerrados en Contabilidad, la base
 * rebota con PERIODO_IVA_CERRADO.
 */
function PeriodoIvaEnLugar({ f, puedeEditar }: { f: PagosFacturaDetalle; puedeEditar: boolean }) {
  const toast = useToast()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const editar = useEditarFactura()
  const anulada = f.estado === 'anulada'
  const actual = (f.periodo_iva ?? f.fecha).slice(0, 7)
  const meses = mesesDesde(f.fecha.slice(0, 7), 13)

  async function guardar() {
    if (!valor || valor === actual) { setEditando(false); return }
    try {
      await editar.mutateAsync({ id: f.id, periodo_iva: `${valor}-01` })
      toast(`✓ Se informa en el IVA de ${fmtMesLargo(valor)}`, 'ok')
      setEditando(false)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  return (
    <div>
      <span className="text-[11px] font-bold text-gris-dark uppercase">Período IVA / contabilización</span>
      {!editando ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${f.periodo_iva_distinto ? 'bg-amarillo-light text-[#7A5000]' : 'bg-gris text-gris-dark'}`}>
            {fmtMesLargo(actual)}
          </span>
          {f.periodo_iva_distinto && <span className="text-[11px] text-gris-dark">(la fecha es de {fmtMesLargo(f.fecha)})</span>}
          {!anulada && (
            <button type="button" onClick={() => { setValor(actual); setEditando(true) }} disabled={!puedeEditar}
              title={puedeEditar ? 'Cambiar el mes del Libro IVA. Cambiarlo no le saca la aprobación' : 'No tenés permiso para editar facturas'}
              className="text-[11px] text-azul hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline">
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <select value={valor} onChange={e => setValor(e.target.value)} aria-label="Período IVA / contabilización"
            className="px-2 py-1.5 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja">
            {!meses.includes(actual) && <option value={actual}>{fmtMesLargo(actual)}</option>}
            {meses.map(m => <option key={m} value={m}>{fmtMesLargo(m)}</option>)}
          </select>
          <Button size="sm" onClick={guardar} loading={editar.isPending} title="Cambiarlo no le saca la aprobación">Guardar</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  )
}

function Dato({ label, valor, fuerte, alerta }: { label: string; valor: string; fuerte?: boolean; alerta?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`${fuerte ? 'font-mono font-bold tabular-nums' : ''} ${alerta ? 'text-rojo' : ''}`}>{valor}</div>
    </div>
  )
}

/**
 * El resultado de leer el comprobante y compararlo con lo tipeado.
 *
 * Los cuatro estados se muestran distinto A PROPÓSITO. «Ilegible» y «error»
 * NO son un visto bueno: si se pintaran como «coincide» el control sería peor
 * que no tenerlo, porque daría tranquilidad sin haber mirado nada.
 */
function ControlComprobante({ c }: { c: PagosControlFactura }) {
  const meta = {
    coincide: { icono: '✓', titulo: 'El comprobante coincide con lo cargado', clase: 'bg-verde-light border-verde/40 text-verde' },
    difiere:  { icono: '⚠', titulo: 'El comprobante NO coincide con lo cargado', clase: 'bg-rojo-light border-rojo/40 text-rojo' },
    ilegible: { icono: '?', titulo: 'No se pudo leer el comprobante', clase: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]' },
    error:    { icono: '?', titulo: 'No se pudo controlar el comprobante', clase: 'bg-gris border-gris-mid text-gris-dark' },
  }[c.estado]
  return (
    <div className={`border rounded p-2.5 mb-3 text-xs ${meta.clase}`}>
      <div className="font-bold">{meta.icono} {meta.titulo}</div>
      {c.nota && <div className="mt-0.5">{c.nota}</div>}
      {(c.numero_leido || c.total_leido != null || c.fecha_leida) && (
        <div className="mt-1 text-[11px] opacity-90">
          Leído del papel:{' '}
          {[
            c.numero_leido && <span key="n">N° <b className="font-mono">{c.numero_leido}</b></span>,
            c.total_leido != null && <span key="t">total <b className="font-mono tabular-nums">{fmtM(c.total_leido)}</b></span>,
            c.fecha_leida && <span key="f">emitida el <b className="font-mono">{fmtFecha(c.fecha_leida)}</b></span>,
          ].filter(Boolean).flatMap((el, i) => (i === 0 ? [el] : [' · ', el]))}
        </div>
      )}
      <div className="mt-1 text-[10px] opacity-70">Control automático · {fmtFecha(c.created_at.slice(0, 10))}</div>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gris pt-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide mb-1">{titulo}</div>
      {children}
    </div>
  )
}

function Aviso({ tono, children }: { tono: 'rojo' | 'naranja' | 'amarillo' | 'gris'; children: React.ReactNode }) {
  const clases = {
    rojo:     'bg-rojo-light border-rojo/30 text-rojo',
    naranja:  'bg-naranja-light border-naranja/30 text-naranja-dark',
    amarillo: 'bg-amarillo-light border-amarillo/40 text-[#7A5000]',
    gris:     'bg-gris border-gris-mid text-gris-dark',
  }[tono]
  return <div className={`border rounded p-2 text-xs ${clases}`}>{children}</div>
}

/**
 * El desglose como lo pide ARCA (20260924u): IVA por alícuota, no gravado,
 * exento y cada percepción con su jurisdicción, más CAE y de dónde salieron
 * los datos. Sin detalle, los números sueltos de siempre.
 */
function DesgloseFicha({ f }: { f: PagosFacturaDetalle }) {
  const iva = f.iva_detalle ?? []
  const trib = f.tributos ?? []
  const hayNumeros = [f.neto, f.iva, f.percepciones, f.otros, f.no_gravado, f.exento].some(v => v != null)
  const origen = { qr: 'QR de ARCA', 'qr+ia': 'QR de ARCA + lectura', ia: 'lectura del comprobante', manual: '' }[f.lectura_estado ?? 'manual']
  if (!hayNumeros && !iva.length && !trib.length && !f.cae) return null
  return (
    <div className="rounded border border-gris px-2.5 py-2 text-[11px] text-gris-dark flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {f.cbte_tipo_arca != null && <span>{NOMBRE_CBTE_ARCA[f.cbte_tipo_arca] ?? `Cód. ARCA ${f.cbte_tipo_arca}`}</span>}
        {f.cae && <span>CAE <span className="font-mono">{f.cae}</span>{f.cae_vto && <> (vence {fmtFecha(f.cae_vto)})</>}</span>}
        {origen && <span>Cargada desde {origen}</span>}
        {f.desglose_a_revisar && <span className="text-naranja-dark font-semibold">Desglose a revisar</span>}
      </div>
      {iva.length > 0 ? (
        <table className="w-full max-w-md">
          <tbody>
            {iva.map(x => (
              <tr key={x.alicuota_id}>
                <td>IVA {ALICUOTAS.find(a => a.id === x.alicuota_id)?.label ?? x.alicuota_id}</td>
                <td className="text-right font-mono tabular-nums">neto {fmtM(x.base_imp)}</td>
                <td className="text-right font-mono tabular-nums">IVA {fmtM(x.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (f.neto != null || f.iva != null) && (
        <div>{f.neto != null && <>Neto {fmtM(f.neto)} · </>}{f.iva != null && <>IVA {fmtM(f.iva)}</>}</div>
      )}
      {(f.no_gravado != null || f.exento != null) && (
        <div>{f.no_gravado != null && <>No gravado {fmtM(f.no_gravado)} · </>}{f.exento != null && <>Exento {fmtM(f.exento)}</>}</div>
      )}
      {trib.length > 0 ? trib.map((t, i) => (
        <div key={t.id ?? i}>
          {labelTributo(t.tipo)}{t.jurisdiccion && <> — {t.jurisdiccion}</>}{t.descripcion && <span className="italic"> ({t.descripcion})</span>}: <b className="font-mono tabular-nums">{fmtM(t.importe)}</b>
        </div>
      )) : (f.percepciones != null || f.otros != null) && (
        <div>{f.percepciones != null && <>Percepciones (sin discriminar) {fmtM(f.percepciones)} · </>}{f.otros != null && <>Otros {fmtM(f.otros)}</>}</div>
      )}
      <div>
        <span title="Total menos percepciones: es lo que se reparte entre las obras">Imputable a obras <b>{fmtM(f.imputable)}</b></span>
      </div>
    </div>
  )
}
