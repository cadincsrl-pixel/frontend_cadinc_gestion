'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { CtbCuadroBienes, CtbCuadroFila } from '@/types/contabilidad.types'
import { useCuadroBienes } from '../hooks/useContabilidad'
import { fmtFecha, fmtM, fmtN, hoyAR } from '../utils/contabilidad.utils'
import { mensajeErrorCtb } from '../utils/contabilidad.errores'
import { exportarCuadroBienes } from '../utils/exportarBienes'
import { Aviso, Campo, Cargando, Cifra, ErrorCarga, Tarjeta, Th, Vacio, inputCls } from './Comun'

/**
 * Cuadro de bienes de uso del ejercicio que contiene «hasta»: por bien, lo
 * acumulado al inicio, lo del ejercicio, lo acumulado al cierre y el neto,
 * con subtotales por rubro. Abajo, el CONTROL CONTRA EL MAYOR: el inventario
 * (Σ valores de origen, Σ acumuladas) contra el saldo de cada cuenta. Una
 * diferencia es una compra que no se dio de alta, una apertura que no
 * coincide o un bien cargado en otra cuenta.
 */
export function CuadroAmortizaciones({ onAbrirBien }: { onAbrirBien: (id: number) => void }) {
  const toast = useToast()
  const [hasta, setHasta] = useState(hoyAR())
  const q = useCuadroBienes(hasta)

  function exportar() {
    if (!q.data) return
    try { exportarCuadroBienes(q.data) } catch (e) { toast(mensajeErrorCtb(e), 'err') }
  }

  return (
    <div className="flex flex-col gap-3">
      <Tarjeta className="p-3 flex flex-wrap gap-3 items-end">
        <Campo label="Hasta">
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
        </Campo>
        <p className="text-xs text-gris-dark flex-1 min-w-[240px]">
          {q.data ? <>Ejercicio {q.data.ejercicio.nombre} ({fmtFecha(q.data.ejercicio.desde)} – {fmtFecha(q.data.ejercicio.hasta)}). </> : null}
          La amortización del ejercicio es la registrada (corridas vigentes) hasta la fecha elegida.
        </p>
        <Button variant="secondary" size="sm" onClick={exportar} disabled={!q.data || q.data.filas.length === 0}
          title={q.data && q.data.filas.length > 0 ? 'Bajar el cuadro en Excel (hojas «Cuadro» y «Por rubro»)' : 'No hay bienes para exportar'}>
          📥 Exportar Excel
        </Button>
      </Tarjeta>

      {!hasta ? <Vacio>Elegí la fecha.</Vacio>
        : q.isLoading ? <Cargando texto="Armando el cuadro…" />
        : q.isError ? <ErrorCarga mensaje={mensajeErrorCtb(q.error)} onReintentar={() => void q.refetch()} />
        : !q.data ? null
        : q.data.filas.length === 0 ? <Vacio>No hay bienes de uso cargados a esa fecha. Dalos de alta o importá el inventario desde «Inventario».</Vacio>
        : <Cuadro res={q.data} fetching={q.isFetching} onAbrirBien={onAbrirBien} />}
    </div>
  )
}

