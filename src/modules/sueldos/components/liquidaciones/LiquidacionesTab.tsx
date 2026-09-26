'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Pagination } from '@/components/ui/Pagination'
import { usePermisos } from '@/hooks/usePermisos'
import type { EstadoLiquidacion, LiquidacionesFiltro, TipoLiquidacion } from '@/types/sueldos.types'
import { useConvenios, useLiquidaciones } from '../../hooks/useSueldos'
import { TIPO_LIQ_LABEL, fmtFecha, fmtM, fmtPeriodoLiq, mesAPeriodo } from '../../utils/sueldos.utils'
import { mensajeErrorSueldos } from '../../utils/sueldos.errores'
import { Campo, Cargando, ErrorCarga, EstadoLiq, Tarjeta, Td, Th, Vacio, inputCls } from '../Comun'
import { ModalNuevaLiquidacion } from './ModalNuevaLiquidacion'
import { LiquidacionDetalleView } from './LiquidacionDetalle'

/**
 * Lista de liquidaciones. `?liq=ID` abre el detalle (grilla de recibos),
 * así se puede compartir el link o volver con «atrás».
 */
export function LiquidacionesTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const liqId = Number(searchParams.get('liq')) || null

  if (liqId) {
    return <LiquidacionDetalleView id={liqId} onVolver={() => router.push('/sueldos?tab=liquidaciones')} />
  }
  return <ListaLiquidaciones onAbrir={id => router.push(`/sueldos?tab=liquidaciones&liq=${id}`)} />
}

function ListaLiquidaciones({ onAbrir }: { onAbrir: (id: number) => void }) {
  const { liquidar } = usePermisos('sueldos')
  const { data: convenios = [] } = useConvenios()
  const [filtro, setFiltro] = useState<LiquidacionesFiltro>({ estado: '', tipo: '' })
  const [desdeMes, setDesdeMes] = useState('')
  const [hastaMes, setHastaMes] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [nueva, setNueva] = useState(false)

  const f: LiquidacionesFiltro = {
    ...filtro,
    desde: desdeMes ? mesAPeriodo(desdeMes) : undefined,
    hasta: hastaMes ? mesAPeriodo(hastaMes) : undefined,
  }
  const q = useLiquidaciones(f, page, pageSize)
  const items = q.data?.items ?? []

  function cambiar(p: Partial<LiquidacionesFiltro>) {
    setFiltro(x => ({ ...x, ...p }))
    setPage(1)
  }

  return (
    <>
      <Tarjeta className="p-3 sm:p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Select label="Convenio" value={filtro.convenio_id ?? ''} placeholder="Todos"
            onChange={e => cambiar({ convenio_id: e.target.value ? Number(e.target.value) : null })}
            options={convenios.map(c => ({ value: c.id, label: c.nombre }))} />
          <Select label="Tipo" value={filtro.tipo ?? ''} placeholder="Todos"
            onChange={e => cambiar({ tipo: e.target.value as TipoLiquidacion | '' })}
            options={(Object.keys(TIPO_LIQ_LABEL) as TipoLiquidacion[]).map(t => ({ value: t, label: TIPO_LIQ_LABEL[t] }))} />
          <Select label="Estado" value={filtro.estado ?? ''} placeholder="Todos"
            onChange={e => cambiar({ estado: e.target.value as EstadoLiquidacion | '' })}
            options={[{ value: 'borrador', label: 'Borrador' }, { value: 'cerrada', label: 'Cerrada' }, { value: 'anulada', label: 'Anulada' }]} />
          <Campo label="Desde (mes)">
            <input type="month" className={inputCls} value={desdeMes} onChange={e => { setDesdeMes(e.target.value); setPage(1) }} />
          </Campo>
          <Campo label="Hasta (mes)">
            <input type="month" className={inputCls} value={hastaMes} onChange={e => { setHastaMes(e.target.value); setPage(1) }} />
          </Campo>
          <div className="flex md:justify-end">
            <Button className="w-full md:w-auto" disabled={!liquidar} onClick={() => setNueva(true)}
              title={liquidar ? 'Crear una liquidación (quincena, mes, SAC, vacaciones, final o ajuste)' : 'Hace falta el permiso «Liquidar sueldos»'}>
              + Nueva liquidación
            </Button>
          </div>
        </div>
      </Tarjeta>

      {q.isLoading ? <Cargando />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorSueldos(q.error)} onReintentar={() => q.refetch()} />
        : items.length === 0 ? <Vacio>No hay liquidaciones con esos filtros. Creá la primera con «+ Nueva liquidación».</Vacio>
        : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Liquidación</Th>
                  <Th>Período</Th>
                  <Th className="hidden md:table-cell">Pago</Th>
                  <Th derecha className="hidden sm:table-cell">Recibos</Th>
                  <Th derecha className="hidden lg:table-cell">Remunerativo</Th>
                  <Th derecha>Neto</Th>
                  <Th derecha className="hidden lg:table-cell">Costo total</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(l => (
                  <tr key={l.id} className="cursor-pointer hover:bg-naranja-light/40" onClick={() => onAbrir(l.id)}>
                    <Td>
                      <div className="font-semibold text-azul">{l.codigo}</div>
                      <div className="text-[11px] text-gris-dark">{l.convenio.nombre}</div>
                    </Td>
                    <Td>{fmtPeriodoLiq(l)}</Td>
                    <Td className="hidden md:table-cell">{fmtFecha(l.fecha_pago) || <span className="text-gris-dark">—</span>}</Td>
                    <Td derecha className="hidden sm:table-cell">{l.totales.recibos}</Td>
                    <Td derecha className="hidden lg:table-cell">{fmtM(l.totales.remunerativo)}</Td>
                    <Td derecha className="font-bold">{fmtM(l.totales.neto)}</Td>
                    <Td derecha className="hidden lg:table-cell">
                      {fmtM(l.totales.remunerativo + l.totales.no_remunerativo + l.totales.contribuciones + l.totales.fondo_cese)}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5 items-start">
                        <EstadoLiq estado={l.estado} />
                        {l.estado === 'cerrada' && !l.asiento_id && (
                          <span className="text-[10px] text-naranja-dark font-bold" title="Cerrada sin asiento contable: revisá los avisos">⚠ sin asiento</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2">
              <Pagination page={page} total={q.data?.total ?? 0} pageSize={pageSize} onChange={setPage}
                onPageSizeChange={s => { setPageSize(s); setPage(1) }} />
            </div>
          </Tarjeta>
        )}

      {nueva && <ModalNuevaLiquidacion onClose={() => setNueva(false)} onCreada={id => { setNueva(false); onAbrir(id) }} />}
    </>
  )
}
