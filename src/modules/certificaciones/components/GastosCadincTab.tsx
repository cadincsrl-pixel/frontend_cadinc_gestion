'use client'

import { useMemo, useState } from 'react'
import { useCuentaCliente, useGastosCadinc } from '../hooks/useCuentaCliente'
import { useObras } from '@/modules/tarja/hooks/useObras'
import type { GastoCadincResumen, Obra } from '@/types/domain.types'

/**
 * Gastos de CADINC por obra (2026-09-04).
 *
 * La cuenta del cliente mezclaba dos preguntas: qué le cobro al cliente y
 * cuánto gastó CADINC en la obra. Desde 20260904ak cada fila de la cuenta
 * lleva `a_cargo_de`: 'cliente' (se cobra) o 'cadinc' (gasto propio: obra
 * llave en mano, o EPP en cualquier obra). Esta pestaña muestra lo segundo,
 * por obra, separado en materiales y EPP, con el detalle por mes y los
 * renglones al abrir una obra.
 */

function fmtM(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }

function fmtMes(s: string) {
  const [a, m] = s.split('-')
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${nombres[Number(m) - 1]} ${a}`
}

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  const [a, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

interface FilaObra {
  obra_cod:   string
  material:   number
  epp:        number
  total:      number
  renglones:  number
  sin_precio: number
  meses:      { mes: string; material: number; epp: number }[]
}

function agrupar(rows: GastoCadincResumen[]): FilaObra[] {
  const map = new Map<string, FilaObra>()
  for (const r of rows) {
    let f = map.get(r.obra_cod)
    if (!f) { f = { obra_cod: r.obra_cod, material: 0, epp: 0, total: 0, renglones: 0, sin_precio: 0, meses: [] }; map.set(r.obra_cod, f) }
    const t = Number(r.total)
    if (r.tipo === 'epp') f.epp += t; else f.material += t
    f.total += t
    f.renglones += r.renglones
    f.sin_precio += r.sin_precio
    let m = f.meses.find(x => x.mes === r.mes)
    if (!m) { m = { mes: r.mes, material: 0, epp: 0 }; f.meses.push(m) }
    if (r.tipo === 'epp') m.epp += t; else m.material += t
  }
  for (const f of map.values()) f.meses.sort((a, b) => b.mes.localeCompare(a.mes))
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function GastosCadincTab() {
  const { data, isLoading, isError, error, refetch } = useGastosCadinc()
  const { data: obras = [] } = useObras()
  const [abierta, setAbierta] = useState<string | null>(null)

  const filas = useMemo(() => agrupar(data ?? []), [data])
  const obraInfo = useMemo(() => {
    const m = new Map<string, Obra>()
    for (const o of obras as Obra[]) m.set(o.cod, o)
    return m
  }, [obras])

  const totMaterial = filas.reduce((s, f) => s + f.material, 0)
  const totEpp      = filas.reduce((s, f) => s + f.epp, 0)
  const totSinPrecio = filas.reduce((s, f) => s + f.sin_precio, 0)

  return (
    <div className="flex flex-col gap-4">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-card shadow-card p-4">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">Materiales (obras llave en mano)</div>
          <div className="font-mono font-bold text-xl mt-1">{fmtM(totMaterial)}</div>
        </div>
        <div className="bg-white rounded-card shadow-card p-4">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">EPP (todas las obras)</div>
          <div className="font-mono font-bold text-xl mt-1">{fmtM(totEpp)}</div>
        </div>
        <div className="bg-white rounded-card shadow-card p-4">
          <div className="text-[10px] font-bold text-gris-dark uppercase tracking-wide">Total · renglones sin precio</div>
          <div className="font-mono font-bold text-xl mt-1">
            {fmtM(totMaterial + totEpp)}
            {totSinPrecio > 0 && <span className="ml-2 text-[11px] font-bold bg-naranja-light text-naranja-dark px-1.5 py-0.5 rounded align-middle">{totSinPrecio} sin precio</span>}
          </div>
        </div>
      </div>

      <div className="text-xs text-gris-dark px-1">
        Lo que gastó CADINC y no se le cobra al cliente: los materiales de las obras marcadas como <b>llave en mano</b> en su ficha, y el <b>EPP</b> de cualquier obra.
        Precios finales, IVA incluido. Los renglones sin precio suman $0 hasta que se tasen.
      </div>

      {isError && (
        <div className="bg-rojo-light text-rojo rounded-card p-4 text-sm flex items-center justify-between gap-3">
          <span>No se pudieron cargar los gastos{error instanceof Error ? `: ${error.message}` : ''}</span>
          <button onClick={() => refetch()} className="text-xs font-bold px-3 py-1.5 rounded bg-white">Reintentar</button>
        </div>
      )}

      {isLoading && <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Cargando…</div>}

      {data && filas.length === 0 && (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">
          Todavía no hay gastos a cargo de CADINC. Marcá una obra como llave en mano en su ficha, o cargá EPP en un pedido.
        </div>
      )}

      {filas.length > 0 && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {['Obra', 'Modalidad', 'Materiales', 'EPP', 'Total', 'Renglones', ''].map((h, i) => (
                    <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-4 py-2 uppercase tracking-wide ${i >= 2 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const o = obraInfo.get(f.obra_cod)
                  const llave = o?.materiales_a_cargo_de === 'cadinc'
                  const open = abierta === f.obra_cod
                  return (
                    <FilaObraRow key={f.obra_cod} f={f} obra={o} llave={llave} open={open} onToggle={() => setAbierta(open ? null : f.obra_cod)} />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaObraRow({ f, obra, llave, open, onToggle }: { f: FilaObra; obra?: Obra; llave: boolean; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-gris hover:bg-gris/30 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5">
          <div className="font-medium text-sm">{obra?.nom ?? f.obra_cod}</div>
          <div className="text-[10px] text-gris-dark font-mono">{f.obra_cod}</div>
        </td>
        <td className="px-4 py-2.5 text-xs">
          {llave
            ? <span className="text-[10px] font-bold bg-azul-light text-azul px-1.5 py-0.5 rounded">LLAVE EN MANO</span>
            : <span className="text-[10px] text-gris-dark">Materiales a cargo del cliente</span>}
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-sm">{f.material > 0 ? fmtM(f.material) : '—'}</td>
        <td className="px-4 py-2.5 text-right font-mono text-sm">{f.epp > 0 ? fmtM(f.epp) : '—'}</td>
        <td className="px-4 py-2.5 text-right font-mono font-bold text-sm">{fmtM(f.total)}</td>
        <td className="px-4 py-2.5 text-right text-xs text-gris-dark">
          {f.renglones}{f.sin_precio > 0 && <span className="ml-1.5 text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded">{f.sin_precio} sin precio</span>}
        </td>
        <td className="px-4 py-2.5 text-right text-xs text-azul font-bold">{open ? 'Cerrar' : 'Ver detalle'}</td>
      </tr>
      {open && (
        <tr className="border-t border-gris bg-gris/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap gap-2 mb-3">
              {f.meses.map(m => (
                <div key={m.mes} className="bg-white rounded-lg border border-gris-mid px-3 py-1.5 text-xs">
                  <span className="font-bold">{fmtMes(m.mes)}</span>
                  {m.material > 0 && <span className="ml-2 text-gris-dark">mat. <span className="font-mono">{fmtM(m.material)}</span></span>}
                  {m.epp > 0 && <span className="ml-2 text-gris-dark">EPP <span className="font-mono">{fmtM(m.epp)}</span></span>}
                </div>
              ))}
            </div>
            <DetalleObra obraCod={f.obra_cod} />
          </td>
        </tr>
      )}
    </>
  )
}

function DetalleObra({ obraCod }: { obraCod: string }) {
  const { data: rows = [], isLoading } = useCuentaCliente(obraCod, true, 'cadinc')
  if (isLoading) return <div className="text-xs text-gris-dark">Cargando renglones…</div>
  if (rows.length === 0) return <div className="text-xs text-gris-dark">Sin renglones.</div>
  return (
    <div className="overflow-x-auto bg-white rounded-lg border border-gris-mid">
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr>
            {['Material', 'Fecha', 'Cant.', 'Precio', 'Total', 'Origen'].map((h, i) => (
              <th key={i} className={`bg-gris text-gris-dark text-[10px] font-bold px-3 py-1.5 uppercase tracking-wide ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-gris">
              <td className="px-3 py-1.5 text-xs">{r.descripcion}</td>
              <td className="px-3 py-1.5 text-xs text-gris-dark whitespace-nowrap">{fmtFecha(r.fecha_resolucion)}</td>
              <td className="px-3 py-1.5 text-xs text-right font-mono">{r.cantidad} {r.unidad}</td>
              <td className="px-3 py-1.5 text-xs text-right font-mono">{Number(r.precio_unit) > 0 ? fmtM(Number(r.precio_unit)) : <span className="text-[9px] font-bold bg-naranja-light text-naranja-dark px-1 py-0.5 rounded">SIN PRECIO</span>}</td>
              <td className="px-3 py-1.5 text-xs text-right font-mono font-bold">{fmtM(Number(r.precio_total))}</td>
              <td className="px-3 py-1.5 text-xs text-gris-dark">{r.origen === 'deposito' ? 'Depósito' : (r.proveedores?.nombre ?? 'Proveedor')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
