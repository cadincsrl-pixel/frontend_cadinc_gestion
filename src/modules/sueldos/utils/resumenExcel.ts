// Excel para el contador (F.931): una hoja por empleado × concepto con el
// código ARCA, los totales por empleado, el agregado por concepto y los
// pasivos por destino. Se arma con exceljs en el navegador a partir de
// GET /liquidaciones/:id/exportar/resumen.

import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/config/empresa'
import type { Destino, ResumenContador, TipoConcepto } from '@/types/sueldos.types'
import { DESTINO_LABEL, GRUPO_LABEL, TIPO_CONCEPTO_LABEL, fmtCuil, fmtFecha, fmtPeriodoLiq } from './sueldos.utils'

const FMT_M = '#,##0.00'
const FMT_C = '#,##0.####'

function encabezado(ws: ExcelJS.Worksheet, r: ResumenContador, titulo: string, columnas: number) {
  const l = r.liquidacion
  const filas = [
    `${EMPRESA.razonSocialFactura} — CUIT ${EMPRESA.cuit}`,
    titulo,
    `${l.codigo} · ${l.convenio.nombre} · ${fmtPeriodoLiq(l)}${l.fecha_pago ? ` · pago ${fmtFecha(l.fecha_pago)}` : ''} · ${l.estado}`,
  ]
  filas.forEach((t, i) => {
    const row = ws.addRow([t])
    row.font = { bold: i < 2, size: i === 1 ? 13 : 10 }
    ws.mergeCells(row.number, 1, row.number, columnas)
  })
  ws.addRow([])
}

function cabecera(ws: ExcelJS.Worksheet, titulos: string[]) {
  const row = ws.addRow(titulos)
  row.font = { bold: true, color: { argb: 'FF6B6B66' } }
  row.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F2' } }
    c.border = { bottom: { style: 'thin', color: { argb: 'FFD9D9D4' } } }
  })
  ws.views = [{ state: 'frozen', ySplit: row.number }]
}

function formatoCols(ws: ExcelJS.Worksheet, anchos: number[], montos: number[], cantidades: number[] = []) {
  anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (const c of montos) ws.getColumn(c).numFmt = FMT_M
  for (const c of cantidades) ws.getColumn(c).numFmt = FMT_C
}

function totalFila(ws: ExcelJS.Worksheet, valores: (string | number | null)[]) {
  const row = ws.addRow(valores)
  row.font = { bold: true }
  row.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FF1C1C1E' } } } })
}

export async function descargarResumenExcel(r: ResumenContador): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = new Date()

  // ── Empleados ──
  const we = wb.addWorksheet('Empleados')
  encabezado(we, r, 'Resumen de la liquidación por empleado', 13)
  cabecera(we, ['Legajo', 'Apellido y nombre', 'CUIL', 'Categoría', 'Días', 'Horas', 'Remunerativo', 'No remunerativo', 'Descuentos', 'Neto', 'Contribuciones', 'Fondo de cese', 'Costo total'])
  for (const e of r.empleados) {
    we.addRow([
      e.leg ?? '', e.nombre, fmtCuil(e.cuil), e.categoria ?? '', e.dias_trabajados, e.horas_trabajadas,
      e.total_remunerativo, e.total_no_remunerativo, e.total_descuentos, e.neto, e.total_contribuciones, e.fondo_cese,
      e.total_remunerativo + e.total_no_remunerativo + e.total_contribuciones + e.fondo_cese,
    ])
  }
  const t = r.totales
  totalFila(we, ['', `Totales (${t.empleados} empleados)`, '', '', null, null, t.remunerativo, t.no_remunerativo, t.descuentos, t.neto, t.contribuciones, t.fondo_cese,
    t.remunerativo + t.no_remunerativo + t.contribuciones + t.fondo_cese])
  formatoCols(we, [9, 32, 15, 22, 7, 8, 15, 15, 15, 15, 15, 14, 15], [7, 8, 9, 10, 11, 12, 13], [5, 6])

  // ── Detalle empleado × concepto ──
  const wd = wb.addWorksheet('Detalle por concepto')
  encabezado(wd, r, 'Detalle de cada recibo con el código de concepto ARCA', 10)
  cabecera(wd, ['Legajo', 'Apellido y nombre', 'CUIL', 'Código ARCA', 'Concepto', 'Tipo', 'Destino / grupo', 'Cantidad', 'Unidad', 'Importe'])
  for (const e of r.empleados) {
    for (const x of e.lineas) {
      wd.addRow([
        e.leg ?? '', e.nombre, fmtCuil(e.cuil), x.codigo_arca ?? '', x.nombre, TIPO_CONCEPTO_LABEL[x.tipo as TipoConcepto] ?? x.tipo,
        x.grupo_contribucion ? (GRUPO_LABEL[x.grupo_contribucion as keyof typeof GRUPO_LABEL] ?? x.grupo_contribucion) : x.destino ? (DESTINO_LABEL[x.destino as Destino] ?? x.destino) : '',
        x.cantidad, x.unidad ?? '', x.importe,
      ])
    }
  }
  formatoCols(wd, [9, 30, 15, 11, 34, 17, 20, 10, 8, 15], [10], [8])

  // ── Por concepto ──
  const wc = wb.addWorksheet('Por concepto')
  encabezado(wc, r, 'Totales por concepto (para el F.931)', 7)
  cabecera(wc, ['Código ARCA', 'Concepto', 'Tipo', 'Destino / grupo', 'Empleados', 'Cantidad', 'Importe'])
  const orden: TipoConcepto[] = ['remunerativo', 'no_remunerativo', 'descuento', 'contribucion']
  const conceptos = [...r.conceptos].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo) || (a.codigo_arca ?? '').localeCompare(b.codigo_arca ?? ''))
  for (const c of conceptos) {
    wc.addRow([
      c.codigo_arca ?? '', c.nombre, TIPO_CONCEPTO_LABEL[c.tipo] ?? c.tipo,
      c.grupo_contribucion ? (GRUPO_LABEL[c.grupo_contribucion as keyof typeof GRUPO_LABEL] ?? c.grupo_contribucion) : c.destino ? (DESTINO_LABEL[c.destino as Destino] ?? c.destino) : '',
      c.empleados, c.cantidad || null, c.importe,
    ])
  }
  formatoCols(wc, [12, 36, 18, 22, 11, 11, 16], [7], [6])

  // ── Pasivos ──
  const wp = wb.addWorksheet('A pagar')
  encabezado(wp, r, 'Lo que queda a pagar por destino', 2)
  cabecera(wp, ['Destino', 'Importe'])
  wp.addRow(['Sueldos netos (banco)', t.neto])
  for (const [k, v] of Object.entries(r.por_destino)) {
    wp.addRow([DESTINO_LABEL[k as Destino] ?? k, v ?? 0])
  }
  formatoCols(wp, [36, 18], [2])

  if (r.avisos.length > 0) {
    const wa = wb.addWorksheet('Avisos')
    cabecera(wa, ['Aviso', 'Empleado', 'Detalle'])
    for (const a of r.avisos) wa.addRow([a.codigo, a.nombre ?? '', a.detalle ? JSON.stringify(a.detalle) : ''])
    formatoCols(wa, [26, 30, 60], [])
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Sueldos_${r.liquidacion.codigo}_resumen_contador.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
