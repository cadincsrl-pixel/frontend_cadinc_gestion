/**
 * La factura (o NC) de venta impresa. Rediseño del 23/09/2026 sobre el modelo
 * de Finnegans (FA 00002-00001273 a ARCOR) y el de ARCA para la FCE MiPyME
 * (FCE A 00001-00000012 a ARCOR, 11/09/2026). Vale para A, B, NC y FCE, el
 * definitivo y el borrador.
 *
 *   1. Encabezado: logo + emisor | recuadro con la LETRA y el código |
 *      tipo, número, fecha, CUIT, IIBB e inicio de actividades. En la FCE,
 *      debajo, el recuadro con vencimiento del pago, período, CBU/alias,
 *      referencia comercial y opción de transferencia, y la leyenda en rojo.
 *   2. Receptor: la FOTO que guardó la factura (`rec_*`), no el padrón de hoy.
 *   3. Renglones, con la descripción ancha (≈ la mitad de la hoja) y
 *      normalizada (`normalizarDescripcion`: sin palabras huérfanas).
 *   4. CIERRE ANCLADO AL PIE DE LA ÚLTIMA PÁGINA (como Finnegans): va en el
 *      `footer` de pdfmake y solo se devuelve en la última; las anteriores
 *      llevan "Continúa en la página siguiente" y "Pág. N/M". El margen de
 *      abajo (MARGEN_PIE) es lo que el cierre necesita, así los renglones
 *      nunca lo pisan. Adentro: observaciones | totales, "Son:", y la fila del
 *      QR + CAE + página.
 *
 * Factura B (fase 5): precio y subtotal de cada renglón CON IVA, sin IVA por
 * alícuota, y el recuadro del Régimen de Transparencia Fiscal al Consumidor
 * (Ley 27.743) con el IVA contenido.
 *
 * Borrador (o rechazada): vista previa para mandarle al cliente o al contador
 * ANTES de pedir el CAE. Marca de agua "BORRADOR — SIN VALIDEZ FISCAL",
 * "Borrador #id" en vez del número, sin QR ni CAE, y el archivo con prefijo
 * BORRADOR_.
 *
 * Los importes salen de la base (imp_neto, imp_iva, alícuotas): el PDF no
 * recalcula nada que ARCA ya autorizó.
 */
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { EMPRESA } from '@/lib/config/empresa'
import type { VentasFacturaFJ } from '@/types/domain.types'
import { conIvaRenglon, precioConIva } from './facturacion.calculos'
import { importeALetras } from './numeroALetras'
import { urlQrArca } from './qrArca'
import {
  ALICUOTA_LABEL, CONDICIONES_IVA, DOC_TIPOS, LEYENDA_FCE, TIPOS_CBTE, TRANSMISION_LABEL, cortoTipo, fmtCant, fmtCuit, fmtFecha,
  fmtN, fmtPrecio, normalizarDescripcion,
} from './facturacion.utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = (pdfFonts as any)?.vfs ?? (pdfFonts as any)?.pdfMake?.vfs ?? pdfFonts

// Paleta sobria: carbón para el texto, gris claro para bordes, UN acento naranja.
const CARBON  = '#1C1C1E'
const TENUE   = '#6B6B66'
const BORDE   = '#D9D9D4'
const FONDO   = '#F5F5F2'
const NARANJA = '#E8621A'
const NARANJA_SUAVE = '#FDF0E8'
const ROJO    = '#C00000'

const MARGEN_X = 28
const ANCHO = 595.28 - 2 * MARGEN_X   // A4 menos márgenes
/** Alto reservado abajo para el cierre (totales, Son, QR, CAE). */
export const MARGEN_PIE = 230
/** Lo que suma al pie la leyenda roja de la FCE (va abajo, como en el modelo de ARCA): 34 para la de ARCA. */
const EXTRA_PIE_FCE = 34
/** Una leyenda propia más larga (hasta 1000 caracteres) suma ≈ 8,5 pt por renglón de ~150 caracteres. */
export function extraPieFce(leyenda: string): number {
  const renglones = Math.ceil(leyenda.length / 150)
  return Math.max(EXTRA_PIE_FCE, 8 + renglones * 8.5)
}
/** Observaciones más largas que esto van en el cuerpo, no en el cierre (no entrarían). */
const OBS_MAX_EN_PIE = 280

