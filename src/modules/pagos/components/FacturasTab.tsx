'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useFacturasResumen, useAprobarFacturas, fetchFacturasExport, useContarFacturas,
  type PagosFacturasFiltro,
} from '../hooks/usePagos'
import { useSaldosProveedores } from '../hooks/useProveedoresPagos'
import { useConceptosPagos } from '../hooks/useConceptosPagos'
import { fmtM, describirFiltroFacturas, esNC, topePagable } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { exportarFacturasPagos } from '../utils/pagosExport'
import { exportarResumenPagosPdf } from '../utils/pagosResumenPdf'
import { FiltrosFacturas } from './FiltrosFacturas'
import { FacturasTabla } from './FacturasTabla'
import { FichaFactura } from './FichaFactura'
import { ModalCargarFactura } from './ModalCargarFactura'
import { ModalRegistrarPago } from './ModalRegistrarPago'
import { ModalExcelGalicia } from './ModalExcelGalicia'
import { PreguntarAvisoPago } from './PreguntarAvisoPago'
import { DeudaPorProveedor } from './DeudaPorProveedor'
import { ModalConceptosCompra } from './ModalConceptosCompra'
import { ModalImportarRecibidos } from './ModalImportarRecibidos'
import { ModalImputarLote } from './ModalImputarLote'
import { ModalMarcarPagadas, marcablesComoPagadas } from './ModalMarcarPagadas'

const PAGE_SIZE = 50

/**
 * Los filtros con los que entra la bandeja cuando se llega desde la campana.
 * Cada uno replica EXACTAMENTE la query de su aviso en `useNotificaciones`:
 * si no coincidieran, el aviso diría "3" y la pantalla mostraría otra cosa.
 */
export const FILTRO_POR_AVISO: Record<string, PagosFacturasFiltro> = {
  // Sin las importadas sin imputar (20260927b): no se pueden aprobar hasta
  // imputarlas, y con mil importadas el aviso diría «1000 para aprobar».
  aprobar:      { estados: ['pendiente'], paga_cliente: false, sin_imputar: false, orden: 'vencimiento' },
  vencidas:     { vencimiento: 'vencidas', paga_cliente: false, orden: 'vencimiento' },
  'sin-revisar':{ sin_revisar: true,  orden: 'vencimiento' },
  observadas:   { estados: ['observada'], orden: 'vencimiento' },
  // Importadas de ARCA que faltan imputar (20260927b). Lo usan el chip
  // «Sin imputar (N)» y el link del importador: el mismo filtro para los dos.
  'sin-imputar':{ sin_imputar: true, estados: ['pendiente', 'observada'], orden: 'fecha' },
}

/**
 * «Abiertas, por vencimiento», SIN las importadas sin imputar: la bandeja «a
 * pagar» no se llena con mil comprobantes de ARCA. Esas se ven con el chip
 * «Sin imputar» o con el filtro.
 */
const FILTRO_INICIAL: PagosFacturasFiltro = {
  estados: ['pendiente', 'observada', 'aprobada', 'pagada_parcial'],
  sin_imputar: false,
  orden:   'vencimiento',
}

function filtroDeUrl(aviso: string | null | undefined, importacion: number | null | undefined): PagosFacturasFiltro {
  const base = (aviso ? FILTRO_POR_AVISO[aviso] : undefined) ?? FILTRO_INICIAL
  return aviso === 'sin-imputar' && importacion ? { ...base, importacion_id: importacion } : base
}

/**
 * La bandeja del módulo: qué se debe, a quién y para cuándo.
 *
 * Todo el filtrado y la suma pasan por el server. Los KPI NO se calculan sobre
 * la página visible — con el cap de 1000 filas de PostgREST un total sumado
 * acá sería mentira en cuanto haya volumen; salen de `pagos_resumen`, que
 * agrupa sobre el filtro completo.
 *
 * El filtro arranca en «abiertas, por vencimiento»: lo primero que alguien
 * quiere ver al entrar es qué hay que pagar, no el historial.
 */
