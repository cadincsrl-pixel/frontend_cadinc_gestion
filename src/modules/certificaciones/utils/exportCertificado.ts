// El PDF de UN certificado (20260911h): lo que se le entrega al cliente.
// Numero, fecha de corte, mano de obra por avance, los materiales congelados
// en ese certificado, y lo cobrado contra el. Reusa los helpers del export de
// la cuenta para que se vea igual.
import pdfMake from 'pdfmake/build/pdfmake'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { toISO } from '@/lib/utils/dates'
import type { Obra, CertificadoDetalle } from '@/types/domain.types'
import { NARANJA, fmtM, fmtFecha, celda, cabecera, derecha, logoPdf, cabeceraPdf, tituloSeccion, LAYOUT_TABLA, LAYOUT_RESUMEN } from './exportCuenta'

export async function descargarPdfCertificado(cert: CertificadoDetalle, obra: Obra): Promise<void> {
  const logo = await logoPdf()
  const materiales: TableCell[][] = cert.renglones_lista.map(r => [
    celda(fmtFecha(r.fecha_resolucion)),
    celda(r.descripcion),
    derecha(`${Number(r.cantidad)} ${r.unidad}`),
    derecha(fmtM(Number(r.precio_unit))),
    derecha(fmtM(Number(r.precio_total)), { bold: true }),
  ])
  const resumen: TableCell[][] = [
    [celda('Mano de obra (avance)', { fontSize: 9 }), derecha(fmtM(Number(cert.mano_de_obra)), { fontSize: 9 })],
    [celda(`Materiales (${cert.renglones_lista.length} renglones)`, { fontSize: 9 }), derecha(fmtM(Number(cert.total_materiales)), { fontSize: 9 })],
    [celda('TOTAL DEL CERTIFICADO', { fontSize: 10, bold: true, color: NARANJA, fillColor: '#FEEDE3', margin: [2, 3, 2, 3] }),
     derecha(fmtM(Number(cert.total)), { fontSize: 10, bold: true, color: NARANJA, fillColor: '#FEEDE3', margin: [2, 3, 2, 3] })],
  ]
  if (cert.cobros.length) {
    resumen.push(
      [celda('Cobrado contra este certificado', { fontSize: 9 }), derecha(fmtM(cert.cobrado), { fontSize: 9 })],
      [celda('Saldo del certificado', { fontSize: 9, bold: true }), derecha(fmtM(cert.saldo), { fontSize: 9, bold: true })],
    )
  }
  const contenido: Content[] = [
    ...cabeceraPdf(logo, `Certificado N° ${cert.numero}`, `${obra.nom}  ·  ${obra.cod}`,
      [obra.cliente_nom ? `Cliente: ${obra.cliente_nom}` : null, `Corte al ${fmtFecha(cert.fecha_corte)}`, `Emitido el ${fmtFecha(cert.fecha_emision)}`].filter(Boolean).join('  ·  ')),
    ...(cert.estado === 'anulado' ? [{ text: `ANULADO — ${cert.anulado_motivo ?? ''}`, color: NARANJA, bold: true, fontSize: 10, margin: [0, 2, 0, 6] as [number, number, number, number] }] : []),
    ...(cert.obs ? [{ text: cert.obs, fontSize: 8, color: '#5E6B6B', margin: [0, 0, 0, 10] as [number, number, number, number] }] : []),
    tituloSeccion('RESUMEN'),
    { table: { widths: ['*', 'auto'], body: resumen }, layout: LAYOUT_RESUMEN, margin: [0, 0, 0, 16] },
    tituloSeccion('MATERIALES HASTA LA FECHA DE CORTE'),
    materiales.length
      ? { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'], body: [cabecera(['Fecha', 'Material', 'Cantidad', 'Unitario', 'Importe']), ...materiales] }, layout: LAYOUT_TABLA, margin: [0, 0, 0, 16] }
      : { text: 'Sin materiales en este certificado.', fontSize: 8, color: '#5E6B6B', margin: [0, 0, 0, 16] },
  ]
  if (cert.cobros.length) {
    contenido.push(
      tituloSeccion('COBROS CONTRA ESTE CERTIFICADO'),
      { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [cabecera(['Fecha', 'Medio', 'Mano de obra', 'Materiales', 'Total']),
            ...cert.cobros.map(c => [celda(fmtFecha(c.fecha)), celda(c.medio ? c.medio[0].toUpperCase() + c.medio.slice(1) : '—'), derecha(fmtM(Number(c.monto_mano_de_obra ?? 0))), derecha(fmtM(Number(c.monto_materiales ?? 0))), derecha(fmtM(Number(c.monto)), { bold: true })])] },
        layout: LAYOUT_TABLA },
    )
  }
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    footer: (page, total) => ({
      columns: [
        { text: `${EMPRESA.nombre} · ${obra.nom} · certificado N° ${cert.numero}`, fontSize: 7, color: '#5E6B6B' },
        { text: `Página ${page} de ${total}`, fontSize: 7, color: '#5E6B6B', alignment: 'right' },
      ],
      margin: [40, 12, 40, 0],
    }),
    defaultStyle: { color: '#1F2A2A' },
    content: contenido,
  }
  pdfMake.createPdf(doc).download(`Certificado_${cert.numero}_${obra.cod.replace(/[^\w-]+/g, '_')}_${toISO(new Date())}.pdf`)
}
