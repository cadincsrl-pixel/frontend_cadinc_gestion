/**
 * Recibo de sueldo en PDF con el formato del Decreto 407/2026: cuatro
 * secciones, en el orden en que las pide la norma.
 *   1. Empleador y trabajador (razón social, CUIT y domicilio de CADINC;
 *      nombre, CUIL, legajo, ingreso, categoría, convenio, obra social…).
 *   2. Contribuciones patronales, agrupadas (seguridad social, obra social,
 *      INSSJP, ART, cámaras/IERIC, sindicales) + el fondo de cese aparte.
 *   3. Haberes y deducciones, con cantidad/base/unidad/porcentaje de cada línea.
 *   4. Neto a cobrar en números y en letras, y las firmas.
 *
 * Los datos del empleador salen de `EMPRESA` (hidratado desde Admin › Datos de
 * la empresa por `EmpresaLoader`), igual que los demás PDF del ERP. Los importes
 * salen del recibo guardado: el PDF no recalcula nada. Sin «Ver datos
 * personales» el CUIL llega enmascarado desde el backend y se imprime así.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import { importeALetras } from '@/modules/facturacion/utils/numeroALetras'
import type { GrupoContribucion, LiquidacionDetalle, Recibo, ReciboLinea, TipoLiquidacion, Unidad } from '@/types/sueldos.types'
import { GRUPO_LABEL, MODALIDADES, UNIDAD_LABEL, fmtCant, fmtCuil, fmtFecha, fmtMes, fmtN, sumar } from './sueldos.utils'

const fuentes = pdfFonts as unknown as { vfs?: Record<string, string>; pdfMake?: { vfs?: Record<string, string> } }
;(pdfMake as unknown as { vfs: unknown }).vfs = fuentes.vfs ?? fuentes.pdfMake?.vfs ?? pdfFonts

const CARBON = '#1C1C1E'
const TENUE = '#6B6B66'
const BORDE = '#D9D9D4'
const FONDO = '#F5F5F2'
const NARANJA = '#E8621A'
const ROJO = '#C00000'
type Margen = [number, number, number, number]

/** Datos de la liquidación que imprime el recibo. */
export interface LiqParaRecibo {
  codigo: string
  tipo: TipoLiquidacion
  periodo: string
  quincena: 1 | 2 | null
  fecha_pago: string | null
  estado: 'borrador' | 'cerrada' | 'anulada'
  convenio: { nombre: string; cct?: string | null }
}

export function liqParaRecibo(l: Pick<LiquidacionDetalle, 'codigo' | 'tipo' | 'periodo' | 'quincena' | 'fecha_pago' | 'estado' | 'convenio'>, cct?: string | null): LiqParaRecibo {
  return {
    codigo: l.codigo, tipo: l.tipo, periodo: l.periodo, quincena: l.quincena, fecha_pago: l.fecha_pago, estado: l.estado,
    convenio: { nombre: l.convenio.nombre, cct: cct ?? null },
  }
}

const TIPO_PDF: Record<TipoLiquidacion, string> = {
  quincena: 'Quincena', mensual: 'Mensual', sac: 'Sueldo anual complementario', vacaciones: 'Vacaciones',
  final: 'Liquidación final', ajuste: 'Ajuste',
}

function periodoTexto(l: LiqParaRecibo): string {
  const mes = fmtMes(l.periodo)
  const mesMay = mes.charAt(0).toUpperCase() + mes.slice(1)
  if (l.tipo === 'quincena') return `${l.quincena === 2 ? '2ª' : '1ª'} quincena de ${mesMay}`
  if (l.tipo === 'mensual') return mesMay
  return `${TIPO_PDF[l.tipo]} · ${mesMay}`
}

const th = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 7, color: TENUE, fillColor: FONDO, alignment: alin, margin: [2, 3, 2, 3] })
const td = (t: string, alin: 'left' | 'right' | 'center' = 'left', extra: Record<string, unknown> = {}): TableCell =>
  ({ text: t, fontSize: 8, alignment: alin, margin: [2, 2, 2, 2], ...extra })

