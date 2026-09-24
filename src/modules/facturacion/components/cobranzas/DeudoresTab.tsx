'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePermisos } from '@/hooks/usePermisos'
import { normalizeText } from '@/lib/utils/text'
import { useAmbienteCobranzas, useDeudores } from '../../hooks/useCobranzas'
import { fmtCuit, fmtFecha, fmtM, hoyAR } from '../../utils/facturacion.utils'
import { aCent } from '../../utils/cobranzas.utils'
import { exportarDeudoresExcel } from '../../utils/estadoCuenta'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import type { VentasDeudor } from '@/types/domain.types'
import { Cifra, ErrorCarga, Vacio } from './Comun'
import { ModalEstadoCuenta } from './ModalEstadoCuenta'

/**
 * Deudores: saldo por cliente a una fecha de corte, con la antigüedad en días
 * desde la FECHA de cada factura (hasta 30, 31–60, 61–90, más de 90) y la
 * última cobranza. Click en un cliente → su estado de cuenta.
 *
 * Sin vencimiento de cobro (decisión del dueño, 2026-09-24): no hay «vencido».
 */
export function DeudoresTab() {
  const { puedeVer } = usePermisos('facturacion')
  const ambiente = useAmbienteCobranzas()
  const [al, setAl] = useState(hoyAR())
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<VentasDeudor | null>(null)

  const esHoy = al === hoyAR()
  const deudores = useDeudores(esHoy ? '' : al, ambiente, puedeVer)

  const filas = useMemo(() => {
    const n = normalizeText(q.trim())
    return (deudores.data ?? [])
      .filter(d => !n || normalizeText(`${d.cliente_razon_social} ${d.cliente_doc_nro}`).includes(n))
  }, [deudores.data, q])

  const tot = useMemo(() => {
    const s = (k: keyof VentasDeudor) => filas.reduce((a, d) => a + aCent(d[k] as number), 0) / 100
    return {
      saldo: s('saldo'), creditos: s('a_cuenta') + s('nc_disponible'), neto: s('saldo_neto'),
      d0_30: s('d0_30'), d31_60: s('d31_60'), d61_90: s('d61_90'), d90_mas: s('d90_mas'), revisar: s('saldo_a_revisar'),
    }
  }, [filas])

  if (!puedeVer) return <Vacio>No tenés permiso para ver los deudores.</Vacio>

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 flex gap-3 flex-wrap items-end">
        <div className="w-[170px]">
          <Input label="Fecha de corte" type="date" max={hoyAR()} value={al} onChange={e => setAl(e.target.value || hoyAR())} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <Input label="Buscar cliente" placeholder="Razón social o CUIT" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" onClick={() => exportarDeudoresExcel(filas, al)} disabled={filas.length === 0}>⬇ Excel</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Cifra label="Saldo a cobrar" valor={deudores.isLoading ? '…' : fmtM(tot.saldo)} sub={`${filas.length} cliente${filas.length === 1 ? '' : 's'}`} />
        <Cifra label="A cuenta y NC" valor={deudores.isLoading ? '…' : fmtM(tot.creditos)} />
        <Cifra label="Neto" valor={deudores.isLoading ? '…' : fmtM(tot.neto)} />
        {tot.revisar > 0 && <Cifra label="A revisar" valor={fmtM(tot.revisar)} tono="naranja" sub="saldos iniciales sin confirmar" />}
      </div>

      {deudores.isLoading && !deudores.data ? (
        <Vacio>Calculando saldos…</Vacio>
      ) : deudores.error ? (
        <ErrorCarga mensaje={mensajeErrorFacturacion(deudores.error)} onReintentar={() => deudores.refetch()} />
      ) : filas.length === 0 ? (
        <Vacio>{q ? 'Ningún cliente coincide.' : 'Nadie debe nada a esta fecha.'}</Vacio>
      ) : (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[1050px]">
              <thead>
                <tr>
                  {['Cliente', 'Saldo', 'A cuenta y NC', 'Neto', 'Hasta 30 días', '31–60', '61–90', 'Más de 90', 'Última cobranza'].map((h, i) => (
                    <th key={h} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-2 uppercase tracking-wide whitespace-nowrap ${i >= 1 && i <= 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(d => (
                  <tr key={`${d.ambiente}-${d.cliente_id}`} onClick={() => setAbierto(d)} className="border-t border-gris hover:bg-azul-light/30 cursor-pointer">
                    <td className="px-2 py-2 text-sm">
                      <div className="font-semibold">{d.cliente_razon_social}</div>
                      <div className="text-[11px] text-gris-dark font-mono">
                        {fmtCuit(d.cliente_doc_nro)} · {d.comprobantes} cbte{d.comprobantes === 1 ? '' : 's'}
                        {Number(d.saldo_a_revisar) > 0 && (
                          <span className="ml-1 font-sans font-bold text-[#7A5000] bg-amarillo-light px-1 rounded"
                                title="Parte del saldo viene de saldos iniciales sin confirmar">a revisar {fmtM(d.saldo_a_revisar)}</span>
                        )}
                      </div>
                    </td>
                    <Num v={d.saldo} fuerte />
                    <Num v={Number(d.a_cuenta) + Number(d.nc_disponible)} title={`A cuenta ${fmtM(d.a_cuenta)} · NC libres ${fmtM(d.nc_disponible)}`} />
                    <Num v={d.saldo_neto} fuerte />
                    <Num v={d.d0_30} />
                    <Num v={d.d31_60} />
                    <Num v={d.d61_90} />
                    <Num v={d.d90_mas} />
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {d.ultima_cobranza ? <>{fmtFecha(d.ultima_cobranza)}<div className="text-gris-dark">{fmtM(d.ultima_cobranza_total)}</div></> : <span className="text-gris-dark">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gris-mid bg-gris/40 font-bold">
                  <td className="px-2 py-2 text-sm">Total ({filas.length})</td>
                  <Num v={tot.saldo} fuerte /><Num v={tot.creditos} /><Num v={tot.neto} fuerte />
                  <Num v={tot.d0_30} /><Num v={tot.d31_60} /><Num v={tot.d61_90} /><Num v={tot.d90_mas} />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="md:hidden divide-y divide-gris">
            {filas.map(d => (
              <button key={`${d.ambiente}-${d.cliente_id}`} type="button" onClick={() => setAbierto(d)} className="w-full text-left p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{d.cliente_razon_social}</span>
                  <span className="font-mono font-bold text-sm tabular-nums">{fmtM(d.saldo_neto)}</span>
                </div>
                <div className="text-[11px] text-gris-dark">
                  {Number(d.d90_mas) > 0 ? `más de 90 días ${fmtM(d.d90_mas)}` : `${d.comprobantes} cbte${d.comprobantes === 1 ? '' : 's'}`}
                  {d.ultima_cobranza && <> · última cobranza {fmtFecha(d.ultima_cobranza)}</>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-gris-dark px-1">
        Antigüedad en días desde la fecha de emisión de cada comprobante{esHoy ? '' : ` al ${fmtFecha(al)}`}. «A cuenta y NC»: cobros sin aplicar y notas de crédito libres; el neto ya los descuenta.
      </p>

      {abierto && (
        <ModalEstadoCuenta clienteId={abierto.cliente_id} razonSocial={abierto.cliente_razon_social} docNro={abierto.cliente_doc_nro}
          deudor={abierto} onClose={() => setAbierto(null)} />
      )}
    </div>
  )
}

function Num({ v, fuerte, title }: { v: number | string | null | undefined; fuerte?: boolean; title?: string }) {
  const n = Number(v ?? 0)
  return (
    <td title={title} className={`px-2 py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap ${fuerte ? 'font-bold text-sm' : ''} ${n === 0 ? 'text-gris-mid' : ''}`}>
      {n === 0 ? '—' : fmtM(n)}
    </td>
  )
}
