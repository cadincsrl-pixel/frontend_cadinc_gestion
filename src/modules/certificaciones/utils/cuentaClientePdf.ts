// PDF de la cuenta del cliente (materiales a cuenta) de una obra.
// Mismo patrón que áridos/alquiler (cuenta-pdf.ts): modo 'deuda' para mandarle
// al cliente lo pendiente, modo 'historico' con todo + pagos.

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { CuentaClienteCobro } from '@/types/domain.types'
import type { CuentaClienteRow } from '../hooks/useCuentaCliente'

;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const NARANJA = '#E8621A'
const AZUL    = '#1A365D'

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${m}/${y}`
}

function fmtM(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

const MEDIO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro',
}

// modo 'historico': todos los materiales que CADINC adelantó (columna Estado
// Pagado/Adeudado) + pagos del cliente + saldo.
// modo 'deuda': SOLO los adeudados (cobro_id null), sin historial de pagos —
// para mandarle al cliente lo que debe. Las filas pagado_por='cliente' quedan
// afuera en ambos modos (son rendición, no deuda).
export function descargarCuentaClienteObraPdf(args: {
  obraCod:    string
  obraNombre: string
  rows:       CuentaClienteRow[]
  cobros:     CuentaClienteCobro[]
  modo:       'deuda' | 'historico'
}) {
  const { obraCod, obraNombre, rows, cobros, modo } = args
  const esDeuda = modo === 'deuda'

  const deudaRows = rows.filter(r => r.pagado_por !== 'cliente')
  const items = esDeuda ? deudaRows.filter(r => r.cobro_id == null) : deudaRows

  const hoy = new Date()
  const emision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const adeudadoTotal = deudaRows.reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
  const pagadoTotal   = cobros.reduce((s, c) => s + Number(c.monto ?? 0), 0)
  const saldo         = adeudadoTotal - pagadoTotal
  const totalItems    = items.reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
  const sinPrecio     = items.filter(r => Number(r.precio_unit) === 0).length
  // En modo deuda, si hay pagos "a cuenta" (sin imputar a items), la suma de
  // items adeudados difiere del saldo real — el PDF lo avisa.
  const difiereDelSaldo = esDeuda && Math.abs(totalItems - saldo) > 1

  const filasItems: Content[][] = items.map(r => {
    const fila: Content[] = [
      { text: fmtFecha(r.fecha_resolucion), fontSize: 8 },
      { text: r.descripcion, fontSize: 8 },
      { text: `${Number(r.cantidad).toLocaleString('es-AR')} ${r.unidad}`, fontSize: 8, alignment: 'right' },
      { text: r.proveedores?.nombre ?? '—', fontSize: 7, color: '#666' },
      Number(r.precio_unit) > 0
        ? { text: fmtM(Number(r.precio_unit)), fontSize: 8, alignment: 'right' }
        : { text: 'sin tasar', fontSize: 7, alignment: 'right', color: '#C05621', italics: true },
      { text: fmtM(Number(r.precio_total ?? 0)), fontSize: 8, alignment: 'right', bold: true },
    ]
    if (!esDeuda) {
      fila.push(r.cobro_id != null
        ? { text: 'Pagado', fontSize: 7, alignment: 'center', color: '#2F855A', bold: true }
        : { text: 'Adeudado', fontSize: 7, alignment: 'center', color: '#C53030' })
    }
    return fila
  })

  const filasCobros: Content[][] = cobros.map(c => ([
    { text: fmtFecha(c.fecha), fontSize: 8 },
    { text: MEDIO_LABEL[c.medio] ?? c.medio, fontSize: 8 },
    { text: c.obs ?? '—', fontSize: 7, color: '#666' },
    { text: fmtM(Number(c.monto)), fontSize: 8, alignment: 'right', bold: true },
  ]))

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    footer: (page, total) => ({
      text: `${EMPRESA.nombre} · Materiales a cuenta del cliente · página ${page} de ${total}`,
      fontSize: 7, color: '#999', alignment: 'center', margin: [0, 12, 0, 0],
    }),
    content: [
      {
        columns: [
          { text: EMPRESA.nombre, fontSize: 18, bold: true, color: AZUL },
          { text: `Emitido: ${emision}`, fontSize: 9, alignment: 'right', color: '#666' },
        ],
      },
      { text: esDeuda ? 'Detalle de deuda — Materiales' : 'Cuenta del cliente — Materiales', fontSize: 10, color: '#666', margin: [0, 2, 0, 12] },
      { text: obraNombre, fontSize: 14, bold: true, color: NARANJA },
      { text: `Obra ${obraCod}`, fontSize: 9, color: '#666', margin: [0, 1, 0, 0] },
      esDeuda
        ? { text: `Materiales adeudados al ${emision}`, fontSize: 8, italics: true, color: '#999', margin: [0, 1, 0, 0] }
        : { text: 'Histórico completo — materiales adelantados y pagos recibidos', fontSize: 8, italics: true, color: '#999', margin: [0, 1, 0, 0] },

      // Resumen
      {
        margin: [0, 12, 0, 16],
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { text: `Adeudado\n${fmtM(adeudadoTotal)}`, alignment: 'center', fontSize: 11, bold: true, margin: [0, 6, 0, 6] },
            { text: `Pagado\n${fmtM(pagadoTotal)}`, alignment: 'center', fontSize: 11, bold: true, color: '#2F855A', margin: [0, 6, 0, 6] },
            { text: `SALDO\n${fmtM(saldo)}`, alignment: 'center', fontSize: 12, bold: true, color: saldo > 0 ? '#C53030' : '#2F855A', margin: [0, 6, 0, 6] },
          ]],
        },
        layout: { hLineColor: () => '#ddd', vLineColor: () => '#ddd' },
      },

      // Items
      { text: esDeuda ? `Materiales adeudados (${items.length})` : `Materiales adelantados (${items.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      items.length === 0
        ? { text: esDeuda ? 'Sin materiales adeudados. ✔' : 'Sin materiales registrados.', fontSize: 9, italics: true, color: '#666', margin: [0, 0, 0, 12] }
        : {
            margin: [0, 0, 0, esDeuda ? 6 : 16] as [number, number, number, number],
            table: {
              headerRows: 1,
              widths: esDeuda ? [56, '*', 56, 90, 52, 58] : [56, '*', 56, 84, 52, 58, 44],
              body: [
                (esDeuda
                  ? ['Fecha', 'Material', 'Cant.', 'Proveedor', 'P. unit.', 'Total']
                  : ['Fecha', 'Material', 'Cant.', 'Proveedor', 'P. unit.', 'Total', 'Estado']
                ).map(h => ({
                  text: h, fontSize: 8, bold: true, color: 'white', fillColor: AZUL,
                })),
                ...filasItems,
              ],
            },
            layout: { hLineColor: () => '#ddd', vLineColor: () => '#fff', paddingTop: () => 3, paddingBottom: () => 3 },
          },

      esDeuda && items.length > 0
        ? { text: `Total adeudado: ${fmtM(totalItems)}`, fontSize: 11, bold: true, color: '#C53030', alignment: 'right', margin: [0, 0, 0, 10] }
        : null,
      sinPrecio > 0
        ? { text: `⚠ ${sinPrecio} material${sinPrecio !== 1 ? 'es' : ''} sin tasar (a $0) — la deuda real puede ser mayor.`, fontSize: 9, color: '#C05621', bold: true, margin: [0, 0, 0, 6] }
        : null,
      difiereDelSaldo
        ? { text: `⚠ La suma de los materiales adeudados (${fmtM(totalItems)}) difiere del saldo de cuenta (${fmtM(saldo)}): hay pagos a cuenta sin imputar a items puntuales. El saldo de cuenta es el válido.`, fontSize: 9, color: '#C05621', margin: [0, 0, 0, 6] }
        : null,

      // Pagos (solo en histórico)
      ...(esDeuda ? [] : [
        { text: `Pagos del cliente (${cobros.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] } as Content,
        cobros.length === 0
          ? { text: 'Sin pagos registrados.', fontSize: 9, italics: true, color: '#666' } as Content
          : {
              table: {
                headerRows: 1,
                widths: [70, 90, '*', 70],
                body: [
                  ['Fecha', 'Medio', 'Observaciones', 'Monto'].map(h => ({
                    text: h, fontSize: 8, bold: true, color: 'white', fillColor: AZUL,
                  })),
                  ...filasCobros,
                ],
              },
              layout: { hLineColor: () => '#ddd', vLineColor: () => '#fff', paddingTop: () => 3, paddingBottom: () => 3 },
            } as Content,
      ]),
    ].filter(Boolean) as Content[],
  }

  const prefijo = esDeuda ? 'deuda-materiales' : 'cuenta-materiales'
  const nombreArchivo = `${prefijo}-${obraNombre.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${hoy.toISOString().slice(0, 10)}.pdf`
  pdfMake.createPdf(doc).download(nombreArchivo)
}
