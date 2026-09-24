'use client'

import { useMemo, useState } from 'react'
import { fmtM } from '../../utils/facturacion.utils'
import type { SeveridadLid, ValidacionLid } from '../../utils/lidVentas'

/** Piezas que comparten el libro de ventas y el de compras. */

const ESTILO_SEV: Record<SeveridadLid, string> = {
  error:       'bg-rojo-light text-rojo',
  advertencia: 'bg-amarillo-light text-[#7A5000]',
  info:        'bg-azul-light text-azul',
}
const ETIQUETA_SEV: Record<SeveridadLid, string> = { error: 'Error', advertencia: 'Advertencia', info: 'Info' }

export function contarSeveridades(v: ValidacionLid[] | undefined) {
  const c: Record<SeveridadLid, number> = { error: 0, advertencia: 0, info: 0 }
  for (const x of v ?? []) c[x.severidad]++
  return c
}

export function Tarjeta({ titulo, valor, sub, tono = 'azul' }: { titulo: string; valor: string; sub?: string; tono?: 'azul' | 'rojo' | 'verde' }) {
  const color = tono === 'rojo' ? 'text-rojo' : tono === 'verde' ? 'text-verde' : 'text-azul'
  return (
    <div className="bg-white rounded-card shadow-card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gris-dark">{titulo}</div>
      <div className={`font-mono font-bold text-base sm:text-lg ${color} break-all`}>{valor}</div>
      {sub && <div className="text-[11px] text-gris-dark">{sub}</div>}
    </div>
  )
}

interface ResumenTablas {
  por_alicuota: Array<{ codigo: number; alicuota: string; neto: number; iva: number; registros: number }>
  por_tipo: Array<{ cbte_tipo: number; tipo: string; cantidad: number; neto: number; iva: number; total: number }>
}

export function TablasResumen({ resumen }: { resumen: ResumenTablas }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="bg-white rounded-card shadow-card p-3 overflow-x-auto">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark mb-2">Por alícuota</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-gris-dark"><th className="py-1">Alícuota</th><th className="text-right">Registros</th><th className="text-right">Neto</th><th className="text-right">IVA</th></tr></thead>
          <tbody>
            {resumen.por_alicuota.length === 0 && <tr><td colSpan={4} className="py-2 text-gris-dark italic">Sin comprobantes</td></tr>}
            {resumen.por_alicuota.map(a => (
              <tr key={a.codigo} className="border-t border-gris-mid/50">
                <td className="py-1">{a.alicuota} <span className="text-[10px] text-gris-dark font-mono">({String(a.codigo).padStart(4, '0')})</span></td>
                <td className="text-right">{a.registros}</td>
                <td className="text-right font-mono">{fmtM(a.neto)}</td>
                <td className="text-right font-mono">{fmtM(a.iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded-card shadow-card p-3 overflow-x-auto">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark mb-2">Por tipo de comprobante</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-gris-dark"><th className="py-1">Tipo</th><th className="text-right">Cant.</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {resumen.por_tipo.length === 0 && <tr><td colSpan={5} className="py-2 text-gris-dark italic">Sin comprobantes</td></tr>}
            {resumen.por_tipo.map(t => (
              <tr key={t.cbte_tipo} className="border-t border-gris-mid/50">
                <td className="py-1"><span className="font-mono text-[11px] text-gris-dark">{String(t.cbte_tipo).padStart(3, '0')}</span> {t.tipo}</td>
                <td className="text-right">{t.cantidad}</td>
                <td className="text-right font-mono whitespace-nowrap">{fmtM(t.neto)}</td>
                <td className="text-right font-mono whitespace-nowrap">{fmtM(t.iva)}</td>
                <td className="text-right font-mono whitespace-nowrap">{fmtM(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TablaValidaciones({ validaciones }: { validaciones: ValidacionLid[] }) {
  const [verInfo, setVerInfo] = useState(false)
  const conteo = useMemo(() => contarSeveridades(validaciones), [validaciones])
  const visibles = validaciones.filter(v => verInfo || v.severidad !== 'info')
  return (
    <div className="bg-white rounded-card shadow-card p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark">
          Validaciones · {conteo.error} errores · {conteo.advertencia} advertencias · {conteo.info} info
        </h3>
        <label className="text-[11px] text-gris-dark flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={verInfo} onChange={e => setVerInfo(e.target.checked)} className="accent-naranja" /> Ver también las informativas
        </label>
      </div>
      {visibles.length === 0 ? (
        <p className="text-sm text-verde">✓ Sin observaciones{conteo.info && !verInfo ? ` (hay ${conteo.info} informativas)` : ''}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-gris-dark"><th className="py-1 pr-2">Severidad</th><th className="pr-2">Comprobante</th><th>Mensaje</th></tr></thead>
            <tbody>
              {visibles.map((v, i) => (
                <tr key={i} className="border-t border-gris-mid/50 align-top">
                  <td className="py-1 pr-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ESTILO_SEV[v.severidad]}`}>{ETIQUETA_SEV[v.severidad]}</span></td>
                  <td className="pr-2 font-mono text-xs whitespace-nowrap">{v.comprobante}</td>
                  <td className="text-xs">{v.mensaje}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Cartel de errores arriba de los botones de descarga. */
export function AvisoErrores({ errores }: { errores: number }) {
  if (!errores) return null
  return (
    <div className="bg-rojo-light border border-rojo/30 rounded p-2 text-xs text-rojo">
      Hay {errores} error{errores === 1 ? '' : 'es'}: revisalos antes de importar. Lo que está marcado «fuera de los archivos» hay que cargarlo a mano en el LID.
    </div>
  )
}

/** El mes en curso se ve «parcial»: lo cargado hasta hoy, todavía no se declara. */
export function mesEnCurso(periodo: string, hoy = new Date()): boolean {
  return periodo === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export function hoyCorto(hoy = new Date()): string {
  return `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

/** Cartel del mes en curso: los números son parciales y el mes no se declara todavía. */
export function AvisoParcial({ periodo }: { periodo: string }) {
  if (!mesEnCurso(periodo)) return null
  return (
    <div className="bg-azul-light border border-azul/20 rounded p-2 text-xs text-azul">
      <b>Parcial, al {hoyCorto()}:</b> es el mes en curso. Los números son lo cargado hasta hoy y van a cambiar;
      el libro de este mes se presenta recién el mes que viene.
    </div>
  )
}

/** Libro sin ningún comprobante en el mes: se explica en vez de mostrar todo en cero. */
export function LibroVacio({ texto }: { texto: string }) {
  return <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">{texto}</div>
}
