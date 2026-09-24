'use client'

import { Button } from '@/components/ui/Button'
import { usePosicionIva } from '../../hooks/useFacturacion'
import { fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { nombreMes } from '../../utils/lidVentas'
import { AvisoParcial, Tarjeta, hoyCorto, mesEnCurso } from './LidComun'

/**
 * Posición de IVA del mes: débito fiscal (libro de ventas) − crédito fiscal
 * (libro de compras) − percepciones de IVA sufridas − retenciones de IVA que
 * hicieron los clientes. Es una ayuda para el contador, no la declaración
 * jurada: no arrastra saldos a favor de meses anteriores.
 */
export function PosicionIva({ periodo, incluirCvlp, onVer }: {
  periodo: string; incluirCvlp: boolean; onVer: (vista: 'ventas' | 'compras') => void
}) {
  const q = usePosicionIva(periodo, incluirCvlp)
  const p = q.data

  if (q.isLoading && !p) return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Calculando…</div>
  if (q.error) {
    return (
      <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
        <span>{mensajeErrorFacturacion(q.error)}</span>
        <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Reintentar</Button>
      </div>
    )
  }
  if (!p) return null

  const incompleta = p.excluidos_ventas > 0 || p.excluidos_compras > 0
  const parcial = mesEnCurso(p.periodo)
  return (
    <div className="flex flex-col gap-4">
      <AvisoParcial periodo={p.periodo} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tarjeta titulo="A pagar" valor={fmtM(p.a_pagar)} tono={p.a_pagar > 0 ? 'rojo' : 'azul'}
          sub={parcial ? `parcial, al ${hoyCorto()}` : incompleta ? 'posición incompleta: ver avisos' : `IVA de ${nombreMes(p.periodo)}`} />
        <Tarjeta titulo="Saldo técnico a favor" valor={fmtM(p.saldo_tecnico_a_favor)} tono={p.saldo_tecnico_a_favor > 0 ? 'verde' : 'azul'}
          sub="crédito fiscal mayor que el débito" />
        <Tarjeta titulo="Libre disponibilidad" valor={fmtM(p.libre_disponibilidad)} tono={p.libre_disponibilidad > 0 ? 'verde' : 'azul'}
          sub="percepciones y retenciones que sobran" />
      </div>

      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 overflow-x-auto">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark mb-2">Cómo se llega</h3>
        <table className="w-full text-sm max-w-2xl">
          <tbody>
            <Fila label="Débito fiscal (IVA de las ventas)" valor={p.debito_fiscal} onClick={() => onVer('ventas')}
              nota={p.excluidos_ventas ? `${p.excluidos_ventas} comprobante(s) quedaron fuera del libro de ventas` : undefined} />
            <Fila signo="−" label="Crédito fiscal (IVA de las compras)" valor={p.credito_fiscal} onClick={() => onVer('compras')}
              nota={p.excluidos_compras ? `${p.excluidos_compras} comprobante(s) quedaron fuera del libro de compras` : undefined} />
            <Fila signo="=" label={p.impuesto_determinado >= 0 ? 'Impuesto determinado' : 'Saldo técnico a favor'} valor={Math.abs(p.impuesto_determinado)} fuerte />
            <Fila signo="−" label="Percepciones de IVA sufridas" valor={p.percepciones_iva} nota="las de las facturas de proveedor del mes" />
            <Fila signo="−" label="Retenciones de IVA sufridas" valor={p.retenciones_iva} nota="las que hicieron los clientes en las cobranzas del mes" />
            <Fila signo="=" label="A pagar" valor={p.a_pagar} fuerte />
            {p.libre_disponibilidad > 0 && (
              <Fila label="Saldo de libre disponibilidad" valor={p.libre_disponibilidad}
                nota="percepciones y retenciones que no se usaron contra el impuesto del mes" />
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-amarillo-light border border-amarillo/40 rounded-card p-3 text-xs text-[#7A5000] flex flex-col gap-1">
        {p.avisos.map((a, i) => <p key={i}>⚠ {a}</p>)}
      </div>
    </div>
  )
}

function Fila({ label, valor, signo, fuerte, onClick, nota }: {
  label: string; valor: number; signo?: '−' | '='; fuerte?: boolean; onClick?: () => void; nota?: string
}) {
  return (
    <tr className={`border-t border-gris-mid/50 ${fuerte ? 'font-bold' : ''}`}>
      <td className="py-1.5 pr-2 w-6 text-gris-dark font-mono">{signo ?? ''}</td>
      <td className="py-1.5 pr-2">
        {onClick ? <button type="button" onClick={onClick} className="text-left underline decoration-dotted hover:text-naranja-dark">{label}</button> : label}
        {nota && <span className="block text-[11px] text-gris-dark font-normal">{nota}</span>}
      </td>
      <td className="py-1.5 text-right font-mono whitespace-nowrap">{fmtM(valor)}</td>
    </tr>
  )
}
