/**
 * Exporta la liquidación de un chofer a un Excel estilizado usando ExcelJS.
 *
 * El layout queda en 7 columnas:
 *   A=Fecha · B=Tipo · C=Cantera · D=Depósito · E=Km · F=Toneladas · G=Remito
 * Las secciones que no usan todas las columnas mergean según convenga
 * (RESUMEN usa A+B, ADELANTOS pone monto en G, etc).
 */
import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/config/empresa'
import type { Tramo, Adelanto, Ruta } from '@/types/domain.types'

// ── Paleta (ARGB) alineada al theme Tailwind del front ─────────────
const C_AZUL          = 'FF1F3A66'
const C_AZUL_HEADER   = 'FF445C82'
const C_AZUL_LIGHT    = 'FFE8F0F8'
const C_NARANJA       = 'FFE8621A'
const C_VERDE         = 'FF2E7D32'
const C_VERDE_LIGHT   = 'FFE7F4E7'
const C_GRIS_BORDE    = 'FFCCCCCC'
const C_GRIS_SUBTOT   = 'FFF0F0F0'
const C_BLANCO        = 'FFFFFFFF'

const FMT_MONTO = '"$"#,##0;[Red]"-$"#,##0'
const FMT_FECHA = 'dd/mm/yyyy'
const FMT_KM    = '#,##0" km"'
const FMT_TON   = '#,##0.00" t"'
const FMT_DIAS  = '#,##0" días"'

function parseFecha(s: string | null | undefined): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12)  // mediodía para evitar issues de TZ
}

function fmtFechaUI(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function kmTramo(t: Tramo, rutas: Ruta[]): number {
  if (!t.cantera_id || !t.deposito_id) return 0
  // Lookup direccional: el par cantera/depósito viene de tablas distintas con
  // ids solapados, así que el match invertido agarraba la ruta equivocada.
  const r = rutas.find(r =>
    r.cantera_id === t.cantera_id && r.deposito_id === t.deposito_id,
  )
  return r?.km_ida_vuelta ?? 0
}

export interface LiqExportGasto {
  fecha:       string
  categoria:   string
  proveedor:   string | null
  descripcion: string | null
  monto:       number
}

// Pata de un tramo relevado (km parcial del chofer). Ya viene pre-resuelta
// (nombres + km de la pata) porque el km no es el de la ruta completa.
export interface LiqExportRelevo {
  fecha:    string | null
  tipo:     'cargado' | 'vacio'
  cantera:  string | null
  deposito: string | null
  km:       number
}

export interface LiqExportData {
  nombreChofer: string
  desde:        string
  hasta:        string
  dias:         number
  basico_dia:   number
  subtotal_bas: number
  km_totales:   number
  subtotal_km:  number
  // Desglose de km/subtotales por tipo (opcional para compat con callers viejos).
  km_cargados?:         number
  km_vacios?:           number
  precio_km_cargado?:   number
  precio_km_vacio?:     number
  subtotal_km_cargado?: number
  subtotal_km_vacio?:   number
  descuentos:   number
  // Reintegros = gastos del chofer que la empresa le devuelve.
  reintegros?:  number
  neto:         number
  tramos:       Tramo[]
  // Patas de relevo a listar en la tabla de tramos (km de la pata, ya resuelto).
  relevos?:     LiqExportRelevo[]
  adelantos:    Adelanto[]
  // Gastos pagados por el chofer en el período (reintegros).
  gastos?:      LiqExportGasto[]
  canteras:     { id: number; nombre: string }[]
  depositos:    { id: number; nombre: string }[]
  rutas:        Ruta[]
  estado?:      string
}

// ── Helpers de styling reutilizables ───────────────────────────────
const TOTAL_COLS = 7

function setSectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, bg: string) {
  ws.mergeCells(`A${row}:G${row}`)
  const c = ws.getCell(`A${row}`)
  c.value = text
  c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C_BLANCO } }
  c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  ws.getRow(row).height = 22
}

function setTableHeader(ws: ExcelJS.Worksheet, row: number, headers: (string | null)[]) {
  const r = ws.getRow(row)
  for (let i = 0; i < headers.length; i++) {
    const c = r.getCell(i + 1)
    c.value = headers[i] ?? ''
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_BLANCO } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_HEADER } }
    c.border = {
      top:    { style: 'thin', color: { argb: 'FFAAAAAA' } },
      bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      left:   { style: 'thin', color: { argb: 'FFAAAAAA' } },
      right:  { style: 'thin', color: { argb: 'FFAAAAAA' } },
    }
  }
  ws.getRow(row).height = 20
}

