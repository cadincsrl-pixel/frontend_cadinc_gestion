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

// modo 'historico': todos los remitos (con columna Estado) + cobros — el PDF de siempre.
// modo 'deuda': SOLO los remitos adeudados (cobro_id null), sin historial de
// cobros — pensado para mandarle al cliente lo que debe. Ojo: la imputación
// remito→cobro es opcional, así que si hay cobros sin imputar la suma de
// adeudados puede diferir del saldo real; el PDF lo avisa.
export function descargarCuentaClientePdf(
  cuenta:  CuentaCorrienteCliente,
  remitos: RemitoCliente[],
  cobros:  Cobro[],
  modo: 'deuda' | 'historico' = 'historico',
) {
  const esDeuda = modo === 'deuda'
  const items = esDeuda ? remitos.filter(r => r.cobro_id == null) : remitos
  const hoy = new Date()
  const emision = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`

  const filasRemitos: Content[][] = items.map(r => {
    const fila: Content[] = [
      { text: r.numero, fontSize: 8, bold: true, color: NARANJA },
      { text: fmtFecha(r.fecha_trabajo), fontSize: 8 },
      { text: r.obra_nombre ?? '—', fontSize: 8 },
      { text: r.maquina_nombre ?? '—', fontSize: 8 },
      { text: `${fmtHs(Number(r.horas))} hs`, fontSize: 8, alignment: 'right' },
      { text: r.importe != null ? fmtM(Number(r.importe)) : '—', fontSize: 8, alignment: 'right', bold: true },
    ]
    // En modo deuda todas las filas son adeudadas: la columna Estado sobra.
    if (!esDeuda) {
      fila.push(r.cobro_id != null
        ? { text: 'Pagado', fontSize: 7, alignment: 'center', color: '#2F855A', bold: true }
        : { text: 'Adeudado', fontSize: 7, alignment: 'center', color: '#C53030' })
    }
    return fila
  })

  const totalAdeudado = items.reduce((s, r) => s + (r.importe != null ? Number(r.importe) : 0), 0)
  const sinImporte    = items.filter(r => r.importe == null).length
  const difiereDelSaldo = esDeuda && Math.abs(totalAdeudado - cuenta.saldo) > 1

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
      { text: esDeuda ? 'Detalle de deuda — Alquiler de maquinaria' : 'Detalle de cuenta corriente — Alquiler de maquinaria', fontSize: 10, color: '#666', margin: [0, 2, 0, 12] },
      { text: cuenta.cliente_nombre, fontSize: 14, bold: true, color: NARANJA },
      // El PDF SIEMPRE refleja el estado total acumulado (sin el filtro de
      // fechas de la pantalla), para que resumen, remitos y cobros cierren
      // entre sí. Se aclara para que no se confunda con la card filtrada.
      esDeuda
        ? { text: `Remitos adeudados al ${emision}`, fontSize: 8, italics: true, color: '#999', margin: [0, 1, 0, 0] }
        : { text: 'Histórico completo — incluye todos los períodos', fontSize: 8, italics: true, color: '#999', margin: [0, 1, 0, 0] },

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
      { text: esDeuda ? `Remitos adeudados (${items.length})` : `Remitos (${items.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] },
      items.length === 0
        ? { text: esDeuda ? 'Sin remitos adeudados. ✔' : 'Sin remitos emitidos.', fontSize: 9, italics: true, color: '#666', margin: [0, 0, 0, 12] }
        : {
            margin: [0, 0, 0, esDeuda ? 6 : 16] as [number, number, number, number],
            table: {
              headerRows: 1,
              widths: esDeuda ? [48, 52, '*', '*', 42, 58] : [48, 52, '*', '*', 42, 58, 46],
              body: [
                (esDeuda
                  ? ['Remito', 'Fecha', 'Obra', 'Máquina', 'Horas', 'Importe']
                  : ['Remito', 'Fecha', 'Obra', 'Máquina', 'Horas', 'Importe', 'Estado']
                ).map(h => ({
                  text: h, fontSize: 8, bold: true, color: 'white', fillColor: AZUL,
                })),
                ...filasRemitos,
              ],
            },
            layout: { hLineColor: () => '#ddd', vLineColor: () => '#fff', paddingTop: () => 3, paddingBottom: () => 3 },
          },

      // Total y avisos del modo deuda
      esDeuda && items.length > 0
        ? { text: `Total adeudado: ${fmtM(totalAdeudado)}`, fontSize: 11, bold: true, color: '#C53030', alignment: 'right', margin: [0, 0, 0, 10] }
        : null,
      esDeuda && sinImporte > 0
        ? { text: `⚠ ${sinImporte} remito${sinImporte !== 1 ? 's' : ''} sin importe cargado — la deuda real puede ser mayor.`, fontSize: 9, color: '#C05621', bold: true, margin: [0, 0, 0, 6] }
        : null,
      difiereDelSaldo
        ? { text: `⚠ La suma de los remitos adeudados (${fmtM(totalAdeudado)}) difiere del saldo de cuenta (${fmtM(cuenta.saldo)}): hay cobros sin imputar a remitos puntuales. El saldo de cuenta es el válido.`, fontSize: 9, color: '#C05621', margin: [0, 0, 0, 6] }
        : null,

      // Cobros (solo en histórico: el PDF de deuda es para mandar al cliente)
      ...(esDeuda ? [] : [
        { text: `Cobros (${cobros.length})`, fontSize: 11, bold: true, color: AZUL, margin: [0, 0, 0, 6] } as Content,
        cobros.length === 0
          ? { text: 'Sin cobros registrados.', fontSize: 9, italics: true, color: '#666' } as Content
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

  const prefijo = esDeuda ? 'deuda-alquiler' : 'cuenta-alquiler'
  const nombreArchivo = `${prefijo}-${cuenta.cliente_nombre.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${hoy.toISOString().slice(0, 10)}.pdf`
  pdfMake.createPdf(doc).download(nombreArchivo)
}
