'use client'

// Gasto interno: lo que CADINC gasta en sí misma.
//
// Existe por una razón concreta. El circuito para pedir materiales para el
// pañol siempre funcionó — es el mismo pedido que para cualquier obra — pero
// el número resultante estaba enterrado: la cuenta corriente muestra el chip
// "Gasto CADINC" con $79 millones, de los cuales el consumo interno real es
// el 5%; y quien carga esos pedidos (el pañolero) no tiene ni debería tener
// acceso a esa pantalla, porque ahí también está la deuda viva de todos los
// clientes.
//
// Así que esta pantalla es deliberadamente chica: abre en el mes en curso sin
// pedir que elijas nada, muestra una fila por mes, y separa las herramientas
// del consumo porque una amoladora no es un gasto del mes, es algo que queda.

import { useMemo, useState } from 'react'
import { useGastoInternoResumen, useGastoInternoRenglones, type CuentaFiltro } from '../hooks/useCuentaCorriente'
import { useObrasTodas } from '@/modules/tarja/hooks/useObras'
import { RenglonesTabla } from './cuenta-corriente/RenglonesTabla'
import { fmtM, fmtMes } from './cuenta-corriente/cuentaCorriente.utils'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'

const PAGE = 50

/** Primer día del mes de una fecha ISO, para el filtro por defecto. */
function primerDiaDelMes(hoy: Date): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

type Periodo = 'mes' | 'anio' | 'todo'

