'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import type { Recibo } from '@/types/sueldos.types'
import { useConvenios, useLiquidacionConLineas, useLiquidaciones } from '../../hooks/useSueldos'
import { fmtFecha, fmtM, fmtPeriodoLiq, sumar } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { descargarRecibosPdf, liqParaRecibo } from '../../utils/reciboPdf'
import { Aviso, Cargando, Check, ErrorCarga, EstadoLiq, EstadoRec, Tarjeta, Td, Th, Vacio } from '../Comun'

/**
 * Recibos en PDF (formato Decreto 407/2026). Se elige la liquidación y se
 * bajan de a uno, los tildados o todos juntos en un solo PDF (uno por hoja).
 * «Con duplicado» imprime dos ejemplares de cada uno: original para CADINC y
 * duplicado para el trabajador. `?liq=ID` preselecciona la liquidación.
 */
export function RecibosTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const { data: convenios = [] } = useConvenios()
  const [convenioId, setConvenioId] = useState<number | null>(null)
  const liqs = useLiquidaciones({ convenio_id: convenioId }, 1, 100)
  const liqId = Number(searchParams.get('liq')) || null
  const liq = useLiquidacionConLineas(liqId, !!liqId)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [duplicado, setDuplicado] = useState(false)

  const recibos = useMemo(() => liq.data?.recibos ?? [], [liq.data])
  const cct = convenios.find(c => c.id === liq.data?.convenio_id)?.cct

  function elegirLiq(v: string) {
    setElegidos(new Set())
    router.replace(v ? `/sueldos?tab=recibos&liq=${v}` : '/sueldos?tab=recibos')
  }

  function bajar(lista: Recibo[]) {
    if (!liq.data) return
    if (lista.length === 0) { toast('No hay recibos elegidos', 'warn'); return }
    try {
      descargarRecibosPdf(lista, liqParaRecibo(liq.data, cct), { duplicado })
    } catch (e) {
      toast(mensajeErrorSueldos(e), 'err')
    }
  }

  function alternar(id: number) {
    setElegidos(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const todosTildados = recibos.length > 0 && recibos.every(r => elegidos.has(r.legajo_id))

  return (
    <>
      <Tarjeta className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <Select label="Convenio" value={convenioId ?? ''} placeholder="Todos"
            onChange={e => setConvenioId(e.target.value ? Number(e.target.value) : null)}
            options={convenios.map(c => ({ value: c.id, label: c.nombre }))} />
          <div className="md:col-span-2">
            <Select label="Liquidación" value={liqId ?? ''} placeholder={liqs.isLoading ? 'Cargando…' : 'Elegí la liquidación'}
              onChange={e => elegirLiq(e.target.value)}
              options={(liqs.data?.items ?? []).map(x => ({
                value: x.id,
                label: `${x.codigo} · ${x.convenio.nombre} · ${fmtPeriodoLiq(x)} · ${x.totales.recibos} recibos${x.estado !== 'cerrada' ? ` (${x.estado})` : ''}`,
              }))} />
          </div>
        </div>
        <Check checked={duplicado} onChange={setDuplicado} label="Con duplicado (original para el empleador y duplicado para el trabajador)" />
      </Tarjeta>

      {!liqId ? <Vacio>Elegí una liquidación para ver e imprimir sus recibos.</Vacio>
        : liq.isLoading ? <Cargando texto="Cargando los recibos…" />
        : liq.isError || !liq.data ? <ErrorCarga mensaje={mensajeErrorSueldos(liq.error)} onReintentar={() => liq.refetch()} />
        : (
          <>
            <Tarjeta className="p-3 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <b className="text-azul">{liq.data.codigo}</b> <EstadoLiq estado={liq.data.estado} />
                </div>
                <div className="text-xs text-gris-dark">
                  {liq.data.convenio.nombre} · {fmtPeriodoLiq(liq.data)}{liq.data.fecha_pago ? ` · pago ${fmtFecha(liq.data.fecha_pago)}` : ''} · neto {fmtM(liq.data.totales.neto)}
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={elegidos.size === 0}
                title={elegidos.size === 0 ? 'Tildá los recibos que querés imprimir' : 'Un PDF con los tildados'}
                onClick={() => bajar(recibos.filter(r => elegidos.has(r.legajo_id)))}>🖨 PDF de los tildados ({elegidos.size})</Button>
              <Button size="sm" disabled={recibos.length === 0} onClick={() => bajar(recibos)}>🖨 PDF de todos ({recibos.length})</Button>
            </Tarjeta>
            {liq.data.estado === 'borrador' && (
              <Aviso tono="amarillo">La liquidación está en borrador: los recibos salen con la marca «BORRADOR — NO VÁLIDO». Cerrala para imprimir los definitivos.</Aviso>
            )}
            {liq.data.estado === 'anulada' && <Aviso tono="rojo">La liquidación está anulada: los recibos salen con la marca «ANULADA».</Aviso>}
            {recibos.length === 0 ? <Vacio>Esta liquidación no tiene recibos.</Vacio> : (
              <Tarjeta className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th className="w-8">
                        <input type="checkbox" className="accent-naranja" checked={todosTildados} aria-label="Tildar todos"
                          onChange={e => setElegidos(e.target.checked ? new Set(recibos.map(r => r.legajo_id)) : new Set())} />
                      </Th>
                      <Th>Empleado</Th>
                      <Th derecha className="hidden sm:table-cell">Bruto</Th>
                      <Th derecha className="hidden sm:table-cell">Descuentos</Th>
                      <Th derecha>Neto</Th>
                      <Th>Estado</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {recibos.map(r => (
                      <tr key={r.id}>
                        <Td><input type="checkbox" className="accent-naranja" checked={elegidos.has(r.legajo_id)} onChange={() => alternar(r.legajo_id)} aria-label={`Tildar ${r.legajo.nombre}`} /></Td>
                        <Td>
                          <div className="font-semibold">{r.snapshot?.legajo?.nombre_mostrar ?? r.legajo.nombre}</div>
                          <div className="text-[11px] text-gris-dark">{r.legajo.categoria_nombre ?? ''}{r.legajo.incompleto ? ' · ficha incompleta' : ''}</div>
                        </Td>
                        <Td derecha className="hidden sm:table-cell">{fmtM(sumar([r.total_remunerativo, r.total_no_remunerativo]))}</Td>
                        <Td derecha className="hidden sm:table-cell">{fmtM(r.total_descuentos)}</Td>
                        <Td derecha className="font-bold">{fmtM(r.neto)}</Td>
                        <Td><EstadoRec estado={r.estado} /></Td>
                        <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => bajar([r])} title="Este recibo en PDF">🖨</Button></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tarjeta>
            )}
          </>
        )}
    </>
  )
}
