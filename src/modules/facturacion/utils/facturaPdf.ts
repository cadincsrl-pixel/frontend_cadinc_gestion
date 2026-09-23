/**
 * La factura (o NC) de venta impresa, calcada del modelo de Finnegans
 * (factura A 00002-00001273 a ARCOR, 11/09/2026): es lo que los clientes ya
 * reciben y lo que el contador sabe leer.
 *
 *   1. Encabezado: emisor (logo, razón social, domicilio, teléfono, condición
 *      IVA) | recuadro con la LETRA y "Cod.:001" | "FACTURA ORIGINAL", número,
 *      fecha, CUIT, Ingresos Brutos e inicio de actividades.
 *   2. Receptor: la FOTO que guardó la factura (`rec_*`), no el padrón de hoy.
 *      Si el cliente cambió de domicilio después, la factura dice lo que decía.
 *   3. Renglones: Descripción, Cantidad, Unidad, Precio, Subtotal, Alícuota IVA,
 *      Subtotal c/IVA.
 *   4. IVA por alícuota, "Son:" en letras, observaciones y la línea de totales.
 *   5. QR de ARCA + CAE + vencimiento del CAE. Sin código de barras: el QR lo
 *      reemplazó.
 *
 * Los importes salen de la base (imp_neto, imp_iva, alícuotas): el PDF no
 * recalcula nada que ARCA ya autorizó. Solo el "Subtotal c/IVA" por renglón es
 * de muestra (el IVA real va por alícuota, no por renglón).
 *
 * En homologación lleva marca de agua: no tiene validez fiscal.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { VentasFacturaFJ } from '@/types/domain.types'
import { conIvaRenglon } from './facturacion.calculos'
import { importeALetras } from './numeroALetras'
import { urlQrArca } from './qrArca'
import {
  ALICUOTA_LABEL, CONDICIONES_IVA, DOC_TIPOS, TIPOS_CBTE, fmtCant, fmtCuit, fmtFecha, fmtN, fmtPrecio,
} from './facturacion.utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const GRIS  = '#E6E6E6'
const LINEA = '#999999'
const ROJO  = '#C00000'
const ANCHO = 539

async function logoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(EMPRESA.logoPapelUrl)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string | null>((ok) => {
      const fr = new FileReader()
      fr.onload = () => ok(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => ok(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function nombreArchivoFactura(fj: VentasFacturaFJ): string {
  const f = fj.factura
  const tipo = TIPOS_CBTE.find(t => t.key === f.cbte_tipo)?.corto ?? 'CBTE'
  const cli = f.rec_razon_social.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
  return `${tipo}_${f.numero_fmt ?? `borrador-${f.id}`}_${cli}.pdf`
}

export async function descargarFacturaPdf(fj: VentasFacturaFJ): Promise<void> {
  const doc = armarFacturaDoc(fj, { logo: await logoDataUrl() })
  pdfMake.createPdf(doc).download(nombreArchivoFactura(fj))
}

const th = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 7.5, fillColor: GRIS, alignment: alin, margin: [2, 3, 2, 3] })
const td = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, fontSize: 8, alignment: alin, margin: [2, 3, 2, 3] })

const par = (label: string, valor: string, anchoLabel = 62): Content => ({
  columns: [
    { width: anchoLabel, text: label, bold: true, fontSize: 8.5 },
    { width: '*', text: valor, fontSize: 8.5 },
  ],
  margin: [0, 1, 0, 1],
})

/** El documento, sin descargar: separado para poder testearlo o generarlo fuera del navegador. */
export function armarFacturaDoc(fj: VentasFacturaFJ, opts: { logo: string | null }): TDocumentDefinitions {
  const f = fj.factura
  const esNc = f.es_nc
  const homo = f.es_homologacion
  const autorizada = f.estado === 'autorizada' && !!f.cae && !!f.numero
  const titulo = esNc ? 'NOTA DE CRÉDITO' : 'FACTURA'
  const docRec = DOC_TIPOS.find(d => d.id === f.rec_doc_tipo)
  const docRecTxt = f.rec_doc_tipo === 80 || f.rec_doc_tipo === 86 ? fmtCuit(f.rec_doc_nro) : f.rec_doc_nro
  const numero = f.numero_fmt ?? (f.numero_intentado_fmt ? `${f.numero_intentado_fmt} (sin autorizar)` : 'BORRADOR')

  // ── 1. Encabezado ──
  const emisor: Content = {
    columns: [
      ...(opts.logo ? [{ width: 46, image: opts.logo, fit: [46, 62] as [number, number] }] : []),
      {
        width: '*',
        margin: [opts.logo ? 8 : 0, 4, 0, 0] as [number, number, number, number],
        stack: [
          { text: EMPRESA.razonSocialFactura, fontSize: 13, bold: true },
          { text: EMPRESA.domicilioFactura1, fontSize: 8 },
          { text: EMPRESA.domicilioFactura2, fontSize: 8 },
          { text: `Tel. ${EMPRESA.tel}`, fontSize: 8 },
          { text: EMPRESA.condicionIva, fontSize: 8, bold: true, margin: [0, 3, 0, 0] },
        ],
      },
    ],
  }
  const letra: Content = {
    table: {
      widths: [44],
      body: [
        [{ text: f.letra, fontSize: 30, bold: true, alignment: 'center', margin: [0, 0, 0, 0] }],
        [{ text: `Cod.:${f.cod_cbte}`, fontSize: 7, alignment: 'center' }],
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0 : 1),
      vLineWidth: () => 1,
    },
    margin: [4, 0, 4, 0],
  }
  const comprobante: Content = {
    stack: [
      { text: `${titulo} ORIGINAL`, fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
      par('Número:', numero, 70),
      par('Fecha:', fmtFecha(f.fecha_cbte), 70),
      par('C.U.I.T.:', EMPRESA.cuit, 70),
      par('Ing. Brutos:', EMPRESA.iibb, 70),
      par('Inic. Act.:', EMPRESA.inicioActividades, 70),
    ],
  }
  const encabezado: Content = {
    table: {
      widths: ['*', 52, 205],
      body: [[
        { stack: [emisor], margin: [4, 4, 4, 4] },
        { stack: [letra], margin: [0, 0, 0, 0] },
        { stack: [comprobante], margin: [6, 4, 4, 4] },
      ]],
    },
    layout: {
      hLineWidth: () => 0.8, vLineWidth: (i: number, node) => (i === 0 || i === node.table.widths!.length ? 0.8 : 0),
      hLineColor: () => LINEA, vLineColor: () => LINEA,
    },
  }

  // ── 2. Receptor ──
  const asoc = fj.asociados[0]
  const asocTxt = asoc
    ? `${TIPOS_CBTE.find(t => t.key === asoc.cbte_tipo)?.corto ?? 'FA'} ${String(asoc.pto_vta).padStart(5, '0')}-${String(asoc.numero).padStart(8, '0')} del ${fmtFecha(asoc.fecha_cbte)}`
    : (f.asociada_numero_fmt ? `FA ${f.asociada_numero_fmt}` : null)
  const receptor: Content = {
    table: {
      widths: ['*', 190],
      body: [[
        {
          margin: [4, 4, 4, 4],
          stack: [
            par('Sr.(es):', f.rec_razon_social),
            par('Domicilio:', f.rec_domicilio || '—'),
            par('Cond. IVA:', CONDICIONES_IVA[f.rec_condicion_iva_id] ?? String(f.rec_condicion_iva_id)),
            par(`${docRec?.corto ?? 'Doc.'}:`, docRecTxt),
          ],
        },
        {
          margin: [4, 4, 4, 4],
          stack: [
            par('Cond. de Pago:', f.condicion_pago, 68),
            par('Moneda:', 'Pesos', 68),
            par('Remitos:', f.remitos || '', 68),
          ],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0.8, vLineWidth: (i: number) => (i === 1 ? 0 : 0.8),
      hLineColor: () => LINEA, vLineColor: () => LINEA,
    },
    margin: [0, 6, 0, 0],
  }

  // ── 3. Renglones ──
  const renglones: TableCell[][] = fj.renglones.map(r => [
    td(r.descripcion),
    td(fmtCant(r.cantidad), 'right'),
    td(r.unidad),
    td(fmtPrecio(r.precio_unit), 'right'),
    td(fmtN(r.importe_neto), 'right'),
    td(ALICUOTA_LABEL[r.alicuota_id] ?? '', 'right'),
    td(fmtN(conIvaRenglon(Number(r.importe_neto), r.alicuota_id)), 'right'),
  ])
  const tablaRenglones: Content = {
    table: {
      headerRows: 1,
      widths: ['*', 44, 44, 62, 64, 38, 70],
      body: [
        [th('Descripción'), th('Cantidad', 'right'), th('Unidad'), th('Precio', 'right'), th('Subtotal', 'right'),
         th('Alíc. IVA', 'right'), th('Subtotal c/IVA', 'right')],
        ...renglones,
      ],
    },
    layout: {
      hLineWidth: (i: number, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.2),
      vLineWidth: () => 0,
      hLineColor: () => LINEA,
    },
    margin: [0, 8, 0, 0],
  }

  // ── 4. IVA, Son, observaciones, totales ──
  const ivas: Content[] = fj.alicuotas
    .filter(a => Number(a.importe) !== 0 || Number(a.base_imp) !== 0)
    .map(a => ({
      columns: [
        { width: '*', text: '' },
        { width: 150, text: `IVA ${ALICUOTA_LABEL[a.alicuota_id] ?? ''} s/ ${fmtN(a.base_imp)}`, fontSize: 8, alignment: 'right' },
        { width: 80, text: fmtN(a.importe), fontSize: 8, alignment: 'right' },
      ],
      margin: [0, 1, 0, 1],
    }))

  const totales: Content = {
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [
        [th('Neto Gravado', 'right'), th('IVA', 'right'), th('Otros tributos', 'right'), th('Exento', 'right'), th('Total', 'right')],
        [
          td(fmtN(f.imp_neto), 'right'),
          td(fmtN(f.imp_iva), 'right'),
          td(fmtN(f.imp_trib), 'right'),
          td(fmtN(f.imp_op_ex), 'right'),
          { text: `$ ${fmtN(f.imp_total)}`, bold: true, fontSize: 10, alignment: 'right', margin: [2, 3, 2, 3] },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => LINEA, vLineColor: () => LINEA,
    },
    margin: [0, 8, 0, 0],
  }

  // ── 5. QR + CAE ──
  const pie: Content = autorizada
    ? {
        columns: [
          {
            width: 92,
            qr: urlQrArca({
              fecha:      f.fecha_cbte,
              cuit:       EMPRESA.cuit,
              ptoVta:     f.pto_vta,
              tipoCmp:    f.cbte_tipo,
              nroCmp:     f.numero!,
              importe:    Number(f.imp_total),
              moneda:     f.moneda || 'PES',
              ctz:        Number(f.cotizacion) || 1,
              tipoDocRec: f.rec_doc_tipo,
              nroDocRec:  f.rec_doc_nro,
              codAut:     f.cae!,
            }),
            fit: 88,
            eccLevel: 'M',
          },
          {
            width: '*',
            margin: [10, 14, 0, 0],
            stack: [
              { text: 'Comprobante Autorizado', bold: true, fontSize: 9 },
              { text: 'Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación', fontSize: 6.5, color: '#666', margin: [0, 2, 0, 6] },
              par('CAE N°:', f.cae!, 110),
              par('Fecha de Vto. de CAE:', fmtFecha(f.cae_vto), 110),
            ],
          },
        ],
        margin: [0, 14, 0, 0],
      }
    : {
        text: 'Comprobante NO autorizado por ARCA: sin CAE, no tiene validez.',
        color: ROJO, bold: true, fontSize: 10, margin: [0, 14, 0, 0],
      }

  const content: Content[] = [
    encabezado,
    receptor,
    ...(esNc && asocTxt ? [{
      text: [{ text: 'Comprobante asociado: ', bold: true }, asocTxt],
      fontSize: 8.5, margin: [0, 5, 0, 0] as [number, number, number, number],
    }] : []),
    tablaRenglones,
    ...(ivas.length > 0 ? [{ stack: ivas, margin: [0, 6, 0, 0] as [number, number, number, number] }] : []),
    {
      text: [{ text: 'Son: ', bold: true }, importeALetras(Number(f.imp_total))],
      fontSize: 8.5, margin: [0, 8, 0, 0],
    },
    ...(f.observaciones ? [{
      text: [{ text: 'Observaciones: ', bold: true }, f.observaciones],
      fontSize: 8.5, margin: [0, 6, 0, 0] as [number, number, number, number],
    }] : []),
    totales,
    pie,
  ]

  return {
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 40],
    defaultStyle: { font: 'Roboto', fontSize: 8.5 },
    ...(homo ? { watermark: { text: 'HOMOLOGACIÓN — SIN VALIDEZ FISCAL', color: ROJO, opacity: 0.14, bold: true, fontSize: 34 } } : {}),
    footer: (page, count) => ({
      margin: [28, 8, 28, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 0.5, lineColor: LINEA }] },
        {
          columns: [
            { text: homo ? 'HOMOLOGACIÓN — comprobante de prueba, sin validez fiscal' : `Emitido por el sistema de gestión de ${EMPRESA.nombre}`, fontSize: 7, color: homo ? ROJO : '#777', margin: [0, 3, 0, 0] },
            { text: count > 1 ? `Página ${page} de ${count}` : '', fontSize: 7, color: '#777', alignment: 'right', margin: [0, 3, 0, 0] },
          ],
        },
      ],
    }),
    content,
    info: { title: `${titulo} ${f.letra} ${f.numero_fmt ?? ''} ${f.rec_razon_social}`.trim() },
  }
}
