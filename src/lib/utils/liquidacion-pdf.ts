// Generador de PDF para liquidaciones de chofer.
// Lib: pdfmake (Roboto incluido por defecto, soporte UTF-8 sin issues).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'

// Inicialización del VFS para que pdfmake encuentre Roboto.
// La estructura del module varía según versión: a veces es .vfs, a veces
// el module es directamente el vfs object.
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

export interface PdfLiquidacionTramo {
  fecha:       string | null
  tipo:        'cargado' | 'vacio'
  cantera:     string | null
  deposito:    string | null
  km:          number
  toneladas:   number | null
  remito:      string | null
}

export interface PdfLiquidacionAdelanto {
  fecha:       string
  descripcion: string
  monto:       number
}

export interface PdfLiquidacionGasto {
  fecha:       string
  categoria:   string
  proveedor:   string | null
  descripcion: string | null
  monto:       number
}

export interface PdfLiquidacionArgs {
  chofer_nombre:   string
  chofer_cuil:     string | null
  camion_patente:  string | null
  fecha_desde:     string
  fecha_hasta:     string
  dias_trabajados:    number
  basico_dia:         number
  basico_mensual:     number
  km_cargados:        number
  km_vacios:          number
  precio_km_cargado:  number
  precio_km_vacio:    number
  subtotal_basico:    number
  subtotal_km:        number
  total_adelantos:    number
  total_reintegros:   number
  total_neto:         number
  tramos:    PdfLiquidacionTramo[]
  adelantos: PdfLiquidacionAdelanto[]
  gastos:    PdfLiquidacionGasto[]
  estado:           'borrador' | 'cerrada'
  numero_liquidacion: number | null
  observaciones:    string | null
}

const fmtFecha = (s: string | null | undefined): string => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