export function GastoInternoTab() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [obraCod, setObraCod] = useState<string>('')
  const [q, setQ]             = useState('')
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [page, setPage]       = useState(1)

  const { obras } = useObrasTodas('certificaciones')
  const centros = useMemo(
    () => obras.filter(o => o.es_interna).sort((a, b) => a.nom.localeCompare(b.nom)),
    [obras])

  // El desde se calcula una sola vez por render y no depende de nada que
  // cambie: `new Date()` acá es la fecha de hoy, no un estado.
  const desde = useMemo(() => {
    const hoy = new Date()
    if (periodo === 'mes')  return primerDiaDelMes(hoy)
    if (periodo === 'anio') return `${hoy.getFullYear()}-01-01`
    return undefined
  }, [periodo])

  const filtro: CuentaFiltro = useMemo(() => ({
    obra_cod:   obraCod || undefined,
    desde,
    q:          q.trim() || undefined,
    sin_precio: soloSinPrecio || undefined,
    // Los centros internos no se archivan, pero si alguno se archivara su
    // gasto histórico tiene que seguir contando: es plata que ya salió.
    archivadas: true,
  }), [obraCod, desde, q, soloSinPrecio])

  const resumen   = useGastoInternoResumen(filtro, 'mes')
  const renglones = useGastoInternoRenglones(filtro, page, PAGE)

  // Una fila por mes: materiales y EPP salen del ledger (v_cuenta_corriente),
  // las herramientas de su propia RPC porque el ledger las excluye a propósito.
  const filas = useMemo(() => {
    const por = new Map<string, { material: number; epp: number; herr: number; renglones: number; sinPrecio: number }>()
    const fila = (mes: string) => {
      let f = por.get(mes)
      if (!f) { f = { material: 0, epp: 0, herr: 0, renglones: 0, sinPrecio: 0 }; por.set(mes, f) }
      return f
    }
    for (const g of resumen.data?.grupos ?? []) {
      const f = fila(g.grupo)
      if (g.tipo === 'epp') f.epp += g.total; else f.material += g.total
      f.renglones += g.renglones
      f.sinPrecio += g.sin_precio
    }
    for (const h of resumen.data?.herramientas ?? []) {
      if (obraCod && h.obra_cod !== obraCod) continue
      fila(h.mes).herr += h.total
    }
    return [...por.entries()]
      .map(([mes, v]) => ({ mes, ...v, consumo: v.material + v.epp }))
      .sort((a, b) => b.mes.localeCompare(a.mes))
  }, [resumen.data, obraCod])

  const tot = useMemo(() => filas.reduce((a, f) => ({
    consumo:   a.consumo + f.consumo,
    material:  a.material + f.material,
    epp:       a.epp + f.epp,
    herr:      a.herr + f.herr,
    sinPrecio: a.sinPrecio + f.sinPrecio,
  }), { consumo: 0, material: 0, epp: 0, herr: 0, sinPrecio: 0 }), [filas])

  const cargando = resumen.isLoading && !resumen.data
  const th = (extra = '') => `px-3 py-2 text-[11px] font-bold text-gris-dark uppercase tracking-wider ${extra}`
  const td = (extra = '') => `px-3 py-2 ${extra}`

  return (
    <div className="space-y-4">
      {/* Filtros — el mes en curso ya viene puesto, no hay que elegir nada para ver algo. */}
      <div className="bg-white rounded-xl p-3 shadow-sm flex flex-wrap gap-2 items-end">
        <Select label="Período" value={periodo}
          onChange={e => { setPeriodo(e.target.value as Periodo); setPage(1) }}
          className="min-w-[150px]"
          options={[
            { value: 'mes',  label: 'Este mes' },
            { value: 'anio', label: 'Este año' },
            { value: 'todo', label: 'Todo' },
          ]} />
        <Select label="Centro" value={obraCod}
          onChange={e => { setObraCod(e.target.value); setPage(1) }}
          className="min-w-[190px]"
          options={[
            { value: '', label: 'Todos los centros' },
            ...centros.map(o => ({ value: o.cod, label: o.nom })),
          ]} />
        <Input label="Buscar" placeholder="Material, proveedor, pedido…"
          value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gris-dark pb-2 cursor-pointer select-none">
          <input type="checkbox" checked={soloSinPrecio}
            onChange={e => { setSoloSinPrecio(e.target.checked); setPage(1) }} />
          Solo sin precio
        </label>
      </div>

      {/* Los totales. El consumo y el patrimonio van separados a propósito. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Consumo"     valor={tot.consumo} acento="azul"
             hint="Materiales + EPP: se gastó y no vuelve" />
        <Kpi label="Materiales"  valor={tot.material} acento="gris" />
        <Kpi label="EPP"         valor={tot.epp} acento="gris"
             hint="Ropa y protección personal" />
        <Kpi label="Herramientas" valor={tot.herr} acento="verde"
             hint="Patrimonio: queda en el pañol, no es consumo del mes. Por eso no suma al total de arriba." />
      </div>

      {tot.sinPrecio > 0 && (
        <button
          onClick={() => { setSoloSinPrecio(true); setPage(1) }}
          className="w-full text-left bg-amarillo-light border border-amarillo rounded-xl px-4 py-2.5 text-sm text-[#7A5500] hover:opacity-90 transition-opacity">
          ⚠ <strong>{tot.sinPrecio}</strong> {tot.sinPrecio === 1 ? 'renglón' : 'renglones'} sin precio.
          El gasto real es más alto que lo que muestra esta pantalla. <u>Verlos</u>
        </button>
      )}

      {/* Mes por mes */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gris-mid">
          <h3 className="font-display text-lg text-azul">POR MES</h3>
        </div>
        {cargando ? (
          <div className="px-4 py-8 text-center text-sm text-gris-dark italic">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gris-dark italic">
            No hay gasto interno en este período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="bg-gris">
                  <th className={th('text-left')}>Mes</th>
                  <th className={th('text-right')}>Materiales</th>
                  <th className={th('text-right')}>EPP</th>
                  <th className={th('text-right')}>Consumo</th>
                  <th className={th('text-right')}>Herramientas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.mes} className="border-t border-gris hover:bg-gris/40">
                    <td className={td('font-semibold text-azul')}>{fmtMes(f.mes)}</td>
                    <td className={td('text-right font-mono tabular-nums')}>{fmtM(f.material)}</td>
                    <td className={td('text-right font-mono tabular-nums text-gris-dark')}>{f.epp ? fmtM(f.epp) : '—'}</td>
                    <td className={td('text-right font-mono tabular-nums font-bold')}>{fmtM(f.consumo)}</td>
                    <td className={td('text-right font-mono tabular-nums text-verde')}>{f.herr ? fmtM(f.herr) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gris-mid bg-gris/60 font-bold">
                  <td className={td('text-azul')}>Total</td>
                  <td className={td('text-right font-mono tabular-nums')}>{fmtM(tot.material)}</td>
                  <td className={td('text-right font-mono tabular-nums')}>{tot.epp ? fmtM(tot.epp) : '—'}</td>
                  <td className={td('text-right font-mono tabular-nums')}>{fmtM(tot.consumo)}</td>
                  <td className={td('text-right font-mono tabular-nums text-verde')}>{tot.herr ? fmtM(tot.herr) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* El detalle, para cuando el número de arriba sorprende */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gris-mid flex items-center justify-between">
          <h3 className="font-display text-lg text-azul">DETALLE</h3>
          <span className="text-xs text-gris-dark">
            {renglones.data?.total ?? 0} renglones
          </span>
        </div>
        {renglones.isLoading && !renglones.data ? (
          <div className="px-4 py-8 text-center text-sm text-gris-dark italic">Cargando…</div>
        ) : (
          <>
            <RenglonesTabla
              items={renglones.data?.items ?? []}
              mostrarObra={!obraCod}
              vacio="No hay renglones con estos filtros."
            />
            <Pagination
              page={page}
              pageSize={PAGE}
              total={renglones.data?.total ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, valor, acento, hint }: {
  label: string; valor: number; acento: 'azul' | 'gris' | 'verde'; hint?: string
}) {
  const borde = acento === 'azul' ? 'border-azul' : acento === 'verde' ? 'border-verde' : 'border-gris-mid'
  const color = acento === 'azul' ? 'text-azul' : acento === 'verde' ? 'text-verde' : 'text-carbon'
  return (
    <div className={`bg-white rounded-xl border-l-4 ${borde} p-3 shadow-sm`} title={hint}>
      <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wider">{label}</div>
      <div className={`font-mono tabular-nums font-bold text-lg ${color}`}>{fmtM(valor)}</div>
      {hint && <div className="text-[10px] text-gris-dark mt-0.5 leading-tight">{hint}</div>}
    </div>
  )
}
