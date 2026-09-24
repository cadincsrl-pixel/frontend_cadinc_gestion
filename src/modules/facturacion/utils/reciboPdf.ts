/**
 * El recibo de cobranza impreso (RC 0001-0000000N), para mandarle al cliente.
 *
 * Mismo lenguaje visual que la factura (`facturaPdf.ts`): emisor a la
 * izquierda, recuadro con el título y el número a la derecha. Adentro, en el
 * orden en que lo lee el cliente:
 *   1. De quién se recibió y cuánto, en números y en letras.
 *   2. Medios de cobro (transferencia a qué cuenta, cheques con número,
 *      banco, librador y fecha de cobro).
 *   3. Retenciones sufridas, con su certificado.
 *   4. Comprobantes que cancela (las imputaciones vigentes) y lo que queda a
 *      cuenta.
 * Un recibo anulado sale con marca de agua ANULADO y el motivo; uno de
 * homologación, con la marca de prueba.
 *
 * Los importes salen del cobro guardado: el PDF no recalcula nada.
 */
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { VentasCobroDetalle } from '@/types/domain.types'
import { importeALetras } from './numeroALetras'
import { fmtCuit, fmtFecha, fmtFechaHora, fmtN } from './facturacion.utils'
import { FORMA_LABEL, RETENCION_CORTO, esFormaCheque } from './cobranzas.utils'
import { logoDataUrl } from './facturaPdf'
import {
  CARBON, MARGEN_X, NARANJA, NARANJA_SUAVE, ROJO, TENUE, cajaFina, datosFiscales, descargarPdf, encabezado,
  layoutLista, par, pie, slugArchivo, td, th, type Margen,
} from './pdfVentas'

export function nombreArchivoRecibo(d: VentasCobroDetalle): string {
  const n = d.cobro.numero_fmt.replace(/^RC\s*/, '').replace(/\s+/g, '')
  return `${d.cobro.estado === 'anulado' ? 'ANULADO_' : ''}RC_${n}_${slugArchivo(d.cobro.cliente_razon_social)}.pdf`
}

export async function descargarReciboPdf(d: VentasCobroDetalle): Promise<void> {
  descargarPdf(armarReciboDoc(d, { logo: await logoDataUrl() }), nombreArchivoRecibo(d))
}

/** El detalle de un medio de cobro en una línea. */
export function detalleMedio(m: VentasCobroDetalle['medios'][number]): string {
  if (m.forma === 'transferencia') {
    const cuenta = [m.cuenta_banco, m.cuenta_alias || m.cuenta_cbu].filter(Boolean).join(' · ')
    return cuenta ? `A ${cuenta}` : ''
  }
  if (esFormaCheque(m.forma)) {
    return [
      m.cheque_numero ? `N° ${m.cheque_numero}` : null,
      m.cheque_banco,
      m.cheque_librador ? `Librador: ${m.cheque_librador}` : null,
      m.cheque_fecha_cobro ? `Cobro: ${fmtFecha(m.cheque_fecha_cobro)}` : null,
    ].filter(Boolean).join(' · ')
  }
  return m.obs ?? ''
}