const fmtM = (n: number): string =>
  '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtN = (n: number, dec = 0): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export function generarPdfLiquidacion(args: PdfLiquidacionArgs): void {
  const titulo = args.estado === 'cerrada'
    ? `LIQUIDACIÓN N° ${args.numero_liquidacion ?? '—'}`
    : 'LIQUIDACIÓN — VISTA PREVIA'

  // ── Tabla de tramos ─────────────────────────────────────────────
  const tramosTable: Content = args.tramos.length === 0 ? { text: '' } : {
    style: 'table',
    table: {
      headerRows: 1,
      widths: [55, 50, '*', 40, 35, 60],
      body: [
        [
          { text: 'Fecha',  style: 'tableHeader' },
          { text: 'Tipo',   style: 'tableHeader' },
          { text: 'Origen → Destino', style: 'tableHeader' },
          { text: 'Km',     style: 'tableHeader', alignment: 'right' },
          { text: 'Ton',    style: 'tableHeader', alignment: 'right' },
          { text: 'Remito', style: 'tableHeader' },
        ],
        ...args.tramos.map(t => [
          { text: fmtFecha(t.fecha) },
          { text: t.tipo === 'cargado' ? 'Cargado' : 'Vacío' },
          { text: `${t.cantera ?? '—'} → ${t.deposito ?? '—'}` },
          { text: fmtN(t.km), alignment: 'right' as const },
          { text: t.toneladas != null ? fmtN(t.toneladas, 2) : '—', alignment: 'right' as const },
          { text: t.remito ?? '—' },
        ]),
      ],
    },
    layout: {
      fillColor: (rowIdx) => rowIdx === 0 ? '#1B4F8C' : (rowIdx % 2 === 0 ? '#F5F7FA' : null),
      hLineWidth: () => 0.3,
      vLineWidth: () => 0,
      hLineColor: () => '#D0D5DD',
    },
  }

  // ── Tabla de adelantos ──────────────────────────────────────────
  const adelantosBlock: Content[] = args.adelantos.length === 0 ? [] : [
    { text: 'Adelantos descontados', style: 'sectionTitle', margin: [0, 12, 0, 4] },
    {
      style: 'table',
      table: {
        headerRows: 1,
        widths: [55, '*', 80],
        body: [
          [
            { text: 'Fecha',       style: 'tableHeaderSoft' },
            { text: 'Descripción', style: 'tableHeaderSoft' },
            { text: 'Monto',       style: 'tableHeaderSoft', alignment: 'right' },
          ],
          ...args.adelantos.map(a => [
            { text: fmtFecha(a.fecha) },
            { text: a.descripcion || '—' },
            { text: fmtM(a.monto), alignment: 'right' as const },
          ]),
        ],
      },
      layout: {
        fillColor: (rowIdx) => rowIdx === 0 ? '#FFF3D6' : null,
        hLineWidth: () => 0.3,
        vLineWidth: () => 0,
        hLineColor: () => '#D0D5DD',
      },
    },
  ]

  // ── Tabla de gastos del chofer (reintegros) ─────────────────────
  const gastosBlock: Content[] = args.gastos.length === 0 ? [] : [
    { text: 'Gastos del chofer (reintegros)', style: 'sectionTitle', margin: [0, 12, 0, 4] },
    {
      style: 'table',
      table: {
        headerRows: 1,
        widths: [55, 80, 100, '*', 70],
        body: [
          [
            { text: 'Fecha',       style: 'tableHeaderGreen' },
            { text: 'Categoría',   style: 'tableHeaderGreen' },
            { text: 'Proveedor',   style: 'tableHeaderGreen' },
            { text: 'Descripción', style: 'tableHeaderGreen' },
            { text: 'Monto',       style: 'tableHeaderGreen', alignment: 'right' },
          ],
          ...args.gastos.map(g => [
            { text: fmtFecha(g.fecha) },
            { text: g.categoria },
            { text: g.proveedor ?? '—' },
            { text: g.descripcion ?? '—' },
            { text: fmtM(g.monto), alignment: 'right' as const },
          ]),
        ],
      },
      layout: {
        fillColor: (rowIdx) => rowIdx === 0 ? '#E5F4E5' : null,
        hLineWidth: () => 0.3,
        vLineWidth: () => 0,
        hLineColor: () => '#D0D5DD',
      },
    },
  ]

  // ── Totales ─────────────────────────────────────────────────────
  const totalesRows: Array<[string, string]> = []
  totalesRows.push([
    `Días trabajados (${args.dias_trabajados}) × ${fmtM(args.basico_dia)}/día`,
    fmtM(args.subtotal_basico),
  ])
  if (args.km_cargados > 0) {
    totalesRows.push([
      `Km cargados (${fmtN(args.km_cargados)}) × ${fmtM(args.precio_km_cargado)}/km`,
      fmtM(args.km_cargados * args.precio_km_cargado),
    ])
  }
  if (args.km_vacios > 0) {
    totalesRows.push([
      `Km vacíos (${fmtN(args.km_vacios)}) × ${fmtM(args.precio_km_vacio)}/km`,
      fmtM(args.km_vacios * args.precio_km_vacio),
    ])
  }
  if (args.total_adelantos > 0) {
    totalesRows.push(['− Adelantos descontados', '− ' + fmtM(args.total_adelantos)])
  }
  if (args.total_reintegros > 0) {
    totalesRows.push(['+ Reintegros (gastos chofer)', '+ ' + fmtM(args.total_reintegros)])
  }

  // ── Document definition ────────────────────────────────────────
  const docDef: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: {
      title:   `Liquidación ${args.chofer_nombre} ${args.fecha_desde} a ${args.fecha_hasta}`,
      author:  'CADINC SRL',
      subject: 'Liquidación de chofer',
    },
    content: [
      // Header con título + fecha emisión
      {
        columns: [
          { text: titulo, style: 'h1', width: '*' },
          { text: `Emitido: ${new Date().toLocaleString('es-AR')}`, style: 'meta', alignment: 'right', width: 'auto' },
        ],
      },

      // Datos del chofer
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: args.chofer_nombre, style: 'choferNombre', margin: [0, 8, 0, 0] },
              args.chofer_cuil
                ? { text: `CUIL: ${args.chofer_cuil}`, style: 'meta' }
                : { text: '' },
              args.camion_patente
                ? { text: `Camión asignado: ${args.camion_patente}`, margin: [0, 4, 0, 0] }
                : { text: '' },
              {
                text: `Período: ${fmtFecha(args.fecha_desde)} → ${fmtFecha(args.fecha_hasta)}`,
                style: 'periodo',
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      },

      // Tramos
      args.tramos.length > 0
        ? { text: 'Tramos', style: 'sectionTitle', margin: [0, 16, 0, 4] }
        : { text: '' },
      tramosTable,

      // Adelantos
      ...adelantosBlock,

      // Gastos
      ...gastosBlock,

      // Totales
      { text: 'Totales', style: 'sectionTitle', margin: [0, 16, 0, 6] },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#1B4F8C' }],
      },
      {
        margin: [0, 6, 0, 0],
        table: {
          widths: ['*', 100],
          body: totalesRows.map(([label, value]) => [
            { text: label, border: [false, false, false, false] },
            { text: value, border: [false, false, false, false], alignment: 'right' },
          ]),
        },
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#1B4F8C' }],
        margin: [0, 4, 0, 0],
      },
      {
        columns: [
          { text: 'NETO A PAGAR', style: 'netoLabel', width: '*' },
          { text: fmtM(args.total_neto), style: 'netoValue', width: 'auto', alignment: 'right' },
        ],
        margin: [0, 8, 0, 4],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#1B4F8C' }],
      },

      // Observaciones
      args.observaciones
        ? {
            margin: [0, 16, 0, 0],
            stack: [
              { text: 'Observaciones', style: 'sectionTitle' },
              { text: args.observaciones, margin: [0, 4, 0, 0] },
            ],
          }
        : { text: '' },

      // Firma
      {
        margin: [0, 50, 0, 0],
        columns: [
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 30, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] },
              { text: 'Firma chofer', style: 'firma', margin: [30, 4, 0, 0] },
            ],
          },
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 30, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] },
              { text: 'Firma empresa', style: 'firma', margin: [30, 4, 0, 0] },
            ],
          },
        ],
      },

      // Banner de borrador
      args.estado === 'borrador'
        ? {
            text: 'VISTA PREVIA — Esta liquidación todavía no fue cerrada en el sistema.',
            style: 'previewBanner',
            margin: [0, 30, 0, 0],
            alignment: 'center',
          }
        : { text: '' },
    ],
    styles: {
      h1:               { fontSize: 16, bold: true, color: '#1B4F8C' },
      meta:             { fontSize: 9, color: '#666' },
      choferNombre:     { fontSize: 11, bold: true },
      periodo:          { fontSize: 11, bold: true },
      sectionTitle:     { fontSize: 10, bold: true, color: '#000' },
      table:            { fontSize: 9 },
      tableHeader:      { fontSize: 9, bold: true, color: '#fff' },
      tableHeaderSoft:  { fontSize: 9, bold: true, color: '#7A5500' },
      tableHeaderGreen: { fontSize: 9, bold: true, color: '#2E7D32' },
      netoLabel:        { fontSize: 13, bold: true, color: '#1B4F8C' },
      netoValue:        { fontSize: 13, bold: true, color: '#1B4F8C' },
      firma:            { fontSize: 9, color: '#666' },
      previewBanner:    { fontSize: 9, color: '#B5651D', italics: true },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
  }

  const fname = `liquidacion-${args.chofer_nombre.replace(/[^a-z0-9]+/gi, '_')}-${args.fecha_desde}_${args.fecha_hasta}.pdf`
  pdfMake.createPdf(docDef).download(fname)
}
