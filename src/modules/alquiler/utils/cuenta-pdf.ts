// PDF del detalle de cuenta corriente de un cliente de alquiler de maquinaria.
// Lib: pdfmake (mismo patrón que el PDF de cuenta de áridos / liquidacion-pdf).

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { Cobro, CuentaCorrienteCliente, RemitoCliente } from '../types'
import { MEDIO_COBRO_LABEL } from '../types'

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

function fmtHs(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function descargarCuentaClientePdf(
  cuenta:  CuentaCorrienteCliente,
  remitos: RemitoCliente[],
  cobros:  Cobro[],
) {
  const hoy = new Date()
  const emision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const filasRemitos: Content[][] = remitos.map(r => ([
    { text: r.numero, fontSize: 8, bold: true, color: NARANJA },
    { text: fmtFecha(r.fecha_trabajo), fontSize: 8 },
    { text: r.obra_nombre ?? '—', fontSize: 8 },
    { text: r.maquina_nombre ?? '—', fontSize: 8 },
    { text: `${fmtHs(Number(r.horas))} hs`, fontSize: 8, alignment: 'right' },
    { text: r.importe != null ? fmtM(Number(r.importe)) : '—', fontSize: 8, alignment: 'right', bold: true },
    r.cobro_id != null
      ? { text: 'Pagado', fontSize: 7, alignment: 'center', color: '#2F855A', bold: true }
      : { text: 'Adeudado', fontSize: 7, alignment: 'center', color: '#C53030' },
  ]))

  const filasCobros: Content[][] = cobros.map(c => ([
    { text: fmtFecha(c.fecha), fontSize: 8 },
    { text: MEDIO_COBRO_LABEL[c.medio] ?? c.medio, fontSize: 8 },
    { text: c.obs ?? '—', fontSize: 7, color: '#666' },
    { text: fmtM(Number(c.monto)), fontSize: 8, alignment: 'right', bold: true },
  ]))

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    footer: (page, total) => ({
      text: `${EMPRESA.nombre} · Cuenta corriente de alquiler de maquinaria · página ${page} de ${total}`,
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
      { text: 'Detalle de cuenta corriente — Alquiler de maquinaria', fontSize: 10, color: '#666', margin: [0, 2, 0, 12] },
      { text: cuenta.cliente_nombre, fontSize: 14, bold: true, color: NARANJA },

      // Resumen
      {
        margin: [0, 12, 0, 16],
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { text: `Devengado\n${fmtM(cuenta.devengado)}`, alignment: 'center', fontSize: 11, bold: true, margin: [0, 6, 0, 6] },
            { text: `Cobrado\n${fmtM(cuenta.cobros)}`, alignment: 'center', fontSize: 11, bold: true, color: '#2F855A', margin: [0, 6, 0, 6] },
            { text: `SALDO\n${fmtM(cuenta.saldo)}`, alignment: 'center', fontSize: 12, bold: true, color: cuenta.saldo > 0 ? '#C53030' : '#2F855A', margin: [0, 6, 0, 6] },
          ]],
        },
        layout: { hLineColor: () => '#ddd', vLineColor: () => '#ddd' },
      },

      // Remitos
      { text: `Remitos (${remitos.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      remitos.length === 0
        ? { text: 'Sin remitos emitidos.', fontSize: 9, italics: true, color: '#666', margin: [0, 0, 0, 12] }
        : {
            margin: [0, 0, 0, 16] as [number, number, number, number],
            table: {
              headerRows: 1,
              widths: [48, 52, '*', '*', 42, 58, 46],
              body: [
                ['Remito', 'Fecha', 'Obra', 'Máquina', 'Horas', 'Importe', 'Estado'].map(h => ({
                  text: h, fontSize: 8, bold: true, color: 'white', fillColor: AZUL,
                })),
                ...filasRemitos,
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

  const nombreArchivo = `cuenta-alquiler-${cuenta.cliente_nombre.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${hoy.toISOString().slice(0, 10)}.pdf`
  pdfMake.createPdf(doc).download(nombreArchivo)
}
