/**
 * Compras › Cuentas: la cuenta corriente con un proveedor, en Excel y en PDF
 * (20260929s).
 *
 * Es la hoja que se pone al lado del estado de cuenta que manda el proveedor
 * para compararlos línea por línea (nació con Voltaje, 25/09). Por eso sigue
 * su forma: saldo inicial, movimientos por fecha con debe / haber / saldo, y
 * el saldo final. Arriba dice el rango: un estado de cuenta sin fechas no se
 * puede comparar con nada.
 *
 * Saldo positivo = CADINC le debe al proveedor.
 */
import ExcelJS from 'exceljs'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { fmtFecha, fmtM } from './pagos.utils'
import type { PagosCuentaCorriente, PagosCuentaMovimiento } from '@/types/domain.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

export const TIPO_MOV_LABEL: Record<PagosCuentaMovimiento['tipo'], string> = {
  factura:      'Factura',
  nota_debito:  'Nota de débito',
  nota_credito: 'Nota de crédito',
  pago:         'Pago',
}

/** Lo que se agrega al detalle para leer la cuenta sabiendo qué falta. */
export function marcasMovimiento(m: PagosCuentaMovimiento): string[] {
  const out: string[] = []
  if (m.a_reconstruir) out.push('pago a reconstruir')
  if (m.reconstruida)  out.push('pago reconstruido')
  return out
}

const nombreArchivo = (cc: PagosCuentaCorriente, ext: string) =>
  `Cuenta_${cc.proveedor.razon_social.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${cc.desde}_${cc.hasta}.${ext}`

const encabezadoTxt = (cc: PagosCuentaCorriente) =>
  `${cc.proveedor.razon_social}${cc.proveedor.cuit ? ` · CUIT ${cc.proveedor.cuit}` : ''}${cc.proveedor.codigo ? ` · ${cc.proveedor.codigo}` : ''}`

// ── Excel ─────────────────────────────────────────────────────────────

const FMT_MONEDA = '"$"#,##0.00;[Red]"-$"#,##0.00;"—"'
const FMT_FECHA  = 'dd/mm/yyyy'
const C_AZUL        = 'FF1F3A66'
const C_AZUL_HEADER = 'FF445C82'
const C_AZUL_LIGHT  = 'FFE8F0F8'
const C_GRIS_BORDE  = 'FFCCCCCC'
const C_GRIS_MEDIUM = 'FFE0E0E0'
const C_BLANCO      = 'FFFFFFFF'

const fechaXls = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00')

export async function exportarCuentaCorrienteExcel(cc: PagosCuentaCorriente): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = new Date()
  const ws = wb.addWorksheet('Cuenta corriente')
  const headers = ['Fecha', 'Tipo', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo']
  ;[12, 16, 20, 60, 16, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  ws.mergeCells(1, 1, 1, headers.length)
  const t = ws.getCell(1, 1)
  t.value = `${EMPRESA.nombre} — Cuenta corriente con ${encabezadoTxt(cc)}`
  t.font = { name: 'Calibri', size: 13, bold: true, color: { argb: C_BLANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  t.alignment = { vertical: 'middle', indent: 1 }
  ws.getRow(1).height = 24
  ws.mergeCells(2, 1, 2, headers.length)
  const s = ws.getCell(2, 1)
  s.value = `Del ${fmtFecha(cc.desde)} al ${fmtFecha(cc.hasta)} · Saldo positivo = CADINC le debe al proveedor · Importes finales con IVA`
  s.font = { name: 'Calibri', size: 10, italic: true }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }
  s.alignment = { indent: 1 }

  const hr = ws.getRow(3)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: C_BLANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
    c.alignment = { horizontal: 'center' }
  })

  const ini = ws.getRow(4)
  ini.values = [fechaXls(cc.desde), '', '', 'Saldo inicial', null, null, Number(cc.saldo_inicial)]
  ini.getCell(1).numFmt = FMT_FECHA
  ini.getCell(7).numFmt = FMT_MONEDA
  ini.font = { italic: true, bold: true }

  let r = 5
  for (const m of cc.movimientos) {
    const row = ws.getRow(r++)
    const marcas = marcasMovimiento(m)
    row.values = [
      fechaXls(m.fecha), TIPO_MOV_LABEL[m.tipo], m.comprobante,
      [m.detalle, ...marcas].filter(Boolean).join(' · '),
      Number(m.debe) || null, Number(m.haber) || null, Number(m.saldo),
    ]
    row.getCell(1).numFmt = FMT_FECHA
    for (const c of [5, 6, 7]) row.getCell(c).numFmt = FMT_MONEDA
    row.eachCell({ includeEmpty: true }, c => { c.border = { bottom: { style: 'thin', color: { argb: C_GRIS_BORDE } } } })
  }

  const tot = ws.getRow(r)
  tot.values = [fechaXls(cc.hasta), '', '', 'Saldo final', Number(cc.total_debe), Number(cc.total_haber), Number(cc.saldo_final)]
  tot.getCell(1).numFmt = FMT_FECHA
  for (const c of [5, 6, 7]) tot.getCell(c).numFmt = FMT_MONEDA
  tot.eachCell({ includeEmpty: true }, c => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_MEDIUM } }
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]

  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo(cc, 'xlsx')
  a.click()
  URL.revokeObjectURL(url)
}

