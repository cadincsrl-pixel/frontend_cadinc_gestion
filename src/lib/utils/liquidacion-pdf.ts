// Generador de PDF para liquidaciones de chofer.
// Se usa en 2 lugares:
//  1) Modal "💰 Liquidar" como preview antes de cerrar (PDF parcial).
//  2) Card de liquidación cerrada (descarga del PDF oficial).
// Lib: jsPDF + jspdf-autotable. Cliente puro, ~150 KB combinados.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PdfLiquidacionTramo {
  fecha:       string | null   // ISO yyyy-mm-dd
  tipo:        'cargado' | 'vacio'
  cantera:     string | null
  deposito:    string | null
  km:          number
  toneladas:   number | null
  remito:      string | null
}

export interface PdfLiquidacionAdelanto {
  fecha:       string
  descripcion: string
  monto:       number
}

export interface PdfLiquidacionGasto {
  fecha:       string
  categoria:   string
  proveedor:   string | null
  descripcion: string | null
  monto:       number
}

export interface PdfLiquidacionArgs {
  // Identificación
  chofer_nombre:   string
  chofer_cuil:     string | null
  camion_patente:  string | null
  // Período
  fecha_desde:     string  // ISO yyyy-mm-dd
  fecha_hasta:     string
  // Datos de cálculo
  dias_trabajados:    number
  basico_dia:         number
  basico_mensual:     number
  km_cargados:        number
  km_vacios:          number
  precio_km_cargado:  number
  precio_km_vacio:    number
  subtotal_basico:    number
  subtotal_km:        number
  total_adelantos:    number
  total_reintegros:   number
  total_neto:         number
  // Detalle
  tramos:    PdfLiquidacionTramo[]
  adelantos: PdfLiquidacionAdelanto[]
  // Gastos del chofer (reintegros): los que la empresa le devuelve.
  gastos:    PdfLiquidacionGasto[]
  // Metadata
  estado:           'borrador' | 'cerrada'
  numero_liquidacion: number | null   // null si es preview
  observaciones:    string | null
}

const fmtFecha = (s: string | null | undefined): string => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

