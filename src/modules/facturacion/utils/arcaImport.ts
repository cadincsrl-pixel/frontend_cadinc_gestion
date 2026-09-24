// Parser de «Mis Comprobantes — Emitidos» de ARCA (el Excel que baja el portal).
//
// Formato real (los tres archivos de jul–sep 2026 del dueño): hoja `Sheet1`,
// fila 1 = título ("Comprobantes de Ventas - CUIT 33717191949"), fila 2 =
// encabezados, una fila por comprobante:
//
//   Fecha (dd/mm/aaaa) | Tipo ("1 - Factura A", "60 - Cuenta de Venta y
//   Líquido Producto A", "201 - Factura de Crédito Electrónica MiPyMEs (FCE) A")
//   | Punto de Venta | Número Desde | Número Hasta (vacío) | Tipo Doc. Comprador
//   ("CUIT") | Nro. Doc. Comprador | Denominación Comprador | Tipo Cambio |
//   Moneda ("$") | Neto Gravado | No Gravado | Exento | IVA | Total
//
// Las columnas se buscan por NOMBRE (sin tildes ni mayúsculas), no por
// posición: ARCA cambió el layout más de una vez y las versiones nuevas traen
// "Imp. Total", "Imp. Neto Gravado", etc. El encabezado se busca en las
// primeras filas, así que tampoco importa si falta el título.
//
// El parser NO decide nada de negocio: arma las filas para
// `POST /externos/importar` (que valida, deduplica, crea clientes y cruza con
// Logística) y marca solo lo que no puede mandar (fila sin tipo, rango de
// números, fecha ilegible).

import * as XLSX from 'xlsx'
import type { VentasImportarFilaInput } from '@/types/domain.types'

export interface FilaArca extends VentasImportarFilaInput {
  /** El archivo de donde salió (para mostrar en la vista previa). */
  archivo:   string
  /** Fila del Excel, 1-based como la ve el usuario. */
  filaExcel: number
  /** "1 - Factura A" tal cual vino. */
  tipoTexto: string
}

export interface ErrorParseoArca {
  archivo:   string
  filaExcel: number
  motivo:    string
}

export interface ResultadoParseoArca {
  hoja:    string
  filas:   FilaArca[]
  errores: ErrorParseoArca[]
}

type Campo =
  | 'fecha' | 'tipo' | 'pto_vta' | 'numero_desde' | 'numero_hasta' | 'doc_tipo' | 'doc_nro' | 'razon_social'
  | 'tipo_cambio' | 'moneda' | 'neto' | 'no_gravado' | 'exento' | 'iva' | 'total'

/** Encabezados aceptados por campo, ya normalizados (sin tildes, minúsculas, sin puntos dobles). */
const ENCABEZADOS: Record<Campo, string[]> = {
  fecha:        ['fecha', 'fecha de emision', 'fecha emision'],
  tipo:         ['tipo', 'tipo de comprobante', 'tipo comprobante'],
  pto_vta:      ['punto de venta', 'pto. vta.', 'pto vta', 'punto venta'],
  numero_desde: ['numero desde', 'nro. desde', 'numero'],
  numero_hasta: ['numero hasta', 'nro. hasta'],
  doc_tipo:     ['tipo doc. comprador', 'tipo doc. receptor', 'tipo doc comprador', 'tipo doc. comprador/receptor'],
  doc_nro:      ['nro. doc. comprador', 'nro. doc. receptor', 'nro doc comprador', 'nro. doc. comprador/receptor'],
  razon_social: ['denominacion comprador', 'denominacion receptor', 'denominacion'],
  tipo_cambio:  ['tipo cambio', 'tipo de cambio'],
  moneda:       ['moneda'],
  neto:         ['neto gravado', 'imp. neto gravado', 'imp. neto gravado total'],
  no_gravado:   ['no gravado', 'imp. neto no gravado'],
  exento:       ['exento', 'imp. op. exentas', 'imp. op. exentas total'],
  iva:          ['iva', 'total iva', 'imp. iva'],
  total:        ['total', 'imp. total', 'importe total'],
}