type Margen = [number, number, number, number]

/** El logo de papel como data URL (pdfmake no baja URLs). null si no carga: el PDF sale igual. */
export async function logoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(EMPRESA.logoPapelUrl)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string | null>((ok) => {
      const fr = new FileReader()
      fr.onload = () => ok(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => ok(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** ¿Es el comprobante definitivo (autorizado, con número y CAE)? Si no, es una vista previa. */
export function esDefinitiva(fj: VentasFacturaFJ): boolean {
  const f = fj.factura
  return f.estado === 'autorizada' && !!f.cae && !!f.numero
}

export function nombreArchivoFactura(fj: VentasFacturaFJ): string {
  const f = fj.factura
  const tipo = (TIPOS_CBTE.find(t => t.key === f.cbte_tipo)?.corto ?? 'CBTE').replace(/\s+/g, '')
  const cli = f.rec_razon_social.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
  if (!esDefinitiva(fj)) return `BORRADOR_${tipo}_${f.id}_${cli}.pdf`
  return `${tipo}_${f.numero_fmt}_${cli}.pdf`
}

/**
 * `leyenda`: la de la FCE de Ventas › Configuración (20260929j); null o
 * ausente = la de ARCA.
 */
export async function descargarFacturaPdf(fj: VentasFacturaFJ, opts: { leyenda?: string | null } = {}): Promise<void> {
  const doc = armarFacturaDoc(fj, { logo: await logoDataUrl(), leyenda: opts.leyenda })
  pdfMake.createPdf(doc).download(nombreArchivoFactura(fj))
}

/** Título del comprobante como lo imprime ARCA. */
export function tituloComprobante(cbteTipo: number): string {
  switch (cbteTipo) {
    case 201: return 'FACTURA DE CRÉDITO ELECTRÓNICA MiPyMEs (FCE)'
    case 203: return 'NOTA DE CRÉDITO ELECTRÓNICA MiPyMEs (FCE)'
    case 3: case 8: return 'NOTA DE CRÉDITO'
    default: return 'FACTURA'
  }
}

/** La leyenda de ARCA (respaldo): vive en facturacion.utils para que la lea la configuración sin cargar pdfmake. */
export { LEYENDA_FCE }

const th = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, bold: true, fontSize: 7.5, color: TENUE, fillColor: FONDO, alignment: alin, margin: [3, 4, 3, 4] })
const td = (t: string, alin: 'left' | 'right' | 'center' = 'left'): TableCell =>
  ({ text: t, fontSize: 8.5, alignment: alin, margin: [3, 3.5, 3, 3.5] })

/** "Unidades" no entra en la columna angosta: las unidades conocidas van abreviadas. */
export function abreviarUnidad(u: string): string {
  const t = (u ?? '').trim()
  const k = t.toLowerCase()
  if (k === 'unidades' || k === 'unidad' || k === 'u') return 'Un.'
  if (k === 'metros' || k === 'metro') return 'm'
  if (k === 'kilogramos' || k === 'kilos' || k === 'kg') return 'kg'
  if (k === 'litros' || k === 'litro') return 'l'
  if (k === 'toneladas' || k === 'tonelada') return 't'
  if (k === 'global' || k === 'gl') return 'Gl.'
  return t
}

const par = (label: string, valor: string, anchoLabel = 62): Content => ({
  columns: [
    { width: anchoLabel, text: label, bold: true, fontSize: 8.5 },
    { width: '*', text: valor, fontSize: 8.5 },
  ],
  margin: [0, 1, 0, 1],
})

const cajaFina = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6,
  hLineColor: () => BORDE, vLineColor: () => BORDE,
}

/** El documento, sin descargar: separado para poder testearlo o generarlo fuera del navegador. */
export function armarFacturaDoc(fj: VentasFacturaFJ, opts: { logo: string | null; leyenda?: string | null }): TDocumentDefinitions {
  const f = fj.factura
  const leyendaFce = opts.leyenda?.trim() || LEYENDA_FCE
  const esNc = f.es_nc
  const esB = f.letra === 'B'
  const homo = f.es_homologacion
  const definitiva = esDefinitiva(fj)
  const fce = f.cbte_tipo === 201
  const ncFce = f.cbte_tipo === 203
  // Período de servicio (20260929b): el de la factura, o el día del comprobante como siempre.
  const tienePeriodo = !!(f.fch_serv_desde && f.fch_serv_hasta)
  const servDesde = f.fch_serv_desde ?? f.fecha_cbte
  const servHasta = f.fch_serv_hasta ?? f.fecha_cbte
  const fceBloque = fce || ncFce
  const titulo = tituloComprobante(f.cbte_tipo)
  const docRec = DOC_TIPOS.find(d => d.id === f.rec_doc_tipo)
  const docRecTxt = f.rec_doc_tipo === 80 || f.rec_doc_tipo === 86 ? fmtCuit(f.rec_doc_nro)
    : f.rec_doc_tipo === 99 ? 'Sin identificar' : f.rec_doc_nro
  const numero = definitiva ? f.numero_fmt! : `Borrador #${f.id}`

  // ── 1. Encabezado ──
  const emisor: Content = {
    columns: [
      ...(opts.logo ? [{ width: 46, image: opts.logo, fit: [46, 62] as [number, number] }] : []),
      {
        width: '*',
        margin: [opts.logo ? 8 : 0, 2, 0, 0] as Margen,
        stack: [
          { text: EMPRESA.razonSocialFactura, fontSize: 13, bold: true },
          { text: EMPRESA.domicilioFactura1, fontSize: 8, color: TENUE, margin: [0, 2, 0, 0] as Margen },
          { text: EMPRESA.domicilioFactura2, fontSize: 8, color: TENUE },
          { text: `Tel. ${EMPRESA.tel}`, fontSize: 8, color: TENUE },
          { text: EMPRESA.condicionIva, fontSize: 8, bold: true, margin: [0, 3, 0, 0] as Margen },
        ],
      },
    ],
  }
  const letra: Content = {
    table: {
      widths: [40],
      body: [
        [{ text: f.letra, fontSize: 20, bold: true, color: NARANJA, alignment: 'center', margin: [0, 4, 0, 0] }],
        [{ text: `Cód. ${f.cod_cbte}`, fontSize: 7, alignment: 'center', margin: [0, 0, 0, 3] }],
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0 : 1.2),
      vLineWidth: () => 1.2,
      hLineColor: () => NARANJA, vLineColor: () => NARANJA,
    },
  }
  const comprobante: Content = {
    stack: [
      { text: titulo, fontSize: fce || ncFce ? 9.5 : 11, bold: true },
      { text: definitiva ? 'ORIGINAL' : 'VISTA PREVIA — SIN VALIDEZ FISCAL', fontSize: 7, color: definitiva ? TENUE : ROJO, bold: !definitiva, margin: [0, 1, 0, 4] as Margen },
      { text: numero, fontSize: 14, bold: true, margin: [0, 0, 0, 4] as Margen },
      par('Fecha:', fmtFecha(f.fecha_cbte), 66),
      par('C.U.I.T.:', EMPRESA.cuit, 66),
      par('Ing. Brutos:', EMPRESA.iibb, 66),
      par('Inic. Act.:', EMPRESA.inicioActividades, 66),
    ],
  }
  const encabezado: Content = {
    table: {
      widths: ['*', 48, 200],
      body: [[
        { stack: [emisor], margin: [6, 6, 4, 6] },
        { stack: [letra], margin: [2, 6, 2, 0] },
        { stack: [comprobante], margin: [8, 6, 6, 6] },
      ]],
    },
    layout: {
      hLineWidth: () => 0.6, vLineWidth: (i: number, node) => (i === 0 || i === node.table.widths!.length ? 0.6 : 0),
      hLineColor: () => BORDE, vLineColor: () => BORDE,
    },
  }

  // ── 1b. FCE: vencimiento, período, CBU/alias, referencia, transferencia ──
  const asoc = fj.asociados[0]
  const asocTxt = asoc
    ? `${TIPOS_CBTE.find(t => t.key === asoc.cbte_tipo)?.corto ?? 'FA'} ${String(asoc.pto_vta).padStart(5, '0')}-${String(asoc.numero).padStart(8, '0')} del ${fmtFecha(asoc.fecha_cbte)}`
    : (f.asociada_numero_fmt ? `${cortoTipo(f.asociada_cbte_tipo)} ${f.asociada_numero_fmt}` : null)

  const bloqueFce: Content[] = []
  if (fce) {
    const fila = (partes: Array<[string, string]>): Content => ({
      text: partes.flatMap(([l, v], i) => [
        ...(i > 0 ? [{ text: '     ' }] : []),
        { text: `${l} `, bold: true }, { text: v },
      ]),
      fontSize: 8.5, margin: [0, 1.5, 0, 1.5] as Margen,
    })
    bloqueFce.push({
      table: {
        widths: ['*'],
        body: [[{
          margin: [6, 4, 6, 4],
          stack: [
            fila([['Fecha de Vto. para el pago:', fmtFecha(f.fch_vto_pago ?? f.fecha_cbte)]]),
            fila([['Período Facturado Desde:', fmtFecha(servDesde)], ['Hasta:', fmtFecha(servHasta)]]),
            fila([['CBU del Emisor:', f.fce_cbu ?? ''], ...(f.fce_alias ? [['Alias CBU:', f.fce_alias] as [string, string]] : [])]),
            ...(f.fce_referencia ? [fila([['Referencia Comercial:', f.fce_referencia]])] : []),
            fila([['Opción de Transferencia:', TRANSMISION_LABEL[f.fce_transmision ?? 'SCA'] ?? String(f.fce_transmision)]]),
          ],
        }]],
      },
      layout: cajaFina,
      margin: [0, 6, 0, 0],
    })
  } else if (ncFce) {
    bloqueFce.push({
      table: {
        widths: ['*'],
        body: [[{
          margin: [6, 4, 6, 4],
          stack: [
            { text: [{ text: 'Comprobante asociado: ', bold: true }, asocTxt ?? '—', { text: `     CUIT emisor: ${EMPRESA.cuit}` }], fontSize: 8.5 },
            { text: [{ text: 'Período Facturado Desde: ', bold: true }, fmtFecha(servDesde), { text: '     Hasta: ', bold: true }, fmtFecha(servHasta)], fontSize: 8.5, margin: [0, 2, 0, 0] as Margen },
            ...(f.nc_anulacion === 'S' ? [{ text: 'Anula la Factura de Crédito por rechazo del comprador.', bold: true, fontSize: 8.5, margin: [0, 2, 0, 0] as Margen }] : []),
          ],
        }]],
      },
      layout: cajaFina,
      margin: [0, 6, 0, 0],
    })
  }

  // ── 2. Receptor ──
  const izq: Content[] = [
    par('Sr.(es):', f.rec_razon_social),
    ...(f.rec_domicilio?.trim() ? [par('Domicilio:', f.rec_domicilio)] : []),
    par('Cond. IVA:', CONDICIONES_IVA[f.rec_condicion_iva_id] ?? String(f.rec_condicion_iva_id)),
    par(`${docRec?.corto ?? 'Doc.'}:`, docRecTxt),
  ]
  const der: Content[] = [
    par('Cond. de pago:', f.condicion_pago, 68),
    par('Moneda:', 'Pesos', 68),
    ...(f.remitos?.trim() ? [par('Remitos:', f.remitos, 68)] : []),
    // Período de servicio (20260929b). En la FCE ya sale en su recuadro.
    ...(tienePeriodo && !fceBloque ? [par('Período:', `${fmtFecha(servDesde)} al ${fmtFecha(servHasta)}`, 68)] : []),
  ]
  const receptor: Content = {
    table: { widths: ['*', 190], body: [[{ margin: [6, 5, 6, 5], stack: izq }, { margin: [6, 5, 6, 5], stack: der }]] },
    layout: { ...cajaFina, vLineWidth: (i: number) => (i === 1 ? 0 : 0.6) },
    margin: [0, 6, 0, 0],
  }

  // ── 3. Renglones ──
  const desc = (t: string): TableCell => ({ text: normalizarDescripcion(t), fontSize: 8.5, margin: [3, 3.5, 6, 3.5] })
  const tablaRenglones: Content = {
    table: esB ? {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 40, 32, 70, 74],
      body: [
        [th('Descripción'), th('Cant.', 'right'), th('u.'), th('Precio', 'right'), th('Subtotal', 'right')],
        ...fj.renglones.map(r => [
          desc(r.descripcion),
          td(fmtCant(r.cantidad), 'right'),
          td(abreviarUnidad(r.unidad)),
          td(fmtN(precioConIva(r.precio_unit, r.alicuota_id)), 'right'),
          td(fmtN(conIvaRenglon(Number(r.importe_neto), r.alicuota_id)), 'right'),
        ]),
      ],
    } : {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 34, 30, 60, 60, 26, 62],
      body: [
        [th('Descripción'), th('Cant.', 'right'), th('u.'), th('Precio', 'right'), th('Subtotal', 'right'),
         th('IVA', 'right'), th('Subtotal c/IVA', 'right')],
        ...fj.renglones.map(r => [
          desc(r.descripcion),
          td(fmtCant(r.cantidad), 'right'),
          td(abreviarUnidad(r.unidad)),
          td(fmtPrecio(r.precio_unit), 'right'),
          td(fmtN(r.importe_neto), 'right'),
          td(ALICUOTA_LABEL[r.alicuota_id] ?? '', 'right'),
          td(fmtN(conIvaRenglon(Number(r.importe_neto), r.alicuota_id)), 'right'),
        ]),
      ],
    },
    layout: {
      hLineWidth: (i: number, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => BORDE,
    },
    margin: [0, 8, 0, 0],
  }

  const obs = (f.observaciones ?? '').trim()
  const obsEnPie = obs.length > 0 && obs.length <= OBS_MAX_EN_PIE
  const obsEnCuerpo = obs.length > OBS_MAX_EN_PIE

  const content: Content[] = [
    encabezado,
    ...bloqueFce,
    receptor,
    ...(esNc && !ncFce && asocTxt ? [{
      text: [{ text: 'Comprobante asociado: ', bold: true }, asocTxt],
      fontSize: 8.5, margin: [0, 5, 0, 0] as Margen,
    }] : []),
    tablaRenglones,
    ...(obsEnCuerpo ? [{
      text: [{ text: 'Observaciones: ', bold: true }, obs],
      fontSize: 8.5, margin: [0, 8, 0, 0] as Margen,
    }] : []),
  ]

  const pieDeAbajo = (pag: number, total: number, conPagina = true): Content => ({
    columns: [
      {
        text: homo ? 'HOMOLOGACIÓN — comprobante de prueba, sin validez fiscal'
          : `Emitido por el sistema de gestión de ${EMPRESA.nombre}`,
        fontSize: 7, color: homo ? ROJO : TENUE,
      },
      ...(conPagina ? [{ text: `Pág. ${pag}/${total}`, fontSize: 7, color: TENUE, alignment: 'right' as const, width: 60 }] : []),
    ],
    margin: [0, 4, 0, 0],
  })

  const margenPie = MARGEN_PIE + (f.cbte_tipo === 201 ? extraPieFce(leyendaFce) : 0)

  return {
    pageSize: 'A4',
    pageMargins: [MARGEN_X, MARGEN_X, MARGEN_X, margenPie],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: CARBON },
    ...(!definitiva
      ? { watermark: { text: homo ? 'BORRADOR — HOMOLOGACIÓN — SIN VALIDEZ FISCAL' : 'BORRADOR — SIN VALIDEZ FISCAL', color: ROJO, opacity: 0.13, bold: true, fontSize: homo ? 26 : 34 } }
      : homo ? { watermark: { text: 'HOMOLOGACIÓN — SIN VALIDEZ FISCAL', color: ROJO, opacity: 0.14, bold: true, fontSize: 34 } } : {}),
    footer: (pag: number, total: number): Content => {
      if (pag < total) {
        return {
          margin: [MARGEN_X, margenPie - 34, MARGEN_X, 0],
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 0.5, lineColor: BORDE }] },
            { text: 'Continúa en la página siguiente', italics: true, fontSize: 8, color: TENUE, alignment: 'center', margin: [0, 4, 0, 0] as Margen },
            pieDeAbajo(pag, total),
          ],
        }
      }
      return {
        margin: [MARGEN_X, 6, MARGEN_X, 0],
        stack: cierre(fj, { definitiva, esB, obs: obsEnPie ? obs : null, pag, total, pieDeAbajo, leyendaFce }),
      }
    },
    content,
    info: { title: `${titulo} ${f.letra} ${definitiva ? f.numero_fmt : `borrador ${f.id}`} ${f.rec_razon_social}`.trim() },
  }
}

