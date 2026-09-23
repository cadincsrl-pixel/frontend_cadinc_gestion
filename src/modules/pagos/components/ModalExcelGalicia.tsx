'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { EMPRESA } from '@/lib/config/empresa'
import { useProveedoresPagos } from '../hooks/useProveedoresPagos'
import {
  GALICIA, agruparPorProveedor, chequesDelPlan, destinoTransferencia, filasEcheq, filasTransferencias,
  planPorDefecto, type PlanEcheq,
} from '../utils/galicia'
import { llenarPlantillaXlsx } from '../utils/xlsxPlantilla'
import { fmtFecha, fmtM, hoyAR } from '../utils/pagos.utils'
import type { PagosFactura } from '@/types/domain.types'

type Tipo = 'transferencias' | 'echeq'

/**
 * Bajar la planilla del Galicia ya completada con las facturas elegidas
 * (2026-09-23). Una fila por proveedor; los e-cheqs se parten con plazos.
 * NO registra el pago: eso se hace después, con el comprobante del banco.
 * Las reglas y los límites del banco viven en `utils/galicia.ts`.
 */
export function ModalExcelGalicia({ facturas, verPii, onClose }: {
  facturas: PagosFactura[]; verPii: boolean; onClose: () => void
}) {
  const toast = useToast()
  const hoy = hoyAR()
  const proveedores = useProveedoresPagos({}, 1, 300)
  const emails = useMemo(
    () => new Map((proveedores.data?.items ?? []).map(p => [p.id, p.email] as [number, string])),
    [proveedores.data],
  )
  const grupos = useMemo(() => agruparPorProveedor(facturas, emails), [facturas, emails])

  // Arranca en la forma que más se repite entre lo elegido.
  const [tipo, setTipo] = useState<Tipo>(() => {
    const echeq = facturas.filter(f => f.forma_pago_prevista === 'echeq' || f.forma_pago_prevista === 'cheque').length
    return echeq > facturas.length / 2 ? 'echeq' : 'transferencias'
  })
  const [planes, setPlanes] = useState<Map<number, PlanEcheq>>(new Map())
  const planDe = (id: number) => planes.get(id) ?? planPorDefecto(grupos.find(g => g.proveedor_id === id)!, hoy)
  const setPlan = (id: number, p: Partial<PlanEcheq>) =>
    setPlanes(m => new Map(m).set(id, { ...planDe(id), ...p }))

  const resultado = useMemo(
    () => tipo === 'transferencias'
      ? filasTransferencias(grupos, EMPRESA.nombre)
      : filasEcheq(grupos, new Map(grupos.map(g => [g.proveedor_id, planes.get(g.proveedor_id) ?? planPorDefecto(g, hoy)])), hoy, EMPRESA.nombre),
    [tipo, grupos, planes, hoy],
  )
  const conf = GALICIA[tipo]
  const demasiadas = resultado.filas.length > conf.maxFilas
  // El CBU completo sólo llega con `ver_pii`: sin eso el archivo saldría con ***1234.
  const faltaPii = tipo === 'transferencias' && !verPii
  const [generando, setGenerando] = useState(false)

  async function bajar() {
    setGenerando(true)
    try {
      const r = await fetch(conf.plantilla)
      if (!r.ok) throw new Error('plantilla')
      const archivo = await llenarPlantillaXlsx(await r.arrayBuffer(), conf.hoja, resultado.filas)
      const blob = new Blob([archivo as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Galicia_${tipo === 'echeq' ? 'echeqs' : 'transferencias'}_${hoy}.${conf.extension}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      toast(`✓ Planilla lista: ${resultado.filas.length} fila(s) por ${fmtM(resultado.total)}`, 'ok')
    } catch {
      toast('No se pudo generar la planilla', 'err')
    } finally {
      setGenerando(false)
    }
  }

  const afuera = new Set(resultado.afuera.map(a => a.razon_social))

  return (
    <Modal open onClose={onClose} width="max-w-3xl" title="Planilla para el Galicia"
      footer={
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <span className="text-xs text-gris-dark mr-auto">
            {resultado.filas.length} fila(s) · <b className="font-mono">{fmtM(resultado.total)}</b>
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          <Button size="sm" onClick={bajar} loading={generando}
            disabled={resultado.filas.length === 0 || demasiadas || faltaPii}
            title={faltaPii ? 'Para bajar CBU completos hace falta el permiso de ver datos sensibles'
              : demasiadas ? `El banco acepta hasta ${conf.maxFilas} filas por archivo`
              : resultado.filas.length === 0 ? 'No hay nada para pagar con esta forma' : undefined}>
            ⬇ Bajar planilla
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex gap-1 bg-gris rounded p-1 self-start">
          {(['transferencias', 'echeq'] as Tipo[]).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`px-3 py-1.5 rounded text-xs font-semibold ${tipo === t ? 'bg-white shadow-sm text-azul' : 'text-gris-dark'}`}>
              {t === 'echeq' ? 'E-cheqs' : 'Transferencias'}
            </button>
          ))}
        </div>

        <div className="text-xs text-gris-dark">
          Una fila por proveedor con la suma de sus facturas. <b>No registra el pago</b>: subí la planilla al banco y,
          cuando se procese, registrá el pago como siempre con el comprobante.
          {tipo === 'echeq' && ' Los e-cheqs salen «A la orden».'}
        </div>

        {faltaPii && (
          <div className="bg-amarillo-light border border-amarillo/40 rounded p-2 text-xs text-[#7A5000]">
            Para las transferencias hace falta el CBU completo, que sólo ve quien tiene el permiso de datos sensibles.
          </div>
        )}
        {demasiadas && (
          <div className="bg-rojo-light border border-rojo/40 rounded p-2 text-xs text-rojo">
            Son {resultado.filas.length} filas y el banco acepta hasta {conf.maxFilas} por archivo. Elegí menos facturas.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {grupos.map(g => {
            const fuera = afuera.has(g.razon_social)
            const motivo = resultado.afuera.find(a => a.razon_social === g.razon_social)?.motivo
            const plan = planDe(g.proveedor_id)
            const cheques = tipo === 'echeq' && !fuera ? chequesDelPlan(g.total, plan) : []
            return (
              <div key={g.proveedor_id} className={`border rounded p-2.5 ${fuera ? 'border-rojo/40 bg-rojo-light/40' : 'border-gris-mid'}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{g.razon_social}</div>
                    <div className="text-[11px] text-gris-dark">
                      {g.facturas.map(f => `${f.tipo_comprobante} ${f.numero ?? 's/n'}`).join(', ')}
                    </div>
                    {tipo === 'transferencias' && !fuera && (
                      <div className="text-[11px] text-gris-dark font-mono">→ {destinoTransferencia(g)}</div>
                    )}
                  </div>
                  <div className="ml-auto font-mono font-bold tabular-nums">{fmtM(g.total)}</div>
                </div>
                {fuera && <div className="text-xs text-rojo mt-1">No entra: {motivo}.</div>}

                {tipo === 'echeq' && !fuera && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex gap-2 flex-wrap items-end text-xs">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-gris-dark">E-cheqs</span>
                        <input type="number" min={1} max={24} value={plan.cantidad}
                          onChange={e => setPlan(g.proveedor_id, { cantidad: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })}
                          className="w-16 px-2 py-1 border border-gris-mid rounded" />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-gris-dark">Primer cobro</span>
                        <input type="date" min={hoy} value={plan.primerCobro}
                          onChange={e => setPlan(g.proveedor_id, { primerCobro: e.target.value || hoy })}
                          className="px-2 py-1 border border-gris-mid rounded" />
                      </label>
                      {plan.cantidad > 1 && (
                        <label className="flex flex-col gap-0.5">
                          <span className="text-gris-dark">Cada (días)</span>
                          <input type="number" min={1} value={plan.cadaDias}
                            onChange={e => setPlan(g.proveedor_id, { cadaDias: Math.max(1, Number(e.target.value) || 30) })}
                            className="w-16 px-2 py-1 border border-gris-mid rounded" />
                        </label>
                      )}
                      {g.primerVence && <span className="text-[11px] text-gris-dark pb-1.5">vence {fmtFecha(g.primerVence)}</span>}
                    </div>
                    <div className="text-[11px] text-gris-dark">
                      {cheques.map((c, i) => (
                        <span key={i} className="inline-block mr-3">{fmtFecha(c.fecha)}: <b className="font-mono">{fmtM(c.monto)}</b></span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
