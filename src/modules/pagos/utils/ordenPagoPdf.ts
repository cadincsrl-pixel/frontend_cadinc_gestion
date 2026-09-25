/**
 * La orden de pago impresa (2026-09-23).
 *
 * Pedido del dueño: «¿el sistema puede generar un PDF orden de pago?», con el
 * de Finnegans de la otra razón social como modelo. Se respeta su estructura
 * porque es la que el contador y los proveedores ya saben leer:
 *
 *   1. Encabezado: quién paga, número y fecha.
 *   2. A quién se le paga.
 *   3. VALORES ENTREGADOS: con qué se pagó. Un cheque por renglón, con su
 *      número y fecha de cobro. SOLO PLATA: desde 20260925 la nota de crédito
 *      es un comprobante aparte y no entra en la OP.
 *   4. CANCELACIÓN DE DOCUMENTOS: qué facturas cubre y cuánto de cada una,
 *      con una columna informativa «NC aplicadas» (las NC que acreditan esa
 *      factura, para que se entienda por qué se paga menos que el total). Esa
 *      columna NO suma: lo cancelado por esta OP es plata.
 *   5. Firmas.
 *
 * Los dos totales tienen que dar lo mismo (valores = pagado = lo que se
 * cancela). Si no dieran, el papel mostraría una OP que no cierra: por eso se
 * suman de las mismas líneas y no de campos distintos.
 *
 * La cuenta destino va enmascarada salvo con `ver_pii`: el PDF se imprime y se
 * manda, y un CBU completo en un papel suelto es el dato con el que se estafa.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { TIPOS_COMPROBANTE, aplicacionFirme, comprobanteTxt, contraparteAplicacion, fmtM, formaPagoLabel } from './pagos.utils'
import type { PagosOrdenDetalle, PagosOrdenLinea } from '@/types/domain.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const AZUL  = '#1A365D'
const GRIS  = '#E6E6E6'
const ROJO  = '#C00000'
const LINEA = '#BBBBBB'

function fmtFecha(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/** 30714014346 → 30-71401434-6. Lo que no tenga 11 dígitos sale como vino. */
function fmtCuit(c: string | null | undefined): string {
  const d = (c ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (c ?? '')
}

const th = (t: string, alin: 'left' | 'right' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 7.5, fillColor: GRIS, alignment: alin, margin: [2, 3, 2, 3] })
const td = (t: string, alin: 'left' | 'right' = 'left', extra: Record<string, unknown> = {}): TableCell =>
  ({ text: t, fontSize: 8, alignment: alin, margin: [2, 3, 2, 3], ...extra })

/** El logo como dataURL. Si no se puede bajar, la OP sale igual, sin logo. */
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

function nombreDocumento(l: PagosOrdenLinea): string {
  if (!l.factura) return 'Documento'
  const t = TIPOS_COMPROBANTE.find(x => x.key === l.factura!.tipo_comprobante)
  return t && ['A', 'B', 'C'].includes(t.key) ? 'Factura de compra' : (t?.label ?? 'Comprobante')
}

/**
 * Las NC vigentes que acreditan la factura, en una línea: «NC A 0003-00000012
 * $300,00». Informativo (no suma). Las sin aprobar se marcan: todavía son
 * reserva, no bajaron la deuda.
 */
export function ncAplicadasTxt(l: PagosOrdenLinea): string {
  const ncs = (l.factura?.notas_credito ?? []).filter(a => a.vigente !== false)
  return ncs.map(a => {
    const c = contraparteAplicacion(a, 'factura')
    const comp = c.tipo_comprobante ? comprobanteTxt(c.tipo_comprobante, c.numero) : `#${c.id}`
    return `NC ${comp} ${fmtM(a.monto)}${aplicacionFirme(a) ? '' : ' (sin aprobar)'}`
  }).join('\n')
}

export async function descargarOrdenPagoPdf(o: PagosOrdenDetalle, opts: { verPii: boolean }): Promise<void> {
  const doc = armarOrdenPagoDoc(o, { ...opts, logo: await logoDataUrl() })
  const archivo = `${o.numero_fmt}_${o.proveedor_nom.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()}.pdf`
  pdfMake.createPdf(doc).download(archivo)
}

