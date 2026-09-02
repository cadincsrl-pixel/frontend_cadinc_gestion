// Generador de PDF para liquidaciones de chofer.
// Lib: pdfmake (Roboto incluido por defecto, soporte UTF-8 sin issues).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'

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
  // true = pata de un tramo relevado (km parcial de ese chofer), no tramo entero.
  esRelevo?:   boolean
  // Modalidad pct: detalle económico del tramo (del `detalle` de
  // calcularBasePctViajes). neto = facturación sin IVA del viaje, pct = %
  // vigente a la fecha de ESE tramo, comision = neto × pct/100. Con estos
  // campos presentes la tabla del PDF muestra la plata por viaje en lugar
  // de los km — así el chofer controla que estén todos sus viajes y cuánto
  // cobra por cada uno. Los vacíos no facturan y van sin detalle.
  neto?:       number | null
  pct?:        number | null
  comision?:   number | null
  // Monto (CON IVA) que la empresa intermediaria contra facturó por este
  // viaje. `neto` YA viene descontado; esto se imprime aparte para que el
  // chofer entienda por qué el neto no es ton × tarifa. 0/null = sin contra
  // factura (la empresa no es intermediaria).
  comision_intermediario?: number | null
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

// Estadía: días de espera para cargar/descargar, pagados por día (SUMAN).
export interface PdfLiquidacionEstadia {
  fecha_desde: string
  fecha_hasta: string
  dias:        number
  monto_dia:   number
  total:       number
  obs:         string | null
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
  total_estadias?:    number
  total_neto:         number
  tramos:    PdfLiquidacionTramo[]
  adelantos: PdfLiquidacionAdelanto[]
  gastos:    PdfLiquidacionGasto[]
  estadias?: PdfLiquidacionEstadia[]
  estado:           'borrador' | 'cerrada'
  numero_liquidacion: number | null
  observaciones:    string | null
  // Modalidad pct (2026-07-30): comisión sobre la facturación neta de los
  // viajes. Si viene, el resumen muestra la línea de comisión en lugar de km.
  modalidad?:       'km_jornal' | 'pct'
  pct_aplicado?:    number | null
  base_neta?:       number | null
  subtotal_pct?:    number | null
}

const fmtFecha = (s: string | null | undefined): string => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

const fmtM = (n: number): string =>
  '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

