'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import type { CtbDiarioModo } from '@/types/contabilidad.types'
import { esDiarioResumido, fetchDiarioCompleto, itemsDiario, useDiario, useEjercicios } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, fmtN, mesActual, numeroAsiento, tipoAsientoLabel } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { ejercicioTexto, ejerciciosDelRango } from '../utils/excelContable'
import { exportarDiario } from '../utils/exportarDiario'
import { Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Vacio } from './Comun'
import { DiarioResumenCard } from './DiarioResumenCard'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 50

const MODOS: { key: CtbDiarioModo; label: string; hint: string }[] = [
  { key: 'detallado', label: 'Detallado',          hint: 'Un asiento por comprobante, con auxiliares y obra' },
  { key: 'dia',       label: 'Resumido por día',   hint: 'Los automáticos se agrupan por circuito y día; los manuales van uno por uno' },
  { key: 'mes',       label: 'Resumido por mes',   hint: 'Los automáticos se agrupan por circuito y mes; los manuales van uno por uno' },
]

function modoDe(v: string | null): CtbDiarioModo {
  return v === 'dia' || v === 'mes' ? v : 'detallado'
}

/**
 * Libro diario: los asientos CONFIRMADOS del rango. En modo detallado, cada
 * asiento con sus líneas; resumido, los automáticos agrupados por circuito
 * (Ventas, Cobros, Compras, Pagos) y período, que es lo que se rubrica. Los
 * totales son de todo el rango, no de la página. Mientras el período está
 * abierto los asientos no tienen número: se numeran al cerrarlo.
 */
export function DiarioTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [rango, setRango] = useState(mesActual())
  const [modo, setModoState] = useState<CtbDiarioModo>(() => modoDe(searchParams.get('modo')))
  const [page, setPage] = useState(1)
  const [exportando, setExportando] = useState(false)
  const visor = useVisorAsiento()
  const ejercicios = useEjercicios()
  const { data, isLoading, isError, error, refetch, isFetching } = useDiario(rango.desde, rango.hasta, modo, page, PAGE_SIZE)

  function setModo(m: CtbDiarioModo) {
    setModoState(m)
    setPage(1)
    const p = new URLSearchParams(searchParams.toString())
    if (m === 'detallado') p.delete('modo')
    else p.set('modo', m)
    router.replace(`/contabilidad?${p.toString()}`)
  }

  const cuadra = data ? Math.round(data.total_debe * 100) === Math.round(data.total_haber * 100) : true
  const items = data ? itemsDiario(data) : []
  const resumido = data ? esDiarioResumido(data) : false
  // Un backend viejo ignora `modo` y devuelve el detallado.
  const totalPaginable = data ? (esDiarioResumido(data) ? data.total_items : data.total_asientos) : 0

  async function exportar() {
    if (!rango.desde || !rango.hasta) return
    setExportando(true)
    try {
      const todo = await fetchDiarioCompleto(rango.desde, rango.hasta, modo)
      exportarDiario({
        items: todo.items, totales: todo, modo, desde: rango.desde, hasta: rango.hasta,
        ejercicio: ejercicioTexto(ejerciciosDelRango(ejercicios.data ?? [], rango.desde, rango.hasta)),
      })
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    } finally {
      setExportando(false)
    }
  }

  const bloqueoExport = !rango.desde || !rango.hasta ? 'Elegí el rango de fechas'
    : !data || data.total_asientos === 0 ? 'No hay asientos en el rango'
    : null

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 md:grid-cols-[160px_160px_1fr_auto] gap-2 items-end">
          <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={r => { setRango(r); setPage(1) }} />
          <div className="col-span-2 md:col-span-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Forma del diario">
            {MODOS.map(m => (
              <button key={m.key} type="button" role="radio" aria-checked={modo === m.key} title={m.hint}
                onClick={() => setModo(m.key)}
                className={`text-xs px-2.5 py-1.5 rounded-full border ${modo === m.key ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={exportar} loading={exportando}
            disabled={!!bloqueoExport || exportando} title={bloqueoExport ?? 'Bajar el libro diario de este rango en Excel, con el encabezado para rubricar'}>
            📥 Exportar Excel
          </Button>
        </div>
      </Tarjeta>

      {!rango.desde || !rango.hasta ? <Vacio>Elegí el rango de fechas.</Vacio>
        : isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : !data || data.total_asientos === 0 ? <Vacio>No hay asientos confirmados entre el {fmtFecha(rango.desde)} y el {fmtFecha(rango.hasta)}.</Vacio>
        : (
          <>
            <div className="flex gap-2 flex-wrap">
              <Cifra label="Asientos" valor={String(data.total_asientos)}
                sub={resumido && esDiarioResumido(data) ? `${data.total_items} renglones del libro` : undefined} />
              <Cifra label="Total Debe" valor={fmtM(data.total_debe)} />
              <Cifra label="Total Haber" valor={fmtM(data.total_haber)} />
              <Cifra label="Control" valor={cuadra ? '✓ Cuadra' : 'No cuadra'} tono={cuadra ? 'verde' : 'rojo'}
                sub={cuadra ? undefined : `diferencia ${fmtM(Math.abs(data.total_debe - data.total_haber))}`} />
            </div>

            <div className={`flex flex-col gap-2 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map(it => it.clase === 'resumen' ? (
                <DiarioResumenCard key={it.clave} it={it}
                  onVerDetalle={(d, h) => { setRango({ desde: d, hasta: h }); setModo('detallado') }} />
              ) : (
                <Tarjeta key={it.id} className="overflow-hidden">
                  <button type="button" onClick={() => visor.abrir(it.id)}
                    className="w-full text-left px-3 py-2 bg-azul-light/40 hover:bg-azul-light flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-bold text-sm text-azul whitespace-nowrap">
                      {it.numero ? numeroAsiento(it.numero) : <span className="text-gris-dark font-normal text-xs">s/n (período abierto)</span>}
                    </span>
                    <span className="text-xs whitespace-nowrap">{fmtFecha(it.fecha)}</span>
                    {it.tipo !== 'manual' && <span className="text-[10px] px-1.5 rounded bg-white text-azul font-bold uppercase">{tipoAsientoLabel(it.tipo)}</span>}
                    <span className="text-sm flex-1 min-w-[160px]">{it.glosa}</span>
                  </button>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse min-w-[560px]">
                      <tbody>
                        {it.lineas.map(l => (
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

            {totalPaginable > PAGE_SIZE && (
              <Pagination page={page} total={totalPaginable} pageSize={PAGE_SIZE} onChange={setPage} />
            )}
          </>
        )}

      {visor.modales}
    </div>
  )
}
