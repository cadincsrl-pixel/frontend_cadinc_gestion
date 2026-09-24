'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLibroIvaCompras } from '../../hooks/useFacturacion'
import { fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { descargarTxtLidCompras, exportarExcelLidCompras, nombreArchivoLidCompras } from '../../utils/lidCompras'
import { AvisoErrores, TablaValidaciones, TablasResumen, Tarjeta, contarSeveridades } from './LidComun'

/**
 * Libro IVA Digital de Compras (RG 4597): las facturas de proveedor cargadas en
 * Compras (no anuladas) con fecha del mes, con su desglose por alícuota y sus
 * percepciones. Una factura sin desglose queda FUERA y se avisa: se completa
 * desde la ficha de la factura en Compras.
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
          Windows. Salen de las facturas de proveedor cargadas en Compras, por la fecha del comprobante. Crédito fiscal sin prorrateo (igual al IVA
          liquidado); las facturas B y C no llevan alícuotas ni dan crédito.
        </p>
        {libro && <AvisoErrores errores={contarSeveridades(libro.validaciones).error} />}
      </div>

      {q.isLoading && !libro ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gris-dark">Armando el libro…</div>
      ) : q.error ? (
        <div className="bg-rojo-light border border-rojo/30 rounded-card p-4 text-sm text-rojo flex items-center justify-between gap-2">
          <span>{mensajeErrorFacturacion(q.error)}</span>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
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
          <TablaValidaciones validaciones={libro.validaciones} />
        </>
      ) : null}
    </div>
  )
}
