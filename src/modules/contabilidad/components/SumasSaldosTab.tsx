'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSumasSaldos } from '../hooks/useContabilidad'
import { fmtFecha, fmtN, mesActual } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { Campo, Cargando, ErrorCarga, RangoFechas, Tarjeta, Th, Vacio, inputCls } from './Comun'

/**
 * Balance de sumas y saldos del rango. Las cuentas título acumulan a sus
 * subcuentas; el nivel solo recorta lo que se muestra. Los totales son SOLO
 * de las imputables (si no, cada peso se contaría una vez por nivel). Click
 * en una cuenta → su mayor con el mismo rango.
 */
export function SumasSaldosTab() {
  const router = useRouter()
  const [rango, setRango] = useState(mesActual())
  const [nivel, setNivel] = useState<number | null>(null)
  const [sinMov, setSinMov] = useState(false)
  const { data, isLoading, isError, error, refetch, isFetching } = useSumasSaldos({
    desde: rango.desde, hasta: rango.hasta, nivel, incluirSinMovimiento: sinMov,
  })

  function verMayor(cuentaId: number) {
    const p = new URLSearchParams({ tab: 'mayor', cuenta_id: String(cuentaId), desde: rango.desde, hasta: rango.hasta })
    router.push(`/contabilidad?${p.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 grid grid-cols-2 md:grid-cols-[150px_150px_150px_1fr] gap-2 items-end">
        <RangoFechas desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <Campo label="Nivel">
          <select value={nivel ?? ''} onChange={e => setNivel(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>Hasta nivel {n}</option>)}
          </select>
        </Campo>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2">
          <input type="checkbox" className="accent-naranja" checked={sinMov} onChange={e => setSinMov(e.target.checked)} />
          Incluir cuentas sin movimiento
        </label>
      </Tarjeta>

      {!rango.desde || !rango.hasta ? <Vacio>Elegí el rango de fechas.</Vacio>
        : isLoading ? <Cargando />
        : isError ? <ErrorCarga mensaje={mensajeErrorCtb(error)} onReintentar={() => void refetch()} />
        : !data || data.items.length === 0 ? <Vacio>No hay movimientos entre el {fmtFecha(rango.desde)} y el {fmtFecha(rango.hasta)}.</Vacio>
        : (
          <Tarjeta className={`overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gris">
              <span className="text-xs text-gris-dark">Del {fmtFecha(data.desde)} al {fmtFecha(data.hasta)} · {data.items.length} cuentas</span>
              <span className={`text-[11px] px-2 py-0.5 rounded font-bold uppercase ${data.cuadra ? 'bg-verde-light text-verde' : 'bg-rojo-light text-rojo'}`}>
                {data.cuadra ? '✓ Cuadra' : 'No cuadra'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    <Th>Cuenta</Th><Th derecha>Saldo anterior</Th><Th derecha>Debe</Th><Th derecha>Haber</Th>
                    <Th derecha>Saldo deudor</Th><Th derecha>Saldo acreedor</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(f => (
                    <tr key={f.cuenta_id} onClick={() => verMayor(f.cuenta_id)} title="Ver el mayor de la cuenta"
                      className={`border-t border-gris hover:bg-azul-light/30 cursor-pointer ${f.imputable ? '' : 'font-bold bg-blanco'}`}>
                      <td className="px-3 py-1.5 text-xs" style={{ paddingLeft: `${12 + (f.nivel - 1) * 16}px` }}>
                        <span className="font-mono">{f.codigo}</span> {f.nombre}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(f.saldo_anterior)}</td>
                      <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(f.debe)}</td>
                      <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(f.haber)}</td>
                      <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(f.saldo_deudor)}</td>
                      <td className="px-3 py-1.5 text-xs text-right font-mono tabular-nums">{fmtN(f.saldo_acreedor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gris-mid bg-blanco">
                    <td className="px-3 py-2 text-xs font-bold text-gris-dark uppercase">Totales (cuentas imputables)</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.totales.saldo_anterior, '0,00')}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.totales.debe, '0,00')}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.totales.haber, '0,00')}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.totales.saldo_deudor, '0,00')}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono font-bold tabular-nums">{fmtN(data.totales.saldo_acreedor, '0,00')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Tarjeta>
        )}
    </div>
  )
}