// ── PDF ───────────────────────────────────────────────────────────────

const AZUL    = '#1A365D'
const NARANJA = '#E8621A'

const th = (t: string, alin: 'left' | 'right' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 8, color: '#FFF', fillColor: AZUL, alignment: alin, margin: [3, 4, 3, 4] })
const td = (t: string, alin: 'left' | 'right' = 'left', extra: Record<string, unknown> = {}): TableCell =>
  ({ text: t, fontSize: 8, alignment: alin, margin: [3, 3, 3, 3], ...extra })

export function exportarCuentaCorrientePdf(cc: PagosCuentaCorriente): void {
  const emision = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
  const monto = (v: number) => (Number(v) ? fmtM(Number(v)) : '')
  const body: TableCell[][] = [
    [th('Fecha'), th('Comprobante'), th('Detalle'), th('Debe', 'right'), th('Haber', 'right'), th('Saldo', 'right')],
    [td(fmtFecha(cc.desde)), td(''), td('Saldo inicial', 'left', { italics: true, bold: true }), td(''), td(''),
      td(fmtM(Number(cc.saldo_inicial)), 'right', { bold: true })],
    ...cc.movimientos.map(m => [
      td(fmtFecha(m.fecha)),
      td(`${TIPO_MOV_LABEL[m.tipo]}\n${m.comprobante}`),
      td([m.detalle, ...marcasMovimiento(m)].filter(Boolean).join(' · '), 'left', m.a_reconstruir ? { color: '#8A5A00' } : {}),
      td(monto(m.debe), 'right'),
      td(monto(m.haber), 'right', m.tipo === 'nota_credito' ? { color: '#5A2D82' } : {}),
      td(fmtM(Number(m.saldo)), 'right', { bold: true }),
    ]),
    [td(fmtFecha(cc.hasta), 'left', { bold: true }), td(''), td('Saldo final', 'left', { bold: true }),
      td(fmtM(Number(cc.total_debe)), 'right', { bold: true }), td(fmtM(Number(cc.total_haber)), 'right', { bold: true }),
      td(fmtM(Number(cc.saldo_final)), 'right', { bold: true, color: NARANJA })],
  ]
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    footer: (page, count) => ({
      text: `${EMPRESA.nombre} · Cuenta corriente con ${cc.proveedor.razon_social} · página ${page} de ${count}`,
      fontSize: 7, color: '#999', alignment: 'center', margin: [0, 12, 0, 0],
    }),
    content: [
      { columns: [
        { text: EMPRESA.nombre, fontSize: 18, bold: true, color: AZUL },
        { text: `Emitido: ${emision}`, fontSize: 9, alignment: 'right', color: '#666' },
      ] },
      { text: `Cuenta corriente con ${encabezadoTxt(cc)}`, fontSize: 11, bold: true, color: NARANJA, margin: [0, 6, 0, 0] },
      { text: `Del ${fmtFecha(cc.desde)} al ${fmtFecha(cc.hasta)} · saldo positivo = CADINC le debe al proveedor · importes finales con IVA`,
        fontSize: 8, italics: true, color: '#555', margin: [0, 2, 0, 10] },
      {
        table: { headerRows: 1, widths: [48, 78, '*', 62, 62, 66], body },
        layout: { hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
      },
    ],
  }
  pdfMake.createPdf(doc).download(nombreArchivo(cc, 'pdf'))
}
