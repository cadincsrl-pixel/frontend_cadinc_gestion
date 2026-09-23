'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { usePermisos } from '@/hooks/usePermisos'
import {
  useArcaEstado, useFacturasVenta, useReconciliarFacturaVenta, useResumenFacturas, type FacturasFiltro,
} from '../hooks/useFacturacion'
import { fmtM, hoyAR, primerDiaDelMes, resultadoReconciliacion } from '../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import type { VentasFacturaFJ } from '@/types/domain.types'
import { FiltrosFacturas } from './FiltrosFacturas'
import { FacturasTabla } from './FacturasTabla'
import { FichaFactura } from './FichaFactura'
import { ModalFactura } from './ModalFactura'
import { ModalConfirmarEmision } from './ModalConfirmarEmision'
import { IndicadorArca } from './EstadoArca'

const PAGE_SIZE = 50

/**
 * La bandeja de comprobantes de venta.
 *
 * Los KPI del mes salen de /facturas/resumen (solo autorizadas, las NC restan),
 * no de sumar la página visible: con paginación un total sumado acá sería
 * mentira. Lo mismo el aviso de «sin confirmar», que pide su propio conteo.
 */
export function FacturasTab() {
  const toast = useToast()
  const { puedeVer, puedeCrear, emitirFacturas, emitirNotasCredito } = usePermisos('facturacion')

  const [filtro, setFiltro] = useState<FacturasFiltro>({})
  const [page, setPage] = useState(1)
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [modal, setModal] = useState<{ open: boolean; editarId?: number; ncDe?: VentasFacturaFJ }>({ open: false })
  const [emitir, setEmitir] = useState<VentasFacturaFJ | null>(null)
  const [verificandoId, setVerificandoId] = useState<number | null>(null)

  const hoy = hoyAR()
  const desdeMes = primerDiaDelMes(hoy)

  const lista      = useFacturasVenta(filtro, page, PAGE_SIZE, puedeVer)
  const resumen    = useResumenFacturas(desdeMes, hoy, puedeVer)
  const sinConf    = useFacturasVenta({ estado: 'error_reconciliar' }, 1, 1, puedeVer)
  const pendFinn   = useFacturasVenta({ finnegans: 'pendiente' }, 1, 1, puedeVer)
  const arca       = useArcaEstado(puedeVer)
  const reconciliar = useReconciliarFacturaVenta()

  const items = useMemo(() => lista.data?.rows ?? [], [lista.data])
  const total = lista.data?.total ?? 0

  const kpi = useMemo(() => {
    const filas = resumen.data ?? []
    const suma = (fn: (r: (typeof filas)[number]) => boolean) =>
      filas.filter(fn).reduce((s, r) => s + Number(r.total), 0)
    return {
      total:      suma(() => true),
      neto:       filas.reduce((s, r) => s + Number(r.neto), 0),
      iva:        filas.reduce((s, r) => s + Number(r.iva), 0),
      obra:       suma(r => r.producto === 'AVANCE DE OBRA'),
      transporte: suma(r => r.producto === 'TRANSPORTE'),
      cantidad:   filas.reduce((s, r) => s + Number(r.cantidad), 0),
    }
  }, [resumen.data])

  function patch(p: Partial<FacturasFiltro>) {
    setFiltro(f => ({ ...f, ...p }))
    setPage(1)
  }

  async function verificar(id: number) {
    setVerificandoId(id)
    try {
      const fj = await reconciliar.mutateAsync(id)
      const r = resultadoReconciliacion(fj.factura)
      toast(r.texto, r.tono)
    } catch (e) {
      toast(mensajeErrorFacturacion(e), 'err')
    } finally {
      setVerificandoId(null)
    }
  }

  if (!puedeVer) {
    return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
      No tenés permiso para ver las facturas.
    </div>
  }

  const trabadas = sinConf.data?.total ?? 0
  const mesLabel = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">

      {/* Acciones + ARCA */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" onClick={() => setModal({ open: true })} disabled={!puedeCrear}
            title={puedeCrear ? 'Cargar una factura A (queda en borrador hasta emitirla)' : 'No tenés permiso para cargar facturas'}>
            + Nueva factura
          </Button>
        </div>
        <IndicadorArca estado={arca.data} cargando={arca.isLoading} />
      </div>

      {trabadas > 0 && (
        <div className="bg-rojo-light border border-rojo/40 rounded-card p-3 text-sm text-rojo flex items-center justify-between gap-2 flex-wrap">
          <span>
            <b>⚠ {trabadas} comprobante{trabadas === 1 ? '' : 's'} sin confirmar.</b> ARCA no respondió y no se sabe si
            {trabadas === 1 ? ' lo' : ' los'} autorizó: mientras tanto el talonario queda trabado. Verificá{trabadas === 1 ? 'lo' : 'los'} en ARCA.
          </span>
          <Button size="sm" variant="secondary" onClick={() => patch({ estado: 'error_reconciliar' })}>Ver</Button>
        </div>
      )}

      {/* KPI del mes */}
      <div className="flex gap-2 flex-wrap">
        <Kpi label={`Facturado ${mesLabel}`} valor={resumen.isLoading ? '…' : fmtM(kpi.total)}
          sub={resumen.isLoading ? undefined : `${kpi.cantidad} comprobante${kpi.cantidad === 1 ? '' : 's'} · NC restan`} />
        <Kpi label="Neto" valor={resumen.isLoading ? '…' : fmtM(kpi.neto)} sub={resumen.isLoading ? undefined : `IVA ${fmtM(kpi.iva)}`} />
        <Kpi label="Avance de obra" valor={resumen.isLoading ? '…' : fmtM(kpi.obra)} />
        <Kpi label="Transporte" valor={resumen.isLoading ? '…' : fmtM(kpi.transporte)} />
        <Kpi label="Falta cargar en Finnegans" valor={pendFinn.isLoading ? '…' : String(pendFinn.data?.total ?? 0)}
          tono={(pendFinn.data?.total ?? 0) > 0 ? 'alerta' : 'ok'} />
      </div>
      {resumen.error && (
        <div className="text-xs text-rojo px-1">No se pudo cargar el resumen del mes: {mensajeErrorFacturacion(resumen.error)}</div>
      )}

      <FiltrosFacturas filtro={filtro} patch={patch} />

      {lista.isLoading && !lista.data ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando comprobantes…</div>
      ) : lista.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(lista.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => lista.refetch()}>Reintentar</Button>
        </div>
      ) : (
        <>
          <FacturasTabla
            items={items}
            onAbrir={setFichaId}
            onVerificar={verificar}
            verificandoId={verificandoId}
            emitirFacturas={emitirFacturas}
            emitirNotasCredito={emitirNotasCredito}
          />
          {total > PAGE_SIZE && <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />}
          <p className="text-[11px] text-gris-dark px-1">
            {total.toLocaleString('es-AR')} comprobante{total === 1 ? '' : 's'} · importes con IVA · las notas de crédito van en negativo
          </p>
        </>
      )}

      {fichaId !== null && (
        <FichaFactura
          id={fichaId}
          onClose={() => setFichaId(null)}
          onEditar={id => { setFichaId(null); setModal({ open: true, editarId: id }) }}
          onNotaCredito={fj => { setFichaId(null); setModal({ open: true, ncDe: fj }) }}
          onEmitir={fj => setEmitir(fj)}
        />
      )}

      {modal.open && (
        <ModalFactura
          editarId={modal.editarId}
          ncDe={modal.ncDe}
          onClose={() => setModal({ open: false })}
          onGuardada={fj => { setModal({ open: false }); setFichaId(fj.factura.id) }}
        />
      )}

      {emitir && (
        <ModalConfirmarEmision
          fj={emitir}
          arca={arca.data}
          onClose={() => setEmitir(null)}
        />
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, tono = 'normal' }: {
  label: string; valor: string; sub?: string; tono?: 'normal' | 'alerta' | 'ok'
}) {
  const color = tono === 'alerta' ? 'text-rojo' : tono === 'ok' ? 'text-verde' : 'text-azul'
  return (
    <div className="flex-1 min-w-[140px] px-3 py-2 rounded-card border border-gris-mid bg-white">
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">{label}</div>
      <div className={`font-mono font-bold text-lg tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gris-dark">{sub}</div>}
    </div>
  )
}
