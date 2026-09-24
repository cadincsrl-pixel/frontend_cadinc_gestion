/**
 * El resumen imprimible de la bandeja de facturas (2026-09-21).
 *
 * Pedido del dueño: «estaría bueno poder extraer un resumen PDF según lo
 * filtrado». Es la hoja que se imprime o se manda por mail, distinta del
 * Excel: el Excel es para trabajar, esto es para MIRAR y decidir qué se paga.
 *
 * Por eso no repite la tabla entera de 22 columnas. Responde tres preguntas,
 * en este orden, que es el orden en que se mira antes de pagar:
 *   1. ¿Cuánto se debe en total y cuánto de eso está vencido?
 *   2. ¿A quién? — por proveedor, el que más debe primero.
 *   3. ¿Para cuándo? — por tramo de vencimiento.
 *
 * Y dice ARRIBA con qué filtro se generó. Un resumen sin esa línea es una
 * trampa: alguien lo imprime filtrado por «vencidas» y después lo lee como si
 * fuera toda la deuda.
 *
 * Las NOTAS DE CRÉDITO (20260925) restan en «facturado» (van con signo), no
 * suman al saldo (su saldo es 0: nunca son deuda) y el crédito que les queda
 * sin aplicar se muestra aparte.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { comprobanteTxt, conSigno, esNC, estadoLabel, fmtM, hoyAR } from './pagos.utils'
import type { PagosFactura } from '@/types/domain.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

const AZUL    = '#1A365D'
const NARANJA = '#E8621A'
const ROJO    = '#C00000'

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}

/** Los tramos en que se mira un vencimiento. El orden importa: primero lo que quema. */
const TRAMOS = [
  { key: 'vencida', label: 'Vencidas',        test: (d: number | null) => d != null && d > 0 },
  { key: 'hoy',     label: 'Vencen hoy',      test: (d: number | null) => d === 0 },
  { key: '7',       label: 'Próximos 7 días', test: (d: number | null) => d != null && d < 0 && d >= -7 },
  { key: '30',      label: 'De 8 a 30 días',  test: (d: number | null) => d != null && d < -7 && d >= -30 },
  { key: 'mas',     label: 'Más de 30 días',  test: (d: number | null) => d != null && d < -30 },
  { key: 'sin',     label: 'Sin vencimiento', test: (d: number | null) => d == null },
]

/**
 * Días hasta el vencimiento: positivo = ya venció. `dias_vencida` solo viene
 * cuando está vencida, así que para el resto se calcula contra hoy.
 */
function diasHasta(f: PagosFactura, hoy: string): number | null {
  if (f.dias_vencida != null) return Number(f.dias_vencida)
  if (!f.vence_el) return null
  const ms = new Date(hoy + 'T12:00:00').getTime() - new Date(f.vence_el.slice(0, 10) + 'T12:00:00').getTime()
  return Math.round(ms / 86400000)
}

const th = (t: string, alin: 'left' | 'right' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 8, color: '#FFF', fillColor: AZUL, alignment: alin, margin: [3, 4, 3, 4] })
const td = (t: string, alin: 'left' | 'right' = 'left', extra: Record<string, unknown> = {}): TableCell =>
  ({ text: t, fontSize: 8, alignment: alin, margin: [3, 3, 3, 3], ...extra })

export interface ResumenPdfOpts {
  /** Lo que dice el filtro de la pantalla, en castellano. Va impreso arriba. */
  descripcionFiltro: string
  /** Detalle factura por factura además de los agrupados. */
  conDetalle?: boolean
}