/** El documento, sin descargar (testeable fuera del navegador). */
export function armarReciboDoc(d: VentasCobroDetalle, opts: { logo: string | null }): TDocumentDefinitions {
  const c = d.cobro
  const anulado = c.estado === 'anulado'
  const homo = c.es_homologacion
  const imputaciones = d.imputaciones.filter(i => !i.anulada)

  const cabecera = encabezado(opts.logo, [
    { text: 'RECIBO', fontSize: 16, bold: true, color: NARANJA },
    { text: 'Documento no válido como factura', fontSize: 7, color: TENUE, margin: [0, 1, 0, 4] as Margen },
    { text: c.numero_fmt, fontSize: 14, bold: true, margin: [0, 0, 0, 4] as Margen },
    par('Fecha:', fmtFecha(c.fecha), 66),
    ...datosFiscales(),
  ])

  const cliente: Content = {
    table: {
      widths: ['*'],
      body: [[{
        margin: [6, 5, 6, 5],
        stack: [
          par('Recibimos de:', c.cliente_razon_social, 76),
          par('C.U.I.T.:', fmtCuit(c.cliente_doc_nro), 76),
          {
            text: [{ text: 'La suma de pesos: ', bold: true }, importeALetras(Number(c.total))],
            fontSize: 8.5, margin: [0, 4, 0, 0] as Margen,
          },
        ],
      }]],
    },
    layout: cajaFina,
    margin: [0, 6, 0, 0],
  }

  const titulo = (t: string): Content => ({ text: t, bold: true, fontSize: 9, margin: [0, 10, 0, 3] as Margen })

  const medios: Content[] = d.medios.length ? [
    titulo('Medios de cobro'),
    {
      table: {
        headerRows: 1, dontBreakRows: true,
        widths: [70, '*', 80],
        body: [
          [th('Forma'), th('Detalle'), th('Importe', 'right')],
          ...d.medios.map(m => [td(FORMA_LABEL[m.forma] ?? m.forma), td(detalleMedio(m)), td(fmtN(m.importe), 'right')]),
        ],
      },
      layout: layoutLista,
    },
  ] : []

  const retenciones: Content[] = d.retenciones.length ? [
    titulo('Retenciones'),
    {
      table: {
        headerRows: 1, dontBreakRows: true,
        widths: [60, '*', 90, 56, 80],
        body: [
          [th('Tipo'), th('Jurisdicción'), th('Certificado'), th('Fecha'), th('Importe', 'right')],
          ...d.retenciones.map(r => [
            td(RETENCION_CORTO[r.tipo] ?? r.tipo), td(r.jurisdiccion || '—'), td(r.certificado_numero || '—'),
            td(fmtFecha(r.fecha)), td(fmtN(r.importe), 'right'),
          ]),
        ],
      },
      layout: layoutLista,
    },
  ] : []

  const aplicados: Content[] = [
    titulo('Comprobantes que cancela'),
    imputaciones.length ? {
      table: {
        headerRows: 1, dontBreakRows: true,
        widths: ['*', 60, 80, 80],
        body: [
          [th('Comprobante'), th('Emisión'), th('Total', 'right'), th('Aplicado', 'right')],
          ...imputaciones.map(i => [
            td(i.destino_fmt), td(fmtFecha(i.destino_fecha)),
            td(fmtN(i.destino_total), 'right'), td(fmtN(i.importe), 'right'),
          ]),
        ],
      },
      layout: layoutLista,
    } : { text: 'Sin comprobantes aplicados: todo el importe queda a cuenta.', fontSize: 8.5, color: TENUE, italics: true },
  ]

  const fila = (label: string, valor: number, fuerte = false): TableCell[] => [
    { text: label, fontSize: fuerte ? 10 : 8.5, bold: fuerte, color: fuerte ? CARBON : TENUE, margin: [6, fuerte ? 4 : 2, 4, fuerte ? 4 : 2], ...(fuerte ? { fillColor: NARANJA_SUAVE } : {}) },
    { text: `$ ${fmtN(valor)}`, fontSize: fuerte ? 11 : 8.5, bold: fuerte, alignment: 'right', margin: [4, fuerte ? 4 : 2, 6, fuerte ? 4 : 2], ...(fuerte ? { fillColor: NARANJA_SUAVE } : {}) },
  ]
  const totales: Content = {
    columns: [
      {
        width: '*',
        stack: c.obs?.trim() ? [
          { text: 'Observaciones', bold: true, fontSize: 7.5, color: TENUE, margin: [0, 12, 0, 0] as Margen },
          { text: c.obs.trim(), fontSize: 8.5, margin: [0, 2, 12, 0] as Margen },
        ] : [{ text: '' }],
      },
      {
        width: 230,
        margin: [0, 10, 0, 0] as Margen,
        table: {
          widths: ['*', 100],
          body: [
            fila('Medios de cobro', Number(c.total_medios)),
            fila('Retenciones', Number(c.total_retenciones)),
            fila('TOTAL COBRADO', Number(c.total), true),
            fila('Aplicado a comprobantes', Number(c.aplicado)),
            fila('A cuenta', Number(c.a_cuenta)),
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 2 || i === 3 ? 1 : 0),
          vLineWidth: () => 0,
          hLineColor: () => NARANJA,
        },
      },
    ],
  }

  const firma: Content = {
    columns: [
      { width: '*', text: '' },
      {
        width: 200,
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: TENUE }] },
          { text: `p/ ${EMPRESA.razonSocialFactura}`, fontSize: 8, color: TENUE, alignment: 'center', margin: [0, 3, 0, 0] as Margen },
        ],
        margin: [0, 40, 0, 0] as Margen,
      },
    ],
  }

  const anuladoAviso: Content[] = anulado ? [{
    table: {
      widths: ['*'],
      body: [[{
        text: [
          { text: 'RECIBO ANULADO', bold: true },
          c.anulado_el ? ` el ${fmtFechaHora(c.anulado_el)}` : '',
          c.anulado_por_nombre ? ` por ${c.anulado_por_nombre}` : '',
          c.anulado_motivo ? `. Motivo: ${c.anulado_motivo}` : '',
        ],
        color: ROJO, fontSize: 8.5, margin: [6, 4, 6, 4],
      }]],
    },
    layout: { hLineColor: () => ROJO, vLineColor: () => ROJO, hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
    margin: [0, 6, 0, 0] as Margen,
  }] : []

  const marca = anulado
    ? { watermark: { text: 'ANULADO', color: ROJO, opacity: 0.15, bold: true, fontSize: 80 } }
    : homo ? { watermark: { text: 'PRUEBA — HOMOLOGACIÓN', color: ROJO, opacity: 0.13, bold: true, fontSize: 40 } } : {}

  return {
    pageSize: 'A4',
    pageMargins: [MARGEN_X, MARGEN_X, MARGEN_X, 40],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: CARBON },
    ...marca,
    footer: pie(homo ? 'PRUEBA — recibo de homologación, sin valor' : undefined),
    content: [cabecera, ...anuladoAviso, cliente, ...medios, ...retenciones, ...aplicados, totales, firma],
    info: { title: `Recibo ${c.numero_fmt} ${c.cliente_razon_social}` },
  }
}
