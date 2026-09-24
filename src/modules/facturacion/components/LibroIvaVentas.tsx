'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLibroIvaVentas } from '../hooks/useFacturacion'
import { fmtM } from '../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../utils/facturacion.errores'
import {
  descargarTxtLid, exportarExcelLid, mesesRecientes, nombreArchivoLid, nombreMes, type SeveridadLid,
} from '../utils/lidVentas'

/**
 * Libro IVA Digital de Ventas (RG 4597) para el contador: los dos archivos de
 * importación del LID (comprobantes y alícuotas) del mes, con lo emitido por
 * el ERP y lo importado de ARCA «Mis Comprobantes». Lo arma el backend; acá se
 * revisa (resumen, validaciones, Excel) y se baja.
 *
 * CVLP (060, la cuenta de venta y líquido producto que emite CASILDA por
 * cuenta de CADINC): el Anexo VII del LID dice que el comitente la registra en
 * Ventas, pero queda apagada hasta que el contador confirme cómo la carga.
 */

const ESTILO_SEV: Record<SeveridadLid, string> = {
  error:       'bg-rojo-light text-rojo',
  advertencia: 'bg-amarillo-light text-[#7A5000]',
  info:        'bg-azul-light text-azul',
}
const ETIQUETA_SEV: Record<SeveridadLid, string> = { error: 'Error', advertencia: 'Advertencia', info: 'Info' }

function mesAnterior(): string {
  const h = new Date()
  const d = new Date(h.getFullYear(), h.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function LibroIvaVentas() {
  const toast = useToast()
  const meses = useMemo(() => mesesRecientes(new Date()), [])
  const [periodo, setPeriodo] = useState(mesAnterior)
  const [incluirCvlp, setIncluirCvlp] = useState(false)
  const [verInfo, setVerInfo] = useState(false)
  const [exportando, setExportando] = useState(false)
  const q = useLibroIvaVentas(periodo, incluirCvlp)
  const libro = q.data

  const conteo = useMemo(() => {
    const c: Record<SeveridadLid, number> = { error: 0, advertencia: 0, info: 0 }
    for (const v of libro?.validaciones ?? []) c[v.severidad]++
    return c
  }, [libro])
  const validaciones = (libro?.validaciones ?? []).filter(v => verInfo || v.severidad !== 'info')
  const vacio = !!libro && libro.resumen.comprobantes === 0

  async function excel() {
    if (!libro) return
    setExportando(true)
    try { await exportarExcelLid(libro) }
    catch { toast('No se pudo armar el Excel', 'err') }
    finally { setExportando(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[11px] font-bold text-gris-dark uppercase tracking-wider mb-1">Período</label>
            <select value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-gris-mid rounded-lg text-sm outline-none focus:border-naranja bg-white capitalize">
              {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm py-2 cursor-pointer"
            title="Cuenta de venta y líquido producto (tipo 060) que emite el comisionista por cuenta de CADINC. Según el Anexo VII del Libro IVA Digital, el comitente la registra en Ventas; confirmalo con el contador antes de incluirla.">
            <input type="checkbox" checked={incluirCvlp} onChange={e => setIncluirCvlp(e.target.checked)} className="accent-naranja w-4 h-4" />
            Incluir CVLP (060)
          </label>
          <div className="flex gap-2 flex-wrap ml-auto">
            <Button size="sm" disabled={!libro || vacio} onClick={() => libro && descargarTxtLid(libro, 'cbte')}
              title={libro ? nombreArchivoLid(periodo, 'cbte') : undefined}>
              ⬇ Descargar comprobantes
            </Button>
            <Button size="sm" disabled={!libro || vacio} onClick={() => libro && descargarTxtLid(libro, 'alicuotas')}
              title={libro ? nombreArchivoLid(periodo, 'alicuotas') : undefined}>
              ⬇ Descargar alícuotas
            </Button>
            <Button size="sm" variant="secondary" disabled={!libro || libro.detalle.length === 0} loading={exportando} onClick={excel}
              title="Detalle comprobante por comprobante, resumen y validaciones, para revisar antes de importar">
              Excel de control
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-gris-dark">
          Archivos de importación del Libro IVA Digital (ARCA, RG 4597): comprobantes de 266 posiciones y alícuotas de 62, en ANSI con fin de línea
          Windows. Incluye lo emitido por el sistema (autorizado en producción) y lo importado de ARCA «Mis Comprobantes». Al importar en el LID
          elegí «Los importes están expresados en Pesos Argentinos».
        </p>
        {libro && conteo.error > 0 && (
          <div className="bg-rojo-light border border-rojo/30 rounded p-2 text-xs text-rojo">
            Hay {conteo.error} error{conteo.error === 1 ? '' : 'es'}: revisalos antes de importar. Lo que está marcado «fuera de los archivos» hay que cargarlo a mano en el LID.
          </div>
        )}
      </div>

      {q.isLoading && !libro ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Armando el libro…</div>
      ) : q.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(q.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
      ) : libro ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tarjeta titulo="Comprobantes" valor={String(libro.resumen.comprobantes)}
              sub={libro.resumen.excluidos ? `${libro.resumen.excluidos} fuera de los archivos` : `${libro.resumen.lineas_alicuotas} registros de alícuotas`} />
            <Tarjeta titulo="Neto gravado" valor={fmtM(libro.resumen.neto)} sub="notas de crédito restando" />
            <Tarjeta titulo="IVA débito fiscal" valor={fmtM(libro.resumen.iva)} sub="notas de crédito restando" />
            <Tarjeta titulo="Total" valor={fmtM(libro.resumen.total)}
              sub={libro.resumen.exento || libro.resumen.no_gravado ? `exento ${fmtM(libro.resumen.exento)} · no grav. ${fmtM(libro.resumen.no_gravado)}` : undefined} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white rounded-card shadow-card p-3 overflow-x-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark mb-2">Por alícuota</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-gris-dark"><th className="py-1">Alícuota</th><th className="text-right">Registros</th><th className="text-right">Neto</th><th className="text-right">IVA</th></tr></thead>
                <tbody>
                  {libro.resumen.por_alicuota.length === 0 && <tr><td colSpan={4} className="py-2 text-gris-dark italic">Sin comprobantes</td></tr>}
                  {libro.resumen.por_alicuota.map(a => (
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
                  {libro.resumen.por_tipo.length === 0 && <tr><td colSpan={5} className="py-2 text-gris-dark italic">Sin comprobantes</td></tr>}
                  {libro.resumen.por_tipo.map(t => (
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

          <div className="bg-white rounded-card shadow-card p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gris-dark">
                Validaciones · {conteo.error} errores · {conteo.advertencia} advertencias · {conteo.info} info
              </h3>
              <label className="text-[11px] text-gris-dark flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={verInfo} onChange={e => setVerInfo(e.target.checked)} className="accent-naranja" /> Ver también las informativas
              </label>
            </div>
            {validaciones.length === 0 ? (
              <p className="text-sm text-verde">✓ Sin observaciones{conteo.info && !verInfo ? ` (hay ${conteo.info} informativas)` : ''}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] text-gris-dark"><th className="py-1 pr-2">Severidad</th><th className="pr-2">Comprobante</th><th>Mensaje</th></tr></thead>
                  <tbody>
                    {validaciones.map((v, i) => (
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
        </>
      ) : null}
    </div>
  )
}

function Tarjeta({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gris-dark">{titulo}</div>
      <div className="font-mono font-bold text-base sm:text-lg text-azul break-all">{valor}</div>
      {sub && <div className="text-[11px] text-gris-dark">{sub}</div>}
    </div>
  )
}
