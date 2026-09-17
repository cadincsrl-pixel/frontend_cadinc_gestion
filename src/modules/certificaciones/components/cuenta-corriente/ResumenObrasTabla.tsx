'use client'

import { useMemo, useState } from 'react'
import type { ResumenObraFila } from '@/types/domain.types'
import { fmtM } from './cuentaCorriente.utils'

/**
 * Cuánto debe cada obra (17/09). Una fila por obra de cliente con las tres
 * patas — jornales, contratistas y materiales, cada una con su % adentro —,
 * el total, lo pagado, las notas de crédito y el saldo. Ordenada por saldo.
 *
 * Lo que NO muestra, a propósito: artículos. Para eso está el click en la
 * obra, o la vista por renglones.
 *
 * El régimen decide qué se suma. En una obra de PRESUPUESTO CERRADO los
 * jornales y los contratistas están adentro del precio pactado, así que van
 * en gris y no entran al total: sumarlos inflaría el saldo con plata que
 * nunca se va a cobrar. Se muestran igual porque son el costo real de la
 * obra, que es lo que uno mira al lado del presupuesto.
 *
 * POR CENTRO DE COSTO (mismo día, un rato después). "A veces el cliente le
 * gusta ir cubriendo por obra": ANIMAR paga sus cuatro clínicas con un solo
 * saldo, BRADEL sus farmacias. El centro de costo es `obras.cc` (normalizado
 * en 20260917l); agrupado, cada cliente con más de una obra lleva una fila
 * de subtotal y sus obras debajo, ordenadas por saldo — así se ve a la vez
 * cuánto debe el cliente y cuánto de eso es cada obra. Los clientes de una
 * sola obra no llevan subtotal: sería repetir la fila. Y el selector de
 * arriba deja quedarse con un solo cliente.
 */

interface Props {
  filas:        ResumenObraFila[]
  conTarja:     boolean
  onElegirObra: (cod: string) => void
}

const th = (right = false) =>
  `bg-gris text-gris-dark text-[10px] font-bold px-3 py-2 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`

function Monto({ n, bold = false, apagado = false, negativoRojo = false }: { n: number; bold?: boolean; apagado?: boolean; negativoRojo?: boolean }) {
  if (n === 0) return <td className="px-3 py-2 text-right font-mono text-xs"><span className="text-gris-mid">—</span></td>
  const color = negativoRojo && n < 0 ? 'text-rojo' : apagado ? 'text-gris-mid' : ''
  return <td className={`px-3 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums ${bold ? 'font-bold' : ''} ${color}`}>{fmtM(n)}</td>
}

/** Una pata con su %: "$1.234.567" y debajo "+35 %" o "al costo". */
function Pata({ p, parcial }: { p: ResumenObraFila['jornales']; parcial: boolean }) {
  if (parcial || !p) return <td className="px-3 py-2 text-right text-xs"><span className="text-gris-mid" title="Sin permiso para ver costos de tarja">sin acceso</span></td>
  if (p.facturable === 0) return <td className="px-3 py-2 text-right font-mono text-xs"><span className="text-gris-mid">—</span></td>
  const titulo = p.en_cuenta
    ? (p.pct == null ? 'Sin porcentaje cargado: al costo' : `Costo ${fmtM(p.costo)} + ${p.pct}%`)
    : `Costo, no se factura: está adentro del presupuesto`
  return (
    <td className={`px-3 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums ${p.en_cuenta ? '' : 'text-gris-mid'}`} title={titulo}>
      {fmtM(p.facturable)}
      <div className="text-[10px] font-sans leading-tight">
        {p.en_cuenta ? (p.pct == null ? <span className="text-naranja">al costo</span> : `+${p.pct}%`) : 'en el presupuesto'}
      </div>
    </td>
  )
}

interface Totales { total: number; pagado: number; notas: number; saldo: number; sin_precio: number }
const sumar = (fs: ResumenObraFila[]): Totales => fs.reduce((s, f) => ({
  total: s.total + f.total, pagado: s.pagado + f.pagado, notas: s.notas + f.notas, saldo: s.saldo + f.saldo,
  sin_precio: s.sin_precio + f.materiales.sin_precio,
}), { total: 0, pagado: 0, notas: 0, saldo: 0, sin_precio: 0 })