const caja = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6,
  hLineColor: () => BORDE, vLineColor: () => BORDE,
}
const lista = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.25),
  vLineWidth: () => 0,
  hLineColor: () => BORDE,
}

const tituloSeccion = (n: number, t: string): Content =>
  ({ text: `${n}. ${t}`, bold: true, fontSize: 8.5, color: NARANJA, margin: [0, 8, 0, 3] as Margen })

const par = (label: string, valor: string): Content => ({
  text: [{ text: `${label} `, bold: true }, { text: valor || '—' }],
  fontSize: 8, margin: [0, 1, 0, 1] as Margen,
})

/** "88 hs" · "30 días" · "11 %" · base: "$ 1.234,56". */
function cantidadTexto(l: ReciboLinea): string {
  const partes: string[] = []
  if (l.cantidad != null && l.unidad !== '%') {
    const u = l.unidad ? UNIDAD_LABEL[l.unidad as Unidad] ?? l.unidad : ''
    partes.push(`${fmtCant(l.cantidad)}${u && u !== '$' ? ` ${u}` : ''}`)
  }
  if (l.porcentaje != null) partes.push(`${fmtCant(l.porcentaje)} %`)
  return partes.join(' · ')
}

function baseTexto(l: ReciboLinea): string {
  return l.base != null && l.base !== 0 ? fmtN(l.base) : ''
}

