/**
 * Estado de cuenta de un cliente: el PDF para mandarle y el Excel.
 *
 * Los movimientos salen de `ventas_estado_cuenta` (debe − haber con saldo
 * corrido; si hay «desde», la primera fila es el saldo anterior). Acá no se
 * recalcula nada: el saldo final ES el de la base, y coincide con el
 * `saldo_neto` de Deudores.
 */
import * as XLSX from 'xlsx'
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { VentasDeudor, VentasEstadoCuenta, VentasEstadoCuentaMov } from '@/types/domain.types'
import { CONDICIONES_IVA, fmtCuit, fmtFecha, fmtN, hoyAR } from './facturacion.utils'
import { logoDataUrl } from './facturaPdf'
import {
  CARBON, MARGEN_X, NARANJA, NARANJA_SUAVE, TENUE, cajaFina, datosFiscales, descargarPdf, encabezado, layoutLista,
  par, pie, slugArchivo, td, th, type Margen,
} from './pdfVentas'

export const MOVIMIENTO_LABEL: Record<VentasEstadoCuentaMov['movimiento'], string> = {
  saldo_anterior: 'Saldo anterior',
  factura:        'Factura',
  nota_debito:    'Nota de débito',
  nota_credito:   'Nota de crédito',
  externo:        'Saldo inicial',
  externo_nc:     'NC (saldo inicial)',
  cobro:          'Cobro',
  retencion:      'Retención',
  gasto:          'Gasto descontado',
}

export interface DatosEstadoCuenta {
  ec:          VentasEstadoCuenta
  /** Razón social y CUIT si el backend no manda el cliente. */
  razonSocial: string
  docNro:      string
  deudor?:     VentasDeudor | null
}

/** El saldo con el que termina el período: el que manda el backend o, si no, el de la última fila. */
export function saldoFinal(movs: VentasEstadoCuentaMov[], delServer?: number | null): number {
  if (delServer !== null && delServer !== undefined) return Number(delServer)
  return movs.length ? Number(movs[movs.length - 1]!.saldo) : 0
}