/** Los centros con sus obras, el que más debe primero; adentro, por saldo. */
function agruparPorCentro(filas: ResumenObraFila[]): { centro: string; obras: ResumenObraFila[]; tot: Totales }[] {
  const por = new Map<string, ResumenObraFila[]>()
  for (const f of filas) {
    const lista = por.get(f.centro_costo)
    if (lista) lista.push(f)
    else por.set(f.centro_costo, [f])
  }
  return [...por.entries()]
    .map(([centro, obras]) => ({ centro, obras: [...obras].sort((a, b) => b.saldo - a.saldo), tot: sumar(obras) }))
    .sort((a, b) => b.tot.saldo - a.tot.saldo || a.centro.localeCompare(b.centro))
}

function FilaObra({ f, onElegir, sangria }: { f: ResumenObraFila; onElegir: (cod: string) => void; sangria: boolean }) {
  return (
    <tr className="border-t border-gris hover:bg-azul-light/30 cursor-pointer" onClick={() => onElegir(f.obra_cod)}>
      <td className={`px-3 py-2 text-sm ${sangria ? 'pl-7' : ''}`}>
        <div className="font-semibold">{f.obra_nom}{f.archivada && <span className="ml-1 text-[10px] font-normal text-gris-dark uppercase">archivada</span>}</div>
        <div className="text-[11px] text-gris-dark font-mono">{f.obra_cod}{!sangria && f.centro_costo !== f.obra_nom && <span className="font-sans"> · {f.centro_costo}</span>}</div>
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {f.regimen === 'administracion'
          ? <span className="px-2 py-0.5 rounded bg-naranja-light text-naranja font-bold">por administración</span>
          : <span className="px-2 py-0.5 rounded bg-gris text-gris-dark">presupuesto cerrado</span>}
        {f.parcial && <div className="text-[10px] text-rojo mt-0.5">total parcial</div>}
      </td>
      <Pata p={f.jornales} parcial={f.parcial} />
      <Pata p={f.contratistas} parcial={f.parcial} />
      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums" title={f.materiales.pct ? `Costo ${fmtM(f.materiales.costo)} + ${f.materiales.pct}%` : undefined}>
        {f.materiales.facturable > 0 ? fmtM(f.materiales.facturable) : <span className="text-gris-mid">—</span>}
        {!!f.materiales.pct && <div className="text-[10px] font-sans leading-tight">+{f.materiales.pct}%</div>}
      </td>
      <Monto n={f.total} bold />
      <Monto n={f.pagado} />
      <Monto n={f.notas} />
      <Monto n={f.saldo} bold negativoRojo />
      <td className="px-3 py-2 text-right text-xs">
        {f.materiales.sin_precio > 0
          ? <span className="px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5500] font-bold" title="Renglones a cobrar sin precio: valen $0 en este total">{f.materiales.sin_precio}</span>
          : <span className="text-gris-mid">—</span>}
      </td>
    </tr>
  )
}

function FilaCentro({ centro, n, tot }: { centro: string; n: number; tot: Totales }) {
  return (
    <tr className="border-t-2 border-gris-mid bg-azul-light/40">
      <td className="px-3 py-2 text-sm font-bold" colSpan={5}>
        {centro} <span className="font-normal text-[11px] text-gris-dark">· {n} obras</span>
      </td>
      <Monto n={tot.total} bold />
      <Monto n={tot.pagado} bold />
      <Monto n={tot.notas} bold />
      <Monto n={tot.saldo} bold negativoRojo />
      <td className="px-3 py-2 text-right text-xs font-bold">{tot.sin_precio > 0 ? tot.sin_precio : ''}</td>
    </tr>
  )
}