function setDataRowBorders(r: ExcelJS.Row, zebra: boolean) {
  for (let i = 1; i <= TOTAL_COLS; i++) {
    const c = r.getCell(i)
    c.border = {
      bottom: { style: 'hair', color: { argb: C_GRIS_BORDE } },
      left:   { style: 'hair', color: { argb: C_GRIS_BORDE } },
      right:  { style: 'hair', color: { argb: C_GRIS_BORDE } },
    }
    if (zebra) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }
    }
  }
}

function setSubtotalRow(r: ExcelJS.Row) {
  for (let i = 1; i <= TOTAL_COLS; i++) {
    const c = r.getCell(i)
    c.font = { name: 'Calibri', size: 10, bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRIS_SUBTOT } }
    c.border = {
      top:    { style: 'medium', color: { argb: 'FF888888' } },
      bottom: { style: 'thin',   color: { argb: 'FF888888' } },
    }
  }
}

// ── Export ─────────────────────────────────────────────────────────
export async function exportLiquidacionExcel(d: LiqExportData) {
  const wb = new ExcelJS.Workbook()
  wb.creator     = EMPRESA.nombre
  wb.lastModifiedBy = EMPRESA.nombre
  wb.created     = new Date()
  wb.modified    = new Date()

  const ws = wb.addWorksheet('Liquidación', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, margins: {
      left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2,
    } },
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false }],
  })

  ws.columns = [
    { width: 12 },  // A · Fecha
    { width: 12 },  // B · Tipo
    { width: 24 },  // C · Cantera
    { width: 24 },  // D · Depósito
    { width: 12 },  // E · Km
    { width: 12 },  // F · Toneladas
    { width: 16 },  // G · Remito
  ]

  let row = 1

  // ── Título ──
  ws.mergeCells(`A${row}:G${row}`)
  const title = ws.getCell(`A${row}`)
  title.value = `LIQUIDACIÓN — ${d.nombreChofer}`
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: C_BLANCO } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  ws.getRow(row).height = 36
  row++

  // ── Subtítulo (período + estado) ──
  ws.mergeCells(`A${row}:G${row}`)
  const sub = ws.getCell(`A${row}`)
  sub.value = `Período: ${fmtFechaUI(d.desde)} al ${fmtFechaUI(d.hasta)}    ·    Estado: ${d.estado ?? 'En curso'}`
  sub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: C_AZUL } }
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL_LIGHT } }
  ws.getRow(row).height = 20
  row += 2  // dejar fila vacía

  // ── TRAMOS ──
  setSectionHeader(ws, row, '🚛 TRAMOS', C_NARANJA); row++
  setTableHeader(ws, row, ['Fecha', 'Tipo', 'Cantera', 'Depósito', 'Km', 'Toneladas', 'Remito']); row++

  let totalKm = 0
  d.tramos.forEach((t, idx) => {
    const cantera  = d.canteras.find(c => c.id === t.cantera_id)
    const deposito = d.depositos.find(x => x.id === t.deposito_id)
    const km = kmTramo(t, d.rutas)
    const r = ws.getRow(row)
    r.getCell(1).value = parseFecha(t.fecha_carga ?? t.fecha_vacio ?? null)
    r.getCell(1).numFmt = FMT_FECHA
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(2).value = t.tipo === 'vacio' ? 'Vacío' : 'Cargado'
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(2).font = { color: { argb: t.tipo === 'vacio' ? C_AZUL_HEADER : C_NARANJA }, bold: true }
    r.getCell(3).value = cantera?.nombre  ?? '—'
    r.getCell(4).value = deposito?.nombre ?? '—'
    if (km) {
      r.getCell(5).value  = km
      r.getCell(5).numFmt = FMT_KM
      totalKm += km
    }
    r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }
    if (t.toneladas_carga) {
      r.getCell(6).value  = Number(t.toneladas_carga)
      r.getCell(6).numFmt = FMT_TON
    }
    r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
    r.getCell(7).value = t.remito_carga ?? '—'
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' }
    setDataRowBorders(r, idx % 2 === 1)
    row++
  })

  // Patas de relevo (km parcial del chofer en tramos compartidos).
  ;(d.relevos ?? []).forEach((rl, i) => {
    const idx = d.tramos.length + i
    const r = ws.getRow(row)
    r.getCell(1).value = parseFecha(rl.fecha)
    r.getCell(1).numFmt = FMT_FECHA
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(2).value = (rl.tipo === 'vacio' ? 'Vacío' : 'Cargado') + ' · relevo'
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(2).font = { color: { argb: rl.tipo === 'vacio' ? C_AZUL_HEADER : C_NARANJA }, bold: true, italic: true }
    r.getCell(3).value = rl.cantera  ?? '—'
    r.getCell(4).value = rl.deposito ?? '—'
    if (rl.km) {
      r.getCell(5).value  = rl.km
      r.getCell(5).numFmt = FMT_KM
      totalKm += rl.km
    }
    r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }
    r.getCell(7).value = 'Relevo'
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' }
    setDataRowBorders(r, idx % 2 === 1)
    row++
  })

  // Subtotal km
  if (d.tramos.length > 0 || (d.relevos?.length ?? 0) > 0) {
    const r = ws.getRow(row)
    ws.mergeCells(`A${row}:D${row}`)
    r.getCell(1).value = 'Total km recorridos'
    r.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
    r.getCell(5).value  = totalKm
    r.getCell(5).numFmt = FMT_KM
    r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }
    setSubtotalRow(r)
    row++
  }
  row++

  // ── RESUMEN DE HABERES ──
  setSectionHeader(ws, row, '📊 RESUMEN', C_AZUL); row++

  const haberes: Array<[string, number, string]> = [
    ['Días trabajados',                       d.dias,         FMT_DIAS],
    ['Básico por día',                        d.basico_dia,   FMT_MONTO],
    ['Subtotal básico',                       d.subtotal_bas, FMT_MONTO],
  ]
  // Desglose por tipo: si tenemos los campos detallados los mostramos como
  // "X km × $Y/km = $Z" por separado para cargado y vacío. Si no, caemos al
  // total agregado (compat con callers antiguos).
  if ((d.km_cargados ?? 0) > 0 && (d.precio_km_cargado ?? 0) > 0) {
    const sub = d.subtotal_km_cargado ?? (d.km_cargados! * d.precio_km_cargado!)
    haberes.push([
      `🚛 Km cargados (${(d.km_cargados ?? 0).toLocaleString('es-AR')} km × $${(d.precio_km_cargado ?? 0).toLocaleString('es-AR')}/km)`,
      sub,
      FMT_MONTO,
    ])
  }
  if ((d.km_vacios ?? 0) > 0 && (d.precio_km_vacio ?? 0) > 0) {
    const sub = d.subtotal_km_vacio ?? (d.km_vacios! * d.precio_km_vacio!)
    haberes.push([
      `🔲 Km vacíos (${(d.km_vacios ?? 0).toLocaleString('es-AR')} km × $${(d.precio_km_vacio ?? 0).toLocaleString('es-AR')}/km)`,
      sub,
      FMT_MONTO,
    ])
  }
  // Si NO hay desglose pero sí hay km totales, mantenemos el comportamiento viejo.
  const tieneDesglose = ((d.km_cargados ?? 0) > 0) || ((d.km_vacios ?? 0) > 0)
  if (!tieneDesglose && d.km_totales > 0) {
    haberes.push(['Km recorridos',            d.km_totales,   '#,##0" km"'])
    haberes.push(['Subtotal km',              d.subtotal_km,  FMT_MONTO])
  } else if (tieneDesglose) {
    haberes.push(['Subtotal km (cargado + vacío)', d.subtotal_km, FMT_MONTO])
  }
  haberes.push(['Total haberes',              d.subtotal_bas + d.subtotal_km, FMT_MONTO])

  haberes.forEach(([label, value, fmt], idx) => {
    const r = ws.getRow(row)
    ws.mergeCells(`A${row}:E${row}`)
    r.getCell(1).value = label
    r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    r.getCell(1).font = { name: 'Calibri', size: 10, bold: idx === haberes.length - 1 }
    r.getCell(6).value  = value
    r.getCell(6).numFmt = fmt
    r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
    r.getCell(6).font = { name: 'Calibri', size: 10, bold: idx === haberes.length - 1 }
    // merge G en el campo de valor
    ws.mergeCells(`F${row}:G${row}`)
    setDataRowBorders(r, idx % 2 === 1)
    if (idx === haberes.length - 1) setSubtotalRow(r)
    row++
  })
  row++

  // ── ADELANTOS ──
  if (d.adelantos.length > 0) {
    setSectionHeader(ws, row, '💸 ADELANTOS A DESCONTAR', C_AZUL); row++
    setTableHeader(ws, row, ['Fecha', 'Descripción', null, null, null, null, 'Monto']); row++
    d.adelantos.forEach((a, idx) => {
      const r = ws.getRow(row)
      r.getCell(1).value  = parseFecha(a.fecha)
      r.getCell(1).numFmt = FMT_FECHA
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      r.getCell(2).value = a.descripcion || 'Adelanto'
      ws.mergeCells(`B${row}:F${row}`)
      r.getCell(7).value  = Number(a.monto)
      r.getCell(7).numFmt = FMT_MONTO
      r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
      setDataRowBorders(r, idx % 2 === 1)
      row++
    })
    // Total
    const r = ws.getRow(row)
    ws.mergeCells(`A${row}:F${row}`)
    r.getCell(1).value = 'Total adelantos'
    r.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
    r.getCell(7).value  = d.descuentos
    r.getCell(7).numFmt = FMT_MONTO
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
    setSubtotalRow(r)
    row += 2
  }

  // ── GASTOS DEL CHOFER (reintegros) ──
  if (d.gastos && d.gastos.length > 0) {
    setSectionHeader(ws, row, '🔁 GASTOS DEL CHOFER (reintegros)', C_VERDE); row++
    setTableHeader(ws, row, ['Fecha', 'Categoría', 'Proveedor', 'Descripción', null, null, 'Monto']); row++
    d.gastos.forEach((g, idx) => {
      const r = ws.getRow(row)
      r.getCell(1).value  = parseFecha(g.fecha)
      r.getCell(1).numFmt = FMT_FECHA
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      r.getCell(2).value = g.categoria
      r.getCell(3).value = g.proveedor   ?? '—'
      r.getCell(4).value = g.descripcion ?? '—'
      ws.mergeCells(`D${row}:F${row}`)
      r.getCell(7).value  = Number(g.monto)
      r.getCell(7).numFmt = FMT_MONTO
      r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
      setDataRowBorders(r, idx % 2 === 1)
      row++
    })
    const r = ws.getRow(row)
    ws.mergeCells(`A${row}:F${row}`)
    r.getCell(1).value = 'Total reintegros'
    r.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
    r.getCell(7).value  = d.reintegros ?? 0
    r.getCell(7).numFmt = FMT_MONTO
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
    setSubtotalRow(r)
    row += 2
  }

  // ── TOTAL NETO ──
  ws.mergeCells(`A${row}:E${row}`)
  const netoLabel = ws.getCell(`A${row}`)
  netoLabel.value = 'TOTAL NETO A COBRAR'
  netoLabel.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  netoLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
  netoLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_VERDE } }

  ws.mergeCells(`F${row}:G${row}`)
  const netoValue = ws.getCell(`F${row}`)
  netoValue.value  = d.neto
  netoValue.numFmt = FMT_MONTO
  netoValue.font = { name: 'Calibri', size: 14, bold: true, color: { argb: C_BLANCO } }
  netoValue.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
  netoValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_VERDE } }

  // Pintar bordes en la fila completa del total
  for (let i = 1; i <= TOTAL_COLS; i++) {
    ws.getCell(row, i).border = {
      top:    { style: 'medium', color: { argb: C_VERDE } },
      bottom: { style: 'medium', color: { argb: C_VERDE } },
    }
  }
  ws.getRow(row).height = 32

  // ── Footer ──
  row += 2
  ws.mergeCells(`A${row}:G${row}`)
  const footer = ws.getCell(`A${row}`)
  footer.value = `Generado el ${new Date().toLocaleString('es-AR')} · ${EMPRESA.nombre}`
  footer.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } }
  footer.alignment = { horizontal: 'right' }

  // ── Generar + descargar ──
  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `liquidacion_${d.nombreChofer.replace(/\s+/g, '_')}_${d.desde}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
