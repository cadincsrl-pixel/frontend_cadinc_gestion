// Libro IVA Digital de Compras (RG 4597) y posición de IVA del mes: tipos del
// contrato con el backend (`GET /api/facturacion/lid-compras` y
// `/posicion-iva`, módulo `lid-compras.ts` del backend, donde están las fuentes
// del diseño de registro), descarga de los .txt y el Excel de control.

import ExcelJS from 'exceljs'
import { aAnsi, bajar, type ValidacionLid } from './lidVentas'

export interface DetalleLidCompras {
  comprobante: string
  ref_id: number
  fecha: string; cbte_tipo: number | null; tipo: string; pto_vta: number | null; numero: number | null
  cuit: string; nombre: string
  alicuota: string; neto: number; iva: number; credito_fiscal: number; no_gravado: number; exento: number
  perc_iva: number; perc_iibb: number; perc_otras: number; otros_tributos: number; total: number
  estado: string
  incluido: boolean; motivo_exclusion: string | null
}

export interface LibroIvaCompras {
  periodo: string
  resumen: {
    comprobantes: number; neto: number; iva: number; credito_fiscal: number; total: number
    no_gravado: number; exento: number
    perc_iva: number; perc_iibb: number; perc_nacionales: number; perc_municipales: number
    impuestos_internos: number; otros_tributos: number
    por_alicuota: Array<{ codigo: number; alicuota: string; neto: number; iva: number; registros: number }>
    por_tipo: Array<{ cbte_tipo: number; tipo: string; cantidad: number; neto: number; iva: number; total: number }>
    excluidos: number
    lineas_cbte: number; lineas_alicuotas: number
  }
  validaciones: ValidacionLid[]
  detalle: DetalleLidCompras[]
  archivos: { cbte: string; alicuotas: string }
}

export interface PosicionIva {
  periodo: string
  debito_fiscal: number
  credito_fiscal: number
  impuesto_determinado: number
  saldo_tecnico_a_favor: number
  percepciones_iva: number
  retenciones_iva: number
  a_pagar: number
  libre_disponibilidad: number
  excluidos_ventas: number
  excluidos_compras: number
  avisos: string[]
}

export const TIPOS_NC_COMPRA = new Set([3, 8, 13, 53, 203, 208, 213])

/** Nombre que espera el contador (mismo que el backend). */
export function nombreArchivoLidCompras(periodo: string, archivo: 'cbte' | 'alicuotas'): string {
  return `LIBRO_IVA_DIGITAL_COMPRAS_${archivo === 'cbte' ? 'CBTE' : 'ALICUOTAS'}_${periodo.replace('-', '')}.txt`
}

export function descargarTxtLidCompras(libro: LibroIvaCompras, archivo: 'cbte' | 'alicuotas') {
  const txt = archivo === 'cbte' ? libro.archivos.cbte : libro.archivos.alicuotas
  bajar(new Blob([aAnsi(txt)], { type: 'text/plain;charset=windows-1252' }), nombreArchivoLidCompras(libro.periodo, archivo))
}

const conSigno = (d: Pick<DetalleLidCompras, 'cbte_tipo'>, v: number) => (d.cbte_tipo && TIPOS_NC_COMPRA.has(d.cbte_tipo) ? -Math.abs(v) : v)

