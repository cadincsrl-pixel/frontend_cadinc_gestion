'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useBalance, useEjercicios, useEstadoResultados } from '../hooks/useContabilidad'
import { fmtM, hoyAR } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { exportarBalance, exportarResultados } from '../utils/exportarEstados'
import { BalanceView } from './BalanceView'
import { ResultadosView } from './ResultadosView'
import { Campo, Cargando, Cifra, ErrorCarga, RangoFechas, Tarjeta, Vacio, inputCls } from './Comun'

type Vista = 'balance' | 'resultados'

const NIVELES = [1, 2, 3, 4, 5] as const

/**
 * Estados contables: situación patrimonial a una fecha y resultados de un
 * rango (con comparativo por mes). La vista vive en la URL (`?vista=`) para
 * poder linkearla. Todo se calcula en el server; el Excel sale de lo mismo
 * que se ve.
 */
export function EstadosTab() {
  const router = useRouter()
  const sp = useSearchParams()
  const toast = useToast()
  const vista: Vista = sp.get('vista') === 'resultados' ? 'resultados' : 'balance'
  const ejercicios = useEjercicios()
  const hoy = hoyAR()

  // Inicio del ejercicio que contiene hoy (o el más reciente).
  const inicioEjercicio = useMemo(() => {
    const lista = ejercicios.data ?? []
    return (lista.find(e => e.desde <= hoy && hoy <= e.hasta) ?? lista[0])?.desde ?? ''
  }, [ejercicios.data, hoy])

  const [fecha, setFecha] = useState(hoy)
  const [nivelB, setNivelB] = useState(3)
  const [ceroB, setCeroB] = useState(false)
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null)
  const [nivelR, setNivelR] = useState(4)
  const [comparativo, setComparativo] = useState(false)
  const [ceroR, setCeroR] = useState(false)
  const rangoEf = rango ?? { desde: inicioEjercicio, hasta: hoy }

  const balance = useBalance({ fecha: vista === 'balance' ? fecha : '', nivel: nivelB, incluirCero: ceroB })
  const resultados = useEstadoResultados({
    desde: vista === 'resultados' ? rangoEf.desde : '', hasta: rangoEf.hasta, nivel: nivelR, comparativo, incluirCero: ceroR,
  })

  function setVista(v: Vista) {
    const p = new URLSearchParams(sp.toString())
    p.set('vista', v)
    router.replace(`/contabilidad?${p.toString()}`)
  }

  function exportar() {
    try {
      if (vista === 'balance' && balance.data) exportarBalance(balance.data)
      if (vista === 'resultados' && resultados.data) exportarResultados(resultados.data)
    } catch (e) {
      toast(mensajeErrorCtb(e), 'err')
    }
  }
  const hayDatos = vista === 'balance' ? !!balance.data : !!resultados.data

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="tablist" aria-label="Estado contable">
        {([['balance', 'Situación patrimonial'], ['resultados', 'Estado de resultados']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`text-sm px-3 py-1.5 rounded-full border ${vista === k ? 'bg-azul text-white border-azul' : 'bg-white border-gris-mid text-azul'}`}>
            {label}
          </button>
        ))}
      </div>

      <Tarjeta className="p-3 flex flex-wrap gap-3 items-end">
        {vista === 'balance' ? (
          <>
            <Campo label="Al">
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Nivel">
              <select value={nivelB} onChange={e => setNivelB(Number(e.target.value))} className={inputCls}>
                {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-1.5 text-xs pb-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-naranja" checked={ceroB} onChange={e => setCeroB(e.target.checked)} />
              Incluir cuentas en cero
            </label>
          </>
        ) : (
          <>
            <RangoFechas desde={rangoEf.desde} hasta={rangoEf.hasta} onChange={setRango} />
            <Campo label="Nivel">
              <select value={nivelR} onChange={e => setNivelR(Number(e.target.value))} className={inputCls}>
                {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-1.5 text-xs pb-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-naranja" checked={comparativo} onChange={e => setComparativo(e.target.checked)} />
              Comparativo por mes
            </label>
            <label className="flex items-center gap-1.5 text-xs pb-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-naranja" checked={ceroR} onChange={e => setCeroR(e.target.checked)} />
              Incluir cuentas en cero
            </label>
          </>
        )}
        <Button variant="secondary" size="sm" className="ml-auto" onClick={exportar} disabled={!hayDatos}
          title={hayDatos ? 'Bajar este estado en Excel, con el encabezado para rubricar' : 'Todavía no hay datos para exportar'}>
          📥 Exportar Excel
        </Button>
      </Tarjeta>

      {vista === 'balance' ? (
        !fecha ? <Vacio>Elegí la fecha.</Vacio>
          : balance.isLoading ? <Cargando />
          : balance.isError ? <ErrorCarga mensaje={mensajeErrorCtb(balance.error)} onReintentar={() => void balance.refetch()} />
          : !balance.data ? null
          : (
            <div className={`flex flex-col gap-3 ${balance.isFetching ? 'opacity-70' : ''}`}>
              <div className="flex gap-2 flex-wrap">
                <Cifra label="Activo" valor={fmtM(balance.data.activo.total)} />
                <Cifra label="Pasivo" valor={fmtM(balance.data.pasivo.total)} />
                <Cifra label="Patrimonio neto" valor={fmtM(balance.data.pn.total)}
                  sub={`incluye resultado del ejercicio ${fmtM(balance.data.pn.resultado_ejercicio)}`} />
                <Cifra label="Control" valor={balance.data.cuadra ? '✓ Cuadra' : 'No cuadra'} tono={balance.data.cuadra ? 'verde' : 'rojo'} />
              </div>
              <BalanceView res={balance.data} />
            </div>
          )
      ) : (
        !rangoEf.desde || !rangoEf.hasta ? <Vacio>Elegí el rango de fechas.</Vacio>
          : resultados.isLoading ? <Cargando />
          : resultados.isError ? <ErrorCarga mensaje={mensajeErrorCtb(resultados.error)} onReintentar={() => void resultados.refetch()} />
          : !resultados.data ? null
          : (
            <div className={`flex flex-col gap-3 ${resultados.isFetching ? 'opacity-70' : ''}`}>
              <div className="flex gap-2 flex-wrap">
                <Cifra label="Ingresos" valor={fmtM(resultados.data.ingresos.total)} />
                <Cifra label="Gastos" valor={fmtM(resultados.data.gastos.total)} />
                <Cifra label="Resultado" valor={fmtM(resultados.data.resultado.total)}
                  tono={resultados.data.resultado.total >= 0 ? 'verde' : 'rojo'}
                  sub={resultados.data.resultado.total >= 0 ? 'ganancia' : 'pérdida'} />
              </div>
              <ResultadosView res={resultados.data} />
            </div>
          )
      )}
    </div>
  )
}
