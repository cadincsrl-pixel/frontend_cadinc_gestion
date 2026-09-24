'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLibroIvaVentas } from '../../hooks/useFacturacion'
import { fmtM } from '../../utils/facturacion.utils'
import { mensajeErrorFacturacion } from '../../utils/facturacion.errores'
import { descargarTxtLid, exportarExcelLid, nombreArchivoLid, nombreMes } from '../../utils/lidVentas'
import { AvisoErrores, AvisoParcial, LibroVacio, TablaValidaciones, TablasResumen, Tarjeta, contarSeveridades } from './LidComun'

/**
 * Libro IVA Digital de Ventas (RG 4597) para el contador: los dos archivos de
 * importación del LID (comprobantes y alícuotas) del mes, con lo emitido por
 * el ERP y lo importado de ARCA «Mis Comprobantes». Lo arma el backend; acá se
 * revisa (resumen, validaciones, Excel) y se baja. El mes y la opción de CVLP
 * los elige `ImpuestosTab`.
 */
export function LibroIvaVentas({ periodo, incluirCvlp }: { periodo: string; incluirCvlp: boolean }) {
  const toast = useToast()
  const [exportando, setExportando] = useState(false)
  const q = useLibroIvaVentas(periodo, incluirCvlp)
  const libro = q.data
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
        <div className="flex gap-2 flex-wrap">
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
        <p className="text-[11px] text-gris-dark">
          Archivos de importación del Libro IVA Digital (ARCA, RG 4597): comprobantes de 266 posiciones y alícuotas de 62, en ANSI con fin de línea
          Windows. Incluye lo emitido por el sistema (autorizado en producción) y lo importado de ARCA «Mis Comprobantes». Al importar en el LID
          elegí «Los importes están expresados en Pesos Argentinos».
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
      ) : libro && libro.detalle.length === 0 ? (
        <LibroVacio texto={`No hay comprobantes de venta con fecha de ${nombreMes(periodo)}: ni emitidos por el sistema ni importados de ARCA.`} />
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
          <TablasResumen resumen={libro.resumen} />
          <TablaValidaciones validaciones={libro.validaciones} />
        </>
      ) : null}
    </div>
  )
}