const fmtN = (n: number, dec = 0): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export function generarPdfLiquidacion(args: PdfLiquidacionArgs): void {
  const titulo = args.estado === 'cerrada'
    ? `LIQUIDACIÓN N° ${args.numero_liquidacion ?? '—'}`
    : 'LIQUIDACIÓN — VISTA PREVIA'

  // ── Tabla de tramos ─────────────────────────────────────────────
  // Modalidad pct CON detalle por tramo: al chofer le importa la plata de
  // cada viaje, no los km — columnas Facturación / % / Comisión en lugar de
  // Tipo / Km, con fila de totales que cierra contra el resumen. Si el
  // detalle no vino (liquidación cerrada cuyo recálculo no cuadró con el
  // snapshot), se cae a la tabla clásica para no imprimir números falsos.
  const esPctConDetalle = args.modalidad === 'pct' && args.tramos.some(t => t.comision != null)

  const tramosLayout = {
    fillColor: (rowIdx: number) => rowIdx === 0 ? '#1B4F8C' : (rowIdx % 2 === 0 ? '#F5F7FA' : null),
    hLineWidth: () => 0.3,
    vLineWidth: () => 0,
    hLineColor: () => '#D0D5DD',
  }

  const rutaDe = (t: PdfLiquidacionTramo) => t.tipo === 'cargado'
    ? `${t.cantera ?? '—'} → ${t.deposito ?? '—'}`
    : `${t.deposito ?? '—'} → ${t.cantera ?? '—'}`

  // Cargado propio que quedó fuera del detalle (sin tarifa o sin toneladas):
  // se marca con ✱ y se explica al pie — no genera comisión ni entra al TOTAL.
  const esCargadoSinDetalle = (t: PdfLiquidacionTramo) =>
    t.tipo === 'cargado' && !t.esRelevo && t.comision == null

  // Viaje al que una empresa intermediaria le descontó una contra factura.
  const contraFacturaDe = (t: PdfLiquidacionTramo) => Number(t.comision_intermediario ?? 0)
  const tieneContraFactura = (t: PdfLiquidacionTramo) => t.comision != null && contraFacturaDe(t) > 0

  let tramosTable: Content
  if (args.tramos.length === 0) {
    tramosTable = { text: '' }
  } else if (esPctConDetalle) {
    // Totales de la tabla desde sus propias filas (autoconsistencia): deben
    // coincidir con base_neta / subtotal_pct del resumen.
    const conDetalle   = args.tramos.filter(t => t.comision != null)
    const totalTon     = conDetalle.reduce((s, t) => s + (t.toneladas ?? 0), 0)
    const totalNeto    = conDetalle.reduce((s, t) => s + (t.neto ?? 0), 0)
    const totalCom     = conDetalle.reduce((s, t) => s + (t.comision ?? 0), 0)
    const totalContraF = conDetalle.reduce((s, t) => s + contraFacturaDe(t), 0)
    const fmtPct = (p: number | null | undefined) =>
      p != null ? p.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%' : '—'

    tramosTable = {
      style: 'table',
      table: {
        headerRows: 1,
        // 'Neto viaje' un poco más ancha que el resto: con contra factura
        // lleva el importe descontado en una segunda línea.
        widths: [50, '*', 35, 70, 30, 62, 48],
        body: [
          [
            { text: 'Fecha',      style: 'tableHeader' },
            { text: 'Origen → Destino', style: 'tableHeader' },
            { text: 'Ton',        style: 'tableHeader', alignment: 'right' },
            { text: 'Neto viaje', style: 'tableHeader', alignment: 'right' },
            { text: '%',          style: 'tableHeader', alignment: 'right' },
            { text: 'Comisión',   style: 'tableHeader', alignment: 'right' },
            { text: 'Remito',     style: 'tableHeader' },
          ],
          ...args.tramos.map(t => {
            const prefijo = t.esRelevo ? 'Relevo · ' : t.tipo === 'vacio' ? 'Vacío · ' : ''
            const italica = t.tipo === 'vacio' || !!t.esRelevo
            return [
              { text: fmtFecha(t.fecha) },
              { text: prefijo + rutaDe(t) + (esCargadoSinDetalle(t) ? ' ✱' : ''), italics: italica },
              { text: t.toneladas != null ? fmtN(t.toneladas, 2) : '—', alignment: 'right' as const },
              tieneContraFactura(t)
                // El neto ya está descontado: se muestra el importe de la
                // contra factura debajo, con ✚ que remite a la nota al pie.
                ? {
                    stack: [
                      { text: fmtM(t.neto ?? 0) + ' ✚' },
                      { text: '− ' + fmtM(contraFacturaDe(t)) + ' c/f', fontSize: 6, color: '#B42318' },
                    ],
                    alignment: 'right' as const,
                  }
                : { text: t.neto != null ? fmtM(t.neto) : '—', alignment: 'right' as const },
              { text: fmtPct(t.pct), alignment: 'right' as const },
              { text: t.comision != null ? fmtM(t.comision) : '—', alignment: 'right' as const, bold: t.comision != null },
              { text: t.esRelevo ? 'Relevo' : (t.remito ?? '—') },
            ]
          }),
          [
            { text: '' },
            { text: `TOTAL (${conDetalle.length} viaje${conDetalle.length !== 1 ? 's' : ''})`, bold: true },
            { text: fmtN(totalTon, 2), alignment: 'right' as const, bold: true },
            totalContraF > 0
              ? {
                  stack: [
                    { text: fmtM(totalNeto), bold: true },
                    { text: '− ' + fmtM(totalContraF) + ' c/f', fontSize: 6, color: '#B42318' },
                  ],
                  alignment: 'right' as const,
                }
              : { text: fmtM(totalNeto), alignment: 'right' as const, bold: true },
            { text: '' },
            { text: fmtM(totalCom), alignment: 'right' as const, bold: true },
            { text: '' },
          ],
        ],
      },
      // La última fila (TOTAL) con fondo propio, fuera del zebra por paridad.
      layout: {
        ...tramosLayout,
        fillColor: (rowIdx: number, node: { table: { body: unknown[] } }) =>
          rowIdx === 0 ? '#1B4F8C'
          : rowIdx === node.table.body.length - 1 ? '#DCE6F2'
          : (rowIdx % 2 === 0 ? '#F5F7FA' : null),
      },
    }
  } else {
    tramosTable = {
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
          { text: (t.tipo === 'cargado' ? 'Cargado' : 'Vacío') + (t.esRelevo ? ' · relevo' : ''), italics: !!t.esRelevo },
          { text: rutaDe(t), italics: !!t.esRelevo },
          { text: fmtN(t.km), alignment: 'right' as const },
          { text: t.toneladas != null ? fmtN(t.toneladas, 2) : '—', alignment: 'right' as const },
          { text: t.esRelevo ? 'Relevo' : (t.remito ?? '—') },
        ]),
      ],
    },
    layout: tramosLayout,
    }
  }

  // Aclaraciones bajo la tabla pct: la comisión es sobre el NETO sin IVA,
  // los vacíos se listan pero no facturan, y los ✱ explican por qué un
  // cargado quedó sin comisión (fuera del TOTAL).
  const notaVacios: Content = !esPctConDetalle ? { text: '' } : {
    stack: [
      { text: '"Neto viaje" = toneladas × tarifa vigente SIN IVA. La comisión de cada viaje se calcula sobre ese neto, con el % vigente a su fecha.', style: 'meta', margin: [0, 2, 0, 0] },
      ...(args.tramos.some(t => t.tipo === 'vacio')
        ? [{ text: 'Los tramos vacíos no facturan y no generan comisión (se listan como registro del viaje).', style: 'meta', margin: [0, 1, 0, 0] } as Content]
        : []),
      ...(args.tramos.some(esCargadoSinDetalle)
        ? [{ text: '✱ Viaje sin tarifa o sin toneladas cargadas: no genera comisión y NO está incluido en la fila TOTAL.', style: 'meta', margin: [0, 1, 0, 0] } as Content]
        : []),
      ...(args.tramos.some(tieneContraFactura)
        ? [{ text: '✚ Viaje facturado a una empresa intermediaria: al bruto ya se le restó la contra factura de su comisión (importe en rojo bajo el neto) ANTES de quitar el IVA. El % del chofer se calcula sobre ese neto.', style: 'meta', margin: [0, 1, 0, 0] } as Content]
        : []),
    ],
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

  // ── Tabla de estadías (días de espera, pagados por día) ─────────
  const estadiasArr = args.estadias ?? []
  const estadiasBlock: Content[] = estadiasArr.length === 0 ? [] : [
    { text: 'Estadías (días de espera)', style: 'sectionTitle', margin: [0, 12, 0, 4] },
    {
      style: 'table',
      table: {
        headerRows: 1,
        widths: [110, 40, 70, '*', 70],
        body: [
          [
            { text: 'Período',     style: 'tableHeaderGreen' },
            { text: 'Días',        style: 'tableHeaderGreen', alignment: 'right' },
            { text: '$/día',       style: 'tableHeaderGreen', alignment: 'right' },
            { text: 'Observación', style: 'tableHeaderGreen' },
            { text: 'Total',       style: 'tableHeaderGreen', alignment: 'right' },
          ],
          ...estadiasArr.map(e => [
            { text: `${fmtFecha(e.fecha_desde)} → ${fmtFecha(e.fecha_hasta)}` },
            { text: fmtN(e.dias), alignment: 'right' as const },
            { text: fmtM(e.monto_dia), alignment: 'right' as const },
            { text: e.obs || '—' },
            { text: fmtM(e.total), alignment: 'right' as const },
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
  if (args.modalidad === 'pct') {
    // Jornal opcional: con basico_dia en 0 el arreglo es solo comisión y la
    // línea de días no aparece (mostrar "20 días × $0 = $0" solo confunde).
    if (args.subtotal_basico > 0) {
      totalesRows.push([
        `Jornal (${args.dias_trabajados} días × ${fmtM(args.basico_dia)}/día)`,
        fmtM(args.subtotal_basico),
      ])
    }
    // pct_aplicado es el efectivo ponderado: puede traer decimales si el %
    // versionado del chofer cambió en el medio del período.
    totalesRows.push([
      `Comisión ${(args.pct_aplicado ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}% s/ facturación neta (${fmtM(args.base_neta ?? 0)})`,
      fmtM(args.subtotal_pct ?? 0),
    ])
  } else {
  totalesRows.push([
    `Días trabajados (${args.dias_trabajados}) × ${fmtM(args.basico_dia)}/día`,
    fmtM(args.subtotal_basico),
  ])
  }
  // En modalidad pct los km NO integran el neto (la plata es jornal +
  // comisión): sin este gate, una liquidación pct cerrada imprimía líneas
  // "Km cargados × $/km" con el precio-km ACTUAL cacheado del chofer — un
  // importe que no suma al NETO A PAGAR.
  if (args.modalidad !== 'pct' && args.km_cargados > 0) {
    totalesRows.push([
      `Km cargados (${fmtN(args.km_cargados)}) × ${fmtM(args.precio_km_cargado)}/km`,
      fmtM(args.km_cargados * args.precio_km_cargado),
    ])
  }
  if (args.modalidad !== 'pct' && args.km_vacios > 0) {
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
  if ((args.total_estadias ?? 0) > 0) {
    totalesRows.push(['+ Estadías (días de espera)', '+ ' + fmtM(args.total_estadias!)])
  }

  // ── Document definition ────────────────────────────────────────
  const docDef: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: {
      title:   `Liquidación ${args.chofer_nombre} ${args.fecha_desde} a ${args.fecha_hasta}`,
      author:  EMPRESA.nombre,
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
        ? { text: esPctConDetalle ? 'Viajes y comisión' : 'Tramos', style: 'sectionTitle', margin: [0, 16, 0, 4] }
        : { text: '' },
      tramosTable,
      notaVacios,

      // Adelantos
      ...adelantosBlock,

      // Gastos
      ...gastosBlock,

      // Estadías
      ...estadiasBlock,

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