/**
 * El cierre de la última página: observaciones | totales, "Son:", la línea y
 * la fila del QR + CAE + página, y el pie mínimo.
 */
function cierre(
  fj: VentasFacturaFJ,
  o: {
    definitiva: boolean; esB: boolean; obs: string | null; pag: number; total: number
    pieDeAbajo: (p: number, t: number, conPagina?: boolean) => Content
    leyendaFce: string
  },
): Content[] {
  const f = fj.factura
  const filaTot = (label: string, valor: number): TableCell[] => [
    { text: label, fontSize: 8.5, color: TENUE, margin: [6, 2, 4, 2] },
    { text: fmtN(valor), fontSize: 8.5, alignment: 'right', margin: [4, 2, 6, 2] },
  ]
  const filas: TableCell[][] = []
  if (o.esB) {
    filas.push(filaTot('Subtotal', Number(f.imp_neto) + Number(f.imp_iva)))
  } else {
    filas.push(filaTot('Neto gravado', Number(f.imp_neto)))
    for (const a of fj.alicuotas.filter(x => Number(x.importe) !== 0 || Number(x.base_imp) !== 0)) {
      filas.push(filaTot(`IVA ${ALICUOTA_LABEL[a.alicuota_id] ?? ''}`, Number(a.importe)))
    }
  }
  if (Number(f.imp_trib) !== 0) filas.push(filaTot('Otros tributos', Number(f.imp_trib)))
  if (Number(f.imp_op_ex) !== 0) filas.push(filaTot('Exento', Number(f.imp_op_ex)))
  filas.push([
    { text: 'TOTAL', bold: true, fontSize: 11, fillColor: NARANJA_SUAVE, margin: [6, 5, 4, 5] },
    { text: `$ ${fmtN(f.imp_total)}`, bold: true, fontSize: 12, color: CARBON, alignment: 'right', fillColor: NARANJA_SUAVE, margin: [4, 4, 6, 4] },
  ])
  const totales: Content = {
    table: { widths: ['*', 100], body: filas },
    layout: {
      hLineWidth: (i: number, node) => (i === node.table.body.length - 1 ? 1 : 0),
      vLineWidth: () => 0,
      hLineColor: () => NARANJA,
    },
  }
  const transparencia: Content[] = o.esB ? [{
    table: {
      widths: ['*'],
      body: [[{
        margin: [5, 3, 5, 3],
        stack: [
          { text: 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', bold: true, fontSize: 7.5 },
          { text: `IVA Contenido: $ ${fmtN(f.imp_iva)}`, fontSize: 8, margin: [0, 1, 0, 0] as Margen },
          { text: 'Otros Impuestos Nacionales Indirectos: $ 0,00', fontSize: 8 },
        ],
      }]],
    },
    layout: cajaFina,
    margin: [0, 5, 0, 0],
  }] : []

  const qrOCae: Content = o.definitiva
    ? {
        columns: [
          {
            width: 84,
            qr: urlQrArca({
              fecha: f.fecha_cbte, cuit: EMPRESA.cuit, ptoVta: f.pto_vta, tipoCmp: f.cbte_tipo, nroCmp: f.numero!,
              importe: Number(f.imp_total), moneda: f.moneda || 'PES', ctz: Number(f.cotizacion) || 1,
              tipoDocRec: f.rec_doc_tipo, nroDocRec: f.rec_doc_nro, codAut: f.cae!,
            }),
            fit: 80,
            eccLevel: 'M',
          },
          {
            width: '*',
            margin: [8, 8, 0, 0] as Margen,
            stack: [
              { text: 'Comprobante Autorizado', bold: true, fontSize: 10 },
              { text: [{ text: 'CAE N°: ', color: TENUE }, { text: f.cae!, bold: true }], fontSize: 9, margin: [0, 4, 0, 0] as Margen },
              { text: [{ text: 'Fecha de Vto. de CAE: ', color: TENUE }, { text: fmtFecha(f.cae_vto), bold: true }], fontSize: 9, margin: [0, 2, 0, 0] as Margen },
              { text: 'Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.', fontSize: 6.5, color: TENUE, margin: [0, 5, 0, 0] as Margen },
            ],
          },
          { width: 60, text: `Pág. ${o.pag}/${o.total}`, fontSize: 8, color: TENUE, alignment: 'right', margin: [0, 8, 0, 0] as Margen },
        ],
      }
    : {
        columns: [
          {
            width: '*',
            margin: [0, 6, 0, 0] as Margen,
            stack: [
              { text: 'Sin CAE — comprobante no emitido', bold: true, fontSize: 10, color: ROJO },
              { text: 'Vista previa para revisar antes de pedir el CAE a ARCA. No tiene validez fiscal.', fontSize: 8, color: TENUE, margin: [0, 3, 0, 0] as Margen },
            ],
          },
          { width: 60, text: `Pág. ${o.pag}/${o.total}`, fontSize: 8, color: TENUE, alignment: 'right', margin: [0, 6, 0, 0] as Margen },
        ],
      }

  return [
    {
      columns: [
        {
          width: '*',
          stack: o.obs ? [
            { text: 'Observaciones', bold: true, fontSize: 7.5, color: TENUE },
            { text: o.obs, fontSize: 8.5, margin: [0, 2, 12, 0] as Margen },
          ] : [{ text: '' }],
        },
        { width: 220, stack: [totales, ...transparencia] },
      ],
    },
    { text: [{ text: 'Son: ', bold: true }, importeALetras(Number(f.imp_total))], fontSize: 8.5, margin: [0, 6, 0, 0] as Margen },
    // FCE: la leyenda roja va abajo, antes del QR y el CAE, como en el modelo de ARCA.
    ...(f.cbte_tipo === 201 ? [{
      table: { widths: ['*'], body: [[{ text: o.leyendaFce, color: ROJO, fontSize: 7, alignment: 'center' as const, margin: [6, 3, 6, 3] as Margen }]] },
      layout: { hLineColor: () => ROJO, vLineColor: () => ROJO, hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
      margin: [0, 6, 0, 0] as Margen,
    }] : []),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 0.5, lineColor: BORDE }], margin: [0, 6, 0, 6] as Margen },
    qrOCae,
    o.pieDeAbajo(o.pag, o.total, false),
  ]
}
