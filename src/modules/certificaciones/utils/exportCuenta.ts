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

// Paleta del logo (24/09): pizarra #293F3F para títulos y cabeceras, naranja
// #F96115 solo de acento. `AZUL` conserva el nombre por los que ya lo importan,
// pero es el pizarra de la marca: el azul marino de antes no era de CADINC.
export const AZUL = '#293F3F'
export const PIZARRA = AZUL
export const NARANJA = '#F96115'
const GRIS = '#5E6B6B'
const LINEA = '#D9DEDE'
const CEBRA = '#F4F6F6'
const NARANJA_SOFT = '#FEEDE3'
export const fmtM = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR')
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
  /**
   * Notas de crédito vigentes (20260913k): material devuelto al depósito cuyo
   * renglón ya estaba cobrado. En el PDF va como línea propia "Devoluciones",
   * no mezclado con los pagos: al cliente hay que mostrarle POR QUÉ debe menos.
   * Opcional para no romper llamadas viejas — sin notas, se comporta igual.
   */
  notas?:    { monto: number }[]
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
  // Las devoluciones bajan el saldo pero NO son pagos: van como término propio
  // para que el cliente vea de dónde sale la diferencia.
  const notas  = (datos.notas ?? []).reduce((s, n) => s + Number(n.monto ?? 0), 0)
  if (datos.admin) {
    const t = datos.admin.tot
    return { admin: true, mo: t.mo, cont: t.cont, mat: t.mat, total: t.total, pagado, notas, saldo: t.total - pagado - notas }
  }
  const mat = datos.renglones.reduce((s, r) => s + Number(r.precio_total ?? 0), 0)
  return { admin: false, mo: 0, cont: 0, mat, total: mat, pagado, notas, saldo: mat - pagado - notas }
}

const nombreArchivo = (obra: Obra, ext: string) =>
  `Cuenta_${obra.cod.replace(/[^\w-]+/g, '_')}_${toISO(new Date())}.${ext}`

// ═════════════════════════════ PDF ═════════════════════════════

export const celda = (texto: string, extra: Partial<TableCell> = {}): TableCell =>
  ({ text: texto, fontSize: 8, ...extra } as TableCell)
export const cabecera = (textos: string[]): TableCell[] =>
  textos.map(t => celda(t, { bold: true, color: '#fff', fillColor: PIZARRA, margin: [2, 3, 2, 3] }))
export const derecha = (texto: string, extra: Partial<TableCell> = {}): TableCell =>
  celda(texto, { alignment: 'right', ...extra })

/** Tablas: cabecera pizarra, cebra suave, líneas finas horizontales, sin verticales. */
export const LAYOUT_TABLA = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => LINEA,
  fillColor: (row: number) => (row > 0 && row % 2 === 0 ? CEBRA : null),
  paddingTop: () => 3, paddingBottom: () => 3,
}
/** Resumen: sin cebra, con líneas finas. */
export const LAYOUT_RESUMEN = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => LINEA,
  paddingTop: () => 4, paddingBottom: () => 4,
}

