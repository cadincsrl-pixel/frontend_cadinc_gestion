'use client'

import type { CtbDiarioResumen } from '@/types/contabilidad.types'
import { fmtFecha, fmtN } from '../utils/contabilidad.utils'
import { numeroResumen } from '../utils/exportarDiario'
import { Tarjeta } from './Comun'

/**
 * Un asiento RESUMIDO del libro diario: los automáticos de un circuito en un
 * día o un mes, con las líneas agregadas por cuenta (sin auxiliares ni obra).
 * Es presentación: no existe como asiento; «Ver detalle» abre el diario
 * detallado de ese período.
 */
export function DiarioResumenCard({ it, onVerDetalle }: { it: CtbDiarioResumen; onVerDetalle: (desde: string, hasta: string) => void }) {
  const num = numeroResumen(it)
  return (
    <Tarjeta className="overflow-hidden">
      <div className="px-3 py-2 bg-naranja-light/40 flex items-center gap-3 flex-wrap">
        <span className="font-mono font-bold text-sm text-azul whitespace-nowrap">
          {num === 's/n' ? <span className="text-gris-dark font-normal text-xs">s/n (período abierto)</span> : `N° ${num}`}
        </span>
        <span className="text-xs whitespace-nowrap">{fmtFecha(it.fecha)}</span>
        <span className="text-[10px] px-1.5 rounded bg-white text-naranja-dark font-bold uppercase">Resumen</span>
        <span className="text-sm flex-1 min-w-[160px]">{it.glosa}</span>
        {!it.cuadra && <span className="text-[10px] px-1.5 rounded bg-rojo-light text-rojo font-bold uppercase">No cuadra</span>}
        <button type="button" className="text-xs text-azul underline whitespace-nowrap"
          onClick={() => onVerDetalle(it.periodo_desde, it.periodo_hasta)}
          title="Ver los asientos uno por uno en ese período">
          Ver detalle
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[560px]">
          <tbody>
            {it.lineas.map((l, i) => (
              <tr key={`${l.cuenta_id}-${l.debe > 0 ? 'd' : 'h'}-${i}`} className="border-t border-gris">
                <td className={`px-3 py-1 text-xs ${l.haber > 0 ? 'pl-10' : ''}`}>
                  <span className="font-mono">{l.cuenta_codigo}</span> {l.cuenta_nombre}
                </td>
                <td className="px-3 py-1 text-xs text-right font-mono tabular-nums w-[140px]">{fmtN(l.debe)}</td>
                <td className="px-3 py-1 text-xs text-right font-mono tabular-nums w-[140px]">{fmtN(l.haber)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}