const fmtM = (n: number): string =>
  '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtN = (n: number, dec = 0): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export function generarPdfLiquidacion(args: PdfLiquidacionArgs): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 40

  // ── Header ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor('#1B4F8C')
  const titulo = args.estado === 'cerrada'
    ? `LIQUIDACIÓN N° ${args.numero_liquidacion ?? '—'}`
    : 'LIQUIDACIÓN — VISTA PREVIA'
  doc.text(titulo, 40, y)
  y += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#666')
  doc.text(`Emitido: ${new Date().toLocaleString('es-AR')}`, pageWidth - 40, y - 14, { align: 'right' })
  y += 16

  // ── Datos del chofer ─────────────────────────────────────────────
  doc.setTextColor('#000')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(args.chofer_nombre, 40, y)
  if (args.chofer_cuil) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor('#666')
    doc.text(`CUIL: ${args.chofer_cuil}`, 40 + doc.getTextWidth(args.chofer_nombre) + 12, y)
  }
  y += 14
  if (args.camion_patente) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor('#000')
    doc.text(`Camión asignado: ${args.camion_patente}`, 40, y)
    y += 14
  }
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Período: ${fmtFecha(args.fecha_desde)} → ${fmtFecha(args.fecha_hasta)}`, 40, y)
  y += 8

  // ── Tabla de tramos ─────────────────────────────────────────────
  if (args.tramos.length > 0) {
    autoTable(doc, {
      startY: y + 12,
      head: [['Fecha', 'Tipo', 'Origen → Destino', 'Km', 'Ton', 'Remito']],
      body: args.tramos.map(t => [
        fmtFecha(t.fecha),
        t.tipo === 'cargado' ? 'Cargado' : 'Vacío',
        `${t.cantera ?? '—'} → ${t.deposito ?? '—'}`,
        fmtN(t.km),
        t.toneladas != null ? fmtN(t.toneladas, 2) : '—',
        t.remito ?? '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: '#1B4F8C', textColor: '#fff', fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      margin: { left: 40, right: 40 },
      didDrawPage: (data) => { y = data.cursor?.y ?? y },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Adelantos ───────────────────────────────────────────────────
  if (args.adelantos.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#000')
    doc.text('Adelantos descontados', 40, y + 14)
    autoTable(doc, {
      startY: y + 20,
      head: [['Fecha', 'Descripción', 'Monto']],
      body: args.adelantos.map(a => [
        fmtFecha(a.fecha),
        a.descripcion || '—',
        fmtM(a.monto),
      ]),
      theme: 'plain',
      headStyles: { fillColor: '#FFF3D6', textColor: '#7A5500', fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Gastos del chofer (reintegros) ──────────────────────────────
  if (args.gastos.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#000')
    doc.text('Gastos del chofer (reintegros)', 40, y + 14)
    autoTable(doc, {
      startY: y + 20,
      head: [['Fecha', 'Categoría', 'Proveedor', 'Descripción', 'Monto']],
      body: args.gastos.map(g => [
        fmtFecha(g.fecha),
        g.categoria,
        g.proveedor ?? '—',
        g.descripcion ?? '—',
        fmtM(g.monto),
      ]),
      theme: 'plain',
      headStyles: { fillColor: '#E5F4E5', textColor: '#2E7D32', fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Si la siguiente sección no entra en la página, salto.
  if (y > 700) { doc.addPage(); y = 40 }

  // ── Totales ─────────────────────────────────────────────────────
  y += 12
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#000')
  doc.text('Totales', 40, y)
  y += 4
  doc.setLineWidth(0.5)
  doc.setDrawColor('#1B4F8C')
  doc.line(40, y, pageWidth - 40, y)
  y += 12

  doc.setFontSize(10)
  const writeRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, 40, y)
    doc.text(value, pageWidth - 40, y, { align: 'right' })
    y += 14
  }

  writeRow(
    `Días trabajados (${args.dias_trabajados}) × ${fmtM(args.basico_dia)}/día`,
    fmtM(args.subtotal_basico),
  )
  if (args.km_cargados > 0) {
    writeRow(
      `Km cargados (${fmtN(args.km_cargados)}) × ${fmtM(args.precio_km_cargado)}/km`,
      fmtM(args.km_cargados * args.precio_km_cargado),
    )
  }
  if (args.km_vacios > 0) {
    writeRow(
      `Km vacíos (${fmtN(args.km_vacios)}) × ${fmtM(args.precio_km_vacio)}/km`,
      fmtM(args.km_vacios * args.precio_km_vacio),
    )
  }
  if (args.total_adelantos > 0) writeRow('— Adelantos descontados', `− ${fmtM(args.total_adelantos)}`)
  if (args.total_reintegros > 0) writeRow('+ Reintegros (gastos chofer)', `+ ${fmtM(args.total_reintegros)}`)

  y += 4
  doc.setLineWidth(1)
  doc.line(40, y, pageWidth - 40, y)
  y += 16
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#1B4F8C')
  doc.text('NETO A PAGAR', 40, y)
  doc.text(fmtM(args.total_neto), pageWidth - 40, y, { align: 'right' })
  y += 8
  doc.setLineWidth(1)
  doc.line(40, y, pageWidth - 40, y)
  y += 24

  // ── Observaciones ──────────────────────────────────────────────
  if (args.observaciones) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#666')
    doc.text('Observaciones', 40, y)
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#000')
    const lines = doc.splitTextToSize(args.observaciones, pageWidth - 80)
    doc.text(lines, 40, y)
    y += lines.length * 12 + 12
  }

  // ── Firma ──────────────────────────────────────────────────────
  if (y > 720) { doc.addPage(); y = 40 }
  y = Math.max(y, 740)
  doc.setLineWidth(0.5)
  doc.setDrawColor('#000')
  doc.line(60, y, 250, y)
  doc.line(pageWidth - 250, y, pageWidth - 60, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#666')
  doc.text('Firma chofer', 155, y + 14, { align: 'center' })
  doc.text('Firma empresa', pageWidth - 155, y + 14, { align: 'center' })

  // ── Footer del documento ──────────────────────────────────────
  if (args.estado === 'borrador') {
    doc.setFontSize(8)
    doc.setTextColor('#B5651D')
    doc.text('VISTA PREVIA — Esta liquidación todavía no fue cerrada en el sistema.', pageWidth / 2, 820, { align: 'center' })
  }

  // Descarga
  const fname = `liquidacion-${args.chofer_nombre.replace(/[^a-z0-9]+/gi, '_')}-${args.fecha_desde}_${args.fecha_hasta}.pdf`
  doc.save(fname)
}