function armarUno(r: Recibo, liq: LiqParaRecibo, ejemplar: string | null): Content[] {
  const lg = r.snapshot?.legajo
  const nombre = lg?.nombre_mostrar ?? r.legajo.nombre
  const categoria = lg?.categoria_nombre ?? r.legajo.categoria_nombre ?? ''
  const modalidad = MODALIDADES.find(m => m.value === lg?.modalidad_contratacion)?.label ?? lg?.modalidad_contratacion ?? ''
  const convenio = `${liq.convenio.nombre}${liq.convenio.cct ? ` — CCT ${liq.convenio.cct}` : ''}`

  // ── 1. Empleador / trabajador ──
  const encabezado: Content = {
    columns: [
      { text: 'RECIBO DE HABERES', fontSize: 13, bold: true, color: CARBON },
      {
        width: 'auto', alignment: 'right', stack: [
          { text: `${liq.codigo}${ejemplar ? ` · ${ejemplar}` : ''}`, fontSize: 8, bold: true, alignment: 'right' },
          { text: 'Art. 140 LCT · Decreto 407/2026', fontSize: 7, color: TENUE, alignment: 'right' },
        ],
      },
    ],
    margin: [0, 0, 0, 6] as Margen,
  }

  const partes: Content = {
    table: {
      widths: ['*', '*'],
      body: [[
        {
          margin: [6, 5, 6, 5], stack: [
            { text: 'EMPLEADOR', bold: true, fontSize: 7, color: TENUE, margin: [0, 0, 0, 2] as Margen },
            { text: EMPRESA.razonSocialFactura, bold: true, fontSize: 10 },
            par('CUIT:', EMPRESA.cuit),
            par('Domicilio:', EMPRESA.domicilio),
            par('Período liquidado:', periodoTexto(liq)),
            par('Fecha de pago:', fmtFecha(liq.fecha_pago)),
            par('Lugar de pago:', lg?.banco ? `Acreditación en cuenta · ${lg.banco}` : 'Acreditación en cuenta'),
          ],
        },
        {
          margin: [6, 5, 6, 5], stack: [
            { text: 'TRABAJADOR', bold: true, fontSize: 7, color: TENUE, margin: [0, 0, 0, 2] as Margen },
            { text: nombre, bold: true, fontSize: 10 },
            par('CUIL:', fmtCuil(lg?.cuil)),
            par('Legajo:', lg?.leg ?? (lg?.chofer_id ? `Chofer ${lg.chofer_id}` : String(r.legajo_id))),
            par('Fecha de ingreso:', fmtFecha(lg?.fecha_ingreso)),
            par('Categoría:', `${categoria}${lg?.zona && lg.zona !== 'A' ? ` · zona ${lg.zona}` : ''}`),
            par('Convenio:', convenio),
            par('Modalidad:', `${modalidad}${lg?.jornada === 'parcial' ? ' · jornada parcial' : ''}`),
            par('Obra social:', `${lg?.obra_social ?? ''}${lg?.obra_social_codigo ? ` (${lg.obra_social_codigo})` : ''}`),
            ...(r.dias_trabajados != null || r.horas_trabajadas != null ? [par('Trabajado:', [
              r.dias_trabajados != null ? `${fmtCant(r.dias_trabajados)} días` : '',
              r.horas_trabajadas != null ? `${fmtCant(r.horas_trabajadas)} horas` : '',
            ].filter(Boolean).join(' · '))] : []),
          ],
        },
      ]],
    },
    layout: caja,
  }

  // ── 2. Contribuciones patronales por grupo ──
  const contrib = r.lineas.filter(l => l.tipo === 'contribucion')
  const fondoCese = contrib.filter(l => l.destino === 'fondo_cese')
  const otrasContrib = contrib.filter(l => l.destino !== 'fondo_cese')
  const grupos = new Map<string, number>()
  for (const l of otrasContrib) {
    const g = l.grupo_contribucion ?? 'otros'
    grupos.set(g, sumar([grupos.get(g) ?? 0, l.importe]))
  }
  const orden: GrupoContribucion[] = ['seguridad_social', 'obra_social', 'inssjp', 'art', 'camaras', 'sindical', 'otros']
  const filasContrib: TableCell[][] = orden
    .filter(g => grupos.has(g))
    .map(g => [td(GRUPO_LABEL[g]), td(fmtN(grupos.get(g) ?? 0), 'right')])
  for (const l of fondoCese) filasContrib.push([td(`${l.nombre} (no se descuenta del sueldo)`), td(fmtN(l.importe), 'right')])
  const totalContrib = sumar(contrib.map(l => l.importe))
  const seccionContrib: Content = filasContrib.length === 0
    ? { text: 'Sin contribuciones registradas.', fontSize: 8, color: TENUE, italics: true }
    : {
      table: {
        headerRows: 1, widths: ['*', 90],
        body: [
          [th('Destino de la contribución'), th('Importe', 'right')],
          ...filasContrib,
          [td('Total contribuciones patronales', 'left', { bold: true }), td(fmtN(totalContrib), 'right', { bold: true })],
        ],
      },
      layout: lista,
    }

  // ── 3. Haberes y deducciones ──
  const renglones = r.lineas.filter(l => l.tipo !== 'contribucion' && l.en_recibo).sort((a, b) => a.orden - b.orden)
  const filas: TableCell[][] = renglones.map(l => [
    td(l.codigo_arca ?? '', 'left', { color: TENUE, fontSize: 7 }),
    td(l.nombre),
    td(cantidadTexto(l), 'right'),
    td(baseTexto(l), 'right'),
    td(l.tipo === 'remunerativo' ? fmtN(l.importe) : '', 'right'),
    td(l.tipo === 'no_remunerativo' ? fmtN(l.importe) : '', 'right'),
    td(l.tipo === 'descuento' ? fmtN(l.importe) : '', 'right'),
  ])
  const haberes: Content = {
    table: {
      headerRows: 1,
      widths: [34, '*', 62, 62, 62, 62, 62],
      body: [
        [th('Cód.'), th('Concepto'), th('Cant. / %', 'right'), th('Base', 'right'), th('Remunerativo', 'right'), th('No remun.', 'right'), th('Deducciones', 'right')],
        ...filas,
        [
          td('', 'left'), td('Totales', 'left', { bold: true }), td(''), td(''),
          td(fmtN(r.total_remunerativo), 'right', { bold: true }),
          td(fmtN(r.total_no_remunerativo), 'right', { bold: true }),
          td(fmtN(r.total_descuentos), 'right', { bold: true }),
        ],
      ],
    },
    layout: lista,
  }

  // ── 4. Neto ──
  const neto: Content = {
    table: {
      widths: ['*', 130],
      body: [[
        {
          margin: [6, 6, 6, 6], stack: [
            { text: 'NETO A COBRAR', bold: true, fontSize: 7, color: TENUE },
            { text: [{ text: 'Son pesos: ', bold: true }, `${importeALetras(Number(r.neto))}${r.neto < 0 ? ' (negativo)' : ''}`], fontSize: 8.5, margin: [0, 2, 0, 0] as Margen },
          ],
        },
        { text: `$ ${fmtN(r.neto)}`, fontSize: 14, bold: true, alignment: 'right', margin: [6, 10, 6, 6] as Margen, fillColor: FONDO },
      ]],
    },
    layout: caja,
  }

  const firmas: Content = {
    columns: [
      { stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.5, lineColor: TENUE }] }, { text: 'Firma y sello del empleador', fontSize: 7, color: TENUE, margin: [0, 2, 0, 0] as Margen }] },
      { stack: [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.5, lineColor: TENUE }] }, { text: 'Recibí el importe neto y un duplicado de este recibo — firma del trabajador', fontSize: 7, color: TENUE, margin: [0, 2, 0, 0] as Margen }] },
    ],
    margin: [0, 34, 0, 0] as Margen,
  }

  return [
    encabezado,
    tituloSeccion(1, 'Empleador y trabajador'), partes,
    tituloSeccion(2, 'Contribuciones patronales'), seccionContrib,
    tituloSeccion(3, 'Haberes y deducciones'), haberes,
    tituloSeccion(4, 'Neto'), neto,
    ...(r.obs ? [{ text: r.obs, fontSize: 7.5, color: TENUE, margin: [0, 4, 0, 0] as Margen }] : []),
    firmas,
  ]
}