/** El documento, sin descargar: separado para poder generarlo fuera del navegador. */
export function armarOrdenPagoDoc(
  o: PagosOrdenDetalle, opts: { verPii: boolean; logo: string | null },
): TDocumentDefinitions {
  const logo = opts.logo
  const anulada = o.estado === 'anulada'
  // Solo plata: una línea `nota_credito` vieja (circuito anterior al 25/09,
  // no quedó ninguna) no entra ni en valores ni en lo cancelado.
  const lineasPlata = o.lineas.filter(l => l.tipo !== 'nota_credito')

  // ── Valores entregados ──
  const valores: TableCell[][] = []
  const destino = opts.verPii
    ? (o.cbu_destino ?? o.alias_destino ?? '')
    : (o.cbu_destino_ultimos4 ? `CBU ***${o.cbu_destino_ultimos4}` : (o.alias_destino ?? ''))

  if (o.cheques.length > 0) {
    for (const c of o.cheques) {
      valores.push([
        td(formaPagoLabel(o.forma_pago)),
        td(c.banco || ''),
        td(c.numero),
        td(fmtFecha(c.fecha_cobro)),
        td(c.es_propio ? 'Propio' : `Endosado — librador: ${c.librador}`),
        td(fmtM(c.monto), 'right'),
      ])
    }
  } else if (Number(o.monto_pagado) > 0) {
    valores.push([
      td(formaPagoLabel(o.forma_pago)),
      td(''),
      td(o.referencia || ''),
      td(''),
      td([o.proveedor_nom, destino].filter(Boolean).join(' · ')),
      td(fmtM(o.monto_pagado), 'right'),
    ])
  }
  const totalValores = Number(o.monto_pagado)

  // ── Cancelación: una fila por factura ──
  const porFactura = new Map<number, { l: PagosOrdenLinea; cancelado: number }>()
  const aCuenta: PagosOrdenLinea[] = []
  for (const l of lineasPlata) {
    if (l.tipo === 'a_cuenta' || l.factura_id == null) { aCuenta.push(l); continue }
    const prev = porFactura.get(l.factura_id)
    if (prev) prev.cancelado += Number(l.monto)
    else porFactura.set(l.factura_id, { l, cancelado: Number(l.monto) })
  }
  const cancelacion: TableCell[][] = [...porFactura.values()].map(({ l, cancelado }) => [
    td(nombreDocumento(l)),
    td(l.factura ? `${l.factura.tipo_comprobante}-${l.factura.numero?.trim() || 's/n'}` : ''),
    td(fmtFecha(l.factura?.fecha)),
    td(fmtFecha(l.factura?.vence_el)),
    td(l.factura ? fmtM(l.factura.total) : '', 'right'),
    td(ncAplicadasTxt(l), 'right', { fontSize: 7, color: '#5A2D82' }),
    td(fmtM(cancelado), 'right'),
  ])
  for (const l of aCuenta) {
    cancelacion.push([td('Anticipo a cuenta'), td(''), td(''), td(''), td(''), td(''), td(fmtM(l.monto), 'right')])
  }
  const totalCancelado = [...porFactura.values()].reduce((s, x) => s + x.cancelado, 0)
    + aCuenta.reduce((s, l) => s + Number(l.monto), 0)

  const filaTotal = (label: string, monto: number): Content => ({
    columns: [
      { width: '*', text: '' },
      { width: 60, text: label, bold: true, fontSize: 8.5, alignment: 'right', margin: [0, 4, 6, 0] },
      { width: 80, stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.8 }] },
        { text: fmtM(monto), bold: true, fontSize: 8.5, alignment: 'right', margin: [0, 3, 2, 0] },
      ] },
    ],
    margin: [0, 2, 0, 0],
  })

  const tabla = (headers: TableCell[], widths: (string | number)[], body: TableCell[][], vacio: string): Content => {
    const filaVacia: TableCell[] = [
      { text: vacio, colSpan: headers.length, fontSize: 8, italics: true, color: '#777', margin: [2, 3, 2, 3] },
      ...headers.slice(1).map((): TableCell => ''),
    ]
    return {
      table: { headerRows: 1, widths, body: [headers, ...(body.length > 0 ? body : [filaVacia])] },
      layout: 'noBorders',
    }
  }

  const dato = (label: string, valor: string): Content => ({
    columns: [
      { width: 90, text: label, bold: true, fontSize: 8.5 },
      { width: '*', text: valor, fontSize: 8.5 },
    ],
    margin: [0, 1, 0, 1],
  })

  const firma = (titulo: string, nombre = ''): Content => ({
    table: {
      widths: ['*'], heights: [52],
      body: [[{ stack: [
        { text: titulo, fontSize: 7.5, bold: true },
        { text: nombre, fontSize: 7, color: '#555', margin: [0, 30, 0, 0] },
      ] }]],
    },
    layout: { hLineColor: () => '#333', vLineColor: () => '#333' },
  })

  const content: Content[] = [
    // Encabezado
    {
      columns: [
        // El logo va al lado de los datos, no arriba: es vertical (símbolo
        // sobre «CADINC») y apilado se comía medio encabezado.
        ...(logo ? [{ width: 50, image: logo, fit: [50, 68] as [number, number] }] : []),
        {
          width: '*',
          margin: [logo ? 10 : 0, 14, 0, 0] as [number, number, number, number],
          stack: [
            { text: EMPRESA.nombre, fontSize: 15, bold: true, color: AZUL },
            ...(EMPRESA.domicilio ? [{ text: EMPRESA.domicilio, fontSize: 8.5 }] : []),
            { text: `${EMPRESA.condicionIva}   CUIT ${EMPRESA.cuit}`, fontSize: 8.5 },
          ],
        },
        {
          width: 90,
          stack: [
            { text: 'OP', fontSize: 26, bold: true, alignment: 'center' },
            { text: 'No válido como factura', fontSize: 7, alignment: 'center' },
          ],
          margin: [0, 6, 0, 0],
        },
        {
          width: 170,
          stack: [
            { text: 'Orden de pago', fontSize: 15, margin: [0, 6, 0, 10] },
            dato('Número:', o.numero_fmt),
            dato('Fecha:', fmtFecha(o.fecha)),
          ],
        },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.8 }], margin: [0, 10, 0, 10] },

    // Proveedor
    {
      columns: [
        { width: '*', stack: [
          dato('Razón social:', o.proveedor_nom),
          ...(o.proveedor_codigo ? [dato('Código:', o.proveedor_codigo)] : []),
        ] },
        { width: 200, stack: [dato('CUIT:', fmtCuit(o.proveedor_cuit))] },
      ],
    },
    ...(o.obs || o.referencia ? [{
      margin: [0, 8, 0, 0] as [number, number, number, number],
      stack: [dato('Observaciones:', [o.referencia, o.obs].filter(Boolean).join(' · '))],
    }] : []),

    ...(anulada ? [{
      text: `ANULADA${o.motivo_anulacion ? ` — ${o.motivo_anulacion}` : ''}${o.anulado_at ? ` (${fmtFecha(o.anulado_at)})` : ''}`,
      color: ROJO, bold: true, fontSize: 11, margin: [0, 10, 0, 0] as [number, number, number, number],
    }] : []),

    // Valores entregados
    { text: 'VALORES ENTREGADOS', bold: true, fontSize: 9, margin: [0, 16, 0, 4] },
    tabla(
      [th('Forma'), th('Banco'), th('Número / ref.'), th('F. cobro'), th('Detalle'), th('Importe', 'right')],
      [70, 70, 70, 50, '*', 70],
      valores,
      'Sin valores entregados.',
    ),
    filaTotal('Total:', totalValores),

    // Cancelación
    { text: 'EN CONCEPTO DE CANCELACIÓN DE DOCUMENTOS Y ADELANTOS', bold: true, fontSize: 9, margin: [0, 16, 0, 4] },
    tabla(
      [th('Documento'), th('Comprobante'), th('Fecha'), th('F. vto.'), th('Imp. compr.', 'right'), th('NC aplicadas', 'right'), th('Cancelado', 'right')],
      ['*', 90, 45, 45, 62, 80, 62],
      cancelacion,
      'Sin documentos.',
    ),
    filaTotal('Total:', totalCancelado),
  ]

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 130],
    defaultStyle: { font: 'Roboto', fontSize: 8.5 },
    ...(anulada ? { watermark: { text: 'ANULADA', color: ROJO, opacity: 0.12, bold: true } } : {}),
    // Las firmas van al pie de CADA página, como en Finnegans: el papel se
    // firma abajo aunque la OP sea corta.
    footer: (page, count) => ({
      margin: [28, 0, 28, 0],
      stack: [
        {
          columns: [
            firma('Emitió', o.created_by_nombre ?? ''),
            firma('Autorizó'),
            firma('Recibí conforme'),
          ],
          columnGap: 24,
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.5, lineColor: LINEA }], margin: [0, 10, 0, 4] },
        {
          columns: [
            { text: `Emitido por el sistema de gestión de ${EMPRESA.nombre}`, fontSize: 7, color: '#777' },
            { text: count > 1 ? `Página ${page} de ${count}` : '', fontSize: 7, color: '#777', alignment: 'right' },
          ],
        },
      ],
    }),
    content,
    info: { title: `${o.numero_fmt} ${o.proveedor_nom}` },
  }
  return doc
}