function Cuadro({ res, fetching, onAbrirBien }: { res: CtbCuadroBienes; fetching: boolean; onAbrirBien: (id: number) => void }) {
  const grupos = useMemo(() => {
    const cods = res.rubros.map(r => r.rubro_codigo)
    for (const f of res.filas) if (!cods.includes(f.rubro_codigo)) cods.push(f.rubro_codigo)
    return cods.map(cod => ({
      cod,
      rubro: res.rubros.find(r => r.rubro_codigo === cod) ?? null,
      filas: res.filas.filter(f => f.rubro_codigo === cod),
    }))
  }, [res])
  const tot = useMemo(() => {
    const s = (k: keyof Pick<CtbCuadroFila, 'valor_origen' | 'amort_acum_inicio' | 'amort_ejercicio' | 'amort_acum_cierre' | 'valor_neto' | 'falta_amortizar_teorico'>) =>
      res.filas.reduce((a, f) => a + Number(f[k] || 0), 0)
    return {
      vo: s('valor_origen'), ini: s('amort_acum_inicio'), ej: s('amort_ejercicio'), cie: s('amort_acum_cierre'),
      neto: s('valor_neto'), falta: s('falta_amortizar_teorico'),
    }
  }, [res])
  const conDif = res.control_mayor.filter(c => Math.abs(c.diferencia) > 0.005)

  return (
    <div className={`flex flex-col gap-3 ${fetching ? 'opacity-70' : ''}`}>
      <div className="flex gap-2 flex-wrap">
        <Cifra label="Valor de origen" valor={fmtM(tot.vo)} sub={`${res.filas.length} bien${res.filas.length === 1 ? '' : 'es'}`} />
        <Cifra label="Amort. del ejercicio" valor={fmtM(tot.ej)} />
        <Cifra label="Acumulada al cierre" valor={fmtM(tot.cie)} />
        <Cifra label="Valor neto" valor={fmtM(tot.neto)} tono="verde" />
        <Cifra label="Falta registrar" valor={fmtM(tot.falta)} tono={Math.abs(tot.falta) > 0.005 ? 'naranja' : 'normal'}
          sub="teórico − registrado: se genera en «Amortizar»" />
      </div>

      <Tarjeta className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[1100px] text-xs">
            <thead>
              <tr>
                <Th>Bien</Th><Th>Alta</Th><Th derecha>Vida útil</Th><Th derecha>Valor de origen</Th><Th derecha>Acum. inicio</Th>
                <Th derecha>Del ejercicio</Th><Th derecha>Acum. cierre</Th><Th derecha>Neto</Th><Th derecha>Falta</Th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const nombre = g.rubro?.rubro_nombre ?? g.filas[0]?.rubro_nombre ?? g.cod
                const sub = (k: 'valor_origen' | 'amort_acum_inicio' | 'amort_ejercicio' | 'amort_acum_cierre' | 'valor_neto' | 'falta_amortizar_teorico') =>
                  g.rubro ? g.rubro[k] : g.filas.reduce((a, f) => a + Number(f[k] || 0), 0)
                return [
                  <tr key={`t-${g.cod}`} className="bg-azul-light/40 border-t border-gris-mid">
                    <td colSpan={9} className="px-3 py-1.5 font-bold text-azul"><span className="font-mono">{g.cod}</span> {nombre}</td>
                  </tr>,
                  ...g.filas.map(f => (
                    <tr key={f.bien_id} className={`border-t border-gris hover:bg-blanco cursor-pointer ${f.fecha_baja ? 'text-gris-dark' : ''}`} onClick={() => onAbrirBien(f.bien_id)}>
                      <td className="px-3 py-1">
                        <span className="font-mono text-gris-dark mr-1">{f.codigo}</span>{f.descripcion}
                        {f.identificador && <span className="text-gris-dark"> · {f.identificador}</span>}
                        {f.fecha_baja && <span className="ml-1 text-[10px] px-1 rounded bg-gris font-bold uppercase">baja {fmtFecha(f.fecha_baja)}</span>}
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap">{fmtFecha(f.fecha_alta)}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{f.vida_util_anios != null ? `${Number(f.vida_util_anios).toLocaleString('es-AR')} a` : '—'}</td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(f.valor_origen, '0,00')}</td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(f.amort_acum_inicio, '0,00')}</td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(f.amort_ejercicio, '0,00')}</td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(f.amort_acum_cierre, '0,00')}</td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold">{fmtN(f.valor_neto, '0,00')}</td>
                      <td className={`px-3 py-1 text-right font-mono tabular-nums ${Math.abs(f.falta_amortizar_teorico) > 0.005 ? 'text-naranja-dark font-bold' : 'text-gris-mid'}`}>
                        {fmtN(f.falta_amortizar_teorico, '—')}
                      </td>
                    </tr>
                  )),
                  <tr key={`s-${g.cod}`} className="border-t border-gris-mid font-bold">
                    <td colSpan={3} className="px-3 py-1.5 text-gris-dark">Total {nombre}{g.rubro ? ` (${g.rubro.cantidad})` : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('valor_origen'), '0,00')}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('amort_acum_inicio'), '0,00')}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('amort_ejercicio'), '0,00')}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('amort_acum_cierre'), '0,00')}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('valor_neto'), '0,00')}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtN(sub('falta_amortizar_teorico'), '—')}</td>
                  </tr>,
                ]
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-azul font-bold bg-blanco">
                <td colSpan={3} className="px-3 py-2 uppercase">Total general</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.vo, '0,00')}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.ini, '0,00')}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.ej, '0,00')}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.cie, '0,00')}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.neto, '0,00')}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtN(tot.falta, '—')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta className="p-3 flex flex-col gap-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-bold text-azul">Control contra el mayor</div>
          <span className="text-[11px] text-gris-dark">al {fmtFecha(res.hasta)}: inventario contra el saldo de cada cuenta</span>
        </div>
        {res.control_mayor.length === 0 ? <span className="text-xs text-gris-dark italic">Sin cuentas para controlar.</span> : (
          <>
            {conDif.length > 0 ? (
              <Aviso tono="rojo">
                {conDif.length} cuenta{conDif.length === 1 ? '' : 's'} no coincide{conDif.length === 1 ? '' : 'n'} con el inventario. Suele ser una compra
                de un bien que no se dio de alta, una apertura con otros valores o un bien cargado en otra cuenta.
              </Aviso>
            ) : <Aviso tono="verde">El inventario coincide con el mayor en todas las cuentas.</Aviso>}
            <div className="overflow-x-auto border border-gris-mid rounded-lg">
              <table className="w-full border-collapse min-w-[640px] text-xs">
                <thead><tr><Th>Cuenta</Th><Th derecha>Inventario</Th><Th derecha>Mayor</Th><Th derecha>Diferencia</Th></tr></thead>
                <tbody>
                  {res.control_mayor.map(c => {
                    const dif = Math.abs(c.diferencia) > 0.005
                    return (
                      <tr key={c.cuenta_id} className={`border-t border-gris ${dif ? 'bg-rojo-light/40' : ''}`}>
                        <td className="px-3 py-1">
                          <Link href={`/contabilidad?tab=mayor&cuenta_id=${c.cuenta_id}&desde=${res.ejercicio.desde}&hasta=${res.hasta}`} className="text-azul hover:underline">
                            <span className="font-mono">{c.codigo}</span> {c.nombre}
                          </Link>
                        </td>
                        <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(c.inventario, '0,00')}</td>
                        <td className="px-3 py-1 text-right font-mono tabular-nums">{fmtN(c.mayor, '0,00')}</td>
                        <td className={`px-3 py-1 text-right font-mono tabular-nums ${dif ? 'text-rojo font-bold' : 'text-gris-mid'}`}>{dif ? fmtN(c.diferencia) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  )
}
