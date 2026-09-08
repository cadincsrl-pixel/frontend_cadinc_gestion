// El armador de exports de la cuenta corriente de una obra: UN documento,
// PDF o Excel, con las secciones que se tildaron en el modal.
//
// Reemplaza a los tres exporters sueltos que había (PDF deuda, PDF histórico,
// PDF/Excel de administración): mismas reglas, un solo lugar.
//
// Las reglas que este archivo hace cumplir:
//   · El PDF es para el CLIENTE: montos finales, nunca se imprime el %
//     (decisión del user 08/09). El Excel es interno: costo, % y facturable.
//   · En una obra por administración, los materiales facturables llevan el %
//     vigente a la fecha de cada renglón. En una común, van tal cual.
//   · La deuda de la obra es UNA: el saldo. "Solo deuda" filtra el detalle de
//     materiales (lo no cobrado), pero el resumen siempre es la cuenta entera.

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/config/empresa'
import { getSemLabel, toISO } from '@/lib/utils/dates'
import { pctVigente } from '../hooks/useAdministracion'
import type { Obra, CuentaRenglon, CuentaClienteCobro } from '@/types/domain.types'
import type { CuentaAdministracion } from '../components/cuenta-corriente/useAdministracionCuenta'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

export const AZUL = '#1A365D'
export const NARANJA = '#E8621A'
export const fmtM = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtFecha = (s: string | null | undefined) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export interface SeleccionExport {
  resumen:        boolean
  /** Solo tienen efecto en obras por administración. */
  jornales:       boolean
  contratistas:   boolean
  materiales:     boolean
  /** 'deuda' = solo lo no cobrado; 'todo' = también lo ya cobrado, con estado. */
  modoMateriales: 'deuda' | 'todo'
  pagos:          boolean
}

export interface DatosExport {
  obra:      Obra
  /** Renglones a_cobrar + cobrado de la obra (pago_directo y gasto CADINC no son cuenta). */
  renglones: CuentaRenglon[]
  cobros:    CuentaClienteCobro[]
  /** Presente si la obra es por administración. */
  admin?:    CuentaAdministracion
}

/** El % de materiales vigente a la fecha del renglón (0 si la obra no es admin). */
function pctMaterial(datos: DatosExport, fecha: string | null): number {
  if (!datos.admin) return 0
  return Number(pctVigente(datos.admin.tarifasAdmin, fecha ?? toISO(new Date()))?.pct_materiales ?? 0)
}

function materialesSeleccionados(sel: SeleccionExport, datos: DatosExport): CuentaRenglon[] {
  const filas = sel.modoMateriales === 'deuda'
    ? datos.renglones.filter(r => r.estado === 'a_cobrar')
    : datos.renglones
  return [...filas].sort((a, b) => (a.fecha_resolucion ?? '').localeCompare(b.fecha_resolucion ?? ''))
}

/** Los totales del resumen: la cuenta ENTERA, sin importar qué detalle se tildó. */
function totales(datos: DatosExport) {
  const pagado = datos.cobros.reduce((s, c) => s + Number(c.monto ?? 0), 0)
  if (datos.admin) {
    const t = datos.admin.tot
    return { admin: true, mo: t.mo, cont: t.cont, mat: t.mat, total: t.total, pagado, saldo: t.total - pagado }
  }
  const mat = datos.renglones.reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
  return { admin: false, mo: 0, cont: 0, mat, total: mat, pagado, saldo: mat - pagado }
}

const nombreArchivo = (obra: Obra, ext: string) =>
  `Cuenta_${obra.cod.replace(/[^\w-]+/g, '_')}_${toISO(new Date())}.${ext}`

// ═════════════════════════════ PDF ═════════════════════════════

export const celda = (texto: string, extra: Partial<TableCell> = {}): TableCell =>
  ({ text: texto, fontSize: 8, ...extra } as TableCell)
export const cabecera = (textos: string[]): TableCell[] =>
  textos.map(t => celda(t, { bold: true, color: '#fff', fillColor: AZUL }))
export const derecha = (texto: string, extra: Partial<TableCell> = {}): TableCell =>
  celda(texto, { alignment: 'right', ...extra })