/** Excel de control: detalle factura por factura, resumen y validaciones. */
export async function exportarExcelLidCompras(libro: LibroIvaCompras) {
  const wb = new ExcelJS.Workbook()
  const MONEDA = '#,##0.00;[Red]-#,##0.00'
  const encabezado = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const det = wb.addWorksheet('Detalle')
  det.columns = [
    { header: 'Fecha', key: 'fecha', width: 11 },
    { header: 'Tipo', key: 'cbte_tipo', width: 6 },
    { header: 'Comprobante', key: 'tipo', width: 26 },
    { header: 'PV', key: 'pto_vta', width: 6 },
    { header: 'Número', key: 'numero', width: 10 },
    { header: 'CUIT', key: 'cuit', width: 14 },
    { header: 'Proveedor', key: 'nombre', width: 32 },
    { header: 'Alícuota', key: 'alicuota', width: 12 },
    { header: 'Neto gravado', key: 'neto', width: 16, style: { numFmt: MONEDA } },
    { header: 'IVA', key: 'iva', width: 15, style: { numFmt: MONEDA } },
    { header: 'Crédito fiscal', key: 'credito_fiscal', width: 15, style: { numFmt: MONEDA } },
    { header: 'No gravado', key: 'no_gravado', width: 13, style: { numFmt: MONEDA } },
    { header: 'Exento', key: 'exento', width: 13, style: { numFmt: MONEDA } },
    { header: 'Perc. IVA', key: 'perc_iva', width: 13, style: { numFmt: MONEDA } },
    { header: 'Perc. IIBB', key: 'perc_iibb', width: 13, style: { numFmt: MONEDA } },
    { header: 'Otras perc./imp.', key: 'perc_otras', width: 14, style: { numFmt: MONEDA } },
    { header: 'Otros tributos', key: 'otros_tributos', width: 13, style: { numFmt: MONEDA } },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: MONEDA } },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'En el archivo', key: 'incluido', width: 12 },
    { header: 'Motivo', key: 'motivo_exclusion', width: 50 },
  ]
  for (const d of libro.detalle) {
    const [y, m, dd] = d.fecha.split('-')
    const row = det.addRow({
      ...d,
      fecha: `${dd}/${m}/${y}`,
      neto: conSigno(d, d.neto), iva: conSigno(d, d.iva), credito_fiscal: conSigno(d, d.credito_fiscal),
      no_gravado: conSigno(d, d.no_gravado), exento: conSigno(d, d.exento), perc_iva: conSigno(d, d.perc_iva),
      perc_iibb: conSigno(d, d.perc_iibb), perc_otras: conSigno(d, d.perc_otras), otros_tributos: conSigno(d, d.otros_tributos),
      total: conSigno(d, d.total),
      incluido: d.incluido ? 'Sí' : 'NO',
      motivo_exclusion: d.motivo_exclusion ?? '',
    })
    if (!d.incluido) row.font = { color: { argb: 'FF9B2C2C' } }
  }
  encabezado(det)
  det.autoFilter = { from: 'A1', to: 'U1' }

  const res = wb.addWorksheet('Resumen')
  res.columns = [
    { header: 'Concepto', key: 'c', width: 44 },
    { header: 'Cantidad', key: 'n', width: 10 },
    { header: 'Neto gravado', key: 'neto', width: 18, style: { numFmt: MONEDA } },
    { header: 'IVA', key: 'iva', width: 18, style: { numFmt: MONEDA } },
    { header: 'Total', key: 'total', width: 18, style: { numFmt: MONEDA } },
  ]
  const r = libro.resumen
  res.addRow({ c: `Libro IVA Compras ${libro.periodo} (NC restando)`, n: r.comprobantes, neto: r.neto, iva: r.iva, total: r.total }).font = { bold: true }
  res.addRow({ c: 'Crédito fiscal computable', iva: r.credito_fiscal })
  res.addRow({ c: 'Percepciones de IVA', iva: r.perc_iva })
  res.addRow({ c: 'Percepciones de IIBB', total: r.perc_iibb })
  if (r.perc_municipales) res.addRow({ c: 'Percepciones municipales', total: r.perc_municipales })
  if (r.perc_nacionales) res.addRow({ c: 'Percepciones de otros impuestos nacionales', total: r.perc_nacionales })
  res.addRow({})
  res.addRow({ c: 'Por alícuota' }).font = { bold: true }
  for (const a of r.por_alicuota) res.addRow({ c: a.alicuota, n: a.registros, neto: a.neto, iva: a.iva })
  res.addRow({})
  res.addRow({ c: 'Por tipo de comprobante' }).font = { bold: true }
  for (const t of r.por_tipo) res.addRow({ c: `${String(t.cbte_tipo).padStart(3, '0')} · ${t.tipo}`, n: t.cantidad, neto: t.neto, iva: t.iva, total: t.total })
  if (r.excluidos) { res.addRow({}); res.addRow({ c: 'Fuera de los archivos (ver Detalle)', n: r.excluidos }).font = { color: { argb: 'FF9B2C2C' } } }
  encabezado(res)

  const val = wb.addWorksheet('Validaciones')
  val.columns = [
    { header: 'Severidad', key: 'severidad', width: 12 },
    { header: 'Comprobante', key: 'comprobante', width: 34 },
    { header: 'Mensaje', key: 'mensaje', width: 120 },
  ]
  for (const v of libro.validaciones) val.addRow(v)
  encabezado(val)

  const buf = await wb.xlsx.writeBuffer()
  bajar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Libro_IVA_Compras_${libro.periodo.replace('-', '')}_control.xlsx`)
}
