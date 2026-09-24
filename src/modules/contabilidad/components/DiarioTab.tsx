'use client'

import { useState } from 'react'
import { Pagination } from '@/components/ui/Pagination'
import { useDiario } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, fmtN, mesActual, numeroAsiento, tipoAsientoLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Vacio } from './Comun'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 50

/**
 * Libro diario: los asientos CONFIRMADOS del rango, en orden de fecha y
 * número, cada uno con sus líneas. Paginado por asiento (nunca parte uno).
 * Los totales son de todo el rango, no de la página. Mientras el período está
 * abierto los asientos no tienen número: se numeran al cerrarlo.
 */
export function DiarioTab() {
  const mes = mesActual()
  const [rango, setRango] = useState(mes)
  const [page, setPage] = useState(1)
  const visor = useVisorAsiento()
  const { data, isLoading, isError, error, refetch, isFetching } = useDiario(rango.desde, rango.hasta, page, PAGE_SIZE)

  const cuadra = data ? Math.round(data.total_debe * 100) === Math.round(data.total_haber * 100) : true

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 grid grid-cols-2 md:grid-cols-[160px_160px_1fr] gap-2 items-end">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={r => { setRango(r); setPage(1) }} />
      </Tarjeta>

      {!rango.desde || !rango.hasta ? <Vacio>Elegí el rango de fechas.</Vacio>
        : isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : !data || data.total_asientos === 0 ? <Vacio>No hay asientos confirmados entre el {fmtFecha(rango.desde)} y el {fmtFecha(rango.hasta)}.</Vacio>
        : (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Asientos" valor={String(data.total_asientos)} />
              <Cifra label="Total Debe" valor={fmtM(data.total_debe)} />
              <Cifra label="Total Haber" valor={fmtM(data.total_haber)} />
              <Cifra label="Control" valor={cuadra ? '✓ Cuadra' : 'No cuadra'} tono={cuadra ? 'verde' : 'rojo'}
                sub={cuadra ? undefined : `diferencia ${fmtM(Math.abs(data.total_debe - data.total_haber))}`} />
            </div>

            <div className={`flex flex-col gap-2 ${isFetching ? 'opacity-70' : ''}`}>
              {data.items.map(a => (
                <Tarjeta key={a.id} className="overflow-hidden">
                  <button type="button" onClick={() => visor.abrir(a.id)}
                    className="w-full text-left px-3 py-2 bg-azul-light/40 hover:bg-azul-light flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-bold text-sm text-azul whitespace-nowrap">
                      {a.numero ? numeroAsiento(a.numero) : <span className="text-gris-dark font-normal text-xs">s/n (período abierto)</span>}
                    </span>
                    <span className="text-xs whitespace-nowrap">{fmtFecha(a.fecha)}</span>
                    {a.tipo !== 'manual' && <span className="text-[10px] px-1.5 rounded bg-white text-azul font-bold uppercase">{tipoAsientoLabel(a.tipo)}</span>}
                    <span className="text-sm flex-1 min-w-[160px]">{a.glosa}</span>
                  </button>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse min-w-[560px]">
                      <tbody>
                        {a.lineas.map(l => (
                          <tr key={l.id} className="border-t border-gris">
                            <td className={`px-3 py-1 text-xs ${l.haber > 0 ? 'pl-10' : ''}`}>
                              <span className="font-mono">{l.cuenta_codigo}</span> {l.cuenta_nombre}
                              {l.aux_nombre && <span className="text-gris-dark"> · {l.aux_nombre}</span>}
                              {l.obra_cod && <span className="text-gris-dark"> · {l.obra_cod}</span>}
                              {l.glosa && <span className="block text-[11px] text-gris-dark">{l.glosa}</span>}
                            </td>
                            <td className="px-3 py-1 text-xs text-right font-mono tabular-nums w-[140px]">{fmtN(l.debe)}</td>
                            <td className="px-3 py-1 text-xs text-right font-mono tabular-nums w-[140px]">{fmtN(l.haber)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              ))}
            </div>

            {data.total_asientos > PAGE_SIZE && (
              <Pagination page={page} total={data.total_asientos} pageSize={PAGE_SIZE} onChange={setPage} />
            )}
          </>
        )}

      {visor.modales}
    </div>
  )
}
