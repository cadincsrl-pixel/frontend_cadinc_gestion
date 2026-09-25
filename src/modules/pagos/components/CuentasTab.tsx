'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCuentaCorrienteProveedor, useProveedoresPagos } from '../hooks/useProveedoresPagos'
import { fmtFecha, fmtM, hoyAR } from '../utils/pagos.utils'
import { mensajeErrorPagos } from '../utils/pagos.errores'
import {
  TIPO_MOV_LABEL, exportarCuentaCorrienteExcel, exportarCuentaCorrientePdf, marcasMovimiento,
} from '../utils/cuentaCorrienteExport'

/**
 * Compras › Cuentas (20260929s): la cuenta corriente con un proveedor, como la
 * arma él. Es lo que se pone al lado de su estado de cuenta para compararlo.
 *
 * Facturas y notas de débito al DEBE; notas de crédito y pagos al HABER.
 * Saldo positivo = CADINC le debe. Sin anulados ni lo que paga el cliente.
 * Arranca en el 01/07/2026, que es donde empiezan las compras en el sistema.
 */

const DESDE_DEFAULT = '2026-07-01'

export function CuentasTab({ proveedorInicial }: { proveedorInicial: number | null }) {
  const router = useRouter()
  const toast = useToast()
  const [proveedorId, setProveedorId] = useState<number | null>(proveedorInicial)
  const [desde, setDesde] = useState(DESDE_DEFAULT)
  const [hasta, setHasta] = useState(hoyAR())
  const [exportando, setExportando] = useState(false)

  const proveedores = useProveedoresPagos({ inactivos: true }, 1, 300)
  const opciones = useMemo(
    () => (proveedores.data?.items ?? []).map(p => ({
      value: String(p.id),
      label: p.razon_social,
      sub: [p.codigo, p.cuit, p.activo ? null : 'dado de baja'].filter(Boolean).join(' · ') || undefined,
      search: [p.razon_social, p.cuit ?? '', p.codigo ?? '', (p.codigo ?? '').replace('-', '')],
    })),
    [proveedores.data],
  )
  const rangoOk = !!desde && !!hasta && desde <= hasta
  const { data: cc, isLoading, error } = useCuentaCorrienteProveedor(proveedorId, desde, hasta)

  function elegir(v: string) {
    const id = v ? Number(v) : null
    setProveedorId(id)
    router.replace(id ? `/pagos?tab=cuentas&proveedor=${id}` : '/pagos?tab=cuentas', { scroll: false })
  }

  async function exportar(tipo: 'excel' | 'pdf') {
    if (!cc) return
    setExportando(true)
    try {
      if (tipo === 'excel') await exportarCuentaCorrienteExcel(cc)
      else exportarCuentaCorrientePdf(cc)
    } catch (e) {
      toast(mensajeErrorPagos(e), 'err')
    } finally {
      setExportando(false)
    }
  }

  function abrir(tipo: string, id: number) {
    router.push(tipo === 'pago' ? `/pagos?tab=pagos&ficha=${id}` : `/pagos?tab=facturas&ficha=${id}`)
  }

  const inputFecha = 'px-2.5 py-2 border-[1.5px] border-gris-mid rounded text-sm bg-white outline-none focus:border-naranja'

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-[340px]">
          <Combobox label="Proveedor" placeholder="Elegí un proveedor…" options={opciones}
            value={proveedorId ? String(proveedorId) : ''} onChange={elegir} />
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris-dark">
          Desde
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputFecha} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris-dark">
          Hasta
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputFecha} />
        </label>
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={() => exportar('excel')} disabled={!cc || exportando}
            title="Planilla con los movimientos, para trabajar o mandarle al proveedor">📊 Excel</Button>
          <Button variant="secondary" size="sm" onClick={() => exportar('pdf')} disabled={!cc || exportando}
            title="Estado de cuenta para imprimir o mandar">🖨 PDF</Button>
        </div>
        {!rangoOk && <p className="w-full text-xs text-rojo">«Desde» tiene que ser anterior o igual a «Hasta».</p>}
      </div>

      {!proveedorId ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
          Elegí un proveedor para ver su cuenta corriente: facturas y notas de débito al debe, notas de crédito y pagos al haber, con el saldo de cada día.
          <div className="text-xs mt-1">Sirve para compararla con el estado de cuenta que manda el proveedor.</div>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando la cuenta…</div>
      ) : error ? (
        <div className="bg-white rounded-card shadow-card p-4 text-sm text-rojo">{mensajeErrorPagos(error)}</div>
      ) : cc ? (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Resumen label={`Saldo al ${fmtFecha(cc.desde)}`} valor={cc.saldo_inicial} sub="antes del rango" />
            <Resumen label="Debe" valor={cc.total_debe} sub="facturas y notas de débito" />
            <Resumen label="Haber" valor={cc.total_haber} sub="pagos y notas de crédito" />
            <Resumen label={`Saldo al ${fmtFecha(cc.hasta)}`} valor={cc.saldo_final} destacado
              sub={cc.saldo_final > 0.005 ? 'CADINC le debe' : cc.saldo_final < -0.005 ? 'a favor de CADINC' : 'sin saldo'} />
          </div>

          {Number(cc.a_reconstruir) > 0.005 && (
            <div className="border rounded p-2 text-xs bg-amarillo-light border-amarillo/40 text-[#7A5000]">
              <b>Todavía hay {fmtM(cc.a_reconstruir)} en facturas «de meses ya pagados»</b> cuyo pago no se cargó.
              Mientras tanto la cuenta muestra más deuda que la real: las marcadas «pago a reconstruir» son las que faltan.
            </div>
          )}

          {/* Movimientos */}
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[860px]">
                <thead>
                  <tr>
                    {['Fecha', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo'].map((h, i) => (
                      <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-1.5 uppercase tracking-wide whitespace-nowrap ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gris bg-azul-light/30">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtFecha(cc.desde)}</td>
                    <td className="px-3 py-2 text-xs italic text-gris-dark" colSpan={4}>Saldo inicial</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">{fmtM(cc.saldo_inicial)}</td>
                  </tr>
                  {cc.movimientos.map(m => {
                    const marcas = marcasMovimiento(m)
                    return (
                      <tr key={`${m.tipo}-${m.ref_id}`} className="border-t border-gris hover:bg-azul-light/20">
                        <td className="px-3 py-2 text-xs whitespace-nowrap align-top">{fmtFecha(m.fecha)}</td>
                        <td className="px-3 py-2 text-xs align-top whitespace-nowrap">
                          <button type="button" onClick={() => abrir(m.tipo, m.ref_id)}
                            className="text-left hover:underline" title={m.tipo === 'pago' ? 'Abrir la orden de pago' : 'Abrir el comprobante'}>
                            <span className={`block text-[10px] font-bold uppercase ${m.tipo === 'pago' ? 'text-verde' : m.tipo === 'nota_credito' ? 'text-[#5A2D82]' : 'text-azul'}`}>
                              {TIPO_MOV_LABEL[m.tipo]}
                            </span>
                            <span className="font-mono">{m.comprobante}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs align-top text-gris-dark">
                          {m.detalle}
                          {marcas.map(t => (
                            <span key={t} className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold ${t === 'pago a reconstruir' ? 'bg-amarillo-light text-[#7A5000]' : 'bg-gris text-gris-dark'}`}>{t}</span>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums align-top">{m.debe ? fmtM(m.debe) : ''}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums align-top">{m.haber ? fmtM(m.haber) : ''}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums align-top font-semibold ${m.saldo < -0.005 ? 'text-verde' : ''}`}>{fmtM(m.saldo)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-gris-mid bg-gris/40">
                    <td className="px-3 py-2 text-xs whitespace-nowrap font-bold">{fmtFecha(cc.hasta)}</td>
                    <td className="px-3 py-2 text-xs font-bold" colSpan={2}>
                      Saldo final <span className="font-normal text-gris-dark">· {cc.movimientos.length} movimiento{cc.movimientos.length === 1 ? '' : 's'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">{fmtM(cc.total_debe)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums font-bold">{fmtM(cc.total_haber)}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-bold text-naranja">{fmtM(cc.saldo_final)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-gris-dark border-t border-gris">
              Saldo positivo = CADINC le debe al proveedor. Importes finales con IVA. No incluye comprobantes ni pagos anulados, ni facturas que paga el cliente.
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Resumen({ label, valor, sub, destacado }: { label: string; valor: number; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-card shadow-card p-3 ${destacado ? 'bg-azul text-white' : 'bg-white'}`}>
      <div className={`text-[10px] uppercase tracking-wide font-bold ${destacado ? 'text-white/80' : 'text-gris-dark'}`}>{label}</div>
      <div className="font-mono text-lg font-bold tabular-nums">{fmtM(valor)}</div>
      {sub && <div className={`text-[11px] ${destacado ? 'text-white/80' : 'text-gris-dark'}`}>{sub}</div>}
    </div>
  )
}