export function ResumenObrasTabla({ filas, conTarja, onElegirObra }: Props) {
  const [agrupar, setAgrupar] = useState(true)
  const [centroSel, setCentroSel] = useState<string>('')

  const centros = useMemo(() => [...new Set(filas.map(f => f.centro_costo))].sort((a, b) => a.localeCompare(b)), [filas])
  const visibles = useMemo(() => centroSel ? filas.filter(f => f.centro_costo === centroSel) : filas, [filas, centroSel])
  const grupos = useMemo(() => agruparPorCentro(visibles), [visibles])
  const tot = sumar(visibles)
  const sinPct = visibles.filter(f => f.sin_pct)
  const hayArchivadas = visibles.some(f => f.archivada)

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-bold text-gris-dark uppercase tracking-wider">
          Cuánto debe cada {centroSel ? 'obra de ' + centroSel : agrupar ? 'cliente' : 'obra'}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={centroSel}
            onChange={e => setCentroSel(e.target.value)}
            className="text-xs border-[1.5px] border-gris-mid rounded px-2 py-1 bg-white outline-none focus:border-naranja"
            title="Quedarse con un solo centro de costo (cliente)"
          >
            <option value="">Todos los centros de costo</option>
            {centros.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="text-xs text-gris-dark flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-azul" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} />
            agrupar por centro de costo
          </label>
          <span className="text-[11px] text-gris-dark">{visibles.length} obras{hayArchivadas ? ' (las archivadas, sólo si deben)' : ''}</span>
        </div>
      </div>
      {sinPct.length > 0 && (
        <div className="mx-4 mb-2 px-3 py-2 rounded bg-naranja-light text-naranja text-xs">
          ⚠ Por administración sin porcentajes cargados, calculando al costo: {sinPct.map(f => f.obra_nom).join(', ')}. Entrá a la obra y cargá el %.
        </div>
      )}
      {!conTarja && (
        <div className="mx-4 mb-2 px-3 py-2 rounded bg-gris text-gris-dark text-xs">
          Sin permiso para ver costos de tarja: las obras por administración muestran sólo materiales, y su total es parcial.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[980px]">
          <thead>
            <tr>
              <th className={th()}>{agrupar ? 'Cliente / obra' : 'Obra'}</th>
              <th className={th()}>Régimen</th>
              <th className={th(true)}>Jornales</th>
              <th className={th(true)}>Contratistas</th>
              <th className={th(true)}>Materiales</th>
              <th className={th(true)}>Total</th>
              <th className={th(true)}>Pagado</th>
              <th className={th(true)}>Notas créd.</th>
              <th className={th(true)}>Saldo</th>
              <th className={th(true)}>Sin precio</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gris-dark italic">No hay obras de cliente con movimientos.</td></tr>
            )}
            {agrupar
              ? grupos.map(g => (
                  g.obras.length === 1
                    ? <FilaObra key={g.centro} f={g.obras[0]!} onElegir={onElegirObra} sangria={false} />
                    : [
                        <FilaCentro key={`c-${g.centro}`} centro={g.centro} n={g.obras.length} tot={g.tot} />,
                        ...g.obras.map(f => <FilaObra key={f.obra_cod} f={f} onElegir={onElegirObra} sangria />),
                      ]
                ))
              : [...visibles].sort((a, b) => b.saldo - a.saldo).map(f => <FilaObra key={f.obra_cod} f={f} onElegir={onElegirObra} sangria={false} />)}
          </tbody>
          {visibles.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gris-mid bg-gris/40">
                <td className="px-3 py-2 text-xs font-bold uppercase" colSpan={5}>Total{centroSel ? ` ${centroSel}` : ''}</td>
                <Monto n={tot.total} bold />
                <Monto n={tot.pagado} bold />
                <Monto n={tot.notas} bold />
                <Monto n={tot.saldo} bold negativoRojo />
                <td className="px-3 py-2 text-right text-xs font-bold">{tot.sin_precio > 0 ? tot.sin_precio : ''}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-gris-dark">
        Precios finales, IVA incluido. Los renglones sin precio valen $0 acá: el saldo real de esas obras es mayor.
        Click en una obra para cargar precios, registrar pagos y sacar el PDF. El centro de costo se edita en la ficha de la obra.
      </p>
    </div>
  )
}
