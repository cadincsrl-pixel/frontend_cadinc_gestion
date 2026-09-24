// Piezas comunes de los PDF de Cobranzas (recibo y estado de cuenta), con la
// misma paleta y el mismo encabezado de emisor que la factura (`facturaPdf.ts`):
// el cliente tiene que reconocer que los tres papeles son de la misma empresa.
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

export const CARBON  = '#1C1C1E'
export const TENUE   = '#6B6B66'
export const BORDE   = '#D9D9D4'
export const FONDO   = '#F5F5F2'
export const NARANJA = '#E8621A'
export const NARANJA_SUAVE = '#FDF0E8'
export const ROJO    = '#C00000'

export const MARGEN_X = 28
export const ANCHO = 595.28 - 2 * MARGEN_X

export type Margen = [number, number, number, number]

export const th = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 7.5, color: TENUE, fillColor: FONDO, alignment: alin, margin: [3, 4, 3, 4] })
export const td = (t: string, alin: 'left' | 'right' | 'center' = 'left', extra: Record<string, unknown> = {}): TableCell =>
  ({ text: t, fontSize: 8.5, alignment: alin, margin: [3, 3, 3, 3], ...extra })

export const par = (label: string, valor: string, anchoLabel = 62): Content => ({
  columns: [
    { width: anchoLabel, text: label, bold: true, fontSize: 8.5 },
    { width: '*', text: valor, fontSize: 8.5 },
  ],
  margin: [0, 1, 0, 1],
})

export const cajaFina = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6,
  hLineColor: () => BORDE, vLineColor: () => BORDE,
}

/** Tabla con líneas horizontales finas, sin verticales (como los renglones de la factura). */
export const layoutLista = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.3),
  vLineWidth: () => 0,
  hLineColor: () => BORDE,
}

/** Logo + razón social, domicilio, teléfono y condición IVA de CADINC. */
export function bloqueEmisor(logo: string | null): Content {
  return {
    columns: [
      ...(logo ? [{ width: 46, image: logo, fit: [46, 62] as [number, number] }] : []),
      {
        width: '*',
        margin: [logo ? 8 : 0, 2, 0, 0] as Margen,
        stack: [
          { text: EMPRESA.razonSocialFactura, fontSize: 13, bold: true },
          { text: EMPRESA.domicilioFactura1, fontSize: 8, color: TENUE, margin: [0, 2, 0, 0] as Margen },
          { text: EMPRESA.domicilioFactura2, fontSize: 8, color: TENUE },
          { text: `Tel. ${EMPRESA.tel}`, fontSize: 8, color: TENUE },
          { text: EMPRESA.condicionIva, fontSize: 8, bold: true, margin: [0, 3, 0, 0] as Margen },
        ],
      },
    ],
  }
}

/** Encabezado de dos columnas: emisor | título + número + datos fiscales. */
export function encabezado(logo: string | null, derecha: Content[]): Content {
  return {
    table: {
      widths: ['*', 210],
      body: [[
        { stack: [bloqueEmisor(logo)], margin: [6, 6, 4, 6] },
        { stack: derecha, margin: [10, 6, 6, 6] },
      ]],
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: (i: number) => (i === 1 ? 0.6 : i === 0 || i === 2 ? 0.6 : 0),
      hLineColor: () => BORDE, vLineColor: () => BORDE,
    },
  }
}

/** Datos fiscales del emisor debajo del título (CUIT, IIBB, inicio de actividades). */
export function datosFiscales(): Content[] {
  return [
    par('C.U.I.T.:', EMPRESA.cuit, 66),
    par('Ing. Brutos:', EMPRESA.iibb, 66),
    par('Inic. Act.:', EMPRESA.inicioActividades, 66),
  ]
}

/** Pie de todas las páginas: "Emitido por el sistema de gestión de CADINC SRL" + página. */
export function pie(texto?: string) {
  return (pag: number, total: number): Content => ({
    margin: [MARGEN_X, 10, MARGEN_X, 0],
    columns: [
      { text: texto ?? `Emitido por el sistema de gestión de ${EMPRESA.nombre}`, fontSize: 7, color: TENUE },
      { text: `Pág. ${pag}/${total}`, fontSize: 7, color: TENUE, alignment: 'right', width: 60 },
    ],
  })
}

export function descargarPdf(doc: TDocumentDefinitions, nombre: string): void {
  pdfMake.createPdf(doc).download(nombre)
}

/** "ARCOR S.A.I.C." → "ARCOR_S_A_I_C" para el nombre del archivo. */
export function slugArchivo(t: string): string {
  return t.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
}
