'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useFacturas, useFacturasResumen, useAprobarFacturas, fetchFacturasExport, fetchPaqueteContador,
  type PagosFacturasFiltro,
} from '../hooks/usePagos'
import { useSaldosProveedores } from '../hooks/useProveedoresPagos'
import { fmtM, describirFiltroFacturas } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import { exportarFacturasPagos } from '../utils/pagosExport'
import { exportarResumenPagosPdf } from '../utils/pagosResumenPdf'
import { armarPaqueteContador } from '../utils/pagosPaquete'
import { FiltrosFacturas } from './FiltrosFacturas'
import { FacturasTabla } from './FacturasTabla'
import { FichaFactura } from './FichaFactura'
import { ModalCargarFactura } from './ModalCargarFactura'
import { ModalRegistrarPago } from './ModalRegistrarPago'
import { DeudaPorProveedor } from './DeudaPorProveedor'

const PAGE_SIZE = 50

/**
 * Los filtros con los que entra la bandeja cuando se llega desde la campana.
 * Cada uno replica EXACTAMENTE la query de su aviso en `useNotificaciones`:
 * si no coincidieran, el aviso diría "3" y la pantalla mostraría otra cosa.
 */
const FILTRO_POR_AVISO: Record<string, PagosFacturasFiltro> = {
  aprobar:      { estados: ['pendiente'], paga_cliente: false, orden: 'vencimiento' },
  vencidas:     { vencimiento: 'vencidas', paga_cliente: false, orden: 'vencimiento' },
  'sin-revisar':{ sin_revisar: true,  orden: 'vencimiento' },
  observadas:   { estados: ['observada'], orden: 'vencimiento' },
}

const FILTRO_INICIAL: PagosFacturasFiltro = {
  estados: ['pendiente', 'observada', 'aprobada', 'pagada_parcial'],
  orden:   'vencimiento',
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
export function FacturasTab({ aviso }: { aviso?: string | null }) {
  const toast = useToast()
  const { puedeVer, puedeCrear, registrarPagos, aprobarFacturas, esAdmin } = usePermisos('pagos')
  const puedeAprobar = !!(aprobarFacturas || esAdmin)
  const puedePagar   = !!(registrarPagos || esAdmin)

  // `aviso` sólo decide el estado INICIAL: una vez adentro el usuario manda,
  // y no se reescribe la URL para no pelearse con el historial del navegador.
  const [filtro, setFiltro] = useState<PagosFacturasFiltro>(
    () => (aviso ? FILTRO_POR_AVISO[aviso] : undefined) ?? FILTRO_INICIAL)
  const [page, setPage] = useState(1)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [modalCargar, setModalCargar] = useState<{ open: boolean; editarId?: number }>({ open: false })
  const [modalPago, setModalPago] = useState<{ open: boolean; facturaIds: number[] }>({ open: false, facturaIds: [] })
  const [exportando, setExportando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  /** null = no hay paquete en curso; si no, el avance de la bajada. */
  const [paquete, setPaquete] = useState<{ hechos: number; total: number } | null>(null)

  const lista   = useFacturas(filtro, page, PAGE_SIZE, puedeVer)
  // El resumen por estado alimenta los chips: se pide SIN `estados` (lo hace el
  // hook) para que cada chip muestre cuánto hay con el RESTO de los filtros.
  const resumen = useFacturasResumen(filtro, 'estado', puedeVer)
  const saldos  = useSaldosProveedores(puedeVer)
  const aprobarLote = useAprobarFacturas()

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
  // sentido.
  const pagables = useMemo(
    () => seleccionadas.filter(f => ['aprobada', 'pagada_parcial'].includes(f.estado) && !f.paga_cliente && f.saldo > 0),
    [seleccionadas],
  )
  const unSoloProveedor = pagables.length > 0 && new Set(pagables.map(f => f.proveedor_id)).size === 1

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

  /**
   * El paquete para el contador. Baja los archivos de a uno con la URL firmada
   * que manda el backend y arma el ZIP acá: un mes entero de PDFs no pasa por
   * la memoria del server. Puede tardar, así que muestra el avance.
   */
  async function bajarPaquete() {
    if (total === 0) { toast('No hay facturas para empaquetar con estos filtros', 'err'); return }
    setPaquete({ hechos: 0, total: 0 })
    try {
      const manifiesto = await fetchPaqueteContador(filtro)
      const cuantos = manifiesto.facturas.reduce((s, f) => s + f.archivos.length, 0)
      if (cuantos === 0) {
        toast('Ninguna de esas facturas tiene archivos adjuntos', 'err')
        return
      }
      setPaquete({ hechos: 0, total: cuantos })
      const r = await armarPaqueteContador(manifiesto, descFiltro, (hechos, t) => setPaquete({ hechos, total: t }))
      const avisos = [
        r.fallados > 0 ? `${r.fallados} no se pudieron bajar` : '',
        r.sinPapeles > 0 ? `${r.sinPapeles} factura(s) sin ningún archivo` : '',
      ].filter(Boolean)
      toast(
        `✓ ${r.archivos} archivo(s) en el ZIP${avisos.length ? ' · ' + avisos.join(' · ') : ''}`,
        avisos.length > 0 ? 'err' : 'ok',
      )
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setPaquete(null)
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
            title={puedeCrear ? 'Cargar una factura de proveedor' : 'No tenés permiso para cargar facturas'}
          >
            + Cargar factura
          </Button>
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
                  : `Aprobar ${aprobables.length} factura(s)`
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
                  : pagables.length === 0 ? 'De lo seleccionado, no hay nada aprobado con saldo'
                  : !unSoloProveedor ? 'Una orden de pago es de un solo proveedor: elegí facturas de uno solo'
                  : `Pagar ${pagables.length} factura(s)`
                }
              >
                💸 Pagar {pagables.length > 0 ? pagables.length : ''}
              </Button>
              <span className="text-xs text-gris-dark">{seleccionadas.length} seleccionada{seleccionadas.length === 1 ? '' : 's'}</span>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="secondary" size="sm" onClick={exportar} loading={exportando} disabled={total === 0}
            title="Planilla para trabajar: una fila por factura, con totales y autofiltro.">
            📊 Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={exportarPdf} loading={generandoPdf} disabled={total === 0}
            title="Hoja para imprimir o mandar: cuánto se debe, a quién y para cuándo.">
            🖨 Resumen PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={bajarPaquete} loading={paquete !== null} disabled={total === 0}
            title="ZIP con las facturas escaneadas y los comprobantes de pago, por mes, para pasarle al contador.">
            🗂 Paquete contador
          </Button>
          {paquete !== null && paquete.total > 0 && (
            <span className="text-xs text-gris-dark tabular-nums">
              Bajando {paquete.hechos}/{paquete.total}…
            </span>
          )}
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
            puedeSeleccionar={puedeAprobar || puedePagar}
          />
          {total > PAGE_SIZE && (
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          )}
          <p className="text-[11px] text-gris-dark px-1">
            {total.toLocaleString('es-AR')} factura{total === 1 ? '' : 's'} · importes finales con IVA ·
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

      {/* Registrar pago */}
      {modalPago.open && (
        <ModalRegistrarPago
          facturaIds={modalPago.facturaIds}
          onClose={() => { setModalPago({ open: false, facturaIds: [] }); setSeleccion(new Set()) }}
        />
      )}
    </div>
  )
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