export function FacturasTab({ aviso, importacion, ficha }: {
  aviso?:       string | null
  /** `&importacion=<id>` junto con `aviso=sin-imputar`: las de una importación. */
  importacion?: number | null
  /** `&ficha=<id>`: abre la ficha de esa factura (lo usa Contabilidad › Automáticos). */
  ficha?:       number | null
}) {
  const toast = useToast()
  const { puedeVer, puedeCrear, puedeEditar, registrarPagos, aprobarFacturas, esAdmin, verPii, importarComprobantes } = usePermisos('pagos')
  const puedeAprobar = !!(aprobarFacturas || esAdmin)
  const puedePagar   = !!(registrarPagos || esAdmin)
  const puedeImportar = !!(esAdmin || (puedeCrear && importarComprobantes))
  const puedeMarcarPagadas = !!(puedeCrear || esAdmin)

  // `aviso` sólo decide el estado INICIAL: una vez adentro el usuario manda,
  // y no se reescribe la URL para no pelearse con el historial del navegador.
  const [filtro, setFiltro] = useState<PagosFacturasFiltro>(() => filtroDeUrl(aviso, importacion))
  const [page, setPage] = useState(1)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [fichaId, setFichaId] = useState<number | null>(ficha ?? null)
  const [modalImportar, setModalImportar] = useState(false)
  const [modalImputarLote, setModalImputarLote] = useState(false)
  const [modalMarcarPagadas, setModalMarcarPagadas] = useState(false)
  const [modalCargar, setModalCargar] = useState<{ open: boolean; editarId?: number }>({ open: false })
  const [modalPago, setModalPago] = useState<{ open: boolean; facturaIds: number[] }>({ open: false, facturaIds: [] })
  const [modalGalicia, setModalGalicia] = useState(false)
  // Después de pagar con comprobante: «¿le avisás al proveedor ahora?»
  const [avisoOrdenId, setAvisoOrdenId] = useState<number | null>(null)
  const [exportando, setExportando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [modalConceptos, setModalConceptos] = useState(false)
  const conceptos = useConceptosPagos(true, puedeVer)

  const lista   = useFacturas(filtro, page, PAGE_SIZE, puedeVer)
  // El resumen por estado alimenta los chips: se pide SIN `estados` (lo hace el
  // hook) para que cada chip muestre cuánto hay con el RESTO de los filtros.
  const resumen = useFacturasResumen(filtro, 'estado', puedeVer)
  const saldos  = useSaldosProveedores(puedeVer)
  const aprobarLote = useAprobarFacturas()
  // Chip «Sin imputar (N)»: el MISMO filtro que el deep-link (§5.9).
  const sinImputar = useContarFacturas(FILTRO_POR_AVISO['sin-imputar']!, puedeVer)
  const verSinImputar = filtro.sin_imputar === true

  const items = useMemo(() => lista.data?.items ?? [], [lista.data])
  const total = lista.data?.total ?? 0

  function patch(p: Partial<PagosFacturasFiltro>) {
    setFiltro(f => ({ ...f, ...p }))
    setPage(1)
    setSeleccion(new Set())
  }

  // ── Selección ──
  // Se guardan los IDS y se resuelven contra la página visible. Es seguro
  // porque las dos acciones en lote (aprobar y pagar) mandan ids al backend,
  // no montos calculados acá.
  const seleccionadas = useMemo(() => items.filter(f => seleccion.has(f.id)), [items, seleccion])
  function toggle(id: number) {
    setSeleccion(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function toggleTodas() {
    setSeleccion(s => (s.size === items.length ? new Set() : new Set(items.map(f => f.id))))
  }

  // Aprobar en lote NO es todo o nada: el backend aplica lo que puede y
  // devuelve `omitidas` con el motivo (típicamente, las que cargó el propio
  // aprobador). Hay que mostrarlas o la persona cree que aprobó todo.
  const aprobables = useMemo(
    () => seleccionadas.filter(f => f.estado === 'pendiente' && !f.paga_cliente),
    [seleccionadas],
  )
  async function handleAprobarLote() {
    if (aprobables.length === 0) return
    try {
      const r = await aprobarLote.mutateAsync(aprobables.map(f => f.id))
      setSeleccion(new Set())
      if (r.omitidas.length === 0) {
        toast(`✓ ${r.aprobadas.length} factura${r.aprobadas.length === 1 ? '' : 's'} aprobada${r.aprobadas.length === 1 ? '' : 's'}`, 'ok')
      } else {
        const propias = r.omitidas.filter(o => o.code === 'NO_PUEDE_APROBAR_PROPIA').length
        toast(
          `Aprobadas ${r.aprobadas.length}. Quedaron ${r.omitidas.length} sin aprobar` +
          (propias > 0 ? `: ${propias} las cargaste vos, las tiene que aprobar otra persona.` : '.'),
          'warn',
        )
      }
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    }
  }

  // Pagar: todas del mismo proveedor y aprobadas (o con saldo). El modal
  // vuelve a validar; acá solo se evita ofrecer el botón cuando no tiene
  // sentido. Una NC NUNCA se paga (se aprueba, sí), y el tope es
  // `saldo_pagable`: lo reservado por una NC sin aprobar no se paga con plata.
  const pagables = useMemo(
    () => seleccionadas.filter(f => !esNC(f) && ['aprobada', 'pagada_parcial'].includes(f.estado) && !f.paga_cliente && topePagable(f) > 0),
    [seleccionadas],
  )
  const unSoloProveedor = pagables.length > 0 && new Set(pagables.map(f => f.proveedor_id)).size === 1

  // Imputar en lote: importadas sin imputar. Marcar pagadas: cualquier
  // proveedor, sin aprobar (hecho consumado con tarjeta o billetera).
  const imputables = useMemo(() => seleccionadas.filter(f => f.sin_imputar && f.estado !== 'anulada'), [seleccionadas])
  const marcables  = useMemo(() => marcablesComoPagadas(seleccionadas), [seleccionadas])

  async function exportar() {
    if (total === 0) { toast('No hay facturas para exportar con estos filtros', 'err'); return }
    setExportando(true)
    try {
      const filas = await fetchFacturasExport(filtro)
      await exportarFacturasPagos(filas)
      toast('✓ Excel generado', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setExportando(false)
    }
  }

  /** Lo que se imprime arriba del PDF y adentro del CONTENIDO.txt del ZIP. */
  const descFiltro = describirFiltroFacturas(
    filtro, id => saldos.data?.find(p => p.proveedor_id === id)?.razon_social,
    id => conceptos.data?.find(c => c.id === id)?.nombre,
  )

  async function exportarPdf() {
    if (total === 0) { toast('No hay facturas para el resumen con estos filtros', 'err'); return }
    setGenerandoPdf(true)
    try {
      await exportarResumenPagosPdf(await fetchFacturasExport(filtro), { descripcionFiltro: descFiltro })
      toast('✓ Resumen generado', 'ok')
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setGenerandoPdf(false)
    }
  }



  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
      No tenés permiso para ver las facturas.
    </div>
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Acciones */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm" onClick={() => setModalCargar({ open: true })}
            disabled={!puedeCrear}
            title={puedeCrear ? 'Cargar una factura o una nota de crédito de proveedor' : 'No tenés permiso para cargar facturas'}
          >
            + Cargar factura / NC
          </Button>
          <Button
            variant="secondary" size="sm" onClick={() => setModalImportar(true)}
            disabled={!puedeImportar}
            title={puedeImportar
              ? 'Alta masiva desde «Mis Comprobantes Recibidos» de ARCA, con vista previa: entran impagas y sin imputar'
              : !puedeCrear ? 'No tenés permiso para cargar facturas'
              : 'No tenés permiso para importar comprobantes de ARCA (hace falta «Importar comprobantes de ARCA»)'}
          >
            📥 Importar de ARCA
          </Button>
          {(sinImputar.data ?? 0) > 0 && (
            <button type="button"
              onClick={() => patch(verSinImputar ? FILTRO_INICIAL_PATCH : { ...FILTRO_POR_AVISO['sin-imputar'], importacion_id: undefined })}
              title={verSinImputar ? 'Volver a la bandeja' : 'Importadas de ARCA que faltan imputar (concepto y obra): no se aprueban ni se pagan hasta imputarlas'}
              className={`text-xs px-2.5 py-1.5 rounded border font-semibold transition ${verSinImputar
                ? 'border-naranja bg-naranja-light text-naranja-dark' : 'border-amarillo/60 bg-amarillo-light text-[#7A5000] hover:brightness-95'}`}>
              {verSinImputar ? '✕ ' : ''}Sin imputar ({sinImputar.data})
            </button>
          )}
          {seleccionadas.length > 0 && (
            <>
              <Button
                variant="secondary" size="sm"
                onClick={handleAprobarLote}
                loading={aprobarLote.isPending}
                disabled={!puedeAprobar || aprobables.length === 0}
                title={
                  !puedeAprobar ? 'No tenés permiso para aprobar'
                  : aprobables.length === 0 ? 'De lo seleccionado, no hay nada pendiente de aprobar'
                  : `Aprobar ${aprobables.length} comprobante(s)`
                }
              >
                ✓ Aprobar {aprobables.length > 0 ? aprobables.length : ''}
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={() => setModalPago({ open: true, facturaIds: pagables.map(f => f.id) })}
                disabled={!puedePagar || pagables.length === 0 || !unSoloProveedor}
                title={
                  !puedePagar ? 'No tenés permiso para registrar pagos'
                  : pagables.length === 0 ? 'De lo seleccionado, no hay facturas aprobadas con saldo (las notas de crédito no se pagan)'
                  : !unSoloProveedor ? 'Una orden de pago es de un solo proveedor: elegí facturas de uno solo'
                  : `Pagar ${pagables.length} factura(s)`
                }
              >
                💸 Pagar {pagables.length > 0 ? pagables.length : ''}
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={() => setModalImputarLote(true)}
                disabled={!puedeEditar || imputables.length === 0}
                title={
                  !puedeEditar ? 'No tenés permiso para editar facturas'
                  : imputables.length === 0 ? 'De lo seleccionado, no hay importadas sin imputar'
                  : `Ponerle concepto y obra a ${imputables.length} importada(s)`
                }
              >
                🏷 Imputar… {imputables.length > 0 ? imputables.length : ''}
              </Button>
              {/* Compras de Mercado Libre y similares (20260927h): vendedores
                  distintos, ya pagadas con la tarjeta o con Mercado Pago. */}
              <Button
                variant="secondary" size="sm"
                onClick={() => setModalMarcarPagadas(true)}
                disabled={!puedeMarcarPagadas || marcables.length === 0}
                title={
                  !puedeMarcarPagadas ? 'No tenés permiso para cargar facturas'
                  : marcables.length === 0 ? 'De lo seleccionado, no hay facturas con saldo (las NC, anuladas y las que paga el cliente no cuentan)'
                  : `Registrar que ${marcables.length} factura(s) se pagaron con la tarjeta o con Mercado Pago (una orden por factura)`
                }
              >
                💳 Marcar pagadas {marcables.length > 0 ? marcables.length : ''}
              </Button>
              {/* La planilla del banco, precargada (2026-09-23). A diferencia de
                  «Pagar», admite varios proveedores: es una fila por cada uno. */}
              <Button
                variant="secondary" size="sm"
                onClick={() => setModalGalicia(true)}
                disabled={!puedePagar || pagables.length === 0}
                title={
                  !puedePagar ? 'No tenés permiso para registrar pagos'
                  : pagables.length === 0 ? 'De lo seleccionado, no hay nada aprobado con saldo'
                  : `Planilla del Galicia con ${pagables.length} factura(s)`
                }
              >
                🏦 Galicia {pagables.length > 0 ? pagables.length : ''}
              </Button>
              <span className="text-xs text-gris-dark">{seleccionadas.length} seleccionada{seleccionadas.length === 1 ? '' : 's'}</span>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* La lista la ajusta el contador; verla la ve cualquiera con el tab. */}
          <Button variant="ghost" size="sm" onClick={() => setModalConceptos(true)}
            title={puedeEditar ? 'Conceptos de compra: alta, renombrar, orden y baja' : 'Ver los conceptos de compra (editarlos pide permiso de edición en Compras)'}>
            🏷 Conceptos
          </Button>
          <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}
            title="Planilla para trabajar: una fila por factura, con totales y autofiltro.">
            📊 Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={exportarPdf} loading={generandoPdf} disabled={total === 0}
            title="Hoja para imprimir o mandar: cuánto se debe, a quién y para cuándo.">
            🖨 Resumen PDF
          </Button>
        </div>
      </div>

      {/* Deuda por proveedor */}
      <DeudaPorProveedor
        filas={saldos.data ?? []}
        cargando={saldos.isLoading}
        proveedorSel={filtro.proveedor_id}
        onElegir={id => patch({ proveedor_id: filtro.proveedor_id === id ? undefined : id })}
      />

      {/* Filtros + chips por estado */}
      <FiltrosFacturas
        filtro={filtro}
        patch={patch}
        grupos={resumen.data?.grupos ?? []}
      />

      {/* Lista */}
      {lista.isLoading && !lista.data ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando facturas…</div>
      ) : lista.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo">
          {mensajeErrorPagos(lista.error)}
        </div>
      ) : (
        <>
          <FacturasTabla
            items={items}
            seleccion={seleccion}
            onToggle={toggle}
            onToggleTodas={toggleTodas}
            onAbrir={id => setFichaId(id)}
            puedeSeleccionar={puedeAprobar || puedePagar || puedeEditar || puedeMarcarPagadas}
          />
          {total > PAGE_SIZE && (
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          )}
          <p className="text-[11px] text-gris-dark px-1">
            {total.toLocaleString('es-AR')} comprobante{total === 1 ? '' : 's'} · importes finales con IVA · las NC restan ·
            {' '}el reparto por obra se hace sobre el total menos las percepciones
          </p>
        </>
      )}

      {/* Ficha */}
      {fichaId !== null && (
        <FichaFactura
          id={fichaId}
          onClose={() => setFichaId(null)}
          onEditar={id => { setFichaId(null); setModalCargar({ open: true, editarId: id }) }}
          onPagar={id => { setFichaId(null); setModalPago({ open: true, facturaIds: [id] }) }}
        />
      )}

      {/* Cargar / editar */}
      {modalCargar.open && (
        <ModalCargarFactura
          editarId={modalCargar.editarId}
          onClose={() => setModalCargar({ open: false })}
        />
      )}

      {modalConceptos && <ModalConceptosCompra onClose={() => setModalConceptos(false)} />}

      {modalImportar && (
        <ModalImportarRecibidos
          onClose={() => setModalImportar(false)}
          onVerImportadas={id => {
            setModalImportar(false)
            patch({ ...FILTRO_POR_AVISO['sin-imputar'], importacion_id: id ?? undefined })
          }}
        />
      )}

      {modalImputarLote && (
        <ModalImputarLote facturas={imputables} onClose={() => setModalImputarLote(false)} onHecho={() => setSeleccion(new Set())} />
      )}

      {modalMarcarPagadas && (
        <ModalMarcarPagadas facturas={marcables} onClose={() => setModalMarcarPagadas(false)} onHecho={() => setSeleccion(new Set())} />
      )}

      {modalGalicia && (
        <ModalExcelGalicia facturas={pagables} verPii={!!verPii} onClose={() => setModalGalicia(false)} />
      )}

      {/* Registrar pago */}
      {modalPago.open && (
        <ModalRegistrarPago
          facturaIds={modalPago.facturaIds}
          onClose={() => { setModalPago({ open: false, facturaIds: [] }); setSeleccion(new Set()) }}
          onRegistrado={(id, conComprobante) => { if (conComprobante) setAvisoOrdenId(id) }}
        />
      )}

      {avisoOrdenId !== null && (
        <PreguntarAvisoPago ordenId={avisoOrdenId} titulo="Pago registrado" onClose={() => setAvisoOrdenId(null)} />
      )}
    </div>
  )
}

/** Volver de «Sin imputar» a la bandeja: pisa todas las claves que puso el aviso. */
const FILTRO_INICIAL_PATCH: Partial<PagosFacturasFiltro> = {
  ...FILTRO_INICIAL, importacion_id: undefined,
}

/** Barrita de KPI reutilizable: el número grande y qué significa. */
export function Kpi({ label, valor, sub, activo, onClick, tono = 'normal' }: {
  label: string
  valor: string
  sub?: string
  activo?: boolean
  onClick?: () => void
  tono?: 'normal' | 'alerta' | 'ok'
}) {
  const color = tono === 'alerta' ? 'text-rojo' : tono === 'ok' ? 'text-verde' : 'text-azul'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex-1 min-w-[130px] text-left px-3 py-2 rounded-card border transition
        ${activo ? 'border-naranja bg-naranja-light/40' : 'border-gris-mid bg-white hover:bg-gris/40'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-lg tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </button>
  )
}

export { fmtM }
