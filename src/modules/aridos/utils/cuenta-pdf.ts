// PDF del detalle de cuenta corriente de un cliente de áridos.
// Lib: pdfmake (mismo patrón que liquidacion-pdf.ts).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { MovimientoArido, CobroArido, CuentaCorrienteArido } from '../types'

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
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function fmtCant(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const MEDIO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', otro: 'Otro',
}

export function descargarCuentaClientePdf(
  cuenta: CuentaCorrienteArido,
  ventas: MovimientoArido[],
  cobros: CobroArido[],
) {
  const hoy = new Date()
  const emision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const filasVentas: Content[][] = ventas.map(v => ([
    { text: `${fmtFecha(v.fecha)}${v.hora ? ` ${v.hora.slice(0, 5)}` : ''}`, fontSize: 8 },
    { text: v.aridos_materiales?.nombre ?? '—', fontSize: 8 },
    { text: `${fmtCant(Number(v.cantidad))} ${v.aridos_materiales?.unidad === 'viaje' ? 'viaje(s)' : 'm³'}`, fontSize: 8, alignment: 'right' },
    { text: v.entrega_direccion ?? '—', fontSize: 7, color: '#666' },
    { text: v.remito_numero ?? v.remito ?? '—', fontSize: 8 },
    { text: v.precio_unit != null ? fmtM(Number(v.precio_unit)) : '—', fontSize: 8, alignment: 'right' },
    { text: v.importe != null ? fmtM(Number(v.importe)) : '—', fontSize: 8, alignment: 'right', bold: true },
  ]))

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
      text: `${EMPRESA.nombre} · Cuenta corriente de áridos · página ${page} de ${total}`,
      fontSize: 7, color: '#999', alignment: 'center', margin: [0, 12, 0, 0],
    }),
    content: [
      // Header
      {
        columns: [
          { text: EMPRESA.nombre, fontSize: 18, bold: true, color: AZUL },
          { text: `Emitido: ${emision}`, fontSize: 9, alignment: 'right', color: '#666' },
        ],
      },
      { text: 'Detalle de cuenta corriente — Áridos', fontSize: 10, color: '#666', margin: [0, 2, 0, 12] },
      {
        text: cuenta.nombre, fontSize: 14, bold: true, color: NARANJA,
      },
      cuenta.cuit ? { text: `CUIT: ${cuenta.cuit}`, fontSize: 9, color: '#666', margin: [0, 1, 0, 0] } : null,

      // Resumen
      {
        margin: [0, 12, 0, 16],
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { text: `Vendido\n${fmtM(cuenta.vendido)}`, alignment: 'center', fontSize: 11, bold: true, margin: [0, 6, 0, 6] },
            { text: `Cobrado\n${fmtM(cuenta.cobrado)}`, alignment: 'center', fontSize: 11, bold: true, color: '#2F855A', margin: [0, 6, 0, 6] },
            { text: `SALDO\n${fmtM(cuenta.saldo)}`, alignment: 'center', fontSize: 12, bold: true, color: cuenta.saldo > 0 ? '#C53030' : '#2F855A', margin: [0, 6, 0, 6] },
          ]],
        },
        layout: { hLineColor: () => '#ddd', vLineColor: () => '#ddd' },
      },

      // Ventas
      { text: `Ventas (${ventas.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      ventas.length === 0
        ? { text: 'Sin ventas registradas.', fontSize: 9, italics: true, color: '#666', margin: [0, 0, 0, 12] }
        : {
            margin: [0, 0, 0, 16] as [number, number, number, number],
            table: {
              headerRows: 1,
              widths: [62, '*', 50, '*', 44, 52, 56],
              body: [
                ['Fecha', 'Material', 'Cant.', 'Entrega', 'Remito', 'Precio', 'Importe'].map(h => ({
                  text: h, fontSize: 8, bold: true, color: 'white', fillColor: AZUL,
                })),
                ...filasVentas,
              ],
            },
            layout: { hLineColor: () => '#ddd', vLineColor: () => '#fff', paddingTop: () => 3, paddingBottom: () => 3 },
          },

      // Cobros
      { text: `Cobros (${cobros.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      cobros.length === 0
        ? { text: 'Sin cobros registrados.', fontSize: 9, italics: true, color: '#666' }
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
          },
    ].filter(Boolean) as Content[],
  }

  const nombreArchivo = `cuenta-${cuenta.nombre.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${hoy.toISOString().slice(0, 10)}.pdf`
  pdfMake.createPdf(doc).download(nombreArchivo)
}