export function armarRecibosDoc(recibos: Recibo[], liq: LiqParaRecibo, opts: { duplicado?: boolean } = {}): TDocumentDefinitions {
  const content: Content[] = []
  const ejemplares = opts.duplicado ? ['ORIGINAL (empleador)', 'DUPLICADO (trabajador)'] : [null]
  recibos.forEach((r, i) => {
    ejemplares.forEach((ej, j) => {
      const primero = i === 0 && j === 0
      content.push({ stack: armarUno(r, liq, ej), ...(primero ? {} : { pageBreak: 'before' as const }) })
    })
  })
  const marca = liq.estado === 'anulada' ? 'ANULADA' : liq.estado === 'borrador' ? 'BORRADOR — NO VÁLIDO' : null
  return {
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: { fontSize: 8, color: CARBON },
    info: { title: `Recibos ${liq.codigo}`, author: EMPRESA.razonSocialFactura },
    ...(marca ? { watermark: { text: marca, color: ROJO, opacity: 0.12, bold: true, fontSize: 60 } } : {}),
    footer: (pag: number, total: number): Content => ({
      margin: [28, 10, 28, 0],
      columns: [
        { text: `Emitido por el sistema de gestión de ${EMPRESA.nombre}`, fontSize: 6.5, color: TENUE },
        { text: `Pág. ${pag}/${total}`, fontSize: 6.5, color: TENUE, alignment: 'right', width: 60 },
      ],
    }),
    content,
  }
}

function slug(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
}

export function descargarRecibosPdf(recibos: Recibo[], liq: LiqParaRecibo, opts: { duplicado?: boolean } = {}): void {
  const nombre = recibos.length === 1
    ? `Recibo_${liq.codigo}_${slug(recibos[0]!.snapshot?.legajo?.nombre_mostrar ?? recibos[0]!.legajo.nombre)}.pdf`
    : `Recibos_${liq.codigo}.pdf`
  pdfMake.createPdf(armarRecibosDoc(recibos, liq, opts)).download(nombre)
}