/** El logo en data URL para pdfmake; null si no se pudo bajar (el PDF sale igual). */
export async function logoPdf(): Promise<string | null> {
  try {
    const res = await fetch(EMPRESA.logoPapelUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((ok, mal) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result))
      r.onerror = () => mal(r.error)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Cabecera de un PDF de CADINC: logo, título, obra y detalle; fecha a la derecha; línea naranja. */
export function cabeceraPdf(logo: string | null, titulo: string, lineaObra: string, detalle?: string): Content[] {
  return [
    {
      columnGap: 14,
      columns: [
        ...(logo ? [{ image: logo, width: 34 }] : []),
        {
          width: '*',
          stack: [
            { text: titulo.toUpperCase(), color: PIZARRA, bold: true, fontSize: 15, characterSpacing: 0.4 },
            { text: lineaObra, color: '#1F2A2A', bold: true, fontSize: 10, margin: [0, 3, 0, 0] },
            ...(detalle ? [{ text: detalle, color: GRIS, fontSize: 8, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: `Al ${new Date().toLocaleDateString('es-AR')}`, color: GRIS, fontSize: 8, alignment: 'right' },
            { text: EMPRESA.nombre, color: PIZARRA, bold: true, fontSize: 8, alignment: 'right', margin: [0, 3, 0, 0] },
          ],
        },
      ],
    } as Content,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: NARANJA }], margin: [0, 8, 0, 14] } as Content,
  ]
}

/** Título de sección: pizarra, chico y espaciado. */
export const tituloSeccion = (texto: string): Content =>
  ({ text: texto, color: PIZARRA, bold: true, fontSize: 9, characterSpacing: 0.6, margin: [0, 4, 0, 5] })

const detalleObra = (obra: Obra) => [
  obra.cliente_nom ? `Cliente: ${obra.cliente_nom}` : null,
  obra.por_administracion ? 'Obra por administración' : obra.materiales_a_cargo_de === 'cadinc' ? 'Llave en mano' : null,
].filter(Boolean).join('  ·  ')

export async function descargarPdfCuenta(sel: SeleccionExport, datos: DatosExport): Promise<void> {
  const { obra } = datos
  const tot = totales(datos)
  const logo = await logoPdf()
  const contenido: Content[] = [
    ...cabeceraPdf(logo, 'Cuenta corriente de obra', `${obra.nom}  ·  ${obra.cod}`, detalleObra(obra) || undefined),
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
    filas.push([celda('Pagos recibidos', { fontSize: 9 }), derecha(fmtM(tot.pagado), { fontSize: 9 })])
    // Solo si hubo: una línea "Devoluciones $0" en todas las obras sería ruido.
    if (tot.notas > 0) {
      filas.push([
        celda('Devoluciones (material reintegrado)', { fontSize: 9 }),
        derecha(`-${fmtM(tot.notas)}`, { fontSize: 9 }),
      ])
    }
    filas.push(
      [celda('SALDO', { fontSize: 10, bold: true, color: NARANJA, fillColor: NARANJA_SOFT, margin: [2, 3, 2, 3] }),
       derecha(fmtM(tot.saldo), { fontSize: 10, bold: true, color: NARANJA, fillColor: NARANJA_SOFT, margin: [2, 3, 2, 3] })],
    )
    contenido.push(
      tituloSeccion('RESUMEN'),
      { table: { widths: ['*', 'auto'], body: filas }, layout: LAYOUT_RESUMEN, margin: [0, 0, 0, 16] },
    )
  }

  if (sel.jornales && datos.admin) {
    const filas = [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))
      .filter(s => s.moFacturable > 0)
      .map(s => [celda(getSemLabel(new Date(s.semKey + 'T12:00:00'))), derecha(fmtM(s.moFacturable), { bold: true })])
    contenido.push(
      tituloSeccion('MANO DE OBRA, POR SEMANA'),
      { table: { headerRows: 1, widths: ['*', 'auto'], body: [cabecera(['Semana', 'Importe']), ...filas] }, layout: LAYOUT_TABLA, margin: [0, 0, 0, 16] },
    )
  }

  if (sel.contratistas && datos.admin) {
    const filas = [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))
      .filter(s => s.contFacturable > 0)
      .map(s => [celda(getSemLabel(new Date(s.semKey + 'T12:00:00'))), derecha(fmtM(s.contFacturable), { bold: true })])
    contenido.push(
      tituloSeccion('CONTRATISTAS, POR SEMANA'),
      { table: { headerRows: 1, widths: ['*', 'auto'], body: [cabecera(['Semana', 'Importe']), ...filas] }, layout: LAYOUT_TABLA, margin: [0, 0, 0, 16] },
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
      if (sel.modoMateriales === 'todo') fila.push(celda(r.estado === 'cobrado' ? 'Pagado' : 'Adeudado',
        { bold: true, color: r.estado === 'cobrado' ? '#1A6B3C' : NARANJA }))
      return fila
    })
    const cab = sel.modoMateriales === 'todo'
      ? cabecera(['Fecha', 'Material', 'Cantidad', 'Importe', 'Estado'])
      : cabecera(['Fecha', 'Material', 'Cantidad', 'Importe'])
    const widths = sel.modoMateriales === 'todo' ? ['auto', '*', 'auto', 'auto', 'auto'] : ['auto', '*', 'auto', 'auto']
    contenido.push(
      tituloSeccion(sel.modoMateriales === 'deuda' ? 'MATERIALES ADEUDADOS' : 'MATERIALES'),
      filas.length
        ? { table: { headerRows: 1, widths, body: [cab, ...filas] }, layout: LAYOUT_TABLA, margin: [0, 0, 0, 16] }
        : { text: 'Sin renglones.', fontSize: 8, color: GRIS, margin: [0, 0, 0, 16] },
    )
  }

  if (sel.pagos) {
    const filas = datos.cobros.map(c => [
      celda(fmtFecha(c.fecha)),
      celda(c.medio ? c.medio[0].toUpperCase() + c.medio.slice(1) : '—'),
      derecha(fmtM(Number(c.monto ?? 0))),
    ])
    contenido.push(
      tituloSeccion('PAGOS RECIBIDOS'),
      filas.length
        ? { table: { headerRows: 1, widths: ['auto', '*', 'auto'], body: [cabecera(['Fecha', 'Medio', 'Monto']), ...filas] }, layout: LAYOUT_TABLA }
        : { text: 'Sin pagos registrados.', fontSize: 8, color: GRIS },
    )
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    footer: (page, total) => ({
      columns: [
        { text: `${EMPRESA.nombre} · ${obra.nom}`, fontSize: 7, color: GRIS },
        { text: `Página ${page} de ${total}`, fontSize: 7, color: GRIS, alignment: 'right' },
      ],
      margin: [40, 12, 40, 0],
    }),
    defaultStyle: { color: '#1F2A2A' },
    content: contenido,
  }
  pdfMake.createPdf(doc).download(nombreArchivo(obra, 'pdf'))
}

