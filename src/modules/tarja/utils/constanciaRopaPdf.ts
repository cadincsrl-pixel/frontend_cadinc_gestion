/**
 * Constancia de entrega de ropa de trabajo y EPP (Res. SRT 299/11) — 2026-09-23.
 *
 * Es el formulario que pide la ART y que se muestra en una inspección: una
 * hoja por trabajador, con lo que se le entregó y su firma en cada renglón.
 * Se respeta el modelo del Anexo de la resolución (empresa, trabajador,
 * puesto, y la tabla Producto · Tipo/Modelo · Marca · Certificación ·
 * Cantidad · Fecha · Firma) porque es lo que el inspector sabe leer.
 *
 * El sistema no sabe la marca ni si el producto está certificado: esas
 * columnas salen en blanco para completar a mano, igual que la firma. El talle
 * va en «Tipo / Modelo». Se dejan renglones vacíos al final para las entregas
 * que se hagan con la hoja ya impresa.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const GRIS  = '#E6E6E6'
const LINEA = '#999999'
/** Renglones mínimos de la tabla: los que no se usan quedan para escribir a mano. */
const RENGLONES_MIN = 12

export interface RenglonConstancia {
  producto: string
  talle:    string
  cantidad: number
  fecha:    string
}

export interface TrabajadorConstancia {
  leg:      string
  nombre:   string
  dni:      string | null
  puesto:   string | null
  entregas: RenglonConstancia[]
}

function fmtFecha(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/** 36890735 → 36.890.735 */
function fmtDni(d: string | null | undefined): string {
  const n = (d ?? '').replace(/\D/g, '')
  return n ? n.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
}

const th = (t: string): TableCell =>
  ({ text: t, bold: true, fontSize: 7.5, fillColor: GRIS, alignment: 'center', margin: [2, 3, 2, 3] })
const td = (t: string, alin: 'left' | 'center' = 'left'): TableCell =>
  ({ text: t, fontSize: 8.5, alignment: alin, margin: [2, 5, 2, 5] })

const campo = (etiqueta: string, valor: string): Content => ({
  text: [{ text: `${etiqueta}: `, bold: true }, { text: valor || '______________________' }],
  fontSize: 9, margin: [0, 0, 0, 3],
})

function hoja(t: TrabajadorConstancia, logo: string | null, elementos: string, ultima: boolean): Content[] {
  const ordenadas = [...t.entregas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.producto.localeCompare(b.producto))
  const filas: TableCell[][] = ordenadas.map((e, i) => [
    td(String(i + 1), 'center'),
    td(e.producto),
    td(e.talle ? `Talle ${e.talle}` : ''),
    td(''),
    td('SI  /  NO', 'center'),
    td(String(e.cantidad), 'center'),
    td(fmtFecha(e.fecha), 'center'),
    td(''),
  ])
  for (let i = filas.length; i < RENGLONES_MIN; i++) {
    filas.push([td(String(i + 1), 'center'), td(''), td(''), td(''), td(''), td(''), td(''), td('')])
  }

  return [
    {
      columns: [
        logo ? { image: logo, width: 90 } : { text: EMPRESA.nombre, bold: true, fontSize: 14, width: 90 },
        {
          stack: [
            { text: 'CONSTANCIA DE ENTREGA DE ROPA DE TRABAJO', bold: true, fontSize: 11, alignment: 'center' },
            { text: 'Y ELEMENTOS DE PROTECCIÓN PERSONAL', bold: true, fontSize: 11, alignment: 'center' },
            { text: 'Resolución SRT N° 299/11', fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] },
          ],
        },
        { text: '', width: 90 },
      ],
      margin: [0, 0, 0, 10],
    },
    {
      table: {
        widths: ['*', '*'],
        body: [[
          { stack: [campo('Razón social', EMPRESA.nombre), campo('C.U.I.T.', EMPRESA.cuit), campo('Dirección', EMPRESA.domicilio)], margin: [4, 4, 4, 2] },
          { stack: [
            campo('Nombre y apellido', t.nombre),
            campo('D.N.I.', fmtDni(t.dni)),
            campo('Legajo', t.leg),
          ], margin: [4, 4, 4, 2] },
        ]],
      },
      layout: { hLineColor: () => LINEA, vLineColor: () => LINEA },
      margin: [0, 0, 0, 6],
    },
    campo('Descripción breve del puesto de trabajo', t.puesto ?? ''),
    campo('Elementos de protección personal necesarios según el puesto', elementos),
    {
      table: {
        headerRows: 1,
        widths: [16, '*', 62, 58, 48, 38, 52, 90],
        body: [
          [th('N°'), th('Producto'), th('Tipo / Modelo'), th('Marca'), th('Posee certificación'), th('Cantidad'), th('Fecha de entrega'), th('Firma del trabajador')],
          ...filas,
        ],
      },
      layout: { hLineColor: () => LINEA, vLineColor: () => LINEA },
      margin: [0, 6, 0, 10],
    },
    { text: 'Información adicional:', bold: true, fontSize: 9 },
    { canvas: [{ type: 'line', x1: 0, y1: 14, x2: 515, y2: 14, lineWidth: 0.5, lineColor: LINEA }] },
    { canvas: [{ type: 'line', x1: 0, y1: 14, x2: 515, y2: 14, lineWidth: 0.5, lineColor: LINEA }], margin: [0, 0, 0, 30] },
    {
      columns: [
        { stack: [{ text: '______________________________', alignment: 'center' }, { text: 'Firma del trabajador', fontSize: 8, alignment: 'center' }] },
        { stack: [{ text: '______________________________', alignment: 'center' }, { text: 'Firma y aclaración del responsable', fontSize: 8, alignment: 'center' }] },
      ],
      ...(ultima ? {} : { pageBreak: 'after' as const }),
    },
  ]
}

/**
 * `elementos` es la lista de prendas que entrega la empresa (las categorías
 * activas de Ropa): el sistema no tiene un «EPP por puesto», así que se
 * imprime la lista general y el responsable corrige a mano si hace falta.
 */
export function armarConstanciaDoc(
  trabajadores: TrabajadorConstancia[], elementos: string, logo: string | null,
): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 36],
    defaultStyle: { fontSize: 9 },
    info: { title: 'Constancia de entrega de ropa y EPP' },
    content: trabajadores.flatMap((t, i) => hoja(t, logo, elementos, i === trabajadores.length - 1)),
  }
}

/** El logo como dataURL. Si no se puede bajar, la constancia sale igual, sin logo. */
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

export async function descargarConstanciaRopa(
  trabajadores: TrabajadorConstancia[], elementos: string, archivo: string,
): Promise<void> {
  if (!trabajadores.length) return
  const doc = armarConstanciaDoc(trabajadores, elementos, await logoDataUrl())
  pdfMake.createPdf(doc).download(archivo)
}

/** Arma la hoja de un trabajador desde sus entregas registradas. */
export function trabajadorConstancia(
  p: { leg: string; nom: string; dni: string | null },
  puesto: string | null,
  entregas: ReadonlyArray<{ categoria_id: number; fecha_entrega: string; cantidad?: number; talle?: string }>,
  nombreCategoria: (id: number) => string,
): TrabajadorConstancia {
  return {
    leg: p.leg, nombre: p.nom, dni: p.dni, puesto,
    entregas: entregas.map(e => ({
      producto: nombreCategoria(e.categoria_id),
      talle:    e.talle ?? '',
      cantidad: e.cantidad ?? 1,
      fecha:    e.fecha_entrega,
    })),
  }
}