const OBLIGATORIOS: Campo[] = ['fecha', 'tipo', 'pto_vta', 'numero_desde', 'total']

export function normEncabezado(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Columna de cada campo en la fila de encabezados, o null si esa fila no es el encabezado. */
function mapearEncabezado(fila: unknown[]): Partial<Record<Campo, number>> | null {
  const norm = fila.map(normEncabezado)
  const mapa: Partial<Record<Campo, number>> = {}
  for (const campo of Object.keys(ENCABEZADOS) as Campo[]) {
    const i = norm.findIndex(h => ENCABEZADOS[campo].includes(h))
    if (i >= 0) mapa[campo] = i
  }
  return OBLIGATORIOS.every(c => mapa[c] !== undefined) ? mapa : null
}

/** Número de una celda: número tal cual; texto es-AR ("1.234,56") o máquina ("1234.56"). */
export function numeroDeCelda(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).replace(/[$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Fecha de una celda → YYYY-MM-DD: "dd/mm/aaaa", ISO, Date o serial de Excel. null si no se entiende. */
export function fechaDeCelda(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${pad2(d.m)}-${pad2(d.d)}` : null
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return valida(Number(m[3]), Number(m[2]), Number(m[1]))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

function valida(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** "1 - Factura A" → 1; 201 → 201. null si no empieza con el código. */
export function codigoDeTipo(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null
  const m = String(v ?? '').match(/^\s*(\d{1,3})\b/)
  return m ? Number(m[1]) : null
}

/** "CUIT" → 80, "CUIL" → 86, "DNI" → 96, "99"/80 → número; otro texto viaja tal cual (la base lo rechaza por fila). */
export function docTipoDeCelda(v: unknown): number | string {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().toUpperCase()
  if (/^\d+$/.test(s)) return Number(s)
  if (s.startsWith('CUIT')) return 80
  if (s.startsWith('CUIL')) return 86
  if (s.startsWith('DNI')) return 96
  return s
}

/** "$" / "PES" / "ARS" → PES; dólares → DOL (códigos de ARCA). */
export function monedaDeCelda(v: unknown): string {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s || s === '$' || s === 'PES' || s === 'ARS' || s === 'PESOS') return 'PES'
  if (['USD', 'U$S', 'US$', 'DOL', 'DOLAR', 'DÓLAR'].includes(s)) return 'DOL'
  return s
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Las filas de una hoja (array de arrays, como `sheet_to_json({ header: 1 })`). Puro: testeable sin archivo. */
export function leerFilasArca(filas: unknown[][], archivo: string, hoja = 'Sheet1'): ResultadoParseoArca {
  const errores: ErrorParseoArca[] = []
  let mapa: Partial<Record<Campo, number>> | null = null
  let iEnc = -1
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    mapa = mapearEncabezado(filas[i] ?? [])
    if (mapa) { iEnc = i; break }
  }
  if (!mapa) {
    return {
      hoja, filas: [],
      errores: [{ archivo, filaExcel: 0, motivo: 'No encontré los encabezados de «Mis Comprobantes» (Fecha, Tipo, Punto de Venta, Número Desde, Total). ¿Es el Excel de comprobantes EMITIDOS de ARCA?' }],
    }
  }
  const col = (fila: unknown[], c: Campo): unknown => (mapa![c] === undefined ? undefined : fila[mapa![c]!])

  const out: FilaArca[] = []
  for (let i = iEnc + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    if (fila.every(v => v === null || v === undefined || String(v).trim() === '')) continue
    const filaExcel = i + 1
    const err = (motivo: string) => errores.push({ archivo, filaExcel, motivo })

    const tipoTexto = String(col(fila, 'tipo') ?? '').trim()
    const cbte = codigoDeTipo(col(fila, 'tipo'))
    if (cbte === null) { err(`Tipo de comprobante ilegible: «${tipoTexto}»`); continue }
    const pv = numeroDeCelda(col(fila, 'pto_vta'))
    const desde = numeroDeCelda(col(fila, 'numero_desde'))
    const hasta = numeroDeCelda(col(fila, 'numero_hasta'))
    if (pv === null || desde === null) { err('Falta el punto de venta o el número'); continue }
    if (hasta !== null && hasta !== desde) {
      err(`Es un rango (${desde} a ${hasta}): ARCA agrupa así los comprobantes B chicos. Cargalos a mano uno por uno.`)
      continue
    }
    const fecha = fechaDeCelda(col(fila, 'fecha'))
    if (!fecha) { err(`Fecha ilegible: «${String(col(fila, 'fecha') ?? '')}»`); continue }
    const total = numeroDeCelda(col(fila, 'total'))
    if (total === null) { err('Falta el total'); continue }

    const docNroCelda = col(fila, 'doc_nro')
    out.push({
      archivo, filaExcel, tipoTexto,
      cbte_tipo:        cbte,
      pto_vta:          pv,
      numero:           desde,
      fecha,
      rec_doc_tipo:     docTipoDeCelda(col(fila, 'doc_tipo')),
      // Un CUIT como número entra entero en un double; String() no le pone notación científica.
      rec_doc_nro:      typeof docNroCelda === 'number' ? String(Math.trunc(docNroCelda)) : String(docNroCelda ?? '').replace(/\D/g, ''),
      rec_razon_social: String(col(fila, 'razon_social') ?? '').replace(/\s+/g, ' ').trim(),
      neto:             redondear(Math.abs(numeroDeCelda(col(fila, 'neto')) ?? 0)),
      no_gravado:       redondear(Math.abs(numeroDeCelda(col(fila, 'no_gravado')) ?? 0)),
      exento:           redondear(Math.abs(numeroDeCelda(col(fila, 'exento')) ?? 0)),
      iva:              redondear(Math.abs(numeroDeCelda(col(fila, 'iva')) ?? 0)),
      // Algunas exportaciones traen las NC en negativo: el signo lo pone el tipo.
      total:            redondear(Math.abs(total)),
      moneda:           monedaDeCelda(col(fila, 'moneda')),
      tipo_cambio:      numeroDeCelda(col(fila, 'tipo_cambio')) ?? 1,
    })
  }
  return { hoja, filas: out, errores }
}

/** Lee el archivo (xlsx o csv) y parsea la PRIMERA hoja que tenga los encabezados de ARCA. */
export function parsearComprobantesArca(data: ArrayBuffer | Uint8Array, archivo: string): ResultadoParseoArca {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false })
  } catch {
    return { hoja: '', filas: [], errores: [{ archivo, filaExcel: 0, motivo: 'No se pudo leer el archivo: ¿es un Excel (.xlsx) o un CSV?' }] }
  }
  let primero: ResultadoParseoArca | null = null
  // Sheet1 primero (es la de ARCA); si no, cualquiera que tenga los encabezados.
  const hojas = [...wb.SheetNames].sort((a, b) => Number(b === 'Sheet1') - Number(a === 'Sheet1'))
  for (const nombre of hojas) {
    const ws = wb.Sheets[nombre]
    if (!ws) continue
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    const r = leerFilasArca(filas, archivo, nombre)
    if (r.filas.length > 0 || r.errores.some(e => e.filaExcel > 0)) return r
    primero ??= r
  }
  return primero ?? { hoja: '', filas: [], errores: [{ archivo, filaExcel: 0, motivo: 'El archivo no tiene hojas.' }] }
}

/** Lo que viaja al backend: la fila sin los datos de pantalla. */
export function filaParaApi(f: FilaArca): VentasImportarFilaInput {
  return {
    cbte_tipo: f.cbte_tipo, pto_vta: f.pto_vta, numero: f.numero, fecha: f.fecha,
    rec_doc_tipo: f.rec_doc_tipo, rec_doc_nro: f.rec_doc_nro, rec_razon_social: f.rec_razon_social,
    neto: f.neto, no_gravado: f.no_gravado, exento: f.exento, iva: f.iva, total: f.total,
    moneda: f.moneda, tipo_cambio: f.tipo_cambio,
  }
}