export function descargarPdfCuenta(sel: SeleccionExport, datos: DatosExport): void {
  const { obra } = datos
  const tot = totales(datos)
  const contenido: Content[] = [
    { text: EMPRESA.nombre, color: NARANJA, bold: true, fontSize: 16 },
    { text: 'CUENTA CORRIENTE DE OBRA', color: AZUL, bold: true, fontSize: 11, margin: [0, 2, 0, 0] },
    { text: `${obra.nom} (${obra.cod}) · al ${new Date().toLocaleDateString('es-AR')}`, fontSize: 9, color: '#555', margin: [0, 2, 0, 12] },
  ]

  if (sel.resumen) {
    const filas: TableCell[][] = []
    if (tot.admin) {
      filas.push(
        [celda('Mano de obra', { fontSize: 9 }), derecha(fmtM(tot.mo), { fontSize: 9 })],
        [celda('Contratistas', { fontSize: 9 }), derecha(fmtM(tot.cont), { fontSize: 9 })],
        [celda('Materiales', { fontSize: 9 }), derecha(fmtM(tot.mat), { fontSize: 9 })],
        [celda('Total', { fontSize: 9, bold: true }), derecha(fmtM(tot.total), { fontSize: 9, bold: true })],
      )
    } else {
      filas.push([celda('Materiales', { fontSize: 9 }), derecha(fmtM(tot.mat), { fontSize: 9 })])
    }
    filas.push(
      [celda('Pagos recibidos', { fontSize: 9 }), derecha(fmtM(tot.pagado), { fontSize: 9 })],
      [celda('SALDO', { fontSize: 9, bold: true, color: NARANJA }), derecha(fmtM(tot.saldo), { fontSize: 9, bold: true, color: NARANJA })],
    )
    contenido.push(
      { text: 'RESUMEN', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      { table: { widths: ['*', 'auto'], body: filas }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] },
    )
  }

  if (sel.jornales && datos.admin) {
    const filas = [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))
      .filter(s => s.moFacturable > 0)
      .map(s => [celda(getSemLabel(new Date(s.semKey + 'T12:00:00'))), derecha(fmtM(s.moFacturable), { bold: true })])
    contenido.push(
      { text: 'MANO DE OBRA, POR SEMANA', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ['*', 'auto'], body: [cabecera(['Semana', 'Importe']), ...filas] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] },
    )
  }

  if (sel.contratistas && datos.admin) {
    const filas = [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))
      .filter(s => s.contFacturable > 0)
      .map(s => [celda(getSemLabel(new Date(s.semKey + 'T12:00:00'))), derecha(fmtM(s.contFacturable), { bold: true })])
    contenido.push(
      { text: 'CONTRATISTAS, POR SEMANA', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ['*', 'auto'], body: [cabecera(['Semana', 'Importe']), ...filas] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] },
    )
  }

  if (sel.materiales) {
    const filas = materialesSeleccionados(sel, datos).map(r => {
      const pct = pctMaterial(datos, r.fecha_resolucion)
      const importe = Number(r.precio_total ?? 0) * (1 + pct / 100)
      const fila = [
        celda(fmtFecha(r.fecha_resolucion)),
        celda(r.descripcion),
        derecha(`${Number(r.cantidad)} ${r.unidad}`),
        derecha(Number(r.precio_unit) > 0 ? fmtM(importe) : 'sin precio', { bold: true }),
      ]
      if (sel.modoMateriales === 'todo') fila.push(celda(r.estado === 'cobrado' ? 'Pagado' : 'Adeudado'))
      return fila
    })
    const cab = sel.modoMateriales === 'todo'
      ? cabecera(['Fecha', 'Material', 'Cantidad', 'Importe', 'Estado'])
      : cabecera(['Fecha', 'Material', 'Cantidad', 'Importe'])
    const widths = sel.modoMateriales === 'todo' ? ['auto', '*', 'auto', 'auto', 'auto'] : ['auto', '*', 'auto', 'auto']
    contenido.push(
      { text: sel.modoMateriales === 'deuda' ? 'MATERIALES ADEUDADOS' : 'MATERIALES', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      filas.length
        ? { table: { headerRows: 1, widths, body: [cab, ...filas] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 14] }
        : { text: 'Sin renglones.', fontSize: 8, color: '#777', margin: [0, 0, 0, 14] },
    )
  }

  if (sel.pagos) {
    const filas = datos.cobros.map(c => [
      celda(fmtFecha(c.fecha)),
      celda(c.medio ?? '—'),
      derecha(fmtM(Number(c.monto ?? 0))),
    ])
    contenido.push(
      { text: 'PAGOS RECIBIDOS', color: AZUL, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
      filas.length
        ? { table: { headerRows: 1, widths: ['auto', '*', 'auto'], body: [cabecera(['Fecha', 'Medio', 'Monto']), ...filas] }, layout: 'lightHorizontalLines' }
        : { text: 'Sin pagos registrados.', fontSize: 8, color: '#777' },
    )
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    footer: (page, total) => ({
      text: `${EMPRESA.nombre} · ${obra.nom} · página ${page} de ${total}`,
      alignment: 'center', fontSize: 7, color: '#999', margin: [0, 10, 0, 0],
    }),
    content: contenido,
  }
  pdfMake.createPdf(doc).download(nombreArchivo(obra, 'pdf'))
}

// ═════════════════════════════ Excel ═════════════════════════════

const FMT_MONEDA = '"$"#,##0;[Red]"-$"#,##0;"—"'
const C_AZUL = 'FF1F3A66'
const C_BLANCO = 'FFFFFFFF'

export async function descargarExcelCuenta(sel: SeleccionExport, datos: DatosExport): Promise<void> {
  const { obra } = datos
  const tot = totales(datos)
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre

  const head = (fila: ExcelJS.Row) => {
    fila.font = { bold: true, color: { argb: C_BLANCO } }
    fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } } })
  }
  const titulo = (ws: ExcelJS.Worksheet) => {
    const r = ws.addRow([`${obra.nom} (${obra.cod}) — al ${toISO(new Date())}`])
    r.font = { bold: true, size: 13, color: { argb: C_AZUL } }
    ws.addRow([])
  }

  if (sel.resumen) {
    const ws = wb.addWorksheet('Resumen')
    ws.columns = [{ width: 22 }, { width: 16 }]
    titulo(ws)
    const filas: [string, number][] = tot.admin
      ? [['Mano de obra', tot.mo], ['Contratistas', tot.cont], ['Materiales', tot.mat], ['Total', tot.total], ['Pagos recibidos', tot.pagado], ['SALDO', tot.saldo]]
      : [['Materiales', tot.mat], ['Pagos recibidos', tot.pagado], ['SALDO', tot.saldo]]
    for (const [etiqueta, monto] of filas) {
      const r = ws.addRow([etiqueta, monto])
      r.getCell(2).numFmt = FMT_MONEDA
      if (etiqueta === 'Total' || etiqueta === 'SALDO') r.font = { bold: true }
    }
  }

  if ((sel.jornales || sel.contratistas) && datos.admin) {
    // El Excel es interno: costo, % y facturable a la vista.
    const ws = wb.addWorksheet('Jornales y contratistas')
    ws.columns = [{ width: 14 }, { width: 15 }, { width: 8 }, { width: 15 }, { width: 15 }, { width: 8 }, { width: 15 }]
    titulo(ws)
    head(ws.addRow(['Semana', 'Mano de obra', '%', 'Facturable', 'Contratistas', '%', 'Facturable']))
    for (const s of [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))) {
      const r = ws.addRow([
        s.semKey,
        sel.jornales ? s.moCosto : null, sel.jornales ? s.moPct / 100 : null, sel.jornales ? s.moFacturable : null,
        sel.contratistas ? s.contCosto : null, sel.contratistas ? s.contPct / 100 : null, sel.contratistas ? s.contFacturable : null,
      ])
      ;[2, 4, 5, 7].forEach(i => { r.getCell(i).numFmt = FMT_MONEDA })
      ;[3, 6].forEach(i => { r.getCell(i).numFmt = '0.0%' })
    }
  }

  if (sel.materiales) {
    const ws = wb.addWorksheet('Materiales')
    ws.columns = [{ width: 12 }, { width: 44 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 7 }, { width: 14 }, { width: 11 }]
    titulo(ws)
    head(ws.addRow(['Fecha', 'Material', 'Cantidad', 'Unidad', 'Precio', '%', 'Facturable', 'Estado']))
    for (const r of materialesSeleccionados(sel, datos)) {
      const pct = pctMaterial(datos, r.fecha_resolucion)
      const fila = ws.addRow([
        r.fecha_resolucion, r.descripcion, Number(r.cantidad), r.unidad,
        Number(r.precio_total ?? 0), pct / 100, Number(r.precio_total ?? 0) * (1 + pct / 100),
        r.estado === 'cobrado' ? 'Pagado' : 'Adeudado',
      ])
      ;[5, 7].forEach(i => { fila.getCell(i).numFmt = FMT_MONEDA })
      fila.getCell(6).numFmt = '0.0%'
    }
  }

  if (sel.pagos) {
    const ws = wb.addWorksheet('Pagos')
    ws.columns = [{ width: 12 }, { width: 18 }, { width: 16 }, { width: 40 }]
    titulo(ws)
    head(ws.addRow(['Fecha', 'Medio', 'Monto', 'Obs']))
    for (const c of datos.cobros) {
      const r = ws.addRow([c.fecha, c.medio ?? '—', Number(c.monto ?? 0), c.obs ?? ''])
      r.getCell(3).numFmt = FMT_MONEDA
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo(obra, 'xlsx')
  a.click()
  URL.revokeObjectURL(url)
}