// ═════════════════════════════ Excel ═════════════════════════════
//
// El Excel es interno pero se reenvía: tiene que verse como un papel de
// CADINC. Paleta del logo (24/09): pizarra #293F3F para logo, títulos y
// cabeceras; naranja #F96115 SOLO como acento (la línea bajo el encabezado y
// el saldo); grises suaves para el resto. Antes usaba un azul marino que no es
// de la marca y mezclaba dos colores fuertes.

const X = {
  pizarra:     'FF293F3F',
  naranja:     'FFF96115',
  naranjaSoft: 'FFFEEDE3',
  texto:       'FF1F2A2A',
  gris:        'FF5E6B6B',
  linea:       'FFD9DEDE',
  cebra:       'FFF4F6F6',
  blanco:      'FFFFFFFF',
  verde:       'FF1A6B3C',
} as const
const FMT_PESOS = '"$ "#,##0.00;[Red]-"$ "#,##0.00;"—"'
/** Sin rojo: en el resumen un pago resta, no es una deuda. */
const FMT_PESOS_NEUTRO = '"$ "#,##0.00;-"$ "#,##0.00;"$ 0,00"'
const FMT_FECHA = 'dd/mm/yyyy'
const FUENTE = 'Calibri'

/** 'AAAA-MM-DD' → Date a mediodía (sin corrimiento por huso), o el texto si no parsea. */
const fechaXl = (s: string | null | undefined): Date | string => {
  if (!s) return ''
  const d = new Date(s.slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? s : d
}

async function cargarLogo(wb: ExcelJS.Workbook): Promise<number | null> {
  try {
    const res = await fetch(EMPRESA.logoPapelUrl)
    if (!res.ok) return null
    return wb.addImage({ buffer: await res.arrayBuffer(), extension: 'png' })
  } catch {
    return null   // sin logo el Excel sale igual
  }
}

interface Col { titulo: string; ancho: number; tipo?: 'texto' | 'fecha' | 'pesos' | 'pesosNeutro' | 'num' | 'pct'; total?: boolean }

/**
 * Una hoja con la cabecera de CADINC y una tabla: logo, título, obra y fecha,
 * la línea naranja, la tabla con cebra y, si alguna columna lo pide, la fila
 * de totales con SUMA (fórmula, para que siga cuadrando si se filtra o edita).
 */
function hoja(wb: ExcelJS.Workbook, logo: number | null, nombre: string, titulo: string, obra: Obra, cols: Col[],
              filas: (string | number | Date | null)[][], opts: { apaisada?: boolean; estado?: (v: unknown) => Partial<ExcelJS.Font> | null } = {}) {
  const ws = wb.addWorksheet(nombre, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: opts.apaisada ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L&8${EMPRESA.nombre} · ${obra.nom}&R&8Página &P de &N` },
  })
  const n = cols.length
  ws.columns = cols.map(c => ({ width: c.ancho }))

  // ── Cabecera: filas 1–4 ──
  ;[26, 20, 18, 10].forEach((h, i) => { ws.getRow(i + 1).height = h })
  if (logo != null) ws.addImage(logo, { tl: { col: 0.15, row: 0.15 }, ext: { width: 50, height: 68 } })
  // Los textos van en la columna A con sangría, a la derecha del logo: así no
  // dependen del ancho de la columna B (en Resumen la A es la ancha).
  const junto = { indent: 8, vertical: 'middle' as const }
  const t = ws.getCell(1, 1)
  t.value = titulo.toUpperCase()
  t.font = { name: FUENTE, size: 16, bold: true, color: { argb: X.pizarra } }
  t.alignment = junto
  const o = ws.getCell(2, 1)
  o.value = `${obra.nom}  ·  ${obra.cod}`
  o.font = { name: FUENTE, size: 12, bold: true, color: { argb: X.texto } }
  o.alignment = junto
  const detalle = [
    obra.cliente_nom ? `Cliente: ${obra.cliente_nom}` : null,
    obra.por_administracion ? 'Obra por administración' : obra.materiales_a_cargo_de === 'cadinc' ? 'Llave en mano' : 'Materiales a cargo del cliente',
  ].filter(Boolean).join('  ·  ')
  const d = ws.getCell(3, 1)
  d.value = detalle
  d.font = { name: FUENTE, size: 9, color: { argb: X.gris } }
  d.alignment = junto
  const f = ws.getCell(1, n)
  f.value = `Al ${new Date().toLocaleDateString('es-AR')}`
  f.font = { name: FUENTE, size: 9, color: { argb: X.gris } }
  f.alignment = { horizontal: 'right', vertical: 'middle' }
  const e = ws.getCell(2, n)
  e.value = EMPRESA.nombre
  e.font = { name: FUENTE, size: 9, bold: true, color: { argb: X.pizarra } }
  e.alignment = { horizontal: 'right' }
  // El único naranja fuerte: la línea que cierra la cabecera.
  for (let c = 1; c <= n; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: X.naranja } } }

  // ── Tabla: cabecera en la fila 6 ──
  const FILA_CAB = 6
  const cab = ws.getRow(FILA_CAB)
  cab.values = cols.map(c => c.titulo)
  cab.height = 20
  cab.eachCell((c, i) => {
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: X.blanco } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: X.pizarra } }
    c.alignment = { vertical: 'middle', horizontal: ['pesos', 'pesosNeutro', 'num', 'pct'].includes(cols[i - 1].tipo ?? '') ? 'right' : 'left', indent: 1 }
  })

  filas.forEach((valores, k) => {
    const r = ws.getRow(FILA_CAB + 1 + k)
    r.values = valores
    r.height = 17
    cols.forEach((col, j) => {
      const c = r.getCell(j + 1)
      c.font = { name: FUENTE, size: 10, color: { argb: X.texto } }
      c.alignment = { vertical: 'middle', horizontal: ['pesos', 'pesosNeutro', 'num', 'pct'].includes(col.tipo ?? '') ? 'right' : 'left', indent: 1, wrapText: col.ancho >= 30 }
      c.border = { bottom: { style: 'thin', color: { argb: X.linea } } }
      if (k % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: X.cebra } }
      if (col.tipo === 'pesos') c.numFmt = FMT_PESOS
      if (col.tipo === 'pesosNeutro') c.numFmt = FMT_PESOS_NEUTRO
      if (col.tipo === 'fecha') c.numFmt = FMT_FECHA
      if (col.tipo === 'pct')   c.numFmt = '0.0%'
      if (col.tipo === 'num')   c.numFmt = 'General'
      const extra = opts.estado && j === n - 1 ? opts.estado(c.value) : null
      if (extra) c.font = { ...c.font, ...extra }
    })
  })

  const ultima = FILA_CAB + filas.length
  if (filas.length === 0) {
    const c = ws.getCell(FILA_CAB + 1, 1)
    c.value = 'Sin renglones.'
    c.font = { name: FUENTE, size: 10, italic: true, color: { argb: X.gris } }
  } else if (cols.some(c => c.total)) {
    const r = ws.getRow(ultima + 1)
    r.height = 20
    cols.forEach((col, j) => {
      const c = r.getCell(j + 1)
      c.border = { top: { style: 'medium', color: { argb: X.pizarra } } }
      c.font = { name: FUENTE, size: 10, bold: true, color: { argb: X.pizarra } }
      c.alignment = { vertical: 'middle', horizontal: col.total ? 'right' : 'left', indent: 1 }
      if (j === 0) c.value = 'TOTAL'
      if (col.total) {
        const letra = ws.getColumn(j + 1).letter
        const suma = filas.reduce((s, v) => s + (typeof v[j] === 'number' ? (v[j] as number) : 0), 0)
        c.value = { formula: `SUBTOTAL(9,${letra}${FILA_CAB + 1}:${letra}${ultima})`, result: suma }
        c.numFmt = FMT_PESOS
      }
    })
  }

  ws.views = [{ state: 'frozen', ySplit: FILA_CAB, showGridLines: false }]
  if (filas.length > 0) ws.autoFilter = { from: { row: FILA_CAB, column: 1 }, to: { row: ultima, column: n } }
  return ws
}

export async function descargarExcelCuenta(sel: SeleccionExport, datos: DatosExport): Promise<void> {
  const { obra } = datos
  const tot = totales(datos)
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.nombre
  wb.created = new Date()
  const logo = await cargarLogo(wb)

  if (sel.resumen) {
    const filas: [string, number][] = tot.admin
      ? [['Mano de obra', tot.mo], ['Contratistas', tot.cont], ['Materiales', tot.mat], ['Total de la obra', tot.total]]
      : [['Materiales', tot.mat]]
    filas.push(['Pagos recibidos', -tot.pagado])
    // Misma línea de devoluciones que el PDF, y solo si hubo.
    if (tot.notas > 0) filas.push(['Devoluciones (material reintegrado)', -tot.notas])
    const ws = hoja(wb, logo, 'Resumen', 'Cuenta corriente', obra,
      [{ titulo: 'Concepto', ancho: 40 }, { titulo: 'Importe', ancho: 20, tipo: 'pesosNeutro' }], filas)
    // El saldo, destacado: la única fila con fondo naranja.
    const r = ws.getRow(6 + filas.length + 1)
    r.height = 24
    r.values = ['SALDO', tot.saldo]
    r.eachCell((c, j) => {
      c.font = { name: FUENTE, size: 12, bold: true, color: { argb: X.naranja } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: X.naranjaSoft } }
      c.border = { top: { style: 'medium', color: { argb: X.naranja } } }
      c.alignment = { vertical: 'middle', horizontal: j === 2 ? 'right' : 'left', indent: 1 }
      if (j === 2) c.numFmt = FMT_PESOS_NEUTRO
    })
    const nota = ws.getCell(6 + filas.length + 3, 1)
    nota.value = tot.saldo > 0 ? 'Saldo a cobrar al cliente.' : tot.saldo < 0 ? 'Saldo a favor del cliente.' : 'Cuenta saldada.'
    nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: X.gris } }
  }

  if ((sel.jornales || sel.contratistas) && datos.admin) {
    // Interno: costo, % y facturable a la vista.
    const semanas = [...datos.admin.semanas].sort((a, b) => a.semKey.localeCompare(b.semKey))
    hoja(wb, logo, 'Jornales y contratistas', 'Jornales y contratistas', obra, [
      { titulo: 'Semana', ancho: 14, tipo: 'fecha' },
      { titulo: 'Mano de obra', ancho: 16, tipo: 'pesos', total: true }, { titulo: '%', ancho: 8, tipo: 'pct' },
      { titulo: 'Facturable', ancho: 16, tipo: 'pesos', total: true },
      { titulo: 'Contratistas', ancho: 16, tipo: 'pesos', total: true }, { titulo: '%', ancho: 8, tipo: 'pct' },
      { titulo: 'Facturable', ancho: 16, tipo: 'pesos', total: true },
    ], semanas.map(s => [
      fechaXl(s.semKey),
      sel.jornales ? s.moCosto : null, sel.jornales ? s.moPct / 100 : null, sel.jornales ? s.moFacturable : null,
      sel.contratistas ? s.contCosto : null, sel.contratistas ? s.contPct / 100 : null, sel.contratistas ? s.contFacturable : null,
    ]), { apaisada: true })
  }

  if (sel.materiales) {
    // El % y el facturable solo existen en obras por administración: en las
    // demás eran dos columnas siempre en 0 %.
    const conPct = !!datos.admin
    const cols: Col[] = [
      { titulo: 'Fecha', ancho: 12, tipo: 'fecha' },
      { titulo: 'Pedido', ancho: 9 },
      { titulo: 'Material', ancho: 46 },
      { titulo: 'Cant.', ancho: 9, tipo: 'num' },
      { titulo: 'Unidad', ancho: 9 },
      { titulo: 'Precio unit.', ancho: 15, tipo: 'pesos' },
      { titulo: 'Importe', ancho: 16, tipo: 'pesos', total: true },
      ...(conPct ? [{ titulo: '%', ancho: 8, tipo: 'pct' as const }, { titulo: 'Facturable', ancho: 16, tipo: 'pesos' as const, total: true }] : []),
      { titulo: 'Estado', ancho: 16 },
    ]
    const filas = materialesSeleccionados(sel, datos).map(r => {
      const pct = pctMaterial(datos, r.fecha_resolucion)
      const importe = Number(r.precio_total ?? 0)
      const estado = r.estado === 'cobrado' ? 'Pagado'
        : r.certificado_numero ? `Certificado N° ${r.certificado_numero}` : 'Adeudado'
      return [
        fechaXl(r.fecha_resolucion), `#${r.solicitud_id}`, r.descripcion, Number(r.cantidad), r.unidad,
        Number(r.precio_unit ?? 0), importe,
        ...(conPct ? [pct / 100, importe * (1 + pct / 100)] : []),
        estado,
      ]
    })
    hoja(wb, logo, 'Materiales', sel.modoMateriales === 'deuda' ? 'Materiales adeudados' : 'Materiales', obra, cols, filas, {
      apaisada: true,
      estado: v => v === 'Pagado' ? { color: { argb: X.verde }, bold: true }
        : v === 'Adeudado' ? { color: { argb: X.naranja }, bold: true }
        : { color: { argb: X.pizarra }, bold: true },
    })
  }

  if (sel.pagos) {
    hoja(wb, logo, 'Pagos', 'Pagos recibidos', obra, [
      { titulo: 'Fecha', ancho: 12, tipo: 'fecha' },
      { titulo: 'Medio', ancho: 16 },
      { titulo: 'Observación', ancho: 50 },
      { titulo: 'Monto', ancho: 18, tipo: 'pesos', total: true },
    ], datos.cobros.map(c => [fechaXl(c.fecha), c.medio ? c.medio[0].toUpperCase() + c.medio.slice(1) : '—', c.obs ?? '', Number(c.monto ?? 0)]))
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
