'use client'

import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { LiquidacionDetalle } from '@/types/sueldos.types'
import { useAsientoPropuesta } from '../../hooks/useSueldos'
import { fmtFecha, fmtM, fmtN, mensajeAvisoLiq, sumar } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Aviso, Cargando, ErrorCarga } from '../Comun'

/** Vista previa del asiento contable de la liquidación (no escribe nada). */
export function ModalAsientoPropuesta({ liquidacion: l, onClose }: { liquidacion: LiquidacionDetalle; onClose: () => void }) {
  const q = useAsientoPropuesta(l.id, true)
  const a = q.data
  return (
    <Modal open onClose={onClose} title={`Asiento · ${l.codigo}`} width="max-w-3xl"
      footer={<Button size="sm" variant="ghost" onClick={onClose}>Cerrar</Button>}>
      {q.isLoading ? <Cargando />
        : q.isError || !a ? <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />
        : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="text-xs text-gris-dark">
              {a.vigente ? 'Asiento generado' : 'Vista previa (todavía no se generó)'} · fecha {fmtFecha(a.fecha)} · {a.glosa} · {fmtM(a.importe)}
              {!a.periodo_abierto && ' · el período contable está cerrado'}
            </div>
            {a.motivos.map((m, i) => (
              <Aviso key={i} tono={m.codigo === 'SIN_MAPEO' ? 'naranja' : 'rojo'}>{mensajeAvisoLiq({ codigo: m.codigo, detalle: m.detalle })}</Aviso>
            ))}
            {a.motivos.some(m => m.codigo === 'SIN_MAPEO') && (
              <Link href="/contabilidad?tab=mapeos" className="text-xs text-azul font-semibold underline">Cargar los mapeos en Contabilidad › Mapeos (claves «sueldos.*»)</Link>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gris text-gris-dark text-[10px] uppercase">
                    <th className="text-left px-2 py-1.5">Cuenta</th>
                    <th className="text-left px-2 py-1.5 hidden sm:table-cell">Detalle</th>
                    <th className="text-right px-2 py-1.5">Debe</th>
                    <th className="text-right px-2 py-1.5">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {a.lineas.map((x, i) => (
                    <tr key={i} className="border-t border-gris">
                      <td className="px-2 py-1.5">
                        {x.cuenta_codigo ? <><span className="font-mono text-xs">{x.cuenta_codigo}</span> {x.cuenta_nombre}</> : <span className="text-naranja-dark font-bold">Sin cuenta (falta mapeo)</span>}
                        {x.obra_cod && <span className="text-[11px] text-gris-dark"> · {x.obra_cod}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gris-dark hidden sm:table-cell">{x.glosa}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{x.debe ? fmtN(x.debe) : ''}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{x.haber ? fmtN(x.haber) : ''}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gris-mid font-bold">
                    <td className="px-2 py-1.5" colSpan={2}>Totales</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtN(sumar(a.lineas.map(x => x.debe)))}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtN(sumar(a.lineas.map(x => x.haber)))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
    </Modal>
  )
}
