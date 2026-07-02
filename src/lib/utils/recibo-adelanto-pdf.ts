// Generador de recibo PDF para adelantos a chofer (pago en efectivo).
// El chofer lo firma; el escaneo firmado se sube como comprobante del adelanto.
// Lib: pdfmake (misma que liquidacion-pdf.ts).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'

;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

export interface ReciboAdelantoArgs {
  numero?:        string | null          // ej. "A-123" (id del adelanto) o null
  fecha:          string                 // YYYY-MM-DD
  chofer_nombre:  string
  chofer_cuil?:   string | null
  monto:          number
  descripcion?:   string | null
  forma_pago:     'transferencia' | 'efectivo'
}

// ── Monto en letras (pesos argentinos) ──────────────────────────────
const UNI = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function menorMil(x: number): string {
  let out = ''
  const c = Math.floor(x / 100)
  const resto = x % 100
  if (c === 1 && resto === 0) out = 'cien'
  else if (c > 0) out = CEN[c]!
  if (resto > 0) {
    if (out) out += ' '
    if (resto < 30) out += UNI[resto]
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      out += DEC[d]! + (u ? ' y ' + UNI[u] : '')
    }
  }
  return out
}

// Apócope de "uno" → "un" cuando precede a "mil"/"millones" (o "peso").
function apocopar(s: string): string {
  return s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
}

function numeroALetras(n: number): string {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones > 0) partes.push(millones === 1 ? 'un millón' : apocopar(menorMil(millones)) + ' millones')
  if (miles > 0) partes.push(miles === 1 ? 'mil' : apocopar(menorMil(miles)) + ' mil')
  if (resto > 0) partes.push(menorMil(resto))
  return partes.join(' ')
}

function montoEnLetras(monto: number): string {
  const entero = Math.floor(monto)
  const centavos = Math.round((monto - entero) * 100)
  const letras = numeroALetras(entero).toUpperCase()
  const cc = String(centavos).padStart(2, '0')
  return `PESOS ${letras} CON ${cc}/100`
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function fmtMonto(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generarReciboAdelanto(args: ReciboAdelantoArgs): void {
  const formaLabel = args.forma_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'

  const docDef: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 48],
    content: [
      // Encabezado: empresa a la izquierda, título del recibo a la derecha.
      {
        columns: [
          [
            { text: EMPRESA.nombre, style: 'empresa' },
            { text: `CUIT: ${EMPRESA.cuit}`, style: 'meta' },
          ],
          [
            { text: 'RECIBO DE ADELANTO', style: 'titulo', alignment: 'right' },
            { text: args.numero ? `N° ${args.numero}` : 'N° s/n', style: 'meta', alignment: 'right' },
            { text: `Fecha: ${fmtFecha(args.fecha)}`, style: 'meta', alignment: 'right' },
          ],
        ],
      },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }], margin: [0, 14, 0, 14] },

      // Monto destacado.
      {
        table: {
          widths: ['*'],
          body: [[
            { text: `$ ${fmtMonto(args.monto)}`, style: 'montoBig', alignment: 'center', fillColor: '#F2F6FB', margin: [0, 8, 0, 8] },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 14],
      },

      // Cuerpo del recibo.
      {
        text: [
          'Recibí de ', { text: EMPRESA.nombre, bold: true },
          ' la cantidad de ', { text: montoEnLetras(args.monto), bold: true },
          ` ($ ${fmtMonto(args.monto)}), en concepto de adelanto`,
          args.descripcion ? `: ${args.descripcion}.` : '.',
        ],
        style: 'cuerpo',
        margin: [0, 0, 0, 10],
      },
      {
        text: [{ text: 'Forma de pago: ', bold: true }, formaLabel],
        style: 'cuerpo',
        margin: [0, 0, 0, 4],
      },
      {
        text: [
          { text: 'Chofer: ', bold: true }, args.chofer_nombre,
          args.chofer_cuil ? `  —  CUIL: ${args.chofer_cuil}` : '',
        ],
        style: 'cuerpo',
        margin: [0, 0, 0, 40],
      },

      // Firma.
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 240,
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 240, y2: 0, lineWidth: 0.7, lineColor: '#000000' }] },
              { text: 'Firma del chofer', style: 'firma', alignment: 'center', margin: [0, 4, 0, 0] },
              { text: 'Aclaración / DNI', style: 'firma', alignment: 'center', margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
    ],
    styles: {
      empresa:   { fontSize: 14, bold: true, color: '#1B4F8C' },
      titulo:    { fontSize: 13, bold: true, color: '#1B4F8C' },
      meta:      { fontSize: 9, color: '#666' },
      montoBig:  { fontSize: 20, bold: true, color: '#1B4F8C' },
      cuerpo:    { fontSize: 11, lineHeight: 1.3 },
      firma:     { fontSize: 9, color: '#666' },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  }

  const nombre = args.chofer_nombre.replace(/[^a-z0-9]+/gi, '_')
  pdfMake.createPdf(docDef).download(`recibo-adelanto-${nombre}-${args.fecha}.pdf`)
}
