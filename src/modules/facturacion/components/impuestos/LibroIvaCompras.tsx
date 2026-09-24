'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLibroIvaCompras } from '../../hooks/useFacturacion'
import { fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { descargarTxtLidCompras, exportarExcelLidCompras, nombreArchivoLidCompras, type DetalleLidCompras } from '../../utils/lidCompras'
import { AvisoErrores, AvisoParcial, LibroVacio, TablaValidaciones, TablasResumen, Tarjeta, contarSeveridades } from './LidComun'
import { nombreMes } from '../../utils/lidVentas'

/**
 * Libro IVA Digital de Compras (RG 4597): las facturas de proveedor cargadas en
 * Compras (no anuladas) cuyo PERÍODO IVA es el mes (20260927a; por defecto el
 * mes de la fecha, pero se puede correr a uno posterior), con su desglose por
 * alícuota y sus percepciones. Una factura sin desglose queda FUERA y se
 * avisa: se completa desde la ficha de la factura en Compras.
 */
export function LibroIvaCompras({ periodo }: { periodo: string }) {
  const toast = useToast()
  const [exportando, setExportando] = useState(false)
  const q = useLibroIvaCompras(periodo)
  const libro = q.data
  const vacio = !!libro && libro.resumen.comprobantes === 0
  const r = libro?.resumen

  async function excel() {
    if (!libro) return
    setExportando(true)
    try { await exportarExcelLidCompras(libro) }
    catch { toast('No se pudo armar el Excel', 'err') }
    finally { setExportando(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={!libro || vacio} onClick={() => libro && descargarTxtLidCompras(libro, 'cbte')}
            title={libro ? nombreArchivoLidCompras(periodo, 'cbte') : undefined}>
            ⬇ Descargar comprobantes
          </Button>
          <Button size="sm" disabled={!libro || vacio} onClick={() => libro && descargarTxtLidCompras(libro, 'alicuotas')}
            title={libro ? nombreArchivoLidCompras(periodo, 'alicuotas') : undefined}>
            ⬇ Descargar alícuotas
          </Button>
          <Button size="sm" variant="secondary" disabled={!libro || libro.detalle.length === 0} loading={exportando} onClick={excel}
            title="Detalle factura por factura, resumen y validaciones, para revisar antes de importar">
            Excel de control
          </Button>
        </div>
        <p className="text-[11px] text-gris-dark">
          Archivos de importación del Libro IVA Digital (ARCA, RG 4597): comprobantes de 325 posiciones y alícuotas de 84, en ANSI con fin de línea
          Windows. Salen de las facturas de proveedor cargadas en Compras, <b>por período IVA</b> (el mes en que se informa cada una; por defecto,
          el de su fecha). Crédito fiscal sin prorrateo (igual al IVA
          liquidado); las facturas B y C no llevan alícuotas ni dan crédito.
        </p>
        <AvisoParcial periodo={periodo} />
        {libro && <AvisoErrores errores={contarSeveridades(libro.validaciones).error} />}
      </div>

      {q.isLoading && !libro ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Armando el libro…</div>
      ) : q.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(q.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
      ) : libro && r && libro.detalle.length === 0 ? (
        <LibroVacio texto={`No hay facturas de compra informadas en el período IVA de ${nombreMes(periodo)}. El módulo Compras se usa desde el 18/09/2026: lo anterior está en Finnegans.`} />
      ) : libro && r ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tarjeta titulo="Comprobantes" valor={String(r.comprobantes)}
              sub={r.excluidos ? `${r.excluidos} fuera de los archivos` : `${r.lineas_alicuotas} registros de alícuotas`} />
            <Tarjeta titulo="Neto gravado" valor={fmtM(r.neto)} sub="notas de crédito restando" />
            <Tarjeta titulo="IVA crédito fiscal" valor={fmtM(r.credito_fiscal)} sub="computable, sin prorrateo" />
            <Tarjeta titulo="Percepciones de IVA" valor={fmtM(r.perc_iva)}
              sub={`IIBB ${fmtM(r.perc_iibb)}${r.perc_municipales ? ` · munic. ${fmtM(r.perc_municipales)}` : ''}`} />
          </div>
          <TablasResumen resumen={r} />
          <FueraDeMes detalle={libro.detalle} />
          <TablaValidaciones validaciones={libro.validaciones} />
        </>
      ) : null}
    </div>
  )
}

/**
 * Los comprobantes de OTRO mes que se informan en este (período IVA corrido,
 * 20260927a). Van en el libro igual que los demás: la lista es para que el
 * contador los vea de un vistazo. El detalle trae una fila por alícuota, así
 * que se agrupa por comprobante.
 */
function FueraDeMes({ detalle }: { detalle: DetalleLidCompras[] }) {
  const filas = useMemo(() => {
    const m = new Map<number, DetalleLidCompras & { total_cbte: number }>()
    for (const d of detalle) {
      if (!d.fuera_de_mes) continue
      if (!m.has(d.ref_id)) m.set(d.ref_id, { ...d, total_cbte: d.total })
    }
    return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [detalle])
  if (filas.length === 0) return null
  return (
    <div className="bg-white rounded-card shadow-card p-3 sm:p-4 flex flex-col gap-2">
      <div className="text-[11px] font-bold text-gris-dark uppercase tracking-wide">
        Comprobantes de otro mes informados en este ({filas.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs min-w-[640px]">
          <thead>
            <tr>
              {['Fecha', 'Comprobante', 'Proveedor', 'Total', ''].map((h, i) => (
                <th key={h + i} className={`bg-gris text-gris-dark text-[10px] font-bold px-2 py-1.5 uppercase ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(d => (
              <tr key={d.ref_id} className="border-t border-gris">
                <td className="px-2 py-1 whitespace-nowrap">{d.fecha.split('-').reverse().join('/')}</td>
                <td className="px-2 py-1 font-mono whitespace-nowrap">{d.comprobante}</td>
                <td className="px-2 py-1">{d.nombre}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">{fmtM(d.total_cbte)}</td>
                <td className="px-2 py-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amarillo-light text-[#7A5000] whitespace-nowrap"
                    title="La fecha del comprobante es de otro mes: se corrió el período IVA">
                    de {nombreMes(d.fecha.slice(0, 7))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