export function periodoTexto(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`
  if (desde) return `desde el ${fmtFecha(desde)}`
  if (hasta) return `hasta el ${fmtFecha(hasta)}`
  return 'todos los movimientos'
}

export function nombreArchivoEstadoCuenta(d: DatosEstadoCuenta, ext: 'pdf' | 'xlsx'): string {
  return `Estado_de_cuenta_${slugArchivo(d.razonSocial)}_${(d.ec.hasta ?? hoyAR()).replace(/-/g, '')}.${ext}`
}

export async function descargarEstadoCuentaPdf(d: DatosEstadoCuenta): Promise<void> {
  descargarPdf(armarEstadoCuentaDoc(d, { logo: await logoDataUrl() }), nombreArchivoEstadoCuenta(d, 'pdf'))
}

export function armarEstadoCuentaDoc(d: DatosEstadoCuenta, opts: { logo: string | null; hoy?: string }): TDocumentDefinitions {
  const { ec } = d
  const movs = ec.movimientos
  const final = saldoFinal(movs, ec.saldo_final)
  const cli = ec.cliente

  const cabecera = encabezado(opts.logo, [
    { text: 'ESTADO DE CUENTA', fontSize: 14, bold: true, color: NARANJA },
    { text: `Emitido el ${fmtFecha(opts.hoy ?? hoyAR())}`, fontSize: 7.5, color: TENUE, margin: [0, 1, 0, 6] as Margen },
    ...datosFiscales(),
  ])

  const cliente: Content = {
    table: {
      widths: ['*'],
      body: [[{
        margin: [6, 5, 6, 5],
        stack: [
          par('Cliente:', d.razonSocial, 64),
          par('C.U.I.T.:', fmtCuit(d.docNro), 64),
          ...(cli?.condicion_iva_id ? [par('Cond. IVA:', CONDICIONES_IVA[cli.condicion_iva_id] ?? String(cli.condicion_iva_id), 64)] : []),
          ...(cli?.domicilio?.trim() ? [par('Domicilio:', cli.domicilio, 64)] : []),
          par('Período:', periodoTexto(ec.desde, ec.hasta), 64),
        ],
      }]],
    },
    layout: cajaFina,
    margin: [0, 6, 0, 8],
  }

  const tabla: Content = movs.length ? {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [48, 92, '*', 66, 66, 70],
      body: [
        [th('Fecha'), th('Comprobante'), th('Detalle'), th('Debe', 'right'), th('Haber', 'right'), th('Saldo', 'right')],
        ...movs.map(m => {
          const ant = m.movimiento === 'saldo_anterior'
          const extra = ant ? { bold: true, fillColor: '#FAFAF7' } : {}
          return [
            td(fmtFecha(m.fecha), 'left', extra),
            td(ant ? '' : m.comprobante ?? '', 'left', extra),
            td(ant ? 'Saldo anterior' : [MOVIMIENTO_LABEL[m.movimiento], m.detalle].filter(Boolean).join(' — '), 'left', { ...extra, fontSize: 8 }),
            td(Number(m.debe) ? fmtN(m.debe) : '', 'right', extra),
            td(Number(m.haber) ? fmtN(m.haber) : '', 'right', extra),
            td(fmtN(m.saldo), 'right', { ...extra, bold: true }),
          ]
        }),
      ],
    },
    layout: layoutLista,
  } : { text: 'No hay movimientos en el período.', italics: true, color: TENUE }

  const cierre: Content = {
    columns: [
      { width: '*', text: '' },
      {
        width: 240,
        margin: [0, 10, 0, 0] as Margen,
        table: {
          widths: ['*', 110],
          body: [[
            { text: final >= 0 ? 'SALDO A PAGAR' : 'SALDO A FAVOR DEL CLIENTE', bold: true, fontSize: 10, fillColor: NARANJA_SUAVE, margin: [6, 5, 4, 5] },
            { text: `$ ${fmtN(Math.abs(final))}`, bold: true, fontSize: 11, alignment: 'right', fillColor: NARANJA_SUAVE, margin: [4, 5, 6, 5] },
          ]],
        },
        layout: { hLineWidth: (i: number) => (i === 0 ? 1 : 0), vLineWidth: () => 0, hLineColor: () => NARANJA },
      },
    ],
  }

  const dd = d.deudor
  const antiguedad: Content[] = dd ? [{
    margin: [0, 12, 0, 0] as Margen,
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [th('Hasta 30 días', 'right'), th('31 a 60 días', 'right'), th('61 a 90 días', 'right'), th('Más de 90 días', 'right')],
        [td(fmtN(dd.d0_30), 'right'), td(fmtN(dd.d31_60), 'right'), td(fmtN(dd.d61_90), 'right'), td(fmtN(dd.d90_mas), 'right')],
      ],
    },
    layout: cajaFina,
  }, {
    text: 'Antigüedad de la deuda según la fecha de emisión de cada comprobante. Si ya realizó el pago, desestime este aviso.',
    fontSize: 7, color: TENUE, margin: [0, 3, 0, 0] as Margen,
  }] : []

  return {
    pageSize: 'A4',
    pageMargins: [MARGEN_X, MARGEN_X, MARGEN_X, 40],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: CARBON },
    footer: pie(),
    content: [cabecera, cliente, tabla, cierre, ...antiguedad],
    info: { title: `Estado de cuenta ${d.razonSocial}` },
  }
}

/** Las filas del Excel (separado para testear): encabezado + movimientos + saldo final. */
export function filasExcelEstadoCuenta(d: DatosEstadoCuenta): (string | number | null)[][] {
  const movs = d.ec.movimientos
  return [
    [`Estado de cuenta — ${d.razonSocial} (${fmtCuit(d.docNro)}) — ${periodoTexto(d.ec.desde, d.ec.hasta)}`],
    [],
    ['Fecha', 'Movimiento', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo'],
    ...movs.map(m => [
      m.fecha ? fmtFecha(m.fecha) : '',
      MOVIMIENTO_LABEL[m.movimiento] ?? m.movimiento,
      m.comprobante ?? '',
      m.detalle ?? '',
      Number(m.debe) || null,
      Number(m.haber) || null,
      Number(m.saldo),
    ]),
    [],
    ['', '', '', 'Saldo final', '', '', saldoFinal(movs, d.ec.saldo_final)],
  ]
}

export function exportarEstadoCuentaExcel(d: DatosEstadoCuenta): void {
  const ws = XLSX.utils.aoa_to_sheet(filasExcelEstadoCuenta(d))
  ws['!cols'] = [{ wch: 11 }, { wch: 18 }, { wch: 22 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de cuenta')
  XLSX.writeFile(wb, nombreArchivoEstadoCuenta(d, 'xlsx'))
}

/** Deudores a Excel: una fila por cliente con la antigüedad. */
export function exportarDeudoresExcel(filas: VentasDeudor[], al: string): void {
  const aoa: (string | number | null)[][] = [
    [`Deudores al ${fmtFecha(al)}`],
    [],
    ['Cliente', 'CUIT', 'Saldo', 'A cuenta', 'NC disponible', 'Neto', 'Hasta 30 días', '31–60', '61–90', 'Más de 90', 'A revisar', 'Última cobranza'],
    ...filas.map(d => [
      d.cliente_razon_social, fmtCuit(d.cliente_doc_nro), Number(d.saldo), Number(d.a_cuenta), Number(d.nc_disponible),
      Number(d.saldo_neto), Number(d.d0_30), Number(d.d31_60), Number(d.d61_90), Number(d.d90_mas),
      Number(d.saldo_a_revisar), d.ultima_cobranza ? fmtFecha(d.ultima_cobranza) : '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 40 }, { wch: 15 }, ...Array.from({ length: 9 }, () => ({ wch: 14 })), { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Deudores')
  XLSX.writeFile(wb, `Deudores_${al.replace(/-/g, '')}.xlsx`)
}