export async function exportarResumenPagosPdf(
  filas: PagosFactura[], { descripcionFiltro, conDetalle = true }: ResumenPdfOpts,
): Promise<void> {
  const hoy = hoyAR()
  const emision = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

  // Una NC nunca es deuda: su saldo no suma aunque viniera distinto de 0.
  const saldo = (f: PagosFactura) => (esNC(f) ? 0 : Number(f.saldo) || 0)
  const firmado = (f: PagosFactura) => conSigno(f.total, f.clase)
  const nFacturas = filas.filter(f => !esNC(f)).length
  const nNc       = filas.length - nFacturas
  const creditoNc = filas.filter(esNC).reduce((s, f) => s + (Number(f.nc_disponible) || 0), 0)
  const total     = filas.reduce((s, f) => s + firmado(f), 0)
  const deuda     = filas.reduce((s, f) => s + saldo(f), 0)
  const vencido   = filas.filter(f => f.vencida).reduce((s, f) => s + saldo(f), 0)
  const sinPapel  = filas.filter(f => !f.tiene_factura_adj).length
  // (las NC también cuentan: su papel también lo pide el Libro IVA)

  // ── Por proveedor, el que más debe primero ──
  const porProv = new Map<string, { cuit: string; n: number; total: number; saldo: number; vencido: number }>()
  for (const f of filas) {
    const k = f.proveedor_nom
    const a = porProv.get(k) ?? { cuit: f.proveedor_cuit ?? '', n: 0, total: 0, saldo: 0, vencido: 0 }
    a.n += 1
    a.total += firmado(f)
    a.saldo += saldo(f)
    if (f.vencida) a.vencido += saldo(f)
    porProv.set(k, a)
  }
  const provs = [...porProv.entries()].sort((a, b) => b[1].saldo - a[1].saldo || b[1].total - a[1].total)

  // ── Por tramo de vencimiento (solo lo que todavía se debe) ──
  const conDeuda = filas.filter(f => saldo(f) > 0.005)
  const tramos = TRAMOS.map(t => {
    const dentro = conDeuda.filter(f => t.test(diasHasta(f, hoy)))
    return { label: t.label, n: dentro.length, monto: dentro.reduce((s, f) => s + saldo(f), 0), esVencida: t.key === 'vencida' }
  }).filter(t => t.n > 0)

  // ── Por estado ──
  const porEstado = new Map<string, { n: number; monto: number }>()
  for (const f of filas) {
    const k = (esNC(f) ? 'NC · ' : '') + estadoLabel(f.estado, f.clase)
    const a = porEstado.get(k) ?? { n: 0, monto: 0 }
    a.n += 1
    a.monto += firmado(f)
    porEstado.set(k, a)
  }

  const bloque = (titulo: string, cuerpo: Content): Content => ([
    { text: titulo, fontSize: 11, bold: true, color: NARANJA, margin: [0, 14, 0, 5] },
    cuerpo,
  ] as unknown as Content)

  const content: Content[] = [
    {
      columns: [
        { text: EMPRESA.nombre, fontSize: 18, bold: true, color: AZUL },
        { text: `Emitido: ${emision}`, fontSize: 9, alignment: 'right', color: '#666' },
      ],
    },
    { text: 'Pagos a proveedores — resumen', fontSize: 10, color: '#666', margin: [0, 2, 0, 0] },
    // La línea que evita que se lea como si fuera toda la deuda.
    {
      text: `Filtro aplicado: ${descripcionFiltro}`,
      fontSize: 9, italics: true, color: '#444',
      margin: [0, 6, 0, 0], background: '#F4F6F9',
    },

    bloque('Lo que se debe', {
      table: {
        widths: creditoNc > 0 ? ['*', '*', '*', '*', '*'] : ['*', '*', '*', '*'],
        body: [[
          { stack: [{ text: 'Facturas', fontSize: 8, color: '#666' }, { text: String(nFacturas) + (nNc ? ` + ${nNc} NC` : ''), fontSize: 16, bold: true, color: AZUL }], margin: [6, 6, 6, 6] },
          { stack: [{ text: nNc ? 'Total facturado (neto de NC)' : 'Total facturado', fontSize: 8, color: '#666' }, { text: fmtM(total), fontSize: 14, bold: true }], margin: [6, 6, 6, 6] },
          { stack: [{ text: 'Saldo a pagar', fontSize: 8, color: '#666' }, { text: fmtM(deuda), fontSize: 16, bold: true, color: NARANJA }], margin: [6, 6, 6, 6] },
          { stack: [{ text: 'De eso, vencido', fontSize: 8, color: '#666' }, { text: fmtM(vencido), fontSize: 16, bold: true, color: vencido > 0 ? ROJO : '#666' }], margin: [6, 6, 6, 6] },
          ...(creditoNc > 0 ? [{ stack: [{ text: 'NC sin aplicar (a favor)', fontSize: 8, color: '#666' }, { text: fmtM(creditoNc), fontSize: 14, bold: true, color: '#5A2D82' }], margin: [6, 6, 6, 6] as [number, number, number, number] }] : []),
        ]],
      },
      layout: { fillColor: () => '#F4F6F9', hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
    }),

    bloque('A quién se le debe', {
      table: {
        headerRows: 1,
        widths: ['*', 70, 28, 62, 62, 62],
        body: [
          [th('Proveedor'), th('CUIT'), th('N°', 'right'), th('Facturado', 'right'), th('Saldo', 'right'), th('Vencido', 'right')],
          ...provs.map(([nom, a]) => [
            td(nom), td(a.cuit), td(String(a.n), 'right'),
            td(fmtM(a.total), 'right'), td(fmtM(a.saldo), 'right', { bold: true }),
            td(a.vencido > 0 ? fmtM(a.vencido) : '—', 'right', a.vencido > 0 ? { color: ROJO, bold: true } : { color: '#999' }),
          ]),
          [
            td('TOTAL', 'left', { bold: true, fillColor: '#EEE' }), td('', 'left', { fillColor: '#EEE' }),
            td(String(filas.length), 'right', { bold: true, fillColor: '#EEE' }),
            td(fmtM(total), 'right', { bold: true, fillColor: '#EEE' }),
            td(fmtM(deuda), 'right', { bold: true, fillColor: '#EEE' }),
            td(fmtM(vencido), 'right', { bold: true, fillColor: '#EEE', color: vencido > 0 ? ROJO : '#666' }),
          ],
        ],
      },
      layout: { hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
    }),
  ]

  if (tramos.length > 0) {
    content.push(bloque('Para cuándo', {
      table: {
        headerRows: 1,
        widths: ['*', 40, 80],
        body: [
          [th('Tramo'), th('Facturas', 'right'), th('Saldo', 'right')],
          ...tramos.map(t => [
            td(t.label, 'left', t.esVencida ? { color: ROJO, bold: true } : {}),
            td(String(t.n), 'right'),
            td(fmtM(t.monto), 'right', t.esVencida ? { color: ROJO, bold: true } : { bold: true }),
          ]),
        ],
      },
      layout: { hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
    }))
  }

  content.push(bloque('En qué estado están', {
    table: {
      headerRows: 1,
      widths: ['*', 40, 80],
      body: [
        [th('Estado'), th('Facturas', 'right'), th('Total', 'right')],
        ...[...porEstado.entries()].map(([k, a]) => [td(k), td(String(a.n), 'right'), td(fmtM(a.monto), 'right')]),
      ],
    },
    layout: { hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
  }))

  if (conDetalle && filas.length > 0) {
    const orden = [...filas].sort((a, b) => (a.vence_el ?? '9999').localeCompare(b.vence_el ?? '9999'))
    content.push({ text: 'Detalle', fontSize: 11, bold: true, color: NARANJA, margin: [0, 16, 0, 5], pageBreak: 'before' })
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 92, 44, 44, 58, 58, 52],
        body: [
          [th('Proveedor'), th('Comprobante'), th('Emitida'), th('Vence'), th('Total', 'right'), th('Saldo', 'right'), th('Estado')],
          ...orden.map(f => [
            td(f.proveedor_nom),
            td(comprobanteTxt(f.tipo_comprobante, f.numero, f.clase)),
            td(fmtFecha(f.fecha)),
            td(fmtFecha(f.vence_el), 'left', f.vencida ? { color: ROJO, bold: true } : {}),
            td(fmtM(firmado(f)), 'right', esNC(f) ? { color: '#5A2D82' } : {}),
            td(saldo(f) > 0.005 ? fmtM(saldo(f)) : '—', 'right', saldo(f) > 0.005 ? { bold: true } : { color: '#999' }),
            td(estadoLabel(f.estado, f.clase)),
          ]),
        ],
      },
      layout: { hLineColor: () => '#DDD', vLineColor: () => '#DDD' },
    })
  }

  if (sinPapel > 0) {
    content.push({
      text: `⚠ ${sinPapel} factura(s) sin comprobante adjunto.`,
      fontSize: 8, color: ROJO, margin: [0, 10, 0, 0],
    })
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    footer: (page, count) => ({
      text: `${EMPRESA.nombre} · Pagos a proveedores · ${descripcionFiltro} · página ${page} de ${count}`,
      fontSize: 7, color: '#999', alignment: 'center', margin: [0, 12, 0, 0],
    }),
    content,
  }
  pdfMake.createPdf(doc).download(`Pagos_resumen_${hoy}.pdf`)
}
