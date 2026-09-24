'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Combobox } from '@/components/ui/Combobox'
import { Pagination } from '@/components/ui/Pagination'
import { useCuentas, useMayor, useObrasCtb } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, fmtN, mesActual, naturalezaLabel, numeroAsiento, rubroLabel, saldoDA } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Campo, Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Th, Vacio } from './Comun'
import { SelectorCuenta } from './SelectorCuenta'
import { SelectorAuxiliar } from './SelectorAuxiliar'
import { useVisorAsiento } from './VisorAsiento'

const PAGE_SIZE = 500

/**
 * Mayor de una cuenta: saldo anterior (desde el inicio del ejercicio), los
 * movimientos del rango con el saldo corriente (calculado en el server sobre
 * TODO el rango, después se pagina) y el saldo final. Una cuenta título suma
 * sus subcuentas.
 *
 * La cuenta y el rango viven en la URL (`?tab=mayor&cuenta_id=&desde=&hasta=`):
 * sumas y saldos linkea acá y el link se puede compartir.
 */
export function MayorTab() {
  const router = useRouter()
  const sp = useSearchParams()
  const mes = mesActual()
  const cuentaId = sp.get('cuenta_id') ?? ''
  const desde = sp.get('desde') ?? mes.desde
  const hasta = sp.get('hasta') ?? mes.hasta

  const [obra, setObra] = useState('')
  const [aux, setAux] = useState({ id: '', nombre: '' })
  const [page, setPage] = useState(1)
  const visor = useVisorAsiento()

  const cuentasQ = useCuentas({ incluirInactivas: true })
  const cuenta = useMemo(() => (cuentasQ.data ?? []).find(c => String(c.id) === cuentaId), [cuentasQ.data, cuentaId])
  const obrasQ = useObrasCtb()

  function irA(p: { cuenta_id?: string; desde?: string; hasta?: string }) {
    const n = new URLSearchParams(sp.toString())
    n.set('tab', 'mayor')
    for (const [k, v] of Object.entries(p)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`/contabilidad?${n.toString()}`)
    setPage(1)
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useMayor({
    cuenta_id: cuentaId ? Number(cuentaId) : null, desde, hasta,
    obra_cod: obra || null, aux_id: aux.id ? Number(aux.id) : null, page, pageSize: PAGE_SIZE,
  })

  const opcionesObra = useMemo(() => (obrasQ.data ?? []).map(o => ({
    value: o.cod, label: `${o.cod} — ${o.nom}`, sub: o.archivada ? 'archivada' : undefined, search: [o.cod, o.nom],
  })), [obrasQ.data])

  const tipoAux = cuenta && cuenta.imputable && cuenta.auxiliar !== 'none' ? cuenta.auxiliar : null
  const esTitulo = data ? !data.cuenta.imputable : false

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 md:grid-cols-[minmax(260px,2fr)_150px_150px] gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <SelectorCuenta modo="todas" label="Cuenta" value={cuentaId}
              onChange={id => { setAux({ id: '', nombre: '' }); irA({ cuenta_id: id }) }} />
          </div>
          <RangoFechas desde={desde} hasta={hasta} onChange={r => irA(r)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Campo label="Obra" hint="opcional">
            <Combobox options={opcionesObra} value={obra} placeholder="Todas las obras" onChange={v => { setObra(v); setPage(1) }} />
          </Campo>
          {tipoAux && (
            <Campo label="Auxiliar" hint="opcional">
              <SelectorAuxiliar tipo={tipoAux} value={aux.id} nombre={aux.nombre}
                onChange={(id, nombre) => { setAux({ id, nombre }); setPage(1) }} />
            </Campo>
          )}
        </div>
      </Tarjeta>

      {!cuentaId ? <Vacio>Elegí una cuenta para ver su mayor.</Vacio>
        : isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : !data ? null
        : (
          <>
            <Tarjeta className="p-3">
              <div className="text-sm">
                <span className="font-mono font-bold text-azul">{data.cuenta.codigo}</span>{' '}
                <span className="font-semibold">{data.cuenta.nombre}</span>
                <span className="text-xs text-gris-dark"> · {rubroLabel(data.cuenta.rubro)} · naturaleza {naturalezaLabel(data.cuenta.naturaleza).toLowerCase()}</span>
                {esTitulo && <span className="text-xs text-gris-dark"> · cuenta título: suma sus subcuentas</span>}
              </div>
              <div className="text-xs text-gris-dark">Del {fmtFecha(data.desde)} al {fmtFecha(data.hasta)}</div>
            </Tarjeta>

            <div className="flex gap-2 flex-wrap">
              <Cifra label="Saldo anterior" valor={saldoDA(data.saldo_anterior)} sub="desde el inicio del ejercicio" />
              <Cifra label="Debe" valor={fmtM(data.total_debe)} />
              <Cifra label="Haber" valor={fmtM(data.total_haber)} />
              <Cifra label="Saldo final" valor={saldoDA(data.saldo_final)} tono="naranja" />
            </div>

            {data.total_movimientos === 0 ? (
              <Vacio>Sin movimientos en el rango.</Vacio>
            ) : (
              <Tarjeta className={`overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[820px]">
                    <thead>
                      <tr>
                        <Th>Fecha</Th><Th>Asiento</Th><Th>Detalle</Th>{esTitulo && <Th>Cuenta</Th>}<Th>Obra</Th>
                        <Th derecha>Debe</Th><Th derecha>Haber</Th><Th derecha>Saldo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {page === 1 && (
                        <tr className="border-t border-gris bg-blanco">
                          <td colSpan={esTitulo ? 7 : 6} className="px-3 py-1.5 text-xs text-gris-dark italic">Saldo anterior</td>
                          <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{saldoDA(data.saldo_anterior)}</td>
                        </tr>
                      )}
                      {data.items.map(m => (
                        <tr key={m.linea_id} onClick={() => visor.abrir(m.asiento_id)} className="border-t border-gris hover:bg-azul-light/30 cursor-pointer">
                          <td className="px-3 py-1.5 text-xs whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                          <td className="px-3 py-1.5 text-xs font-mono whitespace-nowrap">{numeroAsiento(m.numero)}</td>
                          <td className="px-3 py-1.5 text-xs">
                            {m.glosa_asiento}
                            {m.glosa && <span className="block text-[11px] text-gris-dark">{m.glosa}</span>}
                            {m.aux_nombre && <span className="block text-[11px] text-gris-dark">{m.aux_nombre}</span>}
                          </td>
                          {esTitulo && <td className="px-3 py-1.5 text-xs font-mono">{m.cuenta_codigo}</td>}
                          <td className="px-3 py-1.5 text-xs text-gris-dark">{m.obra_cod ?? ''}</td>
                          <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(m.debe)}</td>
                          <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(m.haber)}</td>
                          <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums font-semibold whitespace-nowrap">{saldoDA(m.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {!data.hasMore && (
                      <tfoot>
                        <tr className="border-t-2 border-gris-mid bg-blanco">
                          <td colSpan={esTitulo ? 5 : 4} className="px-3 py-2 text-xs font-bold text-gris-dark uppercase">Totales del rango</td>
                          <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.total_debe, '0,00')}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.total_haber, '0,00')}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{saldoDA(data.saldo_final)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Tarjeta>
            )}

            {data.total_movimientos > PAGE_SIZE && (
              <Pagination page={page} total={data.total_movimientos} pageSize={PAGE_SIZE} onChange={setPage} />
            )}
          </>
        )}

      {visor.modales}
    </div>
  )
}
