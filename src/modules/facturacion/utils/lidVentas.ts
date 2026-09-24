// Libro IVA Digital de Ventas (RG 4597): tipos del contrato con el backend
// (`GET /api/facturacion/lid-ventas`, módulo `lid-ventas.ts` del backend, donde
// están las fuentes del diseño de registro), descarga de los .txt y el Excel
// de control para el contador.

import ExcelJS from 'exceljs'

export type SeveridadLid = 'error' | 'advertencia' | 'info'

export interface ValidacionLid { comprobante: string; severidad: SeveridadLid; mensaje: string }

export interface DetalleLid {
  comprobante: string
  origen: 'erp' | 'externo'
  fecha: string; cbte_tipo: number; tipo: string; pto_vta: number; numero: number
  doc_tipo: number; doc_nro: string; nombre: string
  alicuota: string; neto: number; iva: number; no_gravado: number; exento: number; otros_tributos: number; total: number
  moneda: string; tipo_cambio: number; codigo_operacion: string
  incluido: boolean; motivo_exclusion: string | null
}

export interface LibroIvaVentas {
  periodo: string
  resumen: {
    comprobantes: number; neto: number; iva: number; total: number
    no_gravado: number; exento: number; otros_tributos: number
    por_alicuota: Array<{ codigo: number; alicuota: string; neto: number; iva: number; registros: number }>
    por_tipo: Array<{ cbte_tipo: number; tipo: string; cantidad: number; neto: number; iva: number; total: number }>
    excluidos: number
    lineas_cbte: number; lineas_alicuotas: number
  }
  validaciones: ValidacionLid[]
  detalle: DetalleLid[]
  archivos: { cbte: string; alicuotas: string }
}

export const TIPOS_NC_LID = new Set([3, 8, 13, 203, 208, 213])

/** Nombre que espera el contador (mismo que el backend). */
export function nombreArchivoLid(periodo: string, archivo: 'cbte' | 'alicuotas'): string {
  return `LIBRO_IVA_DIGITAL_VENTAS_${archivo === 'cbte' ? 'CBTE' : 'ALICUOTAS'}_${periodo.replace('-', '')}.txt`
}

/**
 * Texto → bytes ANSI (Latin-1 / Windows-1252), que es lo que acepta el
 * importador del LID. El backend ya dejó cada carácter dentro de 0x00–0xFF;
 * `TextEncoder` no sirve porque solo escribe UTF-8.
 */
export function aAnsi(texto: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(texto.length))
  for (let i = 0; i < texto.length; i++) {
    const cp = texto.charCodeAt(i)
    out[i] = cp <= 0xff ? cp : 0x3f
  }
  return out
}

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function descargarTxtLid(libro: LibroIvaVentas, archivo: 'cbte' | 'alicuotas') {
  const txt = archivo === 'cbte' ? libro.archivos.cbte : libro.archivos.alicuotas
  bajar(new Blob([aAnsi(txt)], { type: 'text/plain;charset=windows-1252' }), nombreArchivoLid(libro.periodo, archivo))
}

/** Signo para leer: las NC restan (en el .txt van positivas, como pide ARCA). */
const conSigno = (d: Pick<DetalleLid, 'cbte_tipo'>, v: number) => (TIPOS_NC_LID.has(d.cbte_tipo) ? -Math.abs(v) : v)

/** Excel de control: detalle comprobante por comprobante, resumen y validaciones. */
export async function exportarExcelLid(libro: LibroIvaVentas) {
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
    { header: 'Comprobante', key: 'tipo', width: 30 },
    { header: 'PV', key: 'pto_vta', width: 6 },
    { header: 'Número', key: 'numero', width: 10 },
    { header: 'Cód. doc.', key: 'doc_tipo', width: 8 },
    { header: 'CUIT / Doc.', key: 'doc_nro', width: 14 },
    { header: 'Comprador', key: 'nombre', width: 34 },
    { header: 'Alícuota', key: 'alicuota', width: 10 },
    { header: 'Neto gravado', key: 'neto', width: 16, style: { numFmt: MONEDA } },
    { header: 'IVA', key: 'iva', width: 15, style: { numFmt: MONEDA } },
    { header: 'No gravado', key: 'no_gravado', width: 13, style: { numFmt: MONEDA } },
    { header: 'Exento', key: 'exento', width: 13, style: { numFmt: MONEDA } },
    { header: 'Otros tributos', key: 'otros_tributos', width: 13, style: { numFmt: MONEDA } },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: MONEDA } },
    { header: 'Moneda', key: 'moneda', width: 7 },
    { header: 'T. cambio', key: 'tipo_cambio', width: 9 },
    { header: 'Cód. op.', key: 'codigo_operacion', width: 8 },
    { header: 'Origen', key: 'origen', width: 9 },
    { header: 'En el archivo', key: 'incluido', width: 12 },
    { header: 'Motivo', key: 'motivo_exclusion', width: 50 },
  ]
  for (const d of libro.detalle) {
    const [y, m, dd] = d.fecha.split('-')
    const row = det.addRow({
      ...d,
      fecha: `${dd}/${m}/${y}`,
      neto: conSigno(d, d.neto), iva: conSigno(d, d.iva), no_gravado: conSigno(d, d.no_gravado),
      exento: conSigno(d, d.exento), otros_tributos: conSigno(d, d.otros_tributos), total: conSigno(d, d.total),
      origen: d.origen === 'erp' ? 'ERP' : 'ARCA',
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
  res.addRow({ c: `Libro IVA Ventas ${libro.periodo} (NC restando)`, n: r.comprobantes, neto: r.neto, iva: r.iva, total: r.total }).font = { bold: true }
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
    { header: 'Comprobante', key: 'comprobante', width: 22 },
    { header: 'Mensaje', key: 'mensaje', width: 120 },
  ]
  for (const v of libro.validaciones) val.addRow(v)
  encabezado(val)

  const buf = await wb.xlsx.writeBuffer()
  bajar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Libro_IVA_Ventas_${libro.periodo.replace('-', '')}_control.xlsx`)
}

/** Meses para el selector: los últimos `n`, del más nuevo al más viejo (AAAA-MM). */
export function mesesRecientes(hoy: Date, n = 18): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function nombreMes(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}
