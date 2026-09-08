// El PDF de UN certificado (20260911h): lo que se le entrega al cliente.
// Numero, fecha de corte, mano de obra por avance, los materiales congelados
// en ese certificado, y lo cobrado contra el. Reusa los helpers del export de
// la cuenta para que se vea igual.
import pdfMake from 'pdfmake/build/pdfmake'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { toISO } from '@/lib/utils/dates'
import type { Obra, CertificadoDetalle } from '@/types/domain.types'
import { AZUL, NARANJA, fmtM, fmtFecha, celda, cabecera, derecha } from './exportCuenta'

export function descargarPdfCertificado(cert: CertificadoDetalle, obra: Obra): void {
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
    [celda('TOTAL DEL CERTIFICADO', { fontSize: 9, bold: true }), derecha(fmtM(Number(cert.total)), { fontSize: 9, bold: true })],
  ]
  if (cert.cobros.length) {
    resumen.push(
      [celda('Cobrado contra este certificado', { fontSize: 9 }), derecha(fmtM(cert.cobrado), { fontSize: 9 })],
      [celda('SALDO', { fontSize: 9, bold: true, color: NARANJA }), derecha(fmtM(cert.saldo), { fontSize: 9, bold: true, color: NARANJA })],
    )
  }
  const contenido: Content[] = [
    { text: EMPRESA.nombre, color: NARANJA, bold: true, fontSize: 16 },
    { text: `CERTIFICADO N° ${cert.numero}`, color: AZUL, bold: true, fontSize: 12, margin: [0, 2, 0, 0] },
    { text: `${obra.nom} (${obra.cod}) · corte al ${fmtFecha(cert.fecha_corte)} · emitido el ${fmtFecha(cert.fecha_emision)}`, fontSize: 9, color: '#555', margin: [0, 2, 0, 2] },
    ...(cert.estado === 'anulado' ? [{ text: `ANULADO — ${cert.anulado_motivo ?? ''}`, color: NARANJA, bold: true, fontSize: 10, margin: [0, 2, 0, 6] as [number, number, number, number] }] : []),
    ...(cert.obs ? [{ text: cert.obs, fontSize: 8, color: '#555', margin: [0, 0, 0, 8] as [number, number, number, number] }] : []),
    { text: 'RESUMEN', color: AZUL, bold: true, fontSize: 10, margin: [0, 6, 0, 4] },
    { table: { widths: ['*', 'auto'], body: resumen }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] },
    { text: 'MATERIALES HASTA LA FECHA DE CORTE', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
    materiales.length
      ? { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'], body: [cabecera(['Fecha', 'Material', 'Cantidad', 'Unitario', 'Importe']), ...materiales] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] }
      : { text: 'Sin materiales en este certificado.', fontSize: 8, color: '#777', margin: [0, 0, 0, 14] },
  ]
  if (cert.cobros.length) {
    contenido.push(
      { text: 'COBROS CONTRA ESTE CERTIFICADO', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [cabecera(['Fecha', 'Medio', 'Mano de obra', 'Materiales', 'Total']),
            ...cert.cobros.map(c => [celda(fmtFecha(c.fecha)), celda(c.medio ?? '—'), derecha(fmtM(Number(c.monto_mano_de_obra ?? 0))), derecha(fmtM(Number(c.monto_materiales ?? 0))), derecha(fmtM(Number(c.monto)), { bold: true })])] },
        layout: 'lightHorizontalLines' },
    )
  }
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    footer: (page, total) => ({
      text: `${EMPRESA.nombre} · ${obra.nom} · certificado N° ${cert.numero} · página ${page} de ${total}`,
      alignment: 'center', fontSize: 7, color: '#999', margin: [0, 10, 0, 0],
    }),
    content: contenido,
  }
  pdfMake.createPdf(doc).download(`Certificado_${cert.numero}_${obra.cod.replace(/[^\w-]+/g, '_')}_${toISO(new Date())}.pdf`)
}
